interface CommentNode {
  body: string
  createdAt: Date | string
  id: string
  user?: Promise<undefined | { name?: string }>
}

interface IssueData {
  assignee?: { name: string }
  attachments?: { nodes: Array<{ title: string; url: string }> }
  children?: { nodes: Array<{ identifier: string; title: string }> }
  comments?: { nodes: CommentNode[] }
  createdAt: Date | string
  cycle?: { name?: string; number?: number }
  description?: string
  dueDate?: string
  identifier: string
  labels?: { nodes: Array<{ name: string }> }
  parent?: { identifier: string; title: string }
  priority?: number
  project?: { name: string }
  state?: { name: string; type?: string }
  team?: { key: string; name: string }
  title: string
  updatedAt: Date | string
  url?: string
}

/**
 * Format issue data as markdown
 */
export async function formatIssueAsMarkdown(issue: IssueData): Promise<string> {
  const lines: string[] = [
    `# ${issue.identifier} • ${issue.title}`,
    '',
    '## Metadata',
    ''
  ]

  if (issue.state) {
    lines.push(`**State:** ${issue.state.name}`)
  }

  if (issue.assignee) {
    lines.push(`**Assignee:** ${issue.assignee.name}`)
  } else {
    lines.push('**Assignee:** Unassigned')
  }

  if (issue.team) {
    lines.push(`**Team:** ${issue.team.name} (${issue.team.key})`)
  }

  if (issue.project) {
    lines.push(`**Project:** ${issue.project.name}`)
  }

  if (issue.cycle && issue.cycle.name) {
    lines.push(`**Cycle:** ${issue.cycle.name}`)
  }

  if (issue.priority !== undefined) {
    const priorityNames = ['None', 'Urgent', 'High', 'Normal', 'Low']
    lines.push(`**Priority:** ${priorityNames[issue.priority]}`)
  }

  // Labels
  if (issue.labels && issue.labels.nodes.length > 0) {
    const labelNames = issue.labels.nodes.map((l) => l.name).join(', ')
    lines.push(`**Labels:** ${labelNames}`)
  }

  // Dates
  lines.push(`**Created:** ${formatDate(issue.createdAt)}`, `**Updated:** ${formatDate(issue.updatedAt)}`)

  if (issue.dueDate) {
    lines.push(`**Due:** ${issue.dueDate}`)
  }

  lines.push('')

  // Description
  if (issue.description) {
    lines.push('## Description', '', issue.description, '')
  }

  // Parent Issue
  if (issue.parent) {
    lines.push('## Parent Issue', '', `- [${issue.parent.identifier}] ${issue.parent.title}`, '')
  }

  // Sub-issues
  if (issue.children && issue.children.nodes.length > 0) {
    lines.push('## Sub-issues', '')

    for (const child of issue.children.nodes) {
      lines.push(`- [${child.identifier}] ${child.title}`)
    }

    lines.push('')
  }

  // Comments
  if (issue.comments && issue.comments.nodes.length > 0) {
    lines.push(`## Comments (${issue.comments.nodes.length})`, '')

    // Fetch all users in parallel
    const commentsWithUsers = await Promise.all(
      issue.comments.nodes.map(async (comment: CommentNode) => ({
        body: comment.body,
        createdAt: comment.createdAt,
        id: comment.id,
        user: comment.user ? await comment.user : undefined,
      }))
    )

    for (const comment of commentsWithUsers) {
      const userName = comment.user?.name || 'Unknown'
      const date = formatDate(comment.createdAt)

      lines.push(`### ${userName} • ${date}`, '', comment.body, '')
    }
  }

  // Attachments
  if (issue.attachments && issue.attachments.nodes.length > 0) {
    lines.push(`## Attachments (${issue.attachments.nodes.length})`, '')

    for (const attachment of issue.attachments.nodes) {
      lines.push(`- [${attachment.title}](${attachment.url})`)
    }

    lines.push('')
  }

  // URL
  if (issue.url) {
    lines.push('## Links', '', `[View in Linear](${issue.url})`, '')
  }

  return lines.join('\n')
}

function formatDate(date: Date | string): string {
  const d = new Date(date)
  return d.toLocaleDateString('en-US', {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}
