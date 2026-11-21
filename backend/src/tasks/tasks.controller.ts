import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { ManualExecutionResult } from '../scheduler/scheduler.service.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { QueryTasksDto } from './dto/query-tasks.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';
import {
  TasksService,
  type PaginatedTasksResponse,
  type TaskResponse,
} from './tasks.service.js';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  findAll(@Query() query: QueryTasksDto): Promise<PaginatedTasksResponse> {
    return this.tasksService.findAll(query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateTaskDto): Promise<TaskResponse> {
    return this.tasksService.create(dto);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<TaskResponse> {
    return this.tasksService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskDto,
  ): Promise<TaskResponse> {
    return this.tasksService.update(id, dto);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ deleted: true; id: string }> {
    return this.tasksService.remove(id);
  }

  @Patch(':id/activate')
  activate(@Param('id', ParseUUIDPipe) id: string): Promise<TaskResponse> {
    return this.tasksService.activate(id);
  }

  @Patch(':id/deactivate')
  deactivate(@Param('id', ParseUUIDPipe) id: string): Promise<TaskResponse> {
    return this.tasksService.deactivate(id);
  }

  @Post(':id/execute')
  @HttpCode(HttpStatus.OK)
  execute(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ManualExecutionResult> {
    return this.tasksService.execute(id);
  }
}
