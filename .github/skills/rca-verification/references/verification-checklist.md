# RCA Verification Checklist

Quick reference checklist for validating root cause analyses.

## Pre-Verification Checklist

- [ ] RCA report exists (`rca-report.md`)
- [ ] Research has been verified (`verified-research.md`)
- [ ] Bug context is complete (`bug-context.md`)

## 5 Whys Depth Validation

### Depth Check
- [ ] At least 3 Whys for simple bugs
- [ ] At least 5 Whys for complex bugs
- [ ] Each Why digs deeper than previous
- [ ] Root cause is fundamental (can't be explained by more code)
- [ ] Root cause is specific, not vague

### Red Flags (Stop and Revise)
- [ ] "The variable is null" (symptom, not root cause)
- [ ] "The function returns undefined" (symptom)
- [ ] "The API call fails" (symptom)
- [ ] "No one added them" (too vague)
- [ ] "The condition is wrong" (doesn't explain why)

### Green Signals (Good Root Causes)
- [ ] Points to design decision
- [ ] Identifies missing requirement
- [ ] Reveals system constraint
- [ ] Explains architectural choice
- [ ] Cannot be answered with more "Why?"

## Execution Path Verification

### File References
- [ ] All file paths exist (use file search)
- [ ] Line numbers accurate (±3 lines acceptable)
- [ ] Code content matches description
- [ ] Call chain is valid (use symbol usages)

### Verification Table
Create table for each reference:

| Step | File:Line | Exists | Content Matches | Verdict |
|------|-----------|--------|-----------------|---------|
| Entry | `file.ts:45` | ✅ | ✅ | ✅ PASS |
| Fault | `bug.ts:78` | ❌ | N/A | ❌ FAIL |

## Fix Strategy Assessment

### Strategy Validation
- [ ] Fix targets root cause location
- [ ] All modified files exist
- [ ] Line numbers accurate
- [ ] Risk assessment realistic
- [ ] Alternatives are genuinely different
- [ ] Testing strategy is valid

### Risk Level Check
- [ ] Low risk: Few callers, simple change
- [ ] Medium risk: Multiple callers, behavior change
- [ ] High risk: Many callers, breaking change

## Side Effect Analysis

### Impact Check
- [ ] Find all usages of modified components
- [ ] Assess impact on each caller
- [ ] Flag breaking changes
- [ ] Note edge cases

### Risk Documentation
- [ ] Low risk items noted
- [ ] Medium risk requires test coverage
- [ ] High risk requires approval

## Final Verification

### Status Decision
- [ ] **VERIFIED**: All checks pass, proceed to planning
- [ ] **VERIFIED WITH NOTES**: Substantial accuracy, minor concerns
- [ ] **NEEDS REVISION**: Critical issues found, return to RCA Analyst

### Confidence Rating
- [ ] HIGH: All categories pass
- [ ] MEDIUM: Some minor issues
- [ ] LOW: Multiple categories fail

## Output Requirements

- [ ] `verified-rca.md` created
- [ ] Verification summary table included
- [ ] All issues documented
- [ ] Corrections noted
- [ ] Recommendation clear
- [ ] Confidence rating justified

## Escalation Triggers

- [ ] More than 2 revision attempts
- [ ] Same issues persist across revisions
- [ ] Circular reasoning detected
- [ ] Unable to verify critical claims

## References

- Main skill: [SKILL.md](../SKILL.md)
- Root Cause Analysis: [../../root-cause-analysis/SKILL.md](../../root-cause-analysis/SKILL.md)
- Templates: See `verified-rca-template.md`
