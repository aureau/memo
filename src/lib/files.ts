import { invoke } from "@tauri-apps/api/core";

export async function resolveAudioPath(
  meetingId: string,
  audioPath?: string | null,
): Promise<string | null> {
  return invoke<string | null>("resolve_audio_path", {
    meetingId,
    audioPath: audioPath ?? null,
  });
}

export async function revealInFinder(path: string): Promise<void> {
  return invoke("reveal_in_finder", { path });
}

export function shortenPath(path: string, max = 52): string {
  if (path.length <= max) return path;
  const parts = path.split("/");
  const file = parts.pop() ?? path;
  const tail = parts.slice(-2).join("/");
  const prefix = tail ? `…/${tail}/` : "…/";
  const budget = Math.max(max - prefix.length, 8);
  if (file.length <= budget) return `${prefix}${file}`;
  return `${prefix}${file.slice(0, budget - 1)}…`;
}
