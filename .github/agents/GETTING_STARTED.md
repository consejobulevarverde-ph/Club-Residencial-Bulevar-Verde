# Getting Started with the Multi-Agent System

## Tutorial for New Developers

**Goal**: Learn to use the multi-agent system effectively in 15 minutes.

**Prerequisites**:
- VS Code Insiders with GitHub Copilot
- Agent mode enabled
- Setting: `"chat.customAgentInSubagent.enabled": true`
- (Optional) Atlassian MCP for Jira integration

---

## 1. What are Agents?

**Agents** are specialized AI assistants that automate specific development tasks. Each agent has a focused purpose and a set of tools it can use.

### The Entry Point: Meta Coordinator

You don't need to memorize agent names. Just describe what you need:

```
@Meta Coordinator fix the login error
@Meta Coordinator plan a new notification feature
@Meta Coordinator how does the payment module work?
```

The Meta Coordinator analyzes your request and routes to the right agent.

---

## 2. Available Agents

| Agent | When to Use | Example |
|-------|-------------|---------|
| `@Meta Coordinator` | Don't know which agent to use | "I need to fix a bug in..." |
| `@Bug Coordinator` | Fix a bug (full workflow) | "PROJ-1234" or describe the bug |
| `@Create Plan` | Plan a new feature or change | "Add user notifications" |
| `@Research Codebase` | Understand how code works | "How does auth work?" |
| `@Implement Plan` | Execute an approved plan | "context/plans/my-plan.md" |

---

## 3. Bug Fixing Workflow

The most common workflow. Three ways to start:

### Option A: With Jira Ticket
```
@Bug Coordinator PROJ-1234
```

### Option B: With Description (No Jira Needed)
```
@Bug Coordinator The login form throws 500 error when the password field is empty
```

### Option C: Resume Existing
```
@Bug Coordinator context/bugs/login-500-error/bug-context.md
```

### What Happens Automatically (Phases 1-5)

1. **Context** — Creates bug-context.md from your input
2. **Research** — Investigates the codebase for related code
3. **Verify Research** — Checks all file references are accurate
4. **Root Cause Analysis** — Applies 5 Whys methodology
5. **Verify RCA** — Validates the root cause is fundamental

Then it enters a **human review loop with questions** before:

6. **Plan** — You approve the fix strategy
7. **Implement** — You approve the implementation

At each human checkpoint, the agent should use `askQuestions` so you can:
- mark the artifact as complete
- request changes
- ask clarification questions
- keep iterating until you explicitly complete the checkpoint

---

## 4. Planning Workflow

```
@Create Plan Add email notifications for order status changes
```

The planner will:
1. Discover your project's tech stack and conventions
2. Research the codebase for relevant patterns
3. Ask clarifying questions
4. Generate a phased implementation plan
5. Run an interactive approval loop with `askQuestions`

Then implement with:
```
@Implement Plan context/plans/email-notifications-plan.md
```

---

## 5. Research Workflow

```
@Research Codebase How does the payment processing pipeline work?
```

The researcher will:
1. Spawn subagents for parallel investigation
2. Document all findings with file:line references
3. Generate a structured research document

---

## 6. Making It Project-Specific

These agents auto-discover your project. To customize:

**Create `.github/copilot-instructions.md`** with your:
- Technology stack
- Coding conventions
- Directory structure
- Testing patterns

The agents read this file automatically.

---

## 7. Troubleshooting

| Problem | Solution |
|---------|----------|
| Agent not found | Check `.github/agents/` directory exists |
| Subagents fail | Enable `"chat.customAgentInSubagent.enabled": true` |
| Jira fetch fails | Check Atlassian MCP is connected, or use manual mode |
| Agent ignores conventions | Create `.github/copilot-instructions.md` |
