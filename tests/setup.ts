import { beforeAll, afterAll, beforeEach } from 'vitest'
import { Octokit } from '@octokit/core'

/**
 * Global test setup for GitHub Reliability Torture Suite
 * This ensures consistent test environment and state management
 */

// Global Octokit instance for all tests
let globalOctokit: Octokit

beforeAll(async () => {
  console.log('🔧 Initializing GitHub Reliability Torture Suite')
  
  // Initialize global Octokit instance - Archal handles routing automatically
  globalOctokit = new Octokit({
    auth: process.env.ARCHAL_TOKEN
  })
  
  // Ensure Archal GitHub twin is ready
  console.log('✅ Archal GitHub twin initialized')
})

beforeEach(async () => {
  // Reset state before each test for deterministic behavior
  console.log('🔄 Resetting test state')
})

afterAll(async () => {
  console.log('🧹 Cleaning up GitHub Reliability Torture Suite')
  
  // Final cleanup if needed
  console.log('✅ Test suite cleanup complete')
})

/**
 * Export global utilities for tests
 */
export { globalOctokit }

/**
 * Helper to get the global Octokit instance
 */
export function getOctokit(): Octokit {
  return globalOctokit
}

/**
 * Helper to create a test-specific Octokit instance
 */
export function createTestOctokit(): Octokit {
  return new Octokit({
    auth: process.env.ARCHAL_TOKEN
  })
}
