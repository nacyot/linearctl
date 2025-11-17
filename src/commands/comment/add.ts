import { Args, Flags } from '@oclif/core'
import chalk from 'chalk'

import { BaseCommand } from '../../base-command.js'
import { getLinearClient, hasApiKey } from '../../services/linear.js'

export default class CommentAdd extends BaseCommand {
  static args = {
    issue: Args.string({
      description: 'Issue ID (e.g., ENG-123)',
      required: true,
    }),
  }
static description = 'Add a comment to a Linear issue'
static examples = [
    '<%= config.bin %> <%= command.id %> ENG-123 --body "This is a comment"',
    '<%= config.bin %> <%= command.id %> ENG-123 --body "This is a reply" --parent comment-id',
  ]
static flags = {
    ...BaseCommand.baseFlags,
    body: Flags.string({
      char: 'b',
      description: 'Comment body (markdown supported)',
      required: true,
    }),
    parent: Flags.string({
      char: 'p',
      description: 'Parent comment ID (for replies)',
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(CommentAdd)
    await this.runWithArgs(args.issue, flags)
  }

  async runWithArgs(issueId: string, flags: {body: string; parent?: string} & { profile?: string }): Promise<void> {
    // Check API key
    if (!hasApiKey()) {
      throw new Error('No API key configured. Run "lc init" first.')
    }

    // Validate required fields
    if (!flags.body) {
      throw new Error('Comment body is required. Use --body flag.')
    }

    const client = getLinearClient({ profile: flags.profile })
    
    try {
      // Fetch the issue to get its ID
      const issue = await client.issue(issueId)
      
      if (!issue) {
        throw new Error(`Issue ${issueId} not found`)
      }
      
      // Build comment input
      const input: {body: string; issueId: string; parentId?: string} = {
        body: flags.body,
        issueId: issue.id,
      }
      
      // Add parent ID if provided
      if (flags.parent) {
        input.parentId = flags.parent
      }
      
      // Create the comment
      console.log(chalk.gray('Adding comment...'))
      const payload = await client.createComment(input)
      
      if (!payload.success) {
        throw new Error('Failed to add comment')
      }
      
      // Display success message
      console.log(chalk.green(`\n✓ Comment added successfully to ${chalk.bold(issue.identifier)}!`))
      console.log('')
      
    } catch (error) {
      if (error instanceof Error) {
        throw error
      }

      throw new Error(`Failed to add comment to issue ${issueId}`)
    }
  }
}