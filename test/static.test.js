/**
 * L1 static checks over the delivered bundle: manifest wiring, locale metadata,
 * the client bundle contract, and the icon resource.
 */
import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function readJson(relative) {
  return JSON.parse(await readFile(path.join(root, relative), 'utf8'))
}

test('manifest wires the bundle, the client half and its resources', async () => {
  const manifest = await readJson('package.json')
  for (const key of ['.', './client', './locale/*.json', './icon']) {
    assert.ok(Object.hasOwn(manifest.exports, key), `exports.${key}`)
  }
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(manifest.dsh.client.platform, 'web')
  assert.ok(Array.isArray(manifest.dsh.client.inject))

  const patch = await readFile(path.join(root, 'cordis.patch.yml'), 'utf8')
  assert.ok(patch.includes(manifest.name), 'patch names the package')
  assert.match(patch, /- insert:/)

  for (const file of manifest.files) {
    const concrete = file.includes('*') ? undefined : file
    if (concrete === undefined) continue
    await assert.doesNotReject(stat(path.join(root, concrete)), `files entry ${file}`)
  }
})

test('both locales carry display metadata', async () => {
  for (const locale of ['en', 'zh']) {
    const dict = await readJson(`locale/${locale}.json`)
    assert.equal(typeof dict.meta?.title, 'string')
    assert.equal(typeof dict.meta?.description, 'string')
    assert.ok(dict.meta.title.length > 0 && dict.meta.description.length > 0)
  }
})

test('the client bundle only requires the shared React module', async () => {
  const manifest = await readJson('package.json')
  const source = await readFile(path.join(root, 'client.js'), 'utf8')
  assert.ok(source.includes('window.__ModuleLoader__.load'))
  assert.ok(source.includes(`id: '${manifest.name}'`), 'loader id equals the package name')

  const requests = [...source.matchAll(/require\((['"])([^'"]+)\1\)/g)].map((match) => match[2])
  assert.deepEqual(requests, ['react'])
  assert.doesNotMatch(source, /\bfrom\s+['"]@deepseek-ai\//)
  assert.doesNotMatch(source, /\bimport\s+[^;]*@deepseek-ai\//)
})

test('the icon is a bounded, parseable svg', async () => {
  const file = path.join(root, 'icon.svg')
  const text = await readFile(file, 'utf8')
  assert.ok(text.trimStart().startsWith('<svg'))
  assert.match(text, /viewBox="[^"]+"/)
  assert.doesNotMatch(text, /<script/i)
  assert.ok((await stat(file)).size <= 256 * 1024)
})
