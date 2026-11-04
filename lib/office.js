/**
 * Office documents in the library are converted to PDF by the Host's document
 * conversion service, then served like any other PDF. When that service is not
 * composed, the preview reports the missing engine instead of failing silently.
 */
import { readFile } from 'node:fs/promises'

import { LibraryError } from './engine.js'
import { officeExtensionOf } from './render.js'

/**
 * Convert one record with the Host's `officeToPdf` service.
 * @param office - the service instance, or undefined when not composed.
 * @param record - stored record supplying the extension and identity.
 * @param blobPath - absolute path of the stored bytes.
 * @param signal - caller cancellation.
 * @returns PDF bytes plus the missing font families the service reported.
 */
export async function convertOffice(office, record, blobPath, signal) {
  if (office === undefined || office === null) {
    throw new LibraryError('office-unavailable', 'no document conversion engine is installed')
  }
  const extension = officeExtensionOf(record)
  if (extension === null) {
    throw new LibraryError('office-unsupported', `${record.name} is not a convertible document`)
  }

  try {
    const result = await office.convert(
      {
        extension,
        priority: 'foreground',
        source: {
          key: record.sha256,
          version: record.sha256,
          bytes: record.bytes,
          read: async () => ({ bytes: await readFile(blobPath), version: record.sha256 }),
        },
      },
      signal,
    )
    return { pdf: result.pdf, missingFonts: Array.isArray(result.missingFonts) ? result.missingFonts : [] }
  } catch (error) {
    if (error instanceof LibraryError) throw error
    const message = String(error?.message ?? error)
    const unavailable = /engine|libre?office|not installed|not found|ENOENT|unavailable/i.test(message)
    throw new LibraryError(unavailable ? 'office-unavailable' : 'convert-failed', message)
  }
}
