import { invoke } from "@tauri-apps/api/core";
import { TranscriptSegment } from "./types";

export interface TranscriptDto {
  id: string;
  meetingId: string;
  content: string;
  segments: TranscriptSegment[];
  model: string;
  createdAt: string;
}

export async function transcribeAudio(meetingId: string, filePath: string): Promise<TranscriptDto> {
  return invoke<TranscriptDto>("transcribe_audio", {
    input: { meetingId, filePath },
  });
}

export async function setGroqApiKey(apiKey: string): Promise<void> {
  return invoke("set_groq_api_key", { apiKey });
}

export async function hasGroqApiKey(): Promise<boolean> {
  return invoke<boolean>("has_groq_api_key");
}
