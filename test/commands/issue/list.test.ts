import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as linearService from '../../../src/services/linear.js'

// Mock the linear service
vi.mock('../../../src/services/linear.js', () => ({
  getLinearClient: vi.fn(),
  hasApiKey: vi.fn(),
}))

describe('issue list command', () => {
  let logSpy: any
  let errorSpy: any
  let mockClient: any

  beforeEach(() => {
    vi.clearAllMocks()
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    
    // Create mock client
    mockClient = {
      issueLabels: vi.fn(),
      issues: vi.fn(),
      teams: vi.fn(),
      users: vi.fn(),
      workflowStates: vi.fn(),
    }
    
    vi.mocked(linearService.hasApiKey).mockReturnValue(true)
    vi.mocked(linearService.getLinearClient).mockReturnValue(mockClient)
  })

  afterEach(() => {
    logSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it('should list all issues without filters', async () => {
    const mockIssues = {
      nodes: [
        {
          assignee: { name: 'John Doe' },
          createdAt: new Date('2024-01-01'),
          id: 'issue-1',
          identifier: 'ENG-123',
          state: { name: 'In Progress' },
          title: 'Fix bug in login',
        },
        {
          assignee: null,
          createdAt: new Date('2024-01-02'),
          id: 'issue-2',
          identifier: 'ENG-124',
          state: { name: 'Todo' },
          title: 'Add new feature',
        },
      ],
      pageInfo: {
        endCursor: null,
        hasNextPage: false,
      },
    }
    
    mockClient.issues.mockResolvedValue(mockIssues)
    
    const IssueList = (await import('../../../src/commands/issue/list.js')).default
    const cmd = new IssueList([], {} as any)
    await cmd.runWithoutParse({})
    
    expect(mockClient.issues).toHaveBeenCalledWith({
      first: 50,
      includeArchived: false,
      orderBy: expect.anything(),
    })
    
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('ENG-123'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Fix bug in login'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('ENG-124'))
  })

  it('should filter by team name', async () => {
    const mockTeams = {
      nodes: [
        { id: 'team-1', key: 'ENG', name: 'Engineering' },
      ],
    }
    
    mockClient.teams.mockResolvedValue(mockTeams)
    mockClient.issues.mockResolvedValue({ nodes: [], pageInfo: {} })
    
    const IssueList = (await import('../../../src/commands/issue/list.js')).default
    const cmd = new IssueList([], {} as any)
    await cmd.runWithoutParse({ team: 'Engineering' })
    
    expect(mockClient.teams).toHaveBeenCalledWith({
      filter: { name: { eqIgnoreCase: 'Engineering' } },
      first: 1,
    })
    
    expect(mockClient.issues).toHaveBeenCalledWith({
      filter: {
        team: { id: { eq: 'team-1' } },
      },
      first: 50,
      includeArchived: false,
      orderBy: expect.anything(),
    })
  })

  it('should filter by assignee', async () => {
    const mockUsers = {
      nodes: [
        { email: 'john@example.com', id: 'user-1', name: 'John Doe' },
      ],
    }
    
    mockClient.users.mockResolvedValue(mockUsers)
    mockClient.issues.mockResolvedValue({ nodes: [], pageInfo: {} })
    
    const IssueList = (await import('../../../src/commands/issue/list.js')).default
    const cmd = new IssueList([], {} as any)
    await cmd.runWithoutParse({ assignee: 'John Doe' })
    
    expect(mockClient.users).toHaveBeenCalledWith({
      filter: { name: { eqIgnoreCase: 'John Doe' } },
    })
    
    expect(mockClient.issues).toHaveBeenCalledWith({
      filter: {
        assignee: { id: { eq: 'user-1' } },
      },
      first: 50,
      includeArchived: false,
      orderBy: expect.anything(),
    })
  })

  it('should filter by state', async () => {
    const mockStates = {
      nodes: [
        { id: 'state-1', name: 'In Progress', type: 'started' },
      ],
    }
    
    mockClient.workflowStates.mockResolvedValue(mockStates)
    mockClient.issues.mockResolvedValue({ nodes: [], pageInfo: {} })
    
    const IssueList = (await import('../../../src/commands/issue/list.js')).default
    const cmd = new IssueList([], {} as any)
    await cmd.runWithoutParse({ state: 'In Progress' })
    
    expect(mockClient.workflowStates).toHaveBeenCalledWith({
      filter: { name: { eqIgnoreCase: 'In Progress' } },
    })
    
    expect(mockClient.issues).toHaveBeenCalledWith({
      filter: {
        state: { id: { in: ['state-1'] } },
      },
      first: 50,
      includeArchived: false,
      orderBy: expect.anything(),
    })
  })

  it('should handle pagination with limit', async () => {
    mockClient.issues.mockResolvedValue({ nodes: [], pageInfo: {} })
    
    const IssueList = (await import('../../../src/commands/issue/list.js')).default
    const cmd = new IssueList([], {} as any)
    await cmd.runWithoutParse({ limit: 100 })
    
    expect(mockClient.issues).toHaveBeenCalledWith({
      first: 100,
      includeArchived: false,
      orderBy: expect.anything(),
    })
  })

  it('should display message when no issues found', async () => {
    mockClient.issues.mockResolvedValue({ nodes: [], pageInfo: {} })
    
    const IssueList = (await import('../../../src/commands/issue/list.js')).default
    const cmd = new IssueList([], {} as any)
    await cmd.runWithoutParse({})
    
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('No issues found'))
  })

  it('should handle errors gracefully', async () => {
    mockClient.issues.mockRejectedValue(new Error('API error'))
    
    const IssueList = (await import('../../../src/commands/issue/list.js')).default
    const cmd = new IssueList([], {} as any)
    
    await expect(cmd.runWithoutParse({})).rejects.toThrow('API error')
  })
})