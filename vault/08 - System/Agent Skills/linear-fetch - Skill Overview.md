---
tags: [system, status-active, skill-doc]
graph_domain: system
status: active
skill_name: linear-fetch
version: 2.0.0
author: Claw
source_skill_path: ~/clawd/skills/linear-fetch/SKILL.md
updated: 2026-03-25
up: Agent Skills Hub
---
## 🔗 Navigation

**UP:** [[08 - System/Agent Skills/Agent Skills Hub.md|Agent Skills Hub]]

# linear-fetch

> Recursively fetches Linear projects and issue data via GraphQL with deep context retrieval.

# 📥 Linear Fetch

Deep data retrieval from Linear GraphQL API for comprehensive project synchronization.

> Updated 2026-03-17 v2.1: Children nodes now include `identifier`, `description`, and structured `state` object (previously only `id, title, state, priority, url`). This enables project-atomizer to correctly classify child tasks by content when building overview-spec roadmaps.

## 🎯 Purpose
Fetches the user's relevant Linear projects and dynamically filters to identify active work.

A project should be included if **either**:
- the user is the **project lead/owner** on the project, or
- the user has **issues assigned** inside the project.

Filtering:
- **INCLUDE:** Started (monitoring), Planned (ready), Backlog (queued)
- **EXCLUDE:** Completed, Canceled projects
- Dynamically targets projects that need sync (not hardcoded list)

## 🛠️ Operation Mode

### Input
- **Option A (Specific Project):** Fetch specific project by ID or name with the user's assigned issues
- **Option B (Relevant Projects):** Fetch the union of:
  - projects where the user is the **project lead/owner**
  - projects that contain **issues assigned to the user**
- **User ID:** Automatically retrieved from `viewer` query

### CRITICAL: Use viewer.assignedIssues (NOT team.issues)
**ALWAYS use `viewer.assignedIssues` to ONLY fetch the user's assigned issues:**

```graphql
viewer {
  assignedIssues(first: 100) {
    nodes {
      # Issue details including project
      project {
        # Project details
      }
    }
  }
}
```

**Filtering Rules:**
- ✅ `viewer.assignedIssues` = ONLY the user's assigned issues
- ❌ DO NOT use `team.issues` = Shows ALL team issues (wrong!)
- ❌ DO NOT filter by project ID first (issues may span projects)
- ✅ Filter by project AFTER fetching assigned issues
- ✅ Skip issues with `project: null` (unassigned to project)


### GraphQL Query Structure

#### Option A: Specific Project with the user's Issues
```graphql
query GetYourProject(\$projectId: ID!, \$userId: String!) {
  project(id: \$projectId) {
    id
    name
    description
    state { id name }
    url
    teams(first: 5) { nodes { id name } }
    cycles(first: 10) { nodes { id name } }
    labels(first: 20) { nodes { id name color } }

    # ONLY fetch the user's assigned issues
    issues(filter: { assignee: { id: { eq: \$userId } } }) {
      nodes {
        id
        identifier
        title
        description
        state { id name type }
        priority
        assignee { id name }
        labels { nodes { id name } }
        cycle { id name }
        url
        createdAt
        updatedAt

        # Subtasks
        children {
          nodes {
            id
            title
            state { id name }
            priority
            url
          }
        }

        # Parent (if this is a subtask)
        parent {
          id
          title
          url
        }
      }
    }
  }
}
```

#### Option B: All of the user's Assigned Issues (DYNAMIC FILTERING)
```graphql
query Getthe userAssignedIssues($excludeStates: [String!]!) {
  viewer {
    id
    name
    email
    assignedIssues(first: 100) {
      nodes {
        id
        identifier
        title
        description
        state { id name type }
        priority
        assignee { id name }
        labels { nodes { id name } }
        cycle { id name }
        url
        createdAt
        updatedAt

        project {
          id
          name
          description
          state { id name }
          url
          labels(first: 20) { nodes { id name color } }
          cycles(first: 10) { nodes { id name } }
        }

        # Subtasks
        children {
          nodes {
            id
            title
            state { id name }
            priority
            url
          }
        }

        # Parent (if this is a subtask)
        parent {
          id
          title
          url
        }
      }
    }
  }
}
```

**State Filtering Logic:**
```graphql
# Variable for filtering
$excludeStates: ["Completed", "Canceled"]
```

**Dynamic Targeting Rules:**
- ✅ **INCLUDE:** Started, Planned, Backlog (ready for sync)
- ❌ **EXCLUDE:** Completed, Canceled (no sync needed)
- 🔍 **DYNAMIC:** Auto-detect which projects need sync (not hardcoded)

**Result:** Returns ONLY active/ready projects that the user is working on.

**CRITICAL:** Always use `viewer.assignedIssues` for Option B. For Option A, use `project.issues` with `assignee` filter. DO NOT use team-wide queries.

### Dynamic Project Filtering Rules

**Include in Sync (Active/Ready):**
- ✅ **Started** - Currently monitoring, needs vault sync
- ✅ **Planned** - Ready to start, needs vault sync
- ✅ **Backlog** - Queued, needs vault sync

