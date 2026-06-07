import { Meeting, TranscriptSegment } from "./types";

const productSync: TranscriptSegment[] = [
  { t: "00:00", who: "Sara Lin", text: "Okay, let's keep this short. Where are we on the transcription provider — did we land on Groq or Deepgram?" },
  { t: "00:14", who: "Dev Kapoor", text: "Leaning Groq for the free tier and speed. We batch after the recording stops, stitch the segments, and cache in SQLite so we never re-transcribe." },
  { t: "00:41", who: "Sara Lin", text: "And the bundle stays small — that's the whole point. No multi-gig model shipped with the app." },
  { t: "00:55", who: "Dev Kapoor", text: "Right. Under 20 megs. Recording is local and off-thread in Rust, so the UI never blocks while we capture." },
  { t: "01:18", who: "Sara Lin", text: "Good. Let's cap recordings at sixty minutes for the MVP and revisit once streaming is in." },
  { t: "01:33", who: "Dev Kapoor", text: "Already enforced. Chunks write to disk every thirty seconds, so a crash mid-recording is recoverable." },
  { t: "04:12", who: "Sara Lin", text: "Let's talk bundle. What is actually shipping in the binary versus downloaded on first run?", chapter: "Bundle size & local-first" },
  { t: "04:30", who: "Dev Kapoor", text: "Only the app and the SQLite layer. Transcription is an API call, so there's no model weight in the download. First run is instant." },
  { t: "05:02", who: "Sara Lin", text: "And offline? If someone records on a plane?" },
  { t: "05:11", who: "Dev Kapoor", text: "Audio saves locally regardless. The transcript just queues and runs the next time we have a connection. We show a calm 'will transcribe when online' state." },
  { t: "11:30", who: "Sara Lin", text: "On the sixty-minute cap — is that a hard stop or a warning?", chapter: "60-minute cap" },
  { t: "11:44", who: "Dev Kapoor", text: "Soft. At fifty-five we show a gentle banner; at sixty we auto-split into a second file so nothing is ever lost." },
  { t: "12:10", who: "Sara Lin", text: "I like that. Losing audio is the one thing we can never do." },
  { t: "18:05", who: "Dev Kapoor", text: "Last thing — crash recovery. If the app dies mid-recording, we reopen straight into the in-progress session.", chapter: "Crash recovery & next steps" },
  { t: "18:32", who: "Sara Lin", text: "Perfect. Let's ship that for the MVP and write up the retry-with-backoff for failed uploads." },
  { t: "19:01", who: "Dev Kapoor", text: "On it. I'll have the recovery flow in review by Thursday." },
];

const mentor: TranscriptSegment[] = [
  { t: "00:00", who: "You", text: "Thanks for making time — wanted to walk through where I'm at on the intake tool and get unblocked on a couple things." },
  { t: "00:12", who: "Priya (mentor)", text: "Of course. Start with what's blocking you, then we'll zoom out to the bigger picture." },
  { t: "00:25", who: "You", text: "Main one is the data model. I have meetings and transcripts, but I'm not sure where tags should live." },
  { t: "00:40", who: "Priya (mentor)", text: "Keep tags as their own table with a join. You'll thank yourself when you want to filter later. Don't stuff them into a JSON column." },
  { t: "01:05", who: "You", text: "That makes sense. And for the transcript itself — one big blob or per-segment rows?" },
  { t: "01:18", who: "Priya (mentor)", text: "Per segment. You want timestamps to be queryable so playback can sync. Blobs feel easy now and hurt later." },
  { t: "01:40", who: "You", text: "Got it. I'll refactor before I add the search feature then." },
  { t: "01:52", who: "Priya (mentor)", text: "Exactly. Do the boring schema work first. Want to send me the migration before you run it?" },
];

