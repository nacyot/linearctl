import { Project } from '@linear/sdk'
import { Args, Flags } from '@oclif/core'
import chalk from 'chalk'

import { BaseCommand } from '../../base-command.js'
import { getLinearClient, hasApiKey } from '../../services/linear.js'
import { CommonFlags } from '../../types/commands.js'
export default class ProjectGet extends BaseCommand {
  static args = {
    identifier: Args.string({
      description: 'Project ID or name',
      required: true,
    }),
  }
  static description = 'Get details of a specific project'
  static examples = [
    '<%= config.bin %> <%= command.id %> "Q1 Goals"',
    '<%= config.bin %> <%= command.id %> project-uuid',
  ]
  static flags = {
    ...BaseCommand.baseFlags,
    json: Flags.boolean({
      default: false,
      description: 'Output as JSON',
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ProjectGet)
    await this.runWithArgs(args.identifier, flags)
  }

  async runWithArgs(identifier: string, flags: CommonFlags & { profile?: string }): Promise<void> {
    // Check API key
    if (!hasApiKey()) {
      throw new Error('No API key configured. Run "lc init" first.')
    }

    const client = getLinearClient({ profile: flags.profile })
    
    try {
      let project: null | Project = null
      
      // Try to get by ID if it looks like a UUID
      if (identifier.includes('-')) {
        try {
          project = await client.project(identifier)
        } catch {
          // Not an ID, try by name
        }
      }
      
      // If not found by ID, try by name
      if (!project) {
        const projects = await client.projects({
          filter: { name: { eqIgnoreCase: identifier } },
          first: 1,
        })
        project = projects.nodes[0]
      }
      
      if (!project) {
        throw new Error(`Project "${identifier}" not found`)
      }
      
      // Output results
      if (flags.json) {
        console.log(JSON.stringify(project, null, 2))
      } else {
        await this.displayProject(project)
      }
      
    } catch (error) {
      if (error instanceof Error) {
        throw error
      }

      throw new Error(`Failed to fetch project "${identifier}"`)
    }
  }

  private createProgressBar(progress: number, width: number): string {
    const filled = Math.round(progress * width)
    const empty = width - filled
    return chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty))
  }

  private async displayProject(project: Project): Promise<void> {
    console.log('')
    
    // Header
    console.log(chalk.bold.cyan('📁 ' + project.name))
    console.log(chalk.gray('─'.repeat(80)))
    
    // Basic info
    const info = [
      `ID: ${project.id}`,
      `State: ${this.formatState(project.state)}`,
    ]
    
    if (project.progress !== undefined && project.progress !== null) {
      const progressBar = this.createProgressBar(project.progress, 20)
      info.push(`Progress: ${progressBar} ${Math.round(project.progress * 100)}%`)
    }
    
    console.log(info.join(chalk.gray(' • ')))
    
    // Description
    if (project.description) {
      console.log(chalk.gray('\n─ Description ─'))
      console.log(project.description)
    }
    
    // Dates
    const dates = []
    if (project.startDate) {
      const start = new Date(project.startDate).toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
      dates.push(`Start: ${start}`)
    }
    
    if (project.targetDate) {
      const target = new Date(project.targetDate).toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
      dates.push(`Target: ${target}`)
    }
    
    if (dates.length > 0) {
      console.log(chalk.gray('\n─ Timeline ─'))
      console.log(dates.join(chalk.gray(' • ')))
    }
    
    // Teams
    const teams = await project.teams?.()
    if (teams?.nodes?.length > 0) {
      console.log(chalk.gray('\n─ Teams ─'))
      for (const team of teams.nodes) {
        console.log(`  • ${chalk.cyan(team.key)} - ${team.name}`)
      }
    }
    
    // Lead
    const lead = await project.lead
    if (lead) {
      console.log(chalk.gray('\n─ Lead ─'))
      console.log(`  ${lead.name} (${lead.email})`)
    }
    
    // Created/Updated dates
    if (project.createdAt || project.updatedAt) {
      console.log(chalk.gray('\n─ Activity ─'))
      if (project.createdAt) {
        const created = new Date(project.createdAt).toLocaleDateString('en-US', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
        console.log(chalk.gray(`  Created: ${created}`))
      }
      
      if (project.updatedAt) {
        const updated = new Date(project.updatedAt).toLocaleDateString('en-US', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
        console.log(chalk.gray(`  Updated: ${updated}`))
      }
    }
    
    console.log('')
  }

  private formatState(state: string): string {
    switch (state) {
      case 'canceled': {
        return chalk.red('Canceled')
      }

      case 'completed': {
        return chalk.green('Completed')
      }

      case 'planned': {
        return chalk.blue('Planned')
      }

      case 'started': {
        return chalk.yellow('Started')
      }

      default: {
        return state || 'Unknown'
      }
    }
  }
}