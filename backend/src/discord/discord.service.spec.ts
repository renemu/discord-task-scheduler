import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import { vi } from 'vitest';
import { DiscordService } from './discord.service.js';

const VALID_WEBHOOK =
  'https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz123456';

describe('DiscordService', () => {
  let service: DiscordService;
  let configValues: Record<string, unknown>;

  beforeEach(() => {
    vi.restoreAllMocks();
    configValues = {
      ALLOW_NON_DISCORD_WEBHOOKS: false,
      WEBHOOK_TIMEOUT_MS: 5_000,
    };
    const configService = {
      get: vi.fn((key: string) => configValues[key]),
    } as unknown as ConfigService;

    service = new DiscordService(configService);
  });

  it('returns success on HTTP 204 No Content', async () => {
    const postSpy = vi.spyOn(axios, 'post').mockResolvedValue({
      status: 204,
      headers: {},
      data: '',
    });

    const result = await service.sendWebhook(VALID_WEBHOOK, {
      content: 'Hello from scheduler!',
    });

    expect(postSpy).toHaveBeenCalledWith(
      VALID_WEBHOOK,
      { content: 'Hello from scheduler!' },
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json' },
        timeout: 5_000,
      }),
    );
    expect(result.success).toBe(true);
    expect(result.retryable).toBe(false);
    expect(result.httpStatus).toBe(204);
    expect(result.retryAfterMs).toBeNull();
  });

  it('marks HTTP 429 as retryable and extracts Retry-After header', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue({
      status: 429,
      headers: { 'retry-after': '2.5' },
      data: { message: 'You are being rate limited.' },
    });

    const result = await service.sendWebhook(VALID_WEBHOOK, {
      content: 'Rate limited',
    });

    expect(result.success).toBe(false);
    expect(result.retryable).toBe(true);
    expect(result.httpStatus).toBe(429);
    expect(result.retryAfterMs).toBe(2500);
  });

  it('extracts retry_after from JSON body on HTTP 429 when header absent', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue({
      status: 429,
      headers: {},
      data: { retry_after: 1.2 },
    });

    const result = await service.sendWebhook(VALID_WEBHOOK, {
      content: 'Rate limited',
    });

    expect(result.retryable).toBe(true);
    expect(result.retryAfterMs).toBe(1200);
  });

  it('marks HTTP 5xx server errors as retryable', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue({
      status: 503,
      headers: {},
      data: { message: 'Service Unavailable' },
    });

    const result = await service.sendWebhook(VALID_WEBHOOK, {
      content: 'Server error test',
    });

    expect(result.success).toBe(false);
    expect(result.retryable).toBe(true);
    expect(result.httpStatus).toBe(503);
    expect(result.message).toContain('HTTP 503');
  });

  it.each([400, 401, 403, 404])(
    'marks HTTP %i client error as non-retryable',
    async (status) => {
      vi.spyOn(axios, 'post').mockResolvedValue({
        status,
        headers: {},
        data: { message: 'Client error' },
      });

      const result = await service.sendWebhook(VALID_WEBHOOK, {
        content: 'Client error test',
      });

      expect(result.success).toBe(false);
      expect(result.retryable).toBe(false);
      expect(result.httpStatus).toBe(status);
    },
  );

  it('marks network timeouts as retryable with null httpStatus', async () => {
    const timeoutErr = new AxiosError('timeout of 5000ms exceeded', 'ECONNABORTED');
    vi.spyOn(axios, 'post').mockRejectedValue(timeoutErr);

    const result = await service.sendWebhook(VALID_WEBHOOK, {
      content: 'Timeout test',
    });

    expect(result.success).toBe(false);
    expect(result.retryable).toBe(true);
    expect(result.httpStatus).toBeNull();
    expect(result.message).toContain('timed out');
  });

  it('blocks disallowed non-Discord URLs (SSRF protection)', async () => {
    const postSpy = vi.spyOn(axios, 'post');

    const result = await service.sendWebhook('http://169.254.169.254/latest/meta-data/', {
      content: 'SSRF attempt',
    });

    expect(postSpy).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.retryable).toBe(false);
    expect(result.message).toContain('Blocked webhook URL');
  });
});
