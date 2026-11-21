import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator.js';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const rawHeader = request.headers['x-api-key'];
    const providedKey = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

    if (!providedKey || typeof providedKey !== 'string' || !providedKey.trim()) {
      throw new UnauthorizedException('Missing x-api-key header');
    }

    const expectedKey = this.configService.get<string>('API_KEY');
    if (!expectedKey) {
      throw new UnauthorizedException('Server API key is not configured');
    }

    const providedDigest = createHash('sha256').update(providedKey.trim()).digest();
    const expectedDigest = createHash('sha256').update(expectedKey).digest();

    if (!timingSafeEqual(providedDigest, expectedDigest)) {
      throw new UnauthorizedException('Invalid API key');
    }

    return true;
  }
}
