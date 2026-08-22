import assert from 'node:assert/strict'
import test from 'node:test'
import { formatAppVersion } from './version'

test('keeps exactly one version prefix', () => {
  assert.equal(formatAppVersion('v0.5.0'), 'v0.5.0')
  assert.equal(formatAppVersion('0.5.0'), 'v0.5.0')
  assert.equal(formatAppVersion('vv0.5.0'), 'v0.5.0')
})

test('falls back to dev for an empty version', () => {
  assert.equal(formatAppVersion('  '), 'dev')
})
