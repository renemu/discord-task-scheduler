import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ApiKeyGuard } from './api-key.guard.js';

@Module({
  providers: [
    ApiKeyGuard,
    {
      provide: APP_GUARD,
      useExisting: ApiKeyGuard,
    },
  ],
  exports: [ApiKeyGuard],
})
export class AuthModule {}
