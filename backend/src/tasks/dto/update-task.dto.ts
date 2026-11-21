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
import { TASK_STATUS_VALUES, type TaskStatusValue } from './create-task.dto.js';

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @IsValidCron()
  cronExpression?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @IsValidTimezone()
  timezone?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @IsDiscordWebhookUrl()
  webhookUrl?: string;

  @IsOptional()
  @IsDiscordPayload()
  payload?: DiscordWebhookPayload;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  maxRetry?: number;

  @IsOptional()
  @IsIn(TASK_STATUS_VALUES)
  status?: TaskStatusValue;
}
