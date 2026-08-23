import assert from 'node:assert/strict'
import test from 'node:test'
import { acknowledgeCompletedImport, removeCompletedImportSessions } from './importSessionCleanup'

test('acknowledges a completed import without surfacing cleanup failures', async () => {
  assert.equal(await acknowledgeCompletedImport('ok', async () => {}), true)
  assert.equal(await acknowledgeCompletedImport('failed', async () => { throw new Error('offline') }), false)
})

test('removes only completed imports whose server cleanup succeeded', async () => {
  const result = await removeCompletedImportSessions([
    { id: 'local', status: 'done' },
    { id: 'deleted', status: 'done', uploadId: 'deleted-upload' },
    { id: 'failed', status: 'done', uploadId: 'failed-upload' },
    { id: 'active', status: 'uploading', uploadId: 'active-upload' },
  ], async uploadId => {
    if (uploadId === 'failed-upload') throw new Error('offline')
  })
  assert.deepEqual(result.removedIds, ['local', 'deleted'])
  assert.deepEqual(result.failedIds, ['failed'])
})
