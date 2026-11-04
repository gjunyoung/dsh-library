/**
 * Preview model: which renderer a stored record uses, how a library address is
 * spelled, and the small Markdown transform the Host performs so the Client
 * stays a thin viewer.
 *
 * Everything here is pure and filesystem-free; the HTTP layer supplies bytes.
 */

/** Which viewer the preview tab should mount. */
export const RENDERERS = ['image', 'pdf', 'office', 'markdown', 'text', 'code', 'audio', 'video', 'other']

/** Text previews stop here; larger files fall back to the download hint. */
export const MAX_TEXT_BYTES = 2 * 1024 * 1024
/** Inline HTML (Markdown) stops here for the same reason. */
export const MAX_HTML_BYTES = 1024 * 1024

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'ico', 'avif'])
const PDF_EXTENSIONS = new Set(['pdf'])
const OFFICE_EXTENSIONS = new Set(['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'odt', 'ods', 'odp'])
const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown', 'mdx'])
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus'])
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v'])
const CODE_EXTENSIONS = new Set([
  'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'json', 'jsonl', 'yaml', 'yml', 'toml', 'ini', 'conf',
  'xml', 'css', 'scss', 'less', 'sh', 'ps1', 'bat', 'cmd', 'py', 'rb', 'go', 'rs',
  'java', 'kt', 'c', 'h', 'cc', 'cpp', 'hpp', 'cs', 'php', 'sql', 'lua', 'swift', 'dart', 'vue',
  'gitignore', 'env', 'lock', 'log', 'diff', 'patch',
])
const TEXT_EXTENSIONS = new Set(['txt', 'text', 'csv', 'tsv', 'rtf', 'nfo', 'readme'])
const HTML_EXTENSIONS = new Set(['html', 'htm'])

const LANGUAGE_BY_EXTENSION = new Map([
  ['js', 'javascript'], ['mjs', 'javascript'], ['cjs', 'javascript'], ['ts', 'typescript'],
  ['tsx', 'tsx'], ['jsx', 'jsx'], ['json', 'json'], ['jsonl', 'json'], ['yaml', 'yaml'],
  ['yml', 'yaml'], ['toml', 'toml'], ['xml', 'xml'], ['html', 'html'], ['htm', 'html'],
  ['css', 'css'], ['scss', 'scss'], ['sh', 'bash'], ['ps1', 'powershell'], ['py', 'python'],
  ['rb', 'ruby'], ['go', 'go'], ['rs', 'rust'], ['java', 'java'], ['kt', 'kotlin'],
  ['c', 'c'], ['h', 'c'], ['cc', 'cpp'], ['cpp', 'cpp'], ['hpp', 'cpp'], ['cs', 'csharp'],
  ['php', 'php'], ['sql', 'sql'], ['lua', 'lua'], ['swift', 'swift'], ['dart', 'dart'],
  ['md', 'markdown'], ['markdown', 'markdown'], ['csv', 'csv'], ['tsv', 'tsv'],
])

/** Lower-case extension, or an empty string. */
export function extensionOfName(name) {
  const base = String(name ?? '')
  const cut = base.lastIndexOf('.')
  if (cut <= 0 || cut === base.length - 1) return ''
  return base.slice(cut + 1).toLowerCase()
}

/** Which viewer handles one stored record. */
export function rendererFor(record) {
  const ext = String(record?.ext ?? '').toLowerCase() || extensionOfName(record?.name)
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (PDF_EXTENSIONS.has(ext)) return 'pdf'
  if (OFFICE_EXTENSIONS.has(ext)) return 'office'
  if (MARKDOWN_EXTENSIONS.has(ext)) return 'markdown'
  if (HTML_EXTENSIONS.has(ext)) return 'html'
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio'
  if (VIDEO_EXTENSIONS.has(ext)) return 'video'
  if (CODE_EXTENSIONS.has(ext)) return 'code'
  if (TEXT_EXTENSIONS.has(ext)) return 'text'
  return 'other'
}

/** Office conversion needs a real Office extension, not the Markdown/CSV family. */
export function officeExtensionOf(record) {
  const ext = String(record?.ext ?? '').toLowerCase() || extensionOfName(record?.name)
  if (!OFFICE_EXTENSIONS.has(ext)) return null
  if (ext === 'odt' || ext === 'ods' || ext === 'odp') return null
  return ext
}

/** Syntax label shown above code previews. */
export function languageOf(name) {
  return LANGUAGE_BY_EXTENSION.get(extensionOfName(name)) ?? ''
}

/** Renderers that need the bytes as text through the Host. */
export function needsText(renderer) {
  return renderer === 'markdown' || renderer === 'text' || renderer === 'code'
}

/** Renderers that need the stored bytes streamed into a media element. */
export function needsStream(renderer) {
  return renderer === 'image' || renderer === 'pdf' || renderer === 'audio' || renderer === 'video'
}

// --- addresses ---------------------------------------------------------------

const ADDRESS_PREFIX = 'dsh-resource://library/file/'

/**
 * The tab address for one record: `dsh-resource://library/file/<id>/<name>`.
 * The name keeps the tab chip readable without the tab having to load anything.
 */
export function libraryAddress(record) {
  return `${ADDRESS_PREFIX}${encodeURIComponent(record.id)}/${encodeURIComponent(record.name)}`
}

/** Parse a library tab address back into its record id and display name. */
export function parseLibraryAddress(address) {
  const text = String(address ?? '')
  if (!text.startsWith(ADDRESS_PREFIX)) return null
  const rest = text.slice(ADDRESS_PREFIX.length)
  const slash = rest.indexOf('/')
  const rawId = slash === -1 ? rest : rest.slice(0, slash)
  const rawName = slash === -1 ? '' : rest.slice(slash + 1)
  let id
  let name
  try {
    id = decodeURIComponent(rawId)
    name = rawName === '' ? '' : decodeURIComponent(rawName)
  } catch {
    return null
  }
  if (!/^lic_[A-Za-z0-9]+$/.test(id)) return null
  return { id, name }
}

// --- markdown ----------------------------------------------------------------

/** Escape the five HTML-significant characters; the renderer never trusts input. */
export function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function inline(text) {
  let html = escapeHtml(text)
  // Inline code first so its content is not treated as emphasis.
  const codes = []
  html = html.replace(/`([^`]+)`/g, (_, code) => {
    codes.push(`<code>${code}</code>`)
    return `\u0000${codes.length - 1}\u0000`
  })
  html = html
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, (_, label, href) => `<span class="dshlib-link" title="${href}">${label}</span>`)
  return html.replace(/\u0000(\d+)\u0000/g, (_, index) => codes[Number(index)])
}

function renderTable(lines) {
  const rows = lines.map((line) =>
    line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim()),
  )
  if (rows.length < 2) return null
  const head = rows[0]
  const body = rows.slice(2)
  const html = [
    '<table class="dshlib-md-table"><thead><tr>',
    ...head.map((cell) => `<th>${inline(cell)}</th>`),
    '</tr></thead><tbody>',
  ]
  for (const row of body) {
    html.push('<tr>', ...row.map((cell) => `<td>${inline(cell)}</td>`), '</tr>')
  }
  html.push('</tbody></table>')
  return html.join('')
}

/**
 * A deliberately small Markdown subset: headings, fenced code, block quotes,
 * lists, tables, rules, and the common inline spans. Raw HTML is escaped, so
 * the output only ever contains the tags produced here.
 */
export function markdownToHtml(markdown) {
  const text = String(markdown ?? '').replace(/\r\n?/g, '\n')
  const lines = text.split('\n')
  const out = []
  let index = 0
  let paragraph = []

  const flushParagraph = () => {
    if (paragraph.length === 0) return
    out.push(`<p>${inline(paragraph.join(' '))}</p>`)
    paragraph = []
  }

  while (index < lines.length) {
    const line = lines[index]

    const fence = /^```\s*([\w-]*)\s*$/.exec(line)
    if (fence !== null) {
      flushParagraph()
      const language = fence[1]
      const body = []
      index += 1
      while (index < lines.length && !/^```\s*$/.test(lines[index])) {
        body.push(lines[index])
        index += 1
      }
      index += 1
      out.push(
        `<pre class="dshlib-md-code"${language === '' ? '' : ` data-language="${escapeHtml(language)}"`}><code>${escapeHtml(body.join('\n'))}</code></pre>`,
      )
      continue
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading !== null) {
      flushParagraph()
      const level = heading[1].length
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`)
      index += 1
      continue
    }

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushParagraph()
      out.push('<hr/>')
      index += 1
      continue
    }

    if (/^>\s?/.test(line)) {
      flushParagraph()
      const quoted = []
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quoted.push(lines[index].replace(/^>\s?/, ''))
        index += 1
      }
      out.push(`<blockquote>${inline(quoted.join(' '))}</blockquote>`)
      continue
    }

    const listItem = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line)
    if (listItem !== null) {
      flushParagraph()
      const ordered = /^\s*\d+[.)]\s+/.test(line)
      const items = []
      while (index < lines.length) {
        const current = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/.exec(lines[index])
        if (current === null) break
        items.push(`<li>${inline(current[1])}</li>`)
        index += 1
      }
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`)
      continue
    }

    if (/^\s*\|/.test(line) && index + 1 < lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[index + 1])) {
      flushParagraph()
      const block = []
      while (index < lines.length && /^\s*\|/.test(lines[index])) {
        block.push(lines[index])
        index += 1
      }
      out.push(renderTable(block) ?? `<p>${inline(block.join(' '))}</p>`)
      continue
    }

    if (line.trim() === '') {
      flushParagraph()
      index += 1
      continue
    }

    paragraph.push(line.trim())
    index += 1
  }

  flushParagraph()
  return out.join('\n')
}
