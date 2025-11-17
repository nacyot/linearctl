import { Args } from '@oclif/core'
import chalk from 'chalk'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { BaseCommand } from '../../base-command.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default class RuleAdd extends BaseCommand {
  static override args = {
    path: Args.string({
      description: 'Path where to copy the Linear CLI guide',
      required: true,
    }),
  }
  static override description = 'Copy Linear CLI guide to your project'
  static override examples = [
    '<%= config.bin %> <%= command.id %> .rules/linear-cli.md',
  ]

  public async run(): Promise<void> {
    const { args } = await this.parse(RuleAdd)
    
    const sourcePath = path.join(__dirname, '../../../docs/LINEAR_CLI_GUIDE.md')
    const projectRoot = process.cwd()
    const destinationPath = path.join(projectRoot, args.path)
    
    try {
      // Read the source file
      const content = await fs.readFile(sourcePath, 'utf8')
      
      // Create directory if it doesn't exist
      const dir = path.dirname(destinationPath)
      await fs.mkdir(dir, { recursive: true })
      
      // Write to destination
      await fs.writeFile(destinationPath, content)
      
      console.log(chalk.green(`✓ Linear CLI guide successfully copied to ${args.path}`))
    } catch (error) {
      console.error(chalk.red(`Error copying file: ${error instanceof Error ? error.message : 'Unknown error'}`))
      throw error
    }
  }
}