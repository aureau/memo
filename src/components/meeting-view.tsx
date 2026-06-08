
import { useState, useRef, useMemo, useEffect } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Meeting, TranscriptSegment, durToSec, formatTime, statusInfo, LONG_SEC } from "@/lib/types";
import { resolveAudioPath } from "@/lib/files";
import { ChevronLeft, Calendar, Clock, Mic, Headphones, Copy, Trash, Plus, ListTree, Play, Pause, X } from "./icons";

function Meta({ m }: { m: Meeting }) {
  return (
    <div className="flex items-center gap-4 flex-wrap">
      <span className="inline-flex items-center gap-1.5 text-[13px] text-[var(--text-muted)] whitespace-nowrap">
        <span className="w-3.5 h-3.5 inline-flex text-[var(--text-faint)]"><Calendar /></span>
        {m.date}, 2026 · {m.time}
      </span>
      <span className="inline-flex items-center gap-1.5 font-mono text-[12.5px] text-[var(--text-muted)] whitespace-nowrap">
        <span className="w-3.5 h-3.5 inline-flex text-[var(--text-faint)]"><Clock /></span>
        {m.duration}
      </span>
      <span className="inline-flex items-center gap-1.5 text-[13px] text-[var(--text-muted)] whitespace-nowrap">
        <span className="w-3.5 h-3.5 inline-flex text-[var(--text-faint)]">{m.source === "Microphone" ? <Mic /> : <Headphones />}</span>
        {m.source}
      </span>
      <span className="font-mono text-[12.5px] text-[var(--text-faint)] whitespace-nowrap">{m.size}</span>
    </div>
  );
}

function Segment({ s, active, onJump, refCb }: { s: TranscriptSegment; active: boolean; onJump: () => void; refCb: (el: HTMLDivElement | null) => void }) {
  return (
    <div
      ref={refCb}
      onClick={onJump}
      className={`flex gap-4 px-3.5 py-3 rounded-lg cursor-pointer transition-colors hover:bg-[var(--warm-50)] ${active ? "bg-[var(--accent-tint)]" : ""}`}
    >
      <span className={`shrink-0 font-mono text-xs pt-0.5 ${active ? "text-[var(--accent-700)]" : "text-[var(--text-faint)]"}`}>{s.t}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-[var(--text-strong)] mb-0.5">{s.who}</div>
        <p className="m-0 text-[14.5px] leading-relaxed text-[var(--text-body)]">{s.text}</p>
      </div>
    </div>
  );
}

interface Chapter {
  t: string;
  title: string;
  segIdx: number;
}

