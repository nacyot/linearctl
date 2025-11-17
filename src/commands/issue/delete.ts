import { Args, Flags } from '@oclif/core'
import chalk from 'chalk'

import { BaseCommand } from '../../base-command.js'
import { getLinearClient, hasApiKey } from '../../services/linear.js'

export default class IssueDelete extends BaseCommand {
  static args = {
    issueId: Args.string({
      description: 'Issue identifier (e.g., ENG-123)',
      required: true,
    }),
  }
  static description = 'Delete or archive a Linear issue'
  static examples = [
    '<%= config.bin %> <%= command.id %> ENG-123',
    '<%= config.bin %> <%= command.id %> ENG-123 --archive',
    '<%= config.bin %> <%= command.id %> ENG-123 --permanent',
  ]
  static flags = {
    ...BaseCommand.baseFlags,
    archive: Flags.boolean({
      char: 'a',
      default: false,
      description: 'Archive the issue instead of deleting',
    }),
    json: Flags.boolean({
      default: false,
      description: 'Output as JSON',
    }),
    permanent: Flags.boolean({
      default: false,
      description: 'Permanently delete the issue (cannot be undone)',
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(IssueDelete)
    await this.runWithArgs(args.issueId, flags)
  }

  async runWithArgs(issueId: string, flags: { archive?: boolean; json?: boolean; permanent?: boolean; profile?: string } = {}): Promise<void> {
    // Check API key
    if (!hasApiKey()) {
      throw new Error('No API key configured. Run "lc init" first.')
    }

    const client = getLinearClient({ profile: flags.profile })

    try {
      // Get the issue first to resolve identifier to ID
      const issue = await client.issue(issueId)

      if (!issue) {
        throw new Error(`Issue ${issueId} not found`)
      }

      const issueUuid = issue.id
      const issueTitle = issue.title

      // Determine action
      let result
      let action = 'deleted'

      if (flags.archive) {
        // Archive the issue
        result = await issue.archive()
        action = 'archived'
      } else if (flags.permanent) {
        // Permanently delete the issue
        result = await issue.delete()
        action = 'permanently deleted'
      } else {
        // Default: archive
        result = await issue.archive()
        action = 'archived'
      }

      if (flags.json) {
        console.log(
          JSON.stringify(
            {
              action,
              id: issueUuid,
              identifier: issueId,
              success: result.success,
            },
            null,
            2,
          ),
        )
      } else {
        console.log(chalk.green(`✓ Issue ${issueId} ${action} successfully!`))
        console.log(chalk.gray(`Title: ${issueTitle}`))
      }
    } catch (error) {
      if (error instanceof Error) {
        throw error
      }

      throw new Error(`Failed to delete issue ${issueId}`)
    }
  }
}
