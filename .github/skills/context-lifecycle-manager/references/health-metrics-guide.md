# Health Metrics Guide

Comprehensive guide to Context Repository health metrics calculated by the Context Lifecycle Manager.

## Overview

The health check system provides **quantitative metrics** to assess the quality and maintainability of the `.context` repository. It helps identify:

- 🗄️ Outdated documentation that should be archived
- 🔗 Orphaned documents without proper references
- ⏰ Stale sessions and plans requiring attention
- 📚 Missing or outdated READMEs

## Core Metrics

### 1. Freshness Ratio

**Definition:** Percentage of active documents modified in the last 90 days.

**Formula:**
```python
freshness_ratio = (docs_modified_in_90_days / total_active_docs) × 100
```

**Thresholds:**

| Range | Status | Color | Meaning |
|-------|--------|-------|---------|
| > 70% | Excellent | 🟢 | Very active, well-maintained repository |
| 60-70% | Good | 🟡 | Healthy, minor cleanup needed |
| 40-60% | Needs Attention | 🟠 | Many stale docs, archival recommended |
| < 40% | Critical | 🔴 | Severe staleness, major cleanup required |

**Example Calculation:**

```
Total active docs: 100
Modified in last 90 days: 68

Freshness ratio: 68 / 100 × 100 = 68% 🟡 (Good)
```

**What it means:**
- **High freshness (> 70%)**: Documentation is actively maintained, reflects current state
- **Low freshness (< 40%)**: Many docs not touched in 3+ months, likely outdated

**Actions to improve:**
1. Archive completed research → moves to archive/, not counted in active
2. Update existing docs with recent changes
3. Delete truly obsolete docs (with approval)

---

### 2. Orphan Rate

**Definition:** Percentage of documents not referenced from any README file.

**Formula:**
```python
orphan_rate = (docs_not_referenced_in_readmes / total_active_docs) × 100
```

**Thresholds:**

| Range | Status | Color | Meaning |
|-------|--------|-------|---------|
| < 5% | Excellent | 🟢 | Almost all docs well-referenced |
| 5-10% | Good | 🟡 | Few orphans, acceptable level |
| 10-20% | Needs Attention | 🟠 | Many orphans, add references |
| > 20% | Critical | 🔴 | Severe orphaning, discoverability issues |

**Example Calculation:**

```
Total active docs: 100
Referenced in READMEs: 88

Orphan rate: (100 - 88) / 100 × 100 = 12% 🟠 (Needs Attention)
```

**What it means:**
- **Low orphan rate (< 5%)**: Docs are discoverable via READMEs
- **High orphan rate (> 20%)**: Many docs hidden, not linked properly

**Actions to improve:**
1. Add links to orphaned docs in domain READMEs
2. Organize docs into logical sections
3. Create index pages for large doc sets
4. Archive truly obsolete docs

**How references are detected:**

Script scans all `README.md` files for markdown links:
```markdown
[Link text](relative/path/to/doc.md)
```

Docs matching these links are considered "referenced".

---

## Additional Statistics

### Docs by Category

**Active vs Archive vs Sessions breakdown:**

```
Total Documentos:           145
- Active:                   78   (53.8%)
- Archive:                  52   (35.9%)
- Sessions:                 15   (10.3%)
```

**What to aim for:**
- Active: 50-60% (working docs)
- Archive: 30-40% (historical)
- Sessions: < 15% (temporary)

**If sessions > 20%:** Too many open sessions, close completed ones.

### Docs by Domain

```
Por Dominio (Active):
- inventory:              12 docs
- sales:                  10 docs
- cash-register:           8 docs
- authentication:          7 docs
- credit-notes:            6 docs
- ...
```

**What to look for:**
- **Empty domains (0-1 docs):** Undocumented features
- **Overloaded domains (> 20 docs):** Consider splitting into subdirectories

### READMEs Coverage

```
READMEs:
- Completos:                9/11 (82%)
- Desactualizados:          2 (> 30 días)
- Faltantes:                2
```

**Target:** 100% coverage with fresh READMEs (< 30 days old)

**Missing READMEs impact:**
- 🔍 Reduced discoverability
- 📈 Increases orphan rate
- 🤷 Developers don't know what exists in domain

**Action:** Create README.md in each domain with:
```markdown
# {Domain} Domain

## Overview
Brief description of domain

## Active Research
- [Research 1](current/research-1.md) - Description
- [Research 2](current/research-2.md) - Description

## Plans
- [Plan 1](plans/active/plan-1.md) - Status: In Progress
- [Plan 2](plans/completed/plan-2.md) - Status: Completed

## Features
- [Feature 1](features/feature-1.md) - Documentation

## Archive
See [archive/](../../archive/{domain}/) for historical docs.
```

### Old Sessions

```
Sessions:                 15 (⚠️  3 > 14 días)
```

**Threshold:** 14 days (sessions older than 2 weeks should be reviewed)

