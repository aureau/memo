
import { useState, useRef, useEffect, useCallback } from "react";
import { Meeting } from "@/lib/types";
import { seedMeetings } from "@/lib/data";
import { formatTime } from "@/lib/types";
import { Home } from "./home";
import { MeetingView } from "./meeting-view";
import { RecordFab } from "./record-fab";
import { RecordSourcePopup } from "./record-source-popup";
import { RecordingBar } from "./recording-bar";
import { ImportModal, SettingsModal } from "./modals";
import { Import, Settings } from "./icons";

function nowClock(): string {
  const d = new Date();
  let h = d.getHours();
  const m = d.getMinutes();
  const ap = h >= 12 ? "p" : "a";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")}${ap}`;
}

export function App() {
  const [meetings, setMeetings] = useState<Meeting[]>(seedMeetings);
  const [view, setView] = useState<"home" | "meeting">("home");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordPrompt, setRecordPrompt] = useState(false);
  const [recordSource, setRecordSource] = useState("Microphone");
  const [overlay, setOverlay] = useState<"import" | "settings" | null>(null);
  const [toast, setToast] = useState<{ tone: string; title: string; meta?: string } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<NodeJS.Timeout | null>(null);

  const selected = meetings.find((m) => m.id === selectedId) || null;

  const showToast = useCallback((t: { tone: string; title: string; meta?: string }) => {
    setToast(t);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const openMeeting = (m: Meeting) => { setSelectedId(m.id); setView("meeting"); };
  const goHome = () => setView("home");

  const startRecording = () => { setOverlay(null); setView("home"); setRecordPrompt(true); };
  const beginRecording = (src: string) => { setRecordSource(src); setRecordPrompt(false); setRecording(true); };
  const cancelPrompt = () => setRecordPrompt(false);

  const stopRecording = (elapsed: number) => {
    setRecording(false);
    const id = "rec" + Date.now();
    const mb = (elapsed * 0.012 + 0.4).toFixed(1) + " MB";
    const m: Meeting = {
      id, title: "New recording", day: "Today", date: "Jun 5", time: nowClock(),
      duration: formatTime(Math.max(elapsed, 1)), size: mb, status: "transcribing", source: recordSource,
      tags: [], transcript: null, firstLine: "",
    };
    setMeetings((list) => [m, ...list]);
    showToast({ tone: "info", title: "Recording saved", meta: "transcribing…" });
    setTimeout(() => {
      setMeetings((list) => list.map((x) => x.id === id ? {
        ...x, status: "transcribed" as const,
        firstLine: "Alright, recording's going — let's pick up where we left off.",
        transcript: [
          { t: "00:00", who: "You", text: "Alright, recording's going — let's pick up where we left off." },
          { t: "00:09", who: "You", text: "Main thing I want to capture is the decision and the owner, so future-me isn't guessing." },
        ],
        notes: "",
      } : x));
      showToast({ tone: "success", title: "Transcript ready", meta: formatTime(Math.max(elapsed, 1)) });
    }, 3600);
  };

  const cancelRecording = () => { setRecording(false); showToast({ tone: "info", title: "Recording discarded" }); };

  const deleteMeeting = () => {
    if (!selected) return;
    setMeetings((list) => list.filter((m) => m.id !== selected.id));
    setView("home");
    showToast({ tone: "info", title: "Meeting deleted" });
  };

  const renameMeeting = (id: string, title: string) => {
    const t = (title || "").trim();
    if (!t) return;
    setMeetings((list) => list.map((m) => m.id === id ? { ...m, title: t } : m));
  };

  const deleteMeetingById = (id: string) => {
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
    const h = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") { e.preventDefault(); setView("home"); setTimeout(() => searchRef.current?.focus(), 0); }
      else if (meta && e.key.toLowerCase() === "r") { e.preventDefault(); if (!recording && !recordPrompt) startRecording(); }
      else if (e.key === "Escape" && view === "meeting" && !overlay) { goHome(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [recording, view, overlay, recordPrompt]);

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

        {!recording && !overlay && view === "home" && <RecordFab onClick={startRecording} />}
        {recordPrompt && !recording && <RecordSourcePopup onPick={beginRecording} onCancel={cancelPrompt} />}
        {dimmed && <div className="absolute inset-0 bg-black/20 z-30" onMouseDown={recordPrompt && !recording ? cancelPrompt : undefined} />}
      </div>

      {/* floating recorder */}
      {recording && <RecordingBar onStop={stopRecording} onCancel={cancelRecording} source={recordSource} />}

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

