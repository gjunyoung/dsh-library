/**
 * Library — Host half.
 *
 * Owns the file archive (bytes + index), serves the page over the loopback web
 * server, converts Office documents through the Host's own conversion service,
 * and captures `present` deliveries as they are committed to a session log.
 * Nothing here touches the Host's code paths: the archive is a plain directory,
 * the index is a JSON document, and the transport is one route prefix.
 */
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { captureDelivery } from './lib/capture.js'
import { LibraryEngine } from './lib/engine.js'
import { createLibraryHandler } from './lib/http.js'

const MAX_UPLOAD_BYTES = 200 * 1024 * 1024

/** Where the profile records a migrated archive location. */
function pointerFile() {
  const home = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh')
  return path.join(home, 'library-location.json')
}

/** Default archive location: `<DSH_HOME>/library`, per the plan. */
export function defaultRoot() {
  const home = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh')
  return path.join(home, 'library')
}

/** The recorded location from a previous migration, when there is one. */
export function recordedRoot() {
  try {
    const parsed = JSON.parse(readFileSync(pointerFile(), 'utf8'))
    return typeof parsed?.root === 'string' && parsed.root !== '' ? parsed.root : null
  } catch {
    return null
  }
}

/** Record a new archive location so the next start uses it. */
async function persistRoot(root) {
  const file = pointerFile()
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify({ root, updatedAt: new Date().toISOString() }, null, 2), 'utf8')
}

/**
 * Open one stored file with the desktop's default application. The file is
 * always a path this plugin derived from its own record, never caller input.
 */
function openInSystem(filePath) {
  return new Promise((resolve, reject) => {
    const command = process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open'
    const child = spawn(command, [filePath], { detached: true, stdio: 'ignore' })
    child.on('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}

/** Resolve the workspace that owns a session's working directory, if any. */
async function workspaceIdOf(ctx, session) {
  const registry = ctx.get('workspaceRegistry')
  const cwd = session?.header?.cwd
  if (registry === undefined || typeof cwd !== 'string' || cwd === '') return null
  try {
    const workspace = await registry.resolveByPath(cwd)
    return workspace?.id ?? null
  } catch {
    return null
  }
}

export const inject = ['webServer']

export function apply(ctx, config = {}) {
  const configured = typeof config.root === 'string' && config.root.trim() !== '' ? config.root : null
  const root = configured ?? recordedRoot() ?? defaultRoot()
  const engine = new LibraryEngine(root, {
    maxUploadBytes: Number.isFinite(config.maxUploadBytes) ? config.maxUploadBytes : MAX_UPLOAD_BYTES,
  })

  // Start loading immediately; requests await the same promise.
  engine.init().catch((error) => {
    console.warn('[library] index initialization failed:', error)
  })

  const handler = createLibraryHandler(engine, {
    office: () => ctx.get('officeToPdf'),
    openInSystem,
    persistRoot,
  })

  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/library', handler }), 'library: routes')

  // Deliveries are captured from the committed log event, which carries the seq
  // and turn the record's origin needs.
  ctx.effect(
    () =>
      ctx.on('session/event', (session, event) => {
        if (event === undefined || event === null || event.type !== 'deliverables/presented') return
        void captureDelivery({
          engine,
          session,
          event,
          resolveWorkspaceId: () => workspaceIdOf(ctx, session),
        }).catch((error) => {
          // Capture never blocks the session that produced the delivery.
          console.warn('[library] delivery capture failed:', error)
        })
      }),
    'library: present capture',
  )

  console.info(`[library] archive at ${engine.root}`)
}
