import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as linearService from '../../../src/services/linear.js'

// Mock the linear service
vi.mock('../../../src/services/linear.js', () => ({
  getLinearClient: vi.fn(),
  hasApiKey: vi.fn(),
}))

describe('issue commands - edge cases', () => {
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
      createIssue: vi.fn(),
      createIssueRelation: vi.fn(),
      issue: vi.fn(),
      issues: vi.fn(),
      team: vi.fn(),
      teams: vi.fn(),
      updateIssue: vi.fn(),
      user: vi.fn(),
      users: vi.fn(),
      viewer: vi.fn(),
    }
    
    vi.mocked(linearService.hasApiKey).mockReturnValue(true)
    vi.mocked(linearService.getLinearClient).mockReturnValue(mockClient)
  })

  afterEach(() => {
    logSpy.mockRestore()
    errorSpy.mockRestore()
  })

  describe('Unicode and emoji handling', () => {
    it('should handle Korean text in issue title and description', async () => {
      const mockTeams = {
        nodes: [{ id: 'team-1', key: 'ENG', name: 'engineering' }],
      }
      mockClient.teams.mockResolvedValue(mockTeams)
      
      const mockIssue = {
        issue: {
          assignee: null,
          createdAt: new Date().toISOString(),
          description: '한글 설명입니다.\n여러 줄의\n한글 텍스트',
          dueDate: null,
          id: 'issue-1',
          identifier: 'ENG-100',
          priority: 3,
          state: { name: 'Todo', type: 'unstarted' },
          title: '한글 제목입니다',
          url: 'https://linear.app/team/issue/ENG-100',
        },
        success: true,
      }
      mockClient.createIssue.mockResolvedValue(mockIssue)
      
      const IssueCreate = (await import('../../../src/commands/issue/create.js')).default
      const cmd = new IssueCreate([], {} as any)
      await cmd.runWithFlags({
        description: '한글 설명입니다.\n여러 줄의\n한글 텍스트',
        team: 'ENG',
        title: '한글 제목입니다',
      })
      
      expect(mockClient.createIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          description: '한글 설명입니다.\n여러 줄의\n한글 텍스트',
          title: '한글 제목입니다',
        }),
      )
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('한글 제목입니다'))
    })

    it('should handle emoji in issue fields', async () => {
      const mockTeams = {
        nodes: [{ id: 'team-1', key: 'ENG', name: 'engineering' }],
      }
      mockClient.teams.mockResolvedValue(mockTeams)
      
      const mockIssue = {
        issue: {
          assignee: null,
          createdAt: new Date().toISOString(),
          description: '🚀 Launch description with 🎉 emojis',
          dueDate: null,
          id: 'issue-1',
          identifier: 'ENG-101',
          priority: 1,
          state: { name: 'Todo', type: 'unstarted' },
          title: '🔥 Hot fix needed 🚨',
          url: 'https://linear.app/team/issue/ENG-101',
        },
        success: true,
      }
      mockClient.createIssue.mockResolvedValue(mockIssue)
      
      const IssueCreate = (await import('../../../src/commands/issue/create.js')).default
      const cmd = new IssueCreate([], {} as any)
      await cmd.runWithFlags({
        description: '🚀 Launch description with 🎉 emojis',
        team: 'ENG',
        title: '🔥 Hot fix needed 🚨',
      })
      
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('🔥 Hot fix needed 🚨'))
    })

    it('should handle mixed Korean, English, and emoji', async () => {
      const mockIssues = {
        nodes: [
          {
            assignee: { name: 'Ben Kim' },
            createdAt: new Date().toISOString(),
            identifier: 'ENG-102',
            state: { name: 'In Progress', type: 'started' },
            title: '한글과 English가 混在하는 🚀 제목!',
            updatedAt: new Date().toISOString(),
          },
        ],
      }
      
      mockClient.client.request.mockResolvedValue({ issues: mockIssues })

      const IssueList = (await import('../../../src/commands/issue/list.js')).default
      const cmd = new IssueList([], {} as any)
      await cmd.runWithoutParse({})

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('한글과 English가 混在하는 🚀 제목!'))
    })
  })

  describe('Error handling', () => {
    it('should handle invalid priority value', async () => {
      const mockTeams = {
        nodes: [{ id: 'team-1', key: 'ENG', name: 'engineering' }],
      }
      mockClient.teams.mockResolvedValue(mockTeams)
      
      mockClient.createIssue.mockRejectedValue(
        new Error('Argument Validation Error - priority must not be greater than 4.'),
      )
      
      const IssueCreate = (await import('../../../src/commands/issue/create.js')).default
      const cmd = new IssueCreate([], {} as any)
      
      await expect(
        cmd.runWithFlags({
          priority: 10,
          team: 'ENG',
          title: 'Test',
        }),
      ).rejects.toThrow('priority must not be greater than 4')
    })

    it('should handle non-existent team', async () => {
      mockClient.teams.mockResolvedValue({ nodes: [] })
      
      const IssueCreate = (await import('../../../src/commands/issue/create.js')).default
      const cmd = new IssueCreate([], {} as any)
      
      await expect(
        cmd.runWithFlags({
          team: 'NONEXISTENT',
          title: 'Test',
        }),
      ).rejects.toThrow('Team "NONEXISTENT" not found')
    })

    it('should handle non-existent issue ID', async () => {
      mockClient.issue.mockRejectedValue(
        new Error('Entity not found: Issue - Could not find referenced Issue.'),
      )
      
      const IssueGet = (await import('../../../src/commands/issue/get.js')).default
      const cmd = new IssueGet(['INVALID-999'], {} as any)
      
      await expect(cmd.runWithArgs('INVALID-999', {})).rejects.toThrow('Entity not found')
    })

    it('should handle network timeout', async () => {
      mockClient.client.request.mockRejectedValue(new Error('Network timeout'))

      const IssueList = (await import('../../../src/commands/issue/list.js')).default
      const cmd = new IssueList([], {} as any)

      await expect(cmd.runWithoutParse({})).rejects.toThrow('Network timeout')
    })
  })

  describe('Special value handling', () => {
    it('should handle "none" value for assignee to remove assignment', async () => {
      const mockUpdate = {
        issue: {
          assignee: null,
          id: 'issue-1',
          identifier: 'ENG-103',
          title: 'Test',
          url: 'https://linear.app/team/issue/ENG-103',
        },
        success: true,
      }
      
      const mockIssue = {
        assignee: { name: 'John Doe' },
        id: 'issue-1',
        identifier: 'ENG-103',
        team: Promise.resolve({ id: 'team-1', key: 'ENG', name: 'engineering' }),
        update: vi.fn().mockResolvedValue(mockUpdate),
      }
      mockClient.issue.mockResolvedValue(mockIssue)
      
      const IssueUpdate = (await import('../../../src/commands/issue/update.js')).default
      const cmd = new IssueUpdate(['ENG-103'], {} as any)
      await cmd.runWithArgs('ENG-103', { assignee: 'none' })
      
      expect(mockIssue.update).toHaveBeenCalledWith(
        expect.objectContaining({
          assigneeId: null,
        }),
      )
    })

    it('should handle "none" value for due date to clear it', async () => {
      const mockUpdate = {
        issue: {
          dueDate: null,
          id: 'issue-1',
          identifier: 'ENG-104',
          title: 'Test',
          url: 'https://linear.app/team/issue/ENG-104',
        },
        success: true,
      }
      
      const mockIssue = {
        dueDate: '2025-12-31',
        id: 'issue-1',
        identifier: 'ENG-104',
        team: Promise.resolve({ id: 'team-1', key: 'ENG', name: 'engineering' }),
        update: vi.fn().mockResolvedValue(mockUpdate),
      }
      mockClient.issue.mockResolvedValue(mockIssue)
      
      const IssueUpdate = (await import('../../../src/commands/issue/update.js')).default
      const cmd = new IssueUpdate(['ENG-104'], {} as any)
      await cmd.runWithArgs('ENG-104', { 'due-date': 'none' })
      
      expect(mockIssue.update).toHaveBeenCalledWith(
        expect.objectContaining({
          dueDate: null,
        }),
      )
    })

    it('should handle empty labels array', async () => {
      const mockUpdate = {
        issue: {
          id: 'issue-1',
          identifier: 'ENG-105',
          labelIds: [],
          title: 'Test',
          url: 'https://linear.app/team/issue/ENG-105',
        },
        success: true,
      }
      
      const mockIssue = {
        id: 'issue-1',
        identifier: 'ENG-105',
        labelIds: ['label-1', 'label-2'],
        team: Promise.resolve({ id: 'team-1', key: 'ENG', name: 'engineering' }),
        update: vi.fn().mockResolvedValue(mockUpdate),
      }
      mockClient.issue.mockResolvedValue(mockIssue)
      
      const IssueUpdate = (await import('../../../src/commands/issue/update.js')).default
      const cmd = new IssueUpdate(['ENG-105'], {} as any)
      await cmd.runWithArgs('ENG-105', { labels: 'none' })
      
      expect(mockIssue.update).toHaveBeenCalledWith(
        expect.objectContaining({
          labelIds: [],
        }),
      )
    })
  })

  describe('Limit handling', () => {
    it('should cap limit at 250', async () => {
      mockClient.client.request.mockResolvedValue({ issues: { nodes: [] } })

      const IssueList = (await import('../../../src/commands/issue/list.js')).default
      const cmd = new IssueList([], {} as any)
      await cmd.runWithoutParse({ limit: 500 })

      expect(mockClient.client.request).toHaveBeenCalled()
    })

    it('should handle zero limit', async () => {
      mockClient.client.request.mockResolvedValue({ issues: { nodes: [] } })

      const IssueList = (await import('../../../src/commands/issue/list.js')).default
      const cmd = new IssueList([], {} as any)
      await cmd.runWithoutParse({ limit: 0 })

      expect(mockClient.client.request).toHaveBeenCalled()
    })

    it('should handle negative limit', async () => {
      mockClient.client.request.mockResolvedValue({ issues: { nodes: [] } })

      const IssueList = (await import('../../../src/commands/issue/list.js')).default
      const cmd = new IssueList([], {} as any)
      await cmd.runWithoutParse({ limit: -10 })

      expect(mockClient.client.request).toHaveBeenCalled()
    })
  })

  describe('Date handling', () => {
    it('should handle various date formats', async () => {
      const mockTeams = {
        nodes: [{ id: 'team-1', key: 'ENG', name: 'engineering' }],
      }
      mockClient.teams.mockResolvedValue(mockTeams)
      
      const mockIssue = {
        issue: {
          dueDate: '2025-12-31T00:00:00.000Z',
          id: 'issue-1',
          identifier: 'ENG-106',
          title: 'Test',
          url: 'https://linear.app/team/issue/ENG-106',
        },
        success: true,
      }
      mockClient.createIssue.mockResolvedValue(mockIssue)
      
      const IssueCreate = (await import('../../../src/commands/issue/create.js')).default
      const cmd = new IssueCreate([], {} as any)
      
      // Test YYYY-MM-DD format
      await cmd.runWithFlags({
        'due-date': '2025-12-31',
        team: 'ENG',
        title: 'Test',
      })
      
      expect(mockClient.createIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          dueDate: expect.stringContaining('2025-12-31'),
        }),
      )
    })

    it('should handle invalid date format', async () => {
      const mockTeams = {
        nodes: [{ id: 'team-1', key: 'ENG', name: 'engineering' }],
      }
      mockClient.teams.mockResolvedValue(mockTeams)
      
      mockClient.createIssue.mockRejectedValue(
        new Error('Invalid date format'),
      )
      
      const IssueCreate = (await import('../../../src/commands/issue/create.js')).default
      const cmd = new IssueCreate([], {} as any)
      
      await expect(
        cmd.runWithFlags({
          'due-date': 'invalid-date',
          team: 'ENG',
          title: 'Test',
        }),
      ).rejects.toThrow()
    })
  })
})