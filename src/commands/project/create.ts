import { Flags } from '@oclif/core'
import chalk from 'chalk'

import { BaseCommand } from '../../base-command.js'
import { getLinearClient, hasApiKey } from '../../services/linear.js'
import { CreateProjectFlags } from '../../types/commands.js'
import { handleLinearError } from '../../utils/error-handler.js'
export default class ProjectCreate extends BaseCommand {
  static description = 'Create a new project'
  static examples = [
    '<%= config.bin %> <%= command.id %> --name "Q2 Planning" --team ENG',
    '<%= config.bin %> <%= command.id %> --name "Product Launch" --team ENG --description "New product launch planning" --state planned',
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
      required: true,
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
    team: Flags.string({
      char: 't',
      description: 'Team key or name',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(ProjectCreate)
    await this.runWithFlags(flags)
  }

  async runWithFlags(flags: CreateProjectFlags & { profile?: string }): Promise<void> {
    // Check API key
    if (!hasApiKey()) {
      throw new Error('No API key configured. Run "lc init" first.')
    }

    const client = getLinearClient({ profile: flags.profile })
    
    try {
      // Resolve team
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
      
      // Build project input
      interface ProjectCreateInput {
        description?: string
        leadId?: string
        name: string
        startDate?: string
        state?: string
        targetDate?: string
        teamIds: string[]
      }
      
      const input: ProjectCreateInput = {
        name: flags.name,
        teamIds: [teamId],
      }
      
      if (flags.description) {
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
      if (flags.lead) {
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
      
      // Create the project
      const project = await client.createProject(input)
      
      // Wait for the project to be created
      const createdProject = await project.project
      
      if (!createdProject) {
        throw new Error('Failed to create project')
      }
      
      // Output results
      if (flags.json) {
        console.log(JSON.stringify(createdProject, null, 2))
      } else {
        console.log(chalk.green('✓ Project created successfully!'))
        console.log('')
        console.log(chalk.bold('Project Details:'))
        console.log(`  ID: ${createdProject.id}`)
        console.log(`  Name: ${createdProject.name}`)
        
        if (createdProject.state) {
          console.log(`  State: ${this.formatState(createdProject.state)}`)
        }
        
        if (createdProject.description) {
          console.log(`  Description: ${createdProject.description}`)
        }
        
        if (createdProject.startDate) {
          console.log(`  Start Date: ${new Date(createdProject.startDate).toLocaleDateString()}`)
        }
        
        if (createdProject.targetDate) {
          console.log(`  Target Date: ${new Date(createdProject.targetDate).toLocaleDateString()}`)
        }
        
        console.log('')
      }
      
    } catch (error) {
      handleLinearError(error)
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