import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { DiscordService } from '../src/discord/discord.service.js';

describe('Discord Task Scheduler API (e2e)', () => {
  let app: INestApplication<App>;
  let apiKey: string;
  const createdTaskIds: string[] = [];

  const mockDiscordService = {
    sendWebhook: vi.fn().mockResolvedValue({
      success: true,
      retryable: false,
      httpStatus: 204,
      durationMs: 28,
      message: 'Discord webhook delivered successfully (HTTP 204)',
      retryAfterMs: null,
    }),
  };

  beforeAll(async () => {
    process.env['NODE_ENV'] = 'test';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DiscordService)
      .useValue(mockDiscordService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    apiKey = app.get(ConfigService).get<string>('API_KEY')!;
  });

  afterAll(async () => {
    for (const id of createdTaskIds) {
      await request(app.getHttpServer())
        .delete(`/api/tasks/${id}`)
        .set('x-api-key', apiKey);
    }
    await app.close();
  });

  it('GET /api/health is public and reports database connected', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/health')
      .expect(200);

    expect(res.body).toMatchObject({
      status: 'ok',
      database: 'connected',
    });
  });

  it('GET /api/tasks rejects requests without x-api-key', async () => {
    await request(app.getHttpServer()).get('/api/tasks').expect(401);
  });

  it('GET /api/tasks rejects requests with invalid x-api-key', async () => {
    await request(app.getHttpServer())
      .get('/api/tasks')
      .set('x-api-key', 'wrong-key')
      .expect(401);
  });

  it('POST /api/tasks validates invalid webhook URLs and payloads', async () => {
    await request(app.getHttpServer())
      .post('/api/tasks')
      .set('x-api-key', apiKey)
      .send({
        name: 'Bad Task',
        cronExpression: 'invalid',
        webhookUrl: 'http://169.254.169.254/latest',
        payload: {},
      })
      .expect(400);
  });

  it('supports full Task CRUD, activate/deactivate, manual execute, logs, and dashboard summary', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/tasks')
      .set('x-api-key', apiKey)
      .send({
        name: 'E2E Scheduled Ping',
        cronExpression: '*/10 * * * *',
        timezone: 'UTC',
        webhookUrl:
          'https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz123456',
        payload: {
          content: 'E2E test message',
          embeds: [{ title: 'E2E', description: 'Integration test' }],
        },
        maxRetry: 2,
      })
      .expect(201);

    const taskId = (createRes.body as { id: string }).id;
    createdTaskIds.push(taskId);

    expect(createRes.body).toMatchObject({
      id: taskId,
      name: 'E2E Scheduled Ping',
      status: 'ACTIVE',
      maxRetry: 2,
      webhookUrlMasked: 'https://discord.com/api/webhooks/123456789012345678/***',
    });
    expect('webhookUrl' in (createRes.body as Record<string, unknown>)).toBe(false);

    // Get detail
    await request(app.getHttpServer())
      .get(`/api/tasks/${taskId}`)
      .set('x-api-key', apiKey)
      .expect(200);

    // Update
    const updateRes = await request(app.getHttpServer())
      .patch(`/api/tasks/${taskId}`)
      .set('x-api-key', apiKey)
      .send({ name: 'E2E Scheduled Ping Updated', maxRetry: 4 })
      .expect(200);

    expect(updateRes.body).toMatchObject({
      name: 'E2E Scheduled Ping Updated',
      maxRetry: 4,
    });

    // Deactivate & Activate
    const deactRes = await request(app.getHttpServer())
      .patch(`/api/tasks/${taskId}/deactivate`)
      .set('x-api-key', apiKey)
      .expect(200);
    expect(deactRes.body).toMatchObject({ status: 'PAUSED', nextRunAt: null });

    const actRes = await request(app.getHttpServer())
      .patch(`/api/tasks/${taskId}/activate`)
      .set('x-api-key', apiKey)
      .expect(200);
    expect(actRes.body).toMatchObject({ status: 'ACTIVE' });

    // Manual execute (mocked DiscordService)
    const execRes = await request(app.getHttpServer())
      .post(`/api/tasks/${taskId}/execute`)
      .set('x-api-key', apiKey)
      .expect(200);
    expect(execRes.body).toMatchObject({
      taskId,
      status: 'SUCCESS',
      httpStatus: 204,
      retryCount: 0,
    });

    // Task logs
    const logsRes = await request(app.getHttpServer())
      .get(`/api/tasks/${taskId}/logs`)
      .set('x-api-key', apiKey)
      .expect(200);
    expect((logsRes.body as { items: unknown[] }).items.length).toBeGreaterThanOrEqual(1);

    // Dashboard summary
    const dashRes = await request(app.getHttpServer())
      .get('/api/dashboard/summary')
      .set('x-api-key', apiKey)
      .expect(200);
    expect((dashRes.body as { totalTasks: number }).totalTasks).toBeGreaterThanOrEqual(1);
    expect((dashRes.body as { successfulExecutions: number }).successfulExecutions).toBeGreaterThanOrEqual(1);

    // Delete (cascades task_logs)
    await request(app.getHttpServer())
      .delete(`/api/tasks/${taskId}`)
      .set('x-api-key', apiKey)
      .expect(200);
    createdTaskIds.pop();

    // Confirm deleted
    await request(app.getHttpServer())
      .get(`/api/tasks/${taskId}`)
      .set('x-api-key', apiKey)
      .expect(404);
  });
});
