import { describe, it, expect } from 'vitest'
import * as backend from '../demo/backend'

describe('API-level flow (passes)', () => {
  it('completes workflow at API layer', async () => {
    backend.reset()
    const issue = await backend.createIssue('bug: broken')
    expect(issue.status).toBe(201)

    const branch = await backend.createBranch('fix/1')
    expect(branch.status).toBe(201)

    const pr = await backend.openPR('Fix bug', 'fix/1', issue.body.id)
    expect(pr.status).toBe(201)

    const merged = await backend.mergePR(pr.body.id)
    expect(merged.status).toBe(200)

    const state = backend.getState()
    // API-level canonical state shows the PR merged and issue closed
    expect(state.prs[0].merged).toBe(true)
    expect(state.issues[0].open).toBe(false)
  })
})
