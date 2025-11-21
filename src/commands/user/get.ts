import type { User } from '@linear/sdk'

import { Args, Flags } from '@oclif/core'
import chalk from 'chalk'

import { BaseCommand } from '../../base-command.js'
import { getLinearClient, hasApiKey } from '../../services/linear.js'
import { CommonFlags } from '../../types/commands.js'
import { handleLinearError } from '../../utils/error-handler.js'
export default class UserGet extends BaseCommand {
  static args = {
    identifier: Args.string({
      description: 'User email, ID, name, or "me" for current user',
      required: true,
    }),
  }
static description = 'Get details of a specific user'
static examples = [
    '<%= config.bin %> <%= command.id %> john@example.com',
    '<%= config.bin %> <%= command.id %> user-uuid',
    '<%= config.bin %> <%= command.id %> me',
  ]
static flags = {
    ...BaseCommand.baseFlags,
    json: Flags.boolean({
      default: false,
      description: 'Output as JSON',
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(UserGet)
    await this.runWithArgs(args.identifier, flags)
  }

  async runWithArgs(identifier: string, flags: CommonFlags & { profile?: string }): Promise<void> {
    // Check API key
    if (!hasApiKey()) {
      throw new Error('No API key configured. Run "lc init" first.')
    }

    const client = getLinearClient({ profile: flags.profile })
    
    try {
      let user: null | User = null
      
      // Handle "me" to get current user
      if (identifier.toLowerCase() === 'me') {
        const viewer = await client.viewer
        user = await client.user(viewer.id)
      }
      
      // Try to get by ID if it looks like a UUID
      if (!user && identifier.includes('-')) {
        user = await client.user(identifier)
      }
      
      // If not found, try by email
      if (!user && identifier.includes('@')) {
        const users = await client.users({
          filter: { email: { eq: identifier } },
          first: 1,
        })
        user = users.nodes[0]
      }
      
      // If still not found, try by name
      if (!user) {
        const users = await client.users({
          filter: { name: { eqIgnoreCase: identifier } },
          first: 1,
        })
        user = users.nodes[0]
      }
      
      if (!user) {
        throw new Error(`User "${identifier}" not found`)
      }
      
      // Output results
      if (flags.json) {
        console.log(JSON.stringify(user, null, 2))
      } else {
        await this.displayUser(user)
      }
      
    } catch (error) {
      handleLinearError(error)
    }
  }

  private async displayUser(user: User): Promise<void> {
    console.log('')
    
    // Header
    console.log(chalk.bold.cyan('👤 ' + user.name))
    console.log(chalk.gray('─'.repeat(80)))
    
    // Basic info
    const info = []
    
    info.push(
      `Email: ${user.email}`,
      `ID: ${user.id}`,
      `Status: ${user.active ? chalk.green('Active') : chalk.red('Inactive')}`
    )
    
    if (user.admin) {
      info.push(`Role: ${chalk.yellow('Admin')}`)
    } else {
      info.push(`Role: Member`)
    }
    
    console.log(info.join(chalk.gray(' • ')))
    
    // Dates
    if (user.createdAt) {
      const createdDate = new Date(user.createdAt).toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
      console.log(chalk.gray(`Joined: ${createdDate}`))
    }
    
    // Teams
    const teams = await user.teams?.()
    if (teams?.nodes?.length > 0) {
      console.log(chalk.gray('\n─ Teams ─'))
      for (const team of teams.nodes) {
        console.log(`  • ${chalk.cyan(team.key)} - ${team.name}`)
      }
    }
    
    // Assigned issues count
    const assignedIssues = await user.assignedIssues?.({ first: 1 })
    if (assignedIssues) {
      console.log(chalk.gray(`\n─ Statistics ─`))
      // Since we can't get the total count directly, we'll just indicate if they have issues
      const hasIssues = assignedIssues.nodes.length > 0
      console.log(`  Has assigned issues: ${hasIssues ? 'Yes' : 'No'}`)
    }
    
    console.log('')
  }
}