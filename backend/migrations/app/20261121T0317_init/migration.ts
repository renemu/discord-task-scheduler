#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/941b13726a67797a518e3d091afe007cc810f2527f8442e7e3f4559683b4af90/contract';
import endContract from '../../snapshots/941b13726a67797a518e3d091afe007cc810f2527f8442e7e3f4559683b4af90/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
  sql,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<never, End> {
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createSchema({ schema: 'public' }),
      this.createTable({
        schema: 'public',
        table: 'task_logs',
        columns: [
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('duration_ms', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('executed_at', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('execution_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('http_status', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('message', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('retry_count', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('scheduled_for', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('status', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('task_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'task_logs_duration_nonneg_2f6a87f3',
            sql`duration_ms IS NULL OR duration_ms >= 0`,
          ),
          checkExpression('task_logs_retry_count_nonneg_01b8d94b', sql`retry_count >= 0`),
          checkExpression(
            'task_logs_status_check_4bf092de',
            sql`"status" IN ('RUNNING', 'RETRYING', 'SUCCESS', 'FAILED')`,
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'tasks',
        columns: [
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('cron_expression', 'character varying(100)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 100 } },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('last_execution_status', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('last_run_at', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('locked_at', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('locked_by', 'character varying(100)', {
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 100 } },
          }),
          col('max_retry', 'int4', {
            notNull: true,
            default: lit(3),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('name', 'character varying(255)', {
            notNull: true,
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 255 } },
          }),
          col('next_run_at', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('payload', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
          col('retry_count', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('ACTIVE'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('timezone', 'character varying(64)', {
            notNull: true,
            default: lit('UTC'),
            codecRef: { codecId: 'sql/varchar@1', typeParams: { length: 64 } },
          }),
          col('updated_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-date@1', typeParams: { precision: 3 } },
          }),
          col('webhook_url', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'tasks_last_execution_status_check_2a50099b',
            sql`"last_execution_status" IN ('RUNNING', 'RETRYING', 'SUCCESS', 'FAILED')`,
          ),
          checkExpression(
            'tasks_max_retry_range_b33ab198',
            sql`max_retry >= 0 AND max_retry <= 10`,
          ),
          checkExpression('tasks_name_nonempty_370c3422', sql`length(btrim(name)) > 0`),
          checkExpression(
            'tasks_payload_is_object_ce603f9d',
            sql`jsonb_typeof(payload) = 'object'`,
          ),
          checkExpression('tasks_retry_count_nonneg_01b8d94b', sql`retry_count >= 0`),
          checkExpression(
            'tasks_status_check_fe77e76c',
            sql`"status" IN ('ACTIVE', 'PAUSED', 'DISABLED')`,
          ),
        ],
      }),
      this.createIndex({
        schema: 'public',
        table: 'task_logs',
        index: 'task_logs_executed_id_idx_a8e2caf0',
        columns: ['executed_at', 'id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'task_logs',
        index: 'task_logs_execution_id_idx_cb99a0ac',
        columns: ['execution_id', 'retry_count'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'task_logs',
        index: 'task_logs_slot_idempotency_uq_2e6e16ba',
        columns: ['task_id', 'scheduled_for', 'retry_count'],
        extras: { where: sql`scheduled_for IS NOT NULL`, unique: true },
      }),
      this.createIndex({
        schema: 'public',
        table: 'task_logs',
        index: 'task_logs_status_executed_idx_9c537db0',
        columns: ['status', 'executed_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'task_logs',
        index: 'task_logs_task_executed_idx_d8b4749d',
        columns: ['task_id', 'executed_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'task_logs',
        index: 'task_logs_task_id_idx_5d5ac774',
        columns: ['task_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'tasks',
        index: 'tasks_due_poll_idx_7af6479b',
        columns: ['next_run_at'],
        extras: { where: sql`status = 'ACTIVE' AND next_run_at IS NOT NULL` },
      }),
      this.createIndex({
        schema: 'public',
        table: 'tasks',
        index: 'tasks_locked_at_idx_11501b88',
        columns: ['locked_at'],
        extras: { where: sql`locked_at IS NOT NULL` },
      }),
      this.createIndex({
        schema: 'public',
        table: 'tasks',
        index: 'tasks_status_created_idx_1bbe8adf',
        columns: ['status', 'created_at'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'task_logs',
        foreignKey: {
          name: 'task_logs_task_id_fkey',
          columns: ['task_id'],
          references: { schema: 'public', table: 'tasks', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
