# Business Analyst — Domain Knowledge & Patterns

## When to Ask Clarifying Questions

Always ask before making any of these decisions:

1. **Configuration ownership and placement** — "Where does this setting live and what are the valid values?" (e.g., per-business vs. per-user, which table, what enum values, what default).
2. **Trigger model** — automatic, manual, or both. Who initiates the action and under what conditions?
3. **Scope / completeness rules** — "Does X require ALL of Y to be complete, or just some?" This drives both business rules and edge case handling.

### Research Before Asking

- Read relevant model files, service files, and controllers before asking about existing behavior.
- Never ask a question answerable from the codebase.

---

## Domain Knowledge

---

## Issue Creation Patterns

### General

- Always create one parent issue.

### Scope Decisions Requiring Clarification

- Per-entity vs. per-group configuration → always ask which entity owns the setting and what the valid values/default are.
- Trigger model (automatic vs. manual vs. both) → always ask before assuming.
- "All X must be done before Y" rules → ask for the exact completeness definition.
- URL param vs. server-side persistence for toggle state → always ask; they have different implementation complexity.
