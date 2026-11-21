import { NotFoundException } from '@nestjs/common';
import { vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { TaskLogsService } from './task-logs.service.js';

describe('TaskLogsService', () => {
  let service: TaskLogsService;
  let taskCollection: Record<string, ReturnType<typeof vi.fn>>;
  let taskLogCollection: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    taskCollection = {
      first: vi.fn(),
    };
    taskLogCollection = {
      where: vi.fn(),
      include: vi.fn(),
      orderBy: vi.fn(),
      limit: vi.fn(),
      offset: vi.fn(),
      all: vi.fn(),
      aggregate: vi.fn(),
    };
    taskLogCollection.where.mockReturnValue(taskLogCollection);
    taskLogCollection.include.mockReturnValue(taskLogCollection);
    taskLogCollection.orderBy.mockReturnValue(taskLogCollection);
    taskLogCollection.limit.mockReturnValue(taskLogCollection);
    taskLogCollection.offset.mockReturnValue(taskLogCollection);

    const prisma = {
      orm: {
        public: {
          Task: taskCollection,
          TaskLog: taskLogCollection,
        },
      },
    } as unknown as PrismaService;

    service = new TaskLogsService(prisma);
  });

  it('returns paginated execution logs with filters applied', async () => {
    const now = new Date('2026-11-21T04:00:00.000Z');
    taskLogCollection.all.mockResolvedValue([
      {
        id: 'log-1',
        taskId: 'task-1',
        task: { id: 'task-1', name: 'Hourly Alert' },
        executionId: 'exec-1',
        scheduledFor: now,
        executedAt: now,
        status: 'SUCCESS',
        retryCount: 0,
        httpStatus: 204,
        durationMs: 45,
        message: 'Delivered',
        createdAt: now,
      },
    ]);
    taskLogCollection.aggregate.mockResolvedValue({ total: 1 });

    const result = await service.findAll({
      page: 1,
      limit: 20,
      status: 'SUCCESS',
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.taskName).toBe('Hourly Alert');
    expect(result.meta).toEqual({
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
  });

  it('throws NotFoundException on findByTask when task does not exist', async () => {
    taskCollection.first.mockResolvedValue(null);

    await expect(service.findByTask('missing-id', {})).rejects.toThrow(
      NotFoundException,
    );
  });
});
