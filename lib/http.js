/**
 * HTTP surface of the library Host half.
 *
 * The Host serves the page's data over the loopback web server because a plugin
 * bundle cannot add a Remote namespace at runtime. Every mutating request is
 * Origin-checked: the Electron shell (`dsh-app://app`), an opaque origin, and
 * loopback origins are the only callers allowed to write, and unknown origins
 * get a 403, so a page open elsewhere cannot read responses or pass a JSON
 * preflight.
 */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { LibraryError } from './engine.js'
import { createZip } from './zip.js'
import { convertOffice } from './office.js'
import {
  MAX_HTML_BYTES,
  MAX_TEXT_BYTES,
  languageOf,
  markdownToHtml,
  parseLibraryAddress,
  rendererFor,
} from './render.js'

const MAX_JSON_BYTES = 256 * 1024
const RECENT_LIMIT = 20
const MAX_ATTACH = 20
const MAX_ZIP_BYTES = 500 * 1024 * 1024

/**
 * Loopback, the Electron shell, or an opaque origin: the only acceptable callers.
 * The Electron renderer runs on `dsh-app://app/`, which some carriers report as
 * `null`.
 */
export function originAllowed(origin) {
  if (origin === undefined || origin === null || origin === '') return true
  if (origin === 'dsh-app://app' || origin === 'null') return true
  return /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(String(origin))
}

function corsHeaders() {
  // The origin policy is enforced above, per request. A wildcard grant lets the
  // Electron custom-scheme origin read responses without credentials; nothing
  // outside the allowlist ever reaches a payload.
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'access-control-allow-headers': 'content-type, x-library-name, x-library-source, x-library-mtime',
    'access-control-max-age': '600',
  }
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    ...corsHeaders(),
  })
  res.end(body)
}

function fail(res, status, error) {
  const code = error instanceof LibraryError ? error.code : 'internal'
  const message = error instanceof Error ? error.message : String(error)
  sendJson(res, status, { ok: false, error: { code, message } })
}

function statusOf(error) {
  if (!(error instanceof LibraryError)) return 500
  switch (error.code) {
    case 'not-found':
      return 404
    case 'missing-bytes':
      return 410
    case 'office-unavailable':
    case 'office-unsupported':
      return 415
    case 'open-unavailable':
      return 501
    case 'too-large':
      return 413
    default:
      return 400
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_JSON_BYTES) {
        reject(new LibraryError('body-too-large', 'request body is too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8').trim()
      if (text === '') {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(text))
      } catch {
        reject(new LibraryError('bad-json', 'request body is not valid JSON'))
      }
    })
    req.on('error', reject)
  })
}

function decodeHeader(value) {
  if (typeof value !== 'string' || value === '') return undefined
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function contentDisposition(kind, name) {
  const ascii = String(name).replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16)}`)
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encoded}`
}

/** Stream bytes to the response, honouring a single byte range. */
async function sendBytes(req, res, opened, extra = {}) {
  const { record, size } = opened
  const headers = {
    'content-type': record.mime ?? 'application/octet-stream',
    'accept-ranges': 'bytes',
    'cache-control': 'private, max-age=3600',
    'x-library-sha256': record.sha256,
    ...corsHeaders(),
    ...extra,
  }

  const range = req.headers.range
  if (typeof range === 'string' && /^bytes=\d*-\d*$/.test(range.trim())) {
    const [rawStart, rawEnd] = range.trim().slice('bytes='.length).split('-')
    let start = rawStart === '' ? undefined : Number(rawStart)
    let end = rawEnd === '' ? undefined : Number(rawEnd)
    if (start === undefined && end !== undefined) {
      start = Math.max(0, size - end)
      end = size - 1
    }
    start = start ?? 0
    end = end === undefined ? size - 1 : Math.min(end, size - 1)
    if (start > end || start >= size) {
      res.writeHead(416, { 'content-range': `bytes */${size}`, ...headers })
      res.end()
      return
    }
    res.writeHead(206, {
      ...headers,
      'content-range': `bytes ${start}-${end}/${size}`,
      'content-length': end - start + 1,
    })
    await pipeFile(res, opened.stream({ start, end }))
    return
  }

  res.writeHead(200, { ...headers, 'content-length': size })
  await pipeFile(res, opened.stream())
}

