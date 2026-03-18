# RCA Verification Skill

Methods for validating root cause analyses using structured checklists and templates.

## 📁 Progressive Disclosure Structure

This skill follows the **Agent Skills standard** with organized resources:

```
rca-verification/
├── SKILL.md              # Main entry point (what Copilot reads)
└── references/           # Supporting materials (loaded on-demand)
    ├── verification-checklist.md    # Quick reference checklist
    └── verified-rca-template.md     # Output template
```

## 🎯 When This Skill Activates

Copilot loads this skill when you:
- Mention "verify RCA" or "validate root cause analysis"
- Ask to review an RCA report
- Request to check 5 Whys depth
- Say "is this root cause accurate?"

**Trigger keywords**: verify, validate, review, check, RCA, root cause analysis

## 📚 How to Use Resources

### 1. Quick Verification
```
Use the verification checklist from rca-verification skill
```
→ Copilot loads `references/verification-checklist.md`

### 2. Complete Verification
```
Verify rca-report.md using rca-verification skill and create verified-rca.md
```
→ Copilot loads checklist + template

### 3. Specific Check
```
Check if the 5 Whys depth is adequate in rca-report.md
```
→ Copilot loads "5 Whys Depth Validation" section

## 🔄 Workflow Integration

This skill is used in phase 5 of the bug-fixing workflow:

```
1. Bug Context (jira-bug-fetcher)
2. Research (codebase-research)
3. Research Verification
4. RCA (root-cause-analysis) ← Produces rca-report.md
5. RCA Verification ★ THIS SKILL ★ → Produces verified-rca.md
6. Planning
7. Implementation
```

## ✅ Verification Categories

This skill validates:

1. **5 Whys Depth** - Is root cause fundamental?
2. **Execution Path** - Are file:line refs accurate?
3. **Fix Strategy** - Does fix target root cause?
4. **Side Effects** - Are impacts considered?

## 📄 Templates Available

### verification-checklist.md
Quick checklist for manual or AI-assisted verification.

**Use when**: You want step-by-step guidance

### verified-rca-template.md
Complete template for creating `verified-rca.md` output.

**Use when**: Formalizing verification results

## 🎓 Related Skills

- **root-cause-analysis** - Creates the RCA being verified
- **bug-coordinator** - Orchestrates the workflow
- **codebase-research** - Provides research used in RCA

## 💡 Tips

1. **Always verify before planning** - Don't implement based on unverified RCA
2. **Use the checklist** - Don't skip verification steps
3. **Document issues** - Help improve future RCAs
4. **Check file references** - Invalid refs = unverified claims

## 🔧 Customization

To adapt this skill for your project:

1. Edit `SKILL.md` - Update description for your context
2. Add references - Create project-specific checklists
3. Modify templates - Match your documentation style

## 📖 Learn More

- [Agent Skills Standard](https://github.com/ModelContextProtocol/agent-skills)
- [Progressive Disclosure Pattern](../.github/skills/README.md)
- [Bug Fixing Workflow](../bug-coordinator/SKILL.md)

---

**Version**: 1.0  
**License**: MIT  
**Compatibility**: VS Code Insiders with GitHub Copilot
