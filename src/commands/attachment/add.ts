import { Flags } from '@oclif/core'
import chalk from 'chalk'

import { BaseCommand } from '../../base-command.js'
import { getLinearClient, hasApiKey } from '../../services/linear.js'
import { AttachmentAddFlags } from '../../types/commands.js'
import { handleLinearError } from '../../utils/error-handler.js'

export default class AttachmentAdd extends BaseCommand {
  static description = 'Add a URL-based attachment to a Linear issue'
  static examples = [
    '<%= config.bin %> <%= command.id %> --issue ENG-123 --url https://figma.com/file/123 --title "Design mockup"',
    '<%= config.bin %> <%= command.id %> --issue ENG-123 --url https://github.com/org/repo/pull/456 --title "Related PR" --subtitle "Fix authentication"',
  ]
  static flags = {
    ...BaseCommand.baseFlags,
    description: Flags.string({
      char: 'd',
      description: 'Attachment description',
    }),
    'icon-url': Flags.string({
      description: 'Icon URL for the attachment',
    }),
    issue: Flags.string({
      char: 'i',
      description: 'Issue ID (e.g., ENG-123)',
      required: true,
    }),
    json: Flags.boolean({
      char: 'j',
      default: false,
      description: 'Output as JSON',
    }),
    metadata: Flags.string({
      description: 'Metadata as JSON string',
    }),
    open: Flags.boolean({
      char: 'o',
      default: false,
      description: 'Open the attachment URL in browser after creation',
    }),
    subtitle: Flags.string({
      char: 's',
      description: 'Attachment subtitle',
    }),
    title: Flags.string({
      char: 't',
      description: 'Attachment title (defaults to URL hostname)',
    }),
    url: Flags.string({
      char: 'u',
      description: 'URL of the attachment',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(AttachmentAdd)
    await this.runWithFlags(flags)
  }

  async runWithFlags(flags: AttachmentAddFlags & { profile?: string }): Promise<void> {
    // Check API key
    if (!hasApiKey()) {
      throw new Error('No API key configured. Run "lc init" first.')
    }

    const client = getLinearClient({ profile: flags.profile })

    try {
      // Fetch issue to get internal UUID
      const issue = await client.issue(flags.issue)

      if (!issue) {
        throw new Error(`Issue ${flags.issue} not found`)
      }

      // Determine title (use URL hostname as fallback)
      const title = flags.title || this.extractHostname(flags.url)

      // Build attachment input
      const input: {
        description?: string
        iconUrl?: string
        issueId: string
        metadata?: Record<string, number | string>
        subtitle?: string
        title: string
        url: string
      } = {
        issueId: issue.id,
        title,
        url: flags.url,
      }

      if (flags.subtitle) {
        input.subtitle = flags.subtitle
      }

      if (flags.description) {
        input.description = flags.description
      }

      if (flags['icon-url']) {
        input.iconUrl = flags['icon-url']
      }

      if (flags.metadata) {
        try {
          input.metadata = JSON.parse(flags.metadata)
        } catch {
          throw new Error('Invalid metadata JSON')
        }
      }

      // Create attachment
      if (!flags.json) {
        console.log(chalk.gray('Creating attachment...'))
      }

      const payload = await client.createAttachment(input)

      if (!payload.success) {
        throw new Error('Failed to create attachment')
      }

      // Display success message
      if (flags.json) {
        console.log(JSON.stringify(payload.attachment, null, 2))
      } else {
        console.log(chalk.green(`\n✓ Attachment created successfully!`))
        console.log(chalk.gray(`Title: ${title}`))
        console.log(chalk.blue(`URL: ${flags.url}`))
        console.log('')
      }

      // Open URL if requested
      if (flags.open) {
        const open = await import('open')
        await open.default(flags.url)
      }
    } catch (error) {
      handleLinearError(error)
    }
  }

  private extractHostname(url: string): string {
    try {
      const urlObj = new URL(url)
      return urlObj.hostname
    } catch {
      return url
    }
  }
}
