---
name: vitest
description: Wire `archal/vitest` into a user's existing Vitest suite so integration tests hit hosted twins instead of real SaaS. Use when the user asks to "add archal to vitest", "wire up vitest with twins", "test against twins in vitest", or when invoked from `archal-onboard` Option C.
user-invocable: true
---

# Archal Vitest Integration

Wire `archal/vitest` into the user's existing Vitest suite. Don't paste a canned config — inspect what's already there, surface the right choices, and compose on top of it.

## What only you know

Claude already knows what Vitest is and how a fetch interceptor works. These are the Archal-specific facts that determine your choices:

- `archal/vitest` is a **subpath export of the `archal` npm package**. Users do `pnpm add -D archal`, not `@archal/vitest`.
- Route mode installs a setup file that rewrites `fetch()` calls to hosted twins. **Test code stays unchanged** — same SDKs, same URLs.
- Twins are hosted on **ECS Fargate** in Archal's AWS. First run = ~30s cold start. Subsequent runs within the 30-min idle TTL = ~2s. Tell the user; they'll think it's hung otherwise.
- Session cache key = `(projectName, services, seeds)` hash. Change any of those and the cache misses.
- **Seeds = starting state.** Omit to get the twin's default. Named seeds give fixtures (e.g. `small-project` for GitHub, `small-business` for Stripe). Never ask "what seed?" open-ended — the user doesn't know the catalog.
- Route-mode twins available: `discord`, `github`, `google-workspace`, `jira`, `linear`, `ramp`, `slack`, `stripe`, `supabase`. Not yet: `telegram`. (Source of truth: `SHARED_ROUTE_MANIFESTS` in `packages/route-runtime-core/src/manifests.ts` — don't invent services that aren't in that array.)

## Discover before you ask

1. `package.json` deps → infer likely twins (`@octokit/rest` → github, `stripe` → stripe, `@slack/web-api` → slack, `@supabase/supabase-js` → supabase, `googleapis` → google-workspace, `jira.js` → jira).
2. Read any existing `vitest.config.ts` / `vitest.config.js` / `vitest.workspace.ts`. Note `setupFiles`, `include`/`exclude`, `reporters`, `projects`.
3. Grep test files (`__tests__/`, `tests/`, `*.test.ts`) for outbound calls: `fetch(`, `Octokit`, `new Stripe`, `WebClient`, `createClient`. These are the routing candidates.
4. Auth: `archal usage` tells you if they're logged in. `archal login` or `ARCHAL_TOKEN` in CI.

## Ask only what you couldn't infer

Offer your inferred answer as the default.

1. **Scope.** "I found these N test files making outbound HTTP calls: [list]. All of them? Or a specific subset (by folder, glob, or file list)?"
2. **Twin set.** "From deps I see `[github, stripe]`. Complete, or am I missing/over-including?"
3. **Seeds (per twin, with inline catalog).** For each twin, present three choices:
   > "For `github`: (a) default empty twin, (b) `small-project` seed (one repo, few issues/PRs — good starting point), (c) custom seed name. Which?"

## Pick a config pattern

Three patterns. The right one depends on what you saw in discovery.

### Pattern A — wrap existing `vitest.config.ts` with `withArchal` (all tests hit twins)

For dedicated integration-test packages where every test should route. `withArchal` is a merge helper: it preserves everything in the existing `test` block (`coverage`, `alias`, `globalSetup`, `poolOptions`, custom reporters, etc.) and additively composes Archal's setup file, reporter, and session env on top.

Edit their existing file in place — the change is one line on the `test:` value:

```ts
import { defineConfig } from 'vitest/config';
import { withArchal } from 'archal/vitest';

export default defineConfig({
  test: withArchal(
    {
      // ...everything they already had, unchanged
      globals: true,
      setupFiles: ['./test/my-setup.ts'],
      coverage: { provider: 'v8' },
    },
    {
      services: {
        github: { mode: 'route', seed: 'small-project' },
        stripe: { mode: 'route' },
      },
    },
  ),
});
```

Merge behavior: `setupFiles` and `reporters` are concatenated, `env` is merged (user keys preserved + Archal session keys added), and any other field the user had is passed through untouched.

If the user is starting from scratch (no existing `test` block), pass `{}` as the first argument: `withArchal({}, { services })`.

### Pattern B — workspace with a separate Archal project (subset of tests hit twins)

Most common shape. Unit tests stay fast; only the routed subset provisions twins.

```ts
import { archalVitestProject } from 'archal/vitest';

export default [
  './vitest.config.ts', // their existing unit project untouched
  archalVitestProject(
    {
      name: 'hosted-twins',
      services: {
        github: { mode: 'route', seed: 'small-project' },
        stripe: { mode: 'route' },
      },
    },
    { include: ['__tests__/hosted/**/*.test.ts'] },
  ),
];
```

### Pattern C — separate config + npm script (strict isolation)

`vitest.integration.config.ts` using Pattern A, plus `"test:integration": "vitest -c vitest.integration.config.ts"`. Use when `pnpm test` must stay unit-only.

## Apply → verify

1. Install `archal` if missing.
2. Write/edit the config.
3. Ensure auth (`archal login` or `ARCHAL_TOKEN`).
4. Run one routed test: `pnpm vitest run <path>`.

If confirming routing is live from inside a test:
```ts
import { getInstalledArchalVitestSession } from 'archal/vitest';
console.log(getInstalledArchalVitestSession()?.resolvedRuntime.resolvedServices);
```

## Failure modes

- **Real API response instead of twin response** — test file isn't in the routed project's `include` glob.
- **401/auth at setup** — `ARCHAL_TOKEN` unset or `archal login` not run.
- **First run takes 30+ seconds** — ECS cold-start, expected. Warn the user up front.
- **Seed state unexpected** — inspect via `getInstalledArchalVitestSession()`; confirm resolved seed matches intent.
- **`resetArchalTwins()` not restoring** — call in `beforeEach`, not `beforeAll`.
- **CI credential race** (parallel jobs corrupting `~/.archal/credentials.json`) — export `ARCHAL_TOKEN` directly; don't rely on the credential file.

## Anti-patterns

- Don't route `localhost` or the user's own backend. Route mode is for external SaaS.
- Don't set `testIsolation: 'serial'` preemptively. Only when you've observed cross-test state leaks.
- Don't add route mode to tests that don't make outbound HTTP calls — the interceptor install has overhead.
- Don't drive vitest through `.archal.json`. That file is for the CLI `archal run` flow; the vitest integration is self-contained.
- Don't paste a canonical config without reading what's already in the repo.

## Docs

- Guide: https://docs.archal.ai/guides/vitest
- Package reference: `packages/vitest/README.md`
