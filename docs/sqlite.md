# sqlite storage

phase 1 uses rust-owned sqlite through tauri commands.

## why this approach

- `rusqlite` keeps migrations, validation, and crud in one backend layer.
- `tauri-plugin-sql` would be faster to wire, but would push sql into react and make deterministic unit tests harder.
- `sqlx` has stronger compile-time query tooling, but is heavier than needed for a single local sqlite file.
- `rusqlite` is pinned to `0.32` because the latest `libsqlite3-sys` build script needs a newer rust feature than this project toolchain supports.

## database file

- app runtime path: tauri `app_data_dir/memo.sqlite3`
- test path: in-memory sqlite
- pragmas: `foreign_keys = on`, `journal_mode = wal`, `synchronous = normal`

## schema

- `meetings`: the ui-facing meeting metadata, tags json, notes, first line, and stable sort order
- `recordings`: baseline table for phase 2 audio files
- `transcripts`: one transcript per meeting, with full text plus segment json
- `schema_migrations`: applied migration versions

tags and transcript segments stay as json for phase 1 so the current react `Meeting` contract remains stable. search can later add fts5 over `transcripts.content` without changing the home screen contract.

## commands

- `list_meetings`
- `get_meeting`
- `seed_meetings`
- `save_meeting`
- `rename_meeting`
- `delete_meeting`

react calls these through `src/lib/api.ts`.

## deterministic checks

run from `src-tauri`:

```bash
cargo test
```

the integration loop covers:

- migrations can rerun safely
- seed inserts are idempotent
- nested tags and transcript segments round-trip through sqlite
- rename and delete work through the repository
- invalid statuses are rejected before sql writes
