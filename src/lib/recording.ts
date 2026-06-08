import { invoke } from "@tauri-apps/api/core";

export type RecordingSource = "microphone" | "system";
export type RecordingStatus = "recording" | "paused" | "finalizing";

export interface RecordingSessionDto {
  id: string;
  meetingId?: string | null;
  source: RecordingSource;
  status: RecordingStatus;
  startedAt: string;
  elapsedS: number;
  chunkCount: number;
}

export interface RecordingArtifactDto {
  id: string;
  meetingId?: string | null;
  filePath: string;
  format: string;
  sizeBytes: number;
  source: RecordingSource;
  durationS: number;
  createdAt: string;
}

export interface DiscardRecordingDto {
  id: string;
  discarded: boolean;
}

export function toRecordingSource(label: string): RecordingSource {
  return label.toLowerCase().includes("system") ? "system" : "microphone";
}

export function recordingSourceLabel(source: RecordingSource): string {
  return source === "system" ? "System audio" : "Microphone";
}

export async function startRecording(source: RecordingSource, meetingId?: string): Promise<RecordingSessionDto> {
  return invoke<RecordingSessionDto>("start_recording", {
    input: { source, meetingId },
  });
}

export async function pauseRecording(sessionId: string): Promise<RecordingSessionDto> {
  return invoke<RecordingSessionDto>("pause_recording", { sessionId });
}

export async function resumeRecording(sessionId: string): Promise<RecordingSessionDto> {
  return invoke<RecordingSessionDto>("resume_recording", { sessionId });
}

export async function stopRecording(sessionId: string): Promise<RecordingArtifactDto> {
  return invoke<RecordingArtifactDto>("stop_recording", { sessionId });
}

export async function discardRecording(sessionId: string): Promise<DiscardRecordingDto> {
  return invoke<DiscardRecordingDto>("discard_recording", { sessionId });
}

export async function getRecordingStatus(sessionId: string): Promise<RecordingSessionDto> {
  return invoke<RecordingSessionDto>("get_recording_status", { sessionId });
}
