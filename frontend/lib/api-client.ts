import type {
  CreateTaskInput,
  DashboardSummary,
  ExecutionStatus,
  HealthResponse,
  ManualExecutionResult,
  PaginatedTaskLogsResponse,
  PaginatedTasksResponse,
  TaskItem,
  TaskStatus,
  UpdateTaskInput,
} from "@/types/api";

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly details?: string[],
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/proxy/${path.replace(/^\/+/, "")}`, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    let details: string[] | undefined;

    if (typeof data === "object" && data !== null && "message" in data) {
      const rawMsg = (data as { message?: unknown }).message;
      if (Array.isArray(rawMsg)) {
        details = rawMsg.map((item) => String(item));
        message = details[0] ?? message;
      } else if (typeof rawMsg === "string") {
        message = rawMsg;
      }
    }

    throw new ApiClientError(message, response.status, details);
  }

  return data as T;
}

export const apiClient = {
  getHealth(): Promise<HealthResponse> {
    return request<HealthResponse>("health");
  },

  getDashboardSummary(): Promise<DashboardSummary> {
    return request<DashboardSummary>("dashboard/summary");
  },

  getTasks(params?: {
    page?: number;
    limit?: number;
    status?: TaskStatus | "";
    search?: string;
  }): Promise<PaginatedTasksResponse> {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.status) qs.set("status", params.status);
    if (params?.search?.trim()) qs.set("search", params.search.trim());
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return request<PaginatedTasksResponse>(`tasks${suffix}`);
  },

  getTask(id: string): Promise<TaskItem> {
    return request<TaskItem>(`tasks/${id}`);
  },

  createTask(input: CreateTaskInput): Promise<TaskItem> {
    return request<TaskItem>("tasks", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  updateTask(id: string, input: UpdateTaskInput): Promise<TaskItem> {
    return request<TaskItem>(`tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },

  deleteTask(id: string): Promise<{ deleted: true; id: string }> {
    return request<{ deleted: true; id: string }>(`tasks/${id}`, {
      method: "DELETE",
    });
  },

  activateTask(id: string): Promise<TaskItem> {
    return request<TaskItem>(`tasks/${id}/activate`, {
      method: "PATCH",
    });
  },

  deactivateTask(id: string): Promise<TaskItem> {
    return request<TaskItem>(`tasks/${id}/deactivate`, {
      method: "PATCH",
    });
  },

  executeTask(id: string): Promise<ManualExecutionResult> {
    return request<ManualExecutionResult>(`tasks/${id}/execute`, {
      method: "POST",
    });
  },

  getLogs(params?: {
    page?: number;
    limit?: number;
    taskId?: string;
    status?: ExecutionStatus | "";
  }): Promise<PaginatedTaskLogsResponse> {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.taskId) qs.set("taskId", params.taskId);
    if (params?.status) qs.set("status", params.status);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return request<PaginatedTaskLogsResponse>(`logs${suffix}`);
  },

  getTaskLogs(
    taskId: string,
    params?: { page?: number; limit?: number; status?: ExecutionStatus | "" },
  ): Promise<PaginatedTaskLogsResponse> {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.status) qs.set("status", params.status);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return request<PaginatedTaskLogsResponse>(`tasks/${taskId}/logs${suffix}`);
  },
};
