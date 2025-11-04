import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as uploadFileModule from '../../../src/lib/upload-file.js'
import * as linearService from '../../../src/services/linear.js'

// Mock the linear service
vi.mock('../../../src/services/linear.js', () => ({
  getLinearClient: vi.fn(),
  hasApiKey: vi.fn(),
}))

// Mock the upload file module
vi.mock('../../../src/lib/upload-file.js', () => ({
  uploadFile: vi.fn(),
}))

// Mock fs promises
vi.mock('node:fs/promises', () => ({
  access: vi.fn(),
}))

// Mock mime-types
vi.mock('mime-types', () => ({
  default: {
    lookup: vi.fn(),
  },
}))

describe('attachment upload command', () => {
  let logSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>
  let mockClient: {
    fileUpload: ReturnType<typeof vi.fn>
    issue: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    vi.clearAllMocks()
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Create mock client
    mockClient = {
      fileUpload: vi.fn(),
      issue: vi.fn(),
    }

    vi.mocked(linearService.hasApiKey).mockReturnValue(true)
    vi.mocked(linearService.getLinearClient).mockReturnValue(mockClient as never)
  })

  afterEach(() => {
    logSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it('should upload file successfully', async () => {
    const mockIssue = {
      id: 'issue-uuid-123',
      identifier: 'ENG-123',
    }

    const mockUploadPayload = {
      assetUrl: 'https://storage.googleapis.com/bucket/file.png',
      contentType: 'image/png',
      filename: 'test.png',
      headers: [
        { key: 'Content-Type', value: 'image/png' },
        { key: 'x-goog-meta-test', value: 'value' },
      ],
      size: 12_345,
      uploadUrl: 'https://storage.googleapis.com/bucket/upload-url',
    }

    const mockAttachment = {
      id: 'attachment-uuid-456',
      title: 'test.png',
      url: 'https://storage.googleapis.com/bucket/file.png',
    }

    mockClient.issue.mockResolvedValue(mockIssue)
    mockClient.fileUpload.mockResolvedValue({
      attachment: mockAttachment,
      lastSyncId: 0,
      success: true,
      uploadPayload: mockUploadPayload,
    })

    const fs = await import('node:fs/promises')
    vi.mocked(fs.access).mockResolvedValue()

    const mime = await import('mime-types')
    vi.mocked(mime.default.lookup).mockReturnValue('image/png')

    vi.mocked(uploadFileModule.uploadFile).mockResolvedValue()

    const AttachmentUpload = (
      await import('../../../src/commands/attachment/upload.js')
    ).default
    const cmd = new AttachmentUpload([], {} as never)
    await cmd.runWithFlags({
      file: '/test/file.png',
      issue: 'ENG-123',
      json: false,
    })

    expect(mockClient.issue).toHaveBeenCalledWith('ENG-123')
    expect(mockClient.fileUpload).toHaveBeenCalled()
    expect(uploadFileModule.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: '/test/file.png',
        headers: mockUploadPayload.headers,
        uploadUrl: mockUploadPayload.uploadUrl,
      })
    )
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('✓'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('uploaded'))
  })

  it('should handle JSON output', async () => {
    const mockIssue = {
      id: 'issue-uuid-123',
      identifier: 'ENG-123',
    }

    const mockUploadPayload = {
      assetUrl: 'https://storage.googleapis.com/bucket/file.png',
      contentType: 'image/png',
      filename: 'test.png',
      headers: [{ key: 'Content-Type', value: 'image/png' }],
      size: 12_345,
      uploadUrl: 'https://storage.googleapis.com/bucket/upload-url',
    }

    const mockAttachment = {
      id: 'attachment-uuid-456',
      title: 'test.png',
      url: 'https://storage.googleapis.com/bucket/file.png',
    }

    mockClient.issue.mockResolvedValue(mockIssue)
    mockClient.fileUpload.mockResolvedValue({
      attachment: mockAttachment,
      lastSyncId: 0,
      success: true,
      uploadPayload: mockUploadPayload,
    })

    const fs = await import('node:fs/promises')
    vi.mocked(fs.access).mockResolvedValue()

    const mime = await import('mime-types')
    vi.mocked(mime.default.lookup).mockReturnValue('image/png')

    vi.mocked(uploadFileModule.uploadFile).mockResolvedValue()

    const AttachmentUpload = (
      await import('../../../src/commands/attachment/upload.js')
    ).default
    const cmd = new AttachmentUpload([], {} as never)
    await cmd.runWithFlags({
      file: '/test/file.png',
      issue: 'ENG-123',
      json: true,
    })

    const output = JSON.parse(logSpy.mock.calls[0][0])
    expect(output).toHaveProperty('id')
    expect(output).toHaveProperty('title')
    expect(output).toHaveProperty('url')
  })

  it('should handle file not found', async () => {
    const fs = await import('node:fs/promises')
    vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT: file not found'))

    const AttachmentUpload = (
      await import('../../../src/commands/attachment/upload.js')
    ).default
    const cmd = new AttachmentUpload([], {} as never)

    await expect(
      cmd.runWithFlags({
        file: '/test/nonexistent.png',
        issue: 'ENG-123',
        json: false,
      })
    ).rejects.toThrow(/not found/)
  })

  it('should handle issue not found', async () => {
    mockClient.issue.mockResolvedValue(null)

    const fs = await import('node:fs/promises')
    vi.mocked(fs.access).mockResolvedValue()

    const AttachmentUpload = (
      await import('../../../src/commands/attachment/upload.js')
    ).default
    const cmd = new AttachmentUpload([], {} as never)

    await expect(
      cmd.runWithFlags({
        file: '/test/file.png',
        issue: 'ENG-999',
        json: false,
      })
    ).rejects.toThrow(/Issue ENG-999 not found/)
  })

  it('should handle missing API key', async () => {
    vi.mocked(linearService.hasApiKey).mockReturnValue(false)

    const AttachmentUpload = (
      await import('../../../src/commands/attachment/upload.js')
    ).default
    const cmd = new AttachmentUpload([], {} as never)

    await expect(
      cmd.runWithFlags({
        file: '/test/file.png',
        issue: 'ENG-123',
        json: false,
      })
    ).rejects.toThrow(/No API key/)
  })

  it('should handle upload failure', async () => {
    const mockIssue = {
      id: 'issue-uuid-123',
      identifier: 'ENG-123',
    }

    const mockUploadPayload = {
      assetUrl: 'https://storage.googleapis.com/bucket/file.png',
      contentType: 'image/png',
      filename: 'test.png',
      headers: [{ key: 'Content-Type', value: 'image/png' }],
      size: 12_345,
      uploadUrl: 'https://storage.googleapis.com/bucket/upload-url',
    }

    mockClient.issue.mockResolvedValue(mockIssue)
    mockClient.fileUpload.mockResolvedValue({
      lastSyncId: 0,
      success: true,
      uploadPayload: mockUploadPayload,
    })

    const fs = await import('node:fs/promises')
    vi.mocked(fs.access).mockResolvedValue()

    const mime = await import('mime-types')
    vi.mocked(mime.default.lookup).mockReturnValue('image/png')

    vi.mocked(uploadFileModule.uploadFile).mockRejectedValue(
      new Error('Upload failed: 403 Forbidden')
    )

    const AttachmentUpload = (
      await import('../../../src/commands/attachment/upload.js')
    ).default
    const cmd = new AttachmentUpload([], {} as never)

    await expect(
      cmd.runWithFlags({
        file: '/test/file.png',
        issue: 'ENG-123',
        json: false,
      })
    ).rejects.toThrow(/Upload failed/)
  })

  it('should use custom title when provided', async () => {
    const mockIssue = {
      id: 'issue-uuid-123',
      identifier: 'ENG-123',
    }

    const mockUploadPayload = {
      assetUrl: 'https://storage.googleapis.com/bucket/file.png',
      contentType: 'image/png',
      filename: 'test.png',
      headers: [{ key: 'Content-Type', value: 'image/png' }],
      size: 12_345,
      uploadUrl: 'https://storage.googleapis.com/bucket/upload-url',
    }

    const mockAttachment = {
      id: 'attachment-uuid-456',
      title: 'Custom Title',
      url: 'https://storage.googleapis.com/bucket/file.png',
    }

    mockClient.issue.mockResolvedValue(mockIssue)
    mockClient.fileUpload.mockResolvedValue({
      attachment: mockAttachment,
      lastSyncId: 0,
      success: true,
      uploadPayload: mockUploadPayload,
    })

    const fs = await import('node:fs/promises')
    vi.mocked(fs.access).mockResolvedValue()

    const mime = await import('mime-types')
    vi.mocked(mime.default.lookup).mockReturnValue('image/png')

    vi.mocked(uploadFileModule.uploadFile).mockResolvedValue()

    const AttachmentUpload = (
      await import('../../../src/commands/attachment/upload.js')
    ).default
    const cmd = new AttachmentUpload([], {} as never)
    await cmd.runWithFlags({
      file: '/test/file.png',
      issue: 'ENG-123',
      json: false,
      title: 'Custom Title',
    })

    expect(mockClient.fileUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Custom Title',
      })
    )
  })
})
