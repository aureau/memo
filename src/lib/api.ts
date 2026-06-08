import { invoke } from "@tauri-apps/api/core";
import { Meeting } from "./types";

export function listMeetings(): Promise<Meeting[]> {
  return invoke<Meeting[]>("list_meetings");
}

export function getMeeting(id: string): Promise<Meeting | null> {
  return invoke<Meeting | null>("get_meeting", { id });
}

export function seedMeetings(meetings: Meeting[]): Promise<Meeting[]> {
  return invoke<Meeting[]>("seed_meetings", { meetings });
}

export function saveMeeting(meeting: Meeting): Promise<Meeting> {
  return invoke<Meeting>("save_meeting", { meeting });
}

export function renameMeeting(id: string, title: string): Promise<Meeting> {
  return invoke<Meeting>("rename_meeting", { id, title });
}

export function deleteMeeting(id: string): Promise<void> {
  return invoke<void>("delete_meeting", { id });
}
