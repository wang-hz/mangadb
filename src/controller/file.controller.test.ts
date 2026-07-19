import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { parsePageIndex, safeJoin } from './file.controller';

describe('file controller path checks', () => {
  it('resolves registered files inside the manga directory', () => {
    const base = path.join(path.sep, 'data', 'manga');
    assert.equal(safeJoin(base, 'pages/001.jpg'), path.join(base, 'pages', '001.jpg'));
  });

  it('rejects traversal and the manga directory itself', () => {
    const base = path.join(path.sep, 'data', 'manga');
    assert.equal(safeJoin(base, '../secret.jpg'), null);
    assert.equal(safeJoin(base, '.'), null);
  });

  it('requires page indexes to be complete non-negative integers', () => {
    assert.equal(parsePageIndex('0'), 0);
    assert.equal(parsePageIndex('001'), 1);
    assert.equal(parsePageIndex('1abc'), null);
    assert.equal(parsePageIndex('-1'), null);
    assert.equal(parsePageIndex('9007199254740992'), null);
  });
});
