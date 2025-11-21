import { Cycle, IssueRelationType, LinearClient, LinearDocument, WorkflowState } from '@linear/sdk'
import { Flags } from '@oclif/core'
import chalk from 'chalk'

import { BaseCommand } from '../../base-command.js'
import { getLinearClient, hasApiKey } from '../../services/linear.js'
import { CreateIssueFlags } from '../../types/commands.js'
import { handleLinearError } from '../../utils/error-handler.js'

export default class IssueCreate extends BaseCommand {
  static description = 'Create a new Linear issue'
static examples = [
    '<%= config.bin %> <%= command.id %> --title "Fix login bug" --team Engineering',
    '<%= config.bin %> <%= command.id %> --title "New feature" --team ENG --description "Add dark mode" --assignee "John Doe"',
    '<%= config.bin %> <%= command.id %> --title "Bug" --team ENG --labels "bug,high" --priority 2',
  ]
static flags = {
    ...BaseCommand.baseFlags,
    assignee: Flags.string({
      char: 'a',
      description: 'Assignee name or ID',
    }),
    cycle: Flags.string({
      char: 'c',
      description: 'Cycle name or ID',
    }),
    delegate: Flags.string({
      description: 'Comma-separated delegate emails or names',
    }),
    description: Flags.string({
      char: 'd',
      description: 'Issue description (markdown supported)',
    }),
    'due-date': Flags.string({
      description: 'Due date (YYYY-MM-DD)',
    }),
    json: Flags.boolean({
      default: false,
      description: 'Output as JSON',
    }),
    labels: Flags.string({
      char: 'l',
      description: 'Comma-separated label names or IDs',
    }),
    links: Flags.string({
      description: 'Comma-separated issue IDs to link (e.g. ENG-123,ENG-124)',
    }),
    parent: Flags.string({
      description: 'Parent issue ID',
    }),
    priority: Flags.integer({
      char: 'p',
      description: 'Priority (0=None, 1=Urgent, 2=High, 3=Normal, 4=Low)',
    }),
    project: Flags.string({
      description: 'Project name or ID',
    }),
    state: Flags.string({
      char: 's',
      description: 'State name or ID',
    }),
    team: Flags.string({
      description: 'Team name, key, or ID',
      required: true,
    }),
    title: Flags.string({
      char: 't',
      description: 'Issue title',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(IssueCreate)
    await this.runWithFlags(flags)
  }

  async runWithFlags(flags: CreateIssueFlags & { profile?: string }): Promise<void> {
    // Check API key
    if (!hasApiKey()) {
      throw new Error('No API key configured. Run "lc init" first.')
    }

    // Validate required fields
    if (!flags.team) {
      throw new Error('Team is required. Use --team flag.')
    }

    const client = getLinearClient({ profile: flags.profile })
    
    try {
      // Resolve team ID
      const teamId = await this.resolveTeamId(client, flags.team)
      if (!teamId) {
        throw new Error(`Team "${flags.team}" not found`)
      }

      // Build issue create input
      const input: LinearDocument.IssueCreateInput = {
        teamId,
        title: flags.title,
      }

      // Add description if provided
      if (flags.description) {
        input.description = flags.description
      }

      // Resolve and add assignee if provided
      if (flags.assignee) {
        const assigneeId = await this.resolveUserId(client, flags.assignee)
        if (assigneeId) {
          input.assigneeId = assigneeId
        } else {
          console.log(chalk.yellow(`Warning: Assignee "${flags.assignee}" not found, skipping`))
        }
      }

      // Resolve and add state if provided
      if (flags.state) {
        const stateId = await this.resolveStateId(client, flags.state, teamId)
        if (stateId) {
          input.stateId = stateId
        } else {
          console.log(chalk.yellow(`Warning: State "${flags.state}" not found, skipping`))
        }
      }

      // Resolve and add labels if provided
      if (flags.labels) {
        const labelNames = flags.labels.split(',').map((l: string) => l.trim())
        const labelIds = await this.resolveLabelIds(client, labelNames)
        if (labelIds.length > 0) {
          input.labelIds = labelIds
        }

        if (labelIds.length < labelNames.length) {
          console.log(chalk.yellow(`Warning: Some labels not found`))
        }
      }

      // Add priority if provided
      if (flags.priority !== undefined) {
        input.priority = flags.priority
      }

      // Add due date if provided
      if (flags['due-date']) {
        // Validate date format
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/
        if (!dateRegex.test(flags['due-date'])) {
          throw new Error('Invalid date format. Use YYYY-MM-DD')
        }

        input.dueDate = flags['due-date']
      }

      // Resolve and add project if provided
      if (flags.project) {
        const projectId = await this.resolveProjectId(client, flags.project, teamId)
        if (projectId) {
          input.projectId = projectId
        } else {
          console.log(chalk.yellow(`Warning: Project "${flags.project}" not found, skipping`))
        }
      }

      // Resolve and add cycle if provided
      if (flags.cycle) {
        const cycleId = await this.resolveCycleId(client, flags.cycle, teamId)
        if (cycleId) {
          input.cycleId = cycleId
        } else {
          console.log(chalk.yellow(`Warning: Cycle "${flags.cycle}" not found, skipping`))
        }
      }

      // Add parent if provided - resolve identifier to UUID
      if (flags.parent) {
        try {
          const parentIssue = await client.issue(flags.parent)
          input.parentId = parentIssue.id
        } catch {
          console.log(chalk.yellow(`Warning: Parent issue "${flags.parent}" not found, skipping`))
        }
      }

      // Resolve and add delegates if provided
      if (flags.delegate) {
        const delegates = flags.delegate.split(',').map((d: string) => d.trim())
        
        // Resolve all delegate IDs in parallel
        const delegateResults = await Promise.all(
          delegates.map(async (delegate) => ({
            delegate,
            userId: await this.resolveUserId(client, delegate)
          }))
        )
        
        const delegateIds: string[] = []
        for (const result of delegateResults) {
          if (result.userId) {
            delegateIds.push(result.userId)
          } else {
            console.log(chalk.yellow(`Warning: Delegate "${result.delegate}" not found, skipping`))
          }
        }
        
        if (delegateIds.length > 0) {
          input.subscriberIds = delegateIds
        }
      }

      // Collect links for later processing (Linear API doesn't support links at creation)
      const relatedIssueIds: string[] = []
      if (flags.links) {
        const issueKeys = flags.links.split(',').map((k: string) => k.trim())
        
        // Fetch all linked issues in parallel
        const linkResults = await Promise.all(
          issueKeys.map(async (issueKey) => {
            try {
              const issue = await client.issue(issueKey)
              return { id: issue.id, issueKey, success: true }
            } catch {
              return { id: null, issueKey, success: false }
            }
          })
        )
        
        for (const result of linkResults) {
          if (result.success && result.id) {
            relatedIssueIds.push(result.id)
          } else {
            console.log(chalk.yellow(`Warning: Issue "${result.issueKey}" not found, skipping`))
          }
        }
      }

      // Create the issue
      if (!flags.json) {
        console.log(chalk.gray('Creating issue...'))
      }

      const payload = await client.createIssue(input)

      if (!payload.success || !payload.issue) {
        throw new Error('Failed to create issue')
      }

      const issue = await payload.issue

      // Create issue links after issue creation
      if (relatedIssueIds.length > 0) {
        if (!flags.json) {
          console.log(chalk.gray('Creating issue links...'))
        }

        const linkPromises = relatedIssueIds.map(relatedId =>
          client.createIssueRelation({
            issueId: issue.id,
            relatedIssueId: relatedId,
            type: IssueRelationType.Related,
          }).catch((error: Error) => {
            if (!flags.json) {
              console.log(chalk.yellow(`Warning: Failed to create link: ${error.message}`))
            }

            return null
          })
        )

        await Promise.all(linkPromises)
        if (!flags.json) {
          console.log(chalk.green(`✓ Created ${relatedIssueIds.length} issue link${relatedIssueIds.length === 1 ? '' : 's'}`))
        }
      }

      // Display success message
      if (flags.json) {
        console.log(JSON.stringify({
          id: issue.id,
          identifier: issue.identifier,
          success: true,
          title: issue.title,
          url: issue.url,
        }, null, 2))
      } else {
        console.log(chalk.green(`\n✓ Issue ${chalk.bold(issue.identifier)} created successfully!`))
        console.log(chalk.gray(`Title: ${issue.title}`))
        if (issue.url) {
          console.log(chalk.blue(`View: ${issue.url}`))
        }

        console.log('')
      }

    } catch (error) {
      handleLinearError(error)
    }
  }

  private async resolveCycleId(client: LinearClient, nameOrId: string, teamId: string): Promise<null | string> {
    if (nameOrId.includes('-')) {
      return nameOrId
    }
    
    const team = await client.team(teamId)
    const cycles = await team.cycles()
    
    // Try to match by name or number
    const cycle = cycles.nodes.find((c: Cycle) => 
      c.name?.toLowerCase() === nameOrId.toLowerCase() ||
      c.number?.toString() === nameOrId
    )
    
    return cycle?.id || null
  }

  private async resolveLabelIds(client: LinearClient, names: string[]): Promise<string[]> {
    // Resolve all label IDs in parallel
    const labelResults = await Promise.all(
      names.map(async (name) => {
        if (name.includes('-')) {
          // Looks like an ID
          return { id: name, name, success: true }
        }
 
          // Look up by name
          try {
            const labels = await client.issueLabels({
              filter: { name: { eqIgnoreCase: name } },
            })
            if (labels.nodes.length > 0) {
              return { id: labels.nodes[0].id, name, success: true }
            }
 
              return { id: null, name, success: false }
            
          } catch {
            return { id: null, name, success: false }
          }
        
      })
    )
    
    // Extract successful IDs
    return labelResults
      .filter(result => result.success && result.id)
      .map(result => result.id!)
  }

  private async resolveProjectId(client: LinearClient, nameOrId: string, _teamId: string): Promise<null | string> {
    if (nameOrId.includes('-')) {
      return nameOrId
    }
    
    const projects = await client.projects({
      filter: { 
        name: { eqIgnoreCase: nameOrId },
      },
    })
    
    return projects.nodes[0]?.id || null
  }

  private async resolveStateId(client: LinearClient, nameOrId: string, teamId: string): Promise<null | string> {
    if (nameOrId.includes('-')) {
      return nameOrId
    }
    
    const team = await client.team(teamId)
    const states = await team.states()
    
    const state = states.nodes.find((s: WorkflowState) => 
      s.name.toLowerCase() === nameOrId.toLowerCase()
    )
    
    return state?.id || null
  }

  private async resolveTeamId(client: LinearClient, nameOrId: string): Promise<null | string> {
    if (nameOrId.includes('-')) {
      return nameOrId
    }
    
    // Try by name
    const teams = await client.teams({
      filter: { name: { eqIgnoreCase: nameOrId } },
      first: 1,
    })
    
    if (teams.nodes.length === 0) {
      // Try by key
      const teamsByKey = await client.teams({
        filter: { key: { eq: nameOrId.toUpperCase() } },
        first: 1,
      })
      return teamsByKey.nodes[0]?.id || null
    }
    
    return teams.nodes[0]?.id || null
  }

  private async resolveUserId(client: LinearClient, nameOrId: string): Promise<null | string> {
    if (nameOrId.includes('-')) {
      return nameOrId
    }
    
    const users = await client.users({
      filter: { name: { eqIgnoreCase: nameOrId } },
    })
    
    if (users.nodes.length === 0) {
      // Try by email
      const usersByEmail = await client.users({
        filter: { email: { eq: nameOrId } },
      })
      return usersByEmail.nodes[0]?.id || null
    }
    
    return users.nodes[0]?.id || null
  }
}