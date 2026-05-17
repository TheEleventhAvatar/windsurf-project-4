# Visual Demo: API Success vs Browser-Visible Failure

## The Problem

When autonomous agents execute workflows through APIs, they typically:
1. Make API calls and check response codes (200, 201, etc.)
2. Assert that API responses indicate success
3. Assume the work is complete and move on

But **API success ≠ observable end-state success** in distributed systems with eventual consistency.

## What This Demo Shows

This minimal demo captures a real edge case: **the API reports merge success immediately, but the UI remains stale until the webhook arrives**.

### Workflow Steps

1. **Create issue** → API returns 201 ✅
2. **Create branch** → API returns 201 ✅
3. **Open PR** → API returns 201 ✅
4. **Merge PR** → API returns 200 ✅ (canonical state updated immediately)
5. **Webhook delay** → ~1000ms before UI cache updates

### The Mismatch

#### Screenshot 1: API Success, UI Stale ⚠️

After the merge API returns 200:

![Before Webhook](demo-screenshots/04-after-merge-api-success-ui-stale.png)

- **API canonical state**: PR merged=true, Issue open=false
- **Browser UI shows**: PR status="Open", Issue="Open"
- **Agent evaluation** (API only): ✅ PASS
- **Browser evaluation** (UI visible): ❌ FAIL

#### Screenshot 2: After Webhook, UI Consistent ✅

After webhook delivery (~1000ms later):

![After Webhook](demo-screenshots/05-after-webhook-ui-updated.png)

- **API canonical state**: PR merged=true, Issue open=false
- **Browser UI shows**: PR status="Merged", Issue="Closed"
- **Both evaluations**: ✅ PASS

---

## Why This Matters for Agent Evaluation

### Scenario: Autonomous Agent Making a Decision

```
Agent performs: mergePR(prId)
Backend API responds: 200 OK

Agent checks: "Is PR merged?"
Agent queries API: { merged: true }
Agent thinks: "Success, moving on!"

Meanwhile in the UI:
- User sees: "PR status: Open"
- User tries to merge again
- Duplicate merge attempt
- Or user sees outdated state and makes wrong decision
```

### What Tests Show

| Test Layer | Result | Catches Bug? |
|-----------|--------|-----------|
| **API-only tests** (Vitest) | ✅ PASS | ❌ NO |
| **Browser tests** (Playwright) | ❌ FAIL | ✅ YES |
| **Combined** | 🎯 Full picture | ✅ YES |

---

## Running the Demo

### 1. API-level test only (passes)

```bash
npm install --save-dev vitest
npx vitest run tests/demo-api.test.ts
```

**Result**: All assertions pass, API layer looks healthy.

### 2. Browser test (fails immediately)

```bash
npm install --save-dev vitest playwright
npx playwright install
npx vitest run tests/demo-browser.test.ts
```

**Result**: Test fails when checking UI state immediately after API success.

### 3. Visual demo with screenshots

```bash
npx ts-node demo/visual-demo.ts
```

**Result**: Opens browser, performs workflow, captures screenshots at each step showing the stale state.

---

## Implementation Details

### Backend Simulation

The backend immediately:
- Marks PR as merged in canonical state
- Closes linked issue
- **Enqueues webhook with 1000ms delay** (simulating eventual consistency)

```typescript
export async function mergePR(prId: number) {
  const pr = prs.find(p => p.id === prId)
  pr.merged = true
  issues[0].open = false
  
  // Webhook delivered asynchronously
  setTimeout(() => {
    deliver({ type: 'pr.merged', prId: pr.id })
  }, 1000)
  
  return { status: 200, body: pr }
}
```

### Frontend Cache

The UI maintains its own cache and only updates via webhooks:

```javascript
window.receiveWebhook = function(event) {
  if (event && event.type === 'pr.merged') {
    const pr = cache.prs.get(event.prId)
    if (pr) pr.merged = true
    cache.issue.open = false
    render()
  }
}
```

---

## Key Insights for AI Agent Evaluation

1. **API responses are not guarantees** — they reflect backend state, not necessarily what users see
2. **Webhooks and eventual consistency are real** — most production systems have delays
3. **Browser-level evaluation catches what API tests miss** — the mismatch only appears in the UI
4. **Autonomous agents need full-stack validation** — API success should trigger browser checks before proceeding

---

## Files

- `backend.ts` — In-memory backend with delayed webhook
- `ui.html` — Minimal static UI that renders from cache
- `visual-demo.ts` — Script that captures browser state at each step
- `tests/demo-api.test.ts` — Vitest test (passes)
- `tests/demo-browser.test.ts` — Playwright test (fails, demonstrating the mismatch)

---

**TL;DR**: API-only evals miss real failures. Browser-level evals catch them. This demo is a minimal, reproducible proof.
