import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { vi } from 'vitest';
import type { DiscordService } from '../discord/discord.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { SchedulerService } from './scheduler.service.js';

function makeClaimedTask(overrides: Record<string, unknown> = {}) {
  return {
    id: '01a1fc1f-6f18-7419-bdf4-83d216b276be',
    name: 'Hourly Health Ping',
    cronExpression: '0 * * * *',
    timezone: 'UTC',
    webhookUrl:
      'https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz123456',
    payload: { content: 'Ping!' },
    maxRetry: 3,
    status: 'ACTIVE' as const,
    nextRunAt: new Date('2026-11-21T04:00:00.000Z'),
    lastRunAt: null,
    lastExecutionStatus: 'RUNNING' as const,
    retryCount: 0,
    lockedAt: new Date('2026-11-21T04:00:01.000Z'),
    lockedBy: 'worker:1',
    ...overrides,
  };
}

describe('SchedulerService', () => {
  let service: SchedulerService;
  let taskCollection: Record<string, ReturnType<typeof vi.fn>>;
  let taskLogCollection: Record<string, ReturnType<typeof vi.fn>>;
  let prisma: {
    orm: { public: { Task: unknown; TaskLog: unknown } };
    transaction: ReturnType<typeof vi.fn>;
  };
  let discordService: { sendWebhook: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    taskCollection = {
      where: vi.fn(),
      orderBy: vi.fn(),
      limit: vi.fn(),
      forNoKeyUpdate: vi.fn(),
      all: vi.fn().mockResolvedValue([]),
      first: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    };
    taskCollection.where.mockReturnValue(taskCollection);
    taskCollection.orderBy.mockReturnValue(taskCollection);
    taskCollection.limit.mockReturnValue(taskCollection);
    taskCollection.forNoKeyUpdate.mockReturnValue(taskCollection);

    taskLogCollection = {
      where: vi.fn(),
      orderBy: vi.fn(),
      first: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    };
    taskLogCollection.where.mockReturnValue(taskLogCollection);
    taskLogCollection.orderBy.mockReturnValue(taskLogCollection);

    prisma = {
      orm: {
        public: {
          Task: taskCollection,
          TaskLog: taskLogCollection,
        },
      },
      transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          orm: {
            public: {
              Task: taskCollection,
              TaskLog: taskLogCollection,
            },
          },
        }),
      ),
    };

    discordService = {
      sendWebhook: vi.fn(),
    };

    const configValues: Record<string, unknown> = {
      NODE_ENV: 'test',
      SCHEDULER_BATCH_SIZE: 10,
      SCHEDULER_LEASE_MS: 300_000,
      RETRY_BASE_DELAY_MS: 2_000,
      RETRY_MAX_DELAY_MS: 60_000,
    };
    const configService = {
      get: vi.fn((key: string) => configValues[key]),
    } as unknown as ConfigService;

    service = new SchedulerService(
      prisma as unknown as PrismaService,
      discordService as unknown as DiscordService,
      configService,
    );
    vi.spyOn(
      service as unknown as { sleep: (ms: number) => Promise<void> },
      'sleep',
    ).mockResolvedValue();
  });

  it('claims due active tasks using FOR NO KEY UPDATE SKIP LOCKED and sets worker lease', async () => {
    const due = makeClaimedTask({ lockedAt: null, lockedBy: null });
    taskCollection.all.mockResolvedValue([due]);
    const now = new Date('2026-11-21T04:00:05.000Z');

    const claimed = await service.claimDueTasks(now);

    expect(taskCollection.forNoKeyUpdate).toHaveBeenCalledWith({
      skipLocked: true,
    });
    expect(taskCollection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        lockedAt: now,
        lastExecutionStatus: 'RUNNING',
      }),
    );
    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.id).toBe(due.id);
  });

  it('records SUCCESS log, resets retryCount, clears lock, and schedules next cron run', async () => {
    const task = makeClaimedTask({ retryCount: 1 });
    taskLogCollection.first.mockResolvedValue({
      executionId: '01a1fc1f-0000-7000-8000-000000000001',
    });
    discordService.sendWebhook.mockResolvedValue({
      success: true,
      retryable: false,
      httpStatus: 204,
      durationMs: 42,
      message: 'Discord webhook delivered successfully (HTTP 204)',
      retryAfterMs: null,
    });
    const fixedNow = new Date('2026-11-21T04:05:00.000Z');

    await service.executeClaimedTask(task, () => fixedNow);

    expect(taskLogCollection.create).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: task.id,
        executionId: '01a1fc1f-0000-7000-8000-000000000001',
        status: 'SUCCESS',
        retryCount: 1,
        httpStatus: 204,
        durationMs: 42,
      }),
    );
    expect(taskCollection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        retryCount: 0,
        lastRunAt: fixedNow,
        lastExecutionStatus: 'SUCCESS',
        nextRunAt: new Date('2026-11-21T05:00:00.000Z'),
        lockedAt: null,
        lockedBy: null,
      }),
    );
  });

  it('schedules retry with exponential backoff when retryable failure occurs below maxRetry', async () => {
    const task = makeClaimedTask({ retryCount: 0, maxRetry: 3 });
    discordService.sendWebhook.mockResolvedValue({
      success: false,
      retryable: true,
      httpStatus: 503,
      durationMs: 120,
      message: 'Discord server error (HTTP 503)',
      retryAfterMs: null,
    });
    const fixedNow = new Date('2026-11-21T04:00:00.000Z');

    await service.executeClaimedTask(task, () => fixedNow);

    expect(taskLogCollection.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'RETRYING',
        retryCount: 0,
        httpStatus: 503,
      }),
    );
    expect(taskCollection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        retryCount: 1,
        lastExecutionStatus: 'RETRYING',
        nextRunAt: new Date('2026-11-21T04:00:02.000Z'), // baseDelay 2000ms * 2^0
        lockedAt: null,
        lockedBy: null,
      }),
    );
  });

  it('respects Discord 429 retryAfterMs when scheduling next retry', async () => {
    const task = makeClaimedTask({ retryCount: 1, maxRetry: 3 });
    discordService.sendWebhook.mockResolvedValue({
      success: false,
      retryable: true,
      httpStatus: 429,
      durationMs: 80,
      message: 'Discord rate limited (HTTP 429)',
      retryAfterMs: 7_500,
    });
    const fixedNow = new Date('2026-11-21T04:00:00.000Z');

    await service.executeClaimedTask(task, () => fixedNow);

    expect(taskCollection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        retryCount: 2,
        lastExecutionStatus: 'RETRYING',
        nextRunAt: new Date('2026-11-21T04:00:07.500Z'),
      }),
    );
  });

  it('stops retrying and records FAILED when maxRetry limit is reached', async () => {
    const task = makeClaimedTask({ retryCount: 2, maxRetry: 2 });
    discordService.sendWebhook.mockResolvedValue({
      success: false,
      retryable: true,
      httpStatus: 500,
      durationMs: 90,
      message: 'Discord server error (HTTP 500)',
      retryAfterMs: null,
    });
    const fixedNow = new Date('2026-11-21T04:10:00.000Z');

    await service.executeClaimedTask(task, () => fixedNow);

    expect(taskLogCollection.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'FAILED',
        retryCount: 2,
        httpStatus: 500,
      }),
    );
    expect(taskCollection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        retryCount: 0,
        lastExecutionStatus: 'FAILED',
        nextRunAt: new Date('2026-11-21T05:00:00.000Z'),
        lockedAt: null,
        lockedBy: null,
      }),
    );
  });

  it('does not retry non-retryable HTTP 4xx failures even when maxRetry > 0', async () => {
    const task = makeClaimedTask({ retryCount: 0, maxRetry: 5 });
    discordService.sendWebhook.mockResolvedValue({
      success: false,
      retryable: false,
      httpStatus: 400,
      durationMs: 50,
      message: 'Discord client error (HTTP 400)',
      retryAfterMs: null,
    });
    const fixedNow = new Date('2026-11-21T04:10:00.000Z');

    await service.executeClaimedTask(task, () => fixedNow);

    expect(taskLogCollection.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'FAILED',
        retryCount: 0,
        httpStatus: 400,
      }),
    );
    expect(taskCollection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        retryCount: 0,
        lastExecutionStatus: 'FAILED',
      }),
    );
  });

  it('handles duplicate execution PostgreSQL unique constraint (23505) safely', async () => {
    const task = makeClaimedTask();
    discordService.sendWebhook.mockResolvedValue({
      success: true,
      retryable: false,
      httpStatus: 204,
      durationMs: 20,
      message: 'Delivered',
      retryAfterMs: null,
    });
    const pgUniqueErr = Object.assign(new Error('duplicate key value'), {
      code: '23505',
    });
    prisma.transaction.mockRejectedValueOnce(pgUniqueErr);

    const delivery = await service.executeClaimedTask(task);

    expect(delivery.success).toBe(true);
    expect(taskCollection.update).toHaveBeenCalledWith({
      lockedAt: null,
      lockedBy: null,
    });
  });

  it('prevents overlapping in-process poll cycles', async () => {
    let resolveClaim!: (value: unknown[]) => void;
    const pendingClaim = new Promise<unknown[]>((resolve) => {
      resolveClaim = resolve;
    });
    vi.spyOn(service, 'claimDueTasks').mockReturnValueOnce(
      pendingClaim as ReturnType<SchedulerService['claimDueTasks']>,
    );

    const firstPoll = service.pollAndExecuteDueTasks();
    const overlappingPollCount = await service.pollAndExecuteDueTasks();

    expect(overlappingPollCount).toBe(0);
    resolveClaim([]);
    await expect(firstPoll).resolves.toBe(0);
  });

  it('recovers stale leases and hydrates unscheduled active tasks on startup', async () => {
    const stale = makeClaimedTask({ id: 'stale-1' });
    const unscheduled = makeClaimedTask({
      id: 'unsched-1',
      nextRunAt: null,
      lockedAt: null,
    });
    taskCollection.all
      .mockResolvedValueOnce([stale])
      .mockResolvedValueOnce([unscheduled]);

    const recovered = await service.recoverOnStartup(
      new Date('2026-11-21T04:00:00.000Z'),
    );

    expect(recovered).toBe(2);
    expect(taskCollection.update).toHaveBeenCalledWith({
      lockedAt: null,
      lockedBy: null,
    });
    expect(taskCollection.update).toHaveBeenCalledWith({
      nextRunAt: new Date('2026-11-21T05:00:00.000Z'),
    });
  });

  it('executes manually with retry up to maxRetry and logs every attempt', async () => {
    const task = makeClaimedTask({ maxRetry: 2 });
    taskCollection.first.mockResolvedValue(task);
    discordService.sendWebhook
      .mockResolvedValueOnce({
        success: false,
        retryable: true,
        httpStatus: 502,
        durationMs: 30,
        message: 'Bad Gateway',
        retryAfterMs: null,
      })
      .mockResolvedValueOnce({
        success: true,
        retryable: false,
        httpStatus: 204,
        durationMs: 25,
        message: 'Delivered',
        retryAfterMs: null,
      });

    const result = await service.executeTaskManually(task.id);

    expect(discordService.sendWebhook).toHaveBeenCalledTimes(2);
    expect(taskLogCollection.create).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('SUCCESS');
    expect(result.retryCount).toBe(1);
  });

  it('throws NotFoundException on manual execute when task does not exist', async () => {
    taskCollection.first.mockResolvedValue(null);

    await expect(
      service.executeTaskManually('01a1fc1f-6f18-7419-bdf4-83d216b276be'),
    ).rejects.toThrow(NotFoundException);
  });
});
