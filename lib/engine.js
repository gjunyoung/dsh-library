/**
 * Content-addressed library storage.
 *
 * Layout (see the plan, section 6):
 *   <root>/index.json          metadata; refcounts live in `blobs`
 *   <root>/index.backup.json   previous good metadata
 *   <root>/blobs/<aa>/<sha>.bin
 *   <root>/thumbs/             reserved; v1 writes nothing
 *   <root>/tmp/                upload staging
 *   <root>/orphan/             bytes with no index record
 *
 * Bytes are written once per distinct SHA-256 and released when the last record
 * referencing them is deleted.
 */
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { cp, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'

import { libraryAddress } from './render.js'
import {
  buildReconcilePlan,
  displayDate,
  extensionOf,
  kindOf,
  matchesQuery,
  mimeOf,
  paginate,
  sanitizeName,
  sortCollections,
  sortItems,
  uniqueName,
  validateCollectionName,
} from './model.js'

export const SCHEMA = 1

/** A library failure carrying a stable machine code. */
export class LibraryError extends Error {
  constructor(code, message, details) {
    super(message)
    this.name = 'LibraryError'
    this.code = code
    this.details = details
  }
}

function emptyIndex() {
  return { schema: SCHEMA, updatedAt: new Date().toISOString(), files: [], blobs: {}, collections: [], failures: [] }
}

function recordId() {
  const random = Math.random().toString(36).slice(2, 10)
  return `lic_${random}${Date.now().toString(36).slice(-4)}`
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

export class LibraryEngine {
  /** @param root - absolute library directory. */
  constructor(root, options = {}) {
    this.root = path.resolve(root)
    this.maxUploadBytes = options.maxUploadBytes ?? 200 * 1024 * 1024
    this.pageSize = options.pageSize ?? 100
    this.index = emptyIndex()
    this.indexError = null
    this.ready = null
  }

  get blobsDir() {
    return path.join(this.root, 'blobs')
  }

  get tmpDir() {
    return path.join(this.root, 'tmp')
  }

  get orphanDir() {
    return path.join(this.root, 'orphan')
  }

  /** Create the layout and load the index once; safe to call repeatedly. */
  init() {
    this.ready ??= this.#load()
    return this.ready
  }

  async #load() {
    for (const dir of [this.root, this.blobsDir, this.tmpDir, this.orphanDir, path.join(this.root, 'thumbs')]) {
      await mkdir(dir, { recursive: true })
    }
    const loaded = await this.#readIndex()
    this.index = loaded.index
    if (loaded.recovered) {
      // A missing or unreadable index must not be read as "every byte on disk is
      // an orphan": adopt the stored bytes first, then reconcile against them.
      const adopted = await this.#adoptBlobs()
      if (loaded.corrupt) this.indexError ??= { file: 'index.json', reason: 'index unreadable' }
      else if (adopted > 0) this.indexError = { file: 'index.json', reason: 'index rebuilt from stored bytes' }
      if (adopted > 0 || loaded.corrupt) await this.#persist()
      return this
    }
    await this.reconcile()
    return this
  }

  async #readIndex() {
    const primary = path.join(this.root, 'index.json')
    const backup = path.join(this.root, 'index.backup.json')
    let corrupt = false
    for (const [file, label] of [
      [primary, 'primary'],
      [backup, 'backup'],
    ]) {
      try {
        const text = await readFile(file, 'utf8')
        const parsed = JSON.parse(text)
        if (parsed?.schema !== SCHEMA || !Array.isArray(parsed.files)) {
          throw new LibraryError('index-schema', `unexpected index schema in ${label}`)
        }
        return {
          index: {
            schema: SCHEMA,
            updatedAt: parsed.updatedAt ?? new Date().toISOString(),
            files: parsed.files.map((record) => ({ ...record, refs: record.refs ?? 1 })),
            blobs: parsed.blobs ?? {},
            collections: Array.isArray(parsed.collections) ? parsed.collections : [],
            failures: Array.isArray(parsed.failures) ? parsed.failures : [],
          },
          recovered: false,
          corrupt: false,
        }
      } catch (error) {
        if (error?.code === 'ENOENT') continue
        corrupt = true
        this.indexError = { file: path.basename(file), reason: String(error?.message ?? error) }
      }
    }
    return { index: emptyIndex(), recovered: true, corrupt }
  }

  async #persist() {
    this.index.updatedAt = new Date().toISOString()
    const primary = path.join(this.root, 'index.json')
    const backup = path.join(this.root, 'index.backup.json')
    const staged = path.join(this.root, `index.${process.pid}.tmp`)
    await writeFile(staged, JSON.stringify(this.index, null, 2), 'utf8')
    try {
      await stat(primary)
      await writeFile(backup, await readFile(primary, 'utf8'), 'utf8').catch(() => {})
    } catch {
      // First write: there is nothing to back up yet.
    }
    await rename(staged, primary)
  }

  blobRelative(sha) {
    return path.join(sha.slice(0, 2), `${sha}.bin`)
  }

  blobPath(sha) {
    return path.join(this.blobsDir, this.blobRelative(sha))
  }

  /** Every blob file present on disk, as `<sha>.bin` names. */
  async #blobKeys() {
    const keys = []
    let shards
    try {
      shards = await readdir(this.blobsDir, { withFileTypes: true })
    } catch {
      return keys
    }
    for (const shard of shards) {
      if (!shard.isDirectory()) continue
      const entries = await readdir(path.join(this.blobsDir, shard.name)).catch(() => [])
      for (const entry of entries) if (entry.toLowerCase().endsWith('.bin')) keys.push(entry)
    }
    return keys
  }

  /** Records as the page sees them: derived fields filled in, refcount attached. */
  #publicRecord(record) {
    const blob = this.index.blobs[record.sha256]
    return {
      ...record,
      refs: blob?.refs ?? record.refs ?? 1,
      address: libraryAddress(record),
      displayDate: displayDate(record),
      mime: record.mime ?? mimeOf(record.name),
      broken: record.broken === true,
    }
  }

  /** Query the library. */
  async list(query = {}) {
    await this.init()
    const filtered = this.index.files.filter((record) => matchesQuery(record, query))
    const sorted = sortItems(
      filtered.map((record) => this.#publicRecord(record)),
      query.sort ?? 'date',
      query.direction ?? 'desc',
    )
    const page = paginate(sorted, query.offset ?? 0, Math.min(query.limit ?? this.pageSize, 500))
    return { ...page, category: query.category ?? 'all' }
  }

  /** Aggregate counts for the page header and the settings summary. */
  async state() {
    await this.init()
    const files = this.index.files.length
    const bytes = this.index.files.reduce((total, record) => total + (record.bytes ?? 0), 0)
    const broken = this.index.files.filter((record) => record.broken === true).length
    return {
      root: this.root,
      files,
      bytes,
      broken,
      blobs: Object.keys(this.index.blobs).length,
      collections: this.index.collections.length,
      failures: this.index.failures ?? [],
      indexError: this.indexError,
      maxUploadBytes: this.maxUploadBytes,
    }
  }

  async #writeRecord({ name, source, origin, sourceMtime, bytes, sha, mime }) {
    const taken = this.index.files.map((record) => record.name)
    const display = uniqueName(name, taken)
    const now = new Date().toISOString()
    const record = {
      schema: SCHEMA,
      id: recordId(),
      name: display,
      ext: extensionOf(display),
      kind: kindOf(display),
      mime: mime ?? mimeOf(display),
      bytes,
      sha256: sha,
      blob: this.blobRelative(sha).replace(/\\/g, '/'),
      source,
      origin: origin ?? null,
      createdAt: now,
      sourceMtime: sourceMtime ?? null,
      favorited: false,
      collectionId: null,
      thumb: { status: 'none' },
      broken: false,
    }
    const known = this.index.blobs[sha]
    if (known === undefined) this.index.blobs[sha] = { bytes, refs: 1 }
    else {
      known.refs += 1
      known.bytes = bytes
    }
    this.index.files.push(record)
    await this.#persist()
    return this.#publicRecord(record)
  }

  /** Store one complete buffer, publishing one record (deduplicating bytes). */
  async addBytes({ name, bytes, source = 'upload-library', origin, sourceMtime }) {
    await this.init()
    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)
    if (buffer.length > this.maxUploadBytes) {
      throw new LibraryError('too-large', `${sanitizeName(name)} exceeds the ${this.maxUploadBytes} byte limit`)
    }
    const sha = sha256(buffer)
    if (this.index.blobs[sha] === undefined) {
      const target = this.blobPath(sha)
      await mkdir(path.dirname(target), { recursive: true })
      const staged = path.join(this.tmpDir, `${sha}.part`)
      await writeFile(staged, buffer)
      await rename(staged, target)
    }
    return this.#writeRecord({
      name: sanitizeName(name),
      source,
      origin,
      sourceMtime,
      bytes: buffer.length,
      sha,
      mime: mimeOf(name),
    })
  }

  /**
   * Stream one upload into staging while hashing it, then commit.
   * A blob that already exists discards the staged copy (deduplication).
   */
  async addStream({ name, stream, source = 'upload-library', origin, sourceMtime, declaredBytes }) {
    await this.init()
    if (Number.isFinite(declaredBytes) && declaredBytes > this.maxUploadBytes) {
      throw new LibraryError('too-large', `${sanitizeName(name)} exceeds the ${this.maxUploadBytes} byte limit`)
    }
    const safe = sanitizeName(name)
    const staged = path.join(this.tmpDir, `${recordId()}.part`)
    const hash = createHash('sha256')
    let size = 0
    try {
      await pipeline(
        stream,
        async function* (source) {
          for await (const chunk of source) {
            size += chunk.length
            if (size > this.maxUploadBytes) {
              throw new LibraryError('too-large', `${safe} exceeds the ${this.maxUploadBytes} byte limit`)
            }
            hash.update(chunk)
            yield chunk
          }
        }.bind(this),
        createWriteStream(staged),
      )
    } catch (error) {
      await rm(staged, { force: true })
      throw error
    }

    const sha = hash.digest('hex')
    if (this.index.blobs[sha] === undefined) {
      const target = this.blobPath(sha)
      await mkdir(path.dirname(target), { recursive: true })
      await rename(staged, target)
    } else {
      await rm(staged, { force: true })
    }
    return this.#writeRecord({ name: safe, source, origin, sourceMtime, bytes: size, sha, mime: mimeOf(safe) })
  }

  /** Delete records; bytes are released when the last reference goes away. */
  async remove(ids) {
    await this.init()
    const wanted = new Set(Array.from(ids ?? []))
    const kept = []
    const deleted = []
    let releasedBytes = 0
    for (const record of this.index.files) {
      if (!wanted.has(record.id)) {
        kept.push(record)
        continue
      }
      deleted.push(record.id)
      const blob = this.index.blobs[record.sha256]
      if (blob === undefined) continue
      blob.refs -= 1
      if (blob.refs <= 0) {
        releasedBytes += blob.bytes ?? record.bytes ?? 0
        delete this.index.blobs[record.sha256]
        await rm(this.blobPath(record.sha256), { force: true })
      }
    }
    this.index.files = kept
    if (deleted.length > 0) await this.#persist()
    return { deleted, releasedBytes }
  }

  /** Update favorite state, collection membership or display name. */
  async update(ids, patch = {}) {
    await this.init()
    const wanted = new Set(Array.from(ids ?? []))
    const updated = []
    const taken = this.index.files.map((record) => record.name)
    for (const record of this.index.files) {
      if (!wanted.has(record.id)) continue
      if (typeof patch.favorited === 'boolean') {
        record.favorited = patch.favorited
        if (!record.favorited) record.collectionId = null
      }
      if (patch.collectionId !== undefined) {
        if (patch.collectionId === null) {
          record.collectionId = null
        } else if (this.index.collections.some((collection) => collection.id === patch.collectionId)) {
          record.collectionId = patch.collectionId
          record.favorited = true
        } else {
          throw new LibraryError('unknown-collection', `no collection ${patch.collectionId}`)
        }
      }
      if (typeof patch.name === 'string' && patch.name.trim() !== '') {
        const others = taken.filter((name) => name !== record.name)
        const next = uniqueName(patch.name, others)
        record.name = next
        record.ext = extensionOf(next)
        record.kind = kindOf(next)
        record.mime = mimeOf(next)
      }
      updated.push(record.id)
    }
    if (updated.length > 0) await this.#persist()
    return { updated, items: this.index.files.filter((record) => updated.includes(record.id)).map((record) => this.#publicRecord(record)) }
  }

  /** One record by id. */
  async get(id) {
    await this.init()
    const record = this.index.files.find((entry) => entry.id === id)
    return record === undefined ? undefined : this.#publicRecord(record)
  }

  /** Collections as the page shows them, with the favorite count of each. */
  async listCollections() {
    await this.init()
    const collections = sortCollections(this.index.collections).map((collection) => ({
      ...collection,
      count: this.index.files.filter((record) => record.collectionId === collection.id).length,
    }))
    const unfiled = this.index.files.filter((record) => record.favorited === true && (record.collectionId ?? null) === null).length
    return { collections, unfiled }
  }

  /** Create one collection; names are validated here as well as at the wire. */
  async createCollection(rawName) {
    await this.init()
    const validation = validateCollectionName(rawName, this.index.collections.map((entry) => entry.name))
    if (validation.ok !== true) throw new LibraryError(`collection-${validation.code}`, validation.code)
    const collection = {
      id: `col_${Math.random().toString(36).slice(2, 10)}`,
      name: validation.name,
      order: this.index.collections.length,
      createdAt: new Date().toISOString(),
    }
    this.index.collections = [...this.index.collections, collection]
    await this.#persist()
    return collection
  }

  /** Rename one collection in place. */
  async renameCollection(id, rawName) {
    await this.init()
    const collection = this.index.collections.find((entry) => entry.id === id)
    if (collection === undefined) throw new LibraryError('not-found', `no collection ${id}`)
    const validation = validateCollectionName(
      rawName,
      this.index.collections.filter((entry) => entry.id !== id).map((entry) => entry.name),
    )
    if (validation.ok !== true) throw new LibraryError(`collection-${validation.code}`, validation.code)
    collection.name = validation.name
    await this.#persist()
    return collection
  }

  /** Delete one collection; its files stay favorited and become unfiled. */
  async deleteCollection(id) {
    await this.init()
    const before = this.index.collections.length
    this.index.collections = this.index.collections.filter((entry) => entry.id !== id)
    if (this.index.collections.length === before) throw new LibraryError('not-found', `no collection ${id}`)
    let released = 0
    for (const record of this.index.files) {
      if (record.collectionId === id) {
        record.collectionId = null
        released += 1
      }
    }
    await this.#persist()
    return { deleted: id, released }
  }

  /** Whether a delivery position was already captured (dedupe by coordinates). */
  async hasOrigin(sessionId, seq, index) {
    await this.init()
    return this.index.files.some((record) => {
      const origin = record.origin
      return (
        origin !== null &&
        origin !== undefined &&
        origin.sessionId === sessionId &&
        origin.seq === seq &&
        origin.index === index
      )
    })
  }

  /**
   * Move the whole archive to another directory: copy every byte, write the
   * index at the new location, verify it, then drop the old layout. The caller
   * persists the new location so a restart keeps using it.
   * @param targetRoot - absolute destination directory.
   * @returns the new root and the totals it now holds.
   */
  async migrate(targetRoot) {
    await this.init()
    const raw = String(targetRoot ?? '').trim()
    if (raw === '') throw new LibraryError('bad-path', 'a target directory is required')
    if (!path.isAbsolute(raw)) throw new LibraryError('bad-path', 'the target directory must be an absolute path')
    const target = path.resolve(raw)
    if (target === this.root) throw new LibraryError('same-root', 'the archive already lives there')
    if (target.startsWith(this.root + path.sep)) {
      throw new LibraryError('nested-root', 'the target directory cannot be inside the archive')
    }

    for (const dir of ['blobs', 'tmp', 'thumbs', 'orphan']) {
      await mkdir(path.join(target, dir), { recursive: true })
    }
    await cp(this.blobsDir, path.join(target, 'blobs'), { recursive: true, force: true })

    const previousRoot = this.root
    this.root = target
    try {
      await this.#persist()
      const keys = new Set(await this.#blobKeys())
      const missing = this.index.files.filter((record) => !keys.has(`${record.sha256}.bin`))
      if (missing.length > 0) {
        throw new LibraryError('migration-failed', `${missing.length} file(s) are missing at the target`)
      }
    } catch (error) {
      this.root = previousRoot
      await rm(path.join(target, 'blobs'), { recursive: true, force: true }).catch(() => {})
      await rm(path.join(target, 'index.json'), { force: true }).catch(() => {})
      throw error
    }

    // Only this plugin's own layout is removed from the old location.
    for (const entry of ['blobs', 'tmp', 'thumbs', 'orphan']) {
      await rm(path.join(previousRoot, entry), { recursive: true, force: true }).catch(() => {})
    }
    await rm(path.join(previousRoot, 'index.json'), { force: true }).catch(() => {})
    await rm(path.join(previousRoot, 'index.backup.json'), { force: true }).catch(() => {})

    const state = await this.state()
    return { root: state.root, files: state.files, bytes: state.bytes }
  }

  /** Track a delivery that could not be read yet, so the page can retry it. */
  async recordFailure({ path: sourcePath, reason, origin }) {
    await this.init()
    const failure = {
      id: `fail_${Math.random().toString(36).slice(2, 10)}`,
      at: new Date().toISOString(),
      path: sourcePath,
      reason: String(reason ?? 'unknown error'),
      origin: origin ?? null,
    }
    this.index.failures = [failure, ...(this.index.failures ?? [])].slice(0, 50)
    await this.#persist()
    return failure
  }

  /** Replace one failure's reason after a retry that failed again. */
  async updateFailureReason(id, reason) {
    await this.init()
    const failure = (this.index.failures ?? []).find((entry) => entry.id === id)
    if (failure === undefined) return
    failure.reason = String(reason ?? failure.reason)
    failure.at = new Date().toISOString()
    await this.#persist()
  }

  /** Drop one failure record. */
  async clearFailure(id) {
    await this.init()
    const before = (this.index.failures ?? []).length
    this.index.failures = (this.index.failures ?? []).filter((failure) => failure.id !== id)
    if (this.index.failures.length !== before) await this.#persist()
  }

  /** Copy one host path into the library (manual save and delivery retry). */
  async importPath({ path: sourcePath, source = 'manual-save', origin, failureId }) {
    await this.init()
    if (typeof sourcePath !== 'string' || sourcePath === '') {
      throw new LibraryError('bad-path', 'a source path is required')
    }
    const info = await stat(sourcePath).catch(() => undefined)
    if (info === undefined || !info.isFile()) {
      throw new LibraryError('file-missing', `cannot read ${sourcePath}`)
    }
    const bytes = await readFile(sourcePath)
    const record = await this.addBytes({
      name: path.basename(sourcePath),
      bytes,
      source,
      origin: origin ?? null,
      sourceMtime: info.mtime.toISOString(),
    })
    if (typeof failureId === 'string') await this.clearFailure(failureId)
    return record
  }

  /** Open a read stream over the stored bytes. */
  async openBlob(id) {
    await this.init()
    const record = this.index.files.find((entry) => entry.id === id)
    if (record === undefined) throw new LibraryError('not-found', `no library record ${id}`)
    const file = this.blobPath(record.sha256)
    const info = await stat(file).catch(() => undefined)
    if (info === undefined) throw new LibraryError('missing-bytes', `bytes for ${record.name} are missing`)
    return {
      record: this.#publicRecord(record),
      file,
      size: info.size,
      stream: (options) => createReadStream(file, options),
    }
  }

  /** Read one stored blob for a text preview, refusing bytes above `maxBytes`. */
  async readBytes(id, maxBytes = 4 * 1024 * 1024) {
    const opened = await this.openBlob(id)
    if (opened.size > maxBytes) {
      return { record: opened.record, size: opened.size, tooLarge: true }
    }
    const data = await readFile(opened.file)
    return { record: opened.record, size: data.length, data, tooLarge: false }
  }

  /**
   * Reconcile the index with the bytes on disk: records without bytes are marked
   * broken, bytes without a record move to `orphan/` and are never deleted.
   */
  async reconcile() {
    const keys = await this.#blobKeys()
    const plan = buildReconcilePlan(this.index.files, keys)
    const broken = new Set(plan.broken)
    let changed = false
    for (const record of this.index.files) {
      const next = broken.has(record.id)
      if (record.broken !== next) {
        record.broken = next
        changed = true
      }
    }

    const moved = []
    if (plan.orphans.length > 0) {
      await mkdir(this.orphanDir, { recursive: true })
      for (const sha of plan.orphans) {
        const from = this.blobPath(sha)
        const to = path.join(this.orphanDir, `${sha}.bin`)
        try {
          await rename(from, to)
          moved.push(sha)
        } catch {
          // A concurrent writer may have won the race; the next pass retries.
        }
      }
      if (moved.length > 0) changed = true
    }
    if (changed && this.ready !== null) {
      this.index.updatedAt = new Date().toISOString()
      await this.#persist().catch(() => {})
    }
    return { broken: plan.broken, orphans: plan.orphans, moved }
  }

  /**
   * Rebuild records from the bytes on disk, keeping display names for shas the
   * index already knew. Returns the number of records adopted.
   */
  async #adoptBlobs() {
    const keys = await this.#blobKeys()
    const bySha = new Map(this.index.files.map((record) => [record.sha256, record]))
    const files = []
    for (const key of keys) {
      const sha = key.replace(/\.bin$/i, '').toLowerCase()
      const known = bySha.get(sha)
      if (known !== undefined) {
        files.push({ ...known, broken: false })
        continue
      }
      const file = this.blobPath(sha)
      const info = await stat(file).catch(() => undefined)
      if (info === undefined) continue
      files.push({
        schema: SCHEMA,
        id: recordId(),
        name: `recovered-${sha.slice(0, 8)}`,
        ext: '',
        kind: 'other',
        mime: 'application/octet-stream',
        bytes: info.size,
        sha256: sha,
        blob: this.blobRelative(sha).replace(/\\/g, '/'),
        source: 'upload-library',
        origin: null,
        createdAt: new Date().toISOString(),
        sourceMtime: null,
        favorited: false,
        collectionId: null,
        thumb: { status: 'none' },
        broken: false,
      })
    }
    this.index.files = files
    this.index.blobs = {}
    for (const record of files) {
      const blob = this.index.blobs[record.sha256]
      if (blob === undefined) this.index.blobs[record.sha256] = { bytes: record.bytes, refs: 1 }
      else blob.refs += 1
    }
    return files.length
  }

  /** Rebuild the index from the bytes on disk and persist the result. */
  async rebuild() {
    await this.init()
    const count = await this.#adoptBlobs()
    this.indexError = null
    await this.#persist()
    return { files: count }
  }
}
