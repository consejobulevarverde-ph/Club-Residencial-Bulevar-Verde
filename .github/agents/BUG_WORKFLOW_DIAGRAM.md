# Bug Workflow Diagram

## Visual Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                     BUG COORDINATOR                              │
│                   (Orchestrator Agent)                            │
└──────┬──────────┬──────────┬──────────┬──────────┬──────────────┘
       │          │          │          │          │
       ▼          ▼          ▼          ▼          ▼
  ┌─────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
  │ Phase 1 │ │Phase 2 │ │Phase 3 │ │Phase 4 │ │Phase 5 │
  │ CONTEXT │→│RESEARCH│→│ VERIFY │→│  RCA   │→│ VERIFY │
  └─────────┘ └────────┘ └────────┘ └────────┘ └────────┘
       │          │          │          │          │
       ▼          ▼          ▼          ▼          ▼
  bug-context  research/  verified-  rca-      verified-
  .md          codebase-  research   report    rca.md
               research   .md        .md
               .md
                                                  │
                                                                                                    ▼
                                                                 🛑 HUMAN CHECKPOINT LOOP
                                                             (askQuestions + refinement)
                                                  │
                    ┌─────────────────────────────┼────────────────┐
                    ▼                                              ▼
              ┌──────────┐                                  ┌──────────┐
              │ Phase 6  │                                  │ Phase 7  │
              │   PLAN   │──────────────────────────────────│IMPLEMENT │
              └──────────┘                                  └──────────┘
                    │                                              │
                    ▼                                              ▼
              implementation-                                fix-summary
              plan.md                                        .md
```

## Phase Details

### Phase 1: Bug Context Acquisition

**Three Input Modes:**

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Jira Ticket     │     │  Bug Description  │     │  Existing File   │
│  (PROJ-1234)     │     │  (Free text)      │     │  (bug-context.md)│
└────────┬────────┘     └────────┬─────────┘     └────────┬─────────┘
         │                       │                         │
         ▼                       ▼                         ▼
   Jira Bug Fetcher      Coordinator creates       Coordinator reads
   (subagent)            bug-context.md            existing context
         │                       │                         │
         └───────────┬───────────┘─────────────────────────┘
                     ▼
              bug-context.md
```

### Phase 2: Codebase Research (Automatic)

```
Bug Researcher (subagent)
    │
    ├── Read bug-context.md
    ├── Generate hypothesis.md
    ├── Spawn research subagent
    │     ├── Locate relevant code
    │     ├── Analyze code flow
    │     └── Find related patterns
    └── Synthesize → codebase-research.md
```

### Phase 3: Research Verification (Automatic, with retry loop)

```
Research Verifier (subagent)
    │
    ├── Verify file:line references
    ├── Check code snippets match source
    ├── Validate relationships
    │
    ├── PASSED → verified-research.md → Phase 4
    ├── RETRY (max 2) → Bug Researcher fixes → re-verify
    └── CLARIFY → User decision (retry/skip/abort)
```

### Phase 4: Root Cause Analysis (Automatic)

```
RCA Analyst (subagent)
    │
    ├── Symptom analysis
    ├── Fault localization
    ├── 5 Whys methodology
    ├── Fix strategy proposals
    └── Generate → rca-report.md
```

### Phase 5: RCA Verification (Automatic, with retry loop)

```
RCA Verifier (subagent)
    │
    ├── Validate 5 Whys depth
    ├── Verify execution path
    ├── Assess fix strategies
    │
    ├── PASSED → verified-rca.md → 🛑 HUMAN CHECKPOINT LOOP
    ├── RETRY (max 2) → RCA Analyst fixes → re-verify
    └── CLARIFY → User decision (retry/skip/abort)
```

### Human Checkpoint Loop

```
Coordinator / Planner / Implementer
    │
    ├── Present artifact summary
    ├── Ask via vscode/askQuestions
    │     ├── Completed → continue
    │     ├── Request changes → refine artifact → ask again
    │     ├── Ask a question → answer → ask again
    │     └── Abort → stop workflow
    └── Loop until user explicitly selects Completed
```

### Phase 6: Implementation Planning (Manual + askQuestions)

```
Bug Planner (handoff from coordinator)
    │
    ├── Read ALL 5 context files
    ├── Interactive or Direct mode
    ├── Present strategy summary
    ├── Run askQuestions review loop
    ├── Generate phased plan
    ├── Run askQuestions approval loop
    └── User selects Completed → implementation-plan.md approved
```

### Phase 7: Implementation (Manual + askQuestions)

```
Bug Implementer (handoff from coordinator)
    │
    ├── Parse approved plan
    ├── For each phase:
    │     ├── Verify preconditions
    │     ├── Make changes
    │     ├── Run automated verification
    │     └── Run askQuestions verification loop
    └── Generate → fix-summary.md
```

## Artifact Directory Structure

```
context/bugs/{BUG-ID}/
├── bug-context.md                  # Phase 1 output
├── rca-report.md                   # Phase 4 output
├── verified-rca.md                 # Phase 5 output
├── implementation-plan.md          # Phase 6 output
├── fix-summary.md                  # Phase 7 output
└── research/
    ├── hypothesis.md               # Phase 2 output
    ├── codebase-research.md        # Phase 2 output
    └── verified-research.md        # Phase 3 output
```
