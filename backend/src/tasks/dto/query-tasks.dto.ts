import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { TASK_STATUS_VALUES, type TaskStatusValue } from './create-task.dto.js';

export class QueryTasksDto {
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
  @IsIn(TASK_STATUS_VALUES)
  status?: TaskStatusValue;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;
}
