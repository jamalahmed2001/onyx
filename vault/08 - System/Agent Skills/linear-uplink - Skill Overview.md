---
tags: [system, status-active, skill-doc]
graph_domain: system
status: active
skill_name: linear-uplink
version: 2.0.0
author: Claw
source_skill_path: ~/clawd/skills/linear-uplink/SKILL.md
updated: 2026-03-25
up: Agent Skills Hub
---
## 🔗 Navigation

**UP:** [[08 - System/Agent Skills/Agent Skills Hub.md|Agent Skills Hub]]

# linear-uplink

> Bidirectional sync tool to push vault-side updates back to Linear with proper labels, assignments, and project mapping.

# 📤 Linear Uplink

> Updated 2026-03-17 v2.1: Applies the project-atomizer plan to Linear with **master spec protection** and **idempotency**. The master spec issue (from `roadmap.master_spec`) is never renamed or mutated. Phase issues are created as top-level (parentId: null); existing phase issues are detected by title (exact + 50-char prefix) and reused on re-run. Sub-issues are similarly deduplicated. Repeated runs converge to the same structure without duplicates.
>
> **Overview-spec invariant enforcement:** When `master_spec.nest_phases_under_spec` is true, any task issue currently parented to the overview spec is reparented to its correct phase issue (`reparent_from_overview` op). Any task that cannot be matched to a phase is detached to top-level (`detach_task_from_overview` op). After sync, the overview spec must own only phase issues (or nothing) — never raw work tasks.
>
> **JSON summary** now includes `reparented[]` array alongside `created[]` and `renamed[]`.

Bidirectional synchronization from Obsidian vault to Linear. Creates issues, updates states, and maintains parity.

## 🎯 Purpose
Pushes vault-side updates back to Linear while maintaining:
- Proper issue assignment to Jamal
- Project and cycle association
- Consistent labeling (Creator Experience, etc.)
- State synchronization
- Issue creation from vault

## 🛠️ Operation Mode

### Operation Types

#### 1. Create Issue from Vault
**Trigger:** New task added in vault Phase file

**GraphQL Mutation:**
```graphql
mutation CreateIssue($input: IssueCreateInput!) {
  issueCreate(input: $input) {
    success
    issue {
      id
      identifier
      title
      url
      state {
        id
        name
      }
      assignee {
        id
        name
      }
      project {
        id
        name
      }
      labels {
        nodes {
          id
          name
        }
      }
    }
  }
}
```

**Input Structure:**
```json
{
  "input": {
    "title": "Task title from vault",
    "description": "Task description with vault backlinks",
    "projectId": "linear-project-id",
    "teamId": "linear-team-id",
    "stateId": "backlog-state-id",
    "priority": "Urgent",
    "assigneeId": "<your-linear-user-id>",
    "labelIds": ["creator-experience-label-id", "fanvue-label-id"],
    "parentId": "parent-issue-id"  // Optional
  }
}
```

#### 2. Update Issue State
**Trigger:** Task checkbox toggled in vault

**GraphQL Mutation:**
```graphql
mutation UpdateIssueState($issueId: ID!, $stateId: ID!) {
  issueUpdate(id: $issueId, input: { stateId: $stateId }) {
    success
    issue {
      id
      identifier
      state {
        id
        name
      }
    }
  }
}
```

**State Mapping:**
```json
{
  "unchecked": {
    "linear_state": "Backlog",
    "linear_state_id": "backlog-id"
  },
  "in-progress": {
    "linear_state": "In Progress",
    "linear_state_id": "in-progress-id"
  },
  "done": {
    "linear_state": "Done",
    "linear_state_id": "done-id"
  }
}
```

#### 3. Add Comment to Issue
**Trigger:** Agent writes to Knowledge Node

**GraphQL Mutation:**
```graphql
mutation AddComment($issueId: ID!, $body: String!) {
  commentCreate(input: { issueId: $issueId, body: $body }) {
    success
    comment {
      id
      body
      user {
        name
      }
    }
  }
}
```

### Configuration

#### Required Environment Variables
```
LINEAR_API_KEY=lin_api_xxx
LINEAR_TEAM_ID=team-id
LINEAR_PROJECT_ID=project-id  # Fallback if not in issue metadata
LINEAR_CYCLE_ID=cycle-id      # Optional: for sprint association

# User Assignment
LINEAR_USER_ID=user-id         # Jamal's Linear user ID
LINEAR_USER_EMAIL=<your-email>

# Labels
LINEAR_LABEL_PREFIX=Creator Experience
LINEAR_LABEL_IDS=creator-experience-id,fanvue-id,eng-id
```

#### Label Mapping
Automatically apply labels based on domain and vault structure:

```json
{
  "FANVUE": ["Creator Experience", "<workplace>", "ENG"],
  "PERSONAL": ["Personal", "Side Project"],
  "PAID": ["Client", "Billable"],
  "OPENCLAW": ["OpenClaw", "Internal"]
}
```

### Issue Creation Workflow

#### Step 1: Extract Task from Vault
Parse vault Phase file for new tasks:
- Check for `- [ ]` checkboxes without `linear_id` metadata
- Extract title, description, and phase context

#### Step 2: Enrich with Context
Add vault metadata to Linear issue:

