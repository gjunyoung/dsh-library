import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import test from 'node:test'

import { LibraryEngine } from '../lib/engine.js'

async function tempRoot(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'library-engine-'))
  t.after(async () => {
    await rm(root, { recursive: true, force: true })
  })
  return root
}

function shardOf(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

async function blobExists(engine, sha) {
  return stat(engine.blobPath(sha)).then(
    () => true,
    () => false,
  )
}

test('identical bytes are stored once and share a reference count', async (t) => {
  const root = await tempRoot(t)
  const engine = new LibraryEngine(root)
  await engine.init()

  const first = await engine.addBytes({ name: 'report.pdf', bytes: Buffer.from('same-bytes') })
  const second = await engine.addBytes({ name: 'copy.pdf', bytes: Buffer.from('same-bytes') })

  assert.equal(first.id === second.id, false)
  assert.equal(first.sha256, second.sha256)
  assert.equal(first.name, 'report.pdf')
  assert.equal(second.name, 'copy.pdf')

  const listed = await engine.list({})
  assert.equal(listed.total, 2)
  assert.equal(listed.items[0].refs, 2)
  assert.equal((await engine.state()).blobs, 1)

  const blobs = await readdir(path.join(root, 'blobs', first.sha256.slice(0, 2)))
  assert.deepEqual(blobs, [`${first.sha256}.bin`])
})

test('name collisions get a numbered suffix', async (t) => {
  const root = await tempRoot(t)
  const engine = new LibraryEngine(root)
  await engine.init()

  assert.equal((await engine.addBytes({ name: 'report.pdf', bytes: Buffer.from('a') })).name, 'report.pdf')
  assert.equal((await engine.addBytes({ name: 'report.pdf', bytes: Buffer.from('b') })).name, 'report (2).pdf')
  assert.equal((await engine.addBytes({ name: 'report.pdf', bytes: Buffer.from('c') })).name, 'report (3).pdf')
})

test('bytes are released only when the last record goes away', async (t) => {
  const root = await tempRoot(t)
  const engine = new LibraryEngine(root)
  await engine.init()

  const first = await engine.addBytes({ name: 'a.txt', bytes: Buffer.from('shared') })
  const second = await engine.addBytes({ name: 'b.txt', bytes: Buffer.from('shared') })
  assert.equal(await blobExists(engine, first.sha256), true)

  const one = await engine.remove([first.id])
  assert.deepEqual(one.deleted, [first.id])
  assert.equal(one.releasedBytes, 0)
  assert.equal(await blobExists(engine, first.sha256), true)
  assert.equal((await engine.list({})).items[0].refs, 1)

  const two = await engine.remove([second.id])
  assert.deepEqual(two.deleted, [second.id])
  assert.equal(two.releasedBytes, 'shared'.length)
  assert.equal(await blobExists(engine, first.sha256), false)
  assert.equal((await engine.state()).files, 0)
  assert.equal((await engine.state()).bytes, 0)
})

test('streamed uploads hash the bytes while writing', async (t) => {
  const root = await tempRoot(t)
  const engine = new LibraryEngine(root)
  await engine.init()

  const payload = Buffer.from('streamed payload '.repeat(64))
  const record = await engine.addStream({ name: 'stream.txt', stream: Readable.from([payload]) })
  assert.equal(record.bytes, payload.length)
  assert.equal(record.sha256, shardOf(payload))
  assert.equal(record.kind, 'document')
  assert.equal(record.mime, 'text/plain')

  const tmp = await readdir(path.join(root, 'tmp'))
  assert.deepEqual(tmp, [])

  const tiny = new LibraryEngine(await tempRoot(t), { maxUploadBytes: 4 })
  await tiny.init()
  await assert.rejects(
    () => tiny.addStream({ name: 'huge.bin', stream: Readable.from([Buffer.alloc(8)]) }),
    /exceeds/,
  )
})

test('a brand-new archive starts without an index error', async (t) => {
  const root = await tempRoot(t)
  const engine = new LibraryEngine(root)
  await engine.init()
  const state = await engine.state()
  assert.equal(state.files, 0)
  assert.equal(state.indexError, null)
  assert.equal(engine.indexError, null)
})

test('a record whose bytes vanished is reported as broken', async (t) => {
  const root = await tempRoot(t)
  const engine = new LibraryEngine(root)
  await engine.init()
  const record = await engine.addBytes({ name: 'gone.txt', bytes: Buffer.from('gone') })

  await rm(engine.blobPath(record.sha256), { force: true })
  const plan = await engine.reconcile()
  assert.deepEqual(plan.broken, [record.id])

  const [item] = (await engine.list({})).items
  assert.equal(item.broken, true)
  assert.equal((await engine.state()).broken, 1)
})

test('bytes with no record move to orphan instead of being deleted', async (t) => {
  const root = await tempRoot(t)
  const engine = new LibraryEngine(root)
  await engine.init()

  const stray = shardOf(Buffer.from('stray'))
  const strayPath = engine.blobPath(stray)
  await writeFile(strayPath, 'stray').catch(async () => {
    const { mkdir } = await import('node:fs/promises')
    await mkdir(path.dirname(strayPath), { recursive: true })
    await writeFile(strayPath, 'stray')
  })

  const plan = await engine.reconcile()
  assert.deepEqual(plan.orphans, [stray])
  assert.deepEqual(plan.moved, [stray])
  assert.equal(await blobExists(engine, stray), false)
  assert.deepEqual(await readdir(engine.orphanDir), [`${stray}.bin`])
})

test('favorite, collection and rename updates persist', async (t) => {
  const root = await tempRoot(t)
  const engine = new LibraryEngine(root)
  await engine.init()

  const record = await engine.addBytes({ name: 'note.txt', bytes: Buffer.from('note') })
  const other = await engine.addBytes({ name: 'other.txt', bytes: Buffer.from('other') })

  const favorited = await engine.update([record.id], { favorited: true })
  assert.deepEqual(favorited.updated, [record.id])
  assert.equal((await engine.get(record.id)).favorited, true)

  const renamed = await engine.update([record.id], { name: 'other.txt' })
  assert.equal(renamed.items[0].name, 'other (2).txt')
  assert.equal((await engine.get(other.id)).name, 'other.txt')

  const cleared = await engine.update([record.id], { favorited: false, collectionId: null })
  assert.equal(cleared.items[0].favorited, false)
  assert.equal(cleared.items[0].collectionId, null)
})

test('the index survives a restart and can be rebuilt from bytes', async (t) => {
  const root = await tempRoot(t)
  const engine = new LibraryEngine(root)
  await engine.init()
  const record = await engine.addBytes({ name: 'keep.txt', bytes: Buffer.from('keep me') })

  const restarted = new LibraryEngine(root)
  await restarted.init()
  assert.equal((await restarted.list({})).total, 1)
  assert.equal((await restarted.get(record.id)).name, 'keep.txt')

  await rm(path.join(root, 'index.json'), { force: true })
  await rm(path.join(root, 'index.backup.json'), { force: true })
  const rebuilt = new LibraryEngine(root)
  await rebuilt.init()
  // A missing index adopts the stored bytes instead of orphaning them.
  assert.equal(rebuilt.indexError?.file, 'index.json')
  assert.equal((await rebuilt.list({})).total, 1)
  const result = await rebuilt.rebuild()
  assert.equal(result.files, 1)
  const [recovered] = (await rebuilt.list({})).items
  assert.equal(recovered.sha256, record.sha256)
  assert.equal(recovered.bytes, record.bytes)
  assert.equal(rebuilt.indexError, null)
})

test('a corrupt index falls back to the backup copy', async (t) => {
  const root = await tempRoot(t)
  const engine = new LibraryEngine(root)
  await engine.init()
  await engine.addBytes({ name: 'first.txt', bytes: Buffer.from('one') })
  await engine.addBytes({ name: 'second.txt', bytes: Buffer.from('two') })

  await writeFile(path.join(root, 'index.json'), '{ not json', 'utf8')
  const recovered = new LibraryEngine(root)
  await recovered.init()
  const listed = await recovered.list({})
  assert.ok(listed.total >= 1)
  assert.equal(recovered.indexError?.file, 'index.json')
})
