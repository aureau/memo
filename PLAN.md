# Memo — Meeting Recorder & Organizer

Lightweight native desktop app for recording, transcribing, and organizing meetings.
Built for internship use — fast information capture and retrieval.

---

## Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | Tauri 2 | ~10MB bundle, native APIs, Rust backend |
| Frontend | React + Tailwind | Fast to build, familiar, minimal overhead |
| Storage | SQLite (via Tauri plugin) | Single file, no server, ACID-compliant |
| Audio | Rust backend (`cpal` + platform APIs) | Off-thread recording, no JS bottleneck |
| Transcription | API-based (TBD) | Keep app bundle small, offload heavy compute |

---

## Transcription — API Approach

Going API-based keeps the app bundle under 20MB and avoids shipping a 1-3GB model.

### Why not local Whisper?

- `whisper.cpp` base model alone is ~140MB, medium is ~1.5GB, large is ~3GB
- Transcription speed on CPU: ~1x realtime for base, slower for larger models
- Would need GPU acceleration to be usable — not guaranteed on all machines
- App stops feeling "lightweight" the moment it ships a multi-GB model

### API Options (ranked by speed + accuracy)

| Service | Latency | Accuracy | Cost | Notes |
|---------|---------|----------|------|-------|
| **Deepgram** | Near real-time streaming | High (Nova-2 model) | $0.0043/min | WebSocket streaming, fastest responses |
| **AssemblyAI** | ~15-30% of audio duration | Very high | $0.0065/min | Best accuracy, async batch |
| **Groq (Whisper)** | Very fast (hardware-accelerated) | High | Free tier available | Runs Whisper on custom silicon, fast API |
| **OpenAI Whisper API** | ~30-50% of audio duration | High | $0.006/min | Familiar, reliable, 25MB file limit per request |

### Recommendation: Deepgram or Groq

- **Deepgram** if you want streaming (live transcript as you record) — WebSocket connection, results in <300ms
- **Groq** if you want cheapest/free with good speed — batched after recording ends

Either way: record locally, upload audio in chunks (5-10 min segments), stitch transcripts together.

### Keeping API calls minimal

- Only call transcription API once per recording (or per chunk for long recordings)
- Cache transcripts locally in SQLite — never re-transcribe the same audio
- No polling, no background sync — transcribe on-demand when recording stops
- Offline-first: app works without internet for recording/viewing, only needs connection for transcription

---

## Storage — SQLite Reliability

SQLite is used in production by:
- Every iPhone and Android device (contacts, messages, app data)
- Every major browser (Chrome, Firefox, Safari) for local storage
- Airbus, Bloomberg, Apple Mail

For your use case it's more than reliable:

- **ACID-compliant** — data doesn't corrupt on crash or power loss
- **WAL mode** — concurrent reads while writing, no blocking during long inserts
- **Backup** — single file, just copy it. Can automate to iCloud/Dropbox/external drive
- **Capacity** — handles databases up to 281 TB. Your transcripts won't come close

### Schema sketch

```sql
meetings
  id          TEXT PRIMARY KEY
  title       TEXT NOT NULL
  date        TEXT NOT NULL (ISO 8601)
  duration_s  INTEGER
  tags        TEXT (JSON array)
  notes       TEXT
  created_at  TEXT
  updated_at  TEXT

recordings
  id          TEXT PRIMARY KEY
  meeting_id  TEXT REFERENCES meetings(id)
  file_path   TEXT NOT NULL
  format      TEXT (wav, webm, etc.)
  size_bytes  INTEGER
  source      TEXT (microphone | system | import)

transcripts
  id          TEXT PRIMARY KEY
  meeting_id  TEXT REFERENCES meetings(id)
  content     TEXT NOT NULL
  segments    TEXT (JSON — timestamped segments for playback sync)
  model       TEXT (which API/model produced this)
  created_at  TEXT
```

Full-text search via SQLite FTS5 extension — fast search across all transcripts.

---

## Audio Architecture

### Recording constraints

- **Max duration**: 60 minutes (hard limit in MVP)
- **Format**: WAV for quality during recording, compress to Opus/WebM for storage
- **Sources**: Microphone OR system audio (not both simultaneously in MVP)
- **Memory**: Stream to disk in 30-second WAV chunks, never hold full recording in RAM

### Flow

```
[Start] → Rust captures audio → writes 30s chunks to temp dir
[Stop]  → concatenate chunks → compress to final format → store in app data dir
[Transcribe] → split into 5-10 min segments → send to API → stitch response → save to SQLite
```

### Import

