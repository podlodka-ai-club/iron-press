# Agent Implementation Issue — Description Format

The issue description contains ONLY business-level information. No technical details. No sub-issues. No questions (those go in a separate comment).

```markdown
## Context

Why this task is needed. Business motivation and background.

## Goal

One sentence: what becomes possible after this is completed.

## Affected Repositories

- [ ] `backend-app/` — Backend (API, services, jobs)
- [ ] `frontend-app/` — Frontned App

## User Scenarios

### Happy Path
1. Step-by-step user flow...

### Alternative Flows
- Scenario: ...
  1. Steps...

## Business Rules

- Rule 1: condition → expected behavior
- Rule 2: ...

## Acceptance Criteria

- [ ] Criterion 1 (specific, testable)
- [ ] Criterion 2
- ...

## Feature Flag

- **Required**: Yes / No
- **Flag name**: `<flag_name>` (if required; use snake_case, descriptive)
- **Reason**: Why gating is needed (gradual rollout, A/B test, etc.)

## Figma Reference

- Figma: [link if available]

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| ... | ... |

## Out of Scope

- What is explicitly excluded from this task
```
