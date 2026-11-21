import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { db } from './db.js';

export type PrismaDb = typeof db;

@Injectable()
export class PrismaService implements OnApplicationShutdown {
  private readonly logger = new Logger(PrismaService.name);
  public readonly client: PrismaDb = db;

  get orm(): PrismaDb['orm'] {
    return this.client.orm;
  }

  get sql(): PrismaDb['sql'] {
    return this.client.sql;
  }

  get raw(): PrismaDb['raw'] {
    return this.client.raw;
  }

  get transaction(): PrismaDb['transaction'] {
    return this.client.transaction.bind(this.client);
  }

  get query(): PrismaDb['query'] {
    return this.client.query.bind(this.client);
  }

  get execute(): PrismaDb['execute'] {
    return this.client.execute.bind(this.client);
  }

  async checkHealth(): Promise<boolean> {
    await this.client.orm.public.Task.select('id').limit(1).all();
    return true;
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    this.logger.log(
      `Closing PostgreSQL connection pool${signal ? ` (signal: ${signal})` : ''}`,
    );
    await this.client.close();
  }
}
