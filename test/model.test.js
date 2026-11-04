import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildReconcilePlan,
  compareNames,
  displayDate,
  extensionOf,
  formatSize,
  kindOf,
  matchesQuery,
  mimeOf,
  paginate,
  sanitizeName,
  sortItems,
  sourceBucket,
  summarizeDelete,
  uniqueName,
} from '../lib/model.js'

const records = [
  { id: 'a', name: '报表.pdf', kind: 'document', source: 'agent-deliverable', bytes: 300, createdAt: '2026-10-01T00:00:00Z', sourceMtime: '2026-09-01T00:00:00Z' },
  { id: 'b', name: 'apple.png', kind: 'image', source: 'upload-library', bytes: 100, createdAt: '2026-10-02T00:00:00Z', sourceMtime: null },
  { id: 'c', name: 'Zebra.docx', kind: 'document', source: 'upload-chat', bytes: 200, createdAt: '2026-10-03T00:00:00Z', sourceMtime: '2026-10-04T06:00:00Z' },
  { id: 'd', name: 'b.mp4', kind: 'video', source: 'manual-save', bytes: 400, createdAt: '2026-10-04T00:00:00Z', sourceMtime: null },
]

test('extension and kind classification', () => {
  assert.equal(extensionOf('report.PDF'), 'pdf')
  assert.equal(extensionOf('archive.tar.gz'), 'gz')
  assert.equal(extensionOf('no-extension'), '')
  assert.equal(extensionOf('.gitignore'), '')
  assert.equal(kindOf('photo.JPG'), 'image')
  assert.equal(kindOf('clip.mov'), 'video')
  assert.equal(kindOf('voice.m4a'), 'audio')
  assert.equal(kindOf('sheet.xlsx'), 'document')
  assert.equal(kindOf('model.glb'), 'other')
  assert.equal(mimeOf('a.pdf'), 'application/pdf')
  assert.equal(mimeOf('a.unknown'), 'application/octet-stream')
})

test('display names are sanitized and made unique', () => {
  assert.equal(sanitizeName('  report.pdf  '), 'report.pdf')
  assert.equal(sanitizeName('D:\\tmp\\report.pdf'), 'report.pdf')
  assert.equal(sanitizeName('/home/me/报表.pdf'), '报表.pdf')
  assert.equal(sanitizeName('..'), 'untitled')
  assert.equal(sanitizeName('a<b>c?.txt'), 'a_b_c_.txt')

  assert.equal(uniqueName('report.pdf', []), 'report.pdf')
  assert.equal(uniqueName('report.pdf', ['report.pdf']), 'report (2).pdf')
  assert.equal(uniqueName('report.pdf', ['report.pdf', 'report (2).pdf']), 'report (3).pdf')
  assert.equal(uniqueName('report.pdf', ['REPORT.PDF']), 'report (2).pdf')
  assert.equal(uniqueName('notes', ['notes']), 'notes (2)')
  assert.equal(uniqueName('a.b.c.pdf', ['a.b.c.pdf']), 'a.b.c (2).pdf')
})

test('sorting covers name, size and date in both directions', () => {
  // The Host sorts with the ICU collation of the system locale (`zh`), so Han
  // names come before Latin ones and Han names order by pinyin among themselves.
  const byName = sortItems(records, 'name', 'asc').map((record) => record.name)
  assert.deepEqual(byName, ['报表.pdf', 'apple.png', 'b.mp4', 'Zebra.docx'])
  assert.ok(compareNames('张.pdf', '李.pdf') > 0)
  assert.ok(compareNames('a2.txt', 'a10.txt') < 0)

  assert.deepEqual(
    sortItems(records, 'size', 'desc').map((record) => record.bytes),
    [400, 300, 200, 100],
  )
  assert.deepEqual(
    sortItems(records, 'size', 'asc').map((record) => record.bytes),
    [100, 200, 300, 400],
  )

  // Date uses the capture snapshot when present, then the entry time.
  assert.equal(displayDate(records[0]), '2026-09-01T00:00:00Z')
  assert.equal(displayDate(records[1]), '2026-10-02T00:00:00Z')
  assert.deepEqual(
    sortItems(records, 'date', 'desc').map((record) => record.id),
    ['c', 'd', 'b', 'a'],
  )
  assert.deepEqual(
    sortItems(records, 'date', 'asc').map((record) => record.id),
    ['a', 'b', 'd', 'c'],
  )
  assert.ok(compareNames('a2', 'a10') < 0)
})

test('category, source and text filters compose', () => {
  const ids = (query) => records.filter((record) => matchesQuery(record, query)).map((record) => record.id)

  assert.deepEqual(ids({ category: 'all' }), ['a', 'b', 'c', 'd'])
  assert.deepEqual(ids({ category: 'document' }), ['a', 'c'])
  assert.deepEqual(ids({ category: 'image' }), ['b'])
  assert.deepEqual(ids({ category: 'favorite' }), [])
  assert.deepEqual(ids({ source: 'user' }), ['b', 'c', 'd'])
  assert.deepEqual(ids({ source: 'agent' }), ['a'])
  assert.deepEqual(ids({ category: 'document', source: 'user' }), ['c'])
  assert.deepEqual(ids({ q: 'report' }), [])
  assert.deepEqual(ids({ q: '报表' }), ['a'])
  assert.equal(sourceBucket('agent-deliverable'), 'agent')
  assert.equal(sourceBucket('manual-save'), 'user')
})

test('pagination reports the next cursor', () => {
  const first = paginate([1, 2, 3, 4, 5], 0, 2)
  assert.deepEqual(first.items, [1, 2])
  assert.equal(first.total, 5)
  assert.equal(first.nextOffset, 2)

  const last = paginate([1, 2, 3, 4, 5], 4, 2)
  assert.deepEqual(last.items, [5])
  assert.equal(last.nextOffset, null)
})

test('reconciliation separates broken records from orphan bytes', () => {
  const plan = buildReconcilePlan(
    [
      { id: 'a', sha256: 'aa' },
      { id: 'b', sha256: 'bb' },
    ],
    ['aa.bin', 'cc.bin'],
  )
  assert.deepEqual(plan.broken, ['b'])
  assert.deepEqual(plan.orphans, ['cc'])
})

test('delete summary only counts bytes the last reference releases', () => {
  assert.deepEqual(summarizeDelete([{ id: 'a', bytes: 10, refs: 2 }]), { count: 1, bytes: 0 })
  assert.deepEqual(summarizeDelete([{ id: 'a', bytes: 10, refs: 1 }, { id: 'b', bytes: 5, refs: 1 }]), {
    count: 2,
    bytes: 15,
  })
  assert.equal(formatSize(0), '0 B')
  assert.equal(formatSize(999), '999 B')
  assert.equal(formatSize(2048), '2.0 KB')
  assert.equal(formatSize(12 * 1024 * 1024), '12 MB')
})
