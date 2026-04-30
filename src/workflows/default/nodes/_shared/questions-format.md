# Questions Comment Format

Post questions as a **separate comment** via `save_comment`. Questions must NEVER appear in the issue description.

Two question types: **open-ended** (no distinct alternatives — just ask plainly) and **with options** (discrete set of answers — list as lettered options for easy selection).

## Formatting Questions

- **Header**: `## Questions from <Your Agent Role>`.
- **Numbered questions**: Each question is numbered and prefixed with a `**[Category]**` label.
- **Open-ended questions**: Just ask plainly when there are no discrete alternatives.
- **Questions with options**: When a question has a discrete set of possible answers, list them as lettered options (a, b, c, …) — each on its own line for easy copy-paste.
  - ***(recommended)***: Mark the option you recommend.
  - ***(current)***: Mark the option that the issue description currently assumes (if applicable).
  - Place the *(recommended)* or *(current)* option first (as option `a`).
- Skip categories where you already have answers from research.

## Example

```markdown
## Questions from <Your Agent Role>

1. **[Acceptance Criteria]** Open-ended question text?
2. **[Data & Logic]** How should notification preferences be scoped?
   a) Per User and Business — separate preferences for each business the user belongs to *(recommended)* *(current)*
   b) Per User — single global preference set
   c) Per Business — business-level setting that applies to all members
```
