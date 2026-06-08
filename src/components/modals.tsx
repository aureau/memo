
import { useState, useEffect, useRef, ReactNode } from "react";
import { X, Import } from "./icons";
import { hasGroqApiKey, setGroqApiKey } from "@/lib/transcription";

function ModalShell({ title, children, onClose, footer, width = 460 }: { title: string; children: ReactNode; onClose: () => void; footer?: ReactNode; width?: number }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="absolute inset-0 z-60 bg-black/30 flex items-center justify-center" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl" style={{ width }} role="dialog" aria-modal aria-label={title}>
        <div className="flex items-center px-[18px] pt-4 pb-3">
          <h2 className="text-[19px] font-medium text-[var(--text-strong)] tracking-tight flex-1">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-faint)] hover:bg-[var(--warm-100)] transition-colors">
            <span className="w-[15px] h-[15px] inline-flex"><X /></span>
          </button>
        </div>
        <div className="px-[18px] pb-1">{children}</div>
        {footer && <div className="mt-3.5 px-[18px] py-3 border-t border-[var(--border-subtle)] bg-[var(--warm-25)] flex justify-end gap-2.5 rounded-b-2xl">{footer}</div>}
      </div>
    </div>
  );
}

interface FileItem {
  name: string;
  size: string;
  progress: number;
}

export function ImportModal({ onClose }: { onClose: () => void }) {
  const [files, setFiles] = useState<FileItem[]>([
    { name: "all-hands-may.m4a", size: "42.1 MB", progress: 1 },
  ]);
  const seed = useRef(1);

  useEffect(() => {
    const id = setInterval(() => {
      setFiles((fs) => fs.map((f) => f.progress < 1 ? { ...f, progress: Math.min(1, f.progress + 0.07 + Math.random() * 0.06) } : f));
    }, 320);
    return () => clearInterval(id);
  }, []);

  const addFile = () => {
    const names = ["client-call.mp3", "lecture-3.wav", "1on1-priya.m4a", "demo-feedback.mp3"];
    const sizes = ["12.4 MB", "28.9 MB", "9.7 MB", "33.0 MB"];
    const i = seed.current++ % names.length;
    setFiles((fs) => [...fs, { name: names[i], size: sizes[i], progress: 0 }]);
  };

  return (
    <ModalShell
      title="Import audio"
      onClose={onClose}
      width={500}
      footer={
        <>
          <button className="px-4 py-2 rounded-lg text-sm text-[var(--text-muted)] hover:bg-[var(--warm-100)] transition-colors" onClick={onClose}>Close</button>
          <button className="px-4 py-2 rounded-lg text-sm font-medium bg-[var(--accent-500)] text-white hover:bg-[var(--accent-600)] transition-colors" onClick={addFile}>Add files</button>
        </>
      }
    >
      <div className="border-2 border-dashed border-[var(--border-strong)] rounded-xl p-8 flex flex-col items-center gap-2 cursor-pointer hover:border-[var(--accent-400)] transition-colors" onClick={addFile}>
        <span className="w-[26px] h-[26px] inline-flex text-[var(--accent-500)]"><Import /></span>
        <div className="text-[14.5px] font-semibold text-[var(--text-strong)]">Drop audio files here</div>
        <div className="text-[12.5px] text-[var(--text-muted)]">or <span className="text-[var(--text-accent)] font-semibold">browse</span> — mp3, m4a, wav</div>
      </div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-faint)] mt-3.5 mb-2">Queue</div>
      <div className="flex flex-col gap-3 pb-1.5 max-h-[200px] overflow-y-auto">
        {files.map((f, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-[13px] text-[var(--text-strong)] truncate flex-1">{f.name}</span>
                <span className="font-mono text-[11px] text-[var(--text-faint)]">{f.size}</span>
              </div>
              <div className="mt-1.5 h-1 rounded-full bg-[var(--warm-200)] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${f.progress * 100}%`, background: f.progress >= 1 ? "var(--success)" : "var(--accent-500)" }}
                />
              </div>
            </div>
            <span className="font-mono text-[11px] w-[52px] text-right shrink-0" style={{ color: f.progress >= 1 ? "var(--success-text)" : "var(--text-faint)" }}>
              {f.progress >= 1 ? "ready" : `${Math.round(f.progress * 100)}%`}
            </span>
          </div>
        ))}
      </div>
    </ModalShell>
  );
}

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const [autoTranscribe, setAutoTranscribe] = useState(true);
  const [apiKey, setApiKey] = useState("");
  const [keyConfigured, setKeyConfigured] = useState(false);

  useEffect(() => {
    hasGroqApiKey().then(setKeyConfigured).catch(() => setKeyConfigured(false));
  }, []);

  const saveApiKey = async () => {
    if (!apiKey.trim()) return;
    await setGroqApiKey(apiKey.trim());
    setKeyConfigured(true);
    setApiKey("");
  };

  return (
    <ModalShell
      title="Settings"
      onClose={onClose}
      width={480}
      footer={<button className="px-4 py-2 rounded-lg text-sm font-medium bg-[var(--accent-500)] text-white hover:bg-[var(--accent-600)] transition-colors" onClick={onClose}>Done</button>}
    >
      <div className="pt-0.5">
        <SettingsRow
          label="Audio source"
          sub="What Memo captures when you record"
          control={
            <select className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] text-sm text-[var(--text-strong)] min-w-[150px]">
              <option>Microphone</option>
              <option>System audio</option>
            </select>
          }
        />
        <SettingsRow
          label="Transcribe automatically"
          sub="Start transcription when a recording stops"
          control={
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={autoTranscribe} onChange={(e) => setAutoTranscribe(e.target.checked)} className="sr-only peer" />
              <div className="w-9 h-5 bg-[var(--warm-300)] peer-checked:bg-[var(--accent-500)] rounded-full transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
            </label>
          }
        />
        <SettingsRow
          label="Groq API key"
          sub={keyConfigured ? "Configured — used for Whisper transcription" : "Required for transcription (or set GROQ_API_KEY env)"}
          control={
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={keyConfigured ? "••••••••" : "gsk_..."}
                className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] text-sm text-[var(--text-strong)] min-w-[180px]"
              />
              <button
                onClick={saveApiKey}
                className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-sm text-[var(--text-strong)] hover:bg-[var(--warm-100)] transition-colors"
              >
                Save
              </button>
            </div>
          }
        />
        <SettingsRow
          label="Save location"
          sub="~/Memo/recordings"
          control={
            <button className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-sm text-[var(--text-strong)] hover:bg-[var(--warm-100)] transition-colors">Change</button>
          }
        />
      </div>
    </ModalShell>
  );
}

function SettingsRow({ label, sub, control }: { label: string; sub?: string; control: ReactNode }) {
  return (
    <div className="flex items-center gap-3.5 py-3.5 border-b border-[var(--border-subtle)]">
      <div className="flex-1">
        <div className="text-sm font-medium text-[var(--text-strong)]">{label}</div>
        {sub && <div className="text-[12.5px] text-[var(--text-muted)] mt-0.5">{sub}</div>}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}
