import { Flags } from '@oclif/core'
import chalk from 'chalk'

import { BaseCommand } from '../../base-command.js'
import { getLinearClient, hasApiKey } from '../../services/linear.js'
import { CreateLabelFlags } from '../../types/commands.js'

// Types for Linear SDK label operations
interface IssueLabelInput {
  color: string
  description?: string
  name: string
  teamId?: string
}

interface GraphQLError {
  message: string
}

interface LinearError extends Error {
  errors?: GraphQLError[]
}

export default class LabelCreate extends BaseCommand {
  static description = 'Create a new issue label'
  static examples = [
    '<%= config.bin %> <%= command.id %> --name "bug" --color "#FF0000" --team ENG',
    '<%= config.bin %> <%= command.id %> --name "feature" --color "#00FF00" --description "New features"',
    '<%= config.bin %> <%= command.id %> --name "global-label" --color "#0000FF" # Creates workspace label',
  ]
  static flags = {
    ...BaseCommand.baseFlags,
    color: Flags.string({
      char: 'c',
      description: 'Label color in hex format (#RRGGBB)',
      required: true,
    }),
    description: Flags.string({
      char: 'd',
      description: 'Label description',
    }),
    json: Flags.boolean({
      default: false,
      description: 'Output as JSON',
    }),
    name: Flags.string({
      char: 'n',
      description: 'Label name',
      required: true,
    }),
    team: Flags.string({
      char: 't',
      description: 'Team key or name (optional, creates workspace label if not specified)',
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(LabelCreate)
    await this.runWithFlags(flags)
  }

  async runWithFlags(flags: CreateLabelFlags & {'is-group'?: boolean; profile?: string }): Promise<void> {
    // Check API key
    if (!hasApiKey()) {
      throw new Error('No API key configured. Run "lc init" first.')
    }

    // Validate color format
    if (!this.isValidHexColor(flags.color)) {
      throw new Error('Invalid color format. Please use hex format like #FF0000')
    }

    const client = getLinearClient({ profile: flags.profile })
    
    try {
      // Build label input
      const input: IssueLabelInput = {
        color: flags.color,
        name: flags.name,
      }
      
      if (flags.description) {
        input.description = flags.description
      }
      
      // Resolve team ID if provided
      if (flags.team) {
        let teamId: string | undefined
        
        // Try by key first
        const teams = await client.teams({
          filter: { key: { eq: flags.team.toUpperCase() } },
          first: 1,
        })
        
        if (teams.nodes.length > 0) {
          teamId = teams.nodes[0].id
        } else {
          // Try by name
          const teamsByName = await client.teams({
            filter: { name: { eqIgnoreCase: flags.team } },
            first: 1,
          })
          
          if (teamsByName.nodes.length > 0) {
            teamId = teamsByName.nodes[0].id
          }
        }
        
        if (!teamId) {
          throw new Error(`Team "${flags.team}" not found`)
        }
        
        input.teamId = teamId
      }
      
      // Create the label
      const payload = await client.createIssueLabel(input)
      
      if (!payload.success || !payload.issueLabel) {
        throw new Error('Failed to create label')
      }
      
      const label = await payload.issueLabel
      
      // Output results
      if (flags.json) {
        console.log(JSON.stringify(label, null, 2))
      } else {
        console.log(chalk.green('✓ Label created successfully!'))
        console.log('')
        console.log(chalk.bold('Label Details:'))
        console.log(`  Name: ${label.name}`)
        console.log(`  Color: ${chalk.hex(label.color)('●')} ${label.color}`)
        
        if (label.description) {
          console.log(`  Description: ${label.description}`)
        }
        
        if (flags.team) {
          console.log(`  Team: ${flags.team}`)
        } else {
          console.log(`  Scope: workspace`)
        }
        
        console.log('')
      }
    } catch (error) {
      if (error instanceof Error) {
        // Check for admin permission error
        const errorMessage = error.message.toLowerCase()
        const linearError = error as LinearError
        const hasErrors = linearError.errors
        const needsAdmin = hasErrors && linearError.errors?.some(
          (e: GraphQLError) => e.message && e.message.toLowerCase().includes('admin')
        )
        
        if (needsAdmin || errorMessage.includes('admin')) {
          console.log(chalk.yellow('\n⚠️  Label creation requires admin permissions'))
          console.log(chalk.gray('\nAlternatives:'))
          console.log(chalk.gray('  • Contact your workspace admin to create the label'))
          console.log(chalk.gray('  • Use an existing label with "lc label list"'))
          console.log(chalk.gray('  • Request admin permissions from your team lead'))
          
          throw new Error('Label creation requires admin permissions. Please contact your workspace admin or use an existing label.')
        }
        
        throw error
      }

      throw new Error('Failed to create label')
    }
  }

  private isValidHexColor(color: string): boolean {
    return /^#[0-9A-F]{6}$/i.test(color)
  }
}