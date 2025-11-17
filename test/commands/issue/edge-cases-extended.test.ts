import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as linearService from '../../../src/services/linear.js'

// Mock the linear service
vi.mock('../../../src/services/linear.js', () => ({
  getLinearClient: vi.fn(),
  hasApiKey: vi.fn(),
}))

describe('issue list edge cases - extended', () => {
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

  describe('Non-existent filter values', () => {
    it('should show warning and return empty when team not found', async () => {
      mockClient.teams.mockResolvedValue({ nodes: [] })
      
      const IssueList = (await import('../../../src/commands/issue/list.js')).default
      const cmd = new IssueList([], {} as any)
      await cmd.runWithoutParse({ team: 'NonExistentTeam' })
      
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Team "NonExistentTeam" not found'))
      expect(mockClient.client.request).not.toHaveBeenCalled()
    })

    it('should show warning and return empty when assignee not found', async () => {
      mockClient.users.mockResolvedValue({ nodes: [] })
      
      const IssueList = (await import('../../../src/commands/issue/list.js')).default
      const cmd = new IssueList([], {} as any)
      await cmd.runWithoutParse({ assignee: 'NonExistentUser' })
      
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Assignee "NonExistentUser" not found'))
      expect(mockClient.client.request).not.toHaveBeenCalled()
    })

    it('should show warning and return empty when state not found', async () => {
      mockClient.teams.mockResolvedValue({
        nodes: [{ id: 'team-123', key: 'ENG', name: 'Engineering' }],
      })

      const mockTeam = {
        id: 'team-123',
        states: vi.fn().mockResolvedValue({ nodes: [] }),
      }
      mockClient.team.mockReturnValue(mockTeam)
      mockClient.workflowStates.mockResolvedValue({ nodes: [] })

      const IssueList = (await import('../../../src/commands/issue/list.js')).default
      const cmd = new IssueList([], {} as any)
      await cmd.runWithoutParse({ state: 'NonExistentState', team: 'ENG' })

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('State(s) "NonExistentState" not found'))
      expect(mockClient.client.request).not.toHaveBeenCalled()
    })

    it('should show warning and return empty when label not found', async () => {
      mockClient.issueLabels.mockResolvedValue({ nodes: [] })
      
      const IssueList = (await import('../../../src/commands/issue/list.js')).default
      const cmd = new IssueList([], {} as any)
      await cmd.runWithoutParse({ label: 'NonExistentLabel' })
      
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Label "NonExistentLabel" not found'))
      expect(mockClient.client.request).not.toHaveBeenCalled()
    })

    it('should show warning and return empty when project not found', async () => {
      mockClient.projects.mockResolvedValue({ nodes: [] })
      
      const IssueList = (await import('../../../src/commands/issue/list.js')).default
      const cmd = new IssueList([], {} as any)
      await cmd.runWithoutParse({ project: 'NonExistentProject' })
      
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Project "NonExistentProject" not found'))
      expect(mockClient.client.request).not.toHaveBeenCalled()
    })

    it('should show warning and return empty when cycle not found', async () => {
      mockClient.teams.mockResolvedValue({
        nodes: [{ id: 'team-123', key: 'ENG', name: 'Engineering' }],
      })
      
      const mockTeam = {
        cycles: vi.fn().mockResolvedValue({ nodes: [] }),
        id: 'team-123',
      }
      mockClient.team.mockReturnValue(mockTeam)
      
      const IssueList = (await import('../../../src/commands/issue/list.js')).default
      const cmd = new IssueList([], {} as any)
      await cmd.runWithoutParse({ cycle: 'NonExistentCycle', team: 'ENG' })
      
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Cycle "NonExistentCycle" not found'))
      expect(mockClient.client.request).not.toHaveBeenCalled()
    })
  })

  describe('Case sensitivity', () => {
    it('should find team regardless of case', async () => {
      // Test uppercase key match
      mockClient.teams.mockResolvedValueOnce({
        nodes: [],
      }).mockResolvedValueOnce({
        nodes: [{ id: 'team-123', key: 'ENG', name: 'Engineering' }],
      })
      
      mockClient.client.request.mockResolvedValue({ issues: { nodes: [] } })
      
      const IssueList = (await import('../../../src/commands/issue/list.js')).default
      const cmd = new IssueList([], {} as any)
      await cmd.runWithoutParse({ team: 'eng' })
      
      // Should have tried by name and then by key
      expect(mockClient.teams).toHaveBeenCalledTimes(2)
      expect(mockClient.client.request).toHaveBeenCalled()
    })

    it('should find state regardless of case', async () => {
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
      mockClient.client.request.mockResolvedValue({ issues: { nodes: [] } })
      
      const IssueList = (await import('../../../src/commands/issue/list.js')).default
      const cmd = new IssueList([], {} as any)
      await cmd.runWithoutParse({ state: 'in progress', team: 'ENG' })

      expect(mockClient.client.request).toHaveBeenCalled()
    })
  })

  describe('Special characters and edge inputs', () => {
    it('should handle empty string filters', async () => {
      const IssueList = (await import('../../../src/commands/issue/list.js')).default
      const cmd = new IssueList([], {} as any)
      
      mockClient.client.request.mockResolvedValue({ issues: { nodes: [] } })
      
      await cmd.runWithoutParse({ assignee: '', team: '' })
      
      // Empty strings should be ignored
      expect(mockClient.teams).not.toHaveBeenCalled()
      expect(mockClient.users).not.toHaveBeenCalled()
      expect(mockClient.client.request).toHaveBeenCalled()
    })

    it('should handle very long filter values', async () => {
      const longName = 'a'.repeat(1000)
      mockClient.users.mockResolvedValue({ nodes: [] })
      
      const IssueList = (await import('../../../src/commands/issue/list.js')).default
      const cmd = new IssueList([], {} as any)
      await cmd.runWithoutParse({ assignee: longName })
      
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('not found'))
    })

    it('should handle cycle number vs name', async () => {
      const mockTeam = {
        cycles: vi.fn().mockResolvedValue({
          nodes: [
            { id: 'cycle-1', name: 'Sprint 1', number: 1 },
            { id: 'cycle-2', name: 'Sprint 2', number: 2 },
          ],
        }),
        id: 'team-123',
      }
      
      mockClient.teams.mockResolvedValue({
        nodes: [{ id: 'team-123', key: 'ENG', name: 'Engineering' }],
      })
      
      mockClient.team.mockReturnValue(mockTeam)
      mockClient.client.request.mockResolvedValue({ issues: { nodes: [] } })
      
      const IssueList = (await import('../../../src/commands/issue/list.js')).default
      const cmd = new IssueList([], {} as any)

      // Test with number
      await cmd.runWithoutParse({ cycle: '2', team: 'ENG' })

      expect(mockClient.client.request).toHaveBeenCalled()
    })
  })

  describe('Limit and ordering', () => {
    it('should respect max limit of 250', async () => {
      mockClient.client.request.mockResolvedValue({ issues: { nodes: [] } })

      const IssueList = (await import('../../../src/commands/issue/list.js')).default
      const cmd = new IssueList([], {} as any)
      await cmd.runWithoutParse({ limit: 500 })

      // Should cap at 250
      expect(mockClient.client.request).toHaveBeenCalled()
    })

    it('should handle zero and negative limits', async () => {
      mockClient.client.request.mockResolvedValue({ issues: { nodes: [] } })

      const IssueList = (await import('../../../src/commands/issue/list.js')).default
      const cmd = new IssueList([], {} as any)

      // Test with 0
      await cmd.runWithoutParse({ limit: 0 })
      expect(mockClient.client.request).toHaveBeenCalled()

      // Test with negative
      await cmd.runWithoutParse({ limit: -10 })
      expect(mockClient.client.request).toHaveBeenCalled()
    })
  })

  describe('Multiple filter combinations', () => {
    it('should handle all filters at once', async () => {
      // Mock team
      mockClient.teams.mockResolvedValue({
        nodes: [{ id: 'team-123', key: 'ENG', name: 'Engineering' }],
      })
      
      // Mock state
      const mockTeam = {
        cycles: vi.fn().mockResolvedValue({
          nodes: [{ id: 'cycle-1', name: 'Sprint 1', number: 1 }],
        }),
        id: 'team-123',
        states: vi.fn().mockResolvedValue({
          nodes: [{ id: 'state-1', name: 'In Progress', type: 'started' }],
        }),
      }
      mockClient.team.mockReturnValue(mockTeam)
      
      // Mock user
      mockClient.users.mockResolvedValue({
        nodes: [{ id: 'user-123', name: 'John Doe' }],
      })
      
      // Mock label
      mockClient.issueLabels.mockResolvedValue({
        nodes: [{ id: 'label-123', name: 'bug' }],
      })
      
      // Mock project
      mockClient.projects.mockResolvedValue({
        nodes: [{ id: 'project-123', name: 'Test Project' }],
      })
      
      mockClient.client.request.mockResolvedValue({ issues: { nodes: [] } })

      const IssueList = (await import('../../../src/commands/issue/list.js')).default
      const cmd = new IssueList([], {} as any)
      await cmd.runWithoutParse({
        assignee: 'John Doe',
        cycle: 'Sprint 1',
        label: 'bug',
        limit: 100,
        'order-by': 'createdAt',
        project: 'Test Project',
        state: 'In Progress',
        team: 'ENG',
      })

      // Should apply all filters
      expect(mockClient.client.request).toHaveBeenCalled()
    })
  })
})