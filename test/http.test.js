import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { LibraryEngine } from '../lib/engine.js'
import { createLibraryHandler } from '../lib/http.js'

/** Boot one engine + server on an ephemeral loopback port. */
async function boot(t, options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'library-http-'))
  const engine = new LibraryEngine(root)
  await engine.init()
  const server = createServer(createLibraryHandler(engine, options))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve))
    await rm(root, { recursive: true, force: true })
  })
  return { engine, root, base: `http://127.0.0.1:${port}` }
}

function upload(base, name, body, extra = {}) {
  return fetch(`${base}/library/api/files`, {
    method: 'POST',
    headers: {
      'content-type': 'application/octet-stream',
      'x-library-name': encodeURIComponent(name),
      ...extra,
    },
    body,
  })
}

test('upload, list, rename on collision, dedupe and release', async (t) => {
  const { base, root } = await boot(t)

  const pdf = Buffer.from('%PDF-1.4 probe bytes')
  const first = await upload(base, 'Q3 报告.pdf', pdf)
  assert.equal(first.status, 201)
  const firstBody = await first.json()
  assert.equal(firstBody.ok, true)
  assert.equal(firstBody.item.name, 'Q3 报告.pdf')
  assert.equal(firstBody.item.kind, 'document')
  assert.equal(firstBody.item.mime, 'application/pdf')
  assert.equal(firstBody.item.source, 'upload-library')

  // Same display name, different bytes: a numbered copy.
  const second = await (await upload(base, 'Q3 报告.pdf', Buffer.from('other bytes'))).json()
  assert.equal(second.item.name, 'Q3 报告 (2).pdf')

  // Same bytes, new name: one blob, two records, refs 2.
  const third = await (await upload(base, 'report-copy.pdf', pdf)).json()
  assert.equal(third.item.sha256, firstBody.item.sha256)

  const listed = await (await fetch(`${base}/library/api/files?sort=name&direction=asc`)).json()
  assert.equal(listed.total, 3)
  assert.deepEqual(listed.items.map((item) => item.name).sort(), ['Q3 报告 (2).pdf', 'Q3 报告.pdf', 'report-copy.pdf'])
  assert.equal(listed.items.find((item) => item.name === 'report-copy.pdf').refs, 2)
  assert.equal(new Set(listed.items.map((item) => item.sha256)).size, 2)

  // Filtering and search.
  const onlyPdf = await (await fetch(`${base}/library/api/files?category=document`)).json()
  assert.equal(onlyPdf.total, 3)
  const noHits = await (await fetch(`${base}/library/api/files?q=nothing-matches`)).json()
  assert.equal(noHits.total, 0)

  // Delete the duplicate name first: bytes of that record are released.
  const one = await (
    await fetch(`${base}/library/api/files`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids: [second.item.id] }),
    })
  ).json()
  assert.deepEqual(one.deleted, [second.item.id])
  assert.equal(one.releasedBytes, 'other bytes'.length)

  // Deleting the last two references releases the shared blob once.
  const rest = await (
    await fetch(`${base}/library/api/files`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids: [firstBody.item.id, third.item.id] }),
    })
  ).json()
  assert.equal(rest.deleted.length, 2)
  assert.equal(rest.releasedBytes, pdf.length)

  const state = await (await fetch(`${base}/library/api/state`)).json()
  assert.equal(state.files, 0)
  assert.equal(state.bytes, 0)
  assert.equal(state.blobs, 0)
  assert.equal(state.root, root)
})

