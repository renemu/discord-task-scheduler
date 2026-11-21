import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and } from '@prisma/orm-postgres/orm-client';
import {
  computeNextRunAt,
  isValidCronExpression,
  isValidTimezone,
} from '../common/utils/cron.util.js';
import { maskWebhookUrl } from '../common/utils/webhook.util.js';
import type { FieldInputTypes, FieldOutputTypes } from '../prisma/contract.d.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  SchedulerService,
  type ManualExecutionResult,
} from '../scheduler/scheduler.service.js';
import type { CreateTaskDto } from './dto/create-task.dto.js';
import type { QueryTasksDto } from './dto/query-tasks.dto.js';
import type { UpdateTaskDto } from './dto/update-task.dto.js';

type TaskRecord = {
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
  createdAt: Date;
  updatedAt: Date;
};

export interface TaskResponse {
  id: string;
  name: string;
  cronExpression: string;
  timezone: string;
  webhookUrlMasked: string;
  payload: FieldOutputTypes['public']['Task']['payload'];
  maxRetry: number;
  status: FieldOutputTypes['public']['Task']['status'];
  nextRunAt: Date | null;
  lastRunAt: Date | null;
  lastExecutionStatus: FieldOutputTypes['public']['Task']['lastExecutionStatus'];
  retryCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedTasksResponse {
  items: TaskResponse[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schedulerService: SchedulerService,
  ) {}

  async create(dto: CreateTaskDto): Promise<TaskResponse> {
    const timezone = dto.timezone ?? 'UTC';
    const status = dto.status ?? 'ACTIVE';
    const maxRetry = dto.maxRetry ?? 3;

    this.assertValidSchedule(dto.cronExpression, timezone);

    const nextRunAt =
      status === 'ACTIVE'
        ? computeNextRunAt(dto.cronExpression, timezone)
        : null;

    const created = await this.prisma.orm.public.Task.create({
      name: dto.name.trim(),
      cronExpression: dto.cronExpression.trim(),
      timezone,
      webhookUrl: dto.webhookUrl.trim(),
      payload: dto.payload as FieldInputTypes['public']['Task']['payload'],
      maxRetry,
      status,
      nextRunAt,
    });

    return this.toResponse(created);
  }

  async findAll(query: QueryTasksDto): Promise<PaginatedTasksResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;
    const search = query.search?.trim();

    let baseCollection = this.prisma.orm.public.Task;

    if (query.status && search) {
      const statusFilter = query.status;
      baseCollection = baseCollection.where((t) =>
        and(t.status.eq(statusFilter), t.name.ilike(`%${search}%`)),
      );
    } else if (query.status) {
      baseCollection = baseCollection.where({ status: query.status });
    } else if (search) {
      baseCollection = baseCollection.where((t) => t.name.ilike(`%${search}%`));
    }

    const [items, countResult] = await Promise.all([
      baseCollection
        .orderBy((t) => t.createdAt.desc())
        .limit(limit)
        .offset(offset)
        .all(),
      baseCollection.aggregate((a) => ({ total: a.count() })),
    ]);

    const total = countResult.total;

    return {
      items: items.map((task) => this.toResponse(task)),
      meta: {
        total,
        page,
        limit,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string): Promise<TaskResponse> {
    const task = await this.prisma.orm.public.Task.first({ id });
    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }
    return this.toResponse(task);
  }

  async update(id: string, dto: UpdateTaskDto): Promise<TaskResponse> {
    const existing = await this.prisma.orm.public.Task.first({ id });
    if (!existing) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    const nextCron = dto.cronExpression?.trim() ?? existing.cronExpression;
    const nextTimezone = dto.timezone ?? existing.timezone;
    const nextStatus = dto.status ?? existing.status;

    const scheduleChanged =
      dto.cronExpression !== undefined ||
      dto.timezone !== undefined ||
      dto.status !== undefined;

    if (scheduleChanged) {
      this.assertValidSchedule(nextCron, nextTimezone);
    }

    type TaskUpdateKey =
      | 'name'
      | 'cronExpression'
      | 'timezone'
      | 'webhookUrl'
      | 'payload'
      | 'maxRetry'
      | 'status'
      | 'nextRunAt'
      | 'retryCount'
      | 'lockedAt'
      | 'lockedBy';
    type TaskUpdatePayload = {
      -readonly [K in TaskUpdateKey]?: FieldInputTypes['public']['Task'][K];
    };

    const updateData: TaskUpdatePayload = {};
    if (dto.name !== undefined) {
      updateData.name = dto.name.trim();
    }
    if (dto.cronExpression !== undefined) {
      updateData.cronExpression = nextCron;
    }
    if (dto.timezone !== undefined) {
      updateData.timezone = nextTimezone;
    }
    if (dto.webhookUrl !== undefined) {
      updateData.webhookUrl = dto.webhookUrl.trim();
    }
    if (dto.payload !== undefined) {
      updateData.payload =
        dto.payload as FieldInputTypes['public']['Task']['payload'];
    }
    if (dto.maxRetry !== undefined) {
      updateData.maxRetry = dto.maxRetry;
    }
    if (dto.status !== undefined) {
      updateData.status = nextStatus;
    }

    if (scheduleChanged) {
      updateData.nextRunAt =
        nextStatus === 'ACTIVE'
          ? computeNextRunAt(nextCron, nextTimezone)
          : null;
      updateData.retryCount = 0;
      updateData.lockedAt = null;
      updateData.lockedBy = null;
    }

    const updated = await this.prisma.orm.public.Task.where({ id }).update(
      updateData,
    );

    if (!updated) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    return this.toResponse(updated);
  }

  async remove(id: string): Promise<{ deleted: true; id: string }> {
    const deleted = await this.prisma.orm.public.Task.where({ id }).delete();
    if (!deleted) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }
    return { deleted: true, id };
  }

