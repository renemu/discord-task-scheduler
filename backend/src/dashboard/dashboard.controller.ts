import { Controller, Get } from '@nestjs/common';
import {
  DashboardService,
  type DashboardSummaryResponse,
} from './dashboard.service.js';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  getSummary(): Promise<DashboardSummaryResponse> {
    return this.dashboardService.getSummary();
  }
}
