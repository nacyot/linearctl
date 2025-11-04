import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'

export interface UploadFileOptions {
  filePath: string
  headers: Array<{ key: string; value: string }>
  maxRetries?: number
  onProgress?: (percent: number, transferred: number, total: number) => void
  uploadUrl: string
}

export class UploadError extends Error {
  constructor(
    message: string,
    public status?: number,
    public statusText?: string
  ) {
    super(message)
    this.name = 'UploadError'
  }
}

/**
 * Upload a file to a signed URL with retry logic and progress tracking
 */
export async function uploadFile(options: UploadFileOptions): Promise<void> {
  const { filePath, headers, maxRetries = 3, onProgress, uploadUrl } = options

  // Get file size
  const fileStats = await stat(filePath)
  const fileSize = fileStats.size

  // Retry loop with exponential backoff
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await uploadAttempt({ filePath, fileSize, headers, onProgress, uploadUrl })
      return // Success - exit
    } catch (error) {
      if (attempt === maxRetries) {
        // Last attempt failed - throw error
        throw error
      }

      // Wait before retry (exponential backoff: 500ms, 1s, 2s, ...)
      const delay = 2 ** (attempt - 1) * 500
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => {
        setTimeout(resolve, delay)
      })
    }
  }
}

interface UploadAttemptOptions {
  filePath: string
  fileSize: number
  headers: Array<{ key: string; value: string }>
  onProgress?: (percent: number, transferred: number, total: number) => void
  uploadUrl: string
}

async function uploadAttempt(options: UploadAttemptOptions): Promise<void> {
  const { filePath, fileSize, headers, onProgress, uploadUrl } = options
  // Create file stream
  const fileStream = createReadStream(filePath)

  // Track progress if callback provided
  let transferred = 0
  let progressStream: Readable = fileStream

  if (onProgress) {
    progressStream = new Readable({
      read() {
        // Passthrough
      },
    })

    fileStream.on('data', (chunk: Buffer) => {
      transferred += chunk.length
      const percent = Math.round((transferred / fileSize) * 100)
      onProgress(percent, transferred, fileSize)
      progressStream.push(chunk)
    })

    fileStream.on('end', () => {
      progressStream.push(null)
    })

    fileStream.on('error', (error) => {
      progressStream.destroy(error)
    })
  }

  // Convert Node.js Readable to Web ReadableStream
  // eslint-disable-next-line n/no-unsupported-features/node-builtins
  const webStream = Readable.toWeb(progressStream) as ReadableStream<Uint8Array>

  // Convert headers array to object
  const headersObj: Record<string, string> = {}
  for (const header of headers) {
    headersObj[header.key] = header.value
  }

  // Upload file using fetch
  // Note: TypeScript types don't fully support streaming bodies yet, but Node.js 18+ does
  // eslint-disable-next-line n/no-unsupported-features/node-builtins
  const response = await fetch(uploadUrl, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body: webStream as any,
    duplex: 'half',
    headers: headersObj,
    method: 'PUT',
    // eslint-disable-next-line no-undef
  } as RequestInit)

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error')
    throw new UploadError(
      `Upload failed: ${response.status} ${response.statusText} - ${errorText}`,
      response.status,
      response.statusText
    )
  }
}
