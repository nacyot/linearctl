import { Args, Command, Flags } from '@oclif/core'
import chalk from 'chalk'

import { getLinearClient, hasApiKey } from '../../services/linear.js'
import { CommonFlags } from '../../types/commands.js'

export default class IssueGet extends Command {
  static args = {
    id: Args.string({
      description: 'Issue ID (e.g., ENG-123)',
      required: true,
    }),
  }
static description = 'Get details of a Linear issue'
static examples = [
    '<%= config.bin %> <%= command.id %> ENG-123',
  ]
static flags = {
    json: Flags.boolean({
      default: false,
      description: 'Output as JSON',
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(IssueGet)
    await this.runWithArgs(args.id, flags)
  }

  async runWithArgs(issueId: string, flags: CommonFlags = {}): Promise<void> {
    // Check API key
    if (!hasApiKey()) {
      throw new Error('No API key configured. Run "lc init" first.')
    }

    const client = getLinearClient()
    
    try {
      // Fetch issue details
      const issue = await client.issue(issueId)
      
      if (!issue) {
        throw new Error(`Issue ${issueId} not found`)
      }
      
      // Fetch related data
      const [state, assignee, team, labels, project, parent, children, comments, attachments] = await Promise.all([
        issue.state,
        issue.assignee,
        issue.team,
        issue.labels(),
        issue.project,
        issue.parent,
        issue.children(),
        issue.comments(),
        issue.attachments(),
      ])
      
      // Output results
      if (flags.json) {
        const output = {
          assignee: assignee ? { id: assignee.id, name: assignee.name } : null,
          attachments: attachments.nodes.map(a => ({ id: a.id, title: a.title, url: a.url })),
          children: children.nodes.map(c => ({ id: c.id, identifier: c.identifier })),
          comments: comments.nodes.length,
          createdAt: issue.createdAt,
          description: issue.description,
          id: issue.id,
          identifier: issue.identifier,
          labels: labels.nodes.map(l => ({ id: l.id, name: l.name })),
          parent: parent ? { id: parent.id, identifier: parent.identifier } : null,
          project: project ? { id: project.id, name: project.name } : null,
          state: state ? { id: state.id, name: state.name } : null,
          team: team ? { id: team.id, key: team.key, name: team.name } : null,
          title: issue.title,
          updatedAt: issue.updatedAt,
          url: issue.url,
        }
        console.log(JSON.stringify(output, null, 2))
      } else {
        this.displayIssue(issue, { assignee, attachments, children, comments, labels, parent, project, state, team })
      }
      
    } catch (error) {
      if (error instanceof Error) {
        throw error
      }

      throw new Error(`Failed to fetch issue ${issueId}`)
    }
  }

  private displayIssue(issue: {createdAt: Date | string; description?: string; identifier: string; title: string; updatedAt: Date | string; url?: string}, related: {
    assignee?: {name: string};
    attachments?: {nodes: Array<{title: string; url: string}>};
    children?: {nodes: Array<{identifier: string; title: string}>};
    comments?: {nodes: {length: number}};
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
    
    console.log(info.join(chalk.gray(' • ')))
    
    // Labels
    if (related.labels && related.labels.nodes.length > 0) {
      const labelNames = related.labels.nodes.map((l) => chalk.magenta(l.name))
      console.log(`Labels: ${labelNames.join(', ')}`)
    }
    
    // Dates
    console.log(chalk.gray(`Created: ${this.formatDate(issue.createdAt)} • Updated: ${this.formatDate(issue.updatedAt)}`))
    
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