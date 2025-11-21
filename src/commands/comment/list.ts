import { Comment } from '@linear/sdk'
import { Args, Flags } from '@oclif/core'
import chalk from 'chalk'

import { BaseCommand } from '../../base-command.js'
import { getLinearClient, hasApiKey } from '../../services/linear.js'
import { CommonFlags } from '../../types/commands.js'
import { handleLinearError } from '../../utils/error-handler.js'

export default class CommentList extends BaseCommand {
  static args = {
    issue: Args.string({
      description: 'Issue ID (e.g., ENG-123)',
      required: true,
    }),
  }
static description = 'List comments on a Linear issue'
static examples = [
    '<%= config.bin %> <%= command.id %> ENG-123',
    '<%= config.bin %> <%= command.id %> ENG-123 --json',
  ]
static flags = {
    ...BaseCommand.baseFlags,
    json: Flags.boolean({
      default: false,
      description: 'Output as JSON',
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(CommentList)
    await this.runWithArgs(args.issue, flags)
  }

  async runWithArgs(issueId: string, flags: CommonFlags & { profile?: string }): Promise<void> {
    // Check API key
    if (!hasApiKey()) {
      throw new Error('No API key configured. Run "lc init" first.')
    }

    const client = getLinearClient({ profile: flags.profile })
    
    try {
      // Fetch the issue
      const issue = await client.issue(issueId)
      
      if (!issue) {
        throw new Error(`Issue ${issueId} not found`)
      }
      
      // Fetch comments
      const comments = await issue.comments()
      
      // Output results
      if (flags.json) {
        const output = await Promise.all(comments.nodes.map(async (comment: Comment) => ({
          body: comment.body,
          createdAt: comment.createdAt instanceof Date ? comment.createdAt.toISOString() : comment.createdAt,
          id: comment.id,
          user: comment.user ? { name: (await comment.user)?.name } : null,
        })))
        console.log(JSON.stringify(output, null, 2))
      } else {
        if (comments.nodes.length === 0) {
          console.log(chalk.yellow(`No comments found for issue ${issueId}`))
          return
        }
        
        console.log(chalk.bold.cyan(`\n💬 Comments on ${issue.identifier}: ${issue.title}`))
        console.log(chalk.gray('─'.repeat(80)))
        
        // Fetch all users in parallel
        const commentsWithUsers = await Promise.all(
          comments.nodes.map(async (comment: Comment) => ({
            ...comment,
            user: await comment.user
          }))
        )
        
        for (const comment of commentsWithUsers) {
          const userName = comment.user?.name || 'Unknown'
          const date = this.formatDate(comment.createdAt)
          
          console.log(`\n${chalk.green(userName)} ${chalk.gray(`• ${date}`)}}`)
          console.log(comment.body)
        }
        
        console.log('')
      }
      
    } catch (error) {
      handleLinearError(error)
    }
  }

  private formatDate(date: Date | string): string {
    const d = new Date(date)
    return d.toLocaleDateString('en-US', { 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  }
}