  async activate(id: string): Promise<TaskResponse> {
    const existing = await this.prisma.orm.public.Task.first({ id });
    if (!existing) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    this.assertValidSchedule(existing.cronExpression, existing.timezone);
    const nextRunAt = computeNextRunAt(
      existing.cronExpression,
      existing.timezone,
    );

    const updated = await this.prisma.orm.public.Task.where({ id }).update({
      status: 'ACTIVE',
      nextRunAt,
      retryCount: 0,
      lockedAt: null,
      lockedBy: null,
    });

    if (!updated) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    return this.toResponse(updated);
  }

  async deactivate(id: string): Promise<TaskResponse> {
    const existing = await this.prisma.orm.public.Task.first({ id });
    if (!existing) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    const updated = await this.prisma.orm.public.Task.where({ id }).update({
      status: 'PAUSED',
      nextRunAt: null,
      retryCount: 0,
      lockedAt: null,
      lockedBy: null,
    });

    if (!updated) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    return this.toResponse(updated);
  }

  async execute(id: string): Promise<ManualExecutionResult> {
    return this.schedulerService.executeTaskManually(id);
  }

  private assertValidSchedule(cronExpression: string, timezone: string): void {
    if (!isValidTimezone(timezone)) {
      throw new BadRequestException(`Invalid IANA timezone: ${timezone}`);
    }
    if (!isValidCronExpression(cronExpression, timezone)) {
      throw new BadRequestException(
        `Invalid cron expression "${cronExpression}" for timezone "${timezone}"`,
      );
    }
  }

  private toResponse(task: TaskRecord): TaskResponse {
    return {
      id: task.id,
      name: task.name,
      cronExpression: task.cronExpression,
      timezone: task.timezone,
      webhookUrlMasked: maskWebhookUrl(task.webhookUrl),
      payload: task.payload,
      maxRetry: task.maxRetry,
      status: task.status,
      nextRunAt: task.nextRunAt,
      lastRunAt: task.lastRunAt,
      lastExecutionStatus: task.lastExecutionStatus,
      retryCount: task.retryCount,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  }
}
