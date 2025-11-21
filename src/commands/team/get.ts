import type { IssueLabel, Team } from '@linear/sdk'

import { Args, Flags } from '@oclif/core'
import chalk from 'chalk'

import { BaseCommand } from '../../base-command.js'
import { getLinearClient, hasApiKey } from '../../services/linear.js'
import { CommonFlags } from '../../types/commands.js'
import { handleLinearError } from '../../utils/error-handler.js'
export default class TeamGet extends BaseCommand {
  static args = {
    identifier: Args.string({
      description: 'Team key, ID, or name',
      required: true,
    }),
  }
static description = 'Get details of a specific team'
static examples = [
    '<%= config.bin %> <%= command.id %> ENG',
    '<%= config.bin %> <%= command.id %> team-uuid',
    '<%= config.bin %> <%= command.id %> Engineering',
  ]
static flags = {
    ...BaseCommand.baseFlags,
    json: Flags.boolean({
      default: false,
      description: 'Output as JSON',
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(TeamGet)
    await this.runWithArgs(args.identifier, flags)
  }

  async runWithArgs(identifier: string, flags: CommonFlags & { profile?: string }): Promise<void> {
    // Check API key
    if (!hasApiKey()) {
      throw new Error('No API key configured. Run "lc init" first.')
    }

    const client = getLinearClient({ profile: flags.profile })
    
    try {
      let team: null | Team = null
      
      // Try to get by ID if it looks like a UUID
      if (identifier.includes('-')) {
        team = await client.team(identifier)
      }
      
      // If not found or not a UUID, try by key
      if (!team) {
        const teams = await client.teams({
          filter: { key: { eq: identifier.toUpperCase() } },
          first: 1,
        })
        team = teams.nodes[0]
      }
      
      // If still not found, try by name
      if (!team) {
        const teams = await client.teams({
          filter: { name: { eqIgnoreCase: identifier } },
          first: 1,
        })
        team = teams.nodes[0]
      }
      
      if (!team) {
        throw new Error(`Team "${identifier}" not found`)
      }
      
      // Output results
      if (flags.json) {
        console.log(JSON.stringify(team, null, 2))
      } else {
        await this.displayTeam(team)
      }
      
    } catch (error) {
      handleLinearError(error)
    }
  }

  private async displayTeam(team: Team): Promise<void> {
    console.log('')
    
    // Header
    console.log(chalk.bold.cyan(team.key) + chalk.gray(' • ') + chalk.bold(team.name))
    console.log(chalk.gray('─'.repeat(80)))
    
    // Basic info
    const info = []
    
    info.push(`ID: ${team.id}`)
    
    if (team.cyclesEnabled !== undefined) {
      info.push(`Cycles: ${team.cyclesEnabled ? 'Enabled' : 'Disabled'}`)
    }
    
    console.log(info.join(chalk.gray(' • ')))
    
    // Description
    if (team.description) {
      console.log(chalk.gray('\n─ Description ─'))
      console.log(team.description)
    }
    
    // Workflow states
    const states = await team.states?.()
    if (states?.nodes?.length > 0) {
      console.log(chalk.gray('\n─ Workflow States ─'))
      for (const state of states.nodes) {
        const stateColor = this.getStateColor(state.type)
        console.log(`  • ${stateColor(state.name)}`)
      }
    }
    
    // Labels
    const labels = await team.labels?.()
    if (labels?.nodes?.length > 0) {
      console.log(chalk.gray('\n─ Team Labels ─'))
      const labelNames = labels.nodes.map((l: IssueLabel) => chalk.magenta(l.name))
      console.log(`  ${labelNames.join(', ')}`)
    }
    
    console.log('')
  }

  private getStateColor(type: string): (text: string) => string {
    switch (type) {
      case 'backlog': {
        return chalk.gray
      }

      case 'canceled': {
        return chalk.red
      }

      case 'completed': {
        return chalk.green
      }

      case 'started': {
        return chalk.yellow
      }

      case 'unstarted': {
        return chalk.blue
      }

      default: {
        return (text: string) => text
      }
    }
  }
}