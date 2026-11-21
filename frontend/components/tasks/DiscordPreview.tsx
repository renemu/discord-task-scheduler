import type { DiscordWebhookPayload } from "@/types/api";

function colorNumberToHex(color?: number): string {
  if (typeof color !== "number" || Number.isNaN(color)) {
    return "#5865F2";
  }
  return `#${Math.max(0, Math.min(0xffffff, color)).toString(16).padStart(6, "0")}`;
}

export function DiscordPreview({
  payload,
  taskName,
}: {
  payload: DiscordWebhookPayload;
  taskName?: string;
}) {
  const botName = payload.username?.trim() || "PulseHook Bot";
  const content = payload.content?.trim();
  const embeds = Array.isArray(payload.embeds) ? payload.embeds : [];

  return (
    <div className="card-elevated overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#5865F2]" />
          <h3 className="text-xs font-semibold tracking-wide text-slate-700 uppercase">
            Live Discord Preview
          </h3>
        </div>
        <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-500">
          #announcements
        </span>
      </div>

      {/* Authentic Discord Dark Preview Container */}
      <div className="bg-[#313338] p-5 text-[#DBDEE1]">
        <div className="flex items-start gap-3.5">
          {/* Avatar */}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#5865F2] to-[#4752C4] text-sm font-bold text-white shadow-inner">
            {botName.slice(0, 2).toUpperCase()}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-semibold text-white">
                {botName}
              </span>
              <span className="rounded bg-[#5865F2] px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white uppercase">
                APP
              </span>
              <span className="text-[11px] text-[#949BA4]">Today at 09:00</span>
            </div>

            {content ? (
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-[#DBDEE1]">
                {content}
              </p>
            ) : embeds.length === 0 ? (
              <p className="mt-1 text-sm italic text-[#949BA4]">
                Start typing message content or an embed to preview your Discord webhook...
              </p>
            ) : null}

            {embeds.map((embed, index) => (
              <div
                key={index}
                className="mt-2.5 max-w-md rounded-md bg-[#2B2D31] p-3.5 shadow-xs"
                style={{
                  borderLeft: `4px solid ${colorNumberToHex(embed.color)}`,
                }}
              >
                {embed.title && (
                  <p className="text-sm font-semibold text-white">
                    {embed.title}
                  </p>
                )}
                {embed.description && (
                  <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-[#DBDEE1]">
                    {embed.description}
                  </p>
                )}
                {Array.isArray(embed.fields) && embed.fields.length > 0 && (
                  <div className="mt-2.5 grid grid-cols-2 gap-2">
                    {embed.fields.map((field, fIdx) => (
                      <div key={fIdx} className={field.inline ? "" : "col-span-2"}>
                        <p className="text-xs font-semibold text-white">
                          {field.name}
                        </p>
                        <p className="text-xs text-[#B5BAC1]">{field.value}</p>
                      </div>
                    ))}
                  </div>
                )}
                <p className="mt-2.5 text-[11px] text-[#949BA4]">
                  {embed.footer?.text ||
                    (taskName ? `Scheduled by ${taskName}` : "Delivered via PulseHook")}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
