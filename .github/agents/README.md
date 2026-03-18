# Copilot Agents — Generic Multi-Agent System

A **reusable, project-agnostic** multi-agent system for VS Code Copilot Agent Mode. These agents can be dropped into any project and will discover conventions automatically by reading `.github/copilot-instructions.md` and scanning the codebase.

## Key Design Principles

- **No project-specific references** — all agents discover context at runtime
- **Jira is optional** — Bug Coordinator accepts Jira tickets, manual descriptions, or existing context files
- **Convention discovery** — agents read `.github/copilot-instructions.md` for project-specific patterns
- **Request optimization** — coordinators use subagents to minimize Copilot request usage
- **Automatic flow** — Bug workflow phases 1-5 execute without user prompts
- **Human review loop** — checkpoints use `askQuestions` and iterate until the user selects `Completed`

---

## Agent Catalog

### 🎯 Meta Coordinator (Start Here)

| Agent | Model | Purpose |
|-------|-------|---------|
| `@Meta Coordinator` | Sonnet 4.5 | Intelligent routing — describe your task and it picks the right agent |

**Usage**: Just describe what you need naturally. The Meta Coordinator analyzes your request and routes to the best agent.

```
@Meta Coordinator fix the login error when password is empty
@Meta Coordinator plan a new notification system
@Meta Coordinator how does the payment module work?
```

---

### 🐛 Bug Workflow (7 agents)

Structured pipeline: **Context → Research → Verify → RCA → Verify → Plan → Implement**

Human checkpoints are iterative review loops. The user can request refinements or ask questions about artifacts before approving them.

| Agent | Model | Purpose |
|-------|-------|---------|
| `@Bug Coordinator` | Opus 4.6 | Orchestrates full bug workflow (Jira optional) |
| `@Bug Researcher` | Opus 4.6 | Investigates codebase, documents findings |
| `@Research Verifier` | Sonnet 4.6 | Validates research accuracy, detects hallucinations |
| `@RCA Analyst` | Opus 4.6 | Root cause analysis with 5 Whys methodology |
| `@RCA Verifier` | Sonnet 4.6 | Validates RCA depth and fix strategy soundness |
| `@Bug Planner` | Opus 4.6 | Creates phased implementation plans for fixes |
| `@Bug Implementer` | Sonnet 4.6 | Executes approved fix plans with verification |

**Three ways to start the bug workflow:**

```
@Bug Coordinator PROJ-1234              # From Jira ticket
@Bug Coordinator Login throws 500 when... # From description (no Jira needed)
@Bug Coordinator context/bugs/BUG-ID/bug-context.md  # Resume existing
```

**Artifacts generated** in `context/bugs/{BUG-ID}/`:
```
context/bugs/{BUG-ID}/
├── bug-context.md
├── rca-report.md
├── verified-rca.md
├── implementation-plan.md
├── fix-summary.md
└── research/
    ├── hypothesis.md
    ├── codebase-research.md
    └── verified-research.md
```

---

### 📋 Planning & Implementation (2 agents)

| Agent | Model | Purpose |
|-------|-------|---------|
| `@Create Plan` | Opus 4.6 | Interactive plan creation with codebase research |
| `@Implement Plan` | Sonnet 4.6 | Executes approved plans phase by phase |

```
@Create Plan Add user notification preferences
@Create Plan context/tickets/TICKET-123.md
@Implement Plan context/plans/notifications-plan.md
```

---

### 🔍 Research (1 agent)

| Agent | Model | Purpose |
|-------|-------|---------|
| `@Research Codebase` | Opus 4.6 | Comprehensive codebase documentation and analysis |

```
@Research Codebase How does the authentication system work?
@Research Codebase Analyze the data flow in the payment module
```

---

## Directory Structure

```
.github/agents/
├── meta-coordinator.agent.md     # Intelligent routing (START HERE)
├── bug-coordinator.agent.md      # Bug workflow orchestrator
├── bug-researcher.agent.md       # Codebase research for bugs
├── research-verifier.agent.md    # Research validation
├── rca-analyst.agent.md          # Root cause analysis
├── rca-verifier.agent.md         # RCA validation
├── bug-planner.agent.md          # Bug fix planning
├── bug-implementer.agent.md      # Bug fix implementation
├── create-plan.agent.md          # Generic plan creation
├── implement-plan.agent.md       # Plan implementation
├── research-codebase.agent.md    # Codebase research & documentation
└── README.md                     # This file
```

---

## Prerequisites

- **VS Code Insiders** with GitHub Copilot
- **Copilot Agent Mode** enabled
- Setting enabled: `"chat.customAgentInSubagent.enabled": true`
- (Optional) Atlassian MCP for Jira integration

## Making It Project-Specific

These agents auto-discover conventions. To customize for your project:

1. **Create `.github/copilot-instructions.md`** with your project's:
   - Technology stack
   - Coding conventions
   - Directory structure
   - Module/component organization
   - Testing patterns

2. The agents will read this file automatically and follow your conventions.

## Reusing in Another Project

Simply copy the `.github/agents/` directory into your new project. No modifications needed — agents adapt to whatever project they find.
