---
name: bug-coordinator
description: Orchestrates the complete bug-fixing workflow from Jira ticket to implementation. Coordinates multi-agent pipeline (fetch, research, RCA, planning, implementation). Use when starting to fix a bug, user mentions ticket key, managing bug pipeline, checking workflow progress, resuming incomplete bug fix, or coordinating specialized agents.
license: MIT
compatibility: Requires VS Code Insiders with GitHub Copilot and Atlassian MCP
metadata:
  author: Green-POS
  version: "1.0"
  related-skills: jira-bug-fetcher, codebase-research, root-cause-analysis
---

# Bug Coordinator

This skill provides workflow orchestration for the multi-agent bug-fixing pipeline.

## When to Use

- User wants to start fixing a bug
- User provides a Jira ticket key
- User asks about bug-fixing workflow progress
- User wants to resume an in-progress bug fix

## Workflow Overview

```
+----------+     +----------+     +---------+     +---------+     +------------------+
|  FETCH   | --> | RESEARCH | --> | VERIFY  | --> |   RCA   | --> | PLAN & IMPLEMENT |
| (Jira)   |     |(Codebase)|     |(Research)|    |(Analysis)|    |   (Fix Bug)      |
+----------+     +----------+     +---------+     +---------+     +------------------+
     |                |                |               |                  |
     v                v                v               v                  v
bug-context.md   research/      verified-       rca-report.md      impl-plan.md
                 *.md           research.md                        + code changes
```

## Specialized Agents

The coordinator delegates to these specialized agents:

| Agent | Phase | Purpose |
|-------|-------|---------|
| Bug Researcher | 2 | Research codebase context |
| Research Verifier | 3 | Verify research accuracy |
| RCA Analyst | 4 | Root cause analysis |
| RCA Verifier | 5 | Verify RCA accuracy |
| Bug Planner | 6 | Create implementation plan |
| Bug Implementer | 7 | Execute the fix |

## Artifact Directory Structure

```
.context/active/bugs/{TICKET-ID}/
â”œâ”€â”€ bug-context.md
â”œâ”€â”€ research/
â”‚   â”œâ”€â”€ hypothesis.md
â”‚   â”œâ”€â”€ codebase-research.md
â”‚   â””â”€â”€ verified-research.md
â”œâ”€â”€ rca-report.md
â”œâ”€â”€ verified-rca.md
â”œâ”€â”€ implementation-plan.md
â””â”€â”€ fix-summary.md
```

## Entry Points

### Start New Bug Fix
```
@Bug Coordinator EMS-1234
```

### Resume Existing Workflow
```
@Bug Coordinator .context/active/bugs/EMS-1234/bug-context.md
```

### Using Prompt Shortcut
```
/start-bug-workflow EMS-1234
```

## Prerequisites

1. **VS Code Setting Enabled:**
   ```json
   "chat.customAgentInSubagent.enabled": true
   ```

2. **Atlassian MCP Connected** (for Jira integration)

3. **All Bug-Fixing Agents Installed:**
   - Bug Researcher
   - Research Verifier
   - RCA Analyst
   - RCA Verifier
   - Bug Planner
   - Bug Implementer

## Phase 8: Artifact Archival (Automatic Handoff)

After Phase 7 completes successfully (fix deployed and validated), automatically trigger archival:

**Handoff to Context Lifecycle Manager:**
```
@context-lifecycle-manager archive {TICKET-ID}
```

**What gets archived:**
- Complete `.context/active/bugs/{TICKET-ID}/` directory
- All research artifacts (hypothesis, codebase-research, verified-research)
- RCA reports (rca-report.md, verified-rca.md)
- Implementation artifacts (implementation-plan.md, fix-summary.md)

**Result:**
- ✅ Clean workspace for next bug
- ✅ Full history preserved in `.context/archive/bugs/implemented/`
- ✅ Context freed for new work

**Manual override:** If automatic handoff doesn't trigger:
```
User: "Archive the completed bug {TICKET-ID}"
Agent: Executes lifecycle archival for {TICKET-ID}
```

## Human Checkpoints

The workflow requires human approval at critical phases:

1. **Before Planning (Phase 6)**: User reviews verified RCA
2. **Before Implementation (Phase 7)**: User approves implementation plan

These checkpoints ensure the analysis is correct before investing in fix development.

## Error Handling

See the Bug Coordinator agent for detailed error handling patterns for:
- Jira ticket not found
- Missing prerequisite artifacts
- Agent handoff failures

