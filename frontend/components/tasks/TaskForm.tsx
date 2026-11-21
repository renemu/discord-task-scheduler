"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { apiClient, ApiClientError } from "@/lib/api-client";
import {
  COMMON_TIMEZONES,
  CRON_PRESETS,
  describeCron,
} from "@/lib/formatters";
import type {
  CreateTaskInput,
  DiscordWebhookPayload,
  TaskItem,
  TaskStatus,
  UpdateTaskInput,
} from "@/types/api";
import { AlertCircleIcon, ArrowLeftIcon } from "../ui/Icons";
import { useToast } from "../ui/ToastProvider";
import { DiscordPreview } from "./DiscordPreview";

const EMBED_COLOR_SWATCHES = [
  { label: "Discord Indigo", value: 0x5865f2, hex: "#5865F2" },
  { label: "Emerald", value: 0x10b981, hex: "#10B981" },
  { label: "Amber", value: 0xf59e0b, hex: "#F59E0B" },
  { label: "Rose", value: 0xf43f5e, hex: "#F43F5E" },
  { label: "Sky", value: 0x0ea5e9, hex: "#0EA5E9" },
];

interface TaskFormProps {
  mode: "create" | "edit";
  initialTask?: TaskItem;
}

export function TaskForm({ mode, initialTask }: TaskFormProps) {
  const router = useRouter();
  const { pushToast } = useToast();

  const initialEmbed = initialTask?.payload?.embeds?.[0];

  const [name, setName] = useState(initialTask?.name ?? "");
  const [cronExpression, setCronExpression] = useState(
    initialTask?.cronExpression ?? "*/5 * * * *",
  );
  const [timezone, setTimezone] = useState(initialTask?.timezone ?? "UTC");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [maxRetry, setMaxRetry] = useState(initialTask?.maxRetry ?? 3);
  const [status, setStatus] = useState<TaskStatus>(
    initialTask?.status ?? "ACTIVE",
  );

  // Payload builder state
  const [payloadMode, setPayloadMode] = useState<"visual" | "json">("visual");
  const [content, setContent] = useState(
    initialTask?.payload?.content ?? "Scheduled status check completed!",
  );
  const [username, setUsername] = useState(
    initialTask?.payload?.username ?? "PulseHook Bot",
  );
  const [useEmbed, setUseEmbed] = useState(Boolean(initialEmbed));
  const [embedTitle, setEmbedTitle] = useState(
    initialEmbed?.title ?? "Automated Notification",
  );
  const [embedDescription, setEmbedDescription] = useState(
    initialEmbed?.description ?? "This message was dispatched by PulseHook.",
  );
  const [embedColor, setEmbedColor] = useState<number>(
    initialEmbed?.color ?? 0x5865f2,
  );
  const [rawJson, setRawJson] = useState(() =>
    JSON.stringify(
      initialTask?.payload ?? {
        content: "Scheduled status check completed!",
        username: "PulseHook Bot",
      },
      null,
      2,
    ),
  );

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorList, setErrorList] = useState<string[]>([]);

  const builtVisualPayload: DiscordWebhookPayload = useMemo(() => {
    const payload: DiscordWebhookPayload = {};
    if (content.trim()) payload.content = content;
    if (username.trim()) payload.username = username.trim();
    if (useEmbed && (embedTitle.trim() || embedDescription.trim())) {
      payload.embeds = [
        {
          ...(embedTitle.trim() ? { title: embedTitle.trim() } : {}),
          ...(embedDescription.trim()
            ? { description: embedDescription.trim() }
            : {}),
          color: embedColor,
        },
      ];
    }
    return payload;
  }, [content, username, useEmbed, embedTitle, embedDescription, embedColor]);

  const previewPayload: DiscordWebhookPayload = useMemo(() => {
    if (payloadMode === "visual") {
      return builtVisualPayload;
    }
    try {
      const parsed = JSON.parse(rawJson) as DiscordWebhookPayload;
      return typeof parsed === "object" && parsed !== null ? parsed : {};
    } catch {
      return {};
    }
  }, [payloadMode, builtVisualPayload, rawJson]);

  const switchToJson = () => {
    setRawJson(JSON.stringify(builtVisualPayload, null, 2));
    setPayloadMode("json");
  };

  const switchToVisual = () => {
    try {
      const parsed = JSON.parse(rawJson) as DiscordWebhookPayload;
      setContent(parsed.content ?? "");
      setUsername(parsed.username ?? "");
      const firstEmbed = parsed.embeds?.[0];
      if (firstEmbed) {
        setUseEmbed(true);
        setEmbedTitle(firstEmbed.title ?? "");
        setEmbedDescription(firstEmbed.description ?? "");
        if (typeof firstEmbed.color === "number") setEmbedColor(firstEmbed.color);
      } else {
        setUseEmbed(false);
      }
      setPayloadMode("visual");
    } catch {
      setErrorMsg("Fix invalid JSON before switching back to Visual Builder.");
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setErrorList([]);

    let finalPayload: DiscordWebhookPayload;
    if (payloadMode === "json") {
      try {
        finalPayload = JSON.parse(rawJson) as DiscordWebhookPayload;
      } catch {
        setErrorMsg("Discord payload must be valid JSON.");
        return;
      }
    } else {
      finalPayload = builtVisualPayload;
    }

    if (mode === "create" && !webhookUrl.trim()) {
      setErrorMsg("Discord Webhook URL is required.");
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "create") {
        const input: CreateTaskInput = {
          name: name.trim(),
          cronExpression: cronExpression.trim(),
          timezone,
          webhookUrl: webhookUrl.trim(),
          payload: finalPayload,
          maxRetry,
          status,
        };
        const created = await apiClient.createTask(input);
        pushToast({
          title: "Task scheduled",
          description: `"${created.name}" is ready (${created.cronExpression}).`,
          variant: "success",
        });
        router.push(`/tasks/${created.id}`);
      } else if (initialTask) {
        const input: UpdateTaskInput = {
          name: name.trim(),
          cronExpression: cronExpression.trim(),
          timezone,
          ...(webhookUrl.trim() ? { webhookUrl: webhookUrl.trim() } : {}),
          payload: finalPayload,
          maxRetry,
          status,
        };
        const updated = await apiClient.updateTask(initialTask.id, input);
        pushToast({
          title: "Task updated",
          description: `Changes saved for "${updated.name}".`,
          variant: "success",
        });
        router.push(`/tasks/${updated.id}`);
      }
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setErrorMsg(err.message);
        setErrorList(err.details ?? []);
      } else {
        setErrorMsg("Unexpected error while saving task.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            href={mode === "edit" && initialTask ? `/tasks/${initialTask.id}` : "/tasks"}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition-colors hover:text-[#5865F2]"
          >
            <ArrowLeftIcon className="h-3.5 w-3.5" />
            {mode === "edit" ? "Back to task detail" : "Back to tasks"}
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
            {mode === "create" ? "Create Scheduled Task" : `Edit "${initialTask?.name}"`}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Configure a recurring cron schedule, Discord webhook target, retry policy, and payload.
          </p>
        </div>
      </div>

      {errorMsg && (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50/90 p-4 text-rose-800">
          <AlertCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
          <div className="text-sm">
            <p className="font-semibold">{errorMsg}</p>
            {errorList.length > 1 && (
              <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs text-rose-700">
                {errorList.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Left Form Column */}
        <div className="space-y-6 xl:col-span-7">
          {/* Basic & Schedule Section */}
          <section className="card-elevated rounded-2xl p-6">
            <h2 className="text-sm font-semibold text-slate-900">
              Schedule & Endpoint
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Define when this task fires and which Discord channel receives it.
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Task Name
                </label>
                <input
                  type="text"
                  required
                  maxLength={255}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Daily Engineering Standup Reminder"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-[#5865F2] focus:ring-3 focus:ring-indigo-500/15"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Discord Webhook URL{" "}
                  {mode === "edit" && (
                    <span className="font-normal text-slate-400">
                      (optional — leave blank to keep current masked webhook)
                    </span>
                  )}
                </label>
                {mode === "edit" && initialTask && (
                  <p className="mt-1 font-mono text-[11px] text-slate-400">
                    Current: {initialTask.webhookUrlMasked}
                  </p>
                )}
                <input
                  type="url"
                  required={mode === "create"}
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://discord.com/api/webhooks/123456789012345678/your-token"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 font-mono text-xs text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-[#5865F2] focus:ring-3 focus:ring-indigo-500/15"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Cron Expression
                  </label>
                  <input
                    type="text"
                    required
                    value={cronExpression}
                    onChange={(e) => setCronExpression(e.target.value)}
                    placeholder="*/5 * * * *"
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 font-mono text-sm text-slate-900 outline-none transition-all focus:border-[#5865F2] focus:ring-3 focus:ring-indigo-500/15"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    {describeCron(cronExpression)}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Timezone (IANA)
                  </label>
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition-all focus:border-[#5865F2] focus:ring-3 focus:ring-indigo-500/15"
                  >
                    {COMMON_TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Cron Presets */}
              <div>
                <p className="text-[11px] font-medium text-slate-500">
                  Quick presets
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {CRON_PRESETS.map((preset) => {
                    const selected = cronExpression.trim() === preset.expression;
                    return (
                      <button
                        key={preset.expression}
                        type="button"
                        onClick={() => setCronExpression(preset.expression)}
                        className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${
                          selected
                            ? "bg-[#EEF0FF] text-[#4752C4] ring-1 ring-indigo-500/30"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200/70"
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Retry & Status */}
              <div className="grid grid-cols-1 gap-4 pt-1 sm:grid-cols-2">
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700">
                      Max Retries
                    </label>
                    <span className="rounded-md bg-indigo-50 px-2 py-0.5 font-mono text-xs font-semibold text-[#5865F2]">
                      {maxRetry} {maxRetry === 1 ? "retry" : "retries"}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    value={maxRetry}
                    onChange={(e) => setMaxRetry(Number(e.target.value))}
                    className="mt-3 w-full accent-[#5865F2]"
                  />
                  <div className="mt-1 flex justify-between text-[10px] text-slate-400">
                    <span>0 (no retry)</span>
                    <span>5</span>
                    <span>10 max</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Task Status
                  </label>
                  <div className="mt-1.5 grid grid-cols-3 gap-1.5 rounded-xl bg-slate-100 p-1">
                    {(["ACTIVE", "PAUSED", "DISABLED"] as const).map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setStatus(option)}
                        className={`rounded-lg py-1.5 text-xs font-semibold transition-all ${
                          status === option
                            ? "bg-white text-slate-900 shadow-xs"
                            : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        {option === "ACTIVE"
                          ? "Active"
                          : option === "PAUSED"
                            ? "Paused"
                            : "Disabled"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Payload Composer Section */}
          <section className="card-elevated rounded-2xl p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Discord Webhook Payload (JSONB)
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Compose visually or edit raw Discord JSON payload directly.
                </p>
              </div>
              <div className="flex rounded-xl bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={switchToVisual}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
                    payloadMode === "visual"
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  Visual
                </button>
                <button
                  type="button"
                  onClick={switchToJson}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
                    payloadMode === "json"
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  Raw JSON
                </button>
              </div>
            </div>

            {payloadMode === "visual" ? (
              <div className="mt-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Bot Display Name
                  </label>
                  <input
                    type="text"
                    maxLength={80}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="PulseHook Bot"
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-[#5865F2] focus:ring-3 focus:ring-indigo-500/15"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700">
                      Message Content
                    </label>
                    <span className="font-mono text-[11px] text-slate-400">
                      {content.length}/2000
                    </span>
                  </div>
                  <textarea
                    rows={3}
                    maxLength={2000}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Enter the message to send to Discord..."
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-[#5865F2] focus:ring-3 focus:ring-indigo-500/15"
                  />
                </div>

                <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4">
                  <label className="flex cursor-pointer items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-slate-800">
                        Include Rich Embed Card
                      </span>
                      <p className="text-[11px] text-slate-500">
                        Attach a styled Discord embed block below your message.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={useEmbed}
                      onChange={(e) => setUseEmbed(e.target.checked)}
                      className="h-4 w-4 rounded accent-[#5865F2]"
                    />
                  </label>

                  {useEmbed && (
                    <div className="mt-4 space-y-3 border-t border-slate-200/80 pt-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-700">
                          Embed Title
                        </label>
                        <input
                          type="text"
                          value={embedTitle}
                          onChange={(e) => setEmbedTitle(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#5865F2]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700">
                          Embed Description
                        </label>
                        <textarea
                          rows={2}
                          value={embedDescription}
                          onChange={(e) => setEmbedDescription(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#5865F2]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700">
                          Accent Color
                        </label>
                        <div className="mt-1.5 flex items-center gap-2">
                          {EMBED_COLOR_SWATCHES.map((swatch) => (
                            <button
                              key={swatch.value}
                              type="button"
                              onClick={() => setEmbedColor(swatch.value)}
                              title={swatch.label}
                              className={`h-7 w-7 rounded-full transition-transform ${
                                embedColor === swatch.value
                                  ? "scale-110 ring-2 ring-slate-900 ring-offset-2"
                                  : "hover:scale-105"
                              }`}
                              style={{ backgroundColor: swatch.hex }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-5">
                <textarea
                  rows={10}
                  value={rawJson}
                  onChange={(e) => setRawJson(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-950 p-4 font-mono text-xs leading-relaxed text-emerald-300 outline-none focus:border-[#5865F2]"
                />
              </div>
            )}
          </section>

          {/* Submit Row */}
          <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
            <Link
              href={mode === "edit" && initialTask ? `/tasks/${initialTask.id}` : "/tasks"}
              className="w-full rounded-xl border border-slate-200 bg-white px-5 py-3 text-center text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 sm:w-auto sm:py-2.5"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-[#5865F2] px-6 py-3 text-sm font-semibold text-white shadow-sm shadow-indigo-500/25 transition-all hover:bg-[#4752C4] disabled:opacity-60 sm:w-auto sm:py-2.5"
            >
              {submitting
                ? "Saving..."
                : mode === "create"
                  ? "Create Scheduled Task"
                  : "Save Changes"}
            </button>
          </div>
        </div>

        {/* Right Live Preview Column */}
        <div className="space-y-5 xl:col-span-5">
          <div className="xl:sticky xl:top-6 space-y-5">
            <DiscordPreview payload={previewPayload} taskName={name.trim() || undefined} />

            <div className="card-elevated rounded-2xl p-5">
              <h3 className="text-xs font-semibold tracking-wide text-slate-700 uppercase">
                Delivery & Retry Summary
              </h3>
              <dl className="mt-3.5 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500">Schedule</dt>
                  <dd className="rounded-md bg-slate-100 px-2 py-0.5 font-mono font-medium text-slate-800">
                    {cronExpression || "—"} ({timezone})
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500">Retry Policy</dt>
                  <dd className="font-medium text-slate-800">
                    1 initial + up to {maxRetry} {maxRetry === 1 ? "retry" : "retries"}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500">Rate-Limit Handling</dt>
                  <dd className="font-medium text-emerald-700">
                    HTTP 429 Retry-After aware
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500">Webhook Security</dt>
                  <dd className="font-medium text-slate-700">
                    Token masked in API & logs
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
