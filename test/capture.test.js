import assert from 'node:assert/strict'
import { mkdtemp, rm, unlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { captureDelivery } from '../lib/capture.js'
import { LibraryEngine } from '../lib/engine.js'

async function workspace(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'library-capture-'))
  const engine = new LibraryEngine(root)
  await engine.init()
  t.after(async () => {
    await rm(root, { recursive: true, force: true })
  })
  return { root, engine }
}

const session = { id: 'session-test' }

function deliveryEvent(seq, turn, paths) {
  return {
    type: 'deliverables/presented',
    seq,
    time: Date.now(),
    data: { turn, callId: 'call-1', files: paths.map((value) => ({ path: value })) },
  }
}

test('a delivery becomes library records with complete origin coordinates', async (t) => {
  const { root, engine } = await workspace(t)
  const first = path.join(root, 'report.docx')
  const second = path.join(root, 'chart.png')
  await writeFile(first, 'docx payload')
  await writeFile(second, 'png payload')

  const result = await captureDelivery({
    engine,
    session,
    event: deliveryEvent(42, 3, [first, second]),
    resolveWorkspaceId: async () => 'ws_1',
  })
  assert.deepEqual(result, { captured: 2, failed: 0 })

  const listed = await engine.list({ sort: 'name', direction: 'asc' })
  assert.equal(listed.total, 2)
  const byName = new Map(listed.items.map((item) => [item.name, item]))
  const document = byName.get('report.docx')
  const chart = byName.get('chart.png')

  assert.equal(document.source, 'agent-deliverable')
  assert.equal(document.origin.sessionId, 'session-test')
  assert.equal(document.origin.seq, 42)
  assert.equal(document.origin.turn, 3)
  assert.equal(document.origin.workspaceId, 'ws_1')
  assert.equal(document.origin.pathAtCapture, first)
  assert.equal(document.origin.index, 0)
  assert.equal(document.sourceMtime !== null, true)
  assert.equal(chart.origin.pathAtCapture, second)
  assert.equal(chart.origin.index, 1)
})

test('the same delivery event is captured once', async (t) => {
  const { root, engine } = await workspace(t)
  const file = path.join(root, 'once.txt')
  await writeFile(file, 'once')

  const event = deliveryEvent(7, 1, [file])
  await captureDelivery({ engine, session, event })
  await captureDelivery({ engine, session, event })

  assert.equal((await engine.list({})).total, 1)
  assert.equal((await engine.state()).failures.length, 0)
})

test('a missing file becomes a retryable failure and retry stores it', async (t) => {
  const { root, engine } = await workspace(t)
  const missing = path.join(root, 'late.txt')

  const first = await captureDelivery({ engine, session, event: deliveryEvent(11, 2, [missing]) })
  assert.deepEqual(first, { captured: 0, failed: 1 })

  const state = await engine.state()
  assert.equal(state.failures.length, 1)
  assert.equal(state.failures[0].path, missing)
  assert.equal(state.failures[0].origin.seq, 11)
  assert.match(state.failures[0].reason, /cannot read|ENOENT/i)

  await writeFile(missing, 'now it exists')
  const record = await engine.importPath({
    path: missing,
    source: 'agent-deliverable',
    origin: state.failures[0].origin,
    failureId: state.failures[0].id,
  })
  assert.equal(record.name, 'late.txt')
  assert.equal(record.source, 'agent-deliverable')
  assert.equal(record.origin.seq, 11)
  assert.equal((await engine.state()).failures.length, 0)
})

test('a directory named as a delivery fails instead of throwing', async (t) => {
  const { root, engine } = await workspace(t)
  const result = await captureDelivery({ engine, session, event: deliveryEvent(3, 1, [root]) })
  assert.deepEqual(result, { captured: 0, failed: 1 })
  assert.match((await engine.state()).failures[0].reason, /regular file/)
})

test('a manual save keeps the supplied source kind', async (t) => {
  const { root, engine } = await workspace(t)
  const file = path.join(root, 'manual.txt')
  await writeFile(file, 'manual')
  const record = await engine.importPath({ path: file, source: 'manual-save' })
  assert.equal(record.source, 'manual-save')
  assert.equal(record.origin, null)

  await unlink(file)
  await assert.rejects(() => engine.importPath({ path: file, source: 'manual-save' }), /cannot read/)
})
