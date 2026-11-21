export type TaskStatus = "ACTIVE" | "PAUSED" | "DISABLED";
export type ExecutionStatus = "RUNNING" | "RETRYING" | "SUCCESS" | "FAILED";

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  url?: string;
  timestamp?: string;
  footer?: { text: string; icon_url?: string };
  fields?: DiscordEmbedField[];
  [key: string]: unknown;
}

export interface DiscordWebhookPayload {
  content?: string;
  username?: string;
  avatar_url?: string;
  tts?: boolean;
  embeds?: DiscordEmbed[];
  [key: string]: unknown;
}

export interface TaskItem {
  id: string;
  name: string;
  cronExpression: string;
  timezone: string;
  webhookUrlMasked: string;
  payload: DiscordWebhookPayload;
  maxRetry: number;
  status: TaskStatus;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastExecutionStatus: ExecutionStatus | null;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginatedTasksResponse {
  items: TaskItem[];
  meta: PaginationMeta;
}

export interface TaskLogItem {
  id: string;
  taskId: string;
  taskName?: string;
  executionId: string;
  scheduledFor: string | null;
  executedAt: string;
  status: ExecutionStatus;
  retryCount: number;
  httpStatus: number | null;
  durationMs: number | null;
  message: string | null;
  createdAt: string;
}

export interface PaginatedTaskLogsResponse {
  items: TaskLogItem[];
  meta: PaginationMeta;
}

export interface RecentExecutionItem {
  id: string;
  taskId: string;
  taskName?: string;
  executionId: string;
  status: ExecutionStatus;
  retryCount: number;
  httpStatus: number | null;
  durationMs: number | null;
  message: string | null;
  executedAt: string;
}

export interface DashboardSummary {
  totalTasks: number;
  activeTasks: number;
  pausedTasks: number;
  disabledTasks: number;
  failedTasks: number;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  retryingExecutions: number;
  successRate: number;
  averageDurationMs: number | null;
  recentExecutions: RecentExecutionItem[];
}

export interface ManualExecutionResult {
  taskId: string;
  executionId: string;
  status: "SUCCESS" | "FAILED";
  retryCount: number;
  httpStatus: number | null;
  durationMs: number;
  message: string;
  executedAt: string;
}

export interface HealthResponse {
  status: "ok";
  database: "connected";
  timestamp: string;
}

export interface CreateTaskInput {
  name: string;
  cronExpression: string;
  timezone?: string;
  webhookUrl: string;
  payload: DiscordWebhookPayload;
  maxRetry?: number;
  status?: TaskStatus;
}

export interface UpdateTaskInput {
  name?: string;
  cronExpression?: string;
  timezone?: string;
  webhookUrl?: string;
  payload?: DiscordWebhookPayload;
  maxRetry?: number;
  status?: TaskStatus;
}
