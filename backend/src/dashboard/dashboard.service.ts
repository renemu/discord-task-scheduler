import { Injectable } from '@nestjs/common';
import type { FieldOutputTypes } from '../prisma/contract.d.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface RecentExecutionItem {
  id: string;
  taskId: string;
  taskName?: string;
  executionId: string;
  status: FieldOutputTypes['public']['TaskLog']['status'];
  retryCount: number;
  httpStatus: number | null;
  durationMs: number | null;
  message: string | null;
  executedAt: Date;
}

export interface DashboardSummaryResponse {
  totalTasks: number;
  activeTasks: number;
  pausedTasks: number;
  disabledTasks: number;
  failedTasks: number;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  retryingExecutions: number;
  successRate: number;
  averageDurationMs: number | null;
  recentExecutions: RecentExecutionItem[];
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(): Promise<DashboardSummaryResponse> {
    const [
      taskTotals,
      activeTotals,
      pausedTotals,
      disabledTotals,
      failedTaskTotals,
      logTotals,
      successLogTotals,
      failedLogTotals,
      retryingLogTotals,
      recentRows,
    ] = await Promise.all([
      this.prisma.orm.public.Task.aggregate((a) => ({ count: a.count() })),
      this.prisma.orm.public.Task.where({ status: 'ACTIVE' }).aggregate((a) => ({
        count: a.count(),
      })),
      this.prisma.orm.public.Task.where({ status: 'PAUSED' }).aggregate((a) => ({
        count: a.count(),
      })),
      this.prisma.orm.public.Task.where({ status: 'DISABLED' }).aggregate(
        (a) => ({ count: a.count() }),
      ),
      this.prisma.orm.public.Task.where({
        lastExecutionStatus: 'FAILED',
      }).aggregate((a) => ({ count: a.count() })),
      this.prisma.orm.public.TaskLog.aggregate((a) => ({
        count: a.count(),
        avgDurationMs: a.avg('durationMs'),
      })),
      this.prisma.orm.public.TaskLog.where({ status: 'SUCCESS' }).aggregate(
        (a) => ({ count: a.count() }),
      ),
      this.prisma.orm.public.TaskLog.where({ status: 'FAILED' }).aggregate(
        (a) => ({ count: a.count() }),
      ),
      this.prisma.orm.public.TaskLog.where({ status: 'RETRYING' }).aggregate(
        (a) => ({ count: a.count() }),
      ),
      this.prisma.orm.public.TaskLog.include('task', (t) =>
        t.select('id', 'name'),
      )
        .orderBy([(l) => l.executedAt.desc(), (l) => l.id.desc()])
        .limit(10)
        .all(),
    ]);

    const successfulExecutions = successLogTotals.count;
    const failedExecutions = failedLogTotals.count;
    const terminalTotal = successfulExecutions + failedExecutions;
    const successRate =
      terminalTotal === 0
        ? 0
        : Number(((successfulExecutions / terminalTotal) * 100).toFixed(2));

    const averageDurationMs =
      logTotals.avgDurationMs === null
        ? null
        : Math.round(logTotals.avgDurationMs);

    return {
      totalTasks: taskTotals.count,
      activeTasks: activeTotals.count,
      pausedTasks: pausedTotals.count,
      disabledTasks: disabledTotals.count,
      failedTasks: failedTaskTotals.count,
      totalExecutions: logTotals.count,
      successfulExecutions,
      failedExecutions,
      retryingExecutions: retryingLogTotals.count,
      successRate,
      averageDurationMs,
      recentExecutions: recentRows.map((row) => ({
        id: row.id,
        taskId: row.taskId,
        taskName: row.task?.name,
        executionId: row.executionId,
        status: row.status,
        retryCount: row.retryCount,
        httpStatus: row.httpStatus,
        durationMs: row.durationMs,
        message: row.message,
        executedAt: row.executedAt,
      })),
    };
  }
}
