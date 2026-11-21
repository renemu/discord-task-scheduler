import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { QueryLogsDto } from './dto/query-logs.dto.js';
import {
  TaskLogsService,
  type PaginatedTaskLogsResponse,
} from './task-logs.service.js';

@Controller()
export class TaskLogsController {
  constructor(private readonly taskLogsService: TaskLogsService) {}

  @Get('logs')
  findAll(@Query() query: QueryLogsDto): Promise<PaginatedTaskLogsResponse> {
    return this.taskLogsService.findAll(query);
  }

  @Get('tasks/:id/logs')
  findByTask(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: QueryLogsDto,
  ): Promise<PaginatedTaskLogsResponse> {
    return this.taskLogsService.findByTask(id, query);
  }
}
