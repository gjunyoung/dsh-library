import assert from 'node:assert/strict'
import test from 'node:test'

import {
  escapeHtml,
  languageOf,
  libraryAddress,
  markdownToHtml,
  needsStream,
  needsText,
  officeExtensionOf,
  parseLibraryAddress,
  rendererFor,
} from '../lib/render.js'

test('every format family maps to one renderer', () => {
  const cases = [
    ['photo.PNG', 'image'],
    ['scan.pdf', 'pdf'],
    ['报告.docx', 'office'],
    ['deck.pptx', 'office'],
    ['sheet.xlsx', 'office'],
    ['notes.md', 'markdown'],
    ['readme.markdown', 'markdown'],
    ['data.csv', 'text'],
    ['plain.txt', 'text'],
    ['app.js', 'code'],
    ['config.json', 'code'],
    ['script.ps1', 'code'],
    ['track.mp3', 'audio'],
    ['voice.m4a', 'audio'],
    ['clip.mp4', 'video'],
    ['movie.mkv', 'video'],
    ['archive.zip', 'other'],
    ['no-extension', 'other'],
  ]
  for (const [name, expected] of cases) {
    assert.equal(rendererFor({ name }), expected, name)
  }
  // The stored extension wins over a renamed display name.
  assert.equal(rendererFor({ name: 'renamed.bin', ext: 'png' }), 'image')
  assert.equal(officeExtensionOf({ name: 'a.docx' }), 'docx')
  assert.equal(officeExtensionOf({ name: 'a.odt' }), null)
  assert.equal(officeExtensionOf({ name: 'a.txt' }), null)
  assert.equal(languageOf('app.ts'), 'typescript')
  assert.equal(languageOf('unknown.zzz'), '')
  assert.equal(needsText('markdown'), true)
  assert.equal(needsText('image'), false)
  assert.equal(needsStream('video'), true)
  assert.equal(needsStream('other'), false)
})

test('library addresses round-trip and reject foreign input', () => {
  const record = { id: 'lic_ab12cd34', name: 'Q3 报告 (2).pdf' }
  const address = libraryAddress(record)
  assert.equal(address, 'dsh-resource://library/file/lic_ab12cd34/Q3%20%E6%8A%A5%E5%91%8A%20(2).pdf')
  assert.deepEqual(parseLibraryAddress(address), { id: 'lic_ab12cd34', name: 'Q3 报告 (2).pdf' })

  assert.deepEqual(parseLibraryAddress('dsh-resource://library/file/lic_ff'), { id: 'lic_ff', name: '' })
  assert.equal(parseLibraryAddress('dsh-resource://file/session/s1/x.pdf'), null)
  assert.equal(parseLibraryAddress('dsh-resource://library/file/not-an-id/x'), null)
  assert.equal(parseLibraryAddress('dsh-resource://library/file/%ZZ'), null)
  assert.equal(parseLibraryAddress(undefined), null)
})

test('raw html is escaped, never passed through', () => {
  assert.equal(escapeHtml('<script>alert("x")</script>'), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;')
  const html = markdownToHtml('<img src=x onerror=alert(1)>')
  assert.ok(!html.includes('<img'))
  assert.ok(html.includes('&lt;img'))
})

test('markdown covers the supported block and inline shapes', () => {
  const html = markdownToHtml(
    [
      '# Title',
      '',
      'Some **bold**, *italic*, ~~gone~~ and `code` text.',
      '',
      '- one',
      '- two',
      '',
      '1. first',
      '2. second',
      '',
      '> quoted line',
      '',
      '```js',
      'const a = 1 < 2',
      '```',
      '',
      '| a | b |',
      '| --- | --- |',
      '| 1 | 2 |',
      '',
      '---',
      '',
      '[label](https://example.com)',
    ].join('\n'),
  )

  assert.ok(html.includes('<h1>Title</h1>'))
  assert.ok(html.includes('<strong>bold</strong>'))
  assert.ok(html.includes('<em>italic</em>'))
  assert.ok(html.includes('<del>gone</del>'))
  assert.ok(html.includes('<code>code</code>'))
  assert.ok(html.includes('<ul><li>one</li><li>two</li></ul>'))
  assert.ok(html.includes('<ol><li>first</li><li>second</li></ol>'))
  assert.ok(html.includes('<blockquote>quoted line</blockquote>'))
  assert.ok(html.includes('data-language="js"'))
  assert.ok(html.includes('const a = 1 &lt; 2'))
  assert.ok(html.includes('<table class="dshlib-md-table">'))
  assert.ok(html.includes('<th>a</th>'))
  assert.ok(html.includes('<td>2</td>'))
  assert.ok(html.includes('<hr/>'))
  // Links render as inert spans so a preview can never navigate the app.
  assert.ok(html.includes('<span class="dshlib-link" title="https://example.com">label</span>'))
  assert.ok(!html.includes('<a '))
})

test('markdown keeps paragraphs and closes an unterminated fence', () => {
  const html = markdownToHtml('first line\nsecond line\n\n```\ncode')
  assert.ok(html.includes('<p>first line second line</p>'))
  assert.ok(html.includes('<pre class="dshlib-md-code"><code>code</code></pre>'))
  assert.equal(markdownToHtml(''), '')
})

test('html files get their own renderer', () => {
  assert.equal(rendererFor({ name: 'page.html', ext: 'html' }), 'html')
  assert.equal(rendererFor({ name: 'page.htm', ext: 'htm' }), 'html')
  assert.equal(rendererFor({ name: 'app.js', ext: 'js' }), 'code')
  assert.equal(rendererFor({ name: 'notes.md', ext: 'md' }), 'markdown')
})