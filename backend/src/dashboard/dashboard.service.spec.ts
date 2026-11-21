import { vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { DashboardService } from './dashboard.service.js';

describe('DashboardService', () => {
  let service: DashboardService;
  let taskCollection: Record<string, ReturnType<typeof vi.fn>>;
  let taskLogCollection: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    taskCollection = {
      where: vi.fn(),
      aggregate: vi.fn(),
    };
    taskCollection.where.mockReturnValue(taskCollection);

    taskLogCollection = {
      where: vi.fn(),
      aggregate: vi.fn(),
      include: vi.fn(),
      orderBy: vi.fn(),
      limit: vi.fn(),
      all: vi.fn(),
    };
    taskLogCollection.where.mockReturnValue(taskLogCollection);
    taskLogCollection.include.mockReturnValue(taskLogCollection);
    taskLogCollection.orderBy.mockReturnValue(taskLogCollection);
    taskLogCollection.limit.mockReturnValue(taskLogCollection);

    const prisma = {
      orm: {
        public: {
          Task: taskCollection,
          TaskLog: taskLogCollection,
        },
      },
    } as unknown as PrismaService;

    service = new DashboardService(prisma);
  });

  it('aggregates task counts, execution metrics, success rate, and recent executions', async () => {
    taskCollection.aggregate
      .mockResolvedValueOnce({ count: 10 }) // totalTasks
      .mockResolvedValueOnce({ count: 6 }) // activeTasks
      .mockResolvedValueOnce({ count: 3 }) // pausedTasks
      .mockResolvedValueOnce({ count: 1 }) // disabledTasks
      .mockResolvedValueOnce({ count: 2 }); // failedTasks

    taskLogCollection.aggregate
      .mockResolvedValueOnce({ count: 25, avgDurationMs: 143.7 }) // totalExecutions + avg
      .mockResolvedValueOnce({ count: 18 }) // successfulExecutions
      .mockResolvedValueOnce({ count: 2 }) // failedExecutions
      .mockResolvedValueOnce({ count: 5 }); // retryingExecutions

    const now = new Date('2026-11-21T04:00:00.000Z');
    taskLogCollection.all.mockResolvedValue([
      {
        id: 'log-1',
        taskId: 'task-1',
        task: { id: 'task-1', name: 'Ping Bot' },
        executionId: 'exec-1',
        status: 'SUCCESS',
        retryCount: 0,
        httpStatus: 204,
        durationMs: 120,
        message: 'Delivered',
        executedAt: now,
      },
    ]);

    const summary = await service.getSummary();

    expect(summary).toEqual({
      totalTasks: 10,
      activeTasks: 6,
      pausedTasks: 3,
      disabledTasks: 1,
      failedTasks: 2,
      totalExecutions: 25,
      successfulExecutions: 18,
      failedExecutions: 2,
      retryingExecutions: 5,
      successRate: 90,
      averageDurationMs: 144,
      recentExecutions: [
        {
          id: 'log-1',
          taskId: 'task-1',
          taskName: 'Ping Bot',
          executionId: 'exec-1',
          status: 'SUCCESS',
          retryCount: 0,
          httpStatus: 204,
          durationMs: 120,
          message: 'Delivered',
          executedAt: now,
        },
      ],
    });
  });

  it('returns 0 successRate and null averageDurationMs when there are no logs', async () => {
    taskCollection.aggregate.mockResolvedValue({ count: 0 });
    taskLogCollection.aggregate
      .mockResolvedValueOnce({ count: 0, avgDurationMs: null })
      .mockResolvedValue({ count: 0 });
    taskLogCollection.all.mockResolvedValue([]);

    const summary = await service.getSummary();

    expect(summary.successRate).toBe(0);
    expect(summary.averageDurationMs).toBeNull();
    expect(summary.recentExecutions).toEqual([]);
  });
});
