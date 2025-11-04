import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as linearService from '../../../src/services/linear.js'

// Mock the linear service
vi.mock('../../../src/services/linear.js', () => ({
  getLinearClient: vi.fn(),
  hasApiKey: vi.fn(),
}))

describe('attachment delete command', () => {
  let logSpy: any
  let errorSpy: any
  let mockClient: any

  beforeEach(() => {
    vi.clearAllMocks()
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Create mock client
    mockClient = {
      deleteAttachment: vi.fn(),
    }

    vi.mocked(linearService.hasApiKey).mockReturnValue(true)
    vi.mocked(linearService.getLinearClient).mockReturnValue(mockClient)
  })

  afterEach(() => {
    logSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it('should delete attachment successfully', async () => {
    const mockPayload = {
      success: true,
    }

    mockClient.deleteAttachment.mockResolvedValue(mockPayload)

    const AttachmentDelete = (await import('../../../src/commands/attachment/delete.js')).default
    const cmd = new AttachmentDelete([], {} as any)
    await cmd.runWithArgs('attachment-uuid-123', {})

    expect(mockClient.deleteAttachment).toHaveBeenCalledWith('attachment-uuid-123')
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('✓'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('deleted'))
  })

  it('should handle JSON output', async () => {
    const mockPayload = {
      success: true,
    }

    mockClient.deleteAttachment.mockResolvedValue(mockPayload)

    const AttachmentDelete = (await import('../../../src/commands/attachment/delete.js')).default
    const cmd = new AttachmentDelete([], {} as any)
    await cmd.runWithArgs('attachment-uuid-123', { json: true })

    const output = JSON.parse(logSpy.mock.calls[0][0])
    expect(output).toEqual({
      id: 'attachment-uuid-123',
      success: true,
    })
  })

  it('should handle API failure', async () => {
    const mockPayload = {
      success: false,
    }

    mockClient.deleteAttachment.mockResolvedValue(mockPayload)

    const AttachmentDelete = (await import('../../../src/commands/attachment/delete.js')).default
    const cmd = new AttachmentDelete([], {} as any)

    await expect(cmd.runWithArgs('attachment-uuid-123', {})).rejects.toThrow(/Failed to delete attachment/)
  })

  it('should handle missing API key', async () => {
    vi.mocked(linearService.hasApiKey).mockReturnValue(false)

    const AttachmentDelete = (await import('../../../src/commands/attachment/delete.js')).default
    const cmd = new AttachmentDelete([], {} as any)

    await expect(cmd.runWithArgs('attachment-uuid-123', {})).rejects.toThrow(/No API key/)
  })

  it('should handle network errors', async () => {
    mockClient.deleteAttachment.mockRejectedValue(new Error('Network error'))

    const AttachmentDelete = (await import('../../../src/commands/attachment/delete.js')).default
    const cmd = new AttachmentDelete([], {} as any)

    await expect(cmd.runWithArgs('attachment-uuid-123', {})).rejects.toThrow('Network error')
  })
})
