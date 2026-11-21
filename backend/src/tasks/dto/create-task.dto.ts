import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IsValidCron } from '../../common/validators/cron.validator.js';
import { IsDiscordPayload } from '../../common/validators/discord-payload.validator.js';
import { IsDiscordWebhookUrl } from '../../common/validators/discord-webhook-url.validator.js';
import { IsValidTimezone } from '../../common/validators/timezone.validator.js';
import type { DiscordWebhookPayload } from '../../discord/discord.types.js';

export const TASK_STATUS_VALUES = ['ACTIVE', 'PAUSED', 'DISABLED'] as const;
export type TaskStatusValue = (typeof TASK_STATUS_VALUES)[number];

export class CreateTaskDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @IsValidCron()
  cronExpression!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @IsValidTimezone()
  timezone?: string;

  @IsString()
  @IsNotEmpty()
  @IsDiscordWebhookUrl()
  webhookUrl!: string;

  @IsDiscordPayload()
  payload!: DiscordWebhookPayload;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  maxRetry?: number;

  @IsOptional()
  @IsIn(TASK_STATUS_VALUES)
  status?: TaskStatusValue;
}