- Accept: .wav, .mp3, .m4a, .webm, .ogg
- Validate duration ≤ 60 min
- Copy to app storage (don't reference external paths that might move)

---

## Additional Architecture Decisions

### File storage location

- Use Tauri's `app_data_dir` — OS-appropriate, backed up by system if user has cloud sync
- Structure: `app_data/recordings/{meeting_id}/audio.webm`
- Keeps SQLite DB and audio files together for easy backup

### Error handling / resilience

- If app crashes mid-recording: chunks already on disk, recoverable on next launch
- If transcription API fails: audio is saved, user can retry transcription later
- If network drops during upload: retry with exponential backoff, max 3 attempts

### Security

- API keys stored in system keychain (Tauri plugin) — not in config files
- Audio files are local-only, never uploaded anywhere except transcription API
- Transcription API receives audio, returns text — no data stored on their end (verify per provider ToS)

### What's NOT in MVP

- Real-time streaming transcription (live captions)
- Speaker diarization (who said what)
- Multiple audio sources simultaneously
- Cloud sync between devices
- Collaboration / sharing
- AI summaries or action items extraction

---

## Open Questions

1. **Which transcription API?** — Need to test Deepgram vs Groq for your typical meeting audio quality
2. **System audio capture on macOS** — Requires ScreenCaptureKit permissions, user grants on first use. Worth including in MVP or mic-only first?
3. **Transcript format** — Plain text with timestamps? Or richer format with paragraph breaks / speaker turns for future diarization?
4. **Backup strategy** — Auto-export SQLite + audio folder to a location, or leave it to the user?

---

## Implementation Roadmap

Frontend mockups are done (app.jsx, home.jsx, meeting.jsx, overlays.jsx, shared.jsx, icons.jsx, data.jsx).
Work below is backend-first — get the engine running, then plug the UI on top.

### Phase 1 — Foundation (do first, everything depends on it)

| # | Task | What it unblocks | Effort |
|---|------|-----------------|--------|
| 1 | Scaffold Tauri 2 + React + Tailwind project | Everything | ~1 hr |
| 2 | Port JSX mockups into the Tauri frontend (React components, routing, design system) | Having a visible app to wire commands into | ~2-3 hrs |
| 3 | SQLite setup — create DB, run migrations, CRUD commands (done) | Storage for all features | ~1-2 hrs |

**Phase 1 output**: App launches, shows the home screen with seed data from SQLite.

### Phase 2 — Core Recording (highest-risk, tackle early)

| # | Task | What it unblocks | Effort |
|---|------|-----------------|--------|
| 4 | Mic audio capture in Rust (`cpal`) — start/stop/pause, write WAV chunks to disk | The whole recording flow | ~3-4 hrs |
| 5 | System audio capture (macOS: ScreenCaptureKit, Windows: WASAPI) | "Record system audio" source option | ~3-5 hrs |
| 6 | Recording lifecycle — Tauri commands: `start_recording`, `stop_recording`, `pause`, `discard` | Frontend can control recording | ~1-2 hrs |
| 7 | Post-recording: concatenate chunks → compress to final format → write to app_data | Completed audio files ready for transcription | ~2 hrs |

**Phase 2 output**: Can record mic/system audio, see timer in UI, stop, and find the file on disk.

### Phase 3 — Transcription Pipeline

| # | Task | What it unblocks | Effort |
|---|------|-----------------|--------|
| 8 | Pick transcription API, get key, test with a sample file | Knowing the integration shape | ~1 hr |
| 9 | Rust transcription module — split audio into segments, upload, stitch response | Transcripts from recordings | ~3-4 hrs |
| 10 | Save transcript to SQLite with timestamped segments | Transcript viewer, search | ~1 hr |
| 11 | Wire status into frontend — "transcribing" → "ready" states | User sees progress | ~1 hr |

**Phase 3 output**: Record → stop → transcript appears in the meeting view.

### Phase 4 — Organization & Import

| # | Task | What it unblocks | Effort |
|---|------|-----------------|--------|
| 12 | Meeting list — fetch from SQLite, date grouping, search (FTS5) | Home screen is functional | ~2 hrs |
| 13 | Import flow — file picker, validate duration, copy to storage, trigger transcription | Import feature complete | ~2 hrs |
| 14 | Meeting metadata — rename, delete, tags | Full CRUD | ~1-2 hrs |

**Phase 4 output**: Full meeting library with search, import, and management.

### Phase 5 — Polish & Edge Cases

| # | Task | What it unblocks | Effort |
|---|------|-----------------|--------|
| 15 | 60-min hard cap — warn at 55, auto-stop at 60 | Recording limit enforced | ~30 min |
| 16 | Crash recovery — detect orphaned chunks on launch, offer to restore | Data safety | ~2 hrs |
| 17 | Offline queue — if no network at transcription time, queue and retry later | Offline-first promise | ~1-2 hrs |
| 18 | Settings — audio source preference, API key entry (keychain storage) | User configuration | ~1-2 hrs |

---

## Decisions (Locked)

| Decision | Choice | Notes |
|----------|--------|-------|
| System audio in MVP | **Yes** | Core use case — recording Zoom/Teams/Meet calls during internship |
| Transcription timing | **Auto-transcribe on stop** | Easiest to implement — no extra UI state. One path: stop → compress → upload → done |
| Audio storage format | **Compress to Opus/WebM** | ~30MB/hr vs 600MB/hr raw. Post-recording compression is near-instant for speech |
| Transcription upload strategy | **10-min chunked segments** | Progressive transcript delivery, avoids API file size limits |

---

## Starting Point

**Do these first, in this order:**

1. `cargo create-tauri-app memo` — scaffold with React + Tailwind
2. Drop in your JSX mockups, get the app rendering with seed data
3. Set up SQLite with the schema above
4. Start on mic recording in Rust

Once 1-3 are done (could be a single session), you have a visible app that displays meetings. Then recording is the real engineering challenge — everything else is wiring.
