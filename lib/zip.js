/**
 * Minimal, dependency-free ZIP writer.
 *
 * The archive is assembled in memory (see plan §2: single request cap, no
 * streaming). Entries are deflated when that helps and stored otherwise; names
 * are UTF-8 flagged so non-ASCII file names survive.
 */
import { deflateRawSync } from 'node:zlib'

const MAX_UINT32 = 0xffffffff

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    table[index] = value >>> 0
  }
  return table
})()

/** CRC-32 of one buffer, as the ZIP format expects. */
export function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/** MS-DOS time and date words for one JavaScript date. */
export function dosDateTime(date) {
  const time =
    (Math.max(0, date.getHours()) << 11) | (Math.max(0, date.getMinutes()) << 5) | Math.floor(Math.max(0, date.getSeconds()) / 2)
  const day =
    (Math.max(0, date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | Math.max(1, date.getDate())
  return { time, day }
}

/** Make an entry name unique inside one archive. */
export function uniqueEntryName(name, taken) {
  if (!taken.has(name)) return name
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const suffix = dot > 0 ? name.slice(dot) : ''
  for (let index = 2; index < 10000; index += 1) {
    const candidate = `${stem} (${index})${suffix}`
    if (!taken.has(candidate)) return candidate
  }
  return `${stem} (${Date.now()})${suffix}`
}

/**
 * Build one ZIP archive.
 * @param entries - `{ name, data }` pairs; data is copied into the archive.
 * @param date - timestamp recorded on every entry.
 * @returns the archive bytes.
 */
export function createZip(entries, date = new Date()) {
  const { time, day } = dosDateTime(date)
  const locals = []
  const centrals = []
  const taken = new Set()
  let offset = 0

  for (const entry of entries) {
    const name = uniqueEntryName(String(entry.name), taken)
    taken.add(name)
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data)
    const deflated = deflateRawSync(data, { level: 6 })
    const useDeflate = deflated.length < data.length
    const payload = useDeflate ? deflated : data
    const method = useDeflate ? 8 : 0
    const crc = crc32(data)
    if (offset > MAX_UINT32 || data.length > MAX_UINT32) {
      throw new Error('zip entry exceeds the 32-bit archive limits')
    }

    const nameBytes = Buffer.from(name, 'utf8')
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(day, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(payload.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    local.writeUInt16LE(0, 28)
    locals.push(local, nameBytes, payload)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(method, 10)
    central.writeUInt16LE(time, 12)
    central.writeUInt16LE(day, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(payload.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBytes.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(0, 38)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, nameBytes)

    offset += local.length + nameBytes.length + payload.length
  }

  const centralSize = centrals.reduce((total, buffer) => total + buffer.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralSize, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)

  return Buffer.concat([...locals, ...centrals, end])
}
