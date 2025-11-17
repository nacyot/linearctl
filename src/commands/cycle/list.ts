import { Flags } from '@oclif/core'
import chalk from 'chalk'

import { BaseCommand } from '../../base-command.js'
import { getLinearClient, hasApiKey } from '../../services/linear.js'
import { ListFlags } from '../../types/commands.js'
import { formatDate, formatPercent, formatTable } from '../../utils/table-formatter.js'

// Type definitions for cycle data - simplified interface for what we actually use
interface CycleData {
  completedScopeHistory?: number[]
  endsAt: Date | string
  id: string
  name?: string
  number: number
  progress?: null | number
  scopeHistory?: number[]
  startsAt: Date | string
}

interface TeamData {
  id: string
  key: string
  name: string
}

export default class CycleList extends BaseCommand {
  static description = 'List cycles for a team'
static examples = [
    '<%= config.bin %> <%= command.id %> --team ENG',
    '<%= config.bin %> <%= command.id %> --team ENG --type current',
    '<%= config.bin %> <%= command.id %> --team ENG --json',
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
      description: 'Number of cycles to fetch',
    }),
    team: Flags.string({
      char: 't',
      description: 'Team key or name (required)',
      required: true,
    }),
    type: Flags.string({
      default: 'all',
      description: 'Cycle type (current, previous, next, all)',
      options: ['current', 'previous', 'next', 'all'],
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(CycleList)
    await this.runWithFlags(flags)
  }

  async runWithFlags(flags: ListFlags & {profile?: string; type?: string;}): Promise<void> {
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
      
      // Get cycles for the team
      const teamInstance = await client.team(team.id)
      let cycles: { nodes: CycleData[] }
      
      switch (flags.type) {
      case 'current': {
        const activeCycle = await teamInstance.activeCycle
        cycles = { nodes: activeCycle ? [activeCycle] : [] }
      
      break;
      }

      case 'next': {
        cycles = await teamInstance.cycles({
          filter: { startsAt: { gt: new Date().toISOString() } },
          first: flags.limit,
        })
      
      break;
      }

      case 'previous': {
        cycles = await teamInstance.cycles({
          filter: { endsAt: { lt: new Date().toISOString() } },
          first: flags.limit,
        })
      
      break;
      }

      default: {
        // All cycles
        cycles = await teamInstance.cycles({
          first: flags.limit,
        })
      }
      }
      
      // Output results
      if (flags.json) {
        const output = cycles.nodes.map((cycle: CycleData) => ({
          completedScopeHistory: cycle.completedScopeHistory,
          endsAt: cycle.endsAt,
          id: cycle.id,
          name: cycle.name,
          number: cycle.number,
          progress: cycle.progress,
          scopeHistory: cycle.scopeHistory,
          startsAt: cycle.startsAt,
        }))
        console.log(JSON.stringify(output, null, 2))
      } else {
        if (cycles.nodes.length === 0) {
          console.log(chalk.yellow('No cycles found'))
          return
        }
        
        console.log(chalk.bold.cyan(`\n📅 Cycles for ${team.name}:`))
        
        const headers = ['Name', 'Status', 'Start', 'End', 'Progress']
        const rows = cycles.nodes.map((cycle: CycleData) => {
          // Determine cycle status
          const now = new Date()
          const startsAt = new Date(cycle.startsAt)
          const endsAt = new Date(cycle.endsAt)
          let status = ''
          
          if (now < startsAt) {
            status = chalk.blue('Upcoming')
          } else if (now > endsAt) {
            status = chalk.gray('Completed')
          } else {
            status = chalk.green('Active')
          }
          
          const name = chalk.bold(cycle.name || `Cycle ${cycle.number}`)
          const start = formatDate(cycle.startsAt)
          const end = formatDate(cycle.endsAt)
          const progress = cycle.progress !== undefined && cycle.progress !== null 
            ? formatPercent(cycle.progress) 
            : chalk.gray('-')
          
          return [name, status, start, end, progress]
        })
        
        console.log(formatTable({ headers, rows }))
      }
      
    } catch (error) {
      if (error instanceof Error) {
        throw error
      }

      throw new Error(`Failed to fetch cycles for team "${flags.team}"`)
    }
  }

}