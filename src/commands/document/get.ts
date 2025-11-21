import { Args, Flags } from '@oclif/core'
import chalk from 'chalk'

import { BaseCommand } from '../../base-command.js'
import { getLinearClient, hasApiKey } from '../../services/linear.js'
import { CommonFlags } from '../../types/commands.js'
import { handleLinearError } from '../../utils/error-handler.js'
import { formatDate } from '../../utils/table-formatter.js'

export default class DocumentGet extends BaseCommand {
  static args = {
    id: Args.string({
      description: 'Document ID or slug',
      required: false,
    }),
  }
static description = 'Get a specific document by ID or slug'
  static examples = [
    '<%= config.bin %> <%= command.id %> doc-123',
    '<%= config.bin %> <%= command.id %> my-document-slug',
    '<%= config.bin %> <%= command.id %> doc-123 --content',
    '<%= config.bin %> <%= command.id %> doc-123 --json',
  ]
  static flags = {
    ...BaseCommand.baseFlags,
    content: Flags.boolean({
      char: 'c',
      default: false,
      description: 'Show full document content',
    }),
    json: Flags.boolean({
      default: false,
      description: 'Output as JSON',
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(DocumentGet)
    await this.runWithArgs([args.id].filter(Boolean) as string[], flags)
  }

  async runWithArgs(args: string[], flags: CommonFlags & {content?: boolean; profile?: string }): Promise<void> {
    // Check API key
    if (!hasApiKey()) {
      throw new Error('No API key configured. Run "lc init" first.')
    }

    // Validate input
    if (!args[0]) {
      throw new Error('Document ID or slug is required')
    }

    const client = getLinearClient({ profile: flags.profile })
    
    try {
      // Fetch document
      const document = await client.document(args[0])
      
      // Get creator data
      const creator = document.creator ? await document.creator : null
      const project = document.project ? await document.project : null
      
      // Output results
      if (flags.json) {
        console.log(JSON.stringify(document, null, 2))
      } else {
        console.log('')
        console.log(chalk.bold.cyan(document.title))
        console.log(chalk.gray('─'.repeat(50)))
        console.log(`ID: ${document.id}`)
        
        console.log(`Creator: ${creator?.name || 'Unknown'}`)
        
        if (project) {
          console.log(`Project: ${project.name}`)
        }
        
        console.log(`Created: ${formatDate(document.createdAt)}`)
        console.log(`Updated: ${formatDate(document.updatedAt)}`)
        console.log(`URL: ${document.url}`)
        
        console.log('')
        
        if (flags.content && document.content) {
          console.log(chalk.bold('─ Content ─'))
          console.log(document.content)
          console.log('')
        } else if (document.content) {
          // Show preview
          const preview = this.getContentPreview(document.content)
          console.log(chalk.bold('─ Preview ─'))
          console.log(preview)
          console.log('')
          console.log(chalk.gray('Use --content flag to show document content'))
        }
        
        console.log('')
      }
    } catch (error) {
      handleLinearError(error)
    }
  }

  private getContentPreview(content: string): string {
    const maxLength = 200
    const lines = content.split('\n')
    let preview = ''
    let totalLength = 0
    
    for (const line of lines) {
      if (totalLength + line.length > maxLength) {
        const remaining = maxLength - totalLength
        preview += remaining > 10 ? line.slice(0, remaining) + '...' : '...';
        preview += chalk.gray(' (truncated)')
        break
      }
      
      preview += line + '\n'
      totalLength += line.length + 1
    }
    
    return preview.trim()
  }
}