import { type Issue, type LinearClient, LinearDocument } from '@linear/sdk'
import { Flags } from '@oclif/core'
import chalk from 'chalk'
import cliProgress from 'cli-progress'
import inquirer from 'inquirer'

import { BaseCommand } from '../../base-command.js'
import { getLinearClient, hasApiKey } from '../../services/linear.js'
import { IssueBatchFlags } from '../../types/commands.js'
import { parseQuery } from '../../utils/query-parser.js'

interface BatchResult {
  failed: Array<{ error: string; id: string }>
  succeeded: string[]
}

export default class IssueBatch extends BaseCommand {
  static description = 'Update multiple Linear issues at once'
  static examples = [
    '<%= config.bin %> <%= command.id %> --ids ENG-123,ENG-124,ENG-125 --cycle 5',
    '<%= config.bin %> <%= command.id %> --ids ENG-123,ENG-124 --cycle none',
    '<%= config.bin %> <%= command.id %> --ids ENG-123,ENG-124 --cycle 5 --dry-run',
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
    confirm: Flags.boolean({
      default: false,
      description: 'Skip interactive confirmation (for automation)',
    }),
    cycle: Flags.string({
      char: 'c',
      description: 'Cycle number or "none" to remove cycle',
    }),
    'dry-run': Flags.boolean({
      default: false,
      description: 'Preview changes without updating',
    }),
    'due-date': Flags.string({
      description: 'Due date (YYYY-MM-DD) or "none" to clear',
    }),
    ids: Flags.string({
      description: 'Comma-separated issue IDs (e.g., ENG-123,ENG-124)',
      exclusive: ['query'],
    }),
    json: Flags.boolean({
      default: false,
      description: 'Output as JSON',
    }),
    limit: Flags.integer({
      default: 50,
      description: 'Maximum number of issues to update (0=unlimited, only applies to --query)',
      min: 0,
    }),
    priority: Flags.integer({
      char: 'p',
      description: 'Priority (0=None, 1=Urgent, 2=High, 3=Normal, 4=Low)',
      max: 4,
      min: 0,
    }),
    project: Flags.string({
      description: 'Project name or ID',
    }),
    query: Flags.string({
      description: 'Query string to select issues (e.g., "state:Todo team:ENG")',
      exclusive: ['ids'],
    }),
    'remove-labels': Flags.string({
      description: 'Remove specific labels (comma-separated)',
    }),
    state: Flags.string({
      char: 's',
      description: 'State name or ID',
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(IssueBatch)
    await this.runWithArgs(flags)
  }

  async runWithArgs(flags: IssueBatchFlags & { profile?: string }): Promise<void> {
    // Check API key
    if (!hasApiKey()) {
      throw new Error('No API key configured. Run "lc init" first.')
    }

    // Validate that either --ids or --query is provided
    if (!flags.ids && !flags.query) {
      throw new Error('Either --ids or --query is required')
    }

    // Validate that at least one update field is provided
    if (
      !flags.cycle &&
      !flags.state &&
      !flags.assignee &&
      !flags['add-labels'] &&
      !flags['remove-labels'] &&
      !flags.priority &&
      flags['due-date'] === undefined &&
      !flags.project
    ) {
      throw new Error('At least one update field is required (e.g., --cycle, --state, --assignee)')
    }

    const client = getLinearClient({ profile: flags.profile })

    // Fetch issues either by IDs or query
    const issues = flags.query
      ? await this.fetchIssuesByQuery(client, flags.query, flags.limit === undefined ? 50 : flags.limit)
      : await this.fetchIssuesByIds(client, flags.ids!)

    // Interactive confirmation for query-based updates (unless --dry-run or --confirm)
    if (flags.query && !flags['dry-run'] && !flags.confirm && !flags.json) {
      // Show preview of issues
      await this.showQueryPreview(issues, flags)

      // Ask for confirmation
      const answer = await inquirer.prompt([
        {
          default: false,
          message: `Proceed with updating ${issues.length} issue${issues.length === 1 ? '' : 's'}?`,
          name: 'proceed',
          type: 'confirm',
        },
      ])

      if (!answer.proceed) {
        console.log(chalk.gray('\nUpdate cancelled'))
        return
      }

      console.log('') // Add newline for better formatting
    }

    // Build update payload
    const updatePayload = await this.buildUpdatePayload(client, flags, issues[0])

    // Dry-run mode: just preview
    if (flags['dry-run']) {
      await this.showDryRunPreview(issues, flags)
      return
    }

    // Execute batch update
    const result = await this.executeBatchUpdate(issues, updatePayload, client, flags)

    // Output results
    if (flags.json) {
      console.log(
        JSON.stringify(
          {
            failed: result.failed,
            succeeded: result.succeeded,
            total: issues.length,
          },
          null,
          2,
        ),
      )
    } else {
      this.showSummary(result)
    }
  }

  private async buildUpdatePayload(
    client: LinearClient,
    flags: IssueBatchFlags,
    sampleIssue: Issue,
  ): Promise<Record<string, unknown>> {
    const payload: Record<string, unknown> = {}

    // Handle cycle update
    if (flags.cycle !== undefined) {
      if (flags.cycle === 'none') {
        payload.cycleId = null
      } else {
        // Resolve cycle
        const team = await sampleIssue.team
        if (!team) {
          throw new Error('Issue has no team')
        }

        const cycles = await client.cycles({
          filter: {
            team: { key: { eq: team.key } },
          },
        })

        // Find cycle by number or name
        const cycle = cycles.nodes.find(
          (c) => String(c.number) === flags.cycle || c.name === flags.cycle,
        )

        if (!cycle) {
          throw new Error(`Cycle "${flags.cycle}" not found for team ${team.key}`)
        }

        payload.cycleId = cycle.id
      }
    }

    // Handle state update
    if (flags.state !== undefined) {
      const team = await sampleIssue.team
      if (!team) {
        throw new Error('Issue has no team')
      }

      const states = await team.states()
      const state = states.nodes.find(
        (s) => s.name.toLowerCase() === flags.state!.toLowerCase() || s.id === flags.state,
      )

      if (!state) {
        throw new Error(`State "${flags.state}" not found`)
      }

      payload.stateId = state.id
    }

    // Handle assignee update
    if (flags.assignee !== undefined) {
      const users = await client.users({
        filter: { name: { eqIgnoreCase: flags.assignee } },
      })

      if (users.nodes.length === 0) {
        // Try by email
        const usersByEmail = await client.users({
          filter: { email: { eq: flags.assignee } },
        })

        if (usersByEmail.nodes.length === 0) {
          throw new Error(`Assignee "${flags.assignee}" not found`)
        }

        payload.assigneeId = usersByEmail.nodes[0].id
      } else {
        payload.assigneeId = users.nodes[0].id
      }
    }

    // Handle priority update
    if (flags.priority !== undefined) {
      payload.priority = flags.priority
    }

    // Handle due date update
    if (flags['due-date'] !== undefined) {
      if (flags['due-date'] === 'none') {
        payload.dueDate = null
      } else {
        // Validate and parse date
        const date = new Date(flags['due-date'])
        if (Number.isNaN(date.getTime())) {
          throw new TypeError(`Invalid due date format: ${flags['due-date']}. Use YYYY-MM-DD format.`)
        }

        payload.dueDate = flags['due-date']
      }
    }

    // Handle project update
    if (flags.project !== undefined) {
      // If it looks like an ID, use directly
      if (flags.project.includes('-')) {
        payload.projectId = flags.project
      } else {
        // Look up by name
        const projects = await client.projects({
          filter: { name: { containsIgnoreCase: flags.project } },
          first: 1,
        })

        if (projects.nodes.length === 0) {
          throw new Error(`Project "${flags.project}" not found`)
        }

        payload.projectId = projects.nodes[0].id
      }
    }

    return payload
  }

  private async executeBatchUpdate(
    issues: Issue[],
    updatePayload: Record<string, unknown>,
    client: LinearClient,
    flags: IssueBatchFlags,
  ): Promise<BatchResult> {
    const result: BatchResult = {
      failed: [],
      succeeded: [],
    }

    // Resolve label IDs if add-labels flag is provided
    let labelIdsToAdd: string[] = []
    if (flags['add-labels']) {
      const labelNames = flags['add-labels'].split(',').map((l) => l.trim())
      const labelPromises = labelNames.map(async (name) => {
        const labels = await client.issueLabels({
          filter: { name: { eqIgnoreCase: name } },
        })
        return labels.nodes.length > 0 ? labels.nodes[0].id : null
      })
      const resolvedLabels = await Promise.all(labelPromises)
      labelIdsToAdd = resolvedLabels.filter((id): id is string => id !== null)
    }

    // Resolve label IDs if remove-labels flag is provided
    let labelIdsToRemove: string[] = []
    if (flags['remove-labels']) {
      const labelNames = flags['remove-labels'].split(',').map((l) => l.trim())
      const labelPromises = labelNames.map(async (name) => {
        const labels = await client.issueLabels({
          filter: { name: { eqIgnoreCase: name } },
        })
        return labels.nodes.length > 0 ? labels.nodes[0].id : null
      })
      const resolvedLabels = await Promise.all(labelPromises)
      labelIdsToRemove = resolvedLabels.filter((id): id is string => id !== null)
    }

    // Progress bar (only if not JSON output)
    let progressBar: cliProgress.SingleBar | null = null
    if (!flags.json) {
      progressBar = new cliProgress.SingleBar(
        {
          format: 'Updating [{bar}] {percentage}% | {value}/{total} issues',
        },
        cliProgress.Presets.shades_classic,
      )
      progressBar.start(issues.length, 0)
    }

    // Process each issue sequentially
    for (const issue of issues) {
      try {
        // Build per-issue payload
        const issuePayload = { ...updatePayload }

        // Handle labels per-issue (add/remove while preserving existing)
        if (
          (flags['add-labels'] && labelIdsToAdd.length > 0) ||
          (flags['remove-labels'] && labelIdsToRemove.length > 0)
        ) {
          // eslint-disable-next-line no-await-in-loop
          const existingLabels = await issue.labels()
          let existingLabelIds = existingLabels.nodes.map((l) => l.id)

          // Add new labels
          if (flags['add-labels'] && labelIdsToAdd.length > 0) {
            existingLabelIds = [...new Set([...existingLabelIds, ...labelIdsToAdd])]
          }

          // Remove specified labels
          if (flags['remove-labels'] && labelIdsToRemove.length > 0) {
            existingLabelIds = existingLabelIds.filter((id) => !labelIdsToRemove.includes(id))
          }

          issuePayload.labelIds = existingLabelIds
        }

        // eslint-disable-next-line no-await-in-loop
        await this.updateIssueWithRetry(issue, issuePayload)
        result.succeeded.push(issue.identifier)
      } catch (error) {
        result.failed.push({
          error: error instanceof Error ? error.message : 'Unknown error',
          id: issue.identifier,
        })
      }

      if (progressBar) {
        progressBar.increment()
      }
    }

    if (progressBar) {
      progressBar.stop()
    }

    return result
  }

  private async fetchIssuesByIds(client: LinearClient, ids: string): Promise<Issue[]> {
    const issueIds = ids.split(',').map((id) => id.trim())

    return Promise.all(
      issueIds.map(async (id) => {
        const issue = await client.issue(id)

        if (!issue) {
          throw new Error(`Issue ${id} not found`)
        }

        return issue
      }),
    )
  }

  private async fetchIssuesByQuery(client: LinearClient, queryString: string, limit: number = 50): Promise<Issue[]> {
    // Parse query
    const queryFilter = parseQuery(queryString)

    // Build Linear filter from query
    const filter: LinearDocument.IssueFilter = {}

    // Resolve team first if specified (needed for state resolution)
    let teamId: null | string = null

    if (queryFilter.team) {
      teamId = await this.resolveTeamId(client, queryFilter.team)

      if (!teamId) {
        throw new Error(`Team "${queryFilter.team}" not found`)
      }

      filter.team = { id: { eq: teamId } }
    }

    // Resolve state
    if (queryFilter.state) {
      const stateId = await this.resolveStateId(client, queryFilter.state, teamId)

      if (!stateId) {
        throw new Error(`State "${queryFilter.state}" not found`)
      }

      filter.state = { id: { eq: stateId } }
    }

    // Resolve assignee
    if (queryFilter.assignee) {
      const userId = await this.resolveUserId(client, queryFilter.assignee)

      if (!userId) {
        throw new Error(`Assignee "${queryFilter.assignee}" not found`)
      }

      filter.assignee = { id: { eq: userId } }
    }

    // Resolve label
    if (queryFilter.label) {
      const labelId = await this.resolveLabelId(client, queryFilter.label)

      if (!labelId) {
        throw new Error(`Label "${queryFilter.label}" not found`)
      }

      filter.labels = { id: { in: [labelId] } }
    }

    // Resolve project
    if (queryFilter.project) {
      const projectId = await this.resolveProjectId(client, queryFilter.project)

      if (!projectId) {
        throw new Error(`Project "${queryFilter.project}" not found`)
      }

      filter.project = { id: { eq: projectId } }
    }

    // Resolve cycle
    if (queryFilter.cycle) {
      const cycleId = await this.resolveCycleId(client, queryFilter.cycle, teamId)

      if (!cycleId) {
        throw new Error(`Cycle "${queryFilter.cycle}" not found`)
      }

      filter.cycle = { id: { eq: cycleId } }
    }

    // Priority filter
    if (queryFilter.priority !== undefined) {
      filter.priority = { eq: queryFilter.priority }
    }

    // Fetch issues with filter
    // Use limit, but cap at 250 (Linear API max). If limit is 0, use 250.
    const fetchLimit = limit === 0 ? 250 : Math.min(limit, 250)

    const issuesResult = await client.issues({
      filter,
      first: fetchLimit,
    })

    if (issuesResult.nodes.length === 0) {
      throw new Error('No issues found matching query')
    }

    return issuesResult.nodes
  }

  private async resolveCycleId(client: LinearClient, nameOrNumber: string, teamId: null | string = null): Promise<null | string> {
    // If it looks like an ID, return as is
    if (nameOrNumber.includes('-')) {
      return nameOrNumber
    }

    // If we have a teamId, get cycles for that specific team
    if (teamId) {
      const team = await client.team(teamId)
      const cycles = await team.cycles()

      // Try to match by name or number
      const matchingCycle = cycles.nodes.find(
        (cycle) => {
          const nameMatch = cycle.name?.toLowerCase() === nameOrNumber.toLowerCase()
          const numberMatch = cycle.number?.toString() === nameOrNumber

          return nameMatch || numberMatch
        },
      )

      return matchingCycle?.id || null
    }

    // Otherwise search all cycles
    const cycles = await client.cycles({
      filter: { name: { containsIgnoreCase: nameOrNumber } },
      first: 1,
    })

    return cycles.nodes[0]?.id || null
  }

  private async resolveLabelId(client: LinearClient, nameOrId: string): Promise<null | string> {
    if (nameOrId.includes('-')) {
      return nameOrId
    }

    const labels = await client.issueLabels({
      filter: { name: { eqIgnoreCase: nameOrId } },
    })

    return labels.nodes[0]?.id || null
  }

  private async resolveProjectId(client: LinearClient, nameOrId: string): Promise<null | string> {
    // If it looks like an ID, return as is
    if (nameOrId.includes('-')) {
      return nameOrId
    }

    // Otherwise, look up by name
    const projects = await client.projects({
      filter: { name: { containsIgnoreCase: nameOrId } },
      first: 1,
    })

    return projects.nodes[0]?.id || null
  }

  private async resolveStateId(client: LinearClient, nameOrId: string, teamId: null | string = null): Promise<null | string> {
    if (nameOrId.includes('-')) {
      return nameOrId
    }

    // If we have a teamId, get states for that specific team
    if (teamId) {
      const team = await client.team(teamId)
      const states = await team.states()
      const matchingState = states.nodes.find(
        (state) => state.name.toLowerCase() === nameOrId.toLowerCase(),
      )

      return matchingState?.id || null
    }

    // Otherwise search all workflow states
    const states = await client.workflowStates({
      filter: { name: { eqIgnoreCase: nameOrId } },
    })

    return states.nodes[0]?.id || null
  }

  private async resolveTeamId(client: LinearClient, nameOrId: string): Promise<null | string> {
    // If it looks like an ID, return as is
    if (nameOrId.includes('-')) {
      return nameOrId
    }

    // Otherwise, look up by name or key
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

  private async showDryRunPreview(issues: Issue[], flags: IssueBatchFlags): Promise<void> {
    console.log('')
    console.log(chalk.bold.yellow('DRY RUN - No changes will be made'))
    console.log(chalk.gray('─'.repeat(80)))
    console.log('')

    // Show what will be updated
    const updates = []
    if (flags.cycle !== undefined) {
      if (flags.cycle === 'none') {
        updates.push('Remove cycle')
      } else {
        updates.push(`Set cycle to: ${flags.cycle}`)
      }
    }

    if (flags.state !== undefined) {
      updates.push(`Set state to: ${flags.state}`)
    }

    if (flags.assignee !== undefined) {
      updates.push(`Set assignee to: ${flags.assignee}`)
    }

    if (flags.priority !== undefined) {
      const priorityNames = ['None', 'Urgent', 'High', 'Normal', 'Low']
      updates.push(`Set priority to: ${priorityNames[flags.priority]} (${flags.priority})`)
    }

    if (flags['due-date'] !== undefined) {
      if (flags['due-date'] === 'none') {
        updates.push('Clear due date')
      } else {
        updates.push(`Set due date to: ${flags['due-date']}`)
      }
    }

    if (flags.project !== undefined) {
      updates.push(`Set project to: ${flags.project}`)
    }

    if (flags['add-labels'] !== undefined) {
      updates.push(`Add labels: ${flags['add-labels']}`)
    }

    if (flags['remove-labels'] !== undefined) {
      updates.push(`Remove labels: ${flags['remove-labels']}`)
    }

    console.log(chalk.bold('Updates to apply:'))
    for (const update of updates) {
      console.log(`  • ${update}`)
    }

    console.log('')
    console.log(chalk.bold(`Issues to update (${issues.length}):`))

    // Show issue details
    for (const issue of issues) {
      // eslint-disable-next-line no-await-in-loop
      const [state, cycle] = await Promise.all([issue.state, issue.cycle])
      const currentCycle = cycle ? `Cycle ${cycle.number}` : 'No cycle'

      console.log(`  • ${chalk.cyan(issue.identifier)} - ${issue.title}`)
      console.log(chalk.gray(`    Current: ${currentCycle} | ${state?.name || 'Unknown state'}`))
    }

    console.log('')
  }

  private async showQueryPreview(issues: Issue[], flags: IssueBatchFlags): Promise<void> {
    console.log('')
    console.log(chalk.bold.cyan('Query-based batch update'))
    console.log(chalk.gray('─'.repeat(80)))
    console.log('')

    // Show what will be updated (reuse logic from showDryRunPreview)
    const updates = []

    if (flags.cycle !== undefined) {
      if (flags.cycle === 'none') {
        updates.push('Remove cycle')
      } else {
        updates.push(`Set cycle to: ${flags.cycle}`)
      }
    }

    if (flags.state !== undefined) {
      updates.push(`Set state to: ${flags.state}`)
    }

    if (flags.assignee !== undefined) {
      updates.push(`Set assignee to: ${flags.assignee}`)
    }

    if (flags.priority !== undefined) {
      const priorityNames = ['None', 'Urgent', 'High', 'Normal', 'Low']
      updates.push(`Set priority to: ${priorityNames[flags.priority]} (${flags.priority})`)
    }

    if (flags['due-date'] !== undefined) {
      if (flags['due-date'] === 'none') {
        updates.push('Clear due date')
      } else {
        updates.push(`Set due date to: ${flags['due-date']}`)
      }
    }

    if (flags.project !== undefined) {
      updates.push(`Set project to: ${flags.project}`)
    }

    if (flags['add-labels'] !== undefined) {
      updates.push(`Add labels: ${flags['add-labels']}`)
    }

    if (flags['remove-labels'] !== undefined) {
      updates.push(`Remove labels: ${flags['remove-labels']}`)
    }

    console.log(chalk.bold('Updates to apply:'))
    for (const update of updates) {
      console.log(`  • ${update}`)
    }

    console.log('')
    console.log(chalk.bold(`Found ${issues.length} issue${issues.length === 1 ? '' : 's'}:`))

    // Show issue list (simplified, just ID and title)
    for (const issue of issues) {
      console.log(`  • ${chalk.cyan(issue.identifier)} - ${issue.title}`)
    }
  }

  private showSummary(result: BatchResult): void {
    console.log('')
    console.log(chalk.bold('Batch Update Summary'))
    console.log(chalk.gray('─'.repeat(80)))

    const successCount = result.succeeded.length
    const failCount = result.failed.length

    if (successCount > 0) {
      console.log(chalk.green(`✔ Successfully updated: ${successCount} issue(s)`))
    }

    if (failCount > 0) {
      console.log(chalk.red(`✖ Failed: ${failCount} issue(s)`))
      console.log('')
      console.log(chalk.bold('Failed issues:'))
      for (const failure of result.failed) {
        console.log(`  • ${chalk.cyan(failure.id)}: ${failure.error}`)
      }
    }

    console.log('')
  }

  private async updateIssueWithRetry(
    issue: Issue,
    updatePayload: Record<string, unknown>,
    maxRetries = 3,
  ): Promise<void> {
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const payload = await issue.update(updatePayload)

        if (!payload.success) {
          throw new Error('Update failed')
        }

        return // Success
      } catch (error) {
        const isLastAttempt = attempt === maxRetries + 1

        if (isLastAttempt) {
          throw error
        }

        // Calculate backoff delay (exponential: 500ms, 1s, 2s, ...)
        const delay = 2 ** (attempt - 1) * 500

        // Wait before retry
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => {
          setTimeout(resolve, delay)
        })
      }
    }
  }
}
