export interface EnvConfig {
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  API_KEY: string;
  DATABASE_URL: string;
  CORS_ORIGIN: string;
  SCHEDULER_POLL_MS: number;
  SCHEDULER_BATCH_SIZE: number;
  SCHEDULER_LEASE_MS: number;
  WEBHOOK_TIMEOUT_MS: number;
  RETRY_BASE_DELAY_MS: number;
  RETRY_MAX_DELAY_MS: number;
  ALLOW_NON_DISCORD_WEBHOOKS: boolean;
}

function parsePositiveInt(
  raw: unknown,
  fallback: number,
  name: string,
): number {
  if (raw === undefined || raw === null || raw === '') {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Environment variable ${name} must be a positive integer`);
  }
  return parsed;
}

function readString(raw: unknown, fallback = ''): string {
  if (typeof raw === 'string') {
    return raw;
  }
  if (typeof raw === 'number' || typeof raw === 'boolean') {
    return String(raw);
  }
  return fallback;
}

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const nodeEnvRaw = readString(config['NODE_ENV'], 'development');
  if (
    nodeEnvRaw !== 'development' &&
    nodeEnvRaw !== 'production' &&
    nodeEnvRaw !== 'test'
  ) {
    throw new Error(
      `Environment variable NODE_ENV must be one of development, production, test`,
    );
  }

  const apiKey = readString(config['API_KEY']).trim();
  if (!apiKey) {
    throw new Error('Environment variable API_KEY is required');
  }

  const databaseUrl = readString(config['DATABASE_URL']).trim();
  if (!databaseUrl) {
    throw new Error('Environment variable DATABASE_URL is required');
  }

  return {
    NODE_ENV: nodeEnvRaw,
    PORT: parsePositiveInt(config['PORT'], 4000, 'PORT'),
    API_KEY: apiKey,
    DATABASE_URL: databaseUrl,
    CORS_ORIGIN: readString(config['CORS_ORIGIN'], 'http://localhost:3000'),
    SCHEDULER_POLL_MS: parsePositiveInt(
      config['SCHEDULER_POLL_MS'],
      5_000,
      'SCHEDULER_POLL_MS',
    ),
    SCHEDULER_BATCH_SIZE: parsePositiveInt(
      config['SCHEDULER_BATCH_SIZE'],
      20,
      'SCHEDULER_BATCH_SIZE',
    ),
    SCHEDULER_LEASE_MS: parsePositiveInt(
      config['SCHEDULER_LEASE_MS'],
      300_000,
      'SCHEDULER_LEASE_MS',
    ),
    WEBHOOK_TIMEOUT_MS: parsePositiveInt(
      config['WEBHOOK_TIMEOUT_MS'],
      10_000,
      'WEBHOOK_TIMEOUT_MS',
    ),
    RETRY_BASE_DELAY_MS: parsePositiveInt(
      config['RETRY_BASE_DELAY_MS'],
      2_000,
      'RETRY_BASE_DELAY_MS',
    ),
    RETRY_MAX_DELAY_MS: parsePositiveInt(
      config['RETRY_MAX_DELAY_MS'],
      60_000,
      'RETRY_MAX_DELAY_MS',
    ),
    ALLOW_NON_DISCORD_WEBHOOKS:
      readString(config['ALLOW_NON_DISCORD_WEBHOOKS'], 'false').toLowerCase() ===
      'true',
  };
}
