import { Issue, LinearDocument } from '@linear/sdk'
import { Flags } from '@oclif/core'
import chalk from 'chalk'

import { BaseCommand } from '../../base-command.js'
import { getLinearClient, hasApiKey } from '../../services/linear.js'
import { ListFlags } from '../../types/commands.js'
import { handleLinearError } from '../../utils/error-handler.js'
import { formatState, formatTable } from '../../utils/table-formatter.js'

export default class IssueMine extends BaseCommand {
  static description = 'List issues assigned to you'
static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --state "In Progress"',
    '<%= config.bin %> <%= command.id %> --json',
  ]
static flags = {
    ...BaseCommand.baseFlags,
    'include-archived': Flags.boolean({
      default: false,
      description: 'Include archived issues',
    }),
    json: Flags.boolean({
      default: false,
      description: 'Output as JSON',
    }),
    limit: Flags.integer({
      char: 'n',
      default: 50,
      description: 'Number of issues to fetch',
    }),
    state: Flags.string({
      char: 's',
      description: 'Filter by state name',
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(IssueMine)
    await this.runWithFlags(flags)
  }

  async runWithFlags(flags: ListFlags & { profile?: string }): Promise<void> {
    // Check API key
    if (!hasApiKey()) {
      throw new Error('No API key configured. Run "lc init" first.')
    }

    const client = getLinearClient({ profile: flags.profile })
    
    try {
      // Build filter
      const filter: LinearDocument.IssueFilter = {}
      if (flags.state) {
        filter.state = { name: { eqIgnoreCase: flags.state } }
      }
      
      // Fetch assigned issues
      const options: {
        filter?: LinearDocument.IssueFilter
        first?: number
        includeArchived?: boolean
        orderBy?: LinearDocument.PaginationOrderBy
      } = {
        first: flags.limit,
        includeArchived: flags['include-archived'],
        orderBy: LinearDocument.PaginationOrderBy.UpdatedAt,
      }
      
      if (Object.keys(filter).length > 0) {
        options.filter = filter
      }
      
      // Get the current user and their assigned issues
      const viewer = await client.viewer
      const issues = await viewer.assignedIssues(options)
      
      // Output results
      if (flags.json) {
        const output = await Promise.all(issues.nodes.map(async (issue: Issue) => {
          const team = await issue.team
          const state = await issue.state
          return {
            id: issue.id,
            identifier: issue.identifier,
            state: state ? { name: state.name, type: state.type } : null,
            team: team ? { key: team.key } : null,
            title: issue.title,
          }
        }))
        console.log(JSON.stringify(output, null, 2))
      } else {
        if (issues.nodes.length === 0) {
          console.log(chalk.yellow('No issues assigned to you'))
          return
        }
        
        console.log(chalk.bold.cyan('\n📋 Issues assigned to you:'))
        
        // Prepare table data
        const headers = ['ID', 'State', 'Title']
        
        // Fetch all teams and states in parallel
        const issuesWithDetails = await Promise.all(
          issues.nodes.map(async (issue: Issue) => ({
            identifier: issue.identifier,
            state: await issue.state,
            team: await issue.team,
            title: issue.title
          }))
        )
        
        const rows = issuesWithDetails.map(issue => [
          chalk.cyan(issue.identifier),
          formatState(issue.state),
          issue.title
        ])
        
        // Display table
        console.log(formatTable({ headers, rows }))
        
        if (issues.pageInfo.hasNextPage) {
          console.log(chalk.gray(`Showing first ${issues.nodes.length} issues. Use --limit to see more.`))
        }
      }
      
    } catch (error) {
      handleLinearError(error)
    }
  }
}