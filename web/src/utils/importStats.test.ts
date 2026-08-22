import assert from 'node:assert/strict'
import test from 'node:test'
import { summarizeImportStatuses } from './importStats'

test('summarizes an empty import queue', () => {
  assert.deepEqual(summarizeImportStatuses([]), {
    total: 0, pending: 0, active: 0, success: 0, failed: 0,
  })
})

test('groups every import status into the visible summary', () => {
  assert.deepEqual(summarizeImportStatuses([
    'pending', 'paused', 'uploading', 'processing', 'done', 'done', 'error',
  ]), {
    total: 7, pending: 2, active: 2, success: 2, failed: 1,
  })
})
