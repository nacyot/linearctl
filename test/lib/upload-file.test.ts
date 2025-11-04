import { createReadStream } from 'node:fs'
import * as fsPromises from 'node:fs/promises'
import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock fs modules
vi.mock('node:fs', () => ({
  createReadStream: vi.fn(),
}))

vi.mock('node:fs/promises', () => ({
  stat: vi.fn(),
}))

// Mock fetch
// eslint-disable-next-line n/no-unsupported-features/node-builtins
globalThis.fetch = vi.fn() as typeof fetch

describe('uploadFile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should upload file successfully', async () => {
    const mockStat = {
      size: 12_345,
    }

    // Create a real Readable stream for mocking
    const mockStream = new Readable({
      read() {
        // Empty implementation
      },
    })
    // Immediately end the stream
    mockStream.push(null)

    vi.mocked(fsPromises.stat).mockResolvedValue(mockStat as any)
    vi.mocked(createReadStream).mockReturnValue(mockStream as any)
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200,
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    } as Response)

    const { uploadFile } = await import('../../src/lib/upload-file.js')

    await uploadFile({
      filePath: '/test/file.png',
      headers: [
        { key: 'Content-Type', value: 'image/png' },
        { key: 'x-goog-meta-test', value: 'value' },
      ],
      uploadUrl: 'https://storage.googleapis.com/test-bucket/file.png',
    })

    expect(fsPromises.stat).toHaveBeenCalledWith('/test/file.png')
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://storage.googleapis.com/test-bucket/file.png',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'image/png',
          'x-goog-meta-test': 'value',
        }),
        method: 'PUT',
      })
    )
  })

  it('should handle upload failure', async () => {
    const mockStat = {
      size: 12_345,
    }

    // Create a real Readable stream for mocking
    const mockStream = new Readable({
      read() {
        // Empty implementation
      },
    })
    // Immediately end the stream
    mockStream.push(null)

    vi.mocked(fsPromises.stat).mockResolvedValue(mockStat as any)
    vi.mocked(createReadStream).mockReturnValue(mockStream as any)
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      text: async () => 'Access denied',
      // eslint-disable-next-line n/no-unsupported-features/node-builtins
    } as Response)

    const { uploadFile } = await import('../../src/lib/upload-file.js')

    await expect(
      uploadFile({
        filePath: '/test/file.png',
        headers: [{ key: 'Content-Type', value: 'image/png' }],
        uploadUrl: 'https://storage.googleapis.com/test-bucket/file.png',
      })
    ).rejects.toThrow(/Upload failed/)
  })

  it('should retry on failure with exponential backoff', async () => {
    const mockStat = {
      size: 12_345,
    }

    vi.mocked(fsPromises.stat).mockResolvedValue(mockStat as any)

    // Create new stream for each retry attempt
    vi.mocked(createReadStream).mockImplementation(() => {
      const stream = new Readable({
        read() {
          // Empty implementation
        },
      })
      stream.push(null)
      return stream as any
    })

    // First two calls fail, third succeeds
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Server Error',
        text: async () => 'Server error',
        // eslint-disable-next-line n/no-unsupported-features/node-builtins
    } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Server Error',
        text: async () => 'Server error',
        // eslint-disable-next-line n/no-unsupported-features/node-builtins
    } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        // eslint-disable-next-line n/no-unsupported-features/node-builtins
    } as Response)

    const { uploadFile } = await import('../../src/lib/upload-file.js')

    await uploadFile({
      filePath: '/test/file.png',
      headers: [{ key: 'Content-Type', value: 'image/png' }],
      maxRetries: 3,
      uploadUrl: 'https://storage.googleapis.com/test-bucket/file.png',
    })

    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    expect(globalThis.fetch).toHaveBeenCalledTimes(3)
  })

  it('should fail after max retries', async () => {
    const mockStat = {
      size: 12_345,
    }

    vi.mocked(fsPromises.stat).mockResolvedValue(mockStat as any)

    // Create new stream for each retry attempt
    vi.mocked(createReadStream).mockImplementation(() => {
      const stream = new Readable({
        read() {
          // Empty implementation
        },
      })
      stream.push(null)
      return stream as any
    })

    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      text: async () => 'Server error',
      // eslint-disable-next-line n/no-unsupported-features/node-builtins
    } as Response)

    const { uploadFile } = await import('../../src/lib/upload-file.js')

    await expect(
      uploadFile({
        filePath: '/test/file.png',
        headers: [{ key: 'Content-Type', value: 'image/png' }],
        maxRetries: 3,
        uploadUrl: 'https://storage.googleapis.com/test-bucket/file.png',
      })
    ).rejects.toThrow(/Upload failed/)

    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    expect(globalThis.fetch).toHaveBeenCalledTimes(3)
  })

  it('should call progress callback', async () => {
    const mockStat = {
      size: 12_345,
    }

    vi.mocked(fsPromises.stat).mockResolvedValue(mockStat as any)

    // Create a stream that emits data events
    const mockStream = new Readable({
      read() {
        // Empty implementation
      },
    })

    vi.mocked(createReadStream).mockReturnValue(mockStream as any)
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      // eslint-disable-next-line n/no-unsupported-features/node-builtins
    } as Response)

    const onProgress = vi.fn()
    const { uploadFile } = await import('../../src/lib/upload-file.js')

    // Start upload and emit data after a short delay
    const uploadPromise = uploadFile({
      filePath: '/test/file.png',
      headers: [{ key: 'Content-Type', value: 'image/png' }],
      onProgress,
      uploadUrl: 'https://storage.googleapis.com/test-bucket/file.png',
    })

    // Emit some data and end the stream
    await new Promise((resolve) => {
      setTimeout(resolve, 10)
    })
    mockStream.emit('data', Buffer.from('test data'))
    mockStream.emit('end')

    await uploadPromise

    // Progress callback should be called at least once (when data arrives)
    expect(onProgress).toHaveBeenCalled()
  })

  it('should handle file not found', async () => {
    vi.mocked(fsPromises.stat).mockRejectedValue(new Error('ENOENT: no such file'))

    const { uploadFile } = await import('../../src/lib/upload-file.js')

    await expect(
      uploadFile({
        filePath: '/test/nonexistent.png',
        headers: [{ key: 'Content-Type', value: 'image/png' }],
        uploadUrl: 'https://storage.googleapis.com/test-bucket/file.png',
      })
    ).rejects.toThrow()
  })
})
