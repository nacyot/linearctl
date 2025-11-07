import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as linearService from '../../../src/services/linear.js'

// Mock the linear service
vi.mock('../../../src/services/linear.js', () => ({
  getLinearClient: vi.fn(),
  hasApiKey: vi.fn(),
}))

// Mock cli-progress
vi.mock('cli-progress', () => ({
  default: {
    Presets: {
      // eslint-disable-next-line camelcase
      shades_classic: {},
    },
    SingleBar: vi.fn().mockImplementation(() => ({
      increment: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      update: vi.fn(),
    })),
  },
}))

describe('issue batch command', () => {
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

  describe('dry-run mode', () => {
    it('should preview changes without updating', async () => {
      const mockIssues = [
        {
          cycle: Promise.resolve({ id: 'cycle-1', name: 'Cycle 1', number: 1 }),
          id: 'issue-1',
          identifier: 'ENG-123',
          state: Promise.resolve({ name: 'Todo' }),
          team: Promise.resolve({ key: 'ENG', name: 'Engineering' }),
          title: 'Issue 1',
        },
        {
          cycle: Promise.resolve(null),
          id: 'issue-2',
          identifier: 'ENG-124',
          state: Promise.resolve({ name: 'In Progress' }),
          team: Promise.resolve({ key: 'ENG', name: 'Engineering' }),
          title: 'Issue 2',
        },
      ]

      mockClient.issue.mockImplementation((id: string) => {
        if (id === 'ENG-123') return Promise.resolve(mockIssues[0])
        if (id === 'ENG-124') return Promise.resolve(mockIssues[1])
        return Promise.resolve(null)
      })

      const mockCycle = {
        id: 'cycle-5',
        name: 'Cycle 5',
        number: 5,
      }

      mockClient.cycles.mockResolvedValue({
        nodes: [mockCycle],
      })

      const IssueBatch = (await import('../../../src/commands/issue/batch.js')).default
      const cmd = new IssueBatch([], {} as any)
      await cmd.runWithArgs({
        cycle: '5',
        'dry-run': true,
        ids: 'ENG-123,ENG-124',
      })

      // Should fetch issues
      expect(mockClient.issue).toHaveBeenCalledWith('ENG-123')
      expect(mockClient.issue).toHaveBeenCalledWith('ENG-124')

      // Should show preview
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('DRY RUN'))
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('ENG-123'))
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('ENG-124'))
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Set cycle to: 5'))

      // Should not call update
      expect(mockIssues[0].update).toBeUndefined()
    })

    it('should handle cycle "none" in dry-run', async () => {
      const mockIssue = {
        cycle: Promise.resolve({ id: 'cycle-1', name: 'Cycle 1', number: 1 }),
        id: 'issue-1',
        identifier: 'ENG-123',
        state: Promise.resolve({ name: 'Todo' }),
        team: Promise.resolve({ key: 'ENG', name: 'Engineering' }),
        title: 'Issue 1',
      }

      mockClient.issue.mockResolvedValue(mockIssue)

      const IssueBatch = (await import('../../../src/commands/issue/batch.js')).default
      const cmd = new IssueBatch([], {} as any)
      await cmd.runWithArgs({
        cycle: 'none',
        'dry-run': true,
        ids: 'ENG-123',
      })

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Remove cycle'))
    })
  })

  describe('actual updates', () => {
    it('should update cycle for multiple issues', async () => {
      const mockIssues = [
        {
          cycle: Promise.resolve(null),
          id: 'issue-1',
          identifier: 'ENG-123',
          team: Promise.resolve({ id: 'team-1', key: 'ENG' }),
          title: 'Issue 1',
          update: vi.fn().mockResolvedValue({ success: true }),
        },
        {
          cycle: Promise.resolve(null),
          id: 'issue-2',
          identifier: 'ENG-124',
          team: Promise.resolve({ id: 'team-1', key: 'ENG' }),
          title: 'Issue 2',
          update: vi.fn().mockResolvedValue({ success: true }),
        },
      ]

      mockClient.issue.mockImplementation((id: string) => {
        if (id === 'ENG-123') return Promise.resolve(mockIssues[0])
        if (id === 'ENG-124') return Promise.resolve(mockIssues[1])
        return Promise.resolve(null)
      })

      const mockCycle = {
        id: 'cycle-5',
        name: 'Cycle 5',
        number: 5,
      }

      mockClient.cycles.mockResolvedValue({
        nodes: [mockCycle],
      })

      const IssueBatch = (await import('../../../src/commands/issue/batch.js')).default
      const cmd = new IssueBatch([], {} as any)
      await cmd.runWithArgs({
        cycle: '5',
        ids: 'ENG-123,ENG-124',
      })

      // Should update both issues
      expect(mockIssues[0].update).toHaveBeenCalledWith({ cycleId: 'cycle-5' })
      expect(mockIssues[1].update).toHaveBeenCalledWith({ cycleId: 'cycle-5' })

      // Should show success summary
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Successfully updated: 2'))
    })

    it('should remove cycle when "none" is specified', async () => {
      const mockIssue = {
        cycle: Promise.resolve({ id: 'cycle-1', name: 'Cycle 1' }),
        id: 'issue-1',
        identifier: 'ENG-123',
        team: Promise.resolve({ id: 'team-1', key: 'ENG' }),
        title: 'Issue 1',
        update: vi.fn().mockResolvedValue({ success: true }),
      }

      mockClient.issue.mockResolvedValue(mockIssue)

      const IssueBatch = (await import('../../../src/commands/issue/batch.js')).default
      const cmd = new IssueBatch([], {} as any)
      await cmd.runWithArgs({
        cycle: 'none',
        ids: 'ENG-123',
      })

      expect(mockIssue.update).toHaveBeenCalledWith({ cycleId: null })
    })
  })

  describe('retry logic', () => {
    it('should retry on transient errors and eventually succeed', async () => {
      const mockIssue = {
        cycle: Promise.resolve(null),
        id: 'issue-1',
        identifier: 'ENG-123',
        team: Promise.resolve({ id: 'team-1', key: 'ENG' }),
        title: 'Issue 1',
        update: vi.fn()
          .mockRejectedValueOnce(new Error('Network error'))
          .mockRejectedValueOnce(new Error('Timeout'))
          .mockResolvedValueOnce({ success: true }),
      }

      mockClient.issue.mockResolvedValue(mockIssue)

      const mockCycle = {
        id: 'cycle-5',
        name: 'Cycle 5',
        number: 5,
      }

      mockClient.cycles.mockResolvedValue({
        nodes: [mockCycle],
      })

      const IssueBatch = (await import('../../../src/commands/issue/batch.js')).default
      const cmd = new IssueBatch([], {} as any)
      await cmd.runWithArgs({
        cycle: '5',
        ids: 'ENG-123',
      })

      // Should have retried 3 times total (2 failures + 1 success)
      expect(mockIssue.update).toHaveBeenCalledTimes(3)

      // Should show success
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Successfully updated: 1'))
    })

    it('should report failure after all retries exhausted', async () => {
      const mockIssue = {
        cycle: Promise.resolve(null),
        id: 'issue-1',
        identifier: 'ENG-123',
        team: Promise.resolve({ id: 'team-1', key: 'ENG' }),
        title: 'Issue 1',
        update: vi.fn().mockRejectedValue(new Error('Persistent error')),
      }

      mockClient.issue.mockResolvedValue(mockIssue)

      const mockCycle = {
        id: 'cycle-5',
        name: 'Cycle 5',
        number: 5,
      }

      mockClient.cycles.mockResolvedValue({
        nodes: [mockCycle],
      })

      const IssueBatch = (await import('../../../src/commands/issue/batch.js')).default
      const cmd = new IssueBatch([], {} as any)
      await cmd.runWithArgs({
        cycle: '5',
        ids: 'ENG-123',
      })

      // Should have tried maxRetries times (3 retries = 4 total attempts)
      expect(mockIssue.update).toHaveBeenCalledTimes(4)

      // Should show failure
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Failed'))
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('ENG-123'))
    })

    it('should continue processing other issues after one fails', async () => {
      const mockIssues = [
        {
          cycle: Promise.resolve(null),
          id: 'issue-1',
          identifier: 'ENG-123',
          team: Promise.resolve({ id: 'team-1', key: 'ENG' }),
          title: 'Issue 1',
          update: vi.fn().mockRejectedValue(new Error('Persistent error')),
        },
        {
          cycle: Promise.resolve(null),
          id: 'issue-2',
          identifier: 'ENG-124',
          team: Promise.resolve({ id: 'team-1', key: 'ENG' }),
          title: 'Issue 2',
          update: vi.fn().mockResolvedValue({ success: true }),
        },
      ]

      mockClient.issue.mockImplementation((id: string) => {
        if (id === 'ENG-123') return Promise.resolve(mockIssues[0])
        if (id === 'ENG-124') return Promise.resolve(mockIssues[1])
        return Promise.resolve(null)
      })

      const mockCycle = {
        id: 'cycle-5',
        name: 'Cycle 5',
        number: 5,
      }

      mockClient.cycles.mockResolvedValue({
        nodes: [mockCycle],
      })

      const IssueBatch = (await import('../../../src/commands/issue/batch.js')).default
      const cmd = new IssueBatch([], {} as any)
      await cmd.runWithArgs({
        cycle: '5',
        ids: 'ENG-123,ENG-124',
      })

      // Should show mixed results
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Successfully updated: 1'))
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Failed: 1'))
    })
  })

  describe('error handling', () => {
    it('should handle missing API key', async () => {
      vi.mocked(linearService.hasApiKey).mockReturnValue(false)

      const IssueBatch = (await import('../../../src/commands/issue/batch.js')).default
      const cmd = new IssueBatch([], {} as any)

      await expect(cmd.runWithArgs({
        cycle: '5',
        ids: 'ENG-123',
      })).rejects.toThrow(/No API key/)
    })

    it('should handle invalid issue ID', async () => {
      mockClient.issue.mockResolvedValue(null)

      const IssueBatch = (await import('../../../src/commands/issue/batch.js')).default
      const cmd = new IssueBatch([], {} as any)

      await expect(cmd.runWithArgs({
        cycle: '5',
        ids: 'INVALID-999',
      })).rejects.toThrow(/not found/)
    })

    it('should handle invalid cycle', async () => {
      const mockIssue = {
        cycle: Promise.resolve(null),
        id: 'issue-1',
        identifier: 'ENG-123',
        team: Promise.resolve({ id: 'team-1', key: 'ENG' }),
        title: 'Issue 1',
      }

      mockClient.issue.mockResolvedValue(mockIssue)
      mockClient.cycles.mockResolvedValue({ nodes: [] })

      const IssueBatch = (await import('../../../src/commands/issue/batch.js')).default
      const cmd = new IssueBatch([], {} as any)

      await expect(cmd.runWithArgs({
        cycle: '999',
        ids: 'ENG-123',
      })).rejects.toThrow(/Cycle.*not found/)
    })

    it('should require either --ids or --query', async () => {
      const IssueBatch = (await import('../../../src/commands/issue/batch.js')).default
      const cmd = new IssueBatch([], {} as any)

      await expect(cmd.runWithArgs({
        cycle: '5',
      })).rejects.toThrow(/Either --ids or --query is required/)
    })

    it('should require at least one update field', async () => {
      const IssueBatch = (await import('../../../src/commands/issue/batch.js')).default
      const cmd = new IssueBatch([], {} as any)

      await expect(cmd.runWithArgs({
        ids: 'ENG-123',
      })).rejects.toThrow(/At least one update field is required/)
    })

    it('should handle invalid due date format', async () => {
      const mockIssue = {
        id: 'issue-1',
        identifier: 'ENG-123',
        team: Promise.resolve({ id: 'team-1', key: 'ENG' }),
        title: 'Issue 1',
      }

      mockClient.issue.mockResolvedValue(mockIssue)

      const IssueBatch = (await import('../../../src/commands/issue/batch.js')).default
      const cmd = new IssueBatch([], {} as any)

      await expect(cmd.runWithArgs({
        'due-date': 'invalid-date',
        ids: 'ENG-123',
      })).rejects.toThrow(/Invalid due date format/)
    })

    it('should handle project not found', async () => {
      const mockIssue = {
        id: 'issue-1',
        identifier: 'ENG-123',
        team: Promise.resolve({ id: 'team-1', key: 'ENG' }),
        title: 'Issue 1',
      }

      mockClient.issue.mockResolvedValue(mockIssue)
      mockClient.projects = vi.fn().mockResolvedValue({ nodes: [] })

      const IssueBatch = (await import('../../../src/commands/issue/batch.js')).default
      const cmd = new IssueBatch([], {} as any)

      await expect(cmd.runWithArgs({
        ids: 'ENG-123',
        project: 'NonExistent',
      })).rejects.toThrow(/Project.*not found/)
    })

    it('should handle query with no matching issues', async () => {
      mockClient.issues = vi.fn().mockResolvedValue({ nodes: [] })
      mockClient.workflowStates = vi.fn().mockResolvedValue({
        nodes: [{ id: 'state-1', name: 'Todo' }],
      })

      const IssueBatch = (await import('../../../src/commands/issue/batch.js')).default
      const cmd = new IssueBatch([], {} as any)

      await expect(cmd.runWithArgs({
        cycle: '5',
        query: 'state:Todo',
      })).rejects.toThrow(/No issues found matching query/)
    })
  })

  describe('JSON output', () => {
    it('should output JSON when flag is set', async () => {
      const mockIssue = {
        cycle: Promise.resolve(null),
        id: 'issue-1',
        identifier: 'ENG-123',
        team: Promise.resolve({ id: 'team-1', key: 'ENG' }),
        title: 'Issue 1',
        update: vi.fn().mockResolvedValue({ success: true }),
      }

      mockClient.issue.mockResolvedValue(mockIssue)

      const mockCycle = {
        id: 'cycle-5',
        name: 'Cycle 5',
        number: 5,
      }

      mockClient.cycles.mockResolvedValue({
        nodes: [mockCycle],
      })

      const IssueBatch = (await import('../../../src/commands/issue/batch.js')).default
      const cmd = new IssueBatch([], {} as any)
      await cmd.runWithArgs({
        cycle: '5',
        ids: 'ENG-123',
        json: true,
      })

      const jsonOutput = logSpy.mock.calls.find((call: any[]) => {
        try {
          const parsed = JSON.parse(call[0])
          return parsed.succeeded !== undefined
        } catch {
          return false
        }
      })

      expect(jsonOutput).toBeTruthy()
      const result = JSON.parse(jsonOutput[0])
      expect(result.succeeded).toEqual(['ENG-123'])
      expect(result.failed).toEqual([])
    })
  })

  describe('extended batch updates', () => {
    it('should update state for multiple issues', async () => {
      const mockTeam = {
        id: 'team-1',
        states: vi.fn().mockResolvedValue({
          nodes: [{ id: 'state-done', name: 'Done', type: 'completed' }],
        }),
      }

      const mockIssues = [
        {
          id: 'issue-1',
          identifier: 'ENG-123',
          team: Promise.resolve(mockTeam),
          title: 'Issue 1',
          update: vi.fn().mockResolvedValue({ success: true }),
        },
        {
          id: 'issue-2',
          identifier: 'ENG-124',
          team: Promise.resolve(mockTeam),
          title: 'Issue 2',
          update: vi.fn().mockResolvedValue({ success: true }),
        },
      ]

      mockClient.issue.mockImplementation((id: string) => {
        if (id === 'ENG-123') return Promise.resolve(mockIssues[0])
        if (id === 'ENG-124') return Promise.resolve(mockIssues[1])
        return Promise.resolve(null)
      })

      mockClient.team.mockReturnValue(mockTeam)

      const IssueBatch = (await import('../../../src/commands/issue/batch.js')).default
      const cmd = new IssueBatch([], {} as any)
      await cmd.runWithArgs({
        ids: 'ENG-123,ENG-124',
        state: 'Done',
      })

      // Should update both issues with state
      expect(mockIssues[0].update).toHaveBeenCalledWith({ stateId: 'state-done' })
      expect(mockIssues[1].update).toHaveBeenCalledWith({ stateId: 'state-done' })

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Successfully updated: 2'))
    })

    it('should update assignee for multiple issues', async () => {
      const mockIssues = [
        {
          id: 'issue-1',
          identifier: 'ENG-123',
          team: Promise.resolve({ id: 'team-1', key: 'ENG' }),
          title: 'Issue 1',
          update: vi.fn().mockResolvedValue({ success: true }),
        },
        {
          id: 'issue-2',
          identifier: 'ENG-124',
          team: Promise.resolve({ id: 'team-1', key: 'ENG' }),
          title: 'Issue 2',
          update: vi.fn().mockResolvedValue({ success: true }),
        },
      ]

      mockClient.issue.mockImplementation((id: string) => {
        if (id === 'ENG-123') return Promise.resolve(mockIssues[0])
        if (id === 'ENG-124') return Promise.resolve(mockIssues[1])
        return Promise.resolve(null)
      })

      mockClient.users.mockResolvedValue({
        nodes: [{ id: 'user-john', name: 'John Doe' }],
      })

      const IssueBatch = (await import('../../../src/commands/issue/batch.js')).default
      const cmd = new IssueBatch([], {} as any)
      await cmd.runWithArgs({
        assignee: 'John Doe',
        ids: 'ENG-123,ENG-124',
      })

      // Should update both issues with assignee
      expect(mockIssues[0].update).toHaveBeenCalledWith({ assigneeId: 'user-john' })
      expect(mockIssues[1].update).toHaveBeenCalledWith({ assigneeId: 'user-john' })

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Successfully updated: 2'))
    })

    it('should add labels for multiple issues', async () => {
      const mockIssues = [
        {
          id: 'issue-1',
          identifier: 'ENG-123',
          labels: vi.fn().mockResolvedValue({
            nodes: [{ id: 'label-bug', name: 'bug' }],
          }),
          team: Promise.resolve({ id: 'team-1', key: 'ENG' }),
          title: 'Issue 1',
          update: vi.fn().mockResolvedValue({ success: true }),
        },
        {
          id: 'issue-2',
          identifier: 'ENG-124',
          labels: vi.fn().mockResolvedValue({
            nodes: [{ id: 'label-feature', name: 'feature' }],
          }),
          team: Promise.resolve({ id: 'team-1', key: 'ENG' }),
          title: 'Issue 2',
          update: vi.fn().mockResolvedValue({ success: true }),
        },
      ]

      mockClient.issue.mockImplementation((id: string) => {
        if (id === 'ENG-123') return Promise.resolve(mockIssues[0])
        if (id === 'ENG-124') return Promise.resolve(mockIssues[1])
        return Promise.resolve(null)
      })

      mockClient.issueLabels.mockResolvedValue({
        nodes: [{ id: 'label-urgent', name: 'urgent' }],
      })

      const IssueBatch = (await import('../../../src/commands/issue/batch.js')).default
      const cmd = new IssueBatch([], {} as any)
      await cmd.runWithArgs({
        'add-labels': 'urgent',
        ids: 'ENG-123,ENG-124',
      })

      // Should fetch existing labels and merge
      expect(mockIssues[0].labels).toHaveBeenCalled()
      expect(mockIssues[1].labels).toHaveBeenCalled()

      // Should update both issues with merged labels
      expect(mockIssues[0].update).toHaveBeenCalledWith({
        labelIds: ['label-bug', 'label-urgent'],
      })
      expect(mockIssues[1].update).toHaveBeenCalledWith({
        labelIds: ['label-feature', 'label-urgent'],
      })

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Successfully updated: 2'))
    })

    it('should support multiple fields at once', async () => {
      const mockTeam = {
        id: 'team-1',
        states: vi.fn().mockResolvedValue({
          nodes: [{ id: 'state-done', name: 'Done', type: 'completed' }],
        }),
      }

      const mockIssue = {
        id: 'issue-1',
        identifier: 'ENG-123',
        labels: vi.fn().mockResolvedValue({
          nodes: [{ id: 'label-bug', name: 'bug' }],
        }),
        team: Promise.resolve(mockTeam),
        title: 'Issue 1',
        update: vi.fn().mockResolvedValue({ success: true }),
      }

      mockClient.issue.mockResolvedValue(mockIssue)
      mockClient.team.mockReturnValue(mockTeam)

      mockClient.users.mockResolvedValue({
        nodes: [{ id: 'user-john', name: 'John Doe' }],
      })

      mockClient.issueLabels.mockResolvedValue({
        nodes: [{ id: 'label-urgent', name: 'urgent' }],
      })

      const IssueBatch = (await import('../../../src/commands/issue/batch.js')).default
      const cmd = new IssueBatch([], {} as any)
      await cmd.runWithArgs({
        'add-labels': 'urgent',
        assignee: 'John Doe',
        ids: 'ENG-123',
        state: 'Done',
      })

      // Should update with all fields
      expect(mockIssue.update).toHaveBeenCalledWith({
        assigneeId: 'user-john',
        labelIds: ['label-bug', 'label-urgent'],
        stateId: 'state-done',
      })

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Successfully updated: 1'))
    })

    it('should update priority for multiple issues', async () => {
      const mockIssues = [
        {
          id: 'issue-1',
          identifier: 'ENG-123',
          team: Promise.resolve({ id: 'team-1', key: 'ENG' }),
          title: 'Issue 1',
          update: vi.fn().mockResolvedValue({ success: true }),
        },
        {
          id: 'issue-2',
          identifier: 'ENG-124',
          team: Promise.resolve({ id: 'team-1', key: 'ENG' }),
          title: 'Issue 2',
          update: vi.fn().mockResolvedValue({ success: true }),
        },
      ]

      mockClient.issue.mockImplementation((id: string) => {
        if (id === 'ENG-123') return Promise.resolve(mockIssues[0])
        if (id === 'ENG-124') return Promise.resolve(mockIssues[1])
        return Promise.resolve(null)
      })

      const IssueBatch = (await import('../../../src/commands/issue/batch.js')).default
      const cmd = new IssueBatch([], {} as any)
      await cmd.runWithArgs({
        ids: 'ENG-123,ENG-124',
        priority: 1,
      })

      // Should update both issues with priority
      expect(mockIssues[0].update).toHaveBeenCalledWith({ priority: 1 })
      expect(mockIssues[1].update).toHaveBeenCalledWith({ priority: 1 })

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Successfully updated: 2'))
    })

    it('should update due date for multiple issues', async () => {
      const mockIssues = [
        {
          id: 'issue-1',
          identifier: 'ENG-123',
          team: Promise.resolve({ id: 'team-1', key: 'ENG' }),
          title: 'Issue 1',
          update: vi.fn().mockResolvedValue({ success: true }),
        },
        {
          id: 'issue-2',
          identifier: 'ENG-124',
          team: Promise.resolve({ id: 'team-1', key: 'ENG' }),
          title: 'Issue 2',
          update: vi.fn().mockResolvedValue({ success: true }),
        },
      ]

      mockClient.issue.mockImplementation((id: string) => {
        if (id === 'ENG-123') return Promise.resolve(mockIssues[0])
        if (id === 'ENG-124') return Promise.resolve(mockIssues[1])
        return Promise.resolve(null)
      })

      const IssueBatch = (await import('../../../src/commands/issue/batch.js')).default
      const cmd = new IssueBatch([], {} as any)
      await cmd.runWithArgs({
        'due-date': '2025-12-31',
        ids: 'ENG-123,ENG-124',
      })

      // Should update both issues with due date
      expect(mockIssues[0].update).toHaveBeenCalledWith({ dueDate: '2025-12-31' })
      expect(mockIssues[1].update).toHaveBeenCalledWith({ dueDate: '2025-12-31' })

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Successfully updated: 2'))
    })

    it('should clear due date when "none" is specified', async () => {
      const mockIssue = {
        id: 'issue-1',
        identifier: 'ENG-123',
        team: Promise.resolve({ id: 'team-1', key: 'ENG' }),
        title: 'Issue 1',
        update: vi.fn().mockResolvedValue({ success: true }),
      }

      mockClient.issue.mockResolvedValue(mockIssue)

      const IssueBatch = (await import('../../../src/commands/issue/batch.js')).default
      const cmd = new IssueBatch([], {} as any)
      await cmd.runWithArgs({
        'due-date': 'none',
        ids: 'ENG-123',
      })

      expect(mockIssue.update).toHaveBeenCalledWith({ dueDate: null })
    })

    it('should update project for multiple issues', async () => {
      const mockIssues = [
        {
          id: 'issue-1',
          identifier: 'ENG-123',
          team: Promise.resolve({ id: 'team-1', key: 'ENG' }),
          title: 'Issue 1',
          update: vi.fn().mockResolvedValue({ success: true }),
        },
        {
          id: 'issue-2',
          identifier: 'ENG-124',
          team: Promise.resolve({ id: 'team-1', key: 'ENG' }),
          title: 'Issue 2',
          update: vi.fn().mockResolvedValue({ success: true }),
        },
      ]

      mockClient.issue.mockImplementation((id: string) => {
        if (id === 'ENG-123') return Promise.resolve(mockIssues[0])
        if (id === 'ENG-124') return Promise.resolve(mockIssues[1])
        return Promise.resolve(null)
      })

      mockClient.projects = vi.fn().mockResolvedValue({
        nodes: [{ id: 'project-123', name: 'Q4 Launch' }],
      })

      const IssueBatch = (await import('../../../src/commands/issue/batch.js')).default
      const cmd = new IssueBatch([], {} as any)
      await cmd.runWithArgs({
        ids: 'ENG-123,ENG-124',
        project: 'Q4 Launch',
      })

      // Should update both issues with project
      expect(mockIssues[0].update).toHaveBeenCalledWith({ projectId: 'project-123' })
      expect(mockIssues[1].update).toHaveBeenCalledWith({ projectId: 'project-123' })

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Successfully updated: 2'))
    })

    it('should remove labels for multiple issues', async () => {
      const mockIssues = [
        {
          id: 'issue-1',
          identifier: 'ENG-123',
          labels: vi.fn().mockResolvedValue({
            nodes: [
              { id: 'label-bug', name: 'bug' },
              { id: 'label-urgent', name: 'urgent' },
            ],
          }),
          team: Promise.resolve({ id: 'team-1', key: 'ENG' }),
          title: 'Issue 1',
          update: vi.fn().mockResolvedValue({ success: true }),
        },
        {
          id: 'issue-2',
          identifier: 'ENG-124',
          labels: vi.fn().mockResolvedValue({
            nodes: [
              { id: 'label-feature', name: 'feature' },
              { id: 'label-urgent', name: 'urgent' },
            ],
          }),
          team: Promise.resolve({ id: 'team-1', key: 'ENG' }),
          title: 'Issue 2',
          update: vi.fn().mockResolvedValue({ success: true }),
        },
      ]

      mockClient.issue.mockImplementation((id: string) => {
        if (id === 'ENG-123') return Promise.resolve(mockIssues[0])
        if (id === 'ENG-124') return Promise.resolve(mockIssues[1])
        return Promise.resolve(null)
      })

      mockClient.issueLabels.mockResolvedValue({
        nodes: [{ id: 'label-urgent', name: 'urgent' }],
      })

      const IssueBatch = (await import('../../../src/commands/issue/batch.js')).default
      const cmd = new IssueBatch([], {} as any)
      await cmd.runWithArgs({
        ids: 'ENG-123,ENG-124',
        'remove-labels': 'urgent',
      })

      // Should fetch existing labels and remove specified ones
      expect(mockIssues[0].labels).toHaveBeenCalled()
      expect(mockIssues[1].labels).toHaveBeenCalled()

      // Should update both issues with labels after removal
      expect(mockIssues[0].update).toHaveBeenCalledWith({
        labelIds: ['label-bug'],
      })
      expect(mockIssues[1].update).toHaveBeenCalledWith({
        labelIds: ['label-feature'],
      })

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Successfully updated: 2'))
    })

    it('should support both add and remove labels at once', async () => {
      const mockIssue = {
        id: 'issue-1',
        identifier: 'ENG-123',
        labels: vi.fn().mockResolvedValue({
          nodes: [
            { id: 'label-bug', name: 'bug' },
            { id: 'label-old', name: 'old' },
          ],
        }),
        team: Promise.resolve({ id: 'team-1', key: 'ENG' }),
        title: 'Issue 1',
        update: vi.fn().mockResolvedValue({ success: true }),
      }

      mockClient.issue.mockResolvedValue(mockIssue)

      mockClient.issueLabels
        .mockResolvedValueOnce({
          nodes: [{ id: 'label-urgent', name: 'urgent' }],
        })
        .mockResolvedValueOnce({
          nodes: [{ id: 'label-old', name: 'old' }],
        })

      const IssueBatch = (await import('../../../src/commands/issue/batch.js')).default
      const cmd = new IssueBatch([], {} as any)
      await cmd.runWithArgs({
        'add-labels': 'urgent',
        ids: 'ENG-123',
        'remove-labels': 'old',
      })

      // Should update with labels: existing + added - removed
      expect(mockIssue.update).toHaveBeenCalledWith({
        labelIds: ['label-bug', 'label-urgent'],
      })

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Successfully updated: 1'))
    })
  })

  describe('query and limit behavior', () => {
    beforeEach(() => {
      mockClient.issues = vi.fn()
      mockClient.workflowStates = vi.fn()
      mockClient.teams = vi.fn()
    })

    it('should respect limit when using query', async () => {
      // Mock 10 issues returned from query
      const mockIssues = Array.from({ length: 10 }, (_, i) => ({
        id: `issue-${i}`,
        identifier: `ENG-${i}`,
        team: Promise.resolve({
          id: 'team-1',
          key: 'ENG',
          states: vi.fn().mockResolvedValue({
            nodes: [{ id: 'state-progress', name: 'In Progress' }],
          }),
        }),
        title: `Issue ${i}`,
        update: vi.fn().mockResolvedValue({ success: true }),
      }))

      mockClient.issues.mockResolvedValue({ nodes: mockIssues })
      mockClient.workflowStates.mockResolvedValue({
        nodes: [{ id: 'state-1', name: 'Todo' }],
      })

      const IssueBatch = (await import('../../../src/commands/issue/batch.js')).default
      const cmd = new IssueBatch([], {} as any)

      await cmd.runWithArgs({
        json: true,
        limit: 10,
        query: 'state:Todo',
        state: 'In Progress',
      })

      // Should fetch with limit 10
      expect(mockClient.issues).toHaveBeenCalledWith({
        filter: expect.any(Object),
        first: 10,
      })
    })

    it('should use 250 as limit when limit=0 (unlimited)', async () => {
      mockClient.issues.mockResolvedValue({ nodes: [] })
      mockClient.workflowStates.mockResolvedValue({
        nodes: [{ id: 'state-1', name: 'Todo' }],
      })

      const IssueBatch = (await import('../../../src/commands/issue/batch.js')).default
      const cmd = new IssueBatch([], {} as any)

      await expect(cmd.runWithArgs({
        json: true,
        limit: 0,
        query: 'state:Todo',
        state: 'In Progress',
      })).rejects.toThrow(/No issues found/)

      // Should fetch with max 250
      expect(mockClient.issues).toHaveBeenCalledWith({
        filter: expect.any(Object),
        first: 250,
      })
    })

    it('should cap limit at 250 when limit > 250', async () => {
      mockClient.issues.mockResolvedValue({ nodes: [] })
      mockClient.workflowStates.mockResolvedValue({
        nodes: [{ id: 'state-1', name: 'Todo' }],
      })

      const IssueBatch = (await import('../../../src/commands/issue/batch.js')).default
      const cmd = new IssueBatch([], {} as any)

      await expect(cmd.runWithArgs({
        json: true,
        limit: 500,
        query: 'state:Todo',
        state: 'In Progress',
      })).rejects.toThrow(/No issues found/)

      // Should cap at 250
      expect(mockClient.issues).toHaveBeenCalledWith({
        filter: expect.any(Object),
        first: 250,
      })
    })

    it('should handle query with team not found', async () => {
      mockClient.teams.mockResolvedValue({ nodes: [] })

      const IssueBatch = (await import('../../../src/commands/issue/batch.js')).default
      const cmd = new IssueBatch([], {} as any)

      await expect(cmd.runWithArgs({
        cycle: '5',
        query: 'team:NonExistent',
      })).rejects.toThrow(/Team.*not found/)
    })

    it('should handle query with state not found', async () => {
      mockClient.workflowStates.mockResolvedValue({ nodes: [] })

      const IssueBatch = (await import('../../../src/commands/issue/batch.js')).default
      const cmd = new IssueBatch([], {} as any)

      await expect(cmd.runWithArgs({
        cycle: '5',
        query: 'state:NonExistent',
      })).rejects.toThrow(/State.*not found/)
    })
  })

  describe('label edge cases', () => {
    it('should handle adding label that does not exist', async () => {
      const mockIssue = {
        id: 'issue-1',
        identifier: 'ENG-123',
        labels: vi.fn().mockResolvedValue({ nodes: [] }),
        team: Promise.resolve({ id: 'team-1', key: 'ENG' }),
        title: 'Issue 1',
        update: vi.fn().mockResolvedValue({ success: true }),
      }

      mockClient.issue.mockResolvedValue(mockIssue)
      mockClient.issueLabels.mockResolvedValue({ nodes: [] })

      const IssueBatch = (await import('../../../src/commands/issue/batch.js')).default
      const cmd = new IssueBatch([], {} as any)

      await cmd.runWithArgs({
        'add-labels': 'nonexistent',
        ids: 'ENG-123',
      })

      // Should still call update but with empty payload (no labels to add)
      expect(mockIssue.update).toHaveBeenCalledWith({})
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Successfully updated: 1'))
    })

    it('should handle removing label that does not exist', async () => {
      const mockIssue = {
        id: 'issue-1',
        identifier: 'ENG-123',
        labels: vi.fn().mockResolvedValue({
          nodes: [{ id: 'label-1', name: 'bug' }],
        }),
        team: Promise.resolve({ id: 'team-1', key: 'ENG' }),
        title: 'Issue 1',
        update: vi.fn().mockResolvedValue({ success: true }),
      }

      mockClient.issue.mockResolvedValue(mockIssue)
      mockClient.issueLabels.mockResolvedValue({ nodes: [] })

      const IssueBatch = (await import('../../../src/commands/issue/batch.js')).default
      const cmd = new IssueBatch([], {} as any)

      await cmd.runWithArgs({
        ids: 'ENG-123',
        'remove-labels': 'nonexistent',
      })

      // Should still call update but labels unchanged (label to remove not found)
      expect(mockIssue.update).toHaveBeenCalledWith({})
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Successfully updated: 1'))
    })
  })
})
