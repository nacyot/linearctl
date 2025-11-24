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
      client: {
        request: vi.fn(),
      },
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
    const mockResponse = {
      issues: {
        nodes: [
          {
            assignee: { email: 'john@example.com', id: 'user-1', name: 'John Doe' },
            comments: { nodes: [{ id: 'comment-1' }, { id: 'comment-2' }] },
            createdAt: new Date('2024-01-01'),
            id: 'issue-1',
            identifier: 'ENG-123',
            state: { color: '#ff0000', id: 'state-1', name: 'In Progress', type: 'started' },
            title: 'Fix bug in login',
            updatedAt: new Date('2024-01-01'),
          },
          {
            assignee: null,
            comments: { nodes: [] },
            createdAt: new Date('2024-01-02'),
            id: 'issue-2',
            identifier: 'ENG-124',
            state: { color: '#00ff00', id: 'state-2', name: 'Todo', type: 'unstarted' },
            title: 'Add new feature',
            updatedAt: new Date('2024-01-02'),
          },
        ],
      },
    }

    mockClient.client.request.mockResolvedValue(mockResponse)

    const IssueList = (await import('../../../src/commands/issue/list.js')).default
    const cmd = new IssueList([], {} as any)
    await cmd.runWithoutParse({})

    expect(mockClient.client.request).toHaveBeenCalled()

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('ENG-123'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Fix bug in login'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('ENG-124'))
  })

  it('should display Updated and Comments columns in table', async () => {
    const now = new Date()
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000)

    const mockResponse = {
      issues: {
        nodes: [
          {
            assignee: { email: 'john@example.com', id: 'user-1', name: 'John Doe' },
            comments: { nodes: [{ id: 'comment-1' }, { id: 'comment-2' }, { id: 'comment-3' }] },
            createdAt: new Date('2024-01-01'),
            id: 'issue-1',
            identifier: 'ENG-123',
            state: { color: '#ff0000', id: 'state-1', name: 'In Progress', type: 'started' },
            title: 'Issue with comments',
            updatedAt: twoHoursAgo,
          },
          {
            assignee: null,
            comments: { nodes: [] },
            createdAt: new Date('2024-01-02'),
            id: 'issue-2',
            identifier: 'ENG-124',
            state: { color: '#00ff00', id: 'state-2', name: 'Todo', type: 'unstarted' },
            title: 'Issue without comments',
            updatedAt: new Date('2024-01-02'),
          },
        ],
      },
    }

    mockClient.client.request.mockResolvedValue(mockResponse)

    const IssueList = (await import('../../../src/commands/issue/list.js')).default
    const cmd = new IssueList([], {} as any)
    await cmd.runWithoutParse({})

    // Verify table headers include Updated and Comments
    const tableOutput = logSpy.mock.calls.find((call: any[]) =>
      call[0].includes('Updated') && call[0].includes('Comments')
    )
    expect(tableOutput).toBeTruthy()

    // Verify comment count is displayed (3 comments for first issue)
    const commentCountOutput = logSpy.mock.calls.find((call: any[]) =>
      call[0].includes('3')
    )
    expect(commentCountOutput).toBeTruthy()
  })

  it('should filter by team name', async () => {
    const mockTeams = {
      nodes: [
        { id: 'team-1', key: 'ENG', name: 'Engineering' },
      ],
    }

    const mockResponse = {
      issues: {
        nodes: [],
      },
    }

    mockClient.teams.mockResolvedValue(mockTeams)
    mockClient.client.request.mockResolvedValue(mockResponse)

    const IssueList = (await import('../../../src/commands/issue/list.js')).default
    const cmd = new IssueList([], {} as any)
    await cmd.runWithoutParse({ team: 'Engineering' })

    expect(mockClient.teams).toHaveBeenCalledWith({
      filter: { name: { eqIgnoreCase: 'Engineering' } },
      first: 1,
    })

    expect(mockClient.client.request).toHaveBeenCalled()
  })

  it('should filter by assignee', async () => {
    const mockUsers = {
      nodes: [
        { email: 'john@example.com', id: 'user-1', name: 'John Doe' },
      ],
    }

    const mockResponse = {
      issues: {
        nodes: [],
      },
    }

    mockClient.users.mockResolvedValue(mockUsers)
    mockClient.client.request.mockResolvedValue(mockResponse)

    const IssueList = (await import('../../../src/commands/issue/list.js')).default
    const cmd = new IssueList([], {} as any)
    await cmd.runWithoutParse({ assignee: 'John Doe' })

    expect(mockClient.users).toHaveBeenCalledWith({
      filter: { name: { eqIgnoreCase: 'John Doe' } },
    })

    expect(mockClient.client.request).toHaveBeenCalled()
  })

  it('should filter by state', async () => {
    const mockStates = {
      nodes: [
        { id: 'state-1', name: 'In Progress', type: 'started' },
      ],
    }

    const mockResponse = {
      issues: {
        nodes: [],
      },
    }

    mockClient.workflowStates.mockResolvedValue(mockStates)
    mockClient.client.request.mockResolvedValue(mockResponse)

    const IssueList = (await import('../../../src/commands/issue/list.js')).default
    const cmd = new IssueList([], {} as any)
    await cmd.runWithoutParse({ state: 'In Progress' })

    expect(mockClient.workflowStates).toHaveBeenCalledWith({
      filter: { name: { eqIgnoreCase: 'In Progress' } },
    })

    expect(mockClient.client.request).toHaveBeenCalled()
  })

  it('should handle pagination with limit', async () => {
    const mockResponse = {
      issues: {
        nodes: [],
      },
    }

    mockClient.client.request.mockResolvedValue(mockResponse)

    const IssueList = (await import('../../../src/commands/issue/list.js')).default
    const cmd = new IssueList([], {} as any)
    await cmd.runWithoutParse({ limit: 100 })

    expect(mockClient.client.request).toHaveBeenCalled()
  })

  it('should display message when no issues found', async () => {
    const mockResponse = {
      issues: {
        nodes: [],
      },
    }

    mockClient.client.request.mockResolvedValue(mockResponse)

    const IssueList = (await import('../../../src/commands/issue/list.js')).default
    const cmd = new IssueList([], {} as any)
    await cmd.runWithoutParse({})

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('No issues found'))
  })

  it('should handle errors gracefully', async () => {
    mockClient.client.request.mockRejectedValue(new Error('API error'))

    const IssueList = (await import('../../../src/commands/issue/list.js')).default
    const cmd = new IssueList([], {} as any)

    await expect(cmd.runWithoutParse({})).rejects.toThrow('API error')
  })
})