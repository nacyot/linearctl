import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as linearService from '../../../src/services/linear.js'

// Mock the linear service
vi.mock('../../../src/services/linear.js', () => ({
  getLinearClient: vi.fn(),
  hasApiKey: vi.fn(),
}))

describe('attachment list command', () => {
  let logSpy: any
  let errorSpy: any
  let mockClient: any

  beforeEach(() => {
    vi.clearAllMocks()
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Create mock client
    mockClient = {
      issue: vi.fn(),
    }

    vi.mocked(linearService.hasApiKey).mockReturnValue(true)
    vi.mocked(linearService.getLinearClient).mockReturnValue(mockClient)
  })

  afterEach(() => {
    logSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it('should list attachments for an issue', async () => {
    const mockAttachments = {
      nodes: [
        {
          createdAt: '2024-01-01T10:00:00Z',
          creator: { name: 'John Doe' },
          id: 'attachment-1',
          subtitle: 'Homepage redesign',
          title: 'Design mockup',
          url: 'https://figma.com/file/123',
        },
        {
          createdAt: '2024-01-01T11:00:00Z',
          creator: { name: 'Jane Smith' },
          id: 'attachment-2',
          subtitle: 'Bug screenshot',
          title: 'Screenshot',
          url: 'https://linear.app/api/fileUrl/abc123.png',
        },
      ],
    }

    const mockIssue = {
      attachments: vi.fn().mockResolvedValue(mockAttachments),
      id: 'issue-1',
      identifier: 'ENG-123',
      title: 'Test issue',
    }

    mockClient.issue.mockResolvedValue(mockIssue)

    const AttachmentList = (await import('../../../src/commands/attachment/list.js')).default
    const cmd = new AttachmentList([], {} as any)
    await cmd.runWithArgs('ENG-123', {})

    expect(mockClient.issue).toHaveBeenCalledWith('ENG-123')
    expect(mockIssue.attachments).toHaveBeenCalled()

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('ENG-123'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Design mockup'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Screenshot'))
  })

  it('should handle JSON output', async () => {
    const mockAttachments = {
      nodes: [
        {
          createdAt: '2024-01-01T10:00:00Z',
          creator: { name: 'John Doe' },
          id: 'attachment-1',
          subtitle: 'Homepage redesign',
          title: 'Design mockup',
          url: 'https://figma.com/file/123',
        },
      ],
    }

    const mockIssue = {
      attachments: vi.fn().mockResolvedValue(mockAttachments),
      id: 'issue-1',
      identifier: 'ENG-123',
      title: 'Test issue',
    }

    mockClient.issue.mockResolvedValue(mockIssue)

    const AttachmentList = (await import('../../../src/commands/attachment/list.js')).default
    const cmd = new AttachmentList([], {} as any)
    await cmd.runWithArgs('ENG-123', { json: true })

    const output = JSON.parse(logSpy.mock.calls[0][0])
    expect(output).toEqual([
      {
        createdAt: '2024-01-01T10:00:00Z',
        creator: { name: 'John Doe' },
        id: 'attachment-1',
        subtitle: 'Homepage redesign',
        title: 'Design mockup',
        url: 'https://figma.com/file/123',
      },
    ])
  })

  it('should handle no attachments', async () => {
    const mockAttachments = {
      nodes: [],
    }

    const mockIssue = {
      attachments: vi.fn().mockResolvedValue(mockAttachments),
      id: 'issue-1',
      identifier: 'ENG-123',
      title: 'Test issue',
    }

    mockClient.issue.mockResolvedValue(mockIssue)

    const AttachmentList = (await import('../../../src/commands/attachment/list.js')).default
    const cmd = new AttachmentList([], {} as any)
    await cmd.runWithArgs('ENG-123', {})

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('No attachments found'))
  })

  it('should handle issue not found', async () => {
    mockClient.issue.mockResolvedValue(null)

    const AttachmentList = (await import('../../../src/commands/attachment/list.js')).default
    const cmd = new AttachmentList([], {} as any)

    await expect(cmd.runWithArgs('INVALID-999', {})).rejects.toThrow(/not found/)
  })

  it('should handle missing API key', async () => {
    vi.mocked(linearService.hasApiKey).mockReturnValue(false)

    const AttachmentList = (await import('../../../src/commands/attachment/list.js')).default
    const cmd = new AttachmentList([], {} as any)

    await expect(cmd.runWithArgs('ENG-123', {})).rejects.toThrow(/No API key/)
  })
})
