import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as linearService from '../../../src/services/linear.js'

// Mock the linear service
vi.mock('../../../src/services/linear.js', () => ({
  getLinearClient: vi.fn(),
  hasApiKey: vi.fn(),
}))

describe('attachment add command', () => {
  let logSpy: any
  let errorSpy: any
  let mockClient: any

  beforeEach(() => {
    vi.clearAllMocks()
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Create mock client
    mockClient = {
      createAttachment: vi.fn(),
      issue: vi.fn(),
    }

    vi.mocked(linearService.hasApiKey).mockReturnValue(true)
    vi.mocked(linearService.getLinearClient).mockReturnValue(mockClient)
  })

  afterEach(() => {
    logSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it('should create URL-based attachment with required fields', async () => {
    const mockIssue = {
      id: 'issue-uuid-123',
      identifier: 'ENG-123',
      title: 'Test issue',
    }

    const mockPayload = {
      attachment: {
        id: 'attachment-uuid-456',
        title: 'Design mockup',
        url: 'https://figma.com/file/123',
      },
      success: true,
    }

    mockClient.issue.mockResolvedValue(mockIssue)
    mockClient.createAttachment.mockResolvedValue(mockPayload)

    const AttachmentAdd = (await import('../../../src/commands/attachment/add.js')).default
    const cmd = new AttachmentAdd([], {} as any)
    await cmd.runWithFlags({
      issue: 'ENG-123',
      title: 'Design mockup',
      url: 'https://figma.com/file/123',
    })

    expect(mockClient.issue).toHaveBeenCalledWith('ENG-123')
    expect(mockClient.createAttachment).toHaveBeenCalledWith({
      issueId: 'issue-uuid-123',
      title: 'Design mockup',
      url: 'https://figma.com/file/123',
    })

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('✓'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Design mockup'))
  })

  it('should create attachment with optional fields', async () => {
    const mockIssue = {
      id: 'issue-uuid-123',
      identifier: 'ENG-123',
      title: 'Test issue',
    }

    const mockPayload = {
      attachment: {
        description: 'A detailed description',
        iconUrl: 'https://example.com/icon.png',
        id: 'attachment-uuid-456',
        subtitle: 'Homepage redesign',
        title: 'Design mockup',
        url: 'https://figma.com/file/123',
      },
      success: true,
    }

    mockClient.issue.mockResolvedValue(mockIssue)
    mockClient.createAttachment.mockResolvedValue(mockPayload)

    const AttachmentAdd = (await import('../../../src/commands/attachment/add.js')).default
    const cmd = new AttachmentAdd([], {} as any)
    await cmd.runWithFlags({
      description: 'A detailed description',
      'icon-url': 'https://example.com/icon.png',
      issue: 'ENG-123',
      subtitle: 'Homepage redesign',
      title: 'Design mockup',
      url: 'https://figma.com/file/123',
    })

    expect(mockClient.createAttachment).toHaveBeenCalledWith({
      description: 'A detailed description',
      iconUrl: 'https://example.com/icon.png',
      issueId: 'issue-uuid-123',
      subtitle: 'Homepage redesign',
      title: 'Design mockup',
      url: 'https://figma.com/file/123',
    })
  })

  it('should handle JSON output', async () => {
    const mockIssue = {
      id: 'issue-uuid-123',
      identifier: 'ENG-123',
      title: 'Test issue',
    }

    const mockPayload = {
      attachment: {
        id: 'attachment-uuid-456',
        title: 'Design mockup',
        url: 'https://figma.com/file/123',
      },
      success: true,
    }

    mockClient.issue.mockResolvedValue(mockIssue)
    mockClient.createAttachment.mockResolvedValue(mockPayload)

    const AttachmentAdd = (await import('../../../src/commands/attachment/add.js')).default
    const cmd = new AttachmentAdd([], {} as any)
    await cmd.runWithFlags({
      issue: 'ENG-123',
      json: true,
      title: 'Design mockup',
      url: 'https://figma.com/file/123',
    })

    const output = JSON.parse(logSpy.mock.calls[0][0])
    expect(output).toEqual({
      id: 'attachment-uuid-456',
      title: 'Design mockup',
      url: 'https://figma.com/file/123',
    })
  })

  it('should handle issue not found', async () => {
    mockClient.issue.mockResolvedValue(null)

    const AttachmentAdd = (await import('../../../src/commands/attachment/add.js')).default
    const cmd = new AttachmentAdd([], {} as any)

    await expect(
      cmd.runWithFlags({
        issue: 'INVALID-999',
        title: 'Test',
        url: 'https://example.com',
      })
    ).rejects.toThrow(/not found/)
  })

  it('should handle API failure', async () => {
    const mockIssue = {
      id: 'issue-uuid-123',
      identifier: 'ENG-123',
      title: 'Test issue',
    }

    const mockPayload = {
      success: false,
    }

    mockClient.issue.mockResolvedValue(mockIssue)
    mockClient.createAttachment.mockResolvedValue(mockPayload)

    const AttachmentAdd = (await import('../../../src/commands/attachment/add.js')).default
    const cmd = new AttachmentAdd([], {} as any)

    await expect(
      cmd.runWithFlags({
        issue: 'ENG-123',
        title: 'Test',
        url: 'https://example.com',
      })
    ).rejects.toThrow(/Failed to create attachment/)
  })

  it('should handle missing API key', async () => {
    vi.mocked(linearService.hasApiKey).mockReturnValue(false)

    const AttachmentAdd = (await import('../../../src/commands/attachment/add.js')).default
    const cmd = new AttachmentAdd([], {} as any)

    await expect(
      cmd.runWithFlags({
        issue: 'ENG-123',
        title: 'Test',
        url: 'https://example.com',
      })
    ).rejects.toThrow(/No API key/)
  })

  it('should use URL hostname as default title if not provided', async () => {
    const mockIssue = {
      id: 'issue-uuid-123',
      identifier: 'ENG-123',
      title: 'Test issue',
    }

    const mockPayload = {
      attachment: {
        id: 'attachment-uuid-456',
        title: 'figma.com',
        url: 'https://figma.com/file/123',
      },
      success: true,
    }

    mockClient.issue.mockResolvedValue(mockIssue)
    mockClient.createAttachment.mockResolvedValue(mockPayload)

    const AttachmentAdd = (await import('../../../src/commands/attachment/add.js')).default
    const cmd = new AttachmentAdd([], {} as any)
    await cmd.runWithFlags({
      issue: 'ENG-123',
      url: 'https://figma.com/file/123',
    })

    expect(mockClient.createAttachment).toHaveBeenCalledWith({
      issueId: 'issue-uuid-123',
      title: 'figma.com',
      url: 'https://figma.com/file/123',
    })
  })
})
