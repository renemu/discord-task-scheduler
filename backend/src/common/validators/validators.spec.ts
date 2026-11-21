import {
  computeNextRunAt,
  isValidCronExpression,
  isValidTimezone,
} from '../utils/cron.util.js';
import {
  isAllowedDiscordWebhookUrl,
  maskWebhookUrl,
} from '../utils/webhook.util.js';
import { isValidDiscordPayload } from './discord-payload.validator.js';

describe('Common Validators & Utils', () => {
  describe('cron.util', () => {
    it('validates standard 5-field and 6-field cron expressions', () => {
      expect(isValidCronExpression('*/5 * * * *')).toBe(true);
      expect(isValidCronExpression('0 9 * * 1-5', 'Asia/Jakarta')).toBe(true);
      expect(isValidCronExpression('not-a-cron')).toBe(false);
      expect(isValidCronExpression('')).toBe(false);
    });

    it('validates IANA timezones', () => {
      expect(isValidTimezone('UTC')).toBe(true);
      expect(isValidTimezone('Asia/Jakarta')).toBe(true);
      expect(isValidTimezone('Invalid/Zone')).toBe(false);
    });

    it('computes nextRunAt in UTC accurately', () => {
      const from = new Date('2026-11-21T04:00:00.000Z');
      const next = computeNextRunAt('0 5 * * *', 'UTC', from);
      expect(next.toISOString()).toBe('2026-11-21T05:00:00.000Z');
    });
  });

  describe('webhook.util', () => {
    const valid =
      'https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz123456';

    it('accepts valid Discord webhook URLs and rejects SSRF targets', () => {
      expect(isAllowedDiscordWebhookUrl(valid)).toBe(true);
      expect(
        isAllowedDiscordWebhookUrl('http://localhost:8080/webhook', false),
      ).toBe(false);
      expect(
        isAllowedDiscordWebhookUrl('http://127.0.0.1:8080/webhook', true),
      ).toBe(true);
      expect(
        isAllowedDiscordWebhookUrl('http://169.254.169.254/latest/meta-data/', true),
      ).toBe(false);
      expect(
        isAllowedDiscordWebhookUrl('https://evil.example.com/api/webhooks/1/2'),
      ).toBe(false);
    });

    it('masks webhook tokens safely', () => {
      expect(maskWebhookUrl(valid)).toBe(
        'https://discord.com/api/webhooks/123456789012345678/***',
      );
      expect(maskWebhookUrl('not-a-url')).toBe('***');
    });
  });

  describe('discord-payload.validator', () => {
    it('accepts valid content or embeds payloads', () => {
      expect(isValidDiscordPayload({ content: 'Hello!' })).toBe(true);
      expect(
        isValidDiscordPayload({ embeds: [{ title: 'Alert', description: 'OK' }] }),
      ).toBe(true);
    });

    it('rejects empty, oversized, or non-object payloads', () => {
      expect(isValidDiscordPayload({})).toBe(false);
      expect(isValidDiscordPayload({ content: '   ' })).toBe(false);
      expect(isValidDiscordPayload({ content: 'a'.repeat(2001) })).toBe(false);
      expect(isValidDiscordPayload([])).toBe(false);
      expect(isValidDiscordPayload(null)).toBe(false);
    });
  });
});
