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
    if (!flags.cycle) {
      throw new Error('At least one update field is required (e.g., --cycle)')
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
    const result = await this.executeBatchUpdate(issues, updatePayload, flags.json || false)

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

    // Future: Add more fields here (state, assignee, priority, etc.)
    // if (flags.state) { ... }
    // if (flags.assignee) { ... }
    // if (flags.priority) { ... }

    return payload
  }

  private async executeBatchUpdate(
    issues: Issue[],
    updatePayload: Record<string, unknown>,
    isJsonOutput: boolean,
  ): Promise<BatchResult> {
    const result: BatchResult = {
      failed: [],
      succeeded: [],
    }

    // Progress bar (only if not JSON output)
    let progressBar: cliProgress.SingleBar | null = null
    if (!isJsonOutput) {
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
        // eslint-disable-next-line no-await-in-loop
        await this.updateIssueWithRetry(issue, updatePayload)
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
