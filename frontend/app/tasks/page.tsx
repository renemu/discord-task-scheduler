"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import {
  AlertCircleIcon,
  BoltIcon,
  EditIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  TrashIcon,
  WebhookIcon,
} from "@/components/ui/Icons";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/ToastProvider";
import { apiClient, ApiClientError } from "@/lib/api-client";
import { formatDateTime, formatRelativeTime } from "@/lib/formatters";
import type { PaginatedTasksResponse, TaskItem, TaskStatus } from "@/types/api";

const STATUS_TABS: Array<{ label: string; value: TaskStatus | "" }> = [
  { label: "All", value: "" },
  { label: "Active", value: "ACTIVE" },
  { label: "Paused", value: "PAUSED" },
  { label: "Disabled", value: "DISABLED" },
];

export default function TasksPage() {
  const { pushToast } = useToast();
  const [data, setData] = useState<PaginatedTasksResponse | null>(null);
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "">("");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TaskItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const reloadTasks = useCallback(() => {
    setLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getTasks({
        page,
        limit: 10,
        status: statusFilter,
        search: searchQuery,
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
            err instanceof ApiClientError ? err.message : "Failed to load tasks.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [page, statusFilter, searchQuery, reloadKey]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      setSearchQuery(searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const handleToggleStatus = async (task: TaskItem) => {
    setBusyId(task.id);
    try {
      if (task.status === "ACTIVE") {
        await apiClient.deactivateTask(task.id);
        pushToast({
          title: "Task paused",
          description: `"${task.name}" will not run until reactivated.`,
          variant: "info",
        });
      } else {
        await apiClient.activateTask(task.id);
        pushToast({
          title: "Task activated",
          description: `"${task.name}" is now active on schedule.`,
          variant: "success",
        });
      }
      reloadTasks();
    } catch (err: unknown) {
      pushToast({
        title: "Action failed",
        description:
          err instanceof ApiClientError ? err.message : "Unable to update status.",
        variant: "error",
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleExecuteNow = async (task: TaskItem) => {
    setBusyId(task.id);
    try {
      const result = await apiClient.executeTask(task.id);
      pushToast({
        title:
          result.status === "SUCCESS"
            ? "Webhook delivered"
            : "Webhook execution failed",
        description: `${result.message} (${result.durationMs}ms)`,
        variant: result.status === "SUCCESS" ? "success" : "error",
      });
      reloadTasks();
    } catch (err: unknown) {
      pushToast({
        title: "Execution failed",
        description:
          err instanceof ApiClientError ? err.message : "Unable to trigger task.",
        variant: "error",
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiClient.deleteTask(deleteTarget.id);
      pushToast({
        title: "Task deleted",
        description: `"${deleteTarget.name}" and its execution logs were removed.`,
        variant: "success",
      });
      setDeleteTarget(null);
      reloadTasks();
    } catch (err: unknown) {
      pushToast({
        title: "Delete failed",
        description:
          err instanceof ApiClientError ? err.message : "Unable to delete task.",
        variant: "error",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-wider text-[#5865F2] uppercase">
            Task Management
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            Scheduled Tasks
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Create, pause, trigger manually, and configure retry limits for Discord webhook jobs.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={reloadTasks}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshIcon className="h-4 w-4 text-slate-500" />
            Refresh
          </button>
          <Link
            href="/tasks/new"
            className="inline-flex items-center gap-2 rounded-xl bg-[#5865F2] px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-500/25 hover:bg-[#4752C4]"
          >
            <PlusIcon className="h-4 w-4" />
            New Task
          </Link>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="card-elevated flex flex-col gap-3 rounded-2xl p-3 sm:flex-row sm:items-center sm:justify-between sm:p-3.5">
        <div className="no-scrollbar flex items-center gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.label}
              type="button"
              onClick={() => {
                setStatusFilter(tab.value);
                setPage(1);
              }}
              className={`shrink-0 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
                statusFilter === tab.value
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search tasks by name..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-2.5 pr-3.5 pl-9 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-[#5865F2] focus:bg-white focus:ring-3 focus:ring-indigo-500/15 sm:py-2"
          />
        </div>
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
            Loading scheduled tasks...
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EEF0FF] text-[#5865F2]">
              <WebhookIcon className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-sm font-semibold text-slate-900">
              No scheduled tasks found
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              {searchQuery || statusFilter
                ? "Try clearing your search or status filter."
                : "Create your first recurring Discord webhook job to get started."}
            </p>
            <Link
              href="/tasks/new"
              className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-[#5865F2] px-4 py-2 text-xs font-semibold text-white hover:bg-[#4752C4]"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Create Task
            </Link>
          </div>
        ) : (
          <>
            {/* Mobile Task Cards */}
            <div className="divide-y divide-slate-100 md:hidden">
              {data.items.map((task) => {
                const isBusy = busyId === task.id;
                return (
                  <div key={task.id} className="space-y-3.5 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/tasks/${task.id}`}
                          className="block truncate text-sm font-semibold text-slate-900 hover:text-[#5865F2]"
                        >
                          {task.name}
                        </Link>
                        <p className="mt-0.5 truncate font-mono text-[11px] text-slate-400">
                          {task.webhookUrlMasked}
                        </p>
                      </div>
                      <StatusBadge status={task.status} size="xs" />
                    </div>

                    <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-xs">
                      <div>
                        <span className="text-[10px] font-medium text-slate-400 uppercase">
                          Schedule
                        </span>
                        <p className="mt-0.5 font-mono font-semibold text-slate-800">
                          {task.cronExpression}
                        </p>
                        <p className="text-[11px] text-slate-400">{task.timezone}</p>
                      </div>
                      <div>
                        <span className="text-[10px] font-medium text-slate-400 uppercase">
                          Next Run
                        </span>
                        <p className="mt-0.5 font-medium text-slate-700">
                          {task.nextRunAt ? formatRelativeTime(task.nextRunAt) : "Paused"}
                        </p>
                        <p className="font-mono text-[11px] text-slate-400">
                          max {task.maxRetry} retries
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-400">Last:</span>
                        <StatusBadge status={task.lastExecutionStatus} size="xs" />
                      </div>
                      <Link
                        href={`/tasks/${task.id}`}
                        className="text-xs font-semibold text-[#5865F2]"
                      >
                        Details &rarr;
                      </Link>
                    </div>

                    <div className="grid grid-cols-4 gap-2 pt-1">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleExecuteNow(task)}
                        className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#EEF0FF] py-2 text-xs font-semibold text-[#4752C4] active:scale-95 disabled:opacity-50"
                      >
                        <BoltIcon className="h-3.5 w-3.5" />
                        Run Now
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleToggleStatus(task)}
                        aria-label={task.status === "ACTIVE" ? "Pause task" : "Activate task"}
                        className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white py-2 text-slate-600 active:bg-slate-100 disabled:opacity-50"
                      >
                        {task.status === "ACTIVE" ? (
                          <PauseIcon className="h-4 w-4" />
                        ) : (
                          <PlayIcon className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => setDeleteTarget(task)}
                        aria-label="Delete task"
                        className="inline-flex items-center justify-center rounded-xl border border-rose-200 bg-rose-50/70 py-2 text-rose-600 active:bg-rose-100 disabled:opacity-50"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                    <th className="px-6 py-3.5">Task & Webhook</th>
                    <th className="px-4 py-3.5">Schedule</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-4 py-3.5">Last Run</th>
                    <th className="px-4 py-3.5">Next Run</th>
                    <th className="px-4 py-3.5">Retries</th>
                    <th className="px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.items.map((task) => {
                    const isBusy = busyId === task.id;
                    return (
                      <tr
                        key={task.id}
                        className="transition-colors hover:bg-slate-50/70"
                      >
                        <td className="px-6 py-4">
                          <Link
                            href={`/tasks/${task.id}`}
                            className="font-semibold text-slate-900 transition-colors hover:text-[#5865F2]"
                          >
                            {task.name}
                          </Link>
                          <p className="mt-0.5 max-w-[260px] truncate font-mono text-[11px] text-slate-400">
                            {task.webhookUrlMasked}
                          </p>
                        </td>
                        <td className="px-4 py-4">
                          <span className="inline-block rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-xs font-medium text-slate-800">
                            {task.cronExpression}
                          </span>
                          <p className="mt-1 text-[11px] text-slate-400">
                            {task.timezone}
                          </p>
                        </td>
                        <td className="px-4 py-4">
                          <StatusBadge status={task.status} size="xs" />
                        </td>
                        <td className="px-4 py-4">
                          <StatusBadge
                            status={task.lastExecutionStatus}
                            size="xs"
                          />
                          {task.lastRunAt && (
                            <p
                              className="mt-1 text-[11px] text-slate-400"
                              title={formatDateTime(task.lastRunAt)}
                            >
                              {formatRelativeTime(task.lastRunAt)}
                            </p>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-600">
                          {task.nextRunAt ? (
                            <span title={formatDateTime(task.nextRunAt)}>
                              {formatRelativeTime(task.nextRunAt)}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-4 font-mono text-xs text-slate-600">
                          max {task.maxRetry}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleExecuteNow(task)}
                              title="Execute webhook now"
                              className="inline-flex items-center gap-1 rounded-lg bg-[#EEF0FF] px-2.5 py-1.5 text-xs font-semibold text-[#4752C4] transition-colors hover:bg-[#5865F2] hover:text-white disabled:opacity-50"
                            >
                              <BoltIcon className="h-3.5 w-3.5" />
                              Run
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleToggleStatus(task)}
                              title={
                                task.status === "ACTIVE"
                                  ? "Pause task"
                                  : "Activate task"
                              }
                              className="rounded-lg border border-slate-200 p-1.5 text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
                            >
                              {task.status === "ACTIVE" ? (
                                <PauseIcon className="h-3.5 w-3.5" />
                              ) : (
                                <PlayIcon className="h-3.5 w-3.5" />
                              )}
                            </button>
                            <Link
                              href={`/tasks/${task.id}/edit`}
                              title="Edit task"
                              className="rounded-lg border border-slate-200 p-1.5 text-slate-600 transition-colors hover:bg-slate-100"
                            >
                              <EditIcon className="h-3.5 w-3.5" />
                            </Link>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => setDeleteTarget(task)}
                              title="Delete task"
                              className="rounded-lg border border-slate-200 p-1.5 text-rose-500 transition-colors hover:border-rose-200 hover:bg-rose-50 disabled:opacity-50"
                            >
                              <TrashIcon className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 px-4 py-3.5 text-xs text-slate-500 sm:flex-row sm:px-6">
              <span>
                Page <strong className="text-slate-800">{data.meta.page}</strong> of{" "}
                <strong className="text-slate-800">{Math.max(1, data.meta.totalPages)}</strong> (
                {data.meta.total} total)
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

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title={`Delete "${deleteTarget?.name ?? ""}"?`}
        description="This permanently deletes the task and cascades deletion to all associated execution logs."
        confirmLabel="Delete Task"
        loading={deleting}
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
