import {
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { and, or } from '@prisma/orm-postgres/orm-client';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { computeNextRunAt } from '../common/utils/cron.util.js';
import { DiscordService } from '../discord/discord.service.js';
import type { DiscordDeliveryResult } from '../discord/discord.types.js';
import type { FieldOutputTypes } from '../prisma/contract.d.js';
import { PrismaService } from '../prisma/prisma.service.js';

type TaskRow = {
  id: string;
  name: string;
  cronExpression: string;
  timezone: string;
  webhookUrl: string;
  payload: FieldOutputTypes['public']['Task']['payload'];
  maxRetry: number;
  status: FieldOutputTypes['public']['Task']['status'];
  nextRunAt: Date | null;
  lastRunAt: Date | null;
  lastExecutionStatus: FieldOutputTypes['public']['Task']['lastExecutionStatus'];
  retryCount: number;
  lockedAt: Date | null;
  lockedBy: string | null;
};

export interface ManualExecutionResult {
  taskId: string;
  executionId: string;
  status: 'SUCCESS' | 'FAILED';
  retryCount: number;
  httpStatus: number | null;
  durationMs: number;
  message: string;
  executedAt: Date;
}

function isUniqueConstraintError(error: unknown): boolean {
  let current: unknown = error;
  while (current && typeof current === 'object') {
    const rec = current as Record<string, unknown>;
    if (rec['code'] === '23505') {
      return true;
    }
    current = rec['cause'];
  }
  return false;
}

@Injectable()
export class SchedulerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SchedulerService.name);
  private readonly workerId = `${hostname()}:${process.pid}`;
  private isPolling = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly discordService: DiscordService,
    private readonly configService: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.configService.get<string>('NODE_ENV') === 'test') {
      return;
    }
    try {
      await this.recoverOnStartup();
    } catch (error: unknown) {
      this.logger.error(
        `Scheduler startup recovery failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async recoverOnStartup(now: Date = new Date()): Promise<number> {
    const leaseMs =
      this.configService.get<number>('SCHEDULER_LEASE_MS') ?? 300_000;
    const staleCutoff = new Date(now.getTime() - leaseMs);

    const staleTasks = await this.prisma.orm.public.Task.where((t) =>
      and(t.lockedAt.isNotNull(), t.lockedAt.lt(staleCutoff)),
    ).all();

    for (const task of staleTasks) {
      await this.prisma.orm.public.Task.where({ id: task.id }).update({
        lockedAt: null,
        lockedBy: null,
      });
    }

    // Hydrate any ACTIVE task missing nextRunAt
    const unscheduledActive = await this.prisma.orm.public.Task.where((t) =>
      and(t.status.eq('ACTIVE'), t.nextRunAt.isNull()),
    ).all();

    for (const task of unscheduledActive) {
      try {
        const nextRunAt = computeNextRunAt(
          task.cronExpression,
          task.timezone,
          now,
        );
        await this.prisma.orm.public.Task.where({ id: task.id }).update({
          nextRunAt,
        });
      } catch (err: unknown) {
        this.logger.error(
          `Invalid cron expression for task ${task.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (staleTasks.length > 0 || unscheduledActive.length > 0) {
      this.logger.log(
        `Startup recovery complete: released ${staleTasks.length} stale lease(s), hydrated ${unscheduledActive.length} task(s)`,
      );
    }

    return staleTasks.length + unscheduledActive.length;
  }

  @Cron('*/5 * * * * *')
  async handleCronTick(): Promise<void> {
    if (this.configService.get<string>('NODE_ENV') === 'test') {
      return;
    }
    await this.pollAndExecuteDueTasks();
  }

  async pollAndExecuteDueTasks(now: Date = new Date()): Promise<number> {
    if (this.isPolling) {
      return 0;
    }

    this.isPolling = true;
    try {
      const claimed = await this.claimDueTasks(now);
      if (claimed.length === 0) {
        return 0;
      }

      // Execute claimed tasks concurrently without blocking unrelated tasks
      await Promise.allSettled(
        claimed.map((task) => this.executeClaimedTask(task)),
      );

      return claimed.length;
    } finally {
      this.isPolling = false;
    }
  }

  async claimDueTasks(now: Date = new Date()): Promise<TaskRow[]> {
    const batchSize =
      this.configService.get<number>('SCHEDULER_BATCH_SIZE') ?? 20;
    const leaseMs =
      this.configService.get<number>('SCHEDULER_LEASE_MS') ?? 300_000;
    const staleCutoff = new Date(now.getTime() - leaseMs);

    return this.prisma.transaction(async (tx) => {
      const dueTasks = await tx.orm.public.Task.where((t) =>
        and(
          t.status.eq('ACTIVE'),
          t.nextRunAt.isNotNull(),
          t.nextRunAt.lte(now),
          or(t.lockedAt.isNull(), t.lockedAt.lt(staleCutoff)),
        ),
      )
        .orderBy((t) => t.nextRunAt.asc())
        .limit(batchSize)
        .forNoKeyUpdate({ skipLocked: true })
        .all();

      const claimed: TaskRow[] = [];
      for (const task of dueTasks) {
        await tx.orm.public.Task.where({ id: task.id }).update({
          lockedAt: now,
          lockedBy: this.workerId,
          lastExecutionStatus: 'RUNNING',
        });
        claimed.push({
          ...task,
          lockedAt: now,
          lockedBy: this.workerId,
          lastExecutionStatus: 'RUNNING',
        });
      }

      return claimed;
    });
  }

  async executeClaimedTask(
    task: TaskRow,
    nowProvider: () => Date = () => new Date(),
  ): Promise<DiscordDeliveryResult> {
    const scheduledFor = task.nextRunAt;
    const currentRetry = task.retryCount;
    const executionId = await this.resolveExecutionId(task.id, currentRetry);

    const payloadObj =
      typeof task.payload === 'object' &&
      task.payload !== null &&
      !Array.isArray(task.payload)
        ? (task.payload as Record<string, unknown>)
        : {};

    // Perform HTTP I/O strictly outside any database transaction
    const delivery = await this.discordService.sendWebhook(
      task.webhookUrl,
      payloadObj,
    );

    const finishedAt = nowProvider();
    const shouldRetry =
      !delivery.success &&
      delivery.retryable &&
      currentRetry < task.maxRetry;

    const logStatus: 'SUCCESS' | 'RETRYING' | 'FAILED' = delivery.success
      ? 'SUCCESS'
      : shouldRetry
        ? 'RETRYING'
        : 'FAILED';

    let nextRunAt: Date | null = null;
    if (shouldRetry) {
      const delayMs = this.computeRetryDelayMs(
        currentRetry,
        delivery.retryAfterMs,
      );
      nextRunAt = new Date(finishedAt.getTime() + delayMs);
    } else if (task.status === 'ACTIVE') {
      try {
        nextRunAt = computeNextRunAt(
          task.cronExpression,
          task.timezone,
          finishedAt,
        );
      } catch (err: unknown) {
        this.logger.error(
          `Failed to compute nextRunAt for task ${task.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
        nextRunAt = null;
      }
    }

    const nextRetryCount = shouldRetry ? currentRetry + 1 : 0;

    try {
      await this.prisma.transaction(async (tx) => {
        await tx.orm.public.TaskLog.create({
          taskId: task.id,
          executionId,
          scheduledFor,
          executedAt: finishedAt,
          status: logStatus,
          retryCount: currentRetry,
          httpStatus: delivery.httpStatus,
          durationMs: delivery.durationMs,
          message: delivery.message,
        });

        await tx.orm.public.Task.where({ id: task.id }).update({
          retryCount: nextRetryCount,
          lastRunAt: finishedAt,
          lastExecutionStatus: logStatus,
          nextRunAt,
          lockedAt: null,
          lockedBy: null,
        });
      });
    } catch (error: unknown) {
      if (isUniqueConstraintError(error)) {
        this.logger.warn(
          `Duplicate scheduled execution prevented by idempotency constraint for task ${task.id} (retry=${currentRetry})`,
        );
        await this.prisma.orm.public.Task.where({ id: task.id }).update({
          lockedAt: null,
          lockedBy: null,
        });
        return delivery;
      }
      throw error;
    }

    return delivery;
  }

  async executeTaskManually(taskId: string): Promise<ManualExecutionResult> {
    const task = await this.prisma.orm.public.Task.first({ id: taskId });
    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    const executionId = randomUUID();
    const payloadObj =
      typeof task.payload === 'object' &&
      task.payload !== null &&
      !Array.isArray(task.payload)
        ? (task.payload as Record<string, unknown>)
        : {};

    let attempt = 0;
    let finalDelivery: DiscordDeliveryResult | null = null;
    let executedAt = new Date();

    while (attempt <= task.maxRetry) {
      const delivery = await this.discordService.sendWebhook(
        task.webhookUrl,
        payloadObj,
      );
      executedAt = new Date();

      const willRetry =
        !delivery.success && delivery.retryable && attempt < task.maxRetry;
      const logStatus: 'SUCCESS' | 'RETRYING' | 'FAILED' = delivery.success
        ? 'SUCCESS'
        : willRetry
          ? 'RETRYING'
          : 'FAILED';

      await this.prisma.transaction(async (tx) => {
        await tx.orm.public.TaskLog.create({
          taskId: task.id,
          executionId,
          scheduledFor: null,
          executedAt,
          status: logStatus,
          retryCount: attempt,
          httpStatus: delivery.httpStatus,
          durationMs: delivery.durationMs,
          message: delivery.message,
        });

        await tx.orm.public.Task.where({ id: task.id }).update({
          lastRunAt: executedAt,
          lastExecutionStatus: logStatus,
        });
      });

      finalDelivery = delivery;

      if (!willRetry) {
        break;
      }

      const delayMs = this.computeRetryDelayMs(attempt, delivery.retryAfterMs);
      await this.sleep(Math.min(delayMs, 5_000));
      attempt += 1;
    }

    const result = finalDelivery!;
    return {
      taskId: task.id,
      executionId,
      status: result.success ? 'SUCCESS' : 'FAILED',
      retryCount: attempt,
      httpStatus: result.httpStatus,
      durationMs: result.durationMs,
      message: result.message,
      executedAt,
    };
  }

  computeRetryDelayMs(
    currentRetry: number,
    retryAfterMs: number | null,
  ): number {
    const baseDelayMs =
      this.configService.get<number>('RETRY_BASE_DELAY_MS') ?? 2_000;
    const maxDelayMs =
      this.configService.get<number>('RETRY_MAX_DELAY_MS') ?? 60_000;

    if (retryAfterMs !== null && retryAfterMs > 0) {
      return Math.min(retryAfterMs, maxDelayMs);
    }

    const exponential = baseDelayMs * Math.pow(2, currentRetry);
    return Math.min(exponential, maxDelayMs);
  }

  private async resolveExecutionId(
    taskId: string,
    currentRetry: number,
  ): Promise<string> {
    if (currentRetry > 0) {
      const previousRetryLog = await this.prisma.orm.public.TaskLog.where((l) =>
        and(l.taskId.eq(taskId), l.status.eq('RETRYING')),
      )
        .orderBy((l) => l.executedAt.desc())
        .first();

      if (previousRetryLog) {
        return previousRetryLog.executionId;
      }
    }
    return randomUUID();
  }

  protected async sleep(ms: number): Promise<void> {
    if (ms <= 0) {
      return;
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