**What it means:**
- **0 old sessions:** Good hygiene, sessions closed promptly
- **> 5 old sessions:** Accumulation, review and close

**Actions:**
1. Check for unextracted learnings
2. Extract important insights to active/ or archive/
3. Run `--clean-sessions` with appropriate threshold

---

## DoD Completion (for Stale Plans)

**Definition:** Percentage of Definition of Done checkboxes marked complete.

**Formula:**
```python
dod_completion = (checked_boxes / total_boxes) × 100
```

**Example:**

```markdown
## Definition of Done

- [x] Backend implementation complete
- [x] Frontend implementation complete
- [x] Unit tests written
- [ ] Integration tests written
- [ ] Deployed to production

DoD Completion: 60% (3/5)  ❌ Incomplete
```

**Threshold:** ≥ 80% = "DoD complete"

**Used for:** Stale plan detection to prioritize review

---

## Action Items Priority

### Priority Levels

**URGENTE 🔴 (Action within 7 days)**
- Close sessions > 14 days with unextracted learnings
- Address critical health metrics (freshness < 40%, orphan > 20%)

**IMPORTANTE ⚠️ (Action within 30 days)**
- Update READMEs > 30 days old
- Archive obsolete docs (freshness 40-60%)
- Add references to orphaned docs (orphan 10-20%)

**NORMAL ℹ️ (Action within 90 days)**
- Create missing READMEs
- Document undocumented features
- Review stale plans 90-180 days old

### Action Generation Logic

Script generates actions based on thresholds:

```python
if old_sessions > 0:
    priority = "URGENTE"
    action = f"Cerrar {old_sessions} session(es) > 14 días"

if outdated_readmes > 0:
    priority = "IMPORTANTE"
    action = f"Actualizar {outdated_readmes} README(s) desactualizados (> 30 días)"

if freshness_ratio < 60:
    priority = "IMPORTANTE"
    action = f"Archivar docs obsoletos (freshness ratio: {freshness_ratio}%)"

if orphan_rate > 10:
    priority = "IMPORTANTE"
    action = f"Agregar referencias a docs huérfanos (orphan rate: {orphan_rate}%)"

if missing_readmes > 0:
    priority = "NORMAL"
    action = f"Crear READMEs para {missing_readmes} dominios restantes"
```

---

## Health Check Schedule

### Monthly Routine (First Friday)

```bash
# 1. Run health check
@context-lifecycle-manager health check

# 2. Detect stale plans
@context-lifecycle-manager detect stale plans

# 3. Review and act on recommendations
# [Manual review of output]

# 4. Clean sessions (stricter threshold for monthly)
@context-lifecycle-manager clean sessions older than 30 days

# 5. Full cleanup
@context-lifecycle-manager full cleanup
```

**Time investment:** ~30 minutes/month

**ROI:** Maintains repository health, prevents accumulation

### Ad-Hoc Checks

**When to run:**
- Before planning new major feature (clean workspace)
- After sprint completion (archive completed work)
- When context feels "cluttered"
- After team onboarding (ensure docs are fresh)

---

## Metric Interpretation Examples

### Example 1: Healthy Repository

```
Freshness Ratio:         72%      🟢
Orphan Rate:             4%       🟢

STATUS: SALUDABLE ✅

Total Documentos:           98
- Active:                   52
- Archive:                  38
- Sessions:                 8 (0 > 14 días)

READMEs: 11/11 (100%)

No hay acciones pendientes.
```

**Interpretation:**
- ✅ Most docs recently modified (72% < 90 days)
- ✅ Almost all docs referenced (4% orphans)
- ✅ No old sessions
- ✅ Complete README coverage

**Action:** None, maintain current practices.

---

### Example 2: Needs Cleanup

```
Freshness Ratio:         55%      🟠
Orphan Rate:             15%      🟠

STATUS: REQUIERE ATENCIÓN ⚠️

Total Documentos:           145
- Active:                   95 (65.5%)
- Archive:                  35 (24.1%)
- Sessions:                 15 (10.4%, ⚠️  5 > 14 días)

READMEs: 8/11 (73%)
- Desactualizados:          3 (> 30 días)
- Faltantes:                3

ACCIONES RECOMENDADAS:

1. [URGENTE] 🔴 Cerrar 5 session(es) > 14 días
2. [IMPORTANTE] ⚠️ Archivar docs obsoletos (freshness: 55%)
3. [IMPORTANTE] ⚠️ Agregar referencias (orphan rate: 15%)
4. [IMPORTANTE] ⚠️ Actualizar 3 README(s) desactualizados
5. [NORMAL] ℹ️ Crear 3 READMEs faltantes
```

**Interpretation:**
- 🟠 Nearly half of docs not modified in 90 days (staleness)
- 🟠 15% of docs orphaned (discoverability issue)
- ⚠️ 5 sessions > 14 days (accumulation)
- 📚 Incomplete README coverage (73%)

**Action Plan:**

