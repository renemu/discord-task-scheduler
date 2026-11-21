import { Module } from '@nestjs/common';
import { TaskLogsController } from './task-logs.controller.js';
import { TaskLogsService } from './task-logs.service.js';

@Module({
  controllers: [TaskLogsController],
  providers: [TaskLogsService],
  exports: [TaskLogsService],
})
export class TaskLogsModule {}
