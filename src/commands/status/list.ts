import { WorkflowState } from '@linear/sdk'
import { Flags } from '@oclif/core'
import chalk from 'chalk'

import { BaseCommand } from '../../base-command.js'
import { getLinearClient, hasApiKey } from '../../services/linear.js'
import { ListFlags } from '../../types/commands.js'
import { formatState, formatTable } from '../../utils/table-formatter.js'

interface TeamData {
  id: string
  key: string
  name: string
}

export default class StatusList extends BaseCommand {
  static description = 'List workflow states for a team'
static examples = [
    '<%= config.bin %> <%= command.id %> --team ENG',
    '<%= config.bin %> <%= command.id %> --team ENG --json',
  ]
static flags = {
    ...BaseCommand.baseFlags,
    json: Flags.boolean({
      default: false,
      description: 'Output as JSON',
    }),
    team: Flags.string({
      char: 't',
      description: 'Team key or name (required)',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(StatusList)
    await this.runWithFlags(flags)
  }

  async runWithFlags(flags: ListFlags & { profile?: string }): Promise<void> {
    // Check API key
    if (!hasApiKey()) {
      throw new Error('No API key configured. Run "lc init" first.')
    }

    const client = getLinearClient({ profile: flags.profile })
    
    try {
      // Resolve team
      let team: null | TeamData = null
      
      if (!flags.team) {
        throw new Error('Team is required')
      }
      
      // Try by key first
      const teams = await client.teams({
        filter: { key: { eq: flags.team.toUpperCase() } },
        first: 1,
      })
      
      if (teams.nodes.length > 0) {
        team = teams.nodes[0]
      } else {
        // Try by name
        const teamsByName = await client.teams({
          filter: { name: { eqIgnoreCase: flags.team } },
          first: 1,
        })
        team = teamsByName.nodes[0]
      }
      
      if (!team) {
        throw new Error(`Team "${flags.team}" not found`)
      }
      
      // Get states for the team
      const teamInstance = await client.team(team.id)
      const states = await teamInstance.states()
      
      // Output results
      if (flags.json) {
        const output = states.nodes.map((state: WorkflowState) => ({
          color: state.color,
          id: state.id,
          name: state.name,
          position: state.position,
          type: state.type,
        }))
        console.log(JSON.stringify(output, null, 2))
      } else {
        console.log(chalk.bold.cyan(`\n🔄 Workflow States for ${team.name}:`))
        
        const headers = ['State', 'Type']
        const rows = states.nodes.map((state: WorkflowState) => {
          const color = state.color || '#888'
          const colorBox = chalk.hex(color)('●')
          const name = `${colorBox} ${state.name}`
          return [name, formatState(state)]
        })
        
        console.log(formatTable({ headers, rows }))
      }
      
    } catch (error) {
      if (error instanceof Error) {
        throw error
      }

      throw new Error(`Failed to fetch states for team "${flags.team}"`)
    }
  }

  private formatType(type: string): string {
    switch (type) {
      case 'backlog': {
        return 'Backlog'
      }

      case 'canceled': {
        return 'Canceled'
      }

      case 'completed': {
        return 'Done'
      }

      case 'started': {
        return 'In Progress'
      }

      case 'unstarted': {
        return 'To Do'
      }

      default: {
        return type
      }
    }
  }
}