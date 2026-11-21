"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityLogsIcon,
  AlertCircleIcon,
  BoltIcon,
  CheckCircleIcon,
  ClockTaskIcon,
  PlusIcon,
  RefreshIcon,
} from "@/components/ui/Icons";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { apiClient, ApiClientError } from "@/lib/api-client";
import {
  formatDateTime,
  formatDuration,
  formatRelativeTime,
} from "@/lib/formatters";
import type { DashboardSummary } from "@/types/api";

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getDashboardSummary()
      .then((data) => {
        if (!cancelled) {
          setSummary(data);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof ApiClientError
              ? err.message
              : "Failed to load dashboard statistics.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const totalExec = summary?.totalExecutions ?? 0;
  const successPct =
    totalExec > 0
      ? Math.round(((summary?.successfulExecutions ?? 0) / totalExec) * 100)
      : 0;
  const retryPct =
    totalExec > 0
      ? Math.round(((summary?.retryingExecutions ?? 0) / totalExec) * 100)
      : 0;
  const failPct =
    totalExec > 0
      ? Math.max(0, 100 - successPct - retryPct)
      : 0;

  return (
    <div className="space-y-7">
      {/* Top Hero Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-wider text-[#5865F2] uppercase">
            Operations Overview
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-[28px]">
            Discord Scheduler Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Monitor scheduled Discord webhooks, delivery health, retries, and live execution history.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshIcon
              className={`h-4 w-4 text-slate-500 ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
          <Link
            href="/tasks/new"
            className="inline-flex items-center gap-2 rounded-xl bg-[#5865F2] px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-500/25 transition-all hover:bg-[#4752C4]"
          >
            <PlusIcon className="h-4 w-4" />
            New Task
          </Link>
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800">
          <div className="flex items-center gap-3">
            <AlertCircleIcon className="h-5 w-5 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 shadow-2xs hover:bg-rose-100"
          >
            Retry
          </button>
        </div>
      )}

      {/* KPI Cards — 2x2 Bento Grid on mobile, 4-col on xl */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {/* Card 1: Total Tasks */}
        <div className="card-interactive rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-slate-500 sm:text-xs">
              Total Tasks
            </span>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#EEF0FF] text-[#5865F2] sm:h-9 sm:w-9">
              <ClockTaskIcon className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2.5 text-2xl font-bold tracking-tight text-slate-900 sm:mt-3 sm:text-3xl">
            {loading ? "—" : summary?.totalTasks ?? 0}
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-slate-500 sm:mt-3 sm:text-xs">
            <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {summary?.activeTasks ?? 0} active
            </span>
            <span>&middot;</span>
            <span>{summary?.pausedTasks ?? 0} paused</span>
          </div>
        </div>

        {/* Card 2: Success Rate */}
        <div className="card-interactive rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-slate-500 sm:text-xs">
              Success Rate
            </span>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 sm:h-9 sm:w-9">
              <CheckCircleIcon className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2.5 text-2xl font-bold tracking-tight text-slate-900 sm:mt-3 sm:text-3xl">
            {loading ? "—" : `${summary?.successRate ?? 0}%`}
          </p>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
              style={{ width: `${summary?.successRate ?? 0}%` }}
            />
          </div>
        </div>

        {/* Card 3: Total Executions */}
        <div className="card-interactive rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-slate-500 sm:text-xs">
              Executions
            </span>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600 sm:h-9 sm:w-9">
              <ActivityLogsIcon className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2.5 text-2xl font-bold tracking-tight text-slate-900 sm:mt-3 sm:text-3xl">
            {loading ? "—" : summary?.totalExecutions ?? 0}
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-slate-500 sm:mt-3 sm:text-xs">
            <span className="font-medium text-emerald-700">
              {summary?.successfulExecutions ?? 0} ok
            </span>
            <span>&middot;</span>
            <span className="font-medium text-rose-600">
              {summary?.failedExecutions ?? 0} fail
            </span>
          </div>
        </div>

        {/* Card 4: Avg Latency / Failed Tasks */}
        <div className="card-interactive rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-slate-500 sm:text-xs">
              Avg Latency
            </span>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 sm:h-9 sm:w-9">
              <BoltIcon className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2.5 text-2xl font-bold tracking-tight text-slate-900 sm:mt-3 sm:text-3xl">
            {loading ? "—" : formatDuration(summary?.averageDurationMs)}
          </p>
          <div className="mt-2.5 flex items-center gap-1.5 text-[11px] sm:mt-3 sm:text-xs">
            {(summary?.failedTasks ?? 0) > 0 ? (
              <span className="font-medium text-rose-600">
                {summary?.failedTasks} failed task(s)
              </span>
            ) : (
              <span className="font-medium text-emerald-700">
                All tasks healthy
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Distribution Bar + Quick Actions */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="card-elevated rounded-2xl p-6 lg:col-span-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Execution Outcome Distribution
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Breakdown across all recorded Discord webhook attempts.
              </p>
            </div>
            <Link
              href="/logs"
              className="text-xs font-semibold text-[#5865F2] hover:text-[#4752C4]"
            >
              Inspect Logs &rarr;
            </Link>
          </div>

          <div className="mt-5 flex h-3.5 w-full overflow-hidden rounded-full bg-slate-100">
            {totalExec > 0 ? (
              <>
                <div
                  className="bg-emerald-500 transition-all duration-500"
                  style={{ width: `${successPct}%` }}
                  title={`Success: ${successPct}%`}
                />
                <div
                  className="bg-amber-400 transition-all duration-500"
                  style={{ width: `${retryPct}%` }}
                  title={`Retrying: ${retryPct}%`}
                />
                <div
                  className="bg-rose-500 transition-all duration-500"
                  style={{ width: `${failPct}%` }}
                  title={`Failed: ${failPct}%`}
                />
              </>
            ) : (
              <div className="w-full bg-slate-200/70" />
            )}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-4">
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Succeeded
              </div>
              <p className="mt-1 text-lg font-bold text-slate-900">
                {summary?.successfulExecutions ?? 0}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className="h-2 w-2 rounded-full bg-amber-400" />
                Retried
              </div>
              <p className="mt-1 text-lg font-bold text-slate-900">
                {summary?.retryingExecutions ?? 0}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className="h-2 w-2 rounded-full bg-rose-500" />
                Failed
              </div>
              <p className="mt-1 text-lg font-bold text-slate-900">
                {summary?.failedExecutions ?? 0}
              </p>
            </div>
          </div>
        </div>

        {/* Quick Actions Card */}
        <div className="card-elevated flex flex-col justify-between rounded-2xl bg-gradient-to-br from-[#5865F2] to-[#3B44B5] p-6 text-white lg:col-span-4">
          <div>
            <span className="inline-flex rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold backdrop-blur-xs">
              Cron & Retry Engine
            </span>
            <h2 className="mt-3 text-lg font-semibold leading-snug">
              Automate Discord alerts with zero missed runs
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-indigo-100/90">
              Schedule recurring webhook notifications with PostgreSQL-backed leases, exponential retry backoff, and live payload previews.
            </p>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              href="/tasks/new"
              className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-xs font-semibold text-[#4752C4] shadow-sm transition-colors hover:bg-indigo-50"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Create Task
            </Link>
            <Link
              href="/tasks"
              className="inline-flex items-center rounded-xl bg-white/15 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/25"
            >
              Manage Tasks
            </Link>
          </div>
        </div>
      </div>

      {/* Recent Executions Table */}
      <div className="card-elevated overflow-hidden rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Recent Execution Activity
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Latest 10 Discord webhook delivery attempts across all tasks.
            </p>
          </div>
          <Link
            href="/logs"
            className="text-xs font-semibold text-[#5865F2] hover:text-[#4752C4]"
          >
            View all logs &rarr;
          </Link>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-400">
            Loading recent executions...
          </div>
        ) : !summary || summary.recentExecutions.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-semibold text-slate-800">
              No execution logs yet
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Create a scheduled task or trigger an existing one manually to see live execution history here.
            </p>
            <Link
              href="/tasks/new"
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#5865F2] px-4 py-2 text-xs font-semibold text-white hover:bg-[#4752C4]"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Schedule Your First Task
            </Link>
          </div>
        ) : (
          <>
            {/* Mobile Activity Cards */}
            <div className="divide-y divide-slate-100 md:hidden">
              {summary.recentExecutions.map((item) => (
                <Link
                  key={item.id}
                  href={`/tasks/${item.taskId}`}
                  className="block p-4 transition-colors active:bg-slate-50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {item.taskName || item.taskId.slice(0, 8)}
                    </p>
                    <StatusBadge status={item.status} size="xs" />
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-xs text-slate-500">
                    {item.message || "—"}
                  </p>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono font-medium text-slate-600">
                      HTTP {item.httpStatus ?? "ERR"}
                    </span>
                    <span className="font-mono">Retry #{item.retryCount}</span>
                    <span className="font-mono">{formatDuration(item.durationMs)}</span>
                    <span className="ml-auto">{formatRelativeTime(item.executedAt)}</span>
                  </div>
                </Link>
              ))}
            </div>

            {/* Desktop Activity Table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                    <th className="px-6 py-3">Task</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">HTTP</th>
                    <th className="px-4 py-3">Retry</th>
                    <th className="px-4 py-3">Latency</th>
                    <th className="px-4 py-3">Message</th>
                    <th className="px-6 py-3 text-right">Executed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {summary.recentExecutions.map((item) => (
                    <tr
                      key={item.id}
                      className="transition-colors hover:bg-slate-50/70"
                    >
                      <td className="px-6 py-3.5 font-medium text-slate-900">
                        <Link
                          href={`/tasks/${item.taskId}`}
                          className="hover:text-[#5865F2]"
                        >
                          {item.taskName || item.taskId.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={item.status} size="xs" />
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs text-slate-600">
                        {item.httpStatus ?? "ERR"}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs text-slate-500">
                        #{item.retryCount}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs text-slate-600">
                        {formatDuration(item.durationMs)}
                      </td>
                      <td className="max-w-xs truncate px-4 py-3.5 text-xs text-slate-500">
                        {item.message || "—"}
                      </td>
                      <td className="whitespace-nowrap px-6 py-3.5 text-right text-xs text-slate-500">
                        <span title={formatDateTime(item.executedAt)}>
                          {formatRelativeTime(item.executedAt)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
