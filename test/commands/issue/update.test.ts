import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as linearService from '../../../src/services/linear.js'

// Mock the linear service
vi.mock('../../../src/services/linear.js', () => ({
  getLinearClient: vi.fn(),
  hasApiKey: vi.fn(),
}))

describe('issue update command', () => {
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
      issueLabels: vi.fn(),
      projects: vi.fn(),
      team: vi.fn(),
      users: vi.fn(),
    }
    
    vi.mocked(linearService.hasApiKey).mockReturnValue(true)
    vi.mocked(linearService.getLinearClient).mockReturnValue(mockClient)
  })

  afterEach(() => {
    logSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it('should update issue title', async () => {
    const mockTeam = { id: 'team-1', key: 'ENG' }
    const mockIssue = {
      id: 'issue-1',
      identifier: 'ENG-123',
      team: Promise.resolve(mockTeam),
      update: vi.fn().mockResolvedValue({
        issue: {
          id: 'issue-1',
          identifier: 'ENG-123',
          title: 'Updated title',
        },
        success: true,
      }),
    }
    
    mockClient.issue.mockResolvedValue(mockIssue)
    
    const IssueUpdate = (await import('../../../src/commands/issue/update.js')).default
    const cmd = new IssueUpdate(['ENG-123'], {} as any)
    await cmd.runWithArgs('ENG-123', { title: 'Updated title' })
    
    expect(mockClient.issue).toHaveBeenCalledWith('ENG-123')
    expect(mockIssue.update).toHaveBeenCalledWith({ title: 'Updated title' })
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('ENG-123'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('updated successfully'))
  })

  it('should update multiple fields', async () => {
    const mockUser = { nodes: [{ id: 'user-1', name: 'John Doe' }] }
    const mockStates = { nodes: [{ id: 'state-1', name: 'Done' }] }
    const mockTeamInstance = {
      states: vi.fn().mockResolvedValue(mockStates),
    }
    const mockTeam = { id: 'team-1', key: 'ENG' }
    
    const mockIssue = {
      id: 'issue-1',
      identifier: 'ENG-123',
      team: Promise.resolve(mockTeam),
      update: vi.fn().mockResolvedValue({
        issue: {
          id: 'issue-1',
          identifier: 'ENG-123',
        },
        success: true,
      }),
    }
    
    mockClient.issue.mockResolvedValue(mockIssue)
    mockClient.team.mockResolvedValue(mockTeamInstance)
    mockClient.users.mockResolvedValue(mockUser)
    
    const IssueUpdate = (await import('../../../src/commands/issue/update.js')).default
    const cmd = new IssueUpdate(['ENG-123'], {} as any)
    await cmd.runWithArgs('ENG-123', {
      assignee: 'John Doe',
      description: 'New description',
      priority: 1,
      state: 'Done',
      title: 'New title',
    })
    
    expect(mockIssue.update).toHaveBeenCalledWith({
      assigneeId: 'user-1',
      description: 'New description',
      priority: 1,
      stateId: 'state-1',
      title: 'New title',
    })
  })

  it('should handle issue not found', async () => {
    mockClient.issue.mockResolvedValue(null)
    
    const IssueUpdate = (await import('../../../src/commands/issue/update.js')).default
    const cmd = new IssueUpdate(['INVALID-999'], {} as any)
    
    await expect(cmd.runWithArgs('INVALID-999', { title: 'New' })).rejects.toThrow(/not found/)
  })

  it('should handle update failure', async () => {
    const mockTeam = { id: 'team-1', key: 'ENG' }
    const mockIssue = {
      id: 'issue-1',
      identifier: 'ENG-123',
      team: Promise.resolve(mockTeam),
      update: vi.fn().mockResolvedValue({
        success: false,
      }),
    }

    mockClient.issue.mockResolvedValue(mockIssue)

    const IssueUpdate = (await import('../../../src/commands/issue/update.js')).default
    const cmd = new IssueUpdate(['ENG-123'], {} as any)

    await expect(cmd.runWithArgs('ENG-123', { title: 'New' })).rejects.toThrow(/Failed to update/)
  })

  it('should add labels while preserving existing ones', async () => {
    const mockTeam = { id: 'team-1', key: 'ENG' }
    const mockIssue = {
      id: 'issue-1',
      identifier: 'ENG-123',
      labels: vi.fn().mockResolvedValue({
        nodes: [
          { id: 'label-1', name: 'bug' },
          { id: 'label-2', name: 'urgent' },
        ],
      }),
      team: Promise.resolve(mockTeam),
      update: vi.fn().mockResolvedValue({
        issue: { id: 'issue-1', identifier: 'ENG-123' },
        success: true,
      }),
    }

    mockClient.issue.mockResolvedValue(mockIssue)
    mockClient.issueLabels.mockResolvedValue({
      nodes: [{ id: 'label-3', name: 'feature' }],
    })

    const IssueUpdate = (await import('../../../src/commands/issue/update.js')).default
    const cmd = new IssueUpdate(['ENG-123'], {} as any)
    await cmd.runWithArgs('ENG-123', { 'add-labels': 'feature' })

    // Should fetch existing labels
    expect(mockIssue.labels).toHaveBeenCalled()

    // Should update with merged labels
    expect(mockIssue.update).toHaveBeenCalledWith(
      expect.objectContaining({
        labelIds: ['label-1', 'label-2', 'label-3'],
      })
    )
  })

  it('should remove specific labels', async () => {
    const mockTeam = { id: 'team-1', key: 'ENG' }
    const mockIssue = {
      id: 'issue-1',
      identifier: 'ENG-123',
      labels: vi.fn().mockResolvedValue({
        nodes: [
          { id: 'label-1', name: 'bug' },
          { id: 'label-2', name: 'urgent' },
          { id: 'label-3', name: 'feature' },
        ],
      }),
      team: Promise.resolve(mockTeam),
      update: vi.fn().mockResolvedValue({
        issue: { id: 'issue-1', identifier: 'ENG-123' },
        success: true,
      }),
    }

    mockClient.issue.mockResolvedValue(mockIssue)
    mockClient.issueLabels.mockResolvedValue({
      nodes: [{ id: 'label-2', name: 'urgent' }],
    })

    const IssueUpdate = (await import('../../../src/commands/issue/update.js')).default
    const cmd = new IssueUpdate(['ENG-123'], {} as any)
    await cmd.runWithArgs('ENG-123', { 'remove-labels': 'urgent' })

    // Should fetch existing labels
    expect(mockIssue.labels).toHaveBeenCalled()

    // Should update with filtered labels (removed 'urgent')
    expect(mockIssue.update).toHaveBeenCalledWith(
      expect.objectContaining({
        labelIds: ['label-1', 'label-3'],
      })
    )
  })

  it('should replace all labels when using --labels flag', async () => {
    const mockTeam = { id: 'team-1', key: 'ENG' }
    const mockIssue = {
      id: 'issue-1',
      identifier: 'ENG-123',
      labels: vi.fn(), // Add spy even though we expect it not to be called
      team: Promise.resolve(mockTeam),
      update: vi.fn().mockResolvedValue({
        issue: { id: 'issue-1', identifier: 'ENG-123' },
        success: true,
      }),
    }

    mockClient.issue.mockResolvedValue(mockIssue)
    mockClient.issueLabels.mockResolvedValue({
      nodes: [{ id: 'label-new', name: 'newlabel' }],
    })

    const IssueUpdate = (await import('../../../src/commands/issue/update.js')).default
    const cmd = new IssueUpdate(['ENG-123'], {} as any)
    await cmd.runWithArgs('ENG-123', { labels: 'newlabel' })

    // Should NOT fetch existing labels (replace mode)
    expect(mockIssue.labels).not.toHaveBeenCalled()

    // Should update with new labels only
    expect(mockIssue.update).toHaveBeenCalledWith(
      expect.objectContaining({
        labelIds: ['label-new'],
      })
    )
  })

  it('should create duplicate relationship and update state', async () => {
    const mockTeam = {
      id: 'team-1',
      key: 'ENG',
      states: vi.fn().mockResolvedValue({
        nodes: [
          { id: 'state-canceled', name: 'Canceled', type: 'canceled' },
          { id: 'state-duplicate', name: 'Duplicate', type: 'canceled' },
        ],
      }),
    }
    const mockIssue = {
      id: 'issue-1',
      identifier: 'ENG-123',
      team: Promise.resolve(mockTeam),
      update: vi.fn().mockResolvedValue({
        issue: { id: 'issue-1', identifier: 'ENG-123' },
        success: true,
      }),
    }
    const mockOriginalIssue = {
      id: 'original-uuid',
      identifier: 'ENG-100',
    }

    mockClient.issue
      .mockResolvedValueOnce(mockIssue) // First call for the issue being updated
      .mockResolvedValueOnce(mockOriginalIssue) // Second call for duplicate-of resolution

    mockClient.team = vi.fn().mockReturnValue(mockTeam)
    mockClient.createIssueRelation = vi.fn().mockResolvedValue({
      issueRelation: { id: 'relation-1' },
      success: true,
    })

    const IssueUpdate = (await import('../../../src/commands/issue/update.js')).default
    const cmd = new IssueUpdate(['ENG-123'], {} as any)
    await cmd.runWithArgs('ENG-123', { 'duplicate-of': 'ENG-100' })

    // Should resolve original issue
    expect(mockClient.issue).toHaveBeenCalledWith('ENG-100')

    // Should create duplicate relationship
    expect(mockClient.createIssueRelation).toHaveBeenCalledWith({
      issueId: 'issue-1',
      relatedIssueId: 'original-uuid',
      type: 'duplicate',
    })

    // Should update state to Duplicate or Canceled
    expect(mockIssue.update).toHaveBeenCalledWith(
      expect.objectContaining({
        stateId: expect.stringMatching(/state-(duplicate|canceled)/),
      })
    )
  })
})