import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { uploadMetadataSchema } from './upload.controller';

const requiredMetadata = {
  fullname: 'example.zip',
  displayTitle: 'Example',
  originalTitle: 'Example',
  tagUuids: [],
  pendingTags: [],
};

describe('upload metadata validation', () => {
  it('accepts and normalizes a null publish date from the web client', () => {
    const result = uploadMetadataSchema.parse({ ...requiredMetadata, publishDate: null });
    assert.equal(result.publishDate, undefined);
  });

  it('preserves a supplied publish date', () => {
    const result = uploadMetadataSchema.parse({ ...requiredMetadata, publishDate: '2026-08-22' });
    assert.equal(result.publishDate, '2026-08-22');
  });
});
