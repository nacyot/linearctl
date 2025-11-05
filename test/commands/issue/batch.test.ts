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
})
