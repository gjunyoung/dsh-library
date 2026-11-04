/**
 * Pure library model helpers.
 *
 * Everything here is deterministic and filesystem-free so the quality gate can
 * unit-test classification, naming, sorting, filtering, pagination and the
 * reconciliation plan without touching a disk.
 */

/** Category ids shown in the page's navigation row. */
export const CATEGORIES = ['all', 'document', 'image', 'video', 'audio', 'favorite']

/** Source ids accepted by the source filter. */
export const SOURCES = ['all', 'user', 'agent']

/** Source values stored on a record, mapped to the two filter buckets. */
const SOURCE_BUCKETS = {
  'upload-library': 'user',
  'upload-chat': 'user',
  'manual-save': 'user',
  'agent-deliverable': 'agent',
}

const KIND_BY_EXTENSION = new Map([
  ['pdf', 'document'],
  ['doc', 'document'],
  ['docx', 'document'],
  ['md', 'document'],
  ['html', 'document'],
  ['htm', 'document'],
  ['markdown', 'document'],
  ['txt', 'document'],
  ['rtf', 'document'],
  ['xls', 'document'],
  ['xlsx', 'document'],
  ['csv', 'document'],
  ['tsv', 'document'],
  ['ppt', 'document'],
  ['pptx', 'document'],
  ['odt', 'document'],
  ['ods', 'document'],
  ['odp', 'document'],
  ['png', 'image'],
  ['jpg', 'image'],
  ['jpeg', 'image'],
  ['webp', 'image'],
  ['gif', 'image'],
  ['bmp', 'image'],
  ['svg', 'image'],
  ['ico', 'image'],
  ['mp4', 'video'],
  ['mov', 'video'],
  ['webm', 'video'],
  ['mkv', 'video'],
  ['avi', 'video'],
  ['mp3', 'audio'],
  ['wav', 'audio'],
  ['m4a', 'audio'],
  ['aac', 'audio'],
  ['flac', 'audio'],
  ['ogg', 'audio'],
])

