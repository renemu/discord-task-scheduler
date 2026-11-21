"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { LogDetailModal } from "@/components/logs/LogDetailModal";
import {
  ActivityLogsIcon,
  AlertCircleIcon,
  RefreshIcon,
} from "@/components/ui/Icons";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { apiClient, ApiClientError } from "@/lib/api-client";
import { formatDateTime, formatDuration } from "@/lib/formatters";
import type {
  ExecutionStatus,
  PaginatedTaskLogsResponse,
  TaskItem,
  TaskLogItem,
} from "@/types/api";

const STATUS_OPTIONS: Array<{ label: string; value: ExecutionStatus | "" }> = [
  { label: "All", value: "" },
  { label: "Success", value: "SUCCESS" },
  { label: "Retrying", value: "RETRYING" },
  { label: "Failed", value: "FAILED" },
  { label: "Running", value: "RUNNING" },
];

export default function LogsPage() {
  const [data, setData] = useState<PaginatedTaskLogsResponse | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<ExecutionStatus | "">("");
  const [taskFilter, setTaskFilter] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<TaskLogItem | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reloadLogs = useCallback(() => {
    setLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    void apiClient
      .getTasks({ page: 1, limit: 100 })
      .then((res) => setTasks(res.items))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getLogs({
        page,
        limit: 15,
        status: statusFilter,
        taskId: taskFilter || undefined,
      })
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof ApiClientError
              ? err.message
              : "Failed to load execution logs.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [page, statusFilter, taskFilter, reloadKey]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-wider text-[#5865F2] uppercase">
            Observability
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            Execution Logs
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Inspect every scheduled and manual Discord webhook attempt, retry trace, and HTTP status.
          </p>
        </div>

        <button
          type="button"
          onClick={reloadLogs}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <RefreshIcon className="h-4 w-4 text-slate-500" />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="card-elevated flex flex-col gap-3 rounded-2xl p-3 sm:flex-row sm:items-center sm:justify-between sm:p-3.5">
        <div className="no-scrollbar flex items-center gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              type="button"
              onClick={() => {
                setStatusFilter(opt.value);
                setPage(1);
              }}
              className={`shrink-0 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
                statusFilter === opt.value
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <select
          value={taskFilter}
          onChange={(e) => {
            setTaskFilter(e.target.value);
            setPage(1);
          }}
          className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm text-slate-700 outline-none focus:border-[#5865F2] focus:bg-white sm:w-64 sm:py-2"
        >
          <option value="">All Tasks</option>
          {tasks.map((task) => (
            <option key={task.id} value={task.id}>
              {task.name}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800">
          <AlertCircleIcon className="h-5 w-5 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Table */}
      <div className="card-elevated overflow-hidden rounded-2xl">
        {loading ? (
          <div className="p-10 text-center text-sm text-slate-400">
            Loading execution logs...
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
              <ActivityLogsIcon className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-sm font-semibold text-slate-900">
              No execution logs match your filters
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Once scheduled or manual tasks execute, every attempt will appear here.
            </p>
          </div>
        ) : (
          <>
            {/* Mobile Log Cards */}
            <div className="divide-y divide-slate-100 md:hidden">
              {data.items.map((log) => (
                <button
                  key={log.id}
                  type="button"
                  onClick={() => setSelectedLog(log)}
                  className="block w-full p-4 text-left transition-colors active:bg-indigo-50/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {log.taskName || log.taskId.slice(0, 8)}
                    </p>
                    <StatusBadge status={log.status} size="xs" />
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-xs text-slate-600">
                    {log.message || "—"}
                  </p>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono font-medium text-slate-600">
                      HTTP {log.httpStatus ?? "ERR"}
                    </span>
                    <span className="font-mono">Retry #{log.retryCount}</span>
                    <span className="font-mono">{formatDuration(log.durationMs)}</span>
                    <span className="ml-auto font-mono">
                      {formatDateTime(log.executedAt)}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            {/* Desktop Table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                    <th className="px-6 py-3.5">Task</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-4 py-3.5">HTTP</th>
                    <th className="px-4 py-3.5">Retry</th>
                    <th className="px-4 py-3.5">Latency</th>
                    <th className="px-4 py-3.5">Message</th>
                    <th className="px-6 py-3.5 text-right">Executed At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.items.map((log) => (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      className="cursor-pointer transition-colors hover:bg-indigo-50/40"
                    >
                      <td className="px-6 py-3.5 font-medium text-slate-900">
                        <Link
                          href={`/tasks/${log.taskId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="hover:text-[#5865F2]"
                        >
                          {log.taskName || log.taskId.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={log.status} size="xs" />
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs text-slate-700">
                        {log.httpStatus ?? "ERR"}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs text-slate-500">
                        #{log.retryCount}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs text-slate-600">
                        {formatDuration(log.durationMs)}
                      </td>
                      <td className="max-w-sm truncate px-4 py-3.5 text-xs text-slate-600">
                        {log.message || "—"}
                      </td>
                      <td className="whitespace-nowrap px-6 py-3.5 text-right font-mono text-xs text-slate-500">
                        {formatDateTime(log.executedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 px-4 py-3.5 text-xs text-slate-500 sm:flex-row sm:px-6">
              <span>
                Page <strong className="text-slate-800">{data.meta.page}</strong> of{" "}
                <strong className="text-slate-800">{Math.max(1, data.meta.totalPages)}</strong> (
                {data.meta.total} logs)
              </span>
              <div className="flex w-full items-center gap-2 sm:w-auto">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 sm:flex-none sm:rounded-lg sm:py-1.5"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= data.meta.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 sm:flex-none sm:rounded-lg sm:py-1.5"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <LogDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />
    </div>
  );
}
