import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { isRegisteredPage, safeJoin } from './file.controller';

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

  it('only accepts filenames registered in the page manifest', () => {
    const pages = ['001.jpg', 'nested/002.png'];
    assert.equal(isRegisteredPage(pages, '001.jpg'), true);
    assert.equal(isRegisteredPage(pages, 'nested/002.png'), true);
    assert.equal(isRegisteredPage(pages, 'notes.txt'), false);
  });
});
