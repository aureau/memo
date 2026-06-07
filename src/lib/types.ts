export type MeetingStatus = "transcribed" | "transcribing" | "untranscribed";

export interface TranscriptSegment {
  t: string;
  who: string;
  text: string;
  chapter?: string;
}

export interface MeetingTag {
  label: string;
  color: string;
}

export interface Meeting {
  id: string;
  title: string;
  day: string;
  date: string;
  time: string;
  duration: string;
  size: string;
  status: MeetingStatus;
  source: string;
  tags: MeetingTag[];
  transcript: TranscriptSegment[] | null;
  notes?: string;
  firstLine?: string;
}

export interface Command {
  id: string;
  label: string;
  icon: React.FC;
  hint?: string;
  kw: string;
}

export interface StatusMeta {
  tone: string;
  label: string;
  color: string;
}

export function statusInfo(status: MeetingStatus): StatusMeta {
  const map: Record<MeetingStatus, StatusMeta> = {
    transcribed: { tone: "success", label: "Transcribed", color: "var(--success)" },
    transcribing: { tone: "warning", label: "Transcribing…", color: "var(--warning)" },
    untranscribed: { tone: "neutral", label: "Not transcribed", color: "var(--warm-400)" },
  };
  return map[status];
}

export function durToSec(d: string): number {
  const [m, s] = d.split(":").map(Number);
  return m * 60 + s;
}

export function formatTime(sec: number): string {
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}

export const LONG_SEC = 20 * 60;
