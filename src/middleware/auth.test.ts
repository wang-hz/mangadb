import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { NextFunction, Request, Response } from 'express';
import { requireAdmin } from './auth';

type CapturedResponse = {
  statusCode?: number;
  body?: unknown;
};

function createResponse(captured: CapturedResponse): Response {
  const response = {
    status(code: number) {
      captured.statusCode = code;
      return response;
    },
    json(body: unknown) {
      captured.body = body;
      return response;
    },
  };
  return response as unknown as Response;
}

function createRequest(role?: string): Request {
  return {
    headers: {},
    cookies: {},
    ...(role ? {
      user: {
        sub: 'tester',
        uuid: 'user-uuid',
        role,
        jti: 'token-id',
      },
    } : {}),
  } as Request;
}

describe('requireAdmin', () => {
  it('reuses an authenticated administrator from requireAuth', async () => {
    const captured: CapturedResponse = {};
    let nextCalled = false;

    await requireAdmin(
      createRequest('admin'),
      createResponse(captured),
      (() => { nextCalled = true; }) as NextFunction,
    );

    assert.equal(nextCalled, true);
    assert.equal(captured.statusCode, undefined);
  });

  it('rejects an authenticated non-admin user', async () => {
    const captured: CapturedResponse = {};
    let nextCalled = false;

    await requireAdmin(
      createRequest('user'),
      createResponse(captured),
      (() => { nextCalled = true; }) as NextFunction,
    );

    assert.equal(nextCalled, false);
    assert.equal(captured.statusCode, 403);
    assert.deepEqual(captured.body, { error: 'Forbidden' });
  });

  it('rejects a request without authentication', async () => {
    const captured: CapturedResponse = {};

    await requireAdmin(
      createRequest(),
      createResponse(captured),
      (() => assert.fail('next should not be called')) as NextFunction,
    );

    assert.equal(captured.statusCode, 401);
    assert.deepEqual(captured.body, { error: 'Unauthorized' });
  });
});