**Week 1-2 (URGENTE):**
1. Review 5 old sessions
2. Extract learnings to active/ or archive/
3. Run `--clean-sessions --session-age 14 --execute`

**Week 3-4 (IMPORTANTE):**
4. Review active/ docs not modified in 90 days
5. Archive completed research: `--archive-research --execute`
6. Update 3 outdated READMEs with recent docs
7. Add references to orphaned docs in READMEs

**Month 2 (NORMAL):**
8. Create 3 missing READMEs
9. Document undocumented features in domains

---

### Example 3: Critical State

```
Freshness Ratio:         32%      🔴
Orphan Rate:             28%      🔴

STATUS: CRÍTICO 🔴

Total Documentos:           187
- Active:                   124 (66.3%)
- Archive:                  28 (15.0%)
- Sessions:                 35 (18.7%, ⚠️  18 > 14 días)

READMEs: 4/11 (36%)
- Desactualizados:          2 (> 90 días)
- Faltantes:                7

ACCIONES RECOMENDADAS:

1. [URGENTE] 🔴 Cerrar 18 session(es) > 14 días
2. [URGENTE] 🔴 Archivar docs obsoletos (freshness: 32%)
3. [URGENTE] 🔴 Agregar referencias (orphan rate: 28%)
4. [IMPORTANTE] ⚠️ Actualizar 2 README(s) desactualizados (> 90 días)
5. [IMPORTANTE] ⚠️ Crear 7 READMEs faltantes
```

**Interpretation:**
- 🔴 Two-thirds of docs not touched in 90 days (severe staleness)
- 🔴 Quarter of docs orphaned (major discoverability issue)
- 🔴 18 sessions > 14 days (significant accumulation)
- 📚 Only 36% README coverage (poor documentation)

**Emergency Action Plan:**

**Immediate (Week 1):**
1. **STOP creating new docs until cleanup complete**
2. Triage 18 old sessions: Extract critical learnings FAST
3. Delete sessions without learnings
4. Run aggressive cleanup: `--clean-sessions --session-age 7 --execute`

**Week 2-3:**
5. Audit all active/ docs:
   - Implemented? → Archive to implemented/
   - Obsolete? → Archive to obsolete/
   - Still relevant? → Update with recent info
6. Target: Reduce active docs by 40-50%
7. Run: `--archive-research --execute`

**Week 4:**
8. Create 7 missing READMEs (use template)
9. Update 2 outdated READMEs
10. Add references to reduce orphan rate to < 10%

**Month 2:**
11. Re-run health check, confirm improvement
12. Establish monthly maintenance routine
13. Document lessons learned

---

## Benchmark Data

### Good Repository

```
Freshness Ratio:         > 65%
Orphan Rate:             < 8%
Active/Archive Ratio:    60/40
Old Sessions:            < 3
README Coverage:         > 90%
```

### Target Values

```
Freshness Ratio:         70-80%
Orphan Rate:             3-5%
Active/Archive Ratio:    55/45
Old Sessions:            0
README Coverage:         100%
```

---

## Continuous Improvement

### Tracking Over Time

**Create monthly log:**

```markdown
# Health Check Log

## 2026-02-07

Freshness: 68% 🟡
Orphan: 8% 🟡
Status: SALUDABLE ✅
Actions: None

## 2026-01-10

Freshness: 55% 🟠
Orphan: 15% 🟠
Status: REQUIERE ATENCIÓN ⚠️
Actions:
- Archived 8 completed research
- Cleaned 5 old sessions
- Updated 3 READMEs
- Added references to 12 orphaned docs

## 2025-12-06

Freshness: 48% 🟠
Orphan: 22% 🔴
Status: REQUIERE ATENCIÓN ⚠️
Actions: [Listed above]
```

**Track trends:**
- ✅ Freshness improving: 48% → 55% → 68%
- ✅ Orphan rate decreasing: 22% → 15% → 8%
- ✅ Trend: Moving toward healthy state

---

## Tips for Maintaining Health

### 1. Archive Promptly

Don't let completed research accumulate in active/:
```
Completed research → Archive immediately
Deployed fix → Archive bug artifacts day of deployment
```

### 2. Close Sessions Within 7 Days

Use sessions for short-term debugging/investigation:
```
Session created → Work 1-5 days → Extract learnings → Delete
Max session age: 7 days
```

### 3. Link Everything in READMEs

Every doc should be referenced somewhere:
```
Create doc → Add link to domain README → Discoverable
```

### 4. Monthly Maintenance Ritual

First Friday routine (30 min):
```
1. Health check
2. Detect stale plans
3. Clean sessions (30-day threshold)
4. Full cleanup
5. Update log
```

### 5. Review Metrics Trends

Watch for degradation:
```
Freshness dropping 10%+ → Investigate
Orphan rate increasing 5%+ → Add references
Sessions accumulating → Close completed ones
```

---

*Last Updated: February 2026*  
*Related: context-lifecycle-manager SKILL.md*
