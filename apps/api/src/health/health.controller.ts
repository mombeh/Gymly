import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HealthService, type HealthReport } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /** Reachable at GET /api/health (the prefix is configurable via API_PREFIX). */
  @Get()
  async check(@Res({ passthrough: true }) response: Response): Promise<HealthReport> {
    const report = await this.healthService.check();

    response.status(report.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);

    return report;
  }
}
