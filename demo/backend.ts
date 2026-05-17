type DeliverFn = (event: any) => void;

interface Issue { id: number; title: string; open: boolean }
interface Branch { name: string }
interface PR { id: number; title: string; branch: string; merged: boolean }

let issues: Issue[] = []
let branches: Branch[] = []
let prs: PR[] = []
let nextId = 1

let deliver: DeliverFn = () => {}

export function reset() {
  issues = []
  branches = []
  prs = []
  nextId = 1
  deliver = () => {}
}

export function registerDeliver(fn: DeliverFn) {
  deliver = fn
}

export async function createIssue(title: string) {
  const issue: Issue = { id: nextId++, title, open: true }
  issues.push(issue)
  return { status: 201, body: issue }
}

export async function createBranch(name: string) {
  const branch: Branch = { name }
  branches.push(branch)
  return { status: 201, body: branch }
}

export async function openPR(title: string, branch: string, issueId?: number) {
  const pr: PR = { id: nextId++, title, branch, merged: false }
  prs.push(pr)
  return { status: 201, body: pr }
}

// Merge PR immediately in canonical backend, but send webhook asynchronously.
export async function mergePR(prId: number) {
  const pr = prs.find(p => p.id === prId)
  if (!pr) return { status: 404 }
  pr.merged = true

  // Simulate side-effect: close linked issue if any (naive for demo)
  const linked = issues[0]
  if (linked) linked.open = false

  // Enqueue webhook with delay. Delivery may be delayed or duplicated.
  const event = { type: 'pr.merged', prId: pr.id, timestamp: Date.now() }
  // deliver after a delay (1000ms) to simulate eventual consistency
  setTimeout(() => {
    try { deliver(event) } catch (e) {}
  }, 1000)

  return { status: 200, body: pr }
}

export function getState() {
  return { issues: JSON.parse(JSON.stringify(issues)), branches: JSON.parse(JSON.stringify(branches)), prs: JSON.parse(JSON.stringify(prs)) }
}

export default { reset, registerDeliver, createIssue, createBranch, openPR, mergePR, getState }
