import { describe, expect, it } from 'vitest'

import { parseQuery } from '../../src/utils/query-parser.js'

describe('parseQuery', () => {
  it('should parse single key:value pair', () => {
    const result = parseQuery('state:Todo')
    expect(result).toEqual({ state: 'Todo' })
  })

  it('should parse multiple key:value pairs with AND logic', () => {
    const result = parseQuery('state:Todo team:ENG')
    expect(result).toEqual({
      state: 'Todo',
      team: 'ENG',
    })
  })

  it('should parse all supported fields', () => {
    const result = parseQuery('state:Todo team:ENG assignee:John label:bug project:Q4 cycle:5 priority:1')
    expect(result).toEqual({
      assignee: 'John',
      cycle: '5',
      label: 'bug',
      priority: 1,
      project: 'Q4',
      state: 'Todo',
      team: 'ENG',
    })
  })

  it('should handle quoted values with spaces', () => {
    const result = parseQuery('state:"In Progress" assignee:"John Doe"')
    expect(result).toEqual({
      assignee: 'John Doe',
      state: 'In Progress',
    })
  })

  it('should ignore malformed pairs without colon', () => {
    const result = parseQuery('state:Todo invalid team:ENG')
    expect(result).toEqual({
      state: 'Todo',
      team: 'ENG',
    })
  })

  it('should ignore unknown keys', () => {
    const result = parseQuery('state:Todo unknown:value team:ENG')
    expect(result).toEqual({
      state: 'Todo',
      team: 'ENG',
    })
  })

  it('should handle empty query', () => {
    const result = parseQuery('')
    expect(result).toEqual({})
  })

  it('should handle whitespace-only query', () => {
    const result = parseQuery('   ')
    expect(result).toEqual({})
  })

  it('should parse priority as number', () => {
    const result = parseQuery('priority:2')
    expect(result).toEqual({ priority: 2 })
  })

  it('should ignore invalid priority values', () => {
    const result = parseQuery('priority:invalid')
    expect(result).toEqual({})
  })

  it('should ignore out-of-range priority values', () => {
    const result = parseQuery('priority:5')
    expect(result).toEqual({})
  })

  it('should handle case-insensitive keys', () => {
    const result = parseQuery('STATE:Todo TEAM:ENG')
    expect(result).toEqual({
      state: 'Todo',
      team: 'ENG',
    })
  })

  it('should trim whitespace from keys and values', () => {
    const result = parseQuery('  state : Todo   team : ENG  ')
    expect(result).toEqual({
      state: 'Todo',
      team: 'ENG',
    })
  })

  it('should handle mixed quoted and unquoted values', () => {
    const result = parseQuery('state:Todo team:"Engineering Team" assignee:John')
    expect(result).toEqual({
      assignee: 'John',
      state: 'Todo',
      team: 'Engineering Team',
    })
  })

  it('should handle duplicate keys (last value wins)', () => {
    const result = parseQuery('state:Todo state:Done')
    expect(result).toEqual({
      state: 'Done',
    })
  })
})
