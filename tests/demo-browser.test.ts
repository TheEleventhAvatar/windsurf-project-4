import { describe, it } from 'vitest'
import * as backend from '../demo/backend'
import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'

describe('Browser-visible flow (expected to fail)', () => {
  it('UI is stale immediately after merge (this assertion is intentionally optimistic)', async () => {
    backend.reset()

    const html = fs.readFileSync(path.resolve(__dirname, '../demo/ui.html'), 'utf8')

    const browser = await chromium.launch()
    const page = await browser.newPage()
    try {
      // make backend deliver webhooks by invoking page.receiveWebhook
      backend.registerDeliver(async (event: any) => {
        // deliver into page context
        await page.evaluate(ev => (window as any).receiveWebhook(ev), event)
      })

      // load UI (static) — the UI relies on webhooks to update state
      await page.setContent(html)

      // perform the workflow using the backend (API-level calls)
      const issue = await backend.createIssue('browser: bug')
      const branch = await backend.createBranch('fix/browser')
      const pr = await backend.openPR('Fix browser bug', 'fix/browser', issue.body.id)
      await backend.mergePR(pr.body.id)

      // Immediately assert the UI shows the PR as merged.
      // This is intentionally the *wrong* expectation — the webhook is delayed,
      // so the UI will still show "Open" and this assertion will fail,
      // illustrating that API-level success != immediate observable UI state.
      const status = await page.textContent('#pr-1-status')
      if (status?.trim() !== 'Merged') {
        // Make the test fail with a clear message rather than silently passing.
        throw new Error('UI did not show merged state yet — webhook delayed (demo failure)')
      }
    } finally {
      await browser.close()
    }
  }, { timeout: 20000 })
})