test('stored bytes are served inline, as a download, and by range', async (t) => {
  const { base } = await boot(t)
  const payload = Buffer.from('0123456789abcdef')
  const created = await (await upload(base, 'digits.txt', payload)).json()

  const inline = await fetch(`${base}/library/blob/${created.item.id}`)
  assert.equal(inline.status, 200)
  assert.equal(inline.headers.get('content-type'), 'text/plain')
  assert.match(inline.headers.get('content-disposition') ?? '', /^inline;/)
  assert.equal(Buffer.from(await inline.arrayBuffer()).toString(), payload.toString())

  const download = await fetch(`${base}/library/download/${created.item.id}`)
  assert.match(download.headers.get('content-disposition') ?? '', /^attachment;/)
  assert.equal((await download.arrayBuffer()).byteLength, payload.length)

  const ranged = await fetch(`${base}/library/blob/${created.item.id}`, { headers: { range: 'bytes=2-5' } })
  assert.equal(ranged.status, 206)
  assert.equal(ranged.headers.get('content-range'), `bytes 2-5/${payload.length}`)
  assert.equal(Buffer.from(await ranged.arrayBuffer()).toString(), '2345')
})

test('favorites, broken records and reconcile are exposed', async (t) => {
  const { base } = await boot(t)
  const created = await (await upload(base, 'keep.txt', Buffer.from('keep'))).json()

  const patched = await (
    await fetch(`${base}/library/api/files`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids: [created.item.id], favorited: true }),
    })
  ).json()
  assert.equal(patched.items[0].favorited, true)

  const favorites = await (await fetch(`${base}/library/api/files?category=favorite`)).json()
  assert.equal(favorites.total, 1)

  const reconciled = await (await fetch(`${base}/library/api/reconcile`, { method: 'POST' })).json()
  assert.deepEqual(reconciled.broken, [])
})

test('only loopback and the shell may call the API', async (t) => {
  const { base } = await boot(t)

  const denied = await fetch(`${base}/library/api/state`, { headers: { origin: 'https://example.com' } })
  assert.equal(denied.status, 403)
  const deniedBody = await denied.json()
  assert.equal(deniedBody.error.code, 'forbidden-origin')

  const allowed = await fetch(`${base}/library/api/state`, { headers: { origin: 'dsh-app://app' } })
  assert.equal(allowed.status, 200)
  assert.equal(allowed.headers.get('access-control-allow-origin'), '*')

  const preflight = await fetch(`${base}/library/api/files`, {
    method: 'OPTIONS',
    headers: { origin: 'dsh-app://app', 'access-control-request-method': 'POST' },
  })
  assert.equal(preflight.status, 204)

  const blockedPreflight = await fetch(`${base}/library/api/files`, {
    method: 'OPTIONS',
    headers: { origin: 'https://example.com', 'access-control-request-method': 'POST' },
  })
  assert.equal(blockedPreflight.status, 403)

  const health = await (await fetch(`${base}/library/health`)).json()
  assert.equal(health.ok, true)
  assert.equal(typeof health.root, 'string')
})

test('an unknown record is a 404 and a bad body is a 400', async (t) => {
  const { base } = await boot(t)

  const missing = await fetch(`${base}/library/blob/lic_nope`)
  assert.equal(missing.status, 404)
  assert.equal((await missing.json()).error.code, 'not-found')

  const bad = await fetch(`${base}/library/api/files`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: '{oops',
  })
  assert.equal(bad.status, 400)
  assert.equal((await bad.json()).error.code, 'bad-json')

  const noName = await fetch(`${base}/library/api/files`, { method: 'POST', body: Buffer.from('x') })
  assert.equal(noName.status, 400)
  assert.equal((await noName.json()).error.code, 'missing-name')
})

// --- preview -----------------------------------------------------------------

const { libraryAddress } = await import('../lib/render.js')

async function preview(base, record) {
  const address = encodeURIComponent(libraryAddress(record))
  const response = await fetch(`${base}/library/api/preview?address=${address}`)
  return { status: response.status, body: await response.json() }
}

