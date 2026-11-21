import { Module } from '@nestjs/common';
import { DiscordModule } from '../discord/discord.module.js';
import { SchedulerService } from './scheduler.service.js';

@Module({
  imports: [DiscordModule],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
