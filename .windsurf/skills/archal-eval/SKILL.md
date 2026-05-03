---
name: eval
description: Run Archal scenarios or inline tasks against hosted twins, diagnose failed runs, and interpret satisfaction scores. Triggers on "run my scenario", "evaluate my agent", "archal run X", "debug this failing run", "what does this satisfaction score mean".
user-invocable: true
argument-hint: "[scenario.md or task description]"
---

# Archal Eval Runner

You run Archal scenarios and inline tasks, then help the user interpret the results. For setting up the agent path or `.archal.json` in a fresh repo, hand off to the `onboard` skill.

## What only you know (product mental model)

- `archal run` spawns the user's agent as a child process. The agent needs:
  - A **runnable agent path**. Two ways to supply it: explicit `--harness <path>` (e.g. `./.archal/harness.ts`), or `.archal.json` with an `agent` command. Repo-local auto-discovery also walks up from cwd for a top-level `harness.{ts,js,mjs,cjs}`.
  - A **headless boundary** — no UI, no browser OAuth. The process is spawned without a shell, so interactive auth hangs forever.
  - Env vars — auto-injected. `ARCHAL_ENGINE_TASK` is the prompt; `ARCHAL_<TWIN>_BASE_URL` / `ARCHAL_<TWIN>_URL` point at twins; `ARCHAL_PREFLIGHT=1` is set during boot check (harness should exit early).
- Every `archal run` writes local artifacts under `.archal/cache/last-run.json` and `.archal/cache/runs/*.json` **regardless** of `--output`. `--output json` is only for machine-readable stdout; it's not needed for local persistence.
- **Satisfaction score** = (runs passing all criteria) / (total runs). `[D]` criteria are deterministic state checks; `[P]` criteria are LLM-judged from trace + final state.

## Preflight the harness before a run

When the agent path is uncertain, or after any change to the harness file, smoke-test the harness directly before `archal run`:

```bash
ARCHAL_PREFLIGHT=1 ARCHAL_ENGINE_TASK="Reply with OK and do not use tools." npx tsx ./.archal/harness.ts
```

A harness that exits cleanly with no tool calls is ready. Catches: no runnable entrypoint, UI-boot assumptions, missing provider keys, service bridge misconfig. A failure here is much easier to diagnose than a silent timeout inside `archal run`.

## Running

Scenario from a file:

```bash
archal run scenario.md
archal run scenario.md --runs 5 --seed enterprise-repo   # N runs → satisfaction score
```

Inline task (no scenario file):

```bash
archal run --task "Create an issue titled hello" --harness ./.archal/harness.ts --twin github
```

`--task` only replaces the scenario file — it still needs a runnable agent path. `--twin` is required with `--task`; repeat or comma-separate for multiple twins.

When `.archal.json` exists in cwd, bare `archal run` uses it. If the user doesn't have one yet, that's setup — hand off to the `onboard` skill, which owns harness creation and `.archal.json` scaffolding.

## Interpret results

Score breakdown:
- `100%` = every run passed every criterion
- `80%` = 4/5 runs passed
- `0%` = none passed

Criterion types:
- `[D]` — deterministic state check. A failure is real; never a model variance artifact.
- `[P]` — LLM judge reads trace + final state. A single failure can be variance; re-run with `--runs 3+` to confirm before acting on it.

## Diagnose failures

Re-run with `-v` for the full trace, then classify with these signals:

- **Agent bug** — wrong tool called, wrong arguments, stopped early.
  *Signals:* trace shows the correct tool was available but the agent chose another; or arguments are malformed.
  *Fix:* agent prompt, tool wiring, or underlying model.

- **Scenario bug** — criteria are too strict, ambiguous, or contradict the Setup.
  *Signals:* agent clearly did the right thing but a `[D]` criterion expects an exact count the Setup didn't guarantee; or two criteria contradict each other.
  *Fix:* make Setup more specific, or relax the criterion. Use the `scenario` skill.

- **Seed mismatch** — twin state doesn't match what Setup describes.
  *Signals:* agent's first introspection tool call returns unexpected state (e.g. Setup says "4 stale issues" but the seed has 3).
  *Fix:* different seed, or adjust Setup to match. `archal seed list <twin>` to browse.

- **Harness bug** — agent process never started, crashed immediately, or hung.
  *Signals:* no tool calls in the trace, stderr shows a boot error, or the run times out at the configured `--timeout`.
  *Fix:* smoke-test the harness directly with `ARCHAL_PREFLIGHT=1 ARCHAL_ENGINE_TASK="Reply with OK." npx tsx ./.archal/harness.ts`, then look for UI-only imports, missing provider keys, or interactive auth.

## CI mode

```bash
archal run scenario.md --runs 3 --pass-threshold 80 -o json -q
```

Exit codes: `0` pass, `1` fail or score < threshold, `2` validation error. For GitHub Actions, inject `ARCHAL_TOKEN` as a secret.

## Artifacts + dashboard

- **Local (always written):** `.archal/cache/last-run.json` (summary), `.archal/cache/runs/*.json` (full redacted trace).
- **Hosted:** every run also uploads to https://www.archal.ai/dashboard — useful for sharing a failing trace with a colleague or comparing across agent model versions.

Don't tell users they need `-o json` to save artifacts locally — that's only for stdout.

## Anti-patterns

- Don't re-document the `archal run` flag list here. `archal run --help` and https://docs.archal.ai/cli/run own that — they'll drift if duplicated.
- Don't guess the agent path. If the user doesn't have `--harness`, a repo-local harness, or `.archal.json`, hand off to `onboard` — it owns setup.
- Don't promote `--proxy` as default. It's for agents that still call real service domains through raw HTTPS clients. Env-var wiring is the primary path; proxy is a fallback.
- Don't classify a single `[P]` failure as an agent bug without re-running. Probabilistic criteria need sample size.
- Don't treat a `[D]` failure as model variance. Deterministic failures are real bugs.

## Docs

- Running with an agent: https://docs.archal.ai/guides/run-with-agent
- Existing repo playbook: https://docs.archal.ai/guides/existing-agent-repo
- Scenario authoring: hand off to the `scenario` skill
- Twin sessions: https://docs.archal.ai/guides/twin-sessions