test('markdown, text and image previews resolve their renderer', async (t) => {
  const { base } = await boot(t)

  const markdown = await (await upload(base, 'notes.md', Buffer.from('# Hello\n\nSome **bold** text.'))).json()
  const md = await preview(base, markdown.item)
  assert.equal(md.status, 200)
  assert.equal(md.body.renderer, 'markdown')
  assert.ok(md.body.html.includes('<h1>Hello</h1>'))
  assert.ok(md.body.html.includes('<strong>bold</strong>'))
  assert.equal(md.body.item.id, markdown.item.id)

  const text = await (await upload(base, 'plain.txt', Buffer.from('a <b> c'))).json()
  const plain = await preview(base, text.item)
  assert.equal(plain.body.renderer, 'text')
  assert.equal(plain.body.text, 'a <b> c')

  const code = await (await upload(base, 'app.js', Buffer.from('const x = 1'))).json()
  const script = await preview(base, code.item)
  assert.equal(script.body.renderer, 'code')
  assert.equal(script.body.language, 'javascript')

  const png = await (await upload(base, 'pixel.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]))).json()
  const image = await preview(base, png.item)
  assert.equal(image.body.renderer, 'image')
  assert.equal(image.body.media.blob, `/library/blob/${png.item.id}`)
  assert.equal(image.body.media.download, `/library/download/${png.item.id}`)
})

test('a document without a conversion engine reports the downgrade', async (t) => {
  const { base } = await boot(t)
  const doc = await (await upload(base, '报告.docx', Buffer.from('fake docx bytes'))).json()

  const info = await preview(base, doc.item)
  assert.equal(info.body.renderer, 'office')
  assert.equal(info.body.officeAvailable, false)

  const rendered = await fetch(`${base}/library/render/${doc.item.id}`)
  assert.equal(rendered.status, 415)
  const failure = await rendered.json()
  assert.equal(failure.error.code, 'office-unavailable')
})

test('a document converts once and is then served from the render cache', async (t) => {
  let conversions = 0
  const { base } = await boot(t, {
    office: () => ({
      convert: async (request) => {
        conversions += 1
        assert.equal(request.extension, 'docx')
        const bytes = await request.source.read(new AbortController().signal, 4096)
        assert.ok(bytes.bytes.length > 0)
        return { pdf: Buffer.from('%PDF-1.4 converted'), missingFonts: [] }
      },
    }),
  })

  const doc = await (await upload(base, 'deck.docx', Buffer.from('docx payload'))).json()
  const info = await preview(base, doc.item)
  assert.equal(info.body.officeAvailable, true)

  const first = await fetch(`${base}/library/render/${doc.item.id}`)
  assert.equal(first.status, 200)
  assert.equal(first.headers.get('content-type'), 'application/pdf')
  assert.equal(Buffer.from(await first.arrayBuffer()).toString(), '%PDF-1.4 converted')

  const second = await fetch(`${base}/library/render/${doc.item.id}`)
  assert.equal(second.status, 200)
  assert.equal(conversions, 1)
})

test('a failed conversion is reported, not cached', async (t) => {
  const { base } = await boot(t, {
    office: () => ({
      convert: async () => {
        throw new Error('engine crashed')
      },
    }),
  })
  const doc = await (await upload(base, 'broken.pptx', Buffer.from('pptx payload'))).json()
  const rendered = await fetch(`${base}/library/render/${doc.item.id}`)
  assert.equal(rendered.status, 415)
  assert.equal((await rendered.json()).error.code, 'office-unavailable')
})

test('a record whose bytes vanished previews as missing', async (t) => {
  const { engine, base } = await boot(t)
  const created = await (await upload(base, 'gone.txt', Buffer.from('gone'))).json()
  await rm(engine.blobPath(created.item.sha256), { force: true })
  await engine.reconcile()

  const info = await preview(base, created.item)
  assert.equal(info.body.renderer, 'missing')
  assert.equal(info.body.reason, 'missing-bytes')

  const blob = await fetch(`${base}/library/blob/${created.item.id}`)
  assert.equal(blob.status, 410)
  assert.equal((await blob.json()).error.code, 'missing-bytes')
})

test('preview rejects foreign addresses and remembers what was opened', async (t) => {
  const { base } = await boot(t)

  const bad = await fetch(`${base}/library/api/preview?address=${encodeURIComponent('dsh-resource://file/session/s1/x.pdf')}`)
  assert.equal(bad.status, 400)
  assert.equal((await bad.json()).error.code, 'bad-address')

  const doc = await (await upload(base, 'seen.md', Buffer.from('# seen'))).json()
  await preview(base, doc.item)

  const health = await (await fetch(`${base}/library/health`)).json()
  assert.equal(health.recentPreviews.length, 1)
  assert.equal(health.recentPreviews[0].renderer, 'markdown')
  assert.equal(health.recentPreviews[0].id, doc.item.id)
})

test('opening in a system application uses the stored bytes', async (t) => {
  const opened = []
  const { base } = await boot(t, { openInSystem: async (file) => opened.push(file) })
  const doc = await (await upload(base, 'open.txt', Buffer.from('open me'))).json()

  const response = await fetch(`${base}/library/api/open`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: doc.item.id }),
  })
  assert.equal(response.status, 200)
  assert.equal(opened.length, 1)
  assert.ok(opened[0].endsWith('.bin'))

  const missing = await fetch(`${base}/library/api/open`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'lic_missing' }),
  })
  assert.equal(missing.status, 404)
})

