import { type Issue, type LinearClient } from '@linear/sdk'
import { Command, Flags } from '@oclif/core'
import chalk from 'chalk'
import cliProgress from 'cli-progress'

import { getLinearClient, hasApiKey } from '../../services/linear.js'
import { IssueBatchFlags } from '../../types/commands.js'

interface BatchResult {
  failed: Array<{ error: string; id: string }>
  succeeded: string[]
}

export default class IssueBatch extends Command {
  static description = 'Update multiple Linear issues at once'
  static examples = [
    '<%= config.bin %> <%= command.id %> --ids ENG-123,ENG-124,ENG-125 --cycle 5',
    '<%= config.bin %> <%= command.id %> --ids ENG-123,ENG-124 --cycle none',
    '<%= config.bin %> <%= command.id %> --ids ENG-123,ENG-124 --cycle 5 --dry-run',
  ]
  static flags = {
    'add-labels': Flags.string({
      description: 'Add labels (preserves existing)',
    }),
    assignee: Flags.string({
      char: 'a',
      description: 'Assignee name or ID',
    }),
    cycle: Flags.string({
      char: 'c',
      description: 'Cycle number or "none" to remove cycle',
    }),
    'dry-run': Flags.boolean({
      default: false,
      description: 'Preview changes without updating',
    }),
    ids: Flags.string({
      description: 'Comma-separated issue IDs (e.g., ENG-123,ENG-124)',
      required: true,
    }),
    json: Flags.boolean({
      default: false,
      description: 'Output as JSON',
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

  async runWithArgs(flags: IssueBatchFlags): Promise<void> {
    // Check API key
    if (!hasApiKey()) {
      throw new Error('No API key configured. Run "lc init" first.')
    }

    // Validate that at least one update field is provided
    if (!flags.cycle && !flags.state && !flags.assignee && !flags['add-labels']) {
      throw new Error('At least one update field is required (e.g., --cycle, --state, --assignee)')
    }

    const client = getLinearClient()

    // Parse issue IDs
    const issueIds = flags.ids.split(',').map((id) => id.trim())

    // Fetch all issues
    const issues = await Promise.all(
      issueIds.map(async (id) => {
        const issue = await client.issue(id)
        if (!issue) {
          throw new Error(`Issue ${id} not found`)
        }

        return issue
      }),
    )

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
            total: issueIds.length,
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

        // Handle labels per-issue (merge with existing)
        if (flags['add-labels'] && labelIdsToAdd.length > 0) {
          // eslint-disable-next-line no-await-in-loop
          const existingLabels = await issue.labels()
          const existingLabelIds = existingLabels.nodes.map((l) => l.id)
          issuePayload.labelIds = [...new Set([...existingLabelIds, ...labelIdsToAdd])]
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

    if (flags['add-labels'] !== undefined) {
      updates.push(`Add labels: ${flags['add-labels']}`)
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
