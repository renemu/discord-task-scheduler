"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { TaskForm } from "@/components/tasks/TaskForm";
import { AlertCircleIcon, ArrowLeftIcon } from "@/components/ui/Icons";
import { apiClient, ApiClientError } from "@/lib/api-client";
import type { TaskItem } from "@/types/api";

function EditTaskContent() {
  const params = useParams<{ id: string }>();
  const taskId = params?.id ?? "";
  const [task, setTask] = useState<TaskItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!taskId) return;
    let active = true;
    const load = async () => {
      try {
        const result = await apiClient.getTask(taskId);
        if (active) setTask(result);
      } catch (err: unknown) {
        if (active) {
          setError(
            err instanceof ApiClientError
              ? err.message
              : "Failed to load task.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [taskId]);

  if (loading) {
    return (
      <div className="card-elevated rounded-2xl p-10 text-center text-sm text-slate-400">
        Loading task configuration...
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

  return <TaskForm mode="edit" initialTask={task} />;
}

export default function EditTaskPage() {
  return (
    <Suspense
      fallback={
        <div className="card-elevated rounded-2xl p-10 text-center text-sm text-slate-400">
          Loading task configuration...
        </div>
      }
    >
      <EditTaskContent />
    </Suspense>
  );
}
