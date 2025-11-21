import type { LinearDocument, User } from '@linear/sdk'

import { Flags } from '@oclif/core'
import chalk from 'chalk'

import { BaseCommand } from '../../base-command.js'
import { getLinearClient, hasApiKey } from '../../services/linear.js'
import { handleLinearError } from '../../utils/error-handler.js'
import { formatTable } from '../../utils/table-formatter.js'

export default class UserList extends BaseCommand {
  static description = 'List users in your Linear workspace'
static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --query "john"',
    '<%= config.bin %> <%= command.id %> --active',
    '<%= config.bin %> <%= command.id %> --json',
  ]
static flags = {
    ...BaseCommand.baseFlags,
    active: Flags.boolean({
      default: false,
      description: 'Show only active users',
    }),
    'include-archived': Flags.boolean({
      default: false,
      description: 'Include archived users',
    }),
    json: Flags.boolean({
      default: false,
      description: 'Output as JSON',
    }),
    limit: Flags.integer({
      char: 'n',
      default: 50,
      description: 'Number of users to fetch',
    }),
    query: Flags.string({
      char: 'q',
      description: 'Search users by name or email',
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(UserList)
    await this.runWithFlags(flags)
  }

  async runWithFlags(flags: {active?: boolean; 'include-archived'?: boolean; json?: boolean; limit?: number; query?: string} & { profile?: string }): Promise<void> {
    // Check API key
    if (!hasApiKey()) {
      throw new Error('No API key configured. Run "lc init" first.')
    }

    const client = getLinearClient({ profile: flags.profile })
    
    try {
      // Build options
      const options: LinearDocument.QueryUsersArgs = {
        first: flags.limit,
        includeArchived: flags['include-archived'],
      }
      
      // Add filter if query provided
      if (flags.query) {
        options.filter = {
          or: [
            { name: { containsIgnoreCase: flags.query } },
            { email: { containsIgnoreCase: flags.query } },
          ],
        }
      }
      
      // Filter by active status if requested
      if (flags.active) {
        const activeFilter = { active: { eq: true } }
        options.filter = options.filter ? { and: [options.filter, activeFilter] } : activeFilter;
      }
      
      // Fetch users
      const users = await client.users(options)
      
      // Output results
      if (flags.json) {
        const output = users.nodes.map((user: User) => ({
          active: user.active,
          admin: user.admin,
          email: user.email,
          id: user.id,
          name: user.name,
        }))
        console.log(JSON.stringify(output, null, 2))
      } else {
        if (users.nodes.length === 0) {
          console.log(chalk.yellow('No users found'))
          return
        }
        
        console.log(chalk.bold.cyan('\n👤 Users in your workspace:'))
        
        const headers = ['Name', 'Email', 'Status', 'Role']
        const rows = users.nodes.map((user: User) => [
          user.name || '-',
          chalk.gray(user.email || '-'),
          user.active ? chalk.green('Active') : chalk.red('Inactive'),
          user.admin ? chalk.yellow('Admin') : 'Member'
        ])
        
        console.log(formatTable({ headers, rows }))
      }
      
    } catch (error) {
      handleLinearError(error)
    }
  }
}