const MIME_BY_EXTENSION = new Map([
  ['pdf', 'application/pdf'],
  ['doc', 'application/msword'],
  ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['md', 'text/markdown'],
  ['markdown', 'text/markdown'],
  ['txt', 'text/plain'],
  ['html', 'text/html'],
  ['htm', 'text/html'],
  ['css', 'text/css'],
  ['js', 'text/javascript'],
  ['json', 'application/json'],
  ['xml', 'text/xml'],
  ['csv', 'text/csv'],
  ['tsv', 'text/tab-separated-values'],
  ['xls', 'application/vnd.ms-excel'],
  ['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ['ppt', 'application/vnd.ms-powerpoint'],
  ['pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  ['png', 'image/png'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['webp', 'image/webp'],
  ['gif', 'image/gif'],
  ['bmp', 'image/bmp'],
  ['svg', 'image/svg+xml'],
  ['ico', 'image/x-icon'],
  ['mp4', 'video/mp4'],
  ['mov', 'video/quicktime'],
  ['webm', 'video/webm'],
  ['mp3', 'audio/mpeg'],
  ['wav', 'audio/wav'],
  ['m4a', 'audio/mp4'],
  ['flac', 'audio/flac'],
  ['ogg', 'audio/ogg'],
])

/** Trimmed, lower-cased extension without the dot. */
export function extensionOf(name) {
  const base = String(name ?? '')
  const cut = base.lastIndexOf('.')
  if (cut <= 0 || cut === base.length - 1) return ''
  return base.slice(cut + 1).toLowerCase()
}

/** Storage class of a file, from its extension. */
export function kindOf(name) {
  const extension = extensionOf(name)
  return KIND_BY_EXTENSION.get(extension) ?? 'other'
}

/** Content type used when serving the stored bytes. */
export function mimeOf(name) {
  return MIME_BY_EXTENSION.get(extensionOf(name)) ?? 'application/octet-stream'
}

/** The two-bucket source filter a stored source value projects onto. */
export function sourceBucket(source) {
  return SOURCE_BUCKETS[source] ?? 'user'
}

/**
 * Make a user-supplied name safe to display and to synthesize `(2)` variants
 * from: no directory separators, no control characters, no reserved endings.
 */
export function sanitizeName(name) {
  const raw = String(name ?? '')
  const leaf = raw.split(/[\\/]/).pop() ?? ''
  const cleaned = leaf
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>:"|?*]/g, '_')
    .trim()
    .replace(/[. ]+$/, '')
  if (cleaned === '') return 'untitled'
  return cleaned.length > 180 ? cleaned.slice(0, 180) : cleaned
}

/** Split a name into its display stem and extension, keeping the last dot. */
function splitName(name) {
  const extension = extensionOf(name)
  if (extension === '') return { stem: name, suffix: '' }
  return { stem: name.slice(0, name.length - extension.length - 1), suffix: `.${extension}` }
}

/**
 * First name not already taken: `report.pdf`, `report (2).pdf`, `report (3).pdf`.
 * Matching is case-insensitive, as the page shows names, not paths.
 */
export function uniqueName(name, taken) {
  const candidate = sanitizeName(name)
  const used = new Set(Array.from(taken ?? [], (entry) => String(entry).toLowerCase()))
  if (!used.has(candidate.toLowerCase())) return candidate
  const { stem, suffix } = splitName(candidate)
  for (let index = 2; index < 10000; index += 1) {
    const next = `${stem} (${index})${suffix}`
    if (!used.has(next.toLowerCase())) return next
  }
  return `${stem} (${Date.now()})${suffix}`
}

/** Collection names carry this many characters at most. */
export const COLLECTION_NAME_MAX = 40

/**
 * Validate one collection name against the product rules: trimmed, 1–40
 * characters, no slash, unique among the other collections.
 * @param input - raw user input.
 * @param existing - names already in use (the collection being renamed excluded).
 * @returns the normalized name or a stable failure code.
 */
export function validateCollectionName(input, existing = []) {
  const name = String(input ?? '').trim()
  if (name === '') return { ok: false, code: 'empty' }
  if (name.length > COLLECTION_NAME_MAX) return { ok: false, code: 'too-long' }
  if (name.includes('/')) return { ok: false, code: 'slash' }
  const used = new Set(Array.from(existing ?? [], (entry) => String(entry).toLowerCase()))
  if (used.has(name.toLowerCase())) return { ok: false, code: 'duplicate' }
  return { ok: true, name }
}

/** Sort collections by their recorded order, then by creation time. */
export function sortCollections(collections) {
  return Array.from(collections ?? []).sort((left, right) => {
    const delta = (left.order ?? 0) - (right.order ?? 0)
    if (delta !== 0) return delta
    return timeValue(left.createdAt) - timeValue(right.createdAt)
  })
}

const collator = new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' })

/** Natural order with Chinese pinyin collation, as the product requires. */
export function compareNames(left, right) {
  return collator.compare(String(left ?? ''), String(right ?? ''))
}

/** The date a card shows: the capture-time snapshot, else when it entered the library. */
export function displayDate(record) {
  return record?.sourceMtime ?? record?.createdAt ?? ''
}

function timeValue(value) {
  const time = Date.parse(value ?? '')
  return Number.isFinite(time) ? time : 0
}

/**
 * Sort a copy of `items`. `field` is `name`, `size` or `date`; `direction` is
 * `asc` or `desc`, and the natural-order tiebreaker keeps the result stable.
 */
export function sortItems(items, field = 'date', direction = 'desc') {
  const sign = direction === 'asc' ? 1 : -1
  const list = Array.from(items ?? [])
  list.sort((left, right) => {
    let delta = 0
    if (field === 'name') delta = compareNames(left.name, right.name)
    else if (field === 'size') delta = (left.bytes ?? 0) - (right.bytes ?? 0)
    else delta = timeValue(displayDate(left)) - timeValue(displayDate(right))
    if (delta !== 0) return delta * sign
    return compareNames(left.name, right.name)
  })
  return list
}

/** Whether one record belongs to a category + source + text filter. */
export function matchesQuery(record, query = {}) {
  const category = query.category ?? 'all'
  if (category === 'favorite') {
    if (record.favorited !== true) return false
    if (query.collectionId === 'uncategorized') {
      if ((record.collectionId ?? null) !== null) return false
    } else if (query.collectionId !== undefined && query.collectionId !== null) {
      if ((record.collectionId ?? null) !== query.collectionId) return false
    }
  } else if (category !== 'all') {
    if (record.kind !== category) return false
  }

  const source = query.source ?? 'all'
  if (source !== 'all' && sourceBucket(record.source) !== source) return false

  const text = String(query.q ?? '').trim().toLowerCase()
  if (text !== '' && !String(record.name ?? '').toLowerCase().includes(text)) return false

  return true
}

/** One page of a filtered result set, with the cursor the page needs. */
export function paginate(items, offset = 0, limit = 100) {
  const start = Math.max(0, Math.trunc(offset) || 0)
  const size = Math.max(1, Math.trunc(limit) || 100)
  const slice = items.slice(start, start + size)
  const next = start + slice.length
  return { items: slice, total: items.length, nextOffset: next < items.length ? next : null }
}

/**
 * Compare the index against the bytes on disk.
 * @param records - index records.
 * @param blobKeys - `${sha}.bin`-style keys actually present; only the sha prefix matters.
 * @returns missing blobs (records to mark broken) and unreferenced blobs (to move to orphan/).
 */
export function buildReconcilePlan(records, blobKeys) {
  const present = new Set(Array.from(blobKeys ?? [], (key) => String(key).replace(/\.bin$/i, '').toLowerCase()))
  const referenced = new Set()
  const broken = []
  for (const record of records ?? []) {
    const sha = String(record.sha256 ?? '').toLowerCase()
    referenced.add(sha)
    if (!present.has(sha)) broken.push(record.id)
  }
  const orphans = Array.from(present).filter((sha) => !referenced.has(sha))
  return { broken, orphans }
}

/** Total bytes a delete is about to release, once refcounts reach zero. */
export function summarizeDelete(records) {
  let count = 0
  let bytes = 0
  for (const record of records ?? []) {
    count += 1
    const refs = record.refs ?? 1
    if (refs <= 1) bytes += record.bytes ?? 0
  }
  return { count, bytes }
}

/** Human size used by confirmations and cards; keeps one decimal above 1 KB. */
export function formatSize(bytes) {
  const value = Number(bytes) || 0
  if (value < 1024) return `${value} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let size = value / 1024
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit += 1
  }
  return `${size >= 10 ? Math.round(size) : size.toFixed(1)} ${units[unit]}`
}