function pipeFile(res, stream) {
  return new Promise((resolve, reject) => {
    stream.on('error', reject)
    stream.on('end', resolve)
    stream.pipe(res)
    res.on('close', () => stream.destroy())
  })
}

/**
 * Build the request handler for one engine.
 * @param engine - the library engine.
 * @param options - `office` reads the Host conversion service lazily;
 *   `openInSystem` launches a stored file with the desktop's default handler.
 */
export function createLibraryHandler(engine, options = {}) {
  const officeOf = options.office ?? (() => undefined)
  const openInSystem = options.openInSystem
  const persistRoot = options.persistRoot
  const recent = []

  const notePreview = (entry) => {
    recent.unshift({ at: new Date().toISOString(), ...entry })
    if (recent.length > RECENT_LIMIT) recent.length = RECENT_LIMIT
  }

  return async function libraryHandler(req, res) {
    const origin = req.headers.origin
    if (!originAllowed(origin)) {
      fail(res, 403, new LibraryError('forbidden-origin', `origin ${origin} may not use the library`))
      return
    }

    const url = new URL(req.url ?? '/', 'http://library.local')
    const route = url.pathname.replace(/\/+$/, '') || '/'
    const method = (req.method ?? 'GET').toUpperCase()

    if (method === 'OPTIONS') {
      res.writeHead(204, corsHeaders())
      res.end()
      return
    }

    try {
      if (route === '/library/health') {
        const state = await engine.state()
        sendJson(res, 200, { ok: true, ...state, recentPreviews: recent })
        return
      }

      if (route === '/library/api/state' && method === 'GET') {
        const state = await engine.state()
        sendJson(res, 200, { ok: true, ...state, ...(await engine.listCollections()) })
        return
      }

      if (route === '/library/api/files' && method === 'GET') {
        const result = await engine.list({
          category: url.searchParams.get('category') ?? 'all',
          source: url.searchParams.get('source') ?? 'all',
          q: url.searchParams.get('q') ?? '',
          sort: url.searchParams.get('sort') ?? 'date',
          direction: url.searchParams.get('direction') ?? 'desc',
          offset: Number(url.searchParams.get('offset') ?? 0),
          limit: Number(url.searchParams.get('limit') ?? 100),
          collectionId: url.searchParams.get('collectionId'),
        })
        sendJson(res, 200, { ok: true, ...result })
        return
      }

      if (route === '/library/api/files' && method === 'POST') {
        const name = decodeHeader(req.headers['x-library-name'])
        const source = decodeHeader(req.headers['x-library-source']) ?? 'upload-library'
        const mtime = decodeHeader(req.headers['x-library-mtime'])
        if (name === undefined) throw new LibraryError('missing-name', 'x-library-name header is required')
        const declared = Number(req.headers['content-length'])
        const record = await engine.addStream({
          name,
          stream: req,
          source,
          declaredBytes: Number.isFinite(declared) ? declared : undefined,
          sourceMtime: mtime === undefined ? null : new Date(mtime).toISOString(),
        })
        sendJson(res, 201, { ok: true, item: record })
        return
      }

      if (route === '/library/api/files' && method === 'DELETE') {
        const body = await readJsonBody(req)
        const result = await engine.remove(Array.isArray(body.ids) ? body.ids : [])
        sendJson(res, 200, { ok: true, ...result })
        return
      }

      if (route === '/library/api/files' && method === 'PATCH') {
        const body = await readJsonBody(req)
        const result = await engine.update(Array.isArray(body.ids) ? body.ids : [], {
          favorited: typeof body.favorited === 'boolean' ? body.favorited : undefined,
          collectionId: body.collectionId,
          name: body.name,
        })
        sendJson(res, 200, { ok: true, ...result })
        return
      }

      if (route === '/library/api/reconcile' && method === 'POST') {
        sendJson(res, 200, { ok: true, ...(await engine.reconcile()) })
        return
      }

      if (route === '/library/api/rebuild' && method === 'POST') {
        sendJson(res, 200, { ok: true, ...(await engine.rebuild()) })
        return
      }

      if (route === '/library/api/collections' && method === 'GET') {
        sendJson(res, 200, { ok: true, ...(await engine.listCollections()) })
        return
      }

      if (route === '/library/api/collections' && method === 'POST') {
        const body = await readJsonBody(req)
        sendJson(res, 201, { ok: true, collection: await engine.createCollection(body.name) })
        return
      }

      if (route === '/library/api/collections' && method === 'PATCH') {
        const body = await readJsonBody(req)
        sendJson(res, 200, { ok: true, collection: await engine.renameCollection(body.id, body.name) })
        return
      }

      if (route === '/library/api/collections' && method === 'DELETE') {
        const body = await readJsonBody(req)
        sendJson(res, 200, { ok: true, ...(await engine.deleteCollection(body.id)) })
        return
      }

      if (route === '/library/api/zip' && method === 'POST') {
        const body = await readJsonBody(req)
        const ids = Array.isArray(body.ids) ? body.ids.filter((id) => typeof id === 'string') : []
        if (ids.length === 0) throw new LibraryError('invalid-selection', 'select at least one file')
        const entries = []
        let total = 0
        for (const id of ids) {
          const opened = await engine.openBlob(id)
          total += opened.size
          if (total > MAX_ZIP_BYTES) {
            throw new LibraryError('zip-too-large', `the selection exceeds ${MAX_ZIP_BYTES} bytes`)
          }
          entries.push({ name: opened.record.name, data: await readFile(opened.file) })
        }
        const archive = createZip(entries)
        const stamp = new Date().toISOString().slice(0, 10)
        res.writeHead(200, {
          'content-type': 'application/zip',
          'content-length': archive.length,
          'content-disposition': contentDisposition('attachment', `library-${stamp}.zip`),
          'cache-control': 'no-store',
          ...corsHeaders(),
        })
        res.end(archive)
        return
      }

      if (route === '/library/api/migrate' && method === 'POST') {
        const body = await readJsonBody(req)
        const result = await engine.migrate(body.root)
        if (typeof persistRoot === 'function') await persistRoot(result.root)
        sendJson(res, 200, { ok: true, ...result })
        return
      }

      if (route === '/library/api/import' && method === 'POST') {
        const body = await readJsonBody(req)
        const record = await engine.importPath({
          path: body.path,
          source: body.source === 'manual-save' ? 'manual-save' : 'agent-deliverable',
          origin: body.origin === undefined ? null : body.origin,
          failureId: body.failureId,
        })
        sendJson(res, 201, { ok: true, item: record })
        return
      }

      if (route === '/library/api/retry-failures' && method === 'POST') {
        const state = await engine.state()
        let retried = 0
        const failed = []
        for (const failure of state.failures ?? []) {
          try {
            await engine.importPath({
              path: failure.path,
              source: 'agent-deliverable',
              origin: failure.origin ?? null,
              failureId: failure.id,
            })
            retried += 1
          } catch (error) {
            const reason = String(error?.message ?? error)
            await engine.updateFailureReason(failure.id, reason)
            failed.push({ id: failure.id, reason })
          }
        }
        sendJson(res, 200, { ok: true, retried, failed })
        return
      }

      if (route === '/library/api/attach' && method === 'POST') {
        const body = await readJsonBody(req)
        const ids = Array.isArray(body.ids) ? body.ids.filter((id) => typeof id === 'string') : []
        if (ids.length === 0) throw new LibraryError('invalid-selection', 'select at least one file')
        if (ids.length > MAX_ATTACH) {
          throw new LibraryError('too-many', `at most ${MAX_ATTACH} files can be attached at once`)
        }
        const items = []
        for (const id of ids) {
          const record = await engine.get(id)
          if (record === undefined) throw new LibraryError('invalid-selection', `no library record ${id}`)
          items.push(record)
        }
        sendJson(res, 200, { ok: true, items })
        return
      }

      const rawMatch = route.match(/^\/library\/raw\/([^/]+)$/)
      if (rawMatch !== null && method === 'GET') {
        const opened = await engine.openBlob(decodeURIComponent(rawMatch[1]))
        const data = await readFile(opened.file)
        res.writeHead(200, {
          'content-type': opened.record.mime || 'application/octet-stream',
          'content-length': data.length,
          'content-security-policy':
            "default-src 'none'; img-src data: blob:; media-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:",
          'x-content-type-options': 'nosniff',
          'cache-control': 'no-store',
          ...corsHeaders(),
        })
        res.end(data)
        return
      }

      if (route === '/library/api/preview' && method === 'GET') {
        const address = url.searchParams.get('address') ?? ''
        const parsed = parseLibraryAddress(address)
        if (parsed === null) throw new LibraryError('bad-address', 'not a library preview address')
        const record = await engine.get(parsed.id)
        if (record === undefined) throw new LibraryError('not-found', `no library record ${parsed.id}`)

        const renderer = record.broken ? 'missing' : rendererFor(record)
        const originPath = record.origin?.pathAtCapture
        const originFileExists =
          typeof originPath === 'string' ? await stat(originPath).then(() => true, () => false) : null
        const payload = {
          ok: true,
          item: record,
          address,
          root: engine.root,
          originFileExists,
          renderer,
          language: languageOf(record.name),
          officeAvailable: officeOf() !== undefined && officeOf() !== null,
          media: {
            blob: `/library/blob/${encodeURIComponent(record.id)}`,
            download: `/library/download/${encodeURIComponent(record.id)}`,
          },
        }

        if (record.broken) {
          payload.reason = 'missing-bytes'
        } else if (renderer === 'markdown' || renderer === 'html' || renderer === 'text' || renderer === 'code') {
          const limit = renderer === 'markdown' || renderer === 'html' ? MAX_HTML_BYTES : MAX_TEXT_BYTES
          const read = await engine.readBytes(record.id, limit)
          if (read.tooLarge === true) {
            payload.renderer = 'other'
            payload.reason = 'too-large'
            payload.limitBytes = limit
          } else {
            const text = Buffer.from(read.data).toString('utf8')
            payload.source = { bytes: read.size }
            payload.text = text
            if (renderer === 'markdown') payload.html = markdownToHtml(text)
          }
        }

        notePreview({ id: record.id, name: record.name, renderer: payload.renderer })
        sendJson(res, 200, payload)
        return
      }

      if (route === '/library/api/open' && method === 'POST') {
        const body = await readJsonBody(req)
        const record = typeof body.id === 'string' ? await engine.get(body.id) : undefined
        if (record === undefined) throw new LibraryError('not-found', 'no such library record')
        if (typeof openInSystem !== 'function') {
          throw new LibraryError('open-unavailable', 'this host cannot open files in a system application')
        }
        const opened = await engine.openBlob(record.id)
        await openInSystem(opened.file)
        sendJson(res, 200, { ok: true })
        return
      }

      if (route.startsWith('/library/render/') && method === 'GET') {
        const id = decodeURIComponent(route.slice('/library/render/'.length))
        const record = await engine.get(id)
        if (record === undefined) throw new LibraryError('not-found', `no library record ${id}`)
        const opened = await engine.openBlob(id)

        if (record.ext === 'pdf') {
          await sendBytes(req, res, opened, { 'content-type': 'application/pdf' })
          return
        }

        const cacheDir = path.join(engine.root, 'tmp', 'render')
        const cached = path.join(cacheDir, `${record.sha256}.pdf`)
        let pdf = await readFile(cached).catch(() => undefined)
        if (pdf === undefined) {
          const converted = await convertOffice(officeOf(), record, opened.file)
          pdf = Buffer.from(converted.pdf)
          await mkdir(cacheDir, { recursive: true })
          await writeFile(cached, pdf).catch(() => {})
        }
        res.writeHead(200, {
          'content-type': 'application/pdf',
          'content-length': pdf.length,
          'cache-control': 'private, max-age=3600',
          'x-library-converted': '1',
          ...corsHeaders(),
        })
        res.end(pdf)
        return
      }

      const blobMatch = /^\/library\/(blob|download)\/(.+)$/.exec(route)
      if (blobMatch !== null && method === 'GET') {
        const opened = await engine.openBlob(decodeURIComponent(blobMatch[2]))
        await sendBytes(req, res, opened, {
          'content-disposition': contentDisposition(blobMatch[1] === 'download' ? 'attachment' : 'inline', opened.record.name),
        })
        return
      }

      fail(res, 404, new LibraryError('not-found', `no route ${method} ${route}`))
    } catch (error) {
      fail(res, statusOf(error), error)
    }
  }
}
