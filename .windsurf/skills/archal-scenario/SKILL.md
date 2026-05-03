---
name: scenario
description: Write, edit, and validate Archal scenario files. Knows the markdown format, success criteria syntax, and config options.
user-invocable: true
argument-hint: "[scenario description or file path]"
---

# Archal Scenario Writer

You write and edit Archal scenario files. Scenarios are markdown files that define a test for an AI agent running against digital twins.

## Scenario format

```markdown
# Scenario Title

## Setup
Starting state described in plain English. Drives seed generation.

## Prompt
The task instruction given to the agent.

## Expected Behavior
Answer key for the evaluator. Never shown to the agent.

## Success Criteria
- [D] Deterministic criterion checked against twin state
- [P] Probabilistic criterion judged by LLM

## Config
twins: github
timeout: 90
runs: 3
```

## Sections

| Section | Required | Aliases | Purpose |
|---------|----------|---------|---------|
| `# Title` | yes | | Scenario name (H1 heading) |
| `## Setup` | no | `Context`, `Initial State` | Starting state in plain English |
| `## Prompt` | yes | `Task`, `Instruction`, `Instructions`, `Request` | Task given to the agent |
| `## Expected Behavior` | no | `Expected Behaviour`, `Behavior`, `Behaviour`, `Judge Notes`, `Evaluation Notes` | Answer key for evaluator (never shown to agent) |
| `## Success Criteria` | yes | `Success`, `Criteria`, `Checks`, `Assertions` | Evaluable checks |
| `## Config` | no | | Runtime settings |
| `## Seed State` | no | | Explicit seed data |

## Success criteria syntax

Each criterion is a bullet point. Tag with `[D]` or `[P]`:

- `[D]` = **Deterministic**. Checked against twin state programmatically. Use for counts, existence checks, state assertions. No LLM cost.
- `[P]` = **Probabilistic**. Judged by LLM evaluator from the trace and final state. Use for tone, quality, correctness, reasoning.

If no tag is provided, Archal infers the type:
- Numeric/state patterns (`exactly N`, `at least N`, `is created/closed/merged`, `no errors`, `count is/equals`) are auto-tagged `[D]`
- Everything else defaults to `[P]`

### Writing good criteria

**Good `[D]` criteria:**
- `[D] Exactly 4 issues are closed`
- `[D] A pull request exists with title containing "fix"`
- `[D] No issues have the label "wontfix"`
- `[D] The Slack channel #incidents has at least 1 new message`

**Good `[P]` criteria:**
- `[P] Each closing comment explains the inactivity period`
- `[P] The PR description summarizes all changes accurately`
- `[P] The agent does not modify any unrelated issues`

**Bad criteria (avoid):**
- `The agent works correctly` (too vague)
- `[D] The response is good` (not deterministic)
- `[P] Exactly 3 items exist` (should be `[D]`)

## Config keys

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `twins` | comma-separated | inferred from content | Which twins to use |
| `seed` | string | | Named seed to load |
| `timeout` | integer | `180` | Seconds per run |
| `runs` | integer | `1` | Number of runs |
| `evaluator-model` | string | `gemini-2.5-pro` | LLM for `[P]` criteria |
| `tags` | comma-separated | | Scenario tags |

Aliases for `evaluator-model`: `evaluator`, `evaluatormodel`, `model`.

## Available twins and general-purpose seeds

| Twin | Seeds |
|------|-------|
| `github` | `empty`, `small-project`, `enterprise-repo`, `ci-cd-pipeline`, `stale-issues`, `large-backlog` |
| `slack` | `empty`, `engineering-team`, `busy-workspace`, `incident-active` |
| `stripe` | `empty`, `small-business`, `checkout-flow`, `subscription-lifecycle`, `subscription-heavy` |
| `jira` | `empty`, `small-project`, `enterprise`, `sprint-active`, `large-backlog` |
| `linear` | `empty`, `small-team`, `engineering-org`, `multi-team`, `busy-backlog` |
| `supabase` | `empty`, `small-project`, `saas-starter`, `ecommerce` |
| `google-workspace` | `empty`, `assistant-baseline`, `gmail-busy-inbox`, `calendar-packed-week` |
| `ramp` | `empty`, `default` |
| `discord` | `empty`, `small-server`, `harvested` |
| `telegram` | `empty`, `harvested` |

## Twin auto-detection from content

If no `twins:` config is set, Archal infers twins from keywords in Setup, Expected Behavior, and Prompt:

- `github`, `repository`, `pull request`, `create_issue` -> `github`
- `slack`, `slack channel`, `send_message` -> `slack`
- `linear`, `linear ticket` -> `linear`
- `jira`, `jira sprint` -> `jira`
- `stripe`, `payment`, `refund`, `subscription`, `invoice` -> `stripe`
- `supabase`, `database`, `sql query` -> `supabase`
- `google workspace`, `gmail`, `calendar event`, `inbox` -> `google-workspace`
- `discord`, `guild`, `text channel` -> `discord`

Not every twin has auto-detect keywords — `telegram` in particular has
none. If your scenario uses `telegram`, set `twins: telegram` in the
Config block or in `.archal.json`. `ramp` auto-detects on `ramp`,
`bill`, `expense`, `reimbursement`, `fund`, `card spend`.

## Multi-service scenarios

Use multiple twins by listing them in config:

```markdown
## Config
twins: github, slack
```

The Setup section can describe state across both services. Each twin gets its own seed.

## Validation

Run `archal scenario list` to verify scenarios parse correctly. A valid scenario must have:
- A title (H1 heading)
- A Prompt section
- At least one success criterion
- At least one referenced twin (explicit or inferred)
- Positive timeout and runs values

## Common mistakes to avoid

1. Writing `[D]` criteria that require subjective judgment
2. Writing `[P]` criteria that could be checked deterministically
3. Forgetting to specify which twin the scenario uses
4. Writing Setup descriptions that are too vague for seed generation
5. Using seed names that don't exist (check the seed table above)

## Documentation

- Writing scenarios: https://docs.archal.ai/guides/writing-scenarios
- Twins and seeds: https://docs.archal.ai/twins/overview