function ChapterRail({ chapters, activeIdx, onJump, onClose, auto }: { chapters: Chapter[]; activeIdx: number; onJump: (i: number) => void; onClose: () => void; auto: boolean }) {
  return (
    <div className="w-[188px] shrink-0 border-l border-[var(--border-subtle)] bg-[var(--warm-50)] flex flex-col min-h-0">
      <div className="px-3.5 pt-4 pb-2 flex items-center gap-2">
        <span className="w-[15px] h-[15px] inline-flex text-[var(--text-faint)]"><ListTree /></span>
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-faint)] flex-1">Chapters</span>
        <button onClick={onClose} aria-label="Hide chapters" className="w-6 h-6 rounded flex items-center justify-center text-[var(--text-faint)] hover:bg-[var(--warm-200)] transition-colors">
          <span className="w-[13px] h-[13px] inline-flex"><X /></span>
        </button>
      </div>
      {auto && <div className="mx-3 mb-2 text-[11.5px] leading-snug text-[var(--text-faint)]">Opened automatically — this meeting runs over 20 min.</div>}
      <div className="flex-1 overflow-y-auto px-2 pb-3.5">
        {chapters.map((c, i) => (
          <button
            key={i}
            onClick={() => onJump(c.segIdx)}
            className={`w-full text-left px-2.5 py-2 rounded-lg mb-0.5 transition-colors hover:bg-[var(--warm-100)] ${i === activeIdx ? "bg-[var(--accent-tint)]" : ""}`}
          >
            <span className={`block font-mono text-[11px] ${i === activeIdx ? "text-[var(--accent-700)]" : "text-[var(--text-faint)]"}`}>{c.t}</span>
            <span className={`block text-[12.5px] font-medium leading-snug ${i === activeIdx ? "text-[var(--accent-800)]" : "text-[var(--text-body)]"}`}>{c.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Soundbars() {
  const bars = [
    { x: 3, y: 10, height: 6, delay: "0ms" },
    { x: 7, y: 9, height: 8, delay: "-160ms" },
    { x: 11, y: 10, height: 6, delay: "-320ms" },
    { x: 15, y: 8, height: 10, delay: "-480ms" },
    { x: 19, y: 9, height: 8, delay: "-640ms" },
  ];

  return (
    <span className="w-12 h-10 inline-flex items-center justify-center text-[var(--accent-500)] shrink-0" aria-hidden="true">
      <svg width="32" height="40" viewBox="0 0 24 24" fill="none">
        {bars.map((bar) => (
          <rect
            key={bar.x}
            x={bar.x}
            y={bar.y}
            width="2"
            height={bar.height}
            rx="1"
            className="memo-soundbar"
            style={{ animationDelay: bar.delay }}
          />
        ))}
      </svg>
    </span>
  );
}

function Scrubber({
  playing,
  currentS,
  durationS,
  onToggle,
}: {
  playing: boolean;
  currentS: number;
  durationS: number;
  onToggle: () => void;
}) {
  const total = Math.max(durationS, 1);
  return (
    <div className="shrink-0 pointer-events-none absolute inset-x-0 bottom-5 flex justify-center z-10">
      <div
        className={`pointer-events-auto flex items-center bg-[var(--warm-50)]/95 backdrop-blur-sm border border-[var(--border-subtle)] rounded-full shadow-[0_8px_24px_-8px_rgba(27,26,22,0.18)] transition-[width,padding,gap] duration-300 ease-out ${
          playing ? "gap-2 pl-1.5 pr-2.5 py-1.5 w-[min(210px,calc(100%-40px))]" : "gap-2.5 px-1.5 py-1.5"
        }`}
      >
        <button
          className="w-[38px] h-[38px] rounded-full bg-[var(--accent-500)] text-white flex items-center justify-center shrink-0 hover:bg-[var(--accent-600)] transition-colors"
          onClick={onToggle}
          aria-label={playing ? "Pause" : "Play"}
        >
          <span className="w-[16px] h-[16px] inline-flex items-center justify-center text-[16px]">{playing ? <Pause /> : <Play />}</span>
        </button>

        {playing ? (
          <>
            <span className="font-mono text-[12.5px] text-[var(--text-strong)] tabular-nums shrink-0">{formatTime(currentS)}</span>
            <Soundbars />
            <span className="font-mono text-[12.5px] text-[var(--text-faint)] shrink-0">{formatTime(total)}</span>
          </>
        ) : (
          <span className="font-mono text-[12.5px] text-[var(--text-strong)] tabular-nums pr-3">{formatTime(total)}</span>
        )}
      </div>
    </div>
  );
}

function ProcessingState({ m, onTranscribe }: { m: Meeting; onTranscribe?: () => void }) {
  const s = statusInfo(m.status);
  const transcribing = m.status === "transcribing";
  return (
    <div className="pt-[72px] px-5 text-center flex flex-col items-center gap-3">
      <span className={`${transcribing ? "animate-pulse" : ""} w-3 h-3 rounded-full`} style={{ background: s.color }} />
      <div className="text-base font-semibold text-[var(--text-strong)]">{transcribing ? "Transcribing…" : "Not transcribed yet"}</div>
      <div className="text-[13.5px] leading-relaxed text-[var(--text-muted)] max-w-[320px]">
        {transcribing
          ? "Your audio is safe. The transcript will appear here automatically when it finishes."
          : "Your audio is saved. Add a Groq API key in Settings, then transcribe when you're ready."}
      </div>
      {!transcribing && onTranscribe && (
        <button
          onClick={onTranscribe}
          className="mt-1 px-4 py-2 rounded-lg bg-[var(--accent-500)] text-white text-sm font-medium hover:bg-[var(--accent-600)] transition-colors"
        >
          Transcribe now
        </button>
      )}
    </div>
  );
}

export function MeetingView({ m, onBack, onDelete, onTranscribe }: { m: Meeting; onBack: () => void; onDelete: () => void; onTranscribe?: (meeting: Meeting) => void }) {
  const segs = m.transcript || [];
  const isLong = durToSec(m.duration) > LONG_SEC;

  const chapters = useMemo(() => {
    if (!segs.length) return [];
    const list: Chapter[] = [{ t: segs[0].t, title: "Intro", segIdx: 0 }];
    segs.forEach((s, i) => { if (s.chapter) list.push({ t: s.t, title: s.chapter, segIdx: i }); });
    return list.length > 1 ? list : [];
  }, [m.id]);
  const hasChapters = chapters.length > 0;

  const [tab, setTab] = useState<"transcript" | "notes">("transcript");
  const [playing, setPlaying] = useState(false);
  const [currentS, setCurrentS] = useState(0);
  const [durationS, setDurationS] = useState(durToSec(m.duration));
  const [activeSeg, setActiveSeg] = useState(0);
  const [railOpen, setRailOpen] = useState(isLong && hasChapters);
  const [resolvedAudioPath, setResolvedAudioPath] = useState<string | null>(m.audioPath ?? null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioSrc = resolvedAudioPath ? convertFileSrc(resolvedAudioPath) : null;

  useEffect(() => {
    let cancelled = false;
    void resolveAudioPath(m.id, m.audioPath).then((path) => {
      if (!cancelled) setResolvedAudioPath(path);
    });
    return () => { cancelled = true; };
  }, [m.id, m.audioPath]);

  useEffect(() => {
    setTab("transcript");
    setActiveSeg(0);
    setRailOpen(isLong && hasChapters);
    setPlaying(false);
    setCurrentS(0);
    setDurationS(durToSec(m.duration));
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [m.id, m.duration, isLong, hasChapters]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const segRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const jumpTo = (i: number) => {
    setActiveSeg(i);
    const seg = segs[i];
    if (seg && audioRef.current) {
      audioRef.current.currentTime = durToSec(seg.t);
      void audioRef.current.play();
    }
    const el = segRefs.current[i];
    const sc = scrollRef.current;
    if (el && sc) sc.scrollTo({ top: el.offsetTop - 16, behavior: "smooth" });
  };

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  };

  const activeChapter = useMemo(() => {
    let a = 0; chapters.forEach((c, i) => { if (c.segIdx <= activeSeg) a = i; }); return a;
  }, [activeSeg, chapters]);

  return (
    <div className="flex-1 min-w-0 flex min-h-0">
      {hasChapters && railOpen && (
        <style>{`button[aria-label="Import audio"], button[aria-label="Settings"] { display: none; }`}</style>
      )}
      <div className="relative flex-1 min-w-0 flex flex-col bg-[var(--bg-app)]">
        {audioSrc && (
          <audio
            ref={audioRef}
            src={audioSrc}
            preload="metadata"
            onLoadedMetadata={(e) => setDurationS(Math.floor(e.currentTarget.duration) || durToSec(m.duration))}
            onTimeUpdate={(e) => {
              const t = Math.floor(e.currentTarget.currentTime);
              setCurrentS(t);
              const idx = segs.findIndex((seg, i) => {
                const next = segs[i + 1];
                const start = durToSec(seg.t);
                const end = next ? durToSec(next.t) : Number.MAX_SAFE_INTEGER;
                return t >= start && t < end;
              });
              if (idx >= 0) setActiveSeg(idx);
            }}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
          />
        )}
        {/* header */}
        <div className="px-[30px] pt-4 shrink-0">
          <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text-strong)] transition-colors">
            <span className="w-[15px] h-[15px] inline-flex"><ChevronLeft /></span>
            Library
          </button>
          <div className="flex items-start gap-4 mt-2.5">
            <div className="flex-1 min-w-0">
              <h1 className="text-[30px] font-normal tracking-tight text-[var(--text-strong)] m-0 mb-3 leading-tight" style={{ fontFamily: "var(--font-display)" }}>{m.title}</h1>
              <Meta m={m} />
            </div>
            <div className="flex gap-2 shrink-0">
              {hasChapters && !railOpen && (
                <button onClick={() => setRailOpen(true)} aria-label="Show chapters" className="w-8 h-8 rounded-lg border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--warm-100)] transition-colors">
                  <span className="w-[17px] h-[17px] inline-flex"><ListTree /></span>
                </button>
              )}
              <button aria-label="Copy transcript" className="w-8 h-8 rounded-lg border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--warm-100)] transition-colors">
                <span className="w-[17px] h-[17px] inline-flex"><Copy /></span>
              </button>
              <button onClick={onDelete} aria-label="Delete" className="w-8 h-8 rounded-lg border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--warm-100)] transition-colors">
                <span className="w-[17px] h-[17px] inline-flex"><Trash /></span>
              </button>
            </div>
          </div>
          {/* tags */}
          <div className="flex items-center gap-2 mt-3.5">
            {(m.tags || []).map((t) => (
              <span key={t.label} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--warm-100)] text-xs text-[var(--text-muted)]">
                <span className="w-2 h-2 rounded-full" style={{ background: t.color }} />
                {t.label}
              </span>
            ))}
            <button className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-dashed border-[var(--border-strong)] text-xs text-[var(--text-faint)] hover:border-[var(--accent-400)] transition-colors">
              <span className="w-[11px] h-[11px] inline-flex"><Plus /></span>
              Add tag
            </button>
          </div>
          {/* tabs */}
          <div className="mt-4 flex gap-1 border-b border-[var(--border-subtle)]">
            <button
              onClick={() => setTab("transcript")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === "transcript" ? "border-[var(--accent-500)] text-[var(--accent-700)]" : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-strong)]"}`}
            >
              Transcript
            </button>
            <button
              onClick={() => setTab("notes")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === "notes" ? "border-[var(--accent-500)] text-[var(--accent-700)]" : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-strong)]"}`}
            >
              Notes
            </button>
          </div>
        </div>

        {/* body */}
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-5 py-2.5 pb-24">
          <div className="max-w-[680px] mx-auto">
            {tab === "transcript" ? (
              segs.length ? (
                segs.map((s, i) => (
                  <Segment key={i} s={s} active={i === activeSeg} onJump={() => jumpTo(i)} refCb={(el) => { segRefs.current[i] = el; }} />
                ))
              ) : (
                <ProcessingState m={m} onTranscribe={onTranscribe ? () => onTranscribe(m) : undefined} />
              )
            ) : (
              <div className="pt-3.5 px-3.5">
                {m.notes
                  ? <p className="text-[15px] leading-relaxed text-[var(--text-body)] m-0">{m.notes}</p>
                  : <p className="text-sm text-[var(--text-faint)] m-0">No notes yet.</p>}
              </div>
            )}
          </div>
        </div>

        {tab === "transcript" && segs.length > 0 && audioSrc && (
          <Scrubber playing={playing} currentS={currentS} durationS={durationS} onToggle={togglePlayback} />
        )}
      </div>

      {tab === "transcript" && hasChapters && railOpen && (
        <ChapterRail chapters={chapters} activeIdx={activeChapter} onJump={jumpTo} onClose={() => setRailOpen(false)} auto={isLong} />
      )}
    </div>
  );
}
