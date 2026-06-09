
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
import { Import, Settings } from "./icons";
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
import { transcribeAudio } from "@/lib/transcription";
import { resolveAudioPath, revealInFinder } from "@/lib/files";

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

const DEMO_IDS = new Set(seedMeetingData.map((m) => m.id));

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
  const [demoVisible, setDemoVisible] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<NodeJS.Timeout | null>(null);
  const userStoppingRef = useRef(false);
  const autoStoppingRef = useRef(false);

  const visibleMeetings = demoVisible ? meetings : meetings.filter((m) => !DEMO_IDS.has(m.id));
  const selected = visibleMeetings.find((m) => m.id === selectedId) || meetings.find((m) => m.id === selectedId) || null;
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
      setDemoVisible(true);
      setSelectedId(null);
      setQuery("");
      setView("home");
      showToast({ tone: "success", title: "Demo data loaded", meta: `${seedMeetingData.length} meetings` });
    } catch (error) {
      showToast({ tone: "info", title: "Could not seed SQLite", meta: String(error) });
    }
  };

  const hideDemoData = () => {
    setDemoVisible(false);
    if (selectedId && DEMO_IDS.has(selectedId)) {
      setSelectedId(null);
      setView("home");
    }
    showToast({ tone: "info", title: "Demo data hidden" });
  };

  const startRecording = () => { setOverlay(null); setView("home"); setRecordPrompt(true); };
  const beginRecording = async (src: string) => {
    setRecordPrompt(false);
    setView("home");
    userStoppingRef.current = false;
    autoStoppingRef.current = false;
    try {
      const session = await startNativeRecording(toRecordingSource(src));
      setActiveRecording(session);
      showToast({ tone: "info", title: "Recording started", meta: src });
    } catch (error) {
      showToast({ tone: "info", title: "Recording failed", meta: String(error) });
    }
  };
  const cancelPrompt = () => setRecordPrompt(false);

  const runTranscription = useCallback((meeting: Meeting, filePath: string) => {
    void transcribeAudio(meeting.id, filePath)
      .then(async (result) => {
        const updated: Meeting = {
          ...meeting,
          status: "transcribed",
          transcript: result.segments,
          firstLine: result.segments[0]?.text ?? meeting.firstLine ?? "",
        };
        const saved = await saveMeeting(updated);
        setMeetings((list) => list.map((m) => m.id === meeting.id ? saved : m));
        showToast({ tone: "success", title: "Transcript ready" });
      })
      .catch(async (error) => {
        const updated: Meeting = { ...meeting, status: "untranscribed" };
        try {
          const saved = await saveMeeting(updated);
          setMeetings((list) => list.map((m) => m.id === meeting.id ? saved : m));
        } catch {
          setMeetings((list) => list.map((m) => m.id === meeting.id ? updated : m));
        }
        showToast({ tone: "info", title: "Transcription failed", meta: String(error) });
      });
  }, [showToast]);

  const stopRecording = useCallback(async () => {
    if (!activeRecording) return;
    const sessionId = activeRecording.id;
    if (!autoStoppingRef.current) {
      userStoppingRef.current = true;
    }
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
        status: "transcribing",
        source: recordingSourceLabel(artifact.source),
        tags: [],
        transcript: null,
        audioPath: artifact.filePath,
        firstLine: "",
      };
      const wasAutoStop = autoStoppingRef.current;
      setActiveRecording(null);
      userStoppingRef.current = false;
      autoStoppingRef.current = false;
      setMeetings((list) => [m, ...list]);
      showToast({
        tone: "info",
        title: "Recording saved",
        meta: wasAutoStop ? "60 min limit reached" : "transcribing…",
      });
      const saved = await saveMeeting(m);
      setMeetings((list) => list.map((x) => x.id === m.id ? saved : x));
      runTranscription(saved, artifact.filePath);
    } catch (error) {
      setActiveRecording(null);
      userStoppingRef.current = false;
      autoStoppingRef.current = false;
      showToast({ tone: "info", title: "Recording failed", meta: String(error) });
    }
  }, [activeRecording, runTranscription, showToast]);

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

  const transcribeMeeting = useCallback((meeting: Meeting) => {
    if (!meeting.audioPath) {
      showToast({ tone: "info", title: "No audio file", meta: "Record audio first" });
      return;
    }
    const pending: Meeting = { ...meeting, status: "transcribing", transcript: null };
    setMeetings((list) => list.map((m) => m.id === meeting.id ? pending : m));
    showToast({ tone: "info", title: "Transcribing…" });
    void saveMeeting(pending)
      .then((saved) => {
        setMeetings((list) => list.map((m) => m.id === meeting.id ? saved : m));
        runTranscription(saved, saved.audioPath!);
      })
      .catch((error) => {
        showToast({ tone: "info", title: "Could not start transcription", meta: String(error) });
      });
  }, [runTranscription, showToast]);

  const showInFinder = useCallback((meeting: Meeting) => {
    void resolveAudioPath(meeting.id, meeting.audioPath)
      .then(async (path) => {
        if (!path) {
          showToast({ tone: "info", title: "No audio file found" });
          return;
        }
        await revealInFinder(path);
      })
      .catch((error) => {
        showToast({ tone: "info", title: "Could not open Finder", meta: String(error) });
      });
  }, [showToast]);

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
        const next = await listMeetings();
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
        .then((session) => {
          setActiveRecording(session);
          if (
            session.status === "finalizing" &&
            !userStoppingRef.current &&
            !autoStoppingRef.current
          ) {
            autoStoppingRef.current = true;
            void stopRecording();
          }
        })
        .catch(() => {});
    }, 1000);

    return () => window.clearInterval(id);
  }, [activeRecording?.id, stopRecording]);

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
          <Home
            meetings={visibleMeetings}
            query={query}
            setQuery={setQuery}
            onOpen={openMeeting}
            onRun={runCommand}
            onRename={renameMeeting}
            onDeleteRow={deleteMeetingById}
            onShowInFinder={showInFinder}
            searchRef={searchRef}
            demoVisible={demoVisible}
            onLoadDemo={!loading ? loadDemoData : undefined}
            onHideDemo={hideDemoData}
          />
        ) : selected ? (
          <MeetingView m={selected} onBack={goHome} onDelete={deleteMeeting} onTranscribe={transcribeMeeting} />
        ) : (
          <Home
            meetings={visibleMeetings}
            query={query}
            setQuery={setQuery}
            onOpen={openMeeting}
            onRun={runCommand}
            onRename={renameMeeting}
            onDeleteRow={deleteMeetingById}
            onShowInFinder={showInFinder}
            searchRef={searchRef}
            demoVisible={demoVisible}
            onLoadDemo={!loading ? loadDemoData : undefined}
            onHideDemo={hideDemoData}
          />
        )}
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
