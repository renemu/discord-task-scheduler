import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  isAllowedDiscordWebhookUrl,
  maskWebhookUrl,
} from '../common/utils/webhook.util.js';
import type {
  DiscordDeliveryResult,
  DiscordWebhookPayload,
} from './discord.types.js';

const MAX_ERROR_MESSAGE_LENGTH = 500;
const MAX_RETRY_AFTER_MS = 60_000;

@Injectable()
export class DiscordService {
  private readonly logger = new Logger(DiscordService.name);

  constructor(private readonly configService: ConfigService) {}

  async sendWebhook(
    webhookUrl: string,
    payload: DiscordWebhookPayload | Record<string, unknown>,
  ): Promise<DiscordDeliveryResult> {
    const startedAt = Date.now();
    const allowNonDiscord =
      this.configService.get<boolean>('ALLOW_NON_DISCORD_WEBHOOKS') ?? false;
    const timeoutMs =
      this.configService.get<number>('WEBHOOK_TIMEOUT_MS') ?? 10_000;
    const maskedUrl = maskWebhookUrl(webhookUrl);

    if (!isAllowedDiscordWebhookUrl(webhookUrl, allowNonDiscord)) {
      this.logger.warn(`Blocked disallowed webhook URL: ${maskedUrl}`);
      return {
        success: false,
        retryable: false,
        httpStatus: null,
        durationMs: Date.now() - startedAt,
        message: 'Blocked webhook URL: not an allowed Discord webhook endpoint',
        retryAfterMs: null,
      };
    }

    try {
      const response = await axios.post(webhookUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: timeoutMs,
        validateStatus: () => true,
      });

      const durationMs = Date.now() - startedAt;
      const status = response.status;

      if (status >= 200 && status < 300) {
        return {
          success: true,
          retryable: false,
          httpStatus: status,
          durationMs,
          message: `Discord webhook delivered successfully (HTTP ${status})`,
          retryAfterMs: null,
        };
      }

      if (status === 429) {
        const retryAfterMs = this.extractRetryAfterMs(
          response.headers as Record<string, unknown>,
          response.data,
        );
        const message = retryAfterMs
          ? `Discord rate limited (HTTP 429); retry after ${retryAfterMs}ms`
          : 'Discord rate limited (HTTP 429)';

        this.logger.warn(`${message} for ${maskedUrl}`);
        return {
          success: false,
          retryable: true,
          httpStatus: status,
          durationMs,
          message,
          retryAfterMs,
        };
      }

      const snippet = this.extractErrorSnippet(response.data);
      const detail = snippet ? `: ${snippet}` : '';

      if (status >= 500) {
        const message = `Discord server error (HTTP ${status})${detail}`;
        this.logger.warn(`${message} for ${maskedUrl}`);
        return {
          success: false,
          retryable: true,
          httpStatus: status,
          durationMs,
          message,
          retryAfterMs: null,
        };
      }

      // 400, 401, 403, 404, and other 4xx client errors are non-retryable
      const message = `Discord client error (HTTP ${status})${detail}`;
      this.logger.warn(`${message} for ${maskedUrl}`);
      return {
        success: false,
        retryable: false,
        httpStatus: status,
        durationMs,
        message,
        retryAfterMs: null,
      };
    } catch (error: unknown) {
      const durationMs = Date.now() - startedAt;
      const reason = this.formatNetworkError(error);
      this.logger.warn(
        `Discord webhook network failure for ${maskedUrl}: ${reason}`,
      );
      return {
        success: false,
        retryable: true,
        httpStatus: null,
        durationMs,
        message: reason,
        retryAfterMs: null,
      };
    }
  }

  private extractRetryAfterMs(
    headers: Record<string, unknown>,
    body: unknown,
  ): number | null {
    const headerVal = headers['retry-after'] ?? headers['Retry-After'];
    if (headerVal !== undefined && headerVal !== null) {
      const numeric = Number(
        Array.isArray(headerVal) ? headerVal[0] : headerVal,
      );
      if (Number.isFinite(numeric) && numeric > 0) {
        const ms = Math.ceil(numeric * 1000);
        return Math.min(ms, MAX_RETRY_AFTER_MS);
      }
    }

    if (typeof body === 'object' && body !== null && 'retry_after' in body) {
      const retryAfter = Number(
        (body as Record<string, unknown>)['retry_after'],
      );
      if (Number.isFinite(retryAfter) && retryAfter > 0) {
        const ms = Math.ceil(retryAfter * 1000);
        return Math.min(ms, MAX_RETRY_AFTER_MS);
      }
    }

    return null;
  }

  private extractErrorSnippet(body: unknown): string {
    if (!body) {
      return '';
    }
    if (typeof body === 'string') {
      return body.slice(0, MAX_ERROR_MESSAGE_LENGTH);
    }
    if (typeof body === 'object') {
      const record = body as Record<string, unknown>;
      if (typeof record['message'] === 'string') {
        return record['message'].slice(0, MAX_ERROR_MESSAGE_LENGTH);
      }
      try {
        return JSON.stringify(body).slice(0, MAX_ERROR_MESSAGE_LENGTH);
      } catch {
        return '';
      }
    }
    return '';
  }

  private formatNetworkError(error: unknown): string {
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        return `Discord webhook request timed out (${error.code})`;
      }
      const code = error.code ? ` (${error.code})` : '';
      return `Discord webhook network error${code}: ${error.message}`.slice(
        0,
        MAX_ERROR_MESSAGE_LENGTH,
      );
    }
    if (error instanceof Error) {
      return `Discord webhook request failed: ${error.message}`.slice(
        0,
        MAX_ERROR_MESSAGE_LENGTH,
      );
    }
    return 'Discord webhook request failed due to unknown network error';
  }
}
