import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { LibraryEngine } from '../lib/engine.js'
import { COLLECTION_NAME_MAX, sortCollections, validateCollectionName } from '../lib/model.js'

async function workspace(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'library-collections-'))
  const engine = new LibraryEngine(root)
  await engine.init()
  t.after(async () => {
    await rm(root, { recursive: true, force: true })
  })
  return { root, engine }
}

test('collection names follow the product rules', () => {
  assert.deepEqual(validateCollectionName('  合同  '), { ok: true, name: '合同' })
  assert.equal(validateCollectionName('').ok, false)
  assert.equal(validateCollectionName('   ').code, 'empty')
  assert.equal(validateCollectionName('a'.repeat(COLLECTION_NAME_MAX + 1)).code, 'too-long')
  assert.equal(validateCollectionName('a'.repeat(COLLECTION_NAME_MAX)).ok, true)
  assert.equal(validateCollectionName('2026/Q3').code, 'slash')
  assert.equal(validateCollectionName('合同', ['合同']).code, 'duplicate')
  assert.equal(validateCollectionName('合同', ['其他']).ok, true)
  assert.equal(validateCollectionName('合同', ['合同']).code, 'duplicate')
  // Case-insensitive uniqueness, as the chip strip shows names.
  assert.equal(validateCollectionName('CONTRACTS', ['contracts']).code, 'duplicate')
})

test('collections order by their recorded order', () => {
  const sorted = sortCollections([
    { id: 'b', name: 'B', order: 2, createdAt: '2026-01-02T00:00:00Z' },
    { id: 'a', name: 'A', order: 1, createdAt: '2026-01-03T00:00:00Z' },
  ])
  assert.deepEqual(sorted.map((entry) => entry.id), ['a', 'b'])
})

test('create, rename and delete keep files favorited', async (t) => {
  const { engine } = await workspace(t)
  const record = await engine.addBytes({ name: 'a.txt', bytes: Buffer.from('a') })

  const created = await engine.createCollection('  合同  ')
  assert.equal(created.name, '合同')
  assert.equal((await engine.listCollections()).collections.length, 1)

  await assert.rejects(() => engine.createCollection('合同'), (error) => error.code === 'collection-duplicate')
  await assert.rejects(() => engine.createCollection('a/b'), (error) => error.code === 'collection-slash')
  await assert.rejects(() => engine.createCollection('   '), (error) => error.code === 'collection-empty')

  const renamed = await engine.renameCollection(created.id, '2026Q3')
  assert.equal(renamed.name, '2026Q3')
  await assert.rejects(() => engine.renameCollection('col_missing', 'x'), (error) => error.code === 'not-found')

  await engine.update([record.id], { favorited: true, collectionId: created.id })
  const moved = await engine.get(record.id)
  assert.equal(moved.collectionId, created.id)
  assert.equal(moved.favorited, true)

  const removed = await engine.deleteCollection(created.id)
  assert.equal(removed.released, 1)
  const after = await engine.get(record.id)
  assert.equal(after.collectionId, null)
  assert.equal(after.favorited, true)
  assert.equal((await engine.listCollections()).collections.length, 0)
  assert.equal((await engine.listCollections()).unfiled, 1)
})

test('moving into an unknown collection is rejected', async (t) => {
  const { engine } = await workspace(t)
  const record = await engine.addBytes({ name: 'b.txt', bytes: Buffer.from('b') })
  await assert.rejects(
    () => engine.update([record.id], { collectionId: 'col_missing' }),
    (error) => error.code === 'unknown-collection',
  )
})

test('the favorite view filters by collection and by uncategorized', async (t) => {
  const { engine } = await workspace(t)
  const first = await engine.addBytes({ name: 'one.txt', bytes: Buffer.from('1') })
  const second = await engine.addBytes({ name: 'two.txt', bytes: Buffer.from('2') })
  const third = await engine.addBytes({ name: 'three.txt', bytes: Buffer.from('3') })

  const collection = await engine.createCollection('合同')
  await engine.update([first.id], { favorited: true, collectionId: collection.id })
  await engine.update([second.id], { favorited: true })

  const inCollection = await engine.list({ category: 'favorite', collectionId: collection.id })
  assert.deepEqual(inCollection.items.map((item) => item.name), ['one.txt'])

  const unfiled = await engine.list({ category: 'favorite', collectionId: 'uncategorized' })
  assert.deepEqual(unfiled.items.map((item) => item.name), ['two.txt'])

  const allFavorites = await engine.list({ category: 'favorite' })
  assert.equal(allFavorites.total, 2)

  const everything = await engine.list({ category: 'all' })
  assert.equal(everything.total, 3)
  assert.equal((await engine.get(third.id)).favorited, false)
})

test('unfavoriting clears the collection membership', async (t) => {
  const { engine } = await workspace(t)
  const record = await engine.addBytes({ name: 'c.txt', bytes: Buffer.from('c') })
  const collection = await engine.createCollection('临时')
  await engine.update([record.id], { favorited: true, collectionId: collection.id })
  await engine.update([record.id], { favorited: false })
  const after = await engine.get(record.id)
  assert.equal(after.favorited, false)
  assert.equal(after.collectionId, null)
})
