import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export const EXECUTION_STATUS_VALUES = [
  'RUNNING',
  'RETRYING',
  'SUCCESS',
  'FAILED',
] as const;
export type ExecutionStatusValue = (typeof EXECUTION_STATUS_VALUES)[number];

export class QueryLogsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsUUID()
  taskId?: string;

  @IsOptional()
  @IsUUID()
  executionId?: string;

  @IsOptional()
  @IsIn(EXECUTION_STATUS_VALUES)
  status?: ExecutionStatusValue;
}
