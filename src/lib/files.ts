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

export function shortenPath(path: string): string {
  const marker = "/recordings/rec_";
  const idx = path.indexOf(marker);
  if (idx !== -1) {
    const idStart = path.slice(idx + marker.length);
    const hash = idStart.slice(0, 5);
    return `…/recordings/rec_${hash}…`;
  }

  const parts = path.split("/");
  const dir = parts[parts.length - 2] ?? "";
  if (dir.startsWith("rec_") && dir.length > 9) {
    return `…/recordings/${dir.slice(0, 9)}…`;
  }

  const file = parts.pop() ?? path;
  return file.length > 24 ? `${file.slice(0, 23)}…` : file;
}
