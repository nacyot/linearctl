import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as linearService from '../../../src/services/linear.js'

// Mock the linear service
vi.mock('../../../src/services/linear.js', () => ({
  getLinearClient: vi.fn(),
  hasApiKey: vi.fn(),
}))

describe('issue create command', () => {
  let logSpy: any
  let errorSpy: any
  let mockClient: any

  beforeEach(() => {
    vi.clearAllMocks()
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    
    // Create mock client
    mockClient = {
      createIssue: vi.fn(),
      issue: vi.fn(),
      issueLabels: vi.fn(),
      projects: vi.fn(),
      team: vi.fn(),
      teams: vi.fn(),
      users: vi.fn(),
    }
    
    vi.mocked(linearService.hasApiKey).mockReturnValue(true)
    vi.mocked(linearService.getLinearClient).mockReturnValue(mockClient)
  })

  afterEach(() => {
    logSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it('should create issue with required fields', async () => {
    const mockTeam = { nodes: [{ id: 'team-1', key: 'ENG' }] }
    const mockIssue = {
      id: 'issue-new',
      identifier: 'ENG-999',
      title: 'New feature',
      url: 'https://linear.app/company/issue/ENG-999',
    }
    const mockPayload = {
      issue: mockIssue,
      success: true,
    }
    
    mockClient.teams.mockResolvedValue(mockTeam)
    mockClient.createIssue.mockResolvedValue(mockPayload)
    
    const IssueCreate = (await import('../../../src/commands/issue/create.js')).default
    const cmd = new IssueCreate([], {} as any)
    await cmd.runWithFlags({
      team: 'ENG',
      title: 'New feature',
    })
    
    expect(mockClient.createIssue).toHaveBeenCalledWith({
      teamId: 'team-1',
      title: 'New feature',
    })
    
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('ENG-999'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('created successfully'))
  })

  it('should create issue with all optional fields', async () => {
    const mockTeam = { nodes: [{ id: 'team-1', key: 'ENG' }] }
    const mockUser = { nodes: [{ id: 'user-1', name: 'John Doe' }] }
    const mockStates = { nodes: [{ id: 'state-1', name: 'In Progress' }] }
    const mockLabelsBug = { nodes: [{ id: 'label-1', name: 'bug' }] }
    const mockLabelsHigh = { nodes: [{ id: 'label-2', name: 'high' }] }
    const mockProject = { nodes: [{ id: 'project-1', name: 'Q1 Goals' }] }
    
    const mockIssue = {
      id: 'issue-new',
      identifier: 'ENG-999',
      title: 'Bug fix',
      url: 'https://linear.app/company/issue/ENG-999',
    }
    const mockPayload = {
      issue: mockIssue,
      success: true,
    }
    
    const mockTeamInstance = {
      cycles: vi.fn().mockResolvedValue({ nodes: [] }),
      states: vi.fn().mockResolvedValue(mockStates),
    }
    
    mockClient.teams.mockResolvedValue(mockTeam)
    mockClient.team.mockResolvedValue(mockTeamInstance)
    mockClient.users.mockResolvedValue(mockUser)
    mockClient.issueLabels
      .mockResolvedValueOnce(mockLabelsBug)
      .mockResolvedValueOnce(mockLabelsHigh)
    mockClient.projects.mockResolvedValue(mockProject)
    mockClient.createIssue.mockResolvedValue(mockPayload)
    
    const IssueCreate = (await import('../../../src/commands/issue/create.js')).default
    const cmd = new IssueCreate([], {} as any)
    await cmd.runWithFlags({
      assignee: 'John Doe',
      description: 'Fix the login bug',
      'due-date': '2024-12-31',
      labels: 'bug,high',
      priority: 2,
      project: 'Q1 Goals',
      state: 'In Progress',
      team: 'ENG',
      title: 'Bug fix',
    })
    
    expect(mockClient.createIssue).toHaveBeenCalledWith({
      assigneeId: 'user-1',
      description: 'Fix the login bug',
      dueDate: '2024-12-31',
      labelIds: ['label-1', 'label-2'],
      priority: 2,
      projectId: 'project-1',
      stateId: 'state-1',
      teamId: 'team-1',
      title: 'Bug fix',
    })
  })

  it('should handle missing required fields', async () => {
    const IssueCreate = (await import('../../../src/commands/issue/create.js')).default
    const cmd = new IssueCreate([], {} as any)
    
    await expect(cmd.runWithFlags({
      title: 'New feature',
      // team is missing
    })).rejects.toThrow(/Team is required/)
  })

  it('should handle team not found', async () => {
    mockClient.teams.mockResolvedValue({ nodes: [] })
    
    const IssueCreate = (await import('../../../src/commands/issue/create.js')).default
    const cmd = new IssueCreate([], {} as any)
    
    await expect(cmd.runWithFlags({
      team: 'INVALID',
      title: 'New feature',
    })).rejects.toThrow(/Team .* not found/)
  })

  it('should handle API errors', async () => {
    const mockTeam = { nodes: [{ id: 'team-1', key: 'ENG' }] }
    mockClient.teams.mockResolvedValue(mockTeam)
    mockClient.createIssue.mockRejectedValue(new Error('API error'))

    const IssueCreate = (await import('../../../src/commands/issue/create.js')).default
    const cmd = new IssueCreate([], {} as any)

    await expect(cmd.runWithFlags({
      team: 'ENG',
      title: 'New feature',
    })).rejects.toThrow('API error')
  })

  it('should resolve parent issue identifier to UUID', async () => {
    const mockTeam = { nodes: [{ id: 'team-1', key: 'ENG' }] }
    const mockParentIssue = {
      id: 'parent-uuid-123',
      identifier: 'ENG-100',
      title: 'Parent issue'
    }
    const mockIssue = {
      id: 'issue-new',
      identifier: 'ENG-999',
      title: 'Child issue',
      url: 'https://linear.app/company/issue/ENG-999',
    }
    const mockPayload = {
      issue: mockIssue,
      success: true,
    }

    mockClient.teams.mockResolvedValue(mockTeam)
    mockClient.issue.mockResolvedValue(mockParentIssue)
    mockClient.createIssue.mockResolvedValue(mockPayload)

    const IssueCreate = (await import('../../../src/commands/issue/create.js')).default
    const cmd = new IssueCreate([], {} as any)
    await cmd.runWithFlags({
      parent: 'ENG-100',  // Using identifier instead of UUID
      team: 'ENG',
      title: 'Child issue',
    })

    // Verify issue resolution
    expect(mockClient.issue).toHaveBeenCalledWith('ENG-100')

    // Verify createIssue was called with parent UUID
    expect(mockClient.createIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        parentId: 'parent-uuid-123',  // Resolved UUID
      })
    )
  })
})