test('a host without an opener reports the unavailable capability', async (t) => {
  const { base } = await boot(t)
  const doc = await (await upload(base, 'open.txt', Buffer.from('open me'))).json()
  const response = await fetch(`${base}/library/api/open`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: doc.item.id }),
  })
  assert.equal(response.status, 501)
  assert.equal((await response.json()).error.code, 'open-unavailable')
})
// --- attach ------------------------------------------------------------------

test('attaching returns the chosen records and caps the selection', async (t) => {
  const { base } = await boot(t)
  const ids = []
  for (const name of ['a.txt', 'b.txt', 'c.txt']) {
    const created = await (await upload(base, name, Buffer.from(`payload ${name}`))).json()
    ids.push(created.item.id)
  }

  const post = (body) =>
    fetch(`${base}/library/api/attach`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })

  const ok = await post({ ids })
  assert.equal(ok.status, 200)
  const attached = await ok.json()
  assert.equal(attached.items.length, 3)
  assert.deepEqual(attached.items.map((item) => item.name), ['a.txt', 'b.txt', 'c.txt'])
  assert.ok(attached.items[0].mime === 'text/plain')

  const empty = await post({ ids: [] })
  assert.equal(empty.status, 400)
  assert.equal((await empty.json()).error.code, 'invalid-selection')

  const unknown = await post({ ids: ['lic_missing'] })
  assert.equal(unknown.status, 400)
  assert.equal((await unknown.json()).error.code, 'invalid-selection')

  const tooMany = await post({ ids: Array.from({ length: 21 }, (_, index) => ids[index % ids.length]) })
  assert.equal(tooMany.status, 400)
  assert.equal((await tooMany.json()).error.code, 'too-many')
})
// --- import, retry and origin liveness ---------------------------------------

test('a host path can be imported and clears its failure record', async (t) => {
  const { base, engine, root } = await boot(t)
  const source = path.join(root, 'incoming.txt')
  await writeFile(source, 'incoming bytes')

  const failure = await engine.recordFailure({
    path: source,
    reason: 'first attempt failed',
    origin: { sessionId: 'session-test', seq: 9, turn: 2, index: 0, pathAtCapture: source, workspaceId: null },
  })

  const response = await fetch(`${base}/library/api/import`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      path: source,
      source: 'agent-deliverable',
      origin: failure.origin,
      failureId: failure.id,
    }),
  })
  assert.equal(response.status, 201)
  const body = await response.json()
  assert.equal(body.item.name, 'incoming.txt')
  assert.equal(body.item.source, 'agent-deliverable')
  assert.equal(body.item.origin.seq, 9)

  const state = await (await fetch(`${base}/library/api/state`)).json()
  assert.equal(state.failures.length, 0)

  const missing = await fetch(`${base}/library/api/import`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: path.join(root, 'nope.txt') }),
  })
  assert.equal(missing.status, 400)
  assert.equal((await missing.json()).error.code, 'file-missing')
})

