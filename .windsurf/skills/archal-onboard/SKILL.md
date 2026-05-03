---
name: onboard
description: Set up Archal in a project from scratch. Detects dependencies, installs the CLI, handles auth, then routes to the right sub-skill (scenarios, vitest, etc.) for the workflow the user wants. Use when the user asks to "set up archal", "initialize archal", "get started with archal", or "add archal to this repo".
user-invocable: true
---

# Archal Onboard

You are setting up Archal in this project. Archal tests AI agents against digital twins of real services (GitHub, Slack, Stripe, etc.). Handle installation and auth yourself; delegate the workflow-specific setup to the matching sub-skill.

## If this is a cold-start

The user may have landed here without running `npx archal init` first. If the
CLI is missing (see "Install + auth" below) AND no `.archal-manifest.json`
exists in `.claude/skills/`, the canonical first command is:

```bash
npx archal init
```

That adds `archal` as a devDependency and reinstalls these skills at the
right version. Re-invoke the onboard skill after it completes.

## Discover first

Before asking anything, read the repo:

1. `package.json` deps → infer likely twins:
   - `@octokit/rest`, `octokit` → `github`
   - `stripe` → `stripe`
   - `@slack/web-api`, `@slack/bolt` → `slack`
   - `@linear/sdk` → `linear`
   - `@supabase/supabase-js` → `supabase`
   - `googleapis`, `@google-cloud/*` → `google-workspace`
   - `jira-client`, `jira.js` → `jira`
2. Existing vitest config? Existing scenarios? Existing `.archal.json`? Those change which workflow makes sense.
3. If no `package.json` or no matching deps: ask "Which services does your agent interact with?" and show the full list: `github`, `slack`, `stripe`, `linear`, `jira`, `supabase`, `google-workspace`, `ramp`.

## Install + auth

If you're here via `npx archal init`, archal is already a devDependency
and the skills are already in place. Go straight to login:

```bash
archal login                # OAuth browser flow, or: archal login --token <token>
archal usage                # verify auth + plan
```

In CI, set `ARCHAL_TOKEN` instead of running `archal login`.

If something feels wrong (missing CLI, stale skills), these are the
recovery commands — don't run them otherwise:

```bash
npx archal --version           # CLI reachable? prints e.g. 0.9.12
npx archal init --skills-only  # re-stage skills if they drifted
```

## Pick a workflow

Confirm detected twins, then ask which of these the user wants. Each delegates to a sub-skill where appropriate — don't inline those flows.

### The `agent` command (Options A and B both need this)

`archal run` spawns the agent as a child process, headlessly — no UI, no browser auth. The `agent` field in `.archal.json` is the shell command that invokes it. Typical shapes:

- `"agent": "npx tsx ./.archal/harness.ts"` — custom TS entrypoint, most common
- `"agent": "node ./agent.js"` — plain Node script
- `"agent": "python agent.py"` — Python agent

If the user doesn't have a harness yet, scaffold one at `./.archal/harness.ts` that reads `ARCHAL_ENGINE_TASK` from env and calls their agent's runtime. Alternative: skip `agent` in `.archal.json` and pass `--harness <path>` per-run.

### Option A — Evaluate an agent with scenarios

Write markdown scenario files that describe setup, prompt, and success criteria; `archal run` executes them against twins.

1. Create `.archal.json`:
   ```json
   {
     "agent": "npx tsx ./.archal/harness.ts",
     "twins": ["<detected twins>"]
   }
   ```
2. **Delegate to the `scenario` skill** to author a starter scenario. Don't paste a canned example here — the skill knows the markdown format and success-criteria syntax.
3. Run: `archal run scenarios/<first>.md`. **Hand off to the `eval` skill** for result interpretation and failure diagnosis.

### Option B — Run quick inline tasks

Same `.archal.json` as Option A (inline `--task` still needs an agent). Use this when the user wants ad-hoc runs before committing to scenario files.

1. `.archal.json`:
   ```json
   {
     "agent": "npx tsx ./.archal/harness.ts",
     "twins": ["<detected twins>"]
   }
   ```
2. Demo: `archal run --task "Create an issue titled hello" --twin github`.

### Option C — Twins in a Vitest suite

**Delegate to the `vitest` skill.** It handles reading the existing vitest config, identifying which tests should route, picking the right composition pattern, and seeding the twins.

Do not paste a sample config here. The right shape depends on what's already in the repo.

### Option D — Persistent twins to develop against

Run: `archal twin start <detected twins>` — gives live twin URLs the user's SDK clients can point at. `archal twin status` shows the active session; `archal twin stop` tears down.

## Verify

Run the first scenario or task. For Options A and B, hand off to the `eval` skill to interpret the satisfaction score and diagnose failures — that skill owns the runtime mental model (`[D]` vs `[P]` criteria, trace inspection, harness preflight).

## `.archal.json` schema

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `agent` | string or `{ command, args }` | yes (for scenarios) | | Shell command to run the agent |
| `title` | string | no | | Display name for reports |
| `twins` | string[] | no | inferred | Which twins to provision |
| `scenarios` | string[] | no | | Scenario file paths relative to config |
| `seeds` | `Record<string, string>` | no | | Per-twin seed overrides |
| `agentModel` | string | no | | LLM model the agent uses |
| `model` | string | no | `gemini-2.5-pro` | Evaluator model |
| `runs` | number | no | `1` | Runs per scenario |
| `timeout` | number | no | `180` | Timeout per run in seconds |

## Docs

- Quickstart: https://docs.archal.ai/quickstart
- Full docs: https://docs.archal.ai
