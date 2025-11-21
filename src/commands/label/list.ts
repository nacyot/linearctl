import { Flags } from '@oclif/core'
import chalk from 'chalk'

import { BaseCommand } from '../../base-command.js'
import { getLinearClient, hasApiKey } from '../../services/linear.js'
import { handleLinearError } from '../../utils/error-handler.js'
import { formatTable } from '../../utils/table-formatter.js'

export default class LabelList extends BaseCommand {
  static description = 'List issue labels in your Linear workspace'
static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --team ENG',
    '<%= config.bin %> <%= command.id %> --json',
  ]
static flags = {
    ...BaseCommand.baseFlags,
    json: Flags.boolean({
      default: false,
      description: 'Output as JSON',
    }),
    limit: Flags.integer({
      char: 'n',
      default: 50,
      description: 'Number of labels to fetch',
    }),
    team: Flags.string({
      char: 't',
      description: 'Filter labels by team',
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(LabelList)
    await this.runWithFlags(flags)
  }

  async runWithFlags(flags: {json?: boolean; limit?: number; team?: string} & { profile?: string }): Promise<void> {
    // Check API key
    if (!hasApiKey()) {
      throw new Error('No API key configured. Run "lc init" first.')
    }

    const client = getLinearClient({ profile: flags.profile })
    
    try {
      // Build options
      const options: {filter?: {team?: {id: {eq: string}}}; first?: number;} = {
        first: flags.limit,
      }
      
      // Filter by team if provided
      if (flags.team) {
        const teams = await client.teams({
          filter: { key: { eq: flags.team.toUpperCase() } },
          first: 1,
        })
        
        if (teams.nodes.length > 0) {
          options.filter = { team: { id: { eq: teams.nodes[0].id } } }
        }
      }
      
      // Fetch labels
      const labels = await client.issueLabels(options)
      
      // Output results
      if (flags.json) {
        const output = labels.nodes.map((label: {color?: string; description?: string; id: string; name: string}) => ({
          color: label.color,
          description: label.description,
          id: label.id,
          name: label.name,
        }))
        console.log(JSON.stringify(output, null, 2))
      } else {
        if (labels.nodes.length === 0) {
          console.log(chalk.yellow('No labels found'))
          return
        }
        
        console.log(chalk.bold.cyan('\n🏷  Labels:'))
        
        const headers = ['Name', 'Description']
        const rows = labels.nodes.map((label: {color?: string; description?: string; name: string}) => {
          const color = label.color || '#888'
          const colorBox = chalk.hex(color)('●')
          const name = `${colorBox} ${label.name}`
          const description = label.description ? chalk.gray(label.description) : '-'
          return [name, description]
        })
        
        console.log(formatTable({ headers, rows }))
      }
      
    } catch (error) {
      handleLinearError(error)
    }
  }
}