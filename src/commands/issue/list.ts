import { LinearClient, LinearDocument } from '@linear/sdk'
import { Flags } from '@oclif/core'
import chalk from 'chalk'
import { gql } from 'graphql-tag'

import { BaseCommand } from '../../base-command.js'
import { getLinearClient, hasApiKey } from '../../services/linear.js'
import { ListFlags } from '../../types/commands.js'
import { handleLinearError } from '../../utils/error-handler.js'
import { findSimilar, getSuggestionMessage } from '../../utils/fuzzy.js'
import { formatState, formatTable, truncateText } from '../../utils/table-formatter.js'

// Type for issues with resolved assignee and state
interface EnrichedIssue {
  assignee?: null | { name?: string }
  identifier: string
  state?: { name?: string, type?: string }
  title: string
}

export default class IssueList extends BaseCommand {
  static description = 'List Linear issues'
static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --team Engineering',
    '<%= config.bin %> <%= command.id %> --assignee "John Doe"',
    '<%= config.bin %> <%= command.id %> --state "In Progress"',
    '<%= config.bin %> <%= command.id %> --limit 100',
  ]
static flags = {
    ...BaseCommand.baseFlags,
    assignee: Flags.string({
      char: 'a',
      description: 'Filter by assignee name or ID',
    }),
    cycle: Flags.string({
      char: 'c',
      description: 'Filter by cycle name or ID',
    }),
    'exclude-state': Flags.string({
      description: 'Exclude state name(s), comma-separated',
    }),
    'include-archived': Flags.boolean({
      default: false,
      description: 'Include archived issues',
    }),
    json: Flags.boolean({
      default: false,
      description: 'Output as JSON',
    }),
    label: Flags.string({
      char: 'l',
      description: 'Filter by label name or ID',
    }),
    limit: Flags.integer({
      default: 50,
      description: 'Number of issues to fetch (max 250)',
    }),
    'order-by': Flags.string({
      default: 'updatedAt',
      description: 'Order by field',
      options: ['createdAt', 'updatedAt'],
    }),
    project: Flags.string({
      char: 'p',
      description: 'Filter by project name or ID',
    }),
    search: Flags.string({
      description: 'Search in title and description (case-insensitive)',
    }),
    state: Flags.string({
      char: 's',
      description: 'Filter by state name(s), comma-separated',
    }),
    team: Flags.string({
      char: 't',
      description: 'Filter by team name or ID',
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(IssueList)
    await this.runWithoutParse(flags)
  }

  async runWithoutParse(flags: ListFlags & { profile?: string }): Promise<void> {
    // Check API key
    if (!hasApiKey()) {
      throw new Error('No API key configured. Run "lc init" first.')
    }

    const client = getLinearClient({ profile: flags.profile })
    
    try {
      // Build filter
      const filter: LinearDocument.IssueFilter = {}
      
      // Team filter - resolve first as it's needed for state resolution
      let teamId: null | string = null
      if (flags.team && flags.team.trim()) {
        teamId = await this.resolveTeamId(client, flags.team)
        if (teamId) {
          filter.team = { id: { eq: teamId } }
        } else {
          // Team not found - show suggestions
          const allTeams = await client.teams()
          const similar = findSimilar(
            flags.team,
            allTeams.nodes,
            (team) => team.name || team.key,
          )
          const suggestion = getSuggestionMessage(similar, (team) => team.name || team.key)

          console.log(chalk.yellow(`Team "${flags.team}" not found`))
          if (suggestion) {
            console.log(chalk.gray(suggestion))
          }

          return
        }
      }
      
      // Assignee filter
      if (flags.assignee && flags.assignee.trim()) {
        const userId = await this.resolveUserId(client, flags.assignee)
        if (userId) {
          filter.assignee = { id: { eq: userId } }
        } else {
          // Assignee not found - show suggestions
          const allUsers = await client.users()
          const similar = findSimilar(
            flags.assignee,
            allUsers.nodes,
            (user) => user.name || user.email,
          )
          const suggestion = getSuggestionMessage(similar, (user) => user.name || user.email)

          console.log(chalk.yellow(`Assignee "${flags.assignee}" not found`))
          if (suggestion) {
            console.log(chalk.gray(suggestion))
          }

          return
        }
      }
      
      // State filter - supports comma-separated values
      if (flags.state && flags.state.trim()) {
        const stateNames = flags.state.split(',').map(s => s.trim()).filter(s => s.length > 0)
        const stateIds = await Promise.all(
          stateNames.map(name => this.resolveStateId(client, name, teamId))
        )
        const validStateIds = stateIds.filter((id): id is string => id !== null)

        if (validStateIds.length > 0) {
          filter.state = { id: { in: validStateIds } }
        } else {
          // No states found - show suggestions for first state
          const allStates = await client.workflowStates()
          const similar = findSimilar(
            stateNames[0],
            allStates.nodes,
            (state) => state.name,
          )
          const suggestion = getSuggestionMessage(similar, (state) => state.name)

          console.log(chalk.yellow(`State(s) "${flags.state}" not found${teamId ? ' in team' : ''}`))
          if (suggestion) {
            console.log(chalk.gray(suggestion))
          }

          return
        }
      }

      // Exclude state filter
      if (flags['exclude-state']) {
        const excludeNames = flags['exclude-state'].split(',').map(s => s.trim()).filter(s => s.length > 0)
        const excludeIds = await Promise.all(
          excludeNames.map(name => this.resolveStateId(client, name, teamId))
        )
        const validExcludeIds = excludeIds.filter((id): id is string => id !== null)

        if (validExcludeIds.length > 0) {
          filter.state = { id: { nin: validExcludeIds } }
        }
      }
      
      // Label filter
      if (flags.label && flags.label.trim()) {
        const labelId = await this.resolveLabelId(client, flags.label)
        if (labelId) {
          filter.labels = { id: { in: [labelId] } }
        } else {
          // Label not found - show suggestions
          const allLabels = await client.issueLabels()
          const similar = findSimilar(
            flags.label,
            allLabels.nodes,
            (label) => label.name,
          )
          const suggestion = getSuggestionMessage(similar, (label) => label.name)

          console.log(chalk.yellow(`Label "${flags.label}" not found`))
          if (suggestion) {
            console.log(chalk.gray(suggestion))
          }

          return
        }
      }

      // Project filter
      if (flags.project && flags.project.trim()) {
        const projectId = await this.resolveProjectId(client, flags.project)
        if (projectId) {
          filter.project = { id: { eq: projectId } }
        } else {
          // Project not found - show suggestions
          const allProjects = await client.projects()
          const similar = findSimilar(
            flags.project,
            allProjects.nodes,
            (project) => project.name,
          )
          const suggestion = getSuggestionMessage(similar, (project) => project.name)

          console.log(chalk.yellow(`Project "${flags.project}" not found`))
          if (suggestion) {
            console.log(chalk.gray(suggestion))
          }

          return
        }
      }

      // Cycle filter
      if (flags.cycle && flags.cycle.trim()) {
        const cycleId = await this.resolveCycleId(client, flags.cycle, teamId)
        if (cycleId) {
          filter.cycle = { id: { eq: cycleId } }
        } else {
          // Cycle not found - show suggestions
          if (teamId) {
            const team = await client.team(teamId)
            const allCycles = await team.cycles()
            const similar = findSimilar(
              flags.cycle,
              allCycles.nodes,
              (cycle) => cycle.name || String(cycle.number),
            )
            const suggestion = getSuggestionMessage(similar, (cycle) => cycle.name || `Cycle ${cycle.number}`)

            console.log(chalk.yellow(`Cycle "${flags.cycle}" not found in team`))
            if (suggestion) {
              console.log(chalk.gray(suggestion))
            }
          } else {
            console.log(chalk.yellow(`Cycle "${flags.cycle}" not found`))
          }

          return
        }
      }

      // Search filter - searches in title and description
      if (flags.search && flags.search.trim()) {
        filter.or = [
          { title: { containsIgnoreCase: flags.search } },
          { description: { containsIgnoreCase: flags.search } }
        ]
      }
      
      // Prepare query variables
      const variables: {
        filter?: LinearDocument.IssueFilter
        first?: number
        includeArchived?: boolean
        orderBy?: LinearDocument.PaginationOrderBy
      } = {
        first: Math.min(flags.limit && flags.limit > 0 ? flags.limit : 50, 250),
        includeArchived: flags['include-archived'] || false,
        orderBy: flags['order-by'] === 'createdAt' 
          ? LinearDocument.PaginationOrderBy.CreatedAt 
          : LinearDocument.PaginationOrderBy.UpdatedAt,
      }
      
      // Add filter if not empty
      if (Object.keys(filter).length > 0) {
        variables.filter = filter
      }
      
      // Fetch issues with GraphQL fragment to avoid N+1 queries
      const ISSUE_LIST_QUERY = gql`
        query IssuesList(
          $first: Int!
          $filter: IssueFilter
          $orderBy: PaginationOrderBy
          $includeArchived: Boolean
        ) {
          issues(
            first: $first
            filter: $filter
            orderBy: $orderBy
            includeArchived: $includeArchived
          ) {
            nodes {
              id
              identifier
              title
              description
              priority
              estimate
              dueDate
              createdAt
              updatedAt
              assignee {
                id
                name
                email
              }
              state {
                id
                name
                type
                color
              }
              cycle {
                id
                name
                number
              }
              labels {
                nodes {
                  id
                  name
                }
              }
              project {
                id
                name
              }
            }
          }
        }
      `

      const data = await client.client.request<
        {
          issues: {
            nodes: Array<{
              assignee: null | { email: string; id: string; name: string }
              createdAt: Date
              cycle: null | { id: string; name: null | string; number: number }
              description?: string
              dueDate?: string
              estimate?: number
              id: string
              identifier: string
              labels: { nodes: Array<{ id: string; name: string }> }
              priority: number
              project: null | { id: string; name: string }
              state: { color: string; id: string; name: string; type: string }
              title: string
              updatedAt: Date
            }>
          }
        },
        typeof variables
      >(ISSUE_LIST_QUERY, variables)
      const issuesWithState = data.issues.nodes
      
      // Output results
      if (flags.json) {
        console.log(JSON.stringify(issuesWithState, null, 2))
      } else {
        this.displayIssues(issuesWithState)
      }
      
    } catch (error) {
      handleLinearError(error)
    }
  }

  private displayIssues(issues: EnrichedIssue[]): void {
    if (issues.length === 0) {
      console.log(chalk.yellow('No issues found'))
      return
    }
    
    console.log(chalk.bold(`\nFound ${issues.length} issue${issues.length === 1 ? '' : 's'}:`))
    
    // Prepare table data
    const headers = ['ID', 'Title', 'State', 'Assignee']
    const rows = issues.map(issue => [
      chalk.cyan(issue.identifier),
      truncateText(issue.title, 50),
      formatState(issue.state),
      issue.assignee?.name || chalk.gray('Unassigned')
    ])
    
    // Display table
    console.log(formatTable({ headers, rows }))
  }

  private async resolveCycleId(client: LinearClient, nameOrNumber: string, teamId: null | string = null): Promise<null | string> {
    // If it looks like an ID, return as is
    if (nameOrNumber.includes('-')) {
      return nameOrNumber
    }

    // If we have a teamId, get cycles for that specific team
    if (teamId) {
      const team = await client.team(teamId)
      const cycles = await team.cycles()

      // Try to match by name or number
      const matchingCycle = cycles.nodes.find(
        (cycle) => {
          const nameMatch = cycle.name?.toLowerCase() === nameOrNumber.toLowerCase()
          const numberMatch = cycle.number?.toString() === nameOrNumber
          return nameMatch || numberMatch
        }
      )
      return matchingCycle?.id || null
    }

    // Without team context, fetch all cycles and match locally
    // Linear API doesn't support filtering by number, so we fetch and filter client-side
    const cycles = await client.cycles({
      first: 250, // Fetch more cycles to ensure we find the match
    })

    // Try to match by name or number
    const matchingCycle = cycles.nodes.find(
      (cycle) => {
        const nameMatch = cycle.name?.toLowerCase() === nameOrNumber.toLowerCase()
        const numberMatch = cycle.number?.toString() === nameOrNumber
        return nameMatch || numberMatch
      }
    )

    return matchingCycle?.id || null
  }

  private async resolveLabelId(client: LinearClient, nameOrId: string): Promise<null | string> {
    if (nameOrId.includes('-')) {
      return nameOrId
    }
    
    const labels = await client.issueLabels({
      filter: { name: { eqIgnoreCase: nameOrId } },
    })
    
    return labels.nodes[0]?.id || null
  }

  private async resolveProjectId(client: LinearClient, nameOrId: string): Promise<null | string> {
    // If it looks like an ID, return as is
    if (nameOrId.includes('-')) {
      return nameOrId
    }
    
    // Otherwise, look up by name
    const projects = await client.projects({
      filter: { name: { containsIgnoreCase: nameOrId } },
      first: 1,
    })
    
    return projects.nodes[0]?.id || null
  }

  private async resolveStateId(client: LinearClient, nameOrId: string, teamId: null | string = null): Promise<null | string> {
    if (nameOrId.includes('-')) {
      return nameOrId
    }
    
    // If we have a teamId, get states for that specific team
    if (teamId) {
      const team = await client.team(teamId)
      const states = await team.states()
      const matchingState = states.nodes.find(
        (state) => state.name.toLowerCase() === nameOrId.toLowerCase()
      )
      return matchingState?.id || null
    }
    
    // Otherwise search all workflow states
    const states = await client.workflowStates({
      filter: { name: { eqIgnoreCase: nameOrId } },
    })
    
    return states.nodes[0]?.id || null
  }
  
  private async resolveTeamId(client: LinearClient, nameOrId: string): Promise<null | string> {
    // If it looks like an ID, return as is
    if (nameOrId.includes('-')) {
      return nameOrId
    }
    
    // Otherwise, look up by name or key
    const teams = await client.teams({
      filter: { name: { eqIgnoreCase: nameOrId } },
      first: 1,
    })
    
    if (teams.nodes.length === 0) {
      // Try by key
      const teamsByKey = await client.teams({
        filter: { key: { eq: nameOrId.toUpperCase() } },
        first: 1,
      })
      return teamsByKey.nodes[0]?.id || null
    }
    
    return teams.nodes[0]?.id || null
  }
  
  private async resolveUserId(client: LinearClient, nameOrId: string): Promise<null | string> {
    if (nameOrId.includes('-')) {
      return nameOrId
    }
    
    const users = await client.users({
      filter: { name: { eqIgnoreCase: nameOrId } },
    })
    
    if (users.nodes.length === 0) {
      // Try by email
      const usersByEmail = await client.users({
        filter: { email: { eq: nameOrId } },
      })
      return usersByEmail.nodes[0]?.id || null
    }
    
    return users.nodes[0]?.id || null
  }
}