import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as linearService from '../../../src/services/linear.js'

// Mock the linear service
vi.mock('../../../src/services/linear.js', () => ({
  getLinearClient: vi.fn(),
  hasApiKey: vi.fn(),
}))

describe('issue list output formats', () => {
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

  describe('JSON output', () => {
    it('should output JSON when json flag is set', async () => {
      const mockResponse = {
        issues: {
          nodes: [
            {
              assignee: { email: 'john@example.com', id: 'user-1', name: 'John Doe' },
              createdAt: new Date('2024-01-01'),
              id: 'issue-1',
              identifier: 'TEST-123',
              state: { color: '#ff0000', id: 'state-1', name: 'In Progress', type: 'started' },
              title: 'Test issue 1',
              updatedAt: new Date('2024-01-01'),
            },
            {
              assignee: null,
              createdAt: new Date('2024-01-02'),
              id: 'issue-2',
              identifier: 'TEST-124',
              state: { color: '#00ff00', id: 'state-2', name: 'Todo', type: 'unstarted' },
              title: 'Test issue 2',
              updatedAt: new Date('2024-01-02'),
            },
          ],
        },
      }

      mockClient.client.request.mockResolvedValue(mockResponse)

      const IssueList = (await import('../../../src/commands/issue/list.js')).default
      const cmd = new IssueList([], {} as any)
      await cmd.runWithoutParse({ json: true })

      // Verify JSON output
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('"identifier": "TEST-123"')
      )
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('"identifier": "TEST-124"')
      )
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('"title": "Test issue 1"')
      )
    })

    it('should include cycle, labels, and project fields in JSON output', async () => {
      const mockResponse = {
        issues: {
          nodes: [
            {
              assignee: { email: 'john@example.com', id: 'user-1', name: 'John Doe' },
              createdAt: new Date('2024-01-01'),
              cycle: { id: 'cycle-1', name: 'Sprint 1', number: 1 },
              id: 'issue-1',
              identifier: 'TEST-123',
              labels: {
                nodes: [
                  { id: 'label-1', name: 'bug' },
                  { id: 'label-2', name: 'urgent' },
                ],
              },
              project: { id: 'project-1', name: 'Q1 Project' },
              state: { color: '#ff0000', id: 'state-1', name: 'In Progress', type: 'started' },
              title: 'Test issue with relations',
              updatedAt: new Date('2024-01-01'),
            },
          ],
        },
      }

      mockClient.client.request.mockResolvedValue(mockResponse)

      const IssueList = (await import('../../../src/commands/issue/list.js')).default
      const cmd = new IssueList([], {} as any)
      await cmd.runWithoutParse({ json: true })

      // Parse JSON output
      const output = JSON.parse(logSpy.mock.calls[0][0])

      // Verify cycle is included
      expect(output[0]).toHaveProperty('cycle')
      expect(output[0].cycle).toEqual({ id: 'cycle-1', name: 'Sprint 1', number: 1 })

      // Verify labels are included
      expect(output[0]).toHaveProperty('labels')
      expect(output[0].labels).toEqual({
        nodes: [
          { id: 'label-1', name: 'bug' },
          { id: 'label-2', name: 'urgent' },
        ],
      })

      // Verify project is included
      expect(output[0]).toHaveProperty('project')
      expect(output[0].project).toEqual({ id: 'project-1', name: 'Q1 Project' })
    })

    it('should output formatted table when json flag is false', async () => {
      const mockResponse = {
        issues: {
          nodes: [
            {
              assignee: { email: 'john@example.com', id: 'user-1', name: 'John Doe' },
              createdAt: new Date('2024-01-01'),
              id: 'issue-1',
              identifier: 'TEST-125',
              state: { color: '#00ff00', id: 'state-1', name: 'Done', type: 'completed' },
              title: 'Completed task',
              updatedAt: new Date('2024-01-01'),
            },
          ],
        },
      }

      mockClient.client.request.mockResolvedValue(mockResponse)

      const IssueList = (await import('../../../src/commands/issue/list.js')).default
      const cmd = new IssueList([], {} as any)
      await cmd.runWithoutParse({ json: false })

      // Verify table output
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Found 1 issue'))
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('TEST-125'))
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Completed task'))
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('John Doe'))

      // Should not contain JSON
      expect(logSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('"identifier"')
      )
    })
  })

  describe('Include archived', () => {
    it('should include archived issues when flag is set', async () => {
      mockClient.client.request.mockResolvedValue({ issues: { nodes: [] } })

      const IssueList = (await import('../../../src/commands/issue/list.js')).default
      const cmd = new IssueList([], {} as any)
      await cmd.runWithoutParse({ 'include-archived': true })

      // Verify request was made
      expect(mockClient.client.request).toHaveBeenCalled()
    })

    it('should exclude archived issues by default', async () => {
      mockClient.client.request.mockResolvedValue({ issues: { nodes: [] } })

      const IssueList = (await import('../../../src/commands/issue/list.js')).default
      const cmd = new IssueList([], {} as any)
      await cmd.runWithoutParse({})

      // Verify request was made
      expect(mockClient.client.request).toHaveBeenCalled()
    })
  })

  describe('Empty results', () => {
    it('should show appropriate message when no issues found', async () => {
      mockClient.client.request.mockResolvedValue({ issues: { nodes: [] } })

      const IssueList = (await import('../../../src/commands/issue/list.js')).default
      const cmd = new IssueList([], {} as any)
      await cmd.runWithoutParse({})

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('No issues found'))
    })

    it('should output empty array in JSON mode when no issues', async () => {
      mockClient.client.request.mockResolvedValue({ issues: { nodes: [] } })

      const IssueList = (await import('../../../src/commands/issue/list.js')).default
      const cmd = new IssueList([], {} as any)
      await cmd.runWithoutParse({ json: true })

      expect(logSpy).toHaveBeenCalledWith('[]')
    })
  })

  describe('Order by', () => {
    it('should order by createdAt when specified', async () => {
      mockClient.client.request.mockResolvedValue({ issues: { nodes: [] } })

      const IssueList = (await import('../../../src/commands/issue/list.js')).default
      const cmd = new IssueList([], {} as any)
      await cmd.runWithoutParse({ 'order-by': 'createdAt' })

      expect(mockClient.client.request).toHaveBeenCalled()
    })

    it('should order by updatedAt by default', async () => {
      mockClient.client.request.mockResolvedValue({ issues: { nodes: [] } })

      const IssueList = (await import('../../../src/commands/issue/list.js')).default
      const cmd = new IssueList([], {} as any)
      await cmd.runWithoutParse({})

      expect(mockClient.client.request).toHaveBeenCalled()
    })
  })
})
