import { BadRequestException, NotFoundException } from '@nestjs/common';
import { vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { SchedulerService } from '../scheduler/scheduler.service.js';
import { TasksService } from './tasks.service.js';

const SAMPLE_WEBHOOK =
  'https://discord.com/api/webhooks/123456789012345678/super-secret-webhook-token-value';

function makeTaskRecord(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-11-21T03:00:00.000Z');
  return {
    id: '01a1fc1f-6f18-7419-bdf4-83d216b276be',
    name: 'Daily Standup Reminder',
    cronExpression: '0 9 * * 1-5',
    timezone: 'UTC',
    webhookUrl: SAMPLE_WEBHOOK,
    payload: { content: 'Standup time!' },
    maxRetry: 3,
    status: 'ACTIVE' as const,
    nextRunAt: new Date('2026-11-23T09:00:00.000Z'),
    lastRunAt: null,
    lastExecutionStatus: null,
    retryCount: 0,
    lockedAt: null,
    lockedBy: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('TasksService', () => {
  let service: TasksService;
  let taskCollection: Record<string, ReturnType<typeof vi.fn>>;
  let schedulerService: { executeTaskManually: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    taskCollection = {
      create: vi.fn(),
      first: vi.fn(),
      where: vi.fn(),
      orderBy: vi.fn(),
      limit: vi.fn(),
      offset: vi.fn(),
      all: vi.fn(),
      aggregate: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    taskCollection.where.mockReturnValue(taskCollection);
    taskCollection.orderBy.mockReturnValue(taskCollection);
    taskCollection.limit.mockReturnValue(taskCollection);
    taskCollection.offset.mockReturnValue(taskCollection);

    const prisma = {
      orm: { public: { Task: taskCollection } },
    } as unknown as PrismaService;

    schedulerService = {
      executeTaskManually: vi.fn(),
    };

    service = new TasksService(
      prisma,
      schedulerService as unknown as SchedulerService,
    );
  });

  it('creates an active task, computes nextRunAt, and masks webhookUrl in response', async () => {
    const record = makeTaskRecord();
    taskCollection.create.mockResolvedValue(record);

    const result = await service.create({
      name: 'Daily Standup Reminder',
      cronExpression: '0 9 * * 1-5',
      timezone: 'UTC',
      webhookUrl: SAMPLE_WEBHOOK,
      payload: { content: 'Standup time!' },
      maxRetry: 3,
    });

    expect(taskCollection.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Daily Standup Reminder',
        cronExpression: '0 9 * * 1-5',
        timezone: 'UTC',
        status: 'ACTIVE',
        maxRetry: 3,
        nextRunAt: expect.any(Date),
      }),
    );
    expect(result.webhookUrlMasked).toBe(
      'https://discord.com/api/webhooks/123456789012345678/***',
    );
    expect('webhookUrl' in result).toBe(false);
  });

  it('creates a PAUSED task with null nextRunAt', async () => {
    const record = makeTaskRecord({ status: 'PAUSED', nextRunAt: null });
    taskCollection.create.mockResolvedValue(record);

    const result = await service.create({
      name: 'Paused Task',
      cronExpression: '*/10 * * * *',
      webhookUrl: SAMPLE_WEBHOOK,
      payload: { content: 'Paused' },
      status: 'PAUSED',
    });

    expect(taskCollection.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'PAUSED',
        nextRunAt: null,
      }),
    );
    expect(result.status).toBe('PAUSED');
    expect(result.nextRunAt).toBeNull();
  });

  it('throws BadRequestException when cron expression is invalid', async () => {
    await expect(
      service.create({
        name: 'Bad Cron',
        cronExpression: 'invalid cron',
        webhookUrl: SAMPLE_WEBHOOK,
        payload: { content: 'Hello' },
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('returns paginated tasks list with metadata', async () => {
    const record = makeTaskRecord();
    taskCollection.all.mockResolvedValue([record]);
    taskCollection.aggregate.mockResolvedValue({ total: 1 });

    const result = await service.findAll({ page: 1, limit: 10, status: 'ACTIVE' });

    expect(result.items).toHaveLength(1);
    expect(result.meta).toEqual({
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    });
  });

  it('throws NotFoundException on findOne when task does not exist', async () => {
    taskCollection.first.mockResolvedValue(null);

    await expect(
      service.findOne('01a1fc1f-6f18-7419-bdf4-83d216b276be'),
    ).rejects.toThrow(NotFoundException);
  });

  it('updates task and recomputes nextRunAt when cron expression changes', async () => {
    const existing = makeTaskRecord();
    const updated = makeTaskRecord({ cronExpression: '*/15 * * * *' });
    taskCollection.first.mockResolvedValue(existing);
    taskCollection.update.mockResolvedValue(updated);

    const result = await service.update(existing.id, {
      cronExpression: '*/15 * * * *',
    });

    expect(taskCollection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        cronExpression: '*/15 * * * *',
        nextRunAt: expect.any(Date),
        retryCount: 0,
        lockedAt: null,
        lockedBy: null,
      }),
    );
    expect(result.cronExpression).toBe('*/15 * * * *');
  });

  it('activates a paused task and computes fresh nextRunAt', async () => {
    const existing = makeTaskRecord({ status: 'PAUSED', nextRunAt: null });
    const activated = makeTaskRecord({ status: 'ACTIVE' });
    taskCollection.first.mockResolvedValue(existing);
    taskCollection.update.mockResolvedValue(activated);

    const result = await service.activate(existing.id);

    expect(taskCollection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ACTIVE',
        nextRunAt: expect.any(Date),
        retryCount: 0,
      }),
    );
    expect(result.status).toBe('ACTIVE');
  });

  it('deactivates an active task and clears nextRunAt', async () => {
    const existing = makeTaskRecord({ status: 'ACTIVE' });
    const paused = makeTaskRecord({ status: 'PAUSED', nextRunAt: null });
    taskCollection.first.mockResolvedValue(existing);
    taskCollection.update.mockResolvedValue(paused);

    const result = await service.deactivate(existing.id);

    expect(taskCollection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'PAUSED',
        nextRunAt: null,
        retryCount: 0,
      }),
    );
    expect(result.status).toBe('PAUSED');
  });

  it('deletes a task and throws NotFoundException when missing', async () => {
    const existing = makeTaskRecord();
    taskCollection.delete.mockResolvedValueOnce(existing).mockResolvedValueOnce(null);

    await expect(service.remove(existing.id)).resolves.toEqual({
      deleted: true,
      id: existing.id,
    });
    await expect(service.remove(existing.id)).rejects.toThrow(NotFoundException);
  });

  it('delegates manual execution to SchedulerService', async () => {
    const mockResult = {
      taskId: '01a1fc1f-6f18-7419-bdf4-83d216b276be',
      executionId: '01a1fc1f-6f40-7272-8e4a-ed73056f1ea3',
      status: 'SUCCESS',
      retryCount: 0,
      httpStatus: 204,
      durationMs: 35,
      message: 'Delivered',
      executedAt: new Date(),
    };
    schedulerService.executeTaskManually.mockResolvedValue(mockResult);

    const result = await service.execute(mockResult.taskId);

    expect(schedulerService.executeTaskManually).toHaveBeenCalledWith(
      mockResult.taskId,
    );
    expect(result).toEqual(mockResult);
  });
});
