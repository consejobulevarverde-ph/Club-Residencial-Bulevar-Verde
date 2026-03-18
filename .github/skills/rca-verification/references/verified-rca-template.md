# Verified RCA: {TICKET-ID}

**Date**: {YYYY-MM-DD}
**Verifier**: AI Agent (RCA Verifier)
**Original RCA**: `rca-report.md`
**Status**: [VERIFIED / VERIFIED WITH NOTES / NEEDS REVISION]

---

## Executive Summary

[1-2 sentence summary of verification outcome]

**Overall Confidence**: [HIGH / MEDIUM / LOW]

---

## Verification Summary

| Category | Status | Issues | Confidence |
|----------|--------|--------|------------|
| 5 Whys Depth | [✅/⚠️/❌] | [count] | [High/Medium/Low] |
| Execution Path | [✅/⚠️/❌] | [count] | [High/Medium/Low] |
| Fix Strategy | [✅/⚠️/❌] | [count] | [High/Medium/Low] |
| Side Effects | [✅/⚠️/❌] | [count] | [High/Medium/Low] |

**Legend:**
- ✅ Pass - No issues
- ⚠️ Minor Issues - Proceed with notes
- ❌ Fail - Needs revision

---

## 1. 5 Whys Depth Verification

### Depth Analysis

**Claim**: [Original root cause statement from RCA]

**Verification**:
- **Depth Count**: [number] Whys
- **Progression**: [Does each Why dig deeper?]
- **Fundamentality**: [Is this truly a root cause?]
- **Specificity**: [Is it precise or vague?]

### Issues Found

[List any issues, or "None"]

**Example Issue**:
- **Issue**: Root cause is symptom-level ("variable is null")
- **Should Be**: Design decision ("service assumed authenticated context")
- **Severity**: ❌ Critical

### Verdict

[✅ PASS / ⚠️ PASS WITH NOTES / ❌ FAIL]

[Explanation of verdict]

---

## 2. Execution Path Verification

### File Reference Validation

| Step | Claimed File:Line | Exists | Actual Location | Content Match | Verdict |
|------|-------------------|--------|-----------------|---------------|---------|
| Entry | `auth.ts:45` | ✅ | `auth.ts:45` | ✅ | ✅ PASS |
| Step 2 | `service.ts:120` | ✅ | `service.ts:123` | ⚠️ Off by 3 | ⚠️ MINOR |
| Fault | `handler.ts:78` | ❌ | Not found | N/A | ❌ FAIL |

### Corrections Made

| Original | Actual | Impact |
|----------|--------|--------|
| `file.ts:45` | `file.ts:48` | Low - line shifted |
| `missing.ts:10` | File not found | 🔴 Critical |

### Verdict

[✅ PASS / ⚠️ PASS WITH NOTES / ❌ FAIL]

---

## 3. Fix Strategy Verification

### Primary Strategy Analysis

**Claimed Approach**: [Description from RCA]

**Validation**:
- **Targets Root Cause**: [✅ Yes / ❌ No - masks symptom]
- **Files Exist**: [✅ All found / ⚠️ Some missing / ❌ None found]
- **Line References Accurate**: [✅/⚠️/❌]
- **Risk Assessment**: [Realistic / Underestimated / Overestimated]
- **Alternatives Genuine**: [✅ Different approaches / ❌ Trivial variations]

### Issues Found

[List issues or "None"]

**Example**:
- **Issue**: Fix adds null check (symptom masking)
- **Should**: Fix why null occurs in first place
- **Severity**: ❌ Critical - doesn't address root cause

### Verdict

[✅ PASS / ⚠️ PASS WITH NOTES / ❌ FAIL]

---

## 4. Side Effect Analysis

### Impact Assessment

**Modified Components**:
1. `ComponentA` → [number] callers found
2. `ComponentB` → [number] callers found

**Usages Checked**:
- [ ] All callers identified
- [ ] Impact on each caller assessed
- [ ] Breaking changes flagged
- [ ] Edge cases noted

### Risk Categorization

| Component | Callers | Risk Level | Rationale |
|-----------|---------|------------|-----------|
| `ComponentA` | 3 | Low | Isolated, simple change |
| `ComponentB` | 15 | High | Widely used, behavior change |

### Issues Found

[List issues or "None"]

### Verdict

[✅ PASS / ⚠️ PASS WITH NOTES / ❌ FAIL]

---

## Overall Assessment

### Summary of Findings

**Strengths**:
- [List what was done well]

**Weaknesses**:
- [List what needs improvement]

**Critical Issues**:
- [List blocking issues, or "None"]

### Confidence Justification

**HIGH Confidence** when:
- All file:line references verified
- 5 Whys reaches fundamental cause
- Fix strategy targets root cause
- Side effects considered

**MEDIUM Confidence** when:
- Minor inaccuracies (line numbers off by a few)
- Root cause is good but could be deeper
- Most references verified

**LOW Confidence** when:
- Multiple unverified claims
- Root cause is symptom-level
- Fix masks symptoms
- Critical references missing

**This verification**: [HIGH / MEDIUM / LOW]

[Justification paragraph]

---

## Recommendation

**Status**: [VERIFIED / VERIFIED WITH NOTES / NEEDS REVISION]

### If VERIFIED
✅ **Proceed to Implementation Planning**

The RCA is accurate and complete. Fix strategy is sound.

### If VERIFIED WITH NOTES
⚠️ **Proceed with Awareness**

The RCA is substantially accurate with minor concerns noted above. Review highlighted issues before implementing.

### If NEEDS REVISION
❌ **Return to RCA Analyst**

Critical issues found. Address the following before proceeding:

1. [Issue 1]
2. [Issue 2]
3. [Issue 3]

---

## Next Steps

- [ ] Human review of verification
- [ ] Approval to proceed (if VERIFIED)
- [ ] Revision loop (if NEEDS REVISION)
- [ ] Create implementation plan (if approved)

---

## Metadata

- **Verification Date**: {timestamp}
- **Verified By**: RCA Verifier Agent
- **RCA Version**: [from rca-report.md]
- **Revision Number**: [if this is a re-verification]

---

## References

- Original RCA: [rca-report.md](rca-report.md)
- Research: [research/verified-research.md](research/verified-research.md)
- Bug Context: [bug-context.md](bug-context.md)
- Workflow: [.github/skills/bug-coordinator/SKILL.md](../.github/skills/bug-coordinator/SKILL.md)
