
import { useEffect } from "react";
import { Mic, Headphones } from "./icons";

export function RecordSourcePopup({ onPick, onCancel }: { onPick: (source: string) => void; onCancel: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (e.key === "Escape") onCancel();
      else if (meta && key === "e") { e.preventDefault(); onPick("Microphone"); }
      else if (meta && key === "s") { e.preventDefault(); onPick("System audio"); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onCancel, onPick]);

  return (
    <div className="absolute right-6 bottom-24 z-50 w-[220px] bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-xl shadow-lg p-3 flex flex-col gap-2" role="dialog" aria-label="Choose audio source">
      <div className="text-xs font-semibold text-[var(--text-faint)] uppercase tracking-wider px-1">Where?</div>
      <SourceOption icon={<Mic />} label="Environment" sub="Your microphone" shortcut="⌘E" onClick={() => onPick("Microphone")} />
      <SourceOption icon={<Headphones />} label="System audio" sub="What you hear" shortcut="⌘S" onClick={() => onPick("System audio")} />
    </div>
  );
}

function SourceOption({ icon, label, sub, shortcut, onClick }: { icon: React.ReactNode; label: string; sub: string; shortcut: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-[var(--warm-100)] transition-colors w-full text-left"
    >
      <span className="w-8 h-8 rounded-lg bg-[var(--warm-100)] flex items-center justify-center text-[var(--text-muted)]">
        <span className="w-4 h-4 inline-flex">{icon}</span>
      </span>
      <span className="flex flex-col items-start leading-tight min-w-0">
        <span className="text-[13.5px] font-semibold text-[var(--text-strong)] whitespace-nowrap">{label}</span>
        <span className="text-[11.5px] text-[var(--text-faint)] whitespace-nowrap">{sub}</span>
      </span>
      <span className="ml-auto text-[11px] font-mono px-1.5 py-0.5 rounded bg-[var(--warm-100)] text-[var(--text-faint)]">{shortcut}</span>
    </button>
  );
}
