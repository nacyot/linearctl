import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as linearService from '../../../src/services/linear.js'

// Mock the linear service
vi.mock('../../../src/services/linear.js', () => ({
  getLinearClient: vi.fn(),
  hasApiKey: vi.fn(),
}))

describe('issue get command', () => {
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
    }
    
    vi.mocked(linearService.hasApiKey).mockReturnValue(true)
    vi.mocked(linearService.getLinearClient).mockReturnValue(mockClient)
  })

  afterEach(() => {
    logSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it('should display issue details', async () => {
    const mockIssue = {
      assignee: Promise.resolve({ name: 'John Doe' }),
      attachments: vi.fn().mockResolvedValue({ nodes: [] }),
      children: vi.fn().mockResolvedValue({ nodes: [] }),
      comments: vi.fn().mockResolvedValue({ nodes: [] }),
      createdAt: new Date('2024-01-01'),
      cycle: Promise.resolve({ id: 'cycle-1', name: 'Cycle 3', number: 3 }),
      description: 'The login form is not working properly',
      id: 'issue-1',
      identifier: 'ENG-123',
      labels: vi.fn().mockResolvedValue({ nodes: [{ name: 'bug' }, { name: 'high-priority' }] }),
      parent: Promise.resolve(null),
      project: Promise.resolve({ name: 'Q1 Goals' }),
      state: Promise.resolve({ name: 'In Progress', type: 'started' }),
      team: Promise.resolve({ key: 'ENG', name: 'Engineering' }),
      title: 'Fix bug in login',
      updatedAt: new Date('2024-01-02'),
      url: 'https://linear.app/company/issue/ENG-123',
    }
    
    mockClient.issue.mockResolvedValue(mockIssue)
    
    const IssueGet = (await import('../../../src/commands/issue/get.js')).default
    const cmd = new IssueGet(['ENG-123'], {} as any)
    await cmd.runWithArgs('ENG-123')
    
    expect(mockClient.issue).toHaveBeenCalledWith('ENG-123')
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('ENG-123'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Fix bug in login'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('In Progress'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('John Doe'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Engineering'))
  })

  it('should handle issue not found', async () => {
    mockClient.issue.mockResolvedValue(null)
    
    const IssueGet = (await import('../../../src/commands/issue/get.js')).default
    const cmd = new IssueGet(['INVALID-999'], {} as any)
    
    await expect(cmd.runWithArgs('INVALID-999')).rejects.toThrow(/not found/)
  })

  it('should display JSON output when flag is set', async () => {
    const mockIssue = {
      assignee: Promise.resolve(null),
      attachments: vi.fn().mockResolvedValue({ nodes: [] }),
      children: vi.fn().mockResolvedValue({ nodes: [] }),
      comments: vi.fn().mockResolvedValue({ nodes: [] }),
      createdAt: new Date('2024-01-01'),
      cycle: Promise.resolve(null),
      description: null,
      id: 'issue-1',
      identifier: 'ENG-123',
      labels: vi.fn().mockResolvedValue({ nodes: [] }),
      parent: Promise.resolve(null),
      project: Promise.resolve(null),
      state: Promise.resolve({ name: 'Todo', type: 'unstarted' }),
      team: Promise.resolve({ key: 'ENG', name: 'Engineering' }),
      title: 'Test issue',
      updatedAt: new Date('2024-01-02'),
      url: 'https://linear.app/company/issue/ENG-123',
    }
    
    mockClient.issue.mockResolvedValue(mockIssue)
    
    const IssueGet = (await import('../../../src/commands/issue/get.js')).default
    const cmd = new IssueGet(['ENG-123'], {} as any)
    await cmd.runWithArgs('ENG-123', { json: true })
    
    const jsonOutput = logSpy.mock.calls.find(call => 
      call[0].includes('ENG-123')
    )
    expect(jsonOutput).toBeTruthy()
  })
})