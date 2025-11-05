# Linear CLI Batch Operations - Use Case Scenarios

## Overview
Batch operations allow updating multiple Linear issues at once, saving time on repetitive tasks.

## Common Scenarios

### 1. Cycle Planning
**Scenario**: Sprint planning - moving backlog items to next cycle
```bash
# Move 10 backlog issues to Cycle 5
lc issue batch --query "state:Backlog team:ENG" --limit 10 --cycle 5

# Move specific issues to current cycle
lc issue batch --ids ENG-123,ENG-124,ENG-125 --cycle current

# Clear cycle assignment (move back to backlog)
lc issue batch --ids ENG-130,ENG-131 --cycle none
```

**Use Case**:
- Weekly/bi-weekly sprint planning
- Quickly populate next cycle with ready issues
- Reorganize when cycle scope changes

---

### 2. State Transitions
**Scenario**: Bulk state updates for completed work
```bash
# Mark all "In Progress" issues from last cycle as "Done"
lc issue batch --query "state:In Progress cycle:4" --state Done

# Move all issues assigned to me in "Todo" to "In Progress"
lc issue batch --query "state:Todo assignee:@me" --state "In Progress"

# Cancel old issues
lc issue batch --query "created:<2024-01-01 state:Backlog" --state Canceled
```

**Use Case**:
- End-of-cycle cleanup
- Starting daily work
- Bulk archiving old issues

---

### 3. Team Reorganization
**Scenario**: Reassigning issues when team members change
```bash
# Reassign all of John's issues to Jane (employee leaving)
lc issue batch --query "assignee:john@company.com" --assignee "jane@company.com"

# Unassign issues from inactive team member
lc issue batch --query "assignee:john@company.com state:Todo" --assignee none

# Distribute open issues to team lead
lc issue batch --ids ENG-140,ENG-141,ENG-142 --assignee "team-lead@company.com"
```

**Use Case**:
- Employee transitions
- Vacation coverage
- Load balancing

---

### 4. Label Management
**Scenario**: Categorizing and organizing issues
```bash
# Add "urgent" label to high-priority bugs
lc issue batch --query "priority:1 label:bug" --add-labels urgent

# Remove deprecated labels
lc issue batch --query "label:old-sprint" --remove-labels old-sprint

# Tag all security issues
lc issue batch --query "title:*security* OR description:*security*" --add-labels security
```

**Use Case**:
- Emergency triage
- Label cleanup
- Categorization improvements

---

### 5. Priority Updates
**Scenario**: Adjusting priorities based on business needs
```bash
# Downgrade priority of old backlog items
lc issue batch --query "state:Backlog created:<2024-01-01" --priority 4

# Urgent security fixes
lc issue batch --query "label:security state:Todo" --priority 1

# Normal priority for new features
lc issue batch --ids ENG-150,ENG-151,ENG-152 --priority 3
```

**Use Case**:
- Quarterly priority reviews
- Emergency escalations
- Backlog grooming

---

### 6. Due Date Management
**Scenario**: Setting deadlines for related work
```bash
# Set deadline for all issues in current cycle
lc issue batch --query "cycle:current state:Todo" --due-date 2025-01-31

# Extend deadline for delayed features
lc issue batch --query "label:feature-x" --due-date 2025-02-15

# Clear due dates from completed work
lc issue batch --query "state:Done" --due-date none
```

**Use Case**:
- Release planning
- Deadline adjustments
- Cleanup

---

### 7. Project Assignment
**Scenario**: Organizing issues under projects
```bash
# Assign all MVP issues to launch project
lc issue batch --query "label:mvp" --project "Product Launch"

# Move remaining issues out of completed project
lc issue batch --query "project:Q1-Initiative state:Todo" --project none

# Group related work
lc issue batch --ids ENG-160,ENG-161,ENG-162 --project "Authentication Redesign"
```

**Use Case**:
- Project initialization
- Project cleanup
- Work organization

---

## Query Syntax

### Supported Filters
```bash
--query "FILTER [AND|OR] FILTER ..."

Filters:
  state:STATE               # State name (Todo, In Progress, Done, etc.)
  assignee:NAME|EMAIL|@me   # Assignee
  team:TEAM_KEY            # Team key (ENG, DESIGN, etc.)
  cycle:NUMBER|current     # Cycle number or "current"
  label:LABEL_NAME         # Label name
  priority:0-4             # Priority level
  created:>DATE|<DATE      # Creation date (YYYY-MM-DD)
  updated:>DATE|<DATE      # Update date
  title:*KEYWORD*          # Title search (supports wildcards)
  description:*KEYWORD*    # Description search
  project:PROJECT_NAME     # Project name
```

### Examples
```bash
# Complex query
lc issue batch \
  --query "team:ENG AND state:Backlog AND priority:>2 AND created:<2024-06-01" \
  --cycle 5

# OR conditions
lc issue batch \
  --query "assignee:@me OR assignee:none" \
  --state "In Progress"

# Multiple filters
lc issue batch \
  --query "label:bug AND priority:1 AND state:Todo" \
  --assignee "on-call@company.com"
```

---

## Batch Command Design

### Command Structure
```bash
lc issue batch [SELECTION] [UPDATES] [OPTIONS]

SELECTION (pick one):
  --query "QUERY"          # Query-based selection
  --ids ID1,ID2,ID3        # Explicit issue IDs

UPDATES (can combine multiple):
  --state STATE
  --assignee USER
  --cycle CYCLE
  --priority 0-4
  --due-date DATE|none
  --project PROJECT|none
  --add-labels LABEL1,LABEL2
  --remove-labels LABEL1,LABEL2

OPTIONS:
  --limit N                # Max issues to update (with --query)
  --dry-run                # Preview without making changes
  --json                   # JSON output
  --confirm                # Ask for confirmation before update
```

### Safety Features
1. **Preview Mode**: `--dry-run` shows what would be updated
2. **Confirmation**: `--confirm` asks before applying changes
3. **Limit**: `--limit` prevents accidental mass updates
4. **Summary**: Shows count of affected issues before and after

---

## Implementation Priority

### Phase 1: Core Functionality
- [x] Basic batch command structure
- [ ] Query parser and issue selection
- [ ] Single field updates (cycle, state, assignee)
- [ ] Dry-run mode
- [ ] Basic confirmation

### Phase 2: Advanced Features
- [ ] Multiple field updates in one command
- [ ] Label add/remove operations
- [ ] Complex query support (AND/OR)
- [ ] Progress indicator for large batches
- [ ] Undo capability

### Phase 3: Enhancements
- [ ] Batch templates (saved queries)
- [ ] Interactive mode (TUI for selection)
- [ ] Validation and error handling
- [ ] Detailed logging and audit trail
- [ ] Performance optimization

---

## Error Handling

### Validation
- Check if all specified issues exist
- Validate field values (state names, user emails, etc.)
- Warn about potential conflicts

### Partial Failures
- Continue processing on individual failures
- Report which issues succeeded/failed
- Provide option to retry failed updates

### Example Output
```
Batch Update Summary
────────────────────────────────────────
Issues selected: 15
Successfully updated: 13
Failed: 2
  - ENG-123: Invalid state "DoNe" (did you mean "Done"?)
  - ENG-125: Permission denied

Changes applied:
  - Cycle: Backlog → Cycle 5 (13 issues)
```

---

## Testing Strategy

### Unit Tests
- Query parser correctness
- Issue selection logic
- Field update operations
- Error handling

### Integration Tests
- End-to-end batch updates
- Multiple field updates
- Dry-run accuracy
- Rollback scenarios

### Manual Testing Scenarios
1. Small batch (3-5 issues)
2. Medium batch (20-50 issues)
3. Large batch (100+ issues)
4. Edge cases (empty results, all failures)
