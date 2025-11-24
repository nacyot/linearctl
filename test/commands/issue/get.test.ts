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
      client: {
        request: vi.fn(),
      },
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

  it('should fetch multiple issues in parallel', async () => {
    const mockIssue1 = {
      assignee: Promise.resolve({ name: 'John Doe' }),
      attachments: vi.fn().mockResolvedValue({ nodes: [] }),
      children: vi.fn().mockResolvedValue({ nodes: [] }),
      comments: vi.fn().mockResolvedValue({ nodes: [] }),
      createdAt: new Date('2024-01-01'),
      cycle: Promise.resolve(null),
      description: 'First issue',
      id: 'issue-1',
      identifier: 'ENG-123',
      labels: vi.fn().mockResolvedValue({ nodes: [{ name: 'bug' }] }),
      parent: Promise.resolve(null),
      priority: 1,
      project: Promise.resolve(null),
      state: Promise.resolve({ name: 'In Progress', type: 'started' }),
      team: Promise.resolve({ key: 'ENG', name: 'Engineering' }),
      title: 'Issue 1',
      updatedAt: new Date('2024-01-01'),
      url: 'https://linear.app/company/issue/ENG-123',
    }

    const mockIssue2 = {
      assignee: Promise.resolve(null),
      attachments: vi.fn().mockResolvedValue({ nodes: [] }),
      children: vi.fn().mockResolvedValue({ nodes: [] }),
      comments: vi.fn().mockResolvedValue({ nodes: [] }),
      createdAt: new Date('2024-01-02'),
      cycle: Promise.resolve(null),
      description: 'Second issue',
      id: 'issue-2',
      identifier: 'ENG-124',
      labels: vi.fn().mockResolvedValue({ nodes: [] }),
      parent: Promise.resolve(null),
      priority: 2,
      project: Promise.resolve(null),
      state: Promise.resolve({ name: 'Todo', type: 'unstarted' }),
      team: Promise.resolve({ key: 'ENG', name: 'Engineering' }),
      title: 'Issue 2',
      updatedAt: new Date('2024-01-02'),
      url: 'https://linear.app/company/issue/ENG-124',
    }

    mockClient.issue.mockResolvedValueOnce(mockIssue1).mockResolvedValueOnce(mockIssue2)

    const IssueGet = (await import('../../../src/commands/issue/get.js')).default
    const cmd = new IssueGet(['ENG-123', 'ENG-124'], {} as any)
    await cmd.runWithMultipleArgs(['ENG-123', 'ENG-124'], {})

    // Verify both issues were fetched
    expect(mockClient.issue).toHaveBeenCalledTimes(2)
    expect(mockClient.issue).toHaveBeenCalledWith('ENG-123')
    expect(mockClient.issue).toHaveBeenCalledWith('ENG-124')

    // Verify both issues were displayed
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('ENG-123'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Issue 1'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('ENG-124'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Issue 2'))
  })

  it('should output JSON for multiple issues', async () => {
    const mockIssue1 = {
      assignee: Promise.resolve(null),
      attachments: vi.fn().mockResolvedValue({ nodes: [] }),
      children: vi.fn().mockResolvedValue({ nodes: [] }),
      comments: vi.fn().mockResolvedValue({ nodes: [] }),
      createdAt: new Date('2024-01-01'),
      cycle: Promise.resolve(null),
      description: 'First issue',
      id: 'issue-1',
      identifier: 'ENG-123',
      labels: vi.fn().mockResolvedValue({ nodes: [] }),
      parent: Promise.resolve(null),
      priority: 0,
      project: Promise.resolve(null),
      state: Promise.resolve({ id: 'state-1', name: 'Todo', type: 'unstarted' }),
      team: Promise.resolve({ id: 'team-1', key: 'ENG', name: 'Engineering' }),
      title: 'Issue 1',
      updatedAt: new Date('2024-01-01'),
      url: 'https://linear.app/company/issue/ENG-123',
    }

    const mockIssue2 = {
      assignee: Promise.resolve(null),
      attachments: vi.fn().mockResolvedValue({ nodes: [] }),
      children: vi.fn().mockResolvedValue({ nodes: [] }),
      comments: vi.fn().mockResolvedValue({ nodes: [] }),
      createdAt: new Date('2024-01-02'),
      cycle: Promise.resolve(null),
      description: 'Second issue',
      id: 'issue-2',
      identifier: 'ENG-124',
      labels: vi.fn().mockResolvedValue({ nodes: [] }),
      parent: Promise.resolve(null),
      priority: 0,
      project: Promise.resolve(null),
      state: Promise.resolve({ id: 'state-2', name: 'Todo', type: 'unstarted' }),
      team: Promise.resolve({ id: 'team-1', key: 'ENG', name: 'Engineering' }),
      title: 'Issue 2',
      updatedAt: new Date('2024-01-02'),
      url: 'https://linear.app/company/issue/ENG-124',
    }

    mockClient.issue.mockResolvedValueOnce(mockIssue1).mockResolvedValueOnce(mockIssue2)

    const IssueGet = (await import('../../../src/commands/issue/get.js')).default
    const cmd = new IssueGet(['ENG-123', 'ENG-124'], {} as any)
    await cmd.runWithMultipleArgs(['ENG-123', 'ENG-124'], { json: true })

    // Verify JSON output is array
    const jsonCall = logSpy.mock.calls.find(call => call[0].includes('['))
    expect(jsonCall).toBeTruthy()
    expect(jsonCall![0]).toContain('ENG-123')
    expect(jsonCall![0]).toContain('ENG-124')
  })

  it('should output markdown format when --format markdown is used', async () => {
    const mockIssue = {
      assignee: Promise.resolve({ name: 'John Doe' }),
      attachments: vi.fn().mockResolvedValue({ nodes: [] }),
      children: vi.fn().mockResolvedValue({ nodes: [] }),
      comments: vi.fn().mockResolvedValue({
        nodes: [
          {
            body: 'This is a comment',
            createdAt: new Date('2024-01-03'),
            id: 'comment-1',
            user: Promise.resolve({ name: 'Jane Smith' }),
          }
        ]
      }),
      createdAt: new Date('2024-01-01'),
      cycle: Promise.resolve({ id: 'cycle-1', name: 'Cycle 3', number: 3 }),
      description: 'The login form is not working properly',
      id: 'issue-1',
      identifier: 'ENG-123',
      labels: vi.fn().mockResolvedValue({ nodes: [{ name: 'bug' }, { name: 'high-priority' }] }),
      parent: Promise.resolve(null),
      priority: 1,
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
    await cmd.runWithArgs('ENG-123', { format: 'markdown' })

    // Verify markdown output
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('# ENG-123'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Fix bug in login'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('## Metadata'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('**State:** In Progress'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('**Assignee:** John Doe'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('## Description'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('The login form is not working properly'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('## Comments (1)'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Jane Smith'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('This is a comment'))
  })

  it('should output markdown format when --format md is used', async () => {
    const mockIssue = {
      assignee: Promise.resolve({ name: 'John Doe' }),
      attachments: vi.fn().mockResolvedValue({ nodes: [] }),
      children: vi.fn().mockResolvedValue({ nodes: [] }),
      comments: vi.fn().mockResolvedValue({ nodes: [] }),
      createdAt: new Date('2024-01-01'),
      cycle: Promise.resolve(null),
      description: 'Test description',
      id: 'issue-1',
      identifier: 'ENG-123',
      labels: vi.fn().mockResolvedValue({ nodes: [] }),
      parent: Promise.resolve(null),
      priority: 2,
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
    await cmd.runWithArgs('ENG-123', { format: 'md' })

    // Verify markdown output
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('# ENG-123'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Test issue'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('## Metadata'))
  })
})