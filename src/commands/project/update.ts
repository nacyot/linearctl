import { Project } from '@linear/sdk'
import { Args, Flags } from '@oclif/core'
import chalk from 'chalk'

import { BaseCommand } from '../../base-command.js'
import { getLinearClient, hasApiKey } from '../../services/linear.js'
import { UpdateProjectFlags } from '../../types/commands.js'
export default class ProjectUpdate extends BaseCommand {
  static args = {
    identifier: Args.string({
      description: 'Project ID or name',
      required: true,
    }),
  }
  static description = 'Update an existing project'
  static examples = [
    '<%= config.bin %> <%= command.id %> "Q1 Goals" --state completed',
    '<%= config.bin %> <%= command.id %> project-uuid --name "Updated Name" --description "New description"',
  ]
  static flags = {
    ...BaseCommand.baseFlags,
    description: Flags.string({
      char: 'd',
      description: 'Project description',
    }),
    json: Flags.boolean({
      default: false,
      description: 'Output as JSON',
    }),
    lead: Flags.string({
      description: 'Lead user (name, email, or ID)',
    }),
    name: Flags.string({
      char: 'n',
      description: 'Project name',
    }),
    'start-date': Flags.string({
      description: 'Start date (ISO format or YYYY-MM-DD)',
    }),
    state: Flags.string({
      char: 's',
      description: 'Project state (planned, started, completed, canceled)',
      options: ['planned', 'started', 'completed', 'canceled'],
    }),
    'target-date': Flags.string({
      description: 'Target date (ISO format or YYYY-MM-DD)',
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ProjectUpdate)
    await this.runWithArgs(args.identifier, flags)
  }

  async runWithArgs(identifier: string, flags: UpdateProjectFlags & { profile?: string }): Promise<void> {
    // Check API key
    if (!hasApiKey()) {
      throw new Error('No API key configured. Run "lc init" first.')
    }

    const client = getLinearClient({ profile: flags.profile })
    
    try {
      // Find the project
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
        
        if (projects.nodes.length > 0) {
          project = projects.nodes[0]
        }
      }
      
      if (!project) {
        throw new Error(`Project "${identifier}" not found`)
      }
      
      // Build update input (don't include ID in the input)
      interface ProjectUpdateInput {
        description?: string
        leadId?: null | string
        name?: string
        startDate?: string
        state?: string
        targetDate?: string
      }
      
      const input: ProjectUpdateInput = {}
      
      if (flags.name) {
        input.name = flags.name
      }
      
      if (flags.description !== undefined) {
        input.description = flags.description
      }
      
      if (flags.state) {
        input.state = flags.state
      }
      
      if (flags['start-date']) {
        input.startDate = this.parseDate(flags['start-date'])
      }
      
      if (flags['target-date']) {
        input.targetDate = this.parseDate(flags['target-date'])
      }
      
      // Resolve lead if provided
      if (flags.lead !== undefined) {
        if (flags.lead === '') {
          // Clear the lead
          input.leadId = null
        } else {
          let leadId: string | undefined
          
          // Try by email
          if (flags.lead.includes('@')) {
            const users = await client.users({
              filter: { email: { eq: flags.lead } },
              first: 1,
            })
            
            if (users.nodes.length > 0) {
              leadId = users.nodes[0].id
            }
          }
          
          // Try by ID
          if (!leadId && flags.lead.includes('-')) {
            try {
              const user = await client.user(flags.lead)
              leadId = user.id
            } catch {
              // Not an ID
            }
          }
          
          // Try by name
          if (!leadId) {
            const users = await client.users({
              filter: { name: { eqIgnoreCase: flags.lead } },
              first: 1,
            })
            
            if (users.nodes.length > 0) {
              leadId = users.nodes[0].id
            }
          }
          
          if (!leadId) {
            throw new Error(`Lead user "${flags.lead}" not found`)
          }
          
          input.leadId = leadId
        }
      }
      
      // Check if there are any updates
      const hasUpdates = Object.keys(input).length > 0
      if (!hasUpdates) {
        console.log(chalk.yellow('No updates provided'))
        return
      }
      
      // Update the project using the client's updateProject method
      await client.updateProject(project.id, input)
      
      // Get the updated project
      const updatedProject = await client.project(project.id)
      
      if (!updatedProject) {
        throw new Error('Failed to update project')
      }
      
      // Output results
      if (flags.json) {
        console.log(JSON.stringify(updatedProject, null, 2))
      } else {
        console.log(chalk.green('✓ Project updated successfully!'))
        console.log('')
        console.log(chalk.bold('Updated Project:'))
        console.log(`  ID: ${updatedProject.id}`)
        console.log(`  Name: ${updatedProject.name}`)
        
        if (updatedProject.state) {
          console.log(`  State: ${this.formatState(updatedProject.state)}`)
        }
        
        if (updatedProject.description) {
          console.log(`  Description: ${updatedProject.description}`)
        }
        
        if (updatedProject.startDate) {
          console.log(`  Start Date: ${new Date(updatedProject.startDate).toLocaleDateString()}`)
        }
        
        if (updatedProject.targetDate) {
          console.log(`  Target Date: ${new Date(updatedProject.targetDate).toLocaleDateString()}`)
        }
        
        console.log('')
      }
      
    } catch (error) {
      if (error instanceof Error) {
        throw error
      }

      throw new Error(`Failed to update project "${identifier}"`)
    }
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

  private parseDate(dateStr: string): string {
    // If already ISO format, return as is
    if (dateStr.includes('T')) {
      return dateStr
    }
    
    // Convert YYYY-MM-DD to ISO format
    return new Date(dateStr).toISOString()
  }
}