```markdown
# Task Title

## Description
[Task description from vault]

## Vault Context
- **Project:** [Project Name]
- **Phase:** [Phase Name]
- **Created by:** Claw Agent
- **Vault File:** [[02 - Execution/[Project] - Phase [N].md]]

## Linear Integration
- **Project:** [Linear Project Name]
- **Assignee:** Jamal
- **Labels:** Creator Experience, [Domain]

## Acceptance Criteria
- [ ] [Criteria 1]
- [ ] [Criteria 2]
```

#### Step 3: Fetch Required IDs
Query Linear for:
- Team ID (if not configured)
- Project ID
- State IDs (Backlog, Todo, In Progress, Done)
- Label IDs (Creator Experience, <workplace>, etc.)
- User ID (Jamal)

```graphql
query GetIDs($teamKey: String!, $projectName: String!) {
  team(key: $teamKey) {
    id
    name
    projects(filter: { name: { eqIgnoreCase: $projectName } }) {
      nodes {
        id
        name
        states {
          nodes {
            id
            name
            type
          }
        }
        labels {
          nodes {
            id
            name
            color
          }
        }
      }
    }
  }
  viewer {
    id
    name
    email
  }
}
```

#### Step 4: Create Issue with Proper Assignments
Use fetched IDs to create issue:
- Assign to Jamal (`LINEAR_USER_ID`)
- Add to correct project
- Apply standard labels
- Set initial state to "Backlog" or "Todo"

#### Step 5: Update Vault with Linear Data
Add `linear_id` and `linear_url` to vault file:

```markdown
### [ENG-1234]: Task Title

**State:** In Progress | **Priority:** High
**Linear:** https://linear.app/fanvue/ENG-1234
**Linear ID:** ENG-1234

**Description:**
[...]
```

## 🔧 Automation Rules

### Task Checkbox Sync
Monitor vault Phase files for checkbox state changes:

**Pattern to Detect:**
```
- [ ] Task Title  →  Create new issue in Linear
- [x] Task Title  →  Update issue state to "Done"
- [ ] Task Title  →  (was Done) → Update to "In Progress" or "Todo"
```

### Knowledge Node Commenting
When agents write to Knowledge Node, add comment to relevant Linear issues:

```graphql
mutation AddPhaseComment($issueIds: [ID!]!, $commentBody: String!) {
  # Add comment to multiple issues
}
```

### Subtask Handling
Convert vault sub-bullets to Linear subtasks:

```graphql
mutation CreateSubtask($parentId: ID!, $title: String!) {
  issueCreate(input: { parentId: $parentId, title: $title }) {
    success
    issue {
      id
      identifier
      parent {
        id
        identifier
      }
    }
  }
}
```

## 📊 Success Criteria

✅ **Issues created** in Linear with proper project/assignment
✅ **Jamal assigned** to all vault-created issues
✅ **Standard labels** applied (Creator Experience, etc.)
✅ **State synchronized** between vault and Linear
✅ **Linear IDs** added back to vault files
✅ **Comments posted** when Knowledge Node updated
✅ **Subtasks created** for vault sub-bullets
✅ **Error logs** for failed syncs

## 🛡️ Error Handling

### Assignment Failures
- If Jamal ID not found, use project default
- Log warning and proceed with issue creation
- Add comment to issue requesting manual assignment

### Label Failures
- If label not found, skip that label
- Log which labels failed
- Create label automatically if permissions allow

### Rate Limiting
- Respect Linear rate limits (100 req/min)
- Batch mutations when possible
- Implement exponential backoff

### State Mapping Failures
- If state ID not found, default to "Backlog"
- Log state mapping error
- Add comment to issue with state sync failure

## 🔄 Conflict Resolution

### Vault vs Linear State Conflict
When vault and Linear disagree:

```
If Linear.state = "Done" and vault.checkbox = "unchecked":
  → Update vault checkbox to checked
  → Add comment: "Issue marked complete in Linear"

If vault.checkbox = "checked" and Linear.state != "Done":
  → Update Linear state to "Done"
  → Log manual override
```

### Concurrent Modifications
Use optimistic updates with retry logic:
- Send current state with mutation
- If conflict, refetch latest state
- Re-apply vault changes
- Retry up to 3 times

## 🔗 Integration Notes

### Calls
1. **Monitor Vault:** Watch Phase files for changes
2. **Extract Changes:** Parse new/updated tasks
3. **Fetch Linear IDs:** Query team, project, state, label IDs
4. **Create/Update Issues:** Apply mutations with proper assignments
5. **Update Vault:** Add linear_id and linear_url to vault
6. **Log Parity:** Record sync status for verification

### Handoff from `vault-graph-builder`
- Receive file paths for created nodes
- Extract linear_id mappings from frontmatter
- Use for bidirectional parity verification

### Example Workflow

```bash
# 1. Agent adds task to vault
echo "- [ ] New Feature: Dark Mode" >> vault-file.md

# 2. Linear uplink detects new task
linear-uplink sync vault-file.md

# 3. Issue created in Linear
# - Title: New Feature: Dark Mode
# - Assigned: Jamal
# - Project: <workplace>
# - Labels: Creator Experience, <workplace>
# - State: Backlog
# - Identifier: ENG-9999

# 4. Vault updated with link
# - [ ] New Feature: Dark Mode [ENG-9999]
#   Linear: https://linear.app/fanvue/ENG-9999
```
