import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as linearService from '../../../src/services/linear.js'

// Mock the linear service
vi.mock('../../../src/services/linear.js', () => ({
  getLinearClient: vi.fn(),
  hasApiKey: vi.fn(),
}))

describe('issue list filtering', () => {
  let logSpy: any
  let errorSpy: any
  let mockClient: any

  beforeEach(() => {
    vi.clearAllMocks()
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    
    // Create mock client
    mockClient = {
      cycles: vi.fn(),
      issue: vi.fn(),
      issueLabels: vi.fn(),
      issues: vi.fn(),
      projects: vi.fn(),
      team: vi.fn(),
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

  it('should filter issues by state with team context', async () => {
    const mockTeam = {
      id: 'team-123',
      states: vi.fn().mockResolvedValue({
        nodes: [
          { id: 'state-1', name: 'In Progress', type: 'started' },
          { id: 'state-2', name: 'Done', type: 'completed' },
        ],
      }),
    }
    
    mockClient.teams.mockResolvedValue({
      nodes: [{ id: 'team-123', key: 'ENG', name: 'Engineering' }],
    })
    
    mockClient.team.mockReturnValue(mockTeam)
    
    const mockIssues = {
      nodes: [
        {
          assignee: Promise.resolve(null),
          identifier: 'ENG-123',
          state: Promise.resolve({ name: 'In Progress', type: 'started' }),
          title: 'Test issue',
        },
      ],
    }
    
    mockClient.issues.mockResolvedValue(mockIssues)
    
    const IssueList = (await import('../../../src/commands/issue/list.js')).default
    const cmd = new IssueList([], {} as any)
    await cmd.runWithoutParse({ state: 'In Progress', team: 'ENG' })
    
    // Verify state was resolved with team context
    expect(mockClient.team).toHaveBeenCalledWith('team-123')
    expect(mockTeam.states).toHaveBeenCalled()
    
    // Verify issues were filtered
    expect(mockClient.issues).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: expect.objectContaining({
          state: { id: { in: ['state-1'] } },
          team: { id: { eq: 'team-123' } },
        }),
      })
    )
  })

  it('should filter issues by project', async () => {
    mockClient.projects.mockResolvedValue({
      nodes: [{ id: 'project-123', name: 'Test Project' }],
    })
    
    mockClient.teams.mockResolvedValue({ nodes: [] })
    
    const mockIssues = {
      nodes: [
        {
          assignee: Promise.resolve(null),
          identifier: 'PRJ-456',
          state: Promise.resolve({ name: 'Todo', type: 'unstarted' }),
          title: 'Project task',
        },
      ],
    }
    
    mockClient.issues.mockResolvedValue(mockIssues)
    
    const IssueList = (await import('../../../src/commands/issue/list.js')).default
    const cmd = new IssueList([], {} as any)
    await cmd.runWithoutParse({ project: 'Test Project' })
    
    // Verify project was resolved
    expect(mockClient.projects).toHaveBeenCalledWith({
      filter: { name: { containsIgnoreCase: 'Test Project' } },
      first: 1,
    })
    
    // Verify issues were filtered by project
    expect(mockClient.issues).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: expect.objectContaining({
          project: { id: { eq: 'project-123' } },
        }),
      })
    )
  })

  it('should filter issues by cycle with team context', async () => {
    const mockTeam = {
      cycles: vi.fn().mockResolvedValue({
        nodes: [
          { id: 'cycle-1', name: 'Cycle 1', number: 1 },
          { id: 'cycle-2', name: 'Cycle 2', number: 2 },
        ],
      }),
      id: 'team-123',
    }
    
    mockClient.teams.mockResolvedValue({
      nodes: [{ id: 'team-123', key: 'ENG', name: 'Engineering' }],
    })
    
    mockClient.team.mockReturnValue(mockTeam)
    
    const mockIssues = {
      nodes: [
        {
          assignee: Promise.resolve(null),
          identifier: 'ENG-789',
          state: Promise.resolve({ name: 'In Progress', type: 'started' }),
          title: 'Cycle task',
        },
      ],
    }
    
    mockClient.issues.mockResolvedValue(mockIssues)
    
    const IssueList = (await import('../../../src/commands/issue/list.js')).default
    const cmd = new IssueList([], {} as any)
    await cmd.runWithoutParse({ cycle: '2', team: 'ENG' })
    
    // Verify cycle was resolved with team context
    expect(mockClient.team).toHaveBeenCalledWith('team-123')
    expect(mockTeam.cycles).toHaveBeenCalled()
    
    // Verify issues were filtered
    expect(mockClient.issues).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: expect.objectContaining({
          cycle: { id: { eq: 'cycle-2' } },
          team: { id: { eq: 'team-123' } },
        }),
      })
    )
  })

  it('should handle multiple filters simultaneously', async () => {
    // Mock team resolution
    mockClient.teams.mockResolvedValue({
      nodes: [{ id: 'team-123', key: 'ENG', name: 'Engineering' }],
    })
    
    // Mock state resolution
    const mockTeam = {
      id: 'team-123',
      states: vi.fn().mockResolvedValue({
        nodes: [{ id: 'state-1', name: 'In Progress', type: 'started' }],
      }),
    }
    mockClient.team.mockReturnValue(mockTeam)
    
    // Mock user resolution
    mockClient.users.mockResolvedValue({
      nodes: [{ id: 'user-123', name: 'John Doe' }],
    })
    
    // Mock label resolution
    mockClient.issueLabels.mockResolvedValue({
      nodes: [{ id: 'label-123', name: 'bug' }],
    })
    
    const mockIssues = {
      nodes: [],
    }
    
    mockClient.issues.mockResolvedValue(mockIssues)
    
    const IssueList = (await import('../../../src/commands/issue/list.js')).default
    const cmd = new IssueList([], {} as any)
    await cmd.runWithoutParse({
      assignee: 'John Doe',
      label: 'bug',
      state: 'In Progress',
      team: 'ENG',
    })
    
    // Verify all filters were applied
    expect(mockClient.issues).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: expect.objectContaining({
          assignee: { id: { eq: 'user-123' } },
          labels: { id: { in: ['label-123'] } },
          state: { id: { in: ['state-1'] } },
          team: { id: { eq: 'team-123' } },
        }),
      })
    )
  })

  it('should handle filtering by label with special characters', async () => {
    // Test with label ID (contains hyphen)
    mockClient.issueLabels.mockResolvedValue({ nodes: [] })
    mockClient.issues.mockResolvedValue({ nodes: [] })

    const IssueList = (await import('../../../src/commands/issue/list.js')).default
    const cmd = new IssueList([], {} as any)
    await cmd.runWithoutParse({ label: '2be7acd3-9f68-4107-ac8c-1b182d60c517' })

    // Should not call issueLabels for IDs
    expect(mockClient.issueLabels).not.toHaveBeenCalled()

    // Should use the ID directly
    expect(mockClient.issues).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: expect.objectContaining({
          labels: { id: { in: ['2be7acd3-9f68-4107-ac8c-1b182d60c517'] } },
        }),
      })
    )
  })

  it('should filter by multiple states using comma-separated values', async () => {
    const mockTeam = {
      id: 'team-123',
      states: vi.fn().mockResolvedValue({
        nodes: [
          { id: 'state-1', name: 'Backlog', type: 'backlog' },
          { id: 'state-2', name: 'Todo', type: 'unstarted' },
          { id: 'state-3', name: 'In Progress', type: 'started' },
          { id: 'state-4', name: 'Done', type: 'completed' },
        ],
      }),
    }

    mockClient.teams.mockResolvedValue({
      nodes: [{ id: 'team-123', key: 'NAC', name: 'Nacyot' }],
    })

    mockClient.team.mockReturnValue(mockTeam)

    const mockIssues = {
      nodes: [
        {
          assignee: Promise.resolve(null),
          identifier: 'NAC-1',
          state: Promise.resolve({ name: 'Backlog', type: 'backlog' }),
          title: 'Issue 1',
        },
        {
          assignee: Promise.resolve(null),
          identifier: 'NAC-2',
          state: Promise.resolve({ name: 'Todo', type: 'unstarted' }),
          title: 'Issue 2',
        },
      ],
    }

    mockClient.issues.mockResolvedValue(mockIssues)

    const IssueList = (await import('../../../src/commands/issue/list.js')).default
    const cmd = new IssueList([], {} as any)
    await cmd.runWithoutParse({ state: 'Backlog,Todo,In Progress', team: 'NAC' })

    // Verify states were resolved
    expect(mockClient.team).toHaveBeenCalledWith('team-123')
    expect(mockTeam.states).toHaveBeenCalled()

    // Verify issues were filtered with 'in' operator
    expect(mockClient.issues).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: expect.objectContaining({
          state: { id: { in: ['state-1', 'state-2', 'state-3'] } },
          team: { id: { eq: 'team-123' } },
        }),
      })
    )
  })

  it('should exclude states using exclude-state flag', async () => {
    const mockTeam = {
      id: 'team-123',
      states: vi.fn().mockResolvedValue({
        nodes: [
          { id: 'state-1', name: 'Done', type: 'completed' },
          { id: 'state-2', name: 'Canceled', type: 'canceled' },
        ],
      }),
    }

    mockClient.teams.mockResolvedValue({
      nodes: [{ id: 'team-123', key: 'NAC', name: 'Nacyot' }],
    })

    mockClient.team.mockReturnValue(mockTeam)

    const mockIssues = {
      nodes: [
        {
          assignee: Promise.resolve(null),
          identifier: 'NAC-1',
          state: Promise.resolve({ name: 'Backlog', type: 'backlog' }),
          title: 'Active issue',
        },
      ],
    }

    mockClient.issues.mockResolvedValue(mockIssues)

    const IssueList = (await import('../../../src/commands/issue/list.js')).default
    const cmd = new IssueList([], {} as any)
    await cmd.runWithoutParse({ 'exclude-state': 'Done,Canceled', team: 'NAC' })

    // Verify issues were filtered with 'nin' operator
    expect(mockClient.issues).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: expect.objectContaining({
          state: { id: { nin: ['state-1', 'state-2'] } },
          team: { id: { eq: 'team-123' } },
        }),
      })
    )
  })

  it('should handle text search in title and description', async () => {
    mockClient.issues.mockResolvedValue({ nodes: [] })

    const IssueList = (await import('../../../src/commands/issue/list.js')).default
    const cmd = new IssueList([], {} as any)
    await cmd.runWithoutParse({ search: '블랙박스' })

    // Verify search filter with 'or' operator
    expect(mockClient.issues).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: expect.objectContaining({
          or: [
            { title: { containsIgnoreCase: '블랙박스' } },
            { description: { containsIgnoreCase: '블랙박스' } },
          ],
        }),
      })
    )
  })
})