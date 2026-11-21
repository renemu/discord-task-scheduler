import type { ExecutionStatus, TaskStatus } from "@/types/api";

type BadgeStatus = TaskStatus | ExecutionStatus;

const STATUS_STYLES: Record<
  BadgeStatus,
  { bg: string; text: string; dot: string; ring: string; pulse?: boolean; label: string }
> = {
  ACTIVE: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    dot: "bg-emerald-500",
    ring: "ring-emerald-600/15",
    pulse: true,
    label: "Active",
  },
  PAUSED: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    dot: "bg-amber-500",
    ring: "ring-amber-600/15",
    label: "Paused",
  },
  DISABLED: {
    bg: "bg-slate-100",
    text: "text-slate-600",
    dot: "bg-slate-400",
    ring: "ring-slate-500/15",
    label: "Disabled",
  },
  RUNNING: {
    bg: "bg-indigo-50",
    text: "text-indigo-700",
    dot: "bg-indigo-500",
    ring: "ring-indigo-600/15",
    pulse: true,
    label: "Running",
  },
  RETRYING: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    dot: "bg-amber-500",
    ring: "ring-amber-600/15",
    pulse: true,
    label: "Retrying",
  },
  SUCCESS: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    dot: "bg-emerald-500",
    ring: "ring-emerald-600/15",
    label: "Success",
  },
  FAILED: {
    bg: "bg-rose-50",
    text: "text-rose-700",
    dot: "bg-rose-500",
    ring: "ring-rose-600/15",
    label: "Failed",
  },
};

export function StatusBadge({
  status,
  size = "sm",
}: {
  status: BadgeStatus | null | undefined;
  size?: "xs" | "sm";
}) {
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500">
        Never run
      </span>
    );
  }

  const style = STATUS_STYLES[status];
  const padding = size === "xs" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ring-1 ring-inset ${style.bg} ${style.text} ${style.ring} ${padding}`}
    >
      <span className="relative flex h-1.5 w-1.5">
        {style.pulse && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-70 ${style.dot}`}
          />
        )}
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${style.dot}`} />
      </span>
      {style.label}
    </span>
  );
}
