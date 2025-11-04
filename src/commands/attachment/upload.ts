import { Command, Flags } from '@oclif/core'
import chalk from 'chalk'
import mime from 'mime-types'
import { access } from 'node:fs/promises'
import path from 'node:path'

import type { AttachmentUploadFlags } from '../../types/commands.js'

import { uploadFile } from '../../lib/upload-file.js'
import { getLinearClient, hasApiKey } from '../../services/linear.js'

export default class AttachmentUpload extends Command {
  static description = 'Upload a file as an attachment to a Linear issue'
  static examples = [
    '<%= config.bin %> <%= command.id %> --issue ENG-123 --file /path/to/image.png',
    '<%= config.bin %> <%= command.id %> --issue ENG-123 --file ./screenshot.png --title "Bug screenshot"',
    '<%= config.bin %> <%= command.id %> -i ENG-123 -f ./document.pdf --subtitle "Technical specification"',
  ]
  static flags = {
    description: Flags.string({
      char: 'd',
      description: 'Attachment description',
    }),
    file: Flags.string({
      char: 'f',
      description: 'Path to file to upload',
      required: true,
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
      description: 'Open the attachment URL in browser after upload',
    }),
    subtitle: Flags.string({
      char: 's',
      description: 'Attachment subtitle',
    }),
    title: Flags.string({
      char: 't',
      description: 'Attachment title (defaults to filename)',
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(AttachmentUpload)
    await this.runWithFlags(flags)
  }

  async runWithFlags(flags: AttachmentUploadFlags): Promise<void> {
    // Check API key
    if (!hasApiKey()) {
      throw new Error('No API key configured. Run "lc init" first.')
    }

    // Check if file exists
    try {
      await access(flags.file)
    } catch {
      throw new Error(`File not found: ${flags.file}`)
    }

    const client = getLinearClient()

    try {
      // Fetch issue to get internal UUID
      const issue = await client.issue(flags.issue)

      if (!issue) {
        throw new Error(`Issue ${flags.issue} not found`)
      }

      // Determine content type
      const contentType = mime.lookup(flags.file) || 'application/octet-stream'

      // Determine filename and title
      const filename = path.basename(flags.file)
      const title = flags.title || filename

      // Build file upload input
      const input: {
        contentType: string
        description?: string
        filename: string
        iconUrl?: string
        issueId: string
        metadata?: Record<string, number | string>
        size: number
        subtitle?: string
        title: string
      } = {
        contentType,
        filename,
        issueId: issue.id,
        size: 0, // Will be filled after stat
        title,
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

      // Request upload URL from Linear
      if (!flags.json) {
        console.log(chalk.gray(`Preparing to upload ${filename}...`))
      }

      const uploadResult = await client.fileUpload(input)

      if (!uploadResult.success) {
        throw new Error('Failed to get upload URL from Linear')
      }

      const { uploadPayload } = uploadResult

      // Upload file to signed URL
      if (!flags.json) {
        console.log(chalk.gray('Uploading file...'))
      }

      await uploadFile({
        filePath: flags.file,
        headers: uploadPayload.headers,
        uploadUrl: uploadPayload.uploadUrl,
      })

      // Display success message
      if (flags.json) {
        console.log(JSON.stringify(uploadResult.attachment, null, 2))
      } else {
        console.log(chalk.green(`\n✓ File uploaded successfully!`))
        console.log(chalk.gray(`Title: ${title}`))
        if (uploadResult.attachment?.url) {
          console.log(chalk.blue(`URL: ${uploadResult.attachment.url}`))
        }

        console.log('')
      }

      // Open URL if requested
      if (flags.open && uploadResult.attachment?.url) {
        const open = await import('open')
        await open.default(uploadResult.attachment.url)
      }
    } catch (error) {
      if (error instanceof Error) {
        throw error
      }

      throw new Error('Failed to upload file')
    }
  }
}
