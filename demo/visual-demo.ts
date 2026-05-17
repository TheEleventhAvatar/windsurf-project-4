import * as backend from './backend.ts'
import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const screenshotDir = path.resolve(__dirname, '../demo-screenshots')

async function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

export async function runVisualDemo() {
  await ensureDir(screenshotDir)
  console.log(`📹 Visual demo starting. Screenshots saved to: ${screenshotDir}\n`)

  backend.reset()

  const html = fs.readFileSync(path.resolve(__dirname, './ui.html'), 'utf8')
  const browser = await chromium.launch({ headless: false })
  const page = await browser.newPage()

  try {
    // Set up webhook delivery to update UI
    backend.registerDeliver(async (event: any) => {
      console.log(`   [webhook] received: ${event.type}`)
      await page.evaluate(ev => (window as any).receiveWebhook(ev), event)
    })

    await page.setContent(html)

    // Step 1: Create issue
    console.log(`1️⃣  Creating issue...`)
    const issue = await backend.createIssue('bug: workflow broken')
    console.log(`   ✅ API returned: 201 (Created)`)
    console.log(`   Issue ID: ${issue.body.id}`)
    await page.waitForTimeout(300)
    try {
      await page.screenshot({ path: path.join(screenshotDir, '01-initial-ui.png') })
    } catch (e) {
      console.log(`   (screenshot skipped)`)
    }

    // Step 2: Create branch
    console.log(`\n2️⃣  Creating branch...`)
    const branch = await backend.createBranch('fix/1')
    console.log(`   ✅ API returned: 201 (Created)`)
    console.log(`   Branch: ${branch.body.name}`)
    await page.waitForTimeout(300)
    try {
      await page.screenshot({ path: path.join(screenshotDir, '02-after-branch.png') })
    } catch (e) {
      console.log(`   (screenshot skipped)`)
    }

    // Step 3: Open PR
    console.log(`\n3️⃣  Opening PR...`)
    const pr = await backend.openPR('Fix workflow bug', 'fix/1', issue.body.id)
    console.log(`   ✅ API returned: 201 (Created)`)
    console.log(`   PR ID: ${pr.body.id}`)
    // Register the PR in UI cache
    await page.evaluate(prId => (window as any).addPR(prId), pr.body.id)
    await page.waitForTimeout(300)
    try {
      await page.screenshot({ path: path.join(screenshotDir, '03-pr-opened.png') })
    } catch (e) {
      console.log(`   (screenshot skipped)`)
    }

    // Step 4: Merge PR
    console.log(`\n4️⃣  Merging PR...`)
    const merged = await backend.mergePR(pr.body.id)
    console.log(`   ✅ API returned: 200 (OK) — merge succeeded`)
    console.log(`   Canonical backend state: PR merged=true, Issue open=false`)

    // Check UI state IMMEDIATELY after merge (before webhook)
    console.log(`\n   📌 Checking UI state IMMEDIATELY after API merge...`)
    const statusImmediate = await page.textContent('#pr-1-status')
    console.log(`   UI shows: "${statusImmediate?.trim()}"`)
    console.log(`   ⚠️  MISMATCH! API says merged, but UI still shows: ${statusImmediate?.trim()}`)
    await page.waitForTimeout(300)
    try {
      await page.screenshot({
        path: path.join(screenshotDir, '04-after-merge-api-success-ui-stale.png'),
      })
    } catch (e) {
      console.log(`   (screenshot skipped)`)
    }

    // Wait for webhook (1000ms delay)
    console.log(`\n   ⏳ Waiting 1.2 seconds for webhook delivery...`)
    await page.waitForTimeout(1200)

    // Check UI state AFTER webhook
    console.log(`\n   📌 Checking UI state AFTER webhook delivery...`)
    const statusAfter = await page.textContent('#pr-1-status')
    console.log(`   UI now shows: "${statusAfter?.trim()}"`)
    console.log(`   ✅ UI is now consistent with backend`)
    await page.waitForTimeout(300)
    try {
      await page.screenshot({
        path: path.join(screenshotDir, '05-after-webhook-ui-updated.png'),
      })
    } catch (e) {
      console.log(`   (screenshot skipped)`)
    }

    // Final state
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    const finalState = backend.getState()
    console.log(`✅ Canonical Backend State (after merge):`)
    console.log(`   PR ${finalState.prs[0].id}: merged=${finalState.prs[0].merged}`)
    console.log(`   Issue ${finalState.issues[0].id}: open=${finalState.issues[0].open}`)
    console.log(`\n✅ Final Browser UI State:`)
    console.log(`   PR status: ${statusAfter?.trim()}`)
    console.log(`   Issue state: ${await page.textContent('#issue-state')}`)
    console.log(`\n🎯 Key Insight:`)
    console.log(`   • API success (200) was returned immediately`)
    console.log(`   • But UI remained stale for ~1000ms (webhook delay)`)
    console.log(`   • An agent checking only API responses would miss this!`)
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`)
    console.log(`📸 Screenshots saved to: ${screenshotDir}`)
  } finally {
    await browser.close()
  }
}

runVisualDemo().catch(console.error)