**Exclude from Sync (Done):**
- ❌ **Completed** - Finished, no sync needed
- ❌ **Canceled** - Abandoned, no sync needed

**Dynamic Detection:**
- Automatically filter projects by state
- Auto-generate `sync_needed: true/false` for each project
- Count `projects_needing_sync` (active/ready projects)
- Count `excluded_projects` (completed/canceled)

**Example Result:**
```json
{
  "projects_needing_sync": 3,
  "excluded_projects": 10,
  "excluded_reasons": ["Completed", "Canceled"]
}
```

**NO HARDCODING:**
- ❌ Do NOT hardcode specific project names
- ❌ Do NOT hardcode project IDs
- ✅ Use dynamic state filtering
- ✅ Auto-detect which projects need sync

### Output Format (Dynamic Project Detection)
JSON stored in temporary location for consumption by `project-atomizer`:

```json
{
  "viewer": {
    "id": "67440994-08f8-40cc-aa1d-6bce08b6e48a",
    "name": "<the-user>",
    "email": "<your-email>"
  },
  "projects": [
    {
      "id": "linear-project-id",
      "name": "Project Name",
      "description": "Full project description",
      "state": "Started",
      "url": "https://linear.app/...",
      "issue_count": 5,
      "sync_needed": true,
      "issues": [
        {
          "id": "issue-id",
          "identifier": "ENG-1234",
          "title": "Issue title",
          "description": "Full description",
          "state": "In Progress",
          "priority": "High",
          "labels": ["Creator Experience"],
          "url": "https://linear.app/..."
        }
      ]
    }
  ],
  "metadata": {
    "fetched_at": "2026-03-16T21:00:00Z",
    "total_issues": 20,
    "total_projects": 4,
    "projects_needing_sync": 3,
    "excluded_projects": 1,
    "excluded_reasons": ["Completed", "Canceled"]
  }
}
```

**Key Fields for Dynamic Filtering:**
- `sync_needed`: Boolean - Whether project should be synced (Started/Planned/Backlog = true, Completed/Canceled = false)
- `projects_needing_sync`: Count of active projects
- `excluded_projects`: Count of completed/canceled projects
- `excluded_reasons`: List of states that caused exclusion

### Filtering Verification

Before fetching any project, verify:

```bash
# Check LINEAR_USER_ID is set
if [ -z "$LINEAR_USER_ID" ]; then
  echo "ERROR: LINEAR_USER_ID not configured"
  exit 1
fi

# Verify the user's user ID
echo "Fetching for: LINEAR_USER_ID=$LINEAR_USER_ID"
echo "<the-user> (67440994-08f8-40cc-aa1d-6bce08b6e48a)"
```

**Pre-Fetch Checklist:**
- ✅ `LINEAR_USER_ID` is configured in `.env`
- ✅ User ID matches: `67440994-08f8-40cc-aa1d-6bce08b6e48a`
- ✅ GraphQL filter includes: `assignee: { id: { eq: $userId } }`
- ✅ Project has at least 1 issue assigned to the user
- ❌ Reject projects with 0 assigned issues to the user

**Project Eligibility Test:**
```graphql
query CheckEligibility($projectId: ID!, $userId: String!) {
  project(id: $projectId) {
    id
    name
    issues(filter: { assignee: { id: { eq: $userId } } }) {
      nodes {
        id
        assignee { id }
      }
    }
  }
}
```

If result has 0 issues, skip project (the user not assigned).

## 🔧 Configuration

### Required Environment Variables
```
LINEAR_API_KEY=lin_api_xxx
LINEAR_TEAM_ID=xxx  # Optional: for filtering by team
LINEAR_CYCLE_ID=xxx # Optional: for filtering by cycle
LINEAR_LABEL_PREFIX=Creator Experience # For consistent labeling
```

### User Assignment
- Automatically filter issues assigned to the current user
- Get user ID from `viewer` query:
```graphql
query {
  viewer {
    id
    name
    email
  }
}
```

## 🛡️ Error Handling

### Rate Limiting
- Respect Linear's rate limits (100 requests/minute)
- Implement exponential backoff
- Log rate limit warnings

### GraphQL Complexity
- Break down large queries into smaller batches
- Use pagination for projects with 100+ issues
- Cache project metadata

### Network Failures
- Retry failed requests up to 3 times
- Log all failures for debugging
- Use cached data if fetch fails (with warning)

## 📊 Success Criteria

✅ **Project fetched** with all metadata
✅ **All issues retrieved** with descriptions and state
✅ **Issue relationships mapped** (parent/child)
✅ **Labels extracted** for domain classification
✅ **Assignee information captured** (specifically the user's ID)
✅ **Output saved** in structured JSON format
✅ **Error logs** generated for any failures

## 🔗 Integration Notes

### Calls
1. **Fetch User ID:** Get current authenticated user's Linear ID
2. **Fetch Project:** Get all project data via recursive GraphQL
3. **Save Output:** Store JSON for `project-atomizer`

### Handoff to `project-atomizer`
- Pass the JSON file path
- Include project domain classification
- Include label mapping for atomization strategy
