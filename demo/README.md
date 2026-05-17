Demo: API success vs browser-visible failure
=========================================

What this demonstrates
- API-level workflow calls all return success (200/201) and the canonical backend state shows the PR merged and the issue closed.
- The frontend UI is updated only via asynchronous webhooks (simulated delay). Because the webhook delivery is delayed, the UI remains stale immediately after the API reports success.
- This produces passing assertions at the API layer but failing observable state in the browser — illustrating why agent evaluations that only check API responses can miss important end-to-end failures.

Files added
- `demo/backend.ts`: in-memory backend and async webhook queue
- `demo/ui.html`: tiny static dashboard that relies on webhooks
- `tests/demo-api.test.ts`: Vitest API-level test (passes)
- `tests/demo-browser.test.ts`: Playwright-driven browser test (intentionally fails)

Running the demo
1) Install dependencies (you'll need `vitest` and `playwright`):

```bash
npm install --save-dev vitest playwright
npx playwright install
```

2) Run the API-level test (should pass):

```bash
npx vitest run tests/demo-api.test.ts
```

3) Run the browser test (will fail, demonstrating the point):

```bash
npx vitest run tests/demo-browser.test.ts
```

4) Run the **visual demo** (shows UI state at each workflow step):

```bash
npx ts-node demo/visual-demo.ts
```

This opens a live browser window, performs the full workflow, and captures screenshots showing:
- API responses returning success immediately
- UI remaining stale until the webhook arrives
- The eventual consistency reconciliation after ~1 second

Screenshots are saved to `demo-screenshots/`.

5) Record test runs as terminal video (optional, requires `asciinema`):

```bash
npm install -g asciinema

asciinema rec demo-api-test.cast -c "npx vitest run tests/demo-api.test.ts"
asciinema rec demo-browser-test.cast -c "npx vitest run tests/demo-browser.test.ts"

# Play back the recording
asciinema play demo-api-test.cast
asciinema play demo-browser-test.cast
```

Notes
- The backend's `mergePR` marks the PR merged immediately (canonical state), but enqueues a webhook with a 1s delay. The UI only updates when the webhook is delivered.
- The browser test intentionally asserts that the UI has already updated; because delivery is delayed, the test throws an error — showing the mismatch between API success and observable UI state.

Why this matters for agent evaluation
- Autonomous workflows driven by agents often rely on API-level checks (status codes, resource fields). If agents assume an API success implies visible state change, they may proceed on false premises.
- This small demo shows how eventual consistency, webhook delays, and UI caching can produce surprising, hard-to-detect failures unless evaluation includes full browser-visible checks.
