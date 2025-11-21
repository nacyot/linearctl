import { Args, Flags } from '@oclif/core'
import chalk from 'chalk'

import { BaseCommand } from '../../base-command.js'
import { getLinearClient, hasApiKey } from '../../services/linear.js'
import { CommonFlags } from '../../types/commands.js'
import { handleLinearError } from '../../utils/error-handler.js'

// Interface for team data
interface TeamData {
  id: string
  key: string
  name: string
}

// Interface for workflow state data
interface WorkflowStateData {
  color?: string
  description?: string
  id: string
  name: string
  position: number
  team: null | Promise<TeamData> | TeamData
  type: string
}
export default class StatusGet extends BaseCommand {
  static args = {
    id: Args.string({
      description: 'Workflow state ID',
      required: false,
    }),
  }
static description = 'Get workflow state details by ID or name'
  static examples = [
    '<%= config.bin %> <%= command.id %> state-123',
    '<%= config.bin %> <%= command.id %> --name "In Progress" --team ENG',
    '<%= config.bin %> <%= command.id %> state-123 --json',
  ]
  static flags = {
    ...BaseCommand.baseFlags,
    json: Flags.boolean({
      default: false,
      description: 'Output as JSON',
    }),
    name: Flags.string({
      char: 'n',
      description: 'State name',
    }),
    team: Flags.string({
      char: 't',
      description: 'Team key or name (required when using --name)',
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(StatusGet)
    await this.runWithArgs([args.id].filter(Boolean) as string[], flags)
  }

  async runWithArgs(args: string[], flags: CommonFlags & {name?: string; profile?: string; team?: string; }): Promise<void> {
    // Check API key
    if (!hasApiKey()) {
      throw new Error('No API key configured. Run "lc init" first.')
    }

    const client = getLinearClient({ profile: flags.profile })
    
    try {
      let state: WorkflowStateData
      
      if (args[0]) {
        // Get by ID
        const stateResult = await client.workflowState(args[0])
        const team = await stateResult.team
        state = {
          ...stateResult,
          team: team || null
        } as WorkflowStateData
      } else if (flags.name && flags.team) {
        // Get by name and team
        // First resolve team
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
        
        // Get team states and find by name
        const teamInstance = await client.team(teamId)
        const states = await teamInstance.states()
        const matchingState = states.nodes.find(
          (s) => s.name.toLowerCase() === flags.name!.toLowerCase()
        )
        
        if (!matchingState) {
          throw new Error(`State "${flags.name}" not found in team ${flags.team}`)
        }
        
        const team = await matchingState.team
        state = {
          ...matchingState,
          team: team || null
        } as WorkflowStateData
      } else if (flags.name && !flags.team) {
        throw new Error('Team is required when searching by name')
      } else {
        throw new Error('Either provide state ID as argument or use --name and --team flags')
      }
      
      // Ensure we have team data - resolve promise if needed
      if (state.team && typeof (state.team as Promise<TeamData>).then === 'function') {
        state.team = await state.team
      }
      
      // Output results
      if (flags.json) {
        console.log(JSON.stringify(state, null, 2))
      } else {
        const color = state.color || '#888888'
        console.log('')
        console.log(chalk.bold(`${chalk.hex(color)('●')} ${state.name}`))
        console.log(chalk.gray('─'.repeat(40)))
        console.log(`ID: ${state.id}`)
        console.log(`Type: ${this.formatType(state.type)}`)
        console.log(`Team: ${(state.team as TeamData).name} (${(state.team as TeamData).key})`)
        console.log(`Position: ${state.position}`)
        console.log(`Color: ${color}`)
        
        if (state.description) {
          console.log(`Description: ${state.description}`)
        }
        
        console.log('')
      }
    } catch (error) {
      handleLinearError(error)
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