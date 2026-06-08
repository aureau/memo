
import { useState, useRef, useEffect, useCallback } from "react";
import { deleteMeeting as deleteMeetingCommand, listMeetings, renameMeeting as renameMeetingCommand, saveMeeting, seedMeetings as seedMeetingsCommand } from "@/lib/api";
import { seedMeetings as seedMeetingData } from "@/lib/data";
import { Meeting, formatTime } from "@/lib/types";
import { Home } from "./home";
import { MeetingView } from "./meeting-view";
import { RecordFab } from "./record-fab";
import { RecordSourcePopup } from "./record-source-popup";
import { RecordingBar } from "./recording-bar";
import { ImportModal, SettingsModal } from "./modals";
import { FileText, Import, Settings } from "./icons";
import {
  RecordingSessionDto,
  discardRecording as discardNativeRecording,
  getRecordingStatus,
  pauseRecording as pauseNativeRecording,
  recordingSourceLabel,
  resumeRecording as resumeNativeRecording,
  startRecording as startNativeRecording,
  stopRecording as stopNativeRecording,
  toRecordingSource,
} from "@/lib/recording";

function nowClock(): string {
  const d = new Date();
  let h = d.getHours();
  const m = d.getMinutes();
  const ap = h >= 12 ? "p" : "a";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")}${ap}`;
}

function nowDateLabel(): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date());
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DemoDataButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="absolute left-6 bottom-6 z-40">
      <button
        onClick={onClick}
        aria-label="Load demo data"
        className="h-11 px-4 rounded-full bg-[var(--surface-card)] border border-[var(--border-subtle)] text-[var(--text-muted)] shadow-sm hover:bg-[var(--warm-100)] hover:text-[var(--text-strong)] flex items-center gap-2 transition-colors"
      >
        <span className="w-[16px] h-[16px] inline-flex">
          <FileText />
        </span>
        <span className="text-sm font-medium">Load demo data</span>
      </button>
    </div>
  );
}

