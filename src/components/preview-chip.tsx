
import { Meeting, statusInfo } from "@/lib/types";
import { shortenPath } from "@/lib/files";
import { StatusDot } from "./status-dot";

export function PreviewChip({ m, audioPath }: { m: Meeting; audioPath?: string | null }) {
  const s = statusInfo(m.status);
  const pathPreview = audioPath ?? m.audioPath ?? null;
  return (
    <div
      role="dialog"
      aria-label={m.title + " preview"}
      className="w-[300px] bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-xl shadow-md p-3 flex flex-col gap-1.5"
    >
      <div className="text-[13.5px] font-semibold text-[var(--text-strong)] truncate">
        {m.title}
      </div>
      <div className="flex items-center gap-1.5 min-w-0">
        <StatusDot status={m.status} size={6} />
        <span className="text-[11px] text-[var(--text-muted)] whitespace-nowrap">{s.label}</span>
        <span className="text-[var(--border-strong)]">·</span>
        <span className="font-mono text-[11px] text-[var(--text-faint)] whitespace-nowrap">{m.date}</span>
        <span className="text-[var(--border-strong)]">·</span>
        <span className="font-mono text-[11px] text-[var(--text-faint)] whitespace-nowrap">{m.time}</span>
        <span className="text-[var(--border-strong)]">·</span>
        <span className="font-mono text-[11px] text-[var(--text-faint)] whitespace-nowrap">{m.duration}</span>
      </div>
      <div className="text-[12.5px] leading-relaxed text-[var(--text-muted)] line-clamp-2">
        {pathPreview ? (
          <span className="font-mono text-[11px] text-[var(--text-faint)] break-all">{shortenPath(pathPreview)}</span>
        ) : m.firstLine || (m.status === "transcribing" ? "Transcribing — the first line will appear shortly." : "Not transcribed yet.")}
      </div>
    </div>
  );
}
