import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as linearService from '../../../src/services/linear.js'

// Mock the linear service
vi.mock('../../../src/services/linear.js', () => ({
  getLinearClient: vi.fn(),
  hasApiKey: vi.fn(),
}))

describe('issue delete command', () => {
  let mockClient: any
  let logSpy: any

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks()
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    // Mock hasApiKey to return true
    vi.mocked(linearService.hasApiKey).mockReturnValue(true)

    // Setup mock client
    mockClient = {
      issue: vi.fn(),
    }

    vi.mocked(linearService.getLinearClient).mockReturnValue(mockClient)
  })

  afterEach(() => {
    logSpy.mockRestore()
  })

  it('should archive an issue by default', async () => {
    const mockIssue = {
      archive: vi.fn().mockResolvedValue({ success: true }),
      delete: vi.fn(),
      id: 'issue-uuid-123',
      identifier: 'ENG-123',
      title: 'Test Issue',
    }

    mockClient.issue.mockResolvedValue(mockIssue)

    const IssueDelete = (await import('../../../src/commands/issue/delete.js')).default
    const command = new IssueDelete(['ENG-123'], {} as any)
    await command.runWithArgs('ENG-123')

    expect(mockClient.issue).toHaveBeenCalledWith('ENG-123')
    expect(mockIssue.archive).toHaveBeenCalled()
    expect(mockIssue.delete).not.toHaveBeenCalled()
  })

  it('should archive an issue with --archive flag', async () => {
    const mockIssue = {
      archive: vi.fn().mockResolvedValue({ success: true }),
      delete: vi.fn(),
      id: 'issue-uuid-123',
      identifier: 'ENG-123',
      title: 'Test Issue',
    }

    mockClient.issue.mockResolvedValue(mockIssue)

    const IssueDelete = (await import('../../../src/commands/issue/delete.js')).default
    const command = new IssueDelete(['ENG-123', '--archive'], {} as any)
    await command.runWithArgs('ENG-123', { archive: true })

    expect(mockClient.issue).toHaveBeenCalledWith('ENG-123')
    expect(mockIssue.archive).toHaveBeenCalled()
    expect(mockIssue.delete).not.toHaveBeenCalled()
  })

  it('should permanently delete an issue with --permanent flag', async () => {
    const mockIssue = {
      archive: vi.fn(),
      delete: vi.fn().mockResolvedValue({ success: true }),
      id: 'issue-uuid-123',
      identifier: 'ENG-123',
      title: 'Test Issue',
    }

    mockClient.issue.mockResolvedValue(mockIssue)

    const IssueDelete = (await import('../../../src/commands/issue/delete.js')).default
    const command = new IssueDelete(['ENG-123', '--permanent'], {} as any)
    await command.runWithArgs('ENG-123', { permanent: true })

    expect(mockClient.issue).toHaveBeenCalledWith('ENG-123')
    expect(mockIssue.delete).toHaveBeenCalled()
    expect(mockIssue.archive).not.toHaveBeenCalled()
  })

  it('should output JSON when --json flag is provided', async () => {
    const mockIssue = {
      archive: vi.fn().mockResolvedValue({ success: true }),
      delete: vi.fn(),
      id: 'issue-uuid-123',
      identifier: 'ENG-123',
      title: 'Test Issue',
    }

    mockClient.issue.mockResolvedValue(mockIssue)

    const IssueDelete = (await import('../../../src/commands/issue/delete.js')).default
    const command = new IssueDelete(['ENG-123', '--json'], {} as any)
    await command.runWithArgs('ENG-123', { json: true })

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('"success": true'),
    )
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('"identifier": "ENG-123"'),
    )
  })

  it('should throw error when issue not found', async () => {
    mockClient.issue.mockResolvedValue(null)

    const IssueDelete = (await import('../../../src/commands/issue/delete.js')).default
    const command = new IssueDelete(['ENG-999'], {} as any)

    await expect(command.runWithArgs('ENG-999')).rejects.toThrow('Issue ENG-999 not found')
  })

  it('should throw error when no API key configured', async () => {
    vi.mocked(linearService.hasApiKey).mockReturnValue(false)

    const IssueDelete = (await import('../../../src/commands/issue/delete.js')).default
    const command = new IssueDelete(['ENG-123'], {} as any)

    await expect(command.runWithArgs('ENG-123')).rejects.toThrow(
      'No API key configured. Run "lc init" first.',
    )
  })
})