test('retrying failures reports what recovered and what did not', async (t) => {
  const { base, engine, root } = await boot(t)
  const recoverable = path.join(root, 'recoverable.txt')
  await writeFile(recoverable, 'recovered bytes')

  await engine.recordFailure({ path: recoverable, reason: 'temporarily locked' })
  await engine.recordFailure({ path: path.join(root, 'still-missing.txt'), reason: 'gone' })

  const response = await fetch(`${base}/library/api/retry-failures`, { method: 'POST' })
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.retried, 1)
  assert.equal(body.failed.length, 1)
  assert.match(body.failed[0].reason, /cannot read/)

  const state = await (await fetch(`${base}/library/api/state`)).json()
  assert.equal(state.failures.length, 1)
  assert.equal(state.failures[0].path, path.join(root, 'still-missing.txt'))
})

test('the preview reports whether the captured source still exists', async (t) => {
  const { base, engine, root } = await boot(t)
  const source = path.join(root, 'origin.txt')
  await writeFile(source, 'origin bytes')

  const record = await engine.importPath({
    path: source,
    source: 'agent-deliverable',
    origin: { sessionId: 'session-test', seq: 5, turn: 1, index: 0, pathAtCapture: source, workspaceId: 'ws_1' },
  })

  const preview = async () =>
    (await fetch(`${base}/library/api/preview?address=${encodeURIComponent(record.address)}`)).json()

  assert.equal((await preview()).originFileExists, true)
  await rm(source, { force: true })
  const after = await preview()
  assert.equal(after.originFileExists, false)
  assert.equal(after.item.origin.seq, 5)
})
// --- collections -------------------------------------------------------------

function collectionCall(base, method, body) {
  return fetch(`${base}/library/api/collections`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

test('collections are created, renamed and deleted without losing files', async (t) => {
  const { base } = await boot(t)

  const created = await (await collectionCall(base, 'POST', { name: '  合同  ' })).json()
  assert.equal(created.collection.name, '合同')
  const id = created.collection.id

  const duplicate = await collectionCall(base, 'POST', { name: '合同' })
  assert.equal(duplicate.status, 400)
  assert.equal((await duplicate.json()).error.code, 'collection-duplicate')

  const slash = await collectionCall(base, 'POST', { name: 'a/b' })
  assert.equal((await slash.json()).error.code, 'collection-slash')

  const empty = await collectionCall(base, 'POST', { name: '   ' })
  assert.equal((await empty.json()).error.code, 'collection-empty')

  const renamed = await (await collectionCall(base, 'PATCH', { id, name: '2026Q3' })).json()
  assert.equal(renamed.collection.name, '2026Q3')

  const doc = await (await upload(base, 'contract.txt', Buffer.from('contract'))).json()
  const moved = await (
    await fetch(`${base}/library/api/files`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids: [doc.item.id], favorited: true, collectionId: id }),
    })
  ).json()
  assert.equal(moved.items[0].collectionId, id)

  const inCollection = await (await fetch(`${base}/library/api/files?category=favorite&collectionId=${id}`)).json()
  assert.equal(inCollection.total, 1)

  const state = await (await fetch(`${base}/library/api/state`)).json()
  assert.equal(state.collections.length, 1)
  assert.equal(state.collections[0].count, 1)
  assert.equal(state.unfiled, 0)

  const removed = await (await collectionCall(base, 'DELETE', { id })).json()
  assert.equal(removed.released, 1)

  const after = await (await fetch(`${base}/library/api/files?category=favorite&collectionId=uncategorized`)).json()
  assert.equal(after.total, 1)
  assert.equal(after.items[0].favorited, true)

  const remaining = await (await fetch(`${base}/library/api/collections`)).json()
  assert.equal(remaining.collections.length, 0)
})

