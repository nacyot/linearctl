import { Args, Flags } from '@oclif/core'
import chalk from 'chalk'

import { BaseCommand } from '../../base-command.js'
import { getLinearClient, hasApiKey } from '../../services/linear.js'
import { CommonFlags } from '../../types/commands.js'
import { handleLinearError } from '../../utils/error-handler.js'

export default class IssueGet extends BaseCommand {
  static args = {
    ids: Args.string({
      description: 'Issue ID(s) - single ID or multiple IDs separated by space or comma (e.g., ENG-123 or ENG-123,ENG-124)',
      required: true,
    }),
  }
static description = 'Get details of one or more Linear issues'
static examples = [
    '<%= config.bin %> <%= command.id %> ENG-123',
    '<%= config.bin %> <%= command.id %> ENG-123 ENG-124 ENG-125',
    '<%= config.bin %> <%= command.id %> ENG-123,ENG-124,ENG-125',
  ]
static flags = {
    ...BaseCommand.baseFlags,
    json: Flags.boolean({
      default: false,
      description: 'Output as JSON',
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(IssueGet)

    // Parse issue IDs - support both comma and space separated
    const issueIds = args.ids.split(/[,\s]+/).filter(Boolean)

    await (issueIds.length === 1
      ? this.runWithArgs(issueIds[0], flags)
      : this.runWithMultipleArgs(issueIds, flags))
  }

  async runWithArgs(issueId: string, flags: CommonFlags & { profile?: string } = {}): Promise<void> {
    // Check API key
    if (!hasApiKey()) {
      throw new Error('No API key configured. Run "lc init" first.')
    }

    const client = getLinearClient({ profile: flags.profile })
    
    try {
      // Fetch issue details
      const issue = await client.issue(issueId)
      
      if (!issue) {
        throw new Error(`Issue ${issueId} not found`)
      }
      
      // Fetch related data
      const [state, assignee, team, labels, project, parent, children, comments, attachments, cycle] = await Promise.all([
        issue.state,
        issue.assignee,
        issue.team,
        issue.labels(),
        issue.project,
        issue.parent,
        issue.children(),
        issue.comments(),
        issue.attachments(),
        issue.cycle,
      ])
      
      // Output results
      if (flags.json) {
        const output = {
          assignee: assignee ? { id: assignee.id, name: assignee.name } : null,
          attachments: attachments.nodes.map(a => ({ id: a.id, title: a.title, url: a.url })),
          children: children.nodes.map(c => ({ id: c.id, identifier: c.identifier })),
          comments: comments.nodes.length,
          createdAt: issue.createdAt,
          cycle: cycle ? { id: cycle.id, name: cycle.name || '', number: cycle.number || 0 } : null,
          description: issue.description,
          dueDate: issue.dueDate,
          id: issue.id,
          identifier: issue.identifier,
          labels: labels.nodes.map(l => ({ id: l.id, name: l.name })),
          parent: parent ? { id: parent.id, identifier: parent.identifier } : null,
          priority: issue.priority,
          project: project ? { id: project.id, name: project.name } : null,
          state: state ? { id: state.id, name: state.name } : null,
          team: team ? { id: team.id, key: team.key, name: team.name } : null,
          title: issue.title,
          updatedAt: issue.updatedAt,
          url: issue.url,
        }
        console.log(JSON.stringify(output, null, 2))
      } else {
        this.displayIssue(issue, { assignee, attachments, children, comments, cycle, dueDate: issue.dueDate, labels, parent, priority: issue.priority, project, state, team })
      }
      
    } catch (error) {
      handleLinearError(error)
    }
  }

  async runWithMultipleArgs(issueIds: string[], flags: CommonFlags & { profile?: string } = {}): Promise<void> {
    // Check API key
    if (!hasApiKey()) {
      throw new Error('No API key configured. Run "lc init" first.')
    }

    const client = getLinearClient({ profile: flags.profile })

    try {
      // Fetch all issues in parallel (N API calls instead of N×11)
      const issuePromises = issueIds.map(async (issueId) => {
        try {
          const issue = await client.issue(issueId)

          if (!issue) {
            return null
          }

          // Fetch related data in parallel for this issue
          const [state, assignee, team, labels, project, parent, children, comments, attachments, cycle] =
            await Promise.all([
              issue.state,
              issue.assignee,
              issue.team,
              issue.labels(),
              issue.project,
              issue.parent,
              issue.children(),
              issue.comments(),
              issue.attachments(),
              issue.cycle,
            ])

          return {
            assignee,
            attachments,
            children,
            comments,
            createdAt: issue.createdAt,
            cycle,
            description: issue.description,
            dueDate: issue.dueDate,
            id: issue.id,
            identifier: issue.identifier,
            labels,
            parent,
            priority: issue.priority,
            project,
            state,
            team,
            title: issue.title,
            updatedAt: issue.updatedAt,
            url: issue.url,
          }
        } catch {
          return null
        }
      })

      const issueResults = await Promise.all(issuePromises)
      const issues = issueResults.filter((issue): issue is NonNullable<typeof issue> => issue !== null)

      if (issues.length === 0) {
        throw new Error(`No issues found for IDs: ${issueIds.join(', ')}`)
      }

      // Warn if some issues were not found
      if (issues.length < issueIds.length) {
        const foundIds = new Set(issues.map(i => i.identifier))
        const notFound = issueIds.filter(id => !foundIds.has(id))
        console.warn(chalk.yellow(`⚠️  Issues not found: ${notFound.join(', ')}`))
        console.log('')
      }

      // Output results
      if (flags.json) {
        const output = issues.map(issue => ({
          assignee: issue.assignee ? { id: issue.assignee.id, name: issue.assignee.name } : null,
          attachments: issue.attachments.nodes.map(a => ({ id: a.id, title: a.title, url: a.url })),
          children: issue.children.nodes.map(c => ({ id: c.id, identifier: c.identifier })),
          comments: issue.comments.nodes.length,
          createdAt: issue.createdAt,
          cycle: issue.cycle ? { id: issue.cycle.id, name: issue.cycle.name || '', number: issue.cycle.number || 0 } : null,
          description: issue.description,
          dueDate: issue.dueDate,
          id: issue.id,
          identifier: issue.identifier,
          labels: issue.labels.nodes.map(l => ({ id: l.id, name: l.name })),
          parent: issue.parent ? { id: issue.parent.id, identifier: issue.parent.identifier } : null,
          priority: issue.priority,
          project: issue.project ? { id: issue.project.id, name: issue.project.name } : null,
          state: issue.state ? { id: issue.state.id, name: issue.state.name } : null,
          team: issue.team ? { id: issue.team.id, key: issue.team.key, name: issue.team.name } : null,
          title: issue.title,
          updatedAt: issue.updatedAt,
          url: issue.url,
        }))
        console.log(JSON.stringify(output, null, 2))
      } else {
        // Display each issue
        for (const [index, issue] of issues.entries()) {
          if (index > 0) {
            console.log(chalk.gray('\n' + '='.repeat(80) + '\n'))
          }

          this.displayIssue(issue, {
            assignee: issue.assignee || undefined,
            attachments: issue.attachments,
            children: issue.children,
            comments: issue.comments,
            cycle: issue.cycle || undefined,
            dueDate: issue.dueDate,
            labels: issue.labels,
            parent: issue.parent || undefined,
            priority: issue.priority,
            project: issue.project || undefined,
            state: issue.state || undefined,
            team: issue.team || undefined,
          })
        }
      }
    } catch (error) {
      handleLinearError(error)
    }
  }

  private displayIssue(issue: {createdAt: Date | string; description?: string; identifier: string; title: string; updatedAt: Date | string; url?: string}, related: {
    assignee?: {name: string};
    attachments?: {nodes: Array<{title: string; url: string}>};
    children?: {nodes: Array<{identifier: string; title: string}>};
    comments?: {nodes: {length: number}};
    cycle?: {name?: string; number?: number};
    dueDate?: string;
    labels?: {nodes: Array<{name: string}>};
    parent?: {identifier: string; title: string};
    priority?: number;
    project?: {name: string};
    relatedIssues?: {nodes: Array<{identifier: string; title: string}>};
    state?: {name: string; type?: string};
    team?: {key: string; name: string;};
  }): void {
    console.log('')
    
    // Header
    console.log(chalk.bold.cyan(issue.identifier) + chalk.gray(' • ') + chalk.bold(issue.title))
    console.log(chalk.gray('─'.repeat(80)))
    
    // Basic info
    const info = []
    
    if (related.state) {
      info.push(`State: ${this.formatState(related.state)}`)
    }
    
    if (related.assignee) {
      info.push(`Assignee: ${related.assignee.name}`)
    } else {
      info.push(`Assignee: ${chalk.gray('Unassigned')}`)
    }
    
    if (related.team) {
      info.push(`Team: ${related.team.name} (${related.team.key})`)
    }
    
    if (related.project) {
      info.push(`Project: ${related.project.name}`)
    }

    if (related.cycle && related.cycle.name) {
      info.push(`Cycle: ${related.cycle.name}`)
    }

    if (related.priority !== undefined) {
      const priorityNames = ['None', 'Urgent', 'High', 'Normal', 'Low']
      info.push(`Priority: ${priorityNames[related.priority]}`)
    }

    console.log(info.join(chalk.gray(' • ')))

    // Labels
    if (related.labels && related.labels.nodes.length > 0) {
      const labelNames = related.labels.nodes.map((l) => chalk.magenta(l.name))
      console.log(`Labels: ${labelNames.join(', ')}`)
    }

    // Dates
    const dateInfo = [`Created: ${this.formatDate(issue.createdAt)}`, `Updated: ${this.formatDate(issue.updatedAt)}`]

    if (related.dueDate) {
      dateInfo.push(`Due: ${related.dueDate}`)
    }

    console.log(chalk.gray(dateInfo.join(' • ')))

    // Description
    if (issue.description) {
      console.log(chalk.gray('\n─ Description ─'))
      console.log(issue.description)
    }
    
    // Related issues
    if (related.parent) {
      console.log(chalk.gray('\n─ Parent Issue ─'))
      console.log(chalk.cyan(related.parent.identifier))
    }
    
    if (related.children && related.children.nodes.length > 0) {
      console.log(chalk.gray('\n─ Sub-issues ─'))
      for (const child of related.children.nodes) {
        console.log(`  • ${chalk.cyan(child.identifier)}`)
      }
    }
    
    // Comments
    if (related.comments && related.comments.nodes.length > 0) {
      console.log(chalk.gray(`\n─ Comments (${related.comments.nodes.length}) ─`))
      console.log(chalk.gray(`Run "lc comment list --issue ${issue.identifier}" to view comments`))
    }

    // Attachments
    if (related.attachments && related.attachments.nodes.length > 0) {
      console.log(chalk.gray(`\n─ Attachments (${related.attachments.nodes.length}) ─`))
      for (const attachment of related.attachments.nodes) {
        console.log(`  • ${attachment.title}`)
        console.log(chalk.blue(`    ${attachment.url}`))
      }
    }

    // URL
    if (issue.url) {
      console.log(chalk.gray('\n─ View in Linear ─'))
      console.log(chalk.blue(issue.url))
    }
    
    console.log('')
  }

  private formatDate(date: Date | string): string {
    const d = new Date(date)
    return d.toLocaleDateString('en-US', { 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  }

  private formatState(state: {name: string; type?: string}): string {
    if (!state) return chalk.gray('Unknown')
    
    const name = state.name || 'Unknown'
    const {type} = state
    
    switch (type) {
      case 'backlog': {
        return chalk.gray(name)
      }

      case 'canceled': {
        return chalk.red(name)
      }

      case 'completed': {
        return chalk.green(name)
      }

      case 'started': {
        return chalk.yellow(name)
      }

      case 'unstarted': {
        return chalk.blue(name)
      }

      default: {
        return name
      }
    }
  }
}