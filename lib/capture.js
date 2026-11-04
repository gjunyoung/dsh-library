/**
 * Delivery capture: turn one `deliverables/presented` session event into library
 * records. Kept separate from the plugin entry so the gate can drive it against
 * real files with a fake session.
 */
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

/**
 * Copy every file a delivery event names into the library.
 *
 * Coordinates come from the event itself (its own seq plus the turn and the
 * ordered index inside the delivery), so a record can point back at the message
 * that produced it. A file that cannot be read becomes a retryable failure; the
 * capture never throws into the session that delivered it.
 *
 * @param options.engine - initialized library engine.
 * @param options.session - the Session whose log grew (uses `id`).
 * @param options.event - the `deliverables/presented` event.
 * @param options.resolveWorkspaceId - optional async id of the owning workspace.
 * @returns counts of captured and failed files.
 */
export async function captureDelivery({ engine, session, event, resolveWorkspaceId }) {
  const data = event?.data ?? {}
  const files = Array.isArray(data.files) ? data.files : []
  if (files.length === 0) return { captured: 0, failed: 0 }

  const sessionId = String(session?.id ?? '')
  const seq = Number(event?.seq)
  const turn = Number(data.turn)
  let workspaceId = null
  if (typeof resolveWorkspaceId === 'function') {
    try {
      workspaceId = (await resolveWorkspaceId()) ?? null
    } catch {
      workspaceId = null
    }
  }

  let captured = 0
  let failed = 0
  for (let index = 0; index < files.length; index += 1) {
    const sourcePath = typeof files[index]?.path === 'string' ? files[index].path : null
    if (sourcePath === null) continue
    if (await engine.hasOrigin(sessionId, seq, index)) continue
    const origin = { workspaceId, sessionId, seq, turn, index, pathAtCapture: sourcePath }
    try {
      const info = await stat(sourcePath)
      if (!info.isFile()) throw new Error('not a regular file')
      await engine.addBytes({
        name: path.basename(sourcePath),
        bytes: await readFile(sourcePath),
        source: 'agent-deliverable',
        origin,
        sourceMtime: info.mtime.toISOString(),
      })
      captured += 1
    } catch (error) {
      await engine.recordFailure({ path: sourcePath, reason: String(error?.message ?? error), origin })
      failed += 1
    }
  }
  return { captured, failed }
}