test('moving a file into a missing collection is rejected', async (t) => {
  const { base } = await boot(t)
  const doc = await (await upload(base, 'loose.txt', Buffer.from('loose'))).json()
  const response = await fetch(`${base}/library/api/files`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids: [doc.item.id], collectionId: 'col_missing' }),
  })
  assert.equal(response.status, 400)
  assert.equal((await response.json()).error.code, 'unknown-collection')
})
// --- zip and migration -------------------------------------------------------

test('a zip archive carries the selected files', async (t) => {
  const { base } = await boot(t)
  const first = await (await upload(base, 'one.txt', Buffer.from('first file'))).json()
  const second = await (await upload(base, 'two.txt', Buffer.from('second file'))).json()

  const response = await fetch(`${base}/library/api/zip`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids: [first.item.id, second.item.id] }),
  })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'application/zip')
  assert.match(response.headers.get('content-disposition') ?? '', /attachment; filename="library-.*\.zip"/)

  const archive = Buffer.from(await response.arrayBuffer())
  assert.equal(archive.readUInt32LE(0), 0x04034b50)
  const end = archive.length - 22
  assert.equal(archive.readUInt32LE(end), 0x06054b50)
  assert.equal(archive.readUInt16LE(end + 10), 2)
  // Entry names live in the central directory; both must appear verbatim.
  const text = archive.toString('latin1')
  assert.ok(text.includes('one.txt'))
  assert.ok(text.includes('two.txt'))

  const empty = await fetch(`${base}/library/api/zip`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids: [] }),
  })
  assert.equal(empty.status, 400)
  assert.equal((await empty.json()).error.code, 'invalid-selection')
})

test('the archive moves to a new directory and stays readable', async (t) => {
  const { base, engine, root } = await boot(t)
  const created = await (await upload(base, 'moving.txt', Buffer.from('moving bytes'))).json()

  const target = await mkdtemp(path.join(os.tmpdir(), 'library-moved-'))
  t.after(async () => {
    await rm(target, { recursive: true, force: true })
  })

  const response = await fetch(`${base}/library/api/migrate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ root: target }),
  })
  assert.equal(response.status, 200)
  const moved = await response.json()
  assert.equal(moved.files, 1)
  assert.equal(moved.root, target)
  assert.equal(engine.root, target)

  const blob = await fetch(`${base}/library/blob/${created.item.id}`)
  assert.equal(blob.status, 200)
  assert.equal(Buffer.from(await blob.arrayBuffer()).toString(), 'moving bytes')

  // The old location no longer holds this plugin's layout.
  assert.equal(await stat(path.join(root, 'index.json')).then(() => true, () => false), false)

  // A fresh engine on the new root sees the same record.
  const reopened = new LibraryEngine(target)
  await reopened.init()
  assert.equal((await reopened.list({})).total, 1)
})
test('an html file previews rendered with a locked-down source route', async (t) => {
  const { base } = await boot(t)
  const page = await (
    await upload(base, 'page.html', Buffer.from('<!doctype html><h1>hi</h1><script>document.title="x"</script>'))
  ).json()

  const preview = await (await fetch(`${base}/library/api/preview?address=${encodeURIComponent(page.item.address)}`)).json()
  assert.equal(preview.renderer, 'html')
  assert.ok(preview.text.includes('<h1>hi</h1>'), 'the source text is missing')

  const raw = await fetch(`${base}/library/raw/${page.item.id}`)
  assert.equal(raw.status, 200)
  assert.match(raw.headers.get('content-type') ?? '', /text\/html/)
  const policy = raw.headers.get('content-security-policy') ?? ''
  assert.match(policy, /default-src 'none'/, 'the raw route must forbid network access')
  assert.equal(raw.headers.get('x-content-type-options'), 'nosniff')
  assert.ok((await raw.text()).includes('<h1>hi</h1>'))
})