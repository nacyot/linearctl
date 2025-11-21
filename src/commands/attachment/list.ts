import { Args, Flags } from '@oclif/core'
import chalk from 'chalk'

import { BaseCommand } from '../../base-command.js'
import { getLinearClient, hasApiKey } from '../../services/linear.js'
import { AttachmentListFlags } from '../../types/commands.js'
import { handleLinearError } from '../../utils/error-handler.js'

export default class AttachmentList extends BaseCommand {
  static args = {
    id: Args.string({
      description: 'Issue ID (e.g., ENG-123)',
      required: true,
    }),
  }
static description = 'List all attachments for a Linear issue'
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
    const { args, flags } = await this.parse(AttachmentList)
    await this.runWithArgs(args.id, flags)
  }

  async runWithArgs(issueId: string, flags: AttachmentListFlags & { profile?: string } = {}): Promise<void> {
    // Check API key
    if (!hasApiKey()) {
      throw new Error('No API key configured. Run "lc init" first.')
    }

    const client = getLinearClient({ profile: flags.profile })

    try {
      // Fetch issue
      const issue = await client.issue(issueId)

      if (!issue) {
        throw new Error(`Issue ${issueId} not found`)
      }

      // Fetch attachments
      const attachments = await issue.attachments()

      // Fetch creators for all attachments (they are lazy-loaded)
      const attachmentsWithCreators = await Promise.all(
        attachments.nodes.map(async (attachment) => {
          const creator = attachment.creator ? await attachment.creator : null
          return {
            createdAt: attachment.createdAt,
            creator: creator ? { name: creator.name } : null,
            id: attachment.id,
            subtitle: attachment.subtitle,
            title: attachment.title,
            url: attachment.url,
          }
        })
      )

      // Output results
      if (flags.json) {
        console.log(JSON.stringify(attachmentsWithCreators, null, 2))
      } else {
        this.displayAttachments(issue, attachmentsWithCreators)
      }
    } catch (error) {
      handleLinearError(error)
    }
  }

  private displayAttachments(issue: {identifier: string; title: string}, attachments: Array<{createdAt?: Date | string; creator?: null | {name: string}; id: string; subtitle?: string; title: string; url?: string}>): void {
    console.log('')

    // Header
    console.log(chalk.bold.cyan(issue.identifier) + chalk.gray(' • ') + chalk.bold(issue.title))
    console.log(chalk.gray('─'.repeat(80)))

    if (attachments.length === 0) {
      console.log(chalk.gray('No attachments found for this issue.'))
      console.log('')
      return
    }

    console.log(chalk.bold(`\nAttachments (${attachments.length}):\n`))

    for (const attachment of attachments) {
      // Title (with subtitle if available)
      const titleLine = attachment.subtitle
        ? `${chalk.bold(attachment.title)} ${chalk.gray('•')} ${attachment.subtitle}`
        : chalk.bold(attachment.title)
      console.log(titleLine)

      // URL
      if (attachment.url) {
        console.log(chalk.blue(`  ${attachment.url}`))
      }

      // Creator and date
      const metadata = []
      if (attachment.creator) {
        metadata.push(`Created by ${attachment.creator.name}`)
      }

      if (attachment.createdAt) {
        const date = new Date(attachment.createdAt)
        metadata.push(this.formatDate(date))
      }

      if (metadata.length > 0) {
        console.log(chalk.gray(`  ${metadata.join(' • ')}`))
      }

      console.log('')
    }
  }

  private formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }
}
