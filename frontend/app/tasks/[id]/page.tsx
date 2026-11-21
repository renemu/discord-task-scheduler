"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { LogDetailModal } from "@/components/logs/LogDetailModal";
import { DiscordPreview } from "@/components/tasks/DiscordPreview";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import {
  AlertCircleIcon,
  ArrowLeftIcon,
  BoltIcon,
  EditIcon,
  PauseIcon,
  PlayIcon,
  RefreshIcon,
  TrashIcon,
} from "@/components/ui/Icons";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/ToastProvider";
import { apiClient, ApiClientError } from "@/lib/api-client";
import {
  formatDateTime,
  formatDuration,
  formatRelativeTime,
} from "@/lib/formatters";
import type {
  PaginatedTaskLogsResponse,
  TaskItem,
  TaskLogItem,
} from "@/types/api";

function TaskDetailContent() {
  const params = useParams<{ id: string }>();
  const taskId = params?.id ?? "";
  const router = useRouter();
  const { pushToast } = useToast();

  const [task, setTask] = useState<TaskItem | null>(null);
  const [logs, setLogs] = useState<PaginatedTaskLogsResponse | null>(null);
  const [selectedLog, setSelectedLog] = useState<TaskLogItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reloadData = useCallback(() => {
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!taskId) return;
    let cancelled = false;
    Promise.all([
      apiClient.getTask(taskId),
      apiClient.getTaskLogs(taskId, { page: 1, limit: 20 }),
    ])
      .then(([taskData, logsData]) => {
        if (!cancelled) {
          setTask(taskData);
          setLogs(logsData);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof ApiClientError ? err.message : "Failed to load task.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [taskId, reloadKey]);

  const handleToggle = async () => {
    if (!task) return;
    setBusy(true);
    try {
      if (task.status === "ACTIVE") {
        await apiClient.deactivateTask(task.id);
        pushToast({ title: "Task paused", variant: "info" });
      } else {
        await apiClient.activateTask(task.id);
        pushToast({ title: "Task activated", variant: "success" });
      }
      reloadData();
    } catch (err: unknown) {
      pushToast({
        title: "Status update failed",
        description: err instanceof ApiClientError ? err.message : "Error",
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleExecuteNow = async () => {
    if (!task) return;
    setBusy(true);
    try {
      const res = await apiClient.executeTask(task.id);
      pushToast({
        title: res.status === "SUCCESS" ? "Webhook delivered" : "Webhook failed",
        description: `${res.message} (${res.durationMs}ms)`,
        variant: res.status === "SUCCESS" ? "success" : "error",
      });
      reloadData();
    } catch (err: unknown) {
      pushToast({
        title: "Execution error",
        description: err instanceof ApiClientError ? err.message : "Error",
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!task) return;
    setBusy(true);
    try {
      await apiClient.deleteTask(task.id);
      pushToast({
        title: "Task deleted",
        description: `"${task.name}" was removed.`,
        variant: "success",
      });
      router.push("/tasks");
    } catch (err: unknown) {
      pushToast({
        title: "Delete failed",
        description: err instanceof ApiClientError ? err.message : "Error",
        variant: "error",
      });
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="card-elevated rounded-2xl p-10 text-center text-sm text-slate-400">
        Loading task details...
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="space-y-4">
        <Link
          href="/tasks"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-[#5865F2]"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" />
          Back to tasks
        </Link>
        <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
          <AlertCircleIcon className="h-5 w-5 text-rose-600" />
          <span>{error || "Task not found."}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/tasks"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-[#5865F2]"
          >
            <ArrowLeftIcon className="h-3.5 w-3.5" />
            Back to tasks
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              {task.name}
            </h1>
            <StatusBadge status={task.status} />
          </div>
          <p className="mt-1 font-mono text-xs text-slate-400">
            {task.webhookUrlMasked}
          </p>
        </div>

        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleExecuteNow()}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#5865F2] px-4 py-2.5 text-xs font-semibold text-white shadow-sm shadow-indigo-500/25 hover:bg-[#4752C4] disabled:opacity-50 sm:py-2"
          >
            <BoltIcon className="h-3.5 w-3.5" />
            Run Now
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleToggle()}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 sm:py-2"
          >
            {task.status === "ACTIVE" ? (
              <>
                <PauseIcon className="h-3.5 w-3.5" />
                Pause
              </>
            ) : (
              <>
                <PlayIcon className="h-3.5 w-3.5" />
                Activate
              </>
            )}
          </button>
          <Link
            href={`/tasks/${task.id}/edit`}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 sm:py-2"
          >
            <EditIcon className="h-3.5 w-3.5" />
            Edit
          </Link>
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmOpen(true)}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-600 hover:bg-rose-100 disabled:opacity-50 sm:py-2"
          >
            <TrashIcon className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      </div>

      {/* Info + Discord Preview */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="card-elevated rounded-2xl p-6 xl:col-span-7">
          <h2 className="text-sm font-semibold text-slate-900">
            Schedule & Runtime Configuration
          </h2>
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-3.5">
              <dt className="text-[11px] font-medium text-slate-500">Cron</dt>
              <dd className="mt-1 font-mono text-sm font-semibold text-slate-900">
                {task.cronExpression}
              </dd>
            </div>
            <div className="rounded-xl bg-slate-50 p-3.5">
              <dt className="text-[11px] font-medium text-slate-500">Timezone</dt>
              <dd className="mt-1 text-sm font-semibold text-slate-900">
                {task.timezone}
              </dd>
            </div>
            <div className="rounded-xl bg-slate-50 p-3.5">
              <dt className="text-[11px] font-medium text-slate-500">Max Retry</dt>
              <dd className="mt-1 font-mono text-sm font-semibold text-slate-900">
                {task.maxRetry}
              </dd>
            </div>
            <div className="rounded-xl bg-slate-50 p-3.5">
              <dt className="text-[11px] font-medium text-slate-500">Next Run</dt>
              <dd
                className="mt-1 text-xs font-semibold text-slate-900"
                title={formatDateTime(task.nextRunAt)}
              >
                {task.nextRunAt ? formatRelativeTime(task.nextRunAt) : "Not scheduled"}
              </dd>
            </div>
            <div className="rounded-xl bg-slate-50 p-3.5">
              <dt className="text-[11px] font-medium text-slate-500">Last Outcome</dt>
              <dd className="mt-1">
                <StatusBadge status={task.lastExecutionStatus} size="xs" />
              </dd>
            </div>
            <div className="rounded-xl bg-slate-50 p-3.5">
              <dt className="text-[11px] font-medium text-slate-500">Updated</dt>
              <dd className="mt-1 text-xs font-medium text-slate-700">
                {formatDateTime(task.updatedAt)}
              </dd>
            </div>
          </dl>

          <div className="mt-5">
            <p className="text-xs font-semibold text-slate-700">
              Stored JSONB Payload
            </p>
            <pre className="mt-2 overflow-x-auto rounded-xl bg-slate-950 p-4 font-mono text-xs leading-relaxed text-emerald-300">
              {JSON.stringify(task.payload, null, 2)}
            </pre>
          </div>
        </div>

        <div className="xl:col-span-5">
          <DiscordPreview payload={task.payload} taskName={task.name} />
        </div>
      </div>

      {/* Execution Logs for this Task */}
      <div className="card-elevated overflow-hidden rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Task Execution History
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Click any row to inspect attempt details, correlation ID, and Discord response.
            </p>
          </div>
          <button
            type="button"
            onClick={reloadData}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <RefreshIcon className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>

        {!logs || logs.items.length === 0 ? (
          <div className="px-6 py-10 text-center text-xs text-slate-500">
            No executions recorded for this task yet. Click{" "}
            <strong className="text-slate-700">Run Now</strong> to test delivery.
          </div>
        ) : (
          <>
            {/* Mobile Log Cards */}
            <div className="divide-y divide-slate-100 md:hidden">
              {logs.items.map((log) => (
                <button
                  key={log.id}
                  type="button"
                  onClick={() => setSelectedLog(log)}
                  className="block w-full p-4 text-left transition-colors active:bg-indigo-50/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge status={log.status} size="xs" />
                    <span className="font-mono text-[11px] text-slate-400">
                      {formatDateTime(log.executedAt)}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs text-slate-600">
                    {log.message || "—"}
                  </p>
                  <div className="mt-2.5 flex items-center gap-2 text-[11px] text-slate-400">
                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono font-medium text-slate-600">
                      HTTP {log.httpStatus ?? "ERR"}
                    </span>
                    <span className="font-mono">Retry #{log.retryCount}</span>
                    <span className="font-mono">{formatDuration(log.durationMs)}</span>
                  </div>
                </button>
              ))}
            </div>

            {/* Desktop Table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                    <th className="px-6 py-3">Status</th>
                    <th className="px-4 py-3">HTTP</th>
                    <th className="px-4 py-3">Retry</th>
                    <th className="px-4 py-3">Latency</th>
                    <th className="px-4 py-3">Message</th>
                    <th className="px-6 py-3 text-right">Executed At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.items.map((log) => (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      className="cursor-pointer transition-colors hover:bg-indigo-50/40"
                    >
                      <td className="px-6 py-3.5">
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
          </>
        )}
      </div>

      <LogDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />
      <ConfirmModal
        open={confirmOpen}
        title={`Delete "${task.name}"?`}
        description="This permanently removes the task and all its execution logs."
        confirmLabel="Delete Task"
        loading={busy}
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

export default function TaskDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="card-elevated rounded-2xl p-10 text-center text-sm text-slate-400">
          Loading task details...
        </div>
      }
    >
      <TaskDetailContent />
    </Suspense>
  );
}
