import { Cycle, IssueRelationType, LinearClient, WorkflowState } from '@linear/sdk'
import { Args, Flags } from '@oclif/core'
import chalk from 'chalk'

import { BaseCommand } from '../../base-command.js'
import { getLinearClient, hasApiKey } from '../../services/linear.js'
import { UpdateIssueFlags } from '../../types/commands.js'
import { handleLinearError } from '../../utils/error-handler.js'

export default class IssueUpdate extends BaseCommand {
  static args = {
    id: Args.string({
      description: 'Issue ID (e.g., ENG-123)',
      required: true,
    }),
  }
static description = 'Update an existing Linear issue'
static examples = [
    '<%= config.bin %> <%= command.id %> ENG-123 --title "Updated title"',
    '<%= config.bin %> <%= command.id %> ENG-123 --state Done --assignee "John Doe"',
    '<%= config.bin %> <%= command.id %> ENG-123 --priority 1 --labels "bug,urgent"',
  ]
static flags = {
    ...BaseCommand.baseFlags,
    'add-labels': Flags.string({
      description: 'Add labels (preserves existing)',
    }),
    assignee: Flags.string({
      char: 'a',
      description: 'Assignee name or ID',
    }),
    cycle: Flags.string({
      char: 'c',
      description: 'Cycle name or ID',
    }),
    delegate: Flags.string({
      description: 'Comma-separated delegate emails/names, or "none" to clear',
    }),
    description: Flags.string({
      char: 'd',
      description: 'Issue description (markdown supported)',
    }),
    'due-date': Flags.string({
      description: 'Due date (YYYY-MM-DD)',
    }),
    'duplicate-of': Flags.string({
      description: 'Mark as duplicate of issue (sets state and creates link)',
    }),
    estimate: Flags.integer({
      char: 'e',
      description: 'Estimate value',
    }),
    json: Flags.boolean({
      default: false,
      description: 'Output as JSON',
    }),
    labels: Flags.string({
      char: 'l',
      description: 'Replace all labels',
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
    'remove-labels': Flags.string({
      description: 'Remove labels (preserves others)',
    }),
    state: Flags.string({
      char: 's',
      description: 'State name or ID',
    }),
    title: Flags.string({
      char: 't',
      description: 'Issue title',
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(IssueUpdate)
    await this.runWithArgs(args.id, flags)
  }

  async runWithArgs(issueId: string, flags: UpdateIssueFlags & { profile?: string }): Promise<void> {
    // Check API key
    if (!hasApiKey()) {
      throw new Error('No API key configured. Run "lc init" first.')
    }

    const client = getLinearClient({ profile: flags.profile })
    
    try {
      // Fetch the issue
      const issue = await client.issue(issueId)
      
      if (!issue) {
        throw new Error(`Issue ${issueId} not found`)
      }

      // Get the team ID for lookups
      const team = await issue.team
      const teamId = team?.id
      
      if (!teamId) {
        throw new Error(`Could not determine team for issue ${issueId}`)
      }

      // Build update input
      interface IssueUpdateInput {
        assigneeId?: null | string
        cycleId?: null | string
        description?: string
        dueDate?: null | string
        estimate?: number
        labelIds?: string[]
        parentId?: null | string
        priority?: number
        projectId?: null | string
        relatedIssueIds?: string[]
        stateId?: string
        subscriberIds?: string[]
        title?: string
      }
      
      const input: IssueUpdateInput = {}
      let hasChanges = false

      // Update title if provided
      if (flags.title !== undefined) {
        input.title = flags.title
        hasChanges = true
      }

      // Update description if provided
      if (flags.description !== undefined) {
        input.description = flags.description
        hasChanges = true
      }

      // Resolve and update assignee if provided
      if (flags.assignee !== undefined) {
        if (flags.assignee === 'none' || flags.assignee === '') {
          input.assigneeId = null
        } else {
          const assigneeId = await this.resolveUserId(client, flags.assignee)
          if (assigneeId) {
            input.assigneeId = assigneeId
          } else {
            console.log(chalk.yellow(`Warning: Assignee "${flags.assignee}" not found, skipping`))
          }
        }

        hasChanges = true
      }

      // Resolve and update state if provided
      if (flags.state !== undefined) {
        const stateId = await this.resolveStateId(client, flags.state, teamId)
        if (stateId) {
          input.stateId = stateId
          hasChanges = true
        } else {
          console.log(chalk.yellow(`Warning: State "${flags.state}" not found, skipping`))
        }
      }

      // Handle labels - three modes: replace, add, remove
      if (flags.labels !== undefined) {
        // Replace mode: completely replace all labels
        if (flags.labels === 'none' || flags.labels === '') {
          input.labelIds = []
        } else {
          const labelNames = flags.labels.split(',').map((l: string) => l.trim())
          const labelIds = await this.resolveLabelIds(client, labelNames)
          if (labelIds.length > 0) {
            input.labelIds = labelIds
          }

          if (labelIds.length < labelNames.length) {
            console.log(chalk.yellow(`Warning: Some labels not found`))
          }
        }

        hasChanges = true
      } else if (flags['add-labels'] !== undefined) {
        // Add mode: preserve existing labels and add new ones
        const existingLabels = await issue.labels()
        const existingLabelIds = existingLabels.nodes.map(l => l.id)

        const labelNames = flags['add-labels'].split(',').map((l: string) => l.trim())
        const newLabelIds = await this.resolveLabelIds(client, labelNames)

        if (newLabelIds.length > 0) {
          // Merge existing and new labels (remove duplicates)
          input.labelIds = [...new Set([...existingLabelIds, ...newLabelIds])]
          hasChanges = true
        }

        if (newLabelIds.length < labelNames.length) {
          console.log(chalk.yellow(`Warning: Some labels not found`))
        }
      } else if (flags['remove-labels'] !== undefined) {
        // Remove mode: preserve existing labels except specified ones
        const existingLabels = await issue.labels()
        const existingLabelIds = existingLabels.nodes.map(l => l.id)

        const labelNames = flags['remove-labels'].split(',').map((l: string) => l.trim())
        const removeIds = await this.resolveLabelIds(client, labelNames)

        // Filter out the labels to remove
        input.labelIds = existingLabelIds.filter(id => !removeIds.includes(id))
        hasChanges = true

        if (removeIds.length < labelNames.length) {
          console.log(chalk.yellow(`Warning: Some labels not found`))
        }
      }

      // Update priority if provided
      if (flags.priority !== undefined) {
        input.priority = flags.priority
        hasChanges = true
      }

      // Update due date if provided
      if (flags['due-date'] !== undefined) {
        if (flags['due-date'] === 'none' || flags['due-date'] === '') {
          input.dueDate = null
        } else {
          // Validate date format
          const dateRegex = /^\d{4}-\d{2}-\d{2}$/
          if (!dateRegex.test(flags['due-date'])) {
            throw new Error('Invalid date format. Use YYYY-MM-DD')
          }

          input.dueDate = flags['due-date']
        }

        hasChanges = true
      }

      // Resolve and update project if provided
      if (flags.project !== undefined) {
        if (flags.project === 'none' || flags.project === '') {
          input.projectId = null
        } else {
          const projectId = await this.resolveProjectId(client, flags.project, teamId)
          if (projectId) {
            input.projectId = projectId
          } else {
            console.log(chalk.yellow(`Warning: Project "${flags.project}" not found, skipping`))
          }
        }

        hasChanges = true
      }

      // Resolve and update cycle if provided
      if (flags.cycle !== undefined) {
        if (flags.cycle === 'none' || flags.cycle === '') {
          input.cycleId = null
        } else {
          const cycleId = await this.resolveCycleId(client, flags.cycle, teamId)
          if (cycleId) {
            input.cycleId = cycleId
          } else {
            console.log(chalk.yellow(`Warning: Cycle "${flags.cycle}" not found, skipping`))
          }
        }

        hasChanges = true
      }

      // Update parent if provided - resolve identifier to UUID
      if (flags.parent !== undefined) {
        if (flags.parent === 'none' || flags.parent === '') {
          input.parentId = null
        } else {
          try {
            const parentIssue = await client.issue(flags.parent)
            input.parentId = parentIssue.id
          } catch {
            console.log(chalk.yellow(`Warning: Parent issue "${flags.parent}" not found, skipping`))
          }
        }

        hasChanges = true
      }

      // Handle duplicate-of flag - create relationship and set state
      if (flags['duplicate-of'] !== undefined) {
        try {
          // Resolve original issue identifier to UUID
          const originalIssue = await client.issue(flags['duplicate-of'])

          // Create duplicate relationship
          await client.createIssueRelation({
            issueId: issue.id,
            relatedIssueId: originalIssue.id,
            type: IssueRelationType.Duplicate,
          })

          // Find and set state to Duplicate or Canceled type
          const states = await team.states()
          const duplicateState = states.nodes.find(
            (s: WorkflowState) =>
              s.name.toLowerCase() === 'duplicate' ||
              s.type === 'canceled'
          )

          if (duplicateState) {
            input.stateId = duplicateState.id
          }

          hasChanges = true
        } catch {
          console.log(chalk.yellow(`Warning: Could not create duplicate relationship with "${flags['duplicate-of']}"`))
        }
      }

      // Update estimate if provided
      if (flags.estimate !== undefined) {
        input.estimate = flags.estimate
        hasChanges = true
      }

      // Resolve and update delegates if provided
      if (flags.delegate !== undefined) {
        if (flags.delegate === 'none' || flags.delegate === '') {
          input.subscriberIds = []
        } else {
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
        
        hasChanges = true
      }

      // Resolve and add linked issues if provided
      if (flags.links !== undefined) {
        const issueKeys = flags.links.split(',').map((k: string) => k.trim())
        
        // Fetch all linked issues in parallel
        const linkResults = await Promise.all(
          issueKeys.map(async (issueKey) => {
            try {
              const relatedIssue = await client.issue(issueKey)
              return { id: relatedIssue.id, issueKey, success: true }
            } catch {
              return { id: null, issueKey, success: false }
            }
          })
        )
        
        const relatedIssueIds: string[] = []
        for (const result of linkResults) {
          if (result.success && result.id) {
            relatedIssueIds.push(result.id)
          } else {
            console.log(chalk.yellow(`Warning: Issue "${result.issueKey}" not found, skipping`))
          }
        }
        
        if (relatedIssueIds.length > 0) {
          input.relatedIssueIds = relatedIssueIds
        }
        
        hasChanges = true
      }

      // Check if there are any changes
      if (!hasChanges) {
        if (flags.json) {
          console.log(JSON.stringify({
            message: 'No changes provided',
            success: false,
          }, null, 2))
        } else {
          console.log(chalk.yellow('No changes provided'))
        }

        return
      }

      // Update the issue
      if (!flags.json) {
        console.log(chalk.gray(`Updating issue ${issueId}...`))
      }

      const result = await issue.update(input)

      if (!result.success) {
        throw new Error('Failed to update issue')
      }

      // Build list of updated fields
      const updates = []
      if (input.title !== undefined) updates.push('title')
      if (input.description !== undefined) updates.push('description')
      if (input.assigneeId !== undefined) updates.push('assignee')
      if (input.stateId !== undefined) updates.push('state')
      if (input.labelIds !== undefined) updates.push('labels')
      if (input.priority !== undefined) updates.push('priority')
      if (input.dueDate !== undefined) updates.push('due date')
      if (input.projectId !== undefined) updates.push('project')
      if (input.cycleId !== undefined) updates.push('cycle')
      if (input.parentId !== undefined) updates.push('parent')
      if (input.estimate !== undefined) updates.push('estimate')
      if (input.subscriberIds !== undefined) updates.push('delegates')
      if (input.relatedIssueIds !== undefined) updates.push('links')

      // Display success message
      if (flags.json) {
        console.log(JSON.stringify({
          id: issue.id,
          identifier: issue.identifier,
          success: true,
          updated: updates,
        }, null, 2))
      } else {
        console.log(chalk.green(`\n✓ Issue ${chalk.bold(issue.identifier)} updated successfully!`))

        if (updates.length > 0) {
          console.log(chalk.gray(`Updated: ${updates.join(', ')}`))
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
    const labelIds: string[] = []
    
    // Process all label lookups in parallel
    const labelPromises = names.map(async (name) => {
      if (name.includes('-')) {
        // Looks like an ID
        return { id: name, name }
      }
 
        // Look up by name
        const labels = await client.issueLabels({
          filter: { name: { eqIgnoreCase: name } },
        })
        return { id: labels.nodes.length > 0 ? labels.nodes[0].id : null, name }
      
    })
    
    const labelResults = await Promise.all(labelPromises)
    
    for (const result of labelResults) {
      if (result.id) {
        labelIds.push(result.id)
      }
    }
    
    return labelIds
  }

  private async resolveProjectId(client: LinearClient, nameOrId: string, teamId: string): Promise<null | string> {
    if (nameOrId.includes('-')) {
      return nameOrId
    }
    
    const projects = await client.projects({
      filter: { 
        name: { eqIgnoreCase: nameOrId },
      },
    })
    
    // Check team membership for all projects in parallel
    const projectTeamChecks = await Promise.all(
      projects.nodes.map(async (project) => {
        const teams = await project.teams()
        return {
          isTeamMember: teams.nodes.some((team) => team.id === teamId),
          project
        }
      })
    )
    
    const matchingProject = projectTeamChecks.find(({ isTeamMember }) => isTeamMember)
    return matchingProject?.project.id || null
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