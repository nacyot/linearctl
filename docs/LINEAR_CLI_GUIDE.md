Use `lc` (after installing globally) or `npx linearctl` (without installation).

## Setup and Configuration

### Initial Setup

Get your Linear API key from [Linear Settings](https://linear.app/settings/api), then initialize:

```bash
lc init
# Enter your API key when prompted
```

### Multi-Profile Support

Linear CLI supports multiple profiles for working with different Linear workspaces (e.g., personal and work accounts):

```bash
# Initialize profiles
lc init --profile work
lc init --profile personal

# Use with any command
lc issue list --profile work
lc issue create --title "Task" --profile personal
lc doctor --profile work
```

**Profile Priority Order:**
1. `--profile` flag (highest priority) - explicitly select a profile
2. `LINEAR_API_KEY` environment variable - override with direct API key
3. `LINEAR_PROFILE` environment variable - select default profile
4. Default profile (lowest priority) - first initialized profile

Examples:
```bash
# Use explicit profile (overrides everything else)
lc issue list --profile work

# Set profile via environment variable
export LINEAR_PROFILE=work
lc issue list  # Uses work profile

# Override with direct API key
export LINEAR_API_KEY=lin_api_xxx
lc issue list  # Uses API key from environment

# But explicit profile flag wins
export LINEAR_API_KEY=lin_api_xxx
lc issue list --profile personal  # Uses personal profile API key
```

**Note:** All commands support the `--profile` flag. The first initialized profile automatically becomes the default profile.

## Issues

### lc issue list
```bash
lc issue list [options]
  -t, --team <name>           Filter by team
  -a, --assignee <name>       Filter by assignee
  -s, --state <name>          Filter by state (comma-separated for multiple)
  -l, --label <name>          Filter by label
  -p, --project <name>        Filter by project
  -c, --cycle <name-or-num>   Filter by cycle name or number (e.g., "Sprint 1" or 1)
  --exclude-state <name>      Exclude state(s) (comma-separated)
  --search <text>             Search in title and description
  --limit <number>            Number of issues (max 250)
  --include-archived          Include archived issues
  --order-by <field>          Order by field (createdAt, updatedAt)
  --json                      Output as JSON
```

Examples:
```bash
# Multiple states (OR logic)
lc issue list --state "Todo,In Progress,Blocked"

# Exclude completed states
lc issue list --exclude-state "Done,Canceled"

# Text search in title and description
lc issue list --search "API bug" --team ENG

# Combine filters
lc issue list --team ENG --state Todo --label bug --search "login"
```

Note: All filter options support fuzzy matching. If an exact match is not found,
the CLI will suggest similar items (e.g., "Shooping" → "Shopping").

### lc issue get
```bash
lc issue get <id> [--json]
```

### lc issue create
```bash
lc issue create [options]
  -t, --title <text>          Issue title (required)
  --team <name>               Team name or key (required)
  -d, --description <text>    Issue description
  -a, --assignee <name>       Assignee
  -s, --state <name>          State
  -p, --priority <0-4>        Priority (0=None, 1=Urgent, 2=High, 3=Normal, 4=Low)
  -l, --labels <names>        Comma-separated labels
  --due-date <YYYY-MM-DD>     Due date
  --project <name>            Project
  -c, --cycle <name-or-num>   Cycle name or number (e.g., "Sprint 1" or 1)
  --parent <id>               Parent issue ID or identifier (e.g., ENG-123)
  --delegate <emails>         Comma-separated delegate emails
  --links <ids>               Comma-separated issue IDs to link
  --json                      Output as JSON
```

### lc issue update
```bash
lc issue update <id> [options]
  --title <text>              Issue title
  --description <text>        Issue description
  -a, --assignee <name>       Assignee (use "none" to clear)
  -s, --state <name>          State
  -p, --priority <0-4>        Priority
  -l, --labels <names>        Replace all labels (comma-separated)
  --add-labels <names>        Add labels (preserves existing)
  --remove-labels <names>     Remove specific labels
  --due-date <YYYY-MM-DD>     Due date (use "none" to clear)
  --project <name>            Project
  -c, --cycle <name-or-num>   Cycle name or number (e.g., "Sprint 1" or 1)
  --parent <id>               Parent issue ID or identifier (e.g., ENG-123)
  --duplicate-of <id>         Mark as duplicate of issue (sets state and relation)
  -e, --estimate <number>     Story points
  --delegate <emails>         Comma-separated delegates (use "none" to clear)
  --links <ids>               Comma-separated issue IDs to link
  --json                      Output as JSON
```

Examples:
```bash
# Add labels without replacing existing ones
lc issue update ENG-123 --add-labels "urgent,bug"

# Remove specific labels
lc issue update ENG-123 --remove-labels "wontfix"

# Set priority and due date
lc issue update ENG-123 --priority 1 --due-date "2025-12-31"

# Clear due date and assignee
lc issue update ENG-123 --due-date none --assignee none
```

### lc issue mine
```bash
lc issue mine [options]
  -s, --state <name>          Filter by state
  --limit <number>            Number of issues
  --include-archived          Include archived issues
  --json                      Output as JSON
```

### lc issue delete
```bash
lc issue delete <id> [options]
  -a, --archive               Archive the issue (default)
  --permanent                 Permanently delete the issue (cannot be undone)
  --json                      Output as JSON
```

Examples:
```bash
# Archive issue (can be restored)
lc issue delete ENG-123
lc issue delete ENG-123 --archive

# Permanently delete (cannot be undone)
lc issue delete ENG-123 --permanent
```

Note: Archiving is the default and recommended option as it allows recovery.
Use --permanent only when you're absolutely certain.

### lc issue batch
```bash
lc issue batch --ids <ids> [options]
lc issue batch --query <query> [options]
  # Selection (one required)
  --ids <ids>                 Comma-separated issue IDs (e.g., ENG-123,ENG-124)
  --query <query>             Query string (e.g., "state:Todo team:ENG")

  # Update fields
  -s, --state <name>          Set state
  -a, --assignee <name>       Set assignee
  -c, --cycle <name-or-num>   Cycle name, number, or "none" to remove (e.g., "Sprint 1", 1, or "none")
  -p, --priority <0-4>        Priority (0=None, 1=Urgent, 2=High, 3=Normal, 4=Low)
  --due-date <YYYY-MM-DD>     Due date or "none" to clear
  --project <name>            Project name or ID
  --add-labels <names>        Add labels (preserves existing)
  --remove-labels <names>     Remove specific labels

  # Control
  --limit <number>            Max issues to update (default: 50, 0=unlimited, only with --query)
  --confirm                   Skip interactive confirmation (for automation)
  --dry-run                   Preview changes without updating
  --json                      Output as JSON
```

Examples:
```bash
# Update specific issues by ID
lc issue batch --ids ENG-123,ENG-124 --state "In Progress" --add-labels "urgent"

# Query-based update (interactive by default)
lc issue batch --query "state:Todo team:ENG" --state "In Progress"

# Query with limit and confirmation skip (for automation)
lc issue batch --query "state:Done" --cycle none --limit 100 --confirm

# Update priority and due date
lc issue batch --ids ENG-123,ENG-124 --priority 1 --due-date "2025-12-31"

# Add and remove labels
lc issue batch --query "label:old" --remove-labels "old" --add-labels "archived"

# Preview changes before applying
lc issue batch --ids ENG-123,ENG-124 --cycle 5 --dry-run
```

Query Syntax (AND logic only):
```bash
# Supported keys: state, team, assignee, label, project, cycle, priority
# Format: key:value (use quotes for values with spaces)

lc issue batch --query 'state:Todo team:ENG assignee:"John Doe"'
lc issue batch --query "priority:1 label:bug"
lc issue batch --query 'state:"In Progress" project:Q4'
```

**Supported Query Keys:**
- `state:<name>` - Filter by workflow state (e.g., "Todo", "In Progress")
- `team:<key>` - Filter by team key (e.g., "ENG", "DESIGN")
- `assignee:<name>` - Filter by assignee name or email
- `label:<name>` - Filter by label name
- `project:<name>` - Filter by project name
- `cycle:<num>` - Filter by cycle number (e.g., "1", "2")
- `priority:<0-4>` - Filter by priority (0=None, 1=Urgent, 2=High, 3=Normal, 4=Low)

**Safety Features:**
- **Interactive Confirmation**: When using `--query`, you'll see a preview of issues
  and be asked to confirm before making changes (unless `--confirm` is used)
- **Limit Protection**: Default limit of 50 issues prevents accidental mass updates.
  Use `--limit 0` for unlimited, or set a custom limit (e.g., `--limit 100`)
- **Dry Run**: Use `--dry-run` to preview exactly what will change without applying updates

**Label Operations:**
- `--add-labels`: Adds new labels while preserving existing ones
- `--remove-labels`: Removes specific labels while keeping others
- Both can be used together in the same command

## Comments

### lc comment list
```bash
lc comment list <issue-id> [--json]
```

### lc comment add
```bash
lc comment add <issue-id> [options]
  -b, --body <text>           Comment body (required)
  -p, --parent <id>           Parent comment ID for replies
```

## Attachments

### lc attachment list
```bash
lc attachment list <issue-id> [--json]
```

### lc attachment add
```bash
lc attachment add [options]
  -i, --issue <id>            Issue ID (required)
  -u, --url <url>             URL to attach (required)
  -t, --title <text>          Attachment title (default: URL hostname)
  -s, --subtitle <text>       Subtitle
  -d, --description <text>    Description
  --icon-url <url>            Icon URL
  --metadata <json>           Metadata as JSON string
  -o, --open                  Open attachment in browser after creation
  -j, --json                  Output as JSON
```

### lc attachment upload
```bash
lc attachment upload [options]
  -i, --issue <id>            Issue ID (required)
  -f, --file <path>           File path to upload (required)
  -t, --title <text>          Attachment title (default: filename)
  -s, --subtitle <text>       Subtitle
  -d, --description <text>    Description
  --icon-url <url>            Icon URL
  --metadata <json>           Metadata as JSON string
  -o, --open                  Open attachment in browser after upload
  -j, --json                  Output as JSON
```

### lc attachment delete
```bash
lc attachment delete <attachment-id> [--json]
```

## Teams

### lc team list
```bash
lc team list [options]
  -q, --query <text>          Search teams
  --limit <number>            Number of teams
  --include-archived          Include archived teams
  --json                      Output as JSON
```

### lc team get
```bash
lc team get <name-or-key> [--json]
```

## Users

### lc user list
```bash
lc user list [options]
  -q, --query <text>          Search users
  --active                    Only active users
  --include-archived          Include archived users
  --limit <number>            Number of users
  --json                      Output as JSON
```

### lc user get
```bash
lc user get <name-or-email> [--json]
```

## Projects

### lc project list
```bash
lc project list [options]
  -t, --team <name>           Filter by team
  -s, --state <name>          Filter by state
  -q, --query <text>          Search projects
  --limit <number>            Number of projects
  --include-archived          Include archived projects
  --json                      Output as JSON
```

### lc project get
```bash
lc project get <name-or-id> [--json]
```

### lc project create
```bash
lc project create [options]
  -n, --name <text>           Project name (required)
  -t, --team <name>           Team (required)
  -d, --description <text>    Description
  --lead <name>               Lead user
  -s, --state <name>          State (planned, started, completed, canceled)
  --start-date <YYYY-MM-DD>   Start date
  --target-date <YYYY-MM-DD>  Target date
```

### lc project update
```bash
lc project update <id> [options]
  -n, --name <text>           Project name
  -d, --description <text>    Description
  --lead <name>               Lead user
  -s, --state <name>          State
  --start-date <YYYY-MM-DD>   Start date
  --target-date <YYYY-MM-DD>  Target date
```

## Labels

### lc label list
```bash
lc label list [options]
  -t, --team <name>           Filter by team
  --limit <number>            Number of labels
  --json                      Output as JSON
```

### lc label create
```bash
lc label create [options]
  -n, --name <text>           Label name (required)
  -c, --color <hex>           Color in hex format (required)
  -d, --description <text>    Description
  -t, --team <name>           Team (optional, workspace label if not specified)
```

## Workflow States

### lc status list
```bash
lc status list --team <name> [--json]
```

### lc status get
```bash
lc status get <name-or-id> --team <name> [--json]
```

## Cycles

### lc cycle list
```bash
lc cycle list --team <name> [options]
  --type <type>               Type (current, previous, next, all)
  --limit <number>            Number of cycles
  --json                      Output as JSON
```

## Documents

### lc document list
```bash
lc document list [options]
  -q, --query <text>          Search documents
  --project <id>              Filter by project
  --creator <id>              Filter by creator
  --limit <number>            Number of documents
  --include-archived          Include archived documents
  --json                      Output as JSON
```

### lc document get
```bash
lc document get <id-or-slug> [--json]
```

## Rules

### lc rule add
```bash
lc rule add <path>            Copy Linear CLI guide to project
```

## Other Commands

### lc init
```bash
lc init [options]
  -k, --api-key <key>         Linear API key
  --profile <name>            Profile name (default: "default")
```

Initialize Linear CLI with API key. Supports multiple profiles for different workspaces.

Examples:
```bash
# Initialize default profile
lc init

# Initialize specific profile
lc init --profile work
lc init --profile personal --api-key lin_api_xxx
```

### lc doctor
```bash
lc doctor [options]
  --profile <name>            Check specific profile
```

Check configuration and test API connection.

Examples:
```bash
# Check default profile
lc doctor

# Check specific profile
lc doctor --profile work
```

### lc version
```bash
lc version                    Show version
```

### lc help
```bash
lc --help                     Show help
lc <command> --help          Show command help
```