import type { LinearDocument, Team } from '@linear/sdk'

import { Flags } from '@oclif/core'
import chalk from 'chalk'

import { BaseCommand } from '../../base-command.js'
import { getLinearClient, hasApiKey } from '../../services/linear.js'
import { handleLinearError } from '../../utils/error-handler.js'
import { formatTable } from '../../utils/table-formatter.js'

export default class TeamList extends BaseCommand {
  static description = 'List all teams in your Linear workspace'
static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --query "eng"',
    '<%= config.bin %> <%= command.id %> --order-by createdAt',
    '<%= config.bin %> <%= command.id %> --json',
  ]
static flags = {
    ...BaseCommand.baseFlags,
    'include-archived': Flags.boolean({
      default: false,
      description: 'Include archived teams',
    }),
    json: Flags.boolean({
      default: false,
      description: 'Output as JSON',
    }),
    limit: Flags.integer({
      char: 'n',
      default: 50,
      description: 'Number of teams to fetch',
    }),
    'order-by': Flags.string({
      default: 'updatedAt',
      description: 'Order by field',
      options: ['createdAt', 'updatedAt'],
    }),
    query: Flags.string({
      char: 'q',
      description: 'Search teams by name',
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(TeamList)
    await this.runWithFlags(flags)
  }

  async runWithFlags(flags: {'include-archived'?: boolean; json?: boolean; limit?: number; 'order-by'?: string; query?: string} & { profile?: string }): Promise<void> {
    // Check API key
    if (!hasApiKey()) {
      throw new Error('No API key configured. Run "lc init" first.')
    }

    const client = getLinearClient({ profile: flags.profile })
    
    try {
      // Build options
      const options: LinearDocument.QueryTeamsArgs = {
        first: flags.limit || 50,
        includeArchived: flags['include-archived'] || false,
        orderBy: (flags['order-by'] || 'updatedAt') as LinearDocument.PaginationOrderBy,
      }
      
      // Add filter if query provided
      if (flags.query) {
        options.filter = {
          name: { containsIgnoreCase: flags.query },
        }
      }
      
      // Fetch teams
      const teams = await client.teams(options)
      
      // Output results
      if (flags.json) {
        const output = teams.nodes.map((team: Team) => ({
          description: team.description,
          id: team.id,
          key: team.key,
          memberCount: 0, // Linear SDK doesn't expose memberCount
          name: team.name,
        }))
        console.log(JSON.stringify(output, null, 2))
      } else {
        if (teams.nodes.length === 0) {
          console.log(chalk.yellow('No teams found'))
          return
        }
        
        console.log(chalk.bold.cyan('\n👥 Teams in your workspace:'))
        
        // Prepare table data
        const headers = ['Key', 'Name', 'Description']
        const rows = teams.nodes.map((team: Team) => [
          chalk.cyan(team.key || '-'),
          team.name || '-',
          chalk.gray(team.description ? team.description.slice(0, 50) : '')
        ])
        
        // Display table
        console.log(formatTable({ headers, rows }))
      }
      
    } catch (error) {
      handleLinearError(error)
    }
  }
}