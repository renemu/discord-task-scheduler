"use client";

import Link from "next/link";
import { formatDateTime, formatDuration } from "@/lib/formatters";
import type { TaskLogItem } from "@/types/api";
import { CloseIcon } from "../ui/Icons";
import { StatusBadge } from "../ui/StatusBadge";

export function LogDetailModal({
  log,
  onClose,
}: {
  log: TaskLogItem | null;
  onClose: () => void;
}) {
  if (!log) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 backdrop-blur-xs sm:items-stretch sm:justify-end"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88vh] w-full flex-col rounded-t-3xl border-t border-slate-200 bg-white shadow-2xl sm:h-full sm:max-h-none sm:max-w-lg sm:rounded-none sm:border-t-0 sm:border-l"
      >
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-slate-200 sm:hidden" />
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
              Execution Attempt Detail
            </p>
            <h3 className="mt-0.5 text-base font-semibold text-slate-900">
              {log.taskName || "Scheduled Task"}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close detail panel"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-4">
            <div>
              <p className="text-xs text-slate-500">Status</p>
              <div className="mt-1.5">
                <StatusBadge status={log.status} />
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500">HTTP Status</p>
              <p className="mt-1 font-mono text-sm font-semibold text-slate-900">
                {log.httpStatus ?? "Network Error"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500">Latency</p>
              <p className="mt-1 font-mono text-sm font-semibold text-slate-900">
                {formatDuration(log.durationMs)}
              </p>
            </div>
          </div>

          <dl className="divide-y divide-slate-100 rounded-2xl border border-slate-200/80 bg-white px-4 text-sm">
            <div className="flex items-center justify-between py-3">
              <dt className="text-xs text-slate-500">Attempt</dt>
              <dd className="font-mono text-xs font-medium text-slate-900">
                {log.retryCount === 0
                  ? "Initial (retry 0)"
                  : `Retry #${log.retryCount}`}
              </dd>
            </div>
            <div className="flex items-center justify-between py-3">
              <dt className="text-xs text-slate-500">Executed At</dt>
              <dd className="font-mono text-xs text-slate-800">
                {formatDateTime(log.executedAt)}
              </dd>
            </div>
            <div className="flex items-center justify-between py-3">
              <dt className="text-xs text-slate-500">Scheduled Slot</dt>
              <dd className="font-mono text-xs text-slate-800">
                {log.scheduledFor ? formatDateTime(log.scheduledFor) : "Manual trigger"}
              </dd>
            </div>
            <div className="flex flex-col gap-1 py-3">
              <dt className="text-xs text-slate-500">Execution Correlation ID</dt>
              <dd className="break-all font-mono text-[11px] text-slate-600">
                {log.executionId}
              </dd>
            </div>
            <div className="flex flex-col gap-1 py-3">
              <dt className="text-xs text-slate-500">Log ID</dt>
              <dd className="break-all font-mono text-[11px] text-slate-600">
                {log.id}
              </dd>
            </div>
          </dl>

          <div>
            <p className="text-xs font-semibold text-slate-700">
              Execution Message
            </p>
            <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-100">
              {log.message || "No message recorded."}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
          <Link
            href={`/tasks/${log.taskId}`}
            onClick={onClose}
            className="text-xs font-semibold text-[#5865F2] hover:text-[#4752C4]"
          >
            View Parent Task &rarr;
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
