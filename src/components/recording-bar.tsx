
import { Mic, Headphones, Play, Pause, Trash } from "./icons";
import { Waveform } from "./waveform";
import { formatTime } from "@/lib/types";
import { RecordingSessionDto } from "@/lib/recording";

export function RecordingBar({
  session,
  source = "Microphone",
  onPause,
  onResume,
  onStop,
  onCancel,
}: {
  session: RecordingSessionDto;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onCancel: () => void;
  source?: string;
}) {
  const paused = session.status === "paused";
  const finalizing = session.status === "finalizing";

  return (
    <div className="absolute left-1/2 -translate-x-1/2 bottom-6 z-50 flex items-center gap-4 bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-2xl shadow-xl px-5 py-3">
      <span className={`${paused ? "" : "animate-pulse"} w-[11px] h-[11px] rounded-full bg-[var(--live)] shrink-0`} style={{ boxShadow: "0 0 0 4px var(--live-tint)" }} />
      <span className="font-mono text-[23px] font-normal tracking-widest text-[var(--text-strong)] min-w-[96px] pl-0.5 tabular-nums">
        {formatTime(session.elapsedS)}
      </span>
      <div className="w-[92px]" style={{ opacity: paused || finalizing ? 0.4 : 1 }}>
        <Waveform n={18} live={!paused && !finalizing} color="var(--live)" height={24} width={92} seed={5} />
      </div>
      <span className="text-xs text-[var(--text-faint)] inline-flex items-center gap-1.5 whitespace-nowrap">
        <span className="w-[13px] h-[13px] inline-flex">{source === "Microphone" ? <Mic /> : <Headphones />}</span>
        {finalizing ? "Saving..." : source}
      </span>
      <span className="w-px h-[26px] bg-[var(--border-subtle)]" />
      <button
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-sm text-[var(--text-strong)] hover:bg-[var(--warm-100)] transition-colors"
        onClick={paused ? onResume : onPause}
        disabled={finalizing}
      >
        <span className="w-[15px] h-[15px] inline-flex">{paused ? <Play /> : <Pause />}</span>
        <span>{paused ? "Resume" : "Pause"}</span>
      </button>
      <button
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--live)] text-white text-sm font-medium hover:brightness-110 transition"
        onClick={onStop}
        disabled={finalizing}
      >
        <span className="w-2 h-2 rounded-full bg-white" />
        <span>Stop</span>
      </button>
      <button
        onClick={onCancel}
        aria-label="Discard recording"
        disabled={finalizing}
        className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-[var(--text-faint)] hover:text-[var(--danger)] hover:bg-[var(--danger-tint)] transition-colors"
      >
        <span className="w-[15px] h-[15px] inline-flex"><Trash /></span>
      </button>
    </div>
  );
}