const standup: TranscriptSegment[] = [
  { t: "00:00", who: "Dev Kapoor", text: "Quick one. Yesterday I finished the audio capture loop, today I'm on the SQLite schema, no blockers." },
  { t: "00:11", who: "Mara Reyes", text: "I'm wrapping the library layout, then picking up the empty states. Might need a design review this afternoon." },
  { t: "00:24", who: "You", text: "I'll take the import flow today. One question on file size limits but I'll catch Dev after." },
];

export const GROUPS = ["Today", "Yesterday", "Earlier"];

export const seedMeetings: Meeting[] = [
  {
    id: "m1", title: "Weekly product sync", day: "Today", date: "Jun 5", time: "9:30a",
    duration: "24:31", size: "18.4 MB", status: "transcribed", source: "Microphone",
    tags: [{ label: "1:1", color: "var(--accent-500)" }, { label: "product", color: "var(--blue-500)" }],
    transcript: productSync,
    notes: "Decision: Groq for transcription (free tier, fast). 60-min soft cap, auto-split at the limit. Recording stays local + off-thread. Next: retry-with-backoff on failed uploads; crash-recovery flow in review Thursday.",
  },
  {
    id: "m2", title: "Mentor 1:1", day: "Today", date: "Jun 5", time: "2:00p",
    duration: "18:22", size: "13.7 MB", status: "transcribed", source: "Microphone",
    tags: [{ label: "1:1", color: "var(--accent-500)" }, { label: "mentor", color: "var(--amber-500)" }],
    transcript: mentor,
    notes: "Schema advice: tags in their own table w/ a join (not JSON). Transcript per-segment, not a blob, so timestamps stay queryable. Do schema work before search. Send migration to Priya before running.",
  },
  {
    id: "m3", title: "Design review — library", day: "Yesterday", date: "Jun 4", time: "11:00a",
    duration: "41:08", size: "31.2 MB", status: "transcribed", source: "System audio",
    tags: [{ label: "design", color: "var(--amber-500)" }],
    transcript: [
      { t: "00:00", who: "Mara Reyes", text: "Let's start with the library layout. The command-first home is feeling right — search leads, everything else gets out of the way." },
      { t: "09:20", who: "Mara Reyes", text: "Onto the meeting rows. Status dot, title, and the time on the right. Hover gives you the peek without opening.", chapter: "Meeting rows" },
      { t: "22:40", who: "Mara Reyes", text: "Empty states next. One warm line, one obvious action. No illustrations fighting for attention.", chapter: "Empty states" },
      { t: "34:10", who: "Mara Reyes", text: "Open questions: do chapters auto-open at twenty minutes, and is the hover a delay or a deliberate pause?", chapter: "Open questions" },
    ],
    notes: "Command-first home approved. Rows: dot + title + time. Hover peek. Chapters auto-open past 20 min. Decide hover timing.",
  },
  {
    id: "m4", title: "Onboarding interview — Theo", day: "Yesterday", date: "Jun 4", time: "3:15p",
    duration: "32:50", size: "24.0 MB", status: "transcribing", source: "Microphone",
    tags: [{ label: "research", color: "var(--green-500)" }],
    transcript: null,
    firstLine: "So tell me a bit about how your first week has gone so far…",
  },
  {
    id: "m5", title: "Eng standup", day: "Earlier", date: "Jun 3", time: "9:00a",
    duration: "08:12", size: "6.1 MB", status: "transcribed", source: "Microphone",
    tags: [{ label: "standup", color: "var(--green-500)" }],
    transcript: standup,
    notes: "Dev: capture loop done → schema today. Mara: library layout → empty states, wants design review PM. You: import flow today; ask Dev re: file size limits.",
  },
  {
    id: "m6", title: "Investor check-in", day: "Earlier", date: "Jun 2", time: "4:30p",
    duration: "27:44", size: "20.8 MB", status: "untranscribed", source: "System audio",
    tags: [],
    transcript: null,
    firstLine: "Thanks everyone for joining — quick update on traction and the roadmap.",
  },
];

seedMeetings.forEach((m) => {
  if (!m.firstLine) m.firstLine = m.transcript ? m.transcript[0].text : "";
});
