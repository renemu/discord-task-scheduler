import { Injectable, NotFoundException } from '@nestjs/common';
import type { FieldOutputTypes } from '../prisma/contract.d.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { QueryLogsDto } from './dto/query-logs.dto.js';

export interface TaskLogResponse {
  id: string;
  taskId: string;
  taskName?: string;
  executionId: string;
  scheduledFor: Date | null;
  executedAt: Date;
  status: FieldOutputTypes['public']['TaskLog']['status'];
  retryCount: number;
  httpStatus: number | null;
  durationMs: number | null;
  message: string | null;
  createdAt: Date;
}

export interface PaginatedTaskLogsResponse {
  items: TaskLogResponse[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

@Injectable()
export class TaskLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryLogsDto): Promise<PaginatedTaskLogsResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    let collection = this.prisma.orm.public.TaskLog;

    if (query.taskId) {
      collection = collection.where({ taskId: query.taskId });
    }
    if (query.executionId) {
      collection = collection.where({ executionId: query.executionId });
    }
    if (query.status) {
      collection = collection.where({ status: query.status });
    }

    const [rows, countResult] = await Promise.all([
      collection
        .include('task', (t) => t.select('id', 'name'))
        .orderBy([(l) => l.executedAt.desc(), (l) => l.id.desc()])
        .limit(limit)
        .offset(offset)
        .all(),
      collection.aggregate((a) => ({ total: a.count() })),
    ]);

    const total = countResult.total;

    return {
      items: rows.map((row) => ({
        id: row.id,
        taskId: row.taskId,
        taskName: row.task?.name,
        executionId: row.executionId,
        scheduledFor: row.scheduledFor,
        executedAt: row.executedAt,
        status: row.status,
        retryCount: row.retryCount,
        httpStatus: row.httpStatus,
        durationMs: row.durationMs,
        message: row.message,
        createdAt: row.createdAt,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    };
  }

  async findByTask(
    taskId: string,
    query: QueryLogsDto,
  ): Promise<PaginatedTaskLogsResponse> {
    const task = await this.prisma.orm.public.Task.first({ id: taskId });
    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    return this.findAll({
      page: query.page,
      limit: query.limit,
      executionId: query.executionId,
      status: query.status,
      taskId,
    });
  }
}