export function App() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"home" | "meeting">("home");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeRecording, setActiveRecording] = useState<RecordingSessionDto | null>(null);
  const [recordPrompt, setRecordPrompt] = useState(false);
  const [overlay, setOverlay] = useState<"import" | "settings" | null>(null);
  const [toast, setToast] = useState<{ tone: string; title: string; meta?: string } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<NodeJS.Timeout | null>(null);

  const selected = meetings.find((m) => m.id === selectedId) || null;
  const recording = activeRecording !== null;

  const showToast = useCallback((t: { tone: string; title: string; meta?: string }) => {
    setToast(t);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const openMeeting = (m: Meeting) => { setSelectedId(m.id); setView("meeting"); };
  const goHome = () => setView("home");

  const loadDemoData = async () => {
    try {
      const next = await seedMeetingsCommand(seedMeetingData);
      setMeetings(next);
      setSelectedId(null);
      setQuery("");
      setView("home");
      showToast({ tone: "success", title: "Demo data loaded", meta: `${seedMeetingData.length} meetings` });
    } catch (error) {
      showToast({ tone: "info", title: "Could not seed SQLite", meta: String(error) });
    }
  };

  const startRecording = () => { setOverlay(null); setView("home"); setRecordPrompt(true); };
  const beginRecording = async (src: string) => {
    setRecordPrompt(false);
    setView("home");
    try {
      const session = await startNativeRecording(toRecordingSource(src));
      setActiveRecording(session);
      showToast({ tone: "info", title: "Recording started", meta: src });
    } catch (error) {
      showToast({ tone: "info", title: "Recording failed", meta: String(error) });
    }
  };
  const cancelPrompt = () => setRecordPrompt(false);

  const stopRecording = async () => {
    if (!activeRecording) return;
    const sessionId = activeRecording.id;
    setActiveRecording({ ...activeRecording, status: "finalizing" });
    try {
      const artifact = await stopNativeRecording(sessionId);
      const m: Meeting = {
        id: artifact.meetingId || artifact.id,
        title: "New recording",
        day: "Today",
        date: nowDateLabel(),
        time: nowClock(),
        duration: formatTime(Math.max(artifact.durationS, 1)),
        size: formatBytes(artifact.sizeBytes),
        status: "untranscribed",
        source: recordingSourceLabel(artifact.source),
        tags: [],
        transcript: null,
        firstLine: `Audio saved: ${artifact.filePath}`,
      };
      setActiveRecording(null);
      setMeetings((list) => [m, ...list]);
      const saved = await saveMeeting(m);
      setMeetings((list) => list.map((x) => x.id === m.id ? saved : x));
      showToast({ tone: "success", title: "Recording saved", meta: formatBytes(artifact.sizeBytes) });
    } catch (error) {
      setActiveRecording(null);
      showToast({ tone: "info", title: "Recording failed", meta: String(error) });
    }
  };

  const pauseRecording = async () => {
    if (!activeRecording) return;
    try {
      setActiveRecording(await pauseNativeRecording(activeRecording.id));
    } catch (error) {
      showToast({ tone: "info", title: "Pause failed", meta: String(error) });
    }
  };

  const resumeRecording = async () => {
    if (!activeRecording) return;
    try {
      setActiveRecording(await resumeNativeRecording(activeRecording.id));
    } catch (error) {
      showToast({ tone: "info", title: "Resume failed", meta: String(error) });
    }
  };

  const cancelRecording = async () => {
    if (!activeRecording) return;
    try {
      await discardNativeRecording(activeRecording.id);
    } catch (error) {
      showToast({ tone: "info", title: "Discard failed", meta: String(error) });
      return;
    }
    setActiveRecording(null);
    showToast({ tone: "info", title: "Recording discarded" });
  };

  const deleteMeeting = () => {
    if (!selected) return;
    void deleteMeetingCommand(selected.id).catch((error) => {
      showToast({ tone: "info", title: "Could not delete meeting", meta: String(error) });
    });
    setMeetings((list) => list.filter((m) => m.id !== selected.id));
    setView("home");
    showToast({ tone: "info", title: "Meeting deleted" });
  };

  const renameMeeting = (id: string, title: string) => {
    const t = (title || "").trim();
    if (!t) return;
    setMeetings((list) => list.map((m) => m.id === id ? { ...m, title: t } : m));
    void renameMeetingCommand(id, t)
      .then((updated) => {
        setMeetings((list) => list.map((m) => m.id === id ? updated : m));
      })
      .catch((error) => {
        showToast({ tone: "info", title: "Could not rename meeting", meta: String(error) });
      });
  };

  const deleteMeetingById = (id: string) => {
    void deleteMeetingCommand(id).catch((error) => {
      showToast({ tone: "info", title: "Could not delete meeting", meta: String(error) });
    });
    setMeetings((list) => list.filter((m) => m.id !== id));
    if (selectedId === id) setView("home");
    showToast({ tone: "info", title: "Meeting deleted" });
  };

  const runCommand = (id: string) => {
    setQuery("");
    if (id === "record") startRecording();
    else if (id === "import") setOverlay("import");
    else if (id === "settings") setOverlay("settings");
  };

  useEffect(() => {
    let cancelled = false;

    async function loadMeetings() {
      try {
        let next = await listMeetings();
        if (next.length === 0) {
          next = await seedMeetingsCommand(seedMeetingData);
        }

        if (!cancelled) setMeetings(next);
      } catch (error) {
        if (!cancelled) {
          showToast({ tone: "info", title: "Could not load SQLite data", meta: String(error) });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadMeetings();

    return () => { cancelled = true; };
  }, [showToast]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") { e.preventDefault(); setView("home"); setTimeout(() => searchRef.current?.focus(), 0); }
      else if (meta && e.key.toLowerCase() === "r") { e.preventDefault(); if (!recording && !recordPrompt) startRecording(); }
      else if (e.key === "Escape" && view === "meeting" && !overlay) { goHome(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [recording, view, overlay, recordPrompt]);

  useEffect(() => {
    if (!activeRecording) return;

    const id = window.setInterval(() => {
      getRecordingStatus(activeRecording.id)
        .then(setActiveRecording)
        .catch(() => {});
    }, 1000);

    return () => window.clearInterval(id);
  }, [activeRecording?.id]);

  const dimmed = recording || recordPrompt;

  return (
    <div className="w-full h-screen bg-[var(--bg-app)] overflow-hidden flex flex-col relative">
      {/* toolbar buttons - positioned top-right */}
      <div className="absolute top-2 right-3 flex items-center gap-2 z-20">
        <button onClick={() => setOverlay("import")} aria-label="Import audio" className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--warm-100)] transition-colors">
          <span className="w-[17px] h-[17px] inline-flex"><Import /></span>
        </button>
        <button onClick={() => setOverlay("settings")} aria-label="Settings" className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--warm-100)] transition-colors">
          <span className="w-[17px] h-[17px] inline-flex"><Settings /></span>
        </button>
      </div>

      {/* body */}
      <div className="flex-1 min-h-0 flex relative">
        {view === "home" ? (
          <Home meetings={meetings} query={query} setQuery={setQuery} onOpen={openMeeting} onRun={runCommand} onRename={renameMeeting} onDeleteRow={deleteMeetingById} searchRef={searchRef} />
        ) : selected ? (
          <MeetingView m={selected} onBack={goHome} onDelete={deleteMeeting} />
        ) : (
          <Home meetings={meetings} query={query} setQuery={setQuery} onOpen={openMeeting} onRun={runCommand} onRename={renameMeeting} onDeleteRow={deleteMeetingById} searchRef={searchRef} />
        )}

        {!loading && !recording && !overlay && view === "home" && meetings.length === 0 && <DemoDataButton onClick={loadDemoData} />}
        {!recording && !overlay && view === "home" && <RecordFab onClick={startRecording} />}
        {recordPrompt && !recording && <RecordSourcePopup onPick={beginRecording} onCancel={cancelPrompt} />}
        {dimmed && <div className="absolute inset-0 bg-black/20 z-30" onMouseDown={recordPrompt && !recording ? cancelPrompt : undefined} />}
      </div>

      {/* floating recorder */}
      {activeRecording && (
        <RecordingBar
          session={activeRecording}
          onPause={pauseRecording}
          onResume={resumeRecording}
          onStop={stopRecording}
          onCancel={cancelRecording}
          source={recordingSourceLabel(activeRecording.source)}
        />
      )}

      {/* overlays */}
      {overlay === "import" && <ImportModal onClose={() => setOverlay(null)} />}
      {overlay === "settings" && <SettingsModal onClose={() => setOverlay(null)} />}

      {/* toast */}
      {toast && (
        <div className="absolute left-1/2 bottom-6 -translate-x-1/2 z-[60]">
          <div className={`px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 ${toast.tone === "success" ? "bg-[var(--success)] text-white" : "bg-[var(--surface-card)] border border-[var(--border-subtle)] text-[var(--text-strong)]"}`}>
            {toast.title}
            {toast.meta && <span className="text-xs opacity-70">{toast.meta}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
