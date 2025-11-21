import { Args, Flags } from '@oclif/core'
import chalk from 'chalk'

import { BaseCommand } from '../../base-command.js'
import { getLinearClient, hasApiKey } from '../../services/linear.js'
import { AttachmentDeleteFlags } from '../../types/commands.js'
import { handleLinearError } from '../../utils/error-handler.js'

export default class AttachmentDelete extends BaseCommand {
  static args = {
    id: Args.string({
      description: 'Attachment ID',
      required: true,
    }),
  }
static description = 'Delete an attachment from a Linear issue'
static examples = [
    '<%= config.bin %> <%= command.id %> attachment-uuid-123',
    '<%= config.bin %> <%= command.id %> attachment-uuid-123 --json',
  ]
static flags = {
    ...BaseCommand.baseFlags,
    json: Flags.boolean({
      char: 'j',
      default: false,
      description: 'Output as JSON',
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(AttachmentDelete)
    await this.runWithArgs(args.id, flags)
  }

  async runWithArgs(attachmentId: string, flags: AttachmentDeleteFlags & { profile?: string } = {}): Promise<void> {
    // Check API key
    if (!hasApiKey()) {
      throw new Error('No API key configured. Run "lc init" first.')
    }

    const client = getLinearClient({ profile: flags.profile })

    try {
      // Delete attachment
      if (!flags.json) {
        console.log(chalk.gray(`Deleting attachment ${attachmentId}...`))
      }

      const payload = await client.deleteAttachment(attachmentId)

      if (!payload.success) {
        throw new Error('Failed to delete attachment')
      }

      // Display success message
      if (flags.json) {
        console.log(
          JSON.stringify(
            {
              id: attachmentId,
              success: true,
            },
            null,
            2
          )
        )
      } else {
        console.log(chalk.green(`\n✓ Attachment deleted successfully!`))
        console.log(chalk.gray(`ID: ${attachmentId}`))
        console.log('')
      }
    } catch (error) {
      handleLinearError(error)
    }
  }
}
