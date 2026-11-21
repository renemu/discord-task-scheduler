import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { vi } from 'vitest';
import { ApiKeyGuard } from './api-key.guard.js';

function createMockContext(headers: Record<string, string | string[] | undefined>): ExecutionContext {
  return {
    getHandler: () => (() => undefined),
    getClass: () => class TestController {},
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as unknown as ExecutionContext;
}

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;
  let reflector: { getAllAndOverride: ReturnType<typeof vi.fn> };
  let configService: { get: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(false),
    };
    configService = {
      get: vi.fn().mockReturnValue('super-secret-test-key'),
    };
    guard = new ApiKeyGuard(
      reflector as unknown as Reflector,
      configService as unknown as ConfigService,
    );
  });

  it('allows requests to @Public() routes without an API key', () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const ctx = createMockContext({});

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows requests with a valid x-api-key header', () => {
    const ctx = createMockContext({ 'x-api-key': 'super-secret-test-key' });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('rejects requests when x-api-key header is missing', () => {
    const ctx = createMockContext({});

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('rejects requests when x-api-key header is empty whitespace', () => {
    const ctx = createMockContext({ 'x-api-key': '   ' });

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('rejects requests with an invalid API key', () => {
    const ctx = createMockContext({ 'x-api-key': 'wrong-api-key' });

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('rejects requests if server API_KEY is not configured', () => {
    configService.get.mockReturnValue(undefined);
    const ctx = createMockContext({ 'x-api-key': 'super-secret-test-key' });

    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });
});
