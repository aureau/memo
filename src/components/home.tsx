
import { useState, useRef, useEffect, useMemo, useLayoutEffect } from "react";
import { Meeting } from "@/lib/types";
import { GROUPS, seedMeetings } from "@/lib/data";
import { statusInfo } from "@/lib/types";
import { StatusDot } from "./status-dot";
import { PreviewChip } from "./preview-chip";
import { Search, Mic, Import, Settings, Enter, FileText, Pencil, Copy, Trash } from "./icons";

interface Command {
  id: string;
  label: string;
  icon: React.FC;
  hint?: string;
  kw: string;
}

const COMMANDS: Command[] = [
  { id: "record", label: "Start recording", icon: Mic, hint: "⌘R", kw: "start recording new record audio mic" },
  { id: "import", label: "Import audio", icon: Import, kw: "import audio file upload open" },
  { id: "settings", label: "Settings", icon: Settings, kw: "settings preferences audio source transcription" },
];

interface HomeProps {
  meetings: Meeting[];
  query: string;
  setQuery: (q: string) => void;
  onOpen: (m: Meeting) => void;
  onRun: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDeleteRow: (id: string) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
}

export function Home({ meetings, query, setQuery, onOpen, onRun, onRename, onDeleteRow, searchRef }: HomeProps) {
  const [hovered, setHovered] = useState<Meeting | null>(null);
  const [active, setActive] = useState(0);
  const [menu, setMenu] = useState<{ m: Meeting; x: number; y: number } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const hoverRowEl = useRef<HTMLElement | null>(null);
  const hoverTimer = useRef<NodeJS.Timeout | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const q = query.trim().toLowerCase();
  const cmds = q ? COMMANDS.filter((c) => (c.label + " " + c.kw).toLowerCase().includes(q)) : [];
  const filtered = q ? meetings.filter((m) => m.title.toLowerCase().includes(q)) : meetings;

  type FlatItem = { kind: "cmd"; c: Command } | { kind: "m"; m: Meeting };
  const flat: FlatItem[] = useMemo(() => [
    ...cmds.map((c) => ({ kind: "cmd" as const, c })),
    ...filtered.map((m) => ({ kind: "m" as const, m })),
  ], [query, meetings]);

  useEffect(() => { setActive(0); }, [query]);

  const positionChip = () => {
    const el = hoverRowEl.current;
    const sc = scrollRef.current;
    const chip = chipRef.current;
    const root = rootRef.current;
    if (!el || !sc || !chip || !root) return;
    const gap = 7;
    const rowTop = el.offsetTop - sc.scrollTop;
    const chipH = chip.offsetHeight || 96;
    const below = rowTop + el.offsetHeight + gap;
    const flip = below + chipH > root.offsetHeight - 12;
    chip.style.top = (flip ? rowTop - chipH - gap : below) + "px";
    chip.style.left = el.offsetLeft + "px";
  };

  useLayoutEffect(() => { if (hovered) positionChip(); }, [hovered]);

  const onHover = (m: Meeting, el: HTMLElement) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverRowEl.current = el;
    hoverTimer.current = setTimeout(() => setHovered(m), 260);
  };
  const onLeave = () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); setHovered(null); };

  const closeMenu = () => setMenu(null);
  const openMenu = (m: Meeting, e: React.MouseEvent) => {
    e.preventDefault();
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setHovered(null);
    const root = rootRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const scale = rect.width / root.offsetWidth || 1;
    const MW = 176, MH = 112, pad = 10;
    let x = (e.clientX - rect.left) / scale;
    let y = (e.clientY - rect.top) / scale;
    x = Math.max(pad, Math.min(x, root.offsetWidth - MW - pad));
    y = Math.max(pad, Math.min(y, root.offsetHeight - MH - pad));
    setMenu({ m, x, y });
  };

  useEffect(() => {
    if (!menu) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(null); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [menu]);

  const runIndex = (i: number) => {
    const r = flat[i]; if (!r) return;
    if (r.kind === "cmd") onRun(r.c.id); else onOpen(r.m);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(flat.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); runIndex(active); }
  };

  let idx = -1;
  const next = () => ++idx;
  const empty = filtered.length === 0 && cmds.length === 0;

  return (
    <div ref={rootRef} className="flex-1 min-w-0 flex flex-col relative bg-[var(--bg-app)]">
      {/* command bar */}
      <div className="shrink-0 pt-4 px-6 pb-3.5 flex justify-center">
        <div className="w-full max-w-[560px]">
          <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-sm focus-within:border-[var(--accent-400)] transition-colors">
            <span className="w-[18px] h-[18px] inline-flex text-[var(--text-faint)]"><Search /></span>
            <input
              ref={searchRef}
              className="flex-1 bg-transparent border-none outline-none text-sm text-[var(--text-strong)] placeholder:text-[var(--text-faint)]"
              value={query}
              placeholder="Search meetings or type a command"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              aria-label="Search meetings or type a command"
            />
            {query ? (
              <button className="text-[var(--text-faint)] hover:text-[var(--text-muted)] text-lg leading-none" onClick={() => setQuery("")} aria-label="Clear">×</button>
            ) : (
              <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-[var(--warm-100)] text-[var(--text-faint)]">⌘K</span>
            )}
          </div>
        </div>
      </div>

      {/* results */}
      <div ref={scrollRef} onScroll={() => { positionChip(); if (menu) setMenu(null); }} className="flex-1 min-h-0 overflow-y-auto px-6 pt-1 pb-24">
        <div className="w-full max-w-[560px] mx-auto">
          {cmds.length > 0 && (
            <div className="mb-3.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-faint)] mb-1.5 px-1">Commands</div>
              <div className="flex flex-col gap-0.5">
                {cmds.map((c) => { const i = next(); return <CmdRow key={c.id} c={c} active={i === active} onRun={onRun} />; })}
              </div>
            </div>
          )}

          {!empty && filtered.length > 0 && (
            <>
              {!q && <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-faint)] mb-1.5 px-1">Recent</div>}
              {GROUPS.map((g) => {
                const rows = filtered.filter((m) => m.day === g);
                if (!rows.length) return null;
                return (
                  <div key={g} className="mb-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-faint)] mb-1.5 px-1">{g}</div>
                    <div className="flex flex-col gap-0.5">
                      {rows.map((m) => {
                        const i = next();
                        return (
                          <Row
                            key={m.id}
                            m={m}
                            active={i === active}
                            onOpen={onOpen}
                            onHover={onHover}
                            onLeave={onLeave}
                            onContext={openMenu}
                            renaming={renamingId === m.id}
                            onRenameCommit={(id, title) => { onRename(id, title); setRenamingId(null); }}
                            onRenameCancel={() => setRenamingId(null)}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {empty && (
            <div className="pt-[70px] text-center text-[var(--text-faint)]">
              <div className="w-[30px] h-[30px] mx-auto mb-3 text-[var(--warm-400)]"><Search /></div>
              <div className="text-sm text-[var(--text-muted)]">Nothing matches &quot;{query}&quot;.</div>
            </div>
          )}
        </div>
      </div>

      {/* hover peek */}
      {hovered && !menu && (
        <div ref={chipRef} className="absolute left-0 top-0 pointer-events-none z-30">
          <PreviewChip m={hovered} />
        </div>
      )}

      {/* context menu */}
      {menu && (
        <>
          <div onMouseDown={closeMenu} onContextMenu={(e) => { e.preventDefault(); closeMenu(); }} className="absolute inset-0 z-[75]" />
          <div className="absolute z-[80] w-[176px] bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-xl shadow-lg py-1.5" style={{ left: menu.x, top: menu.y }} role="menu" aria-label={menu.m.title}>
            <MenuItem icon={<FileText />} label="Open" onClick={() => { const m = menu.m; closeMenu(); onOpen(m); }} />
            <MenuItem icon={<Pencil />} label="Rename" onClick={() => { setRenamingId(menu.m.id); closeMenu(); }} />
            <MenuItem
              icon={<Copy />}
              label="Copy transcript"
              disabled={!(menu.m.transcript && menu.m.transcript.length)}
              onClick={() => {
                const m = menu.m; closeMenu();
                const text = (m.transcript || []).map((s) => `${s.t}  ${s.who}\n${s.text}`).join("\n\n");
                if (text && navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
              }}
            />
            <div className="my-1.5 mx-2.5 h-px bg-[var(--border-subtle)]" />
            <MenuItem icon={<Trash />} label="Delete" danger onClick={() => { const id = menu.m.id; closeMenu(); onDeleteRow(id); }} />
          </div>
        </>
      )}
    </div>
  );
}

function Row({ m, active, onOpen, onHover, onLeave, onContext, renaming, onRenameCommit, onRenameCancel }: {
  m: Meeting; active: boolean; onOpen: (m: Meeting) => void; onHover: (m: Meeting, el: HTMLElement) => void;
  onLeave: () => void; onContext: (m: Meeting, e: React.MouseEvent) => void;
  renaming: boolean; onRenameCommit: (id: string, title: string) => void; onRenameCancel: () => void;
}) {
  if (renaming) {
    return (
      <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[var(--accent-tint)]">
        <StatusDot status={m.status} />
        <input
          className="flex-1 bg-transparent border-none outline-none text-sm text-[var(--text-strong)]"
          autoFocus
          defaultValue={m.title}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); onRenameCommit(m.id, e.currentTarget.value); }
            else if (e.key === "Escape") { e.preventDefault(); onRenameCancel(); }
          }}
          onBlur={(e) => onRenameCommit(m.id, e.currentTarget.value)}
          aria-label="Rename meeting"
        />
        <span className="font-mono text-xs text-[var(--text-faint)] shrink-0 tabular-nums">{m.duration}</span>
      </div>
    );
  }

  return (
    <button
      onClick={() => onOpen(m)}
      onContextMenu={(e) => onContext(m, e)}
      onMouseEnter={(e) => onHover(m, e.currentTarget)}
      onMouseLeave={onLeave}
      onFocus={(e) => onHover(m, e.currentTarget)}
      onBlur={onLeave}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg w-full text-left transition-colors hover:bg-[var(--warm-100)] ${active ? "bg-[var(--accent-tint)]" : ""}`}
    >
      <StatusDot status={m.status} />
      <span className={`flex-1 min-w-0 truncate text-sm ${active ? "text-[var(--accent-800)]" : "text-[var(--text-strong)]"}`}>{m.title}</span>
      <span className="font-mono text-xs text-[var(--text-faint)] shrink-0 tabular-nums">{m.duration}</span>
      <span className="text-xs text-[var(--text-faint)] w-11 text-right shrink-0">{m.time}</span>
    </button>
  );
}

function CmdRow({ c, active, onRun }: { c: Command; active: boolean; onRun: (id: string) => void }) {
  return (
    <button
      onClick={() => onRun(c.id)}
      className={`flex items-center gap-3 px-3 py-2 rounded-lg w-full text-left transition-colors hover:bg-[var(--warm-100)] ${active ? "bg-[var(--accent-tint)]" : ""}`}
    >
      <span className={`w-[17px] h-[17px] inline-flex shrink-0 ${active ? "text-[var(--accent-700)]" : "text-[var(--text-muted)]"}`}><c.icon /></span>
      <span className={`flex-1 min-w-0 text-sm font-semibold ${active ? "text-[var(--accent-800)]" : "text-[var(--text-strong)]"}`}>{c.label}</span>
      {c.hint ? (
        <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-[var(--warm-100)] text-[var(--text-faint)]">{c.hint}</span>
      ) : (
        <span className="w-[15px] h-[15px] inline-flex text-[var(--text-faint)]"><Enter /></span>
      )}
    </button>
  );
}

function MenuItem({ icon, label, onClick, danger, disabled }: { icon: React.ReactNode; label: string; onClick?: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      className={`flex items-center gap-2.5 w-full px-3 py-1.5 text-sm transition-colors ${danger ? "text-[var(--danger)] hover:bg-[var(--danger-tint)]" : "text-[var(--text-strong)] hover:bg-[var(--warm-100)]"} ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
      role="menuitem"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      <span className="w-[15px] h-[15px] inline-flex shrink-0">{icon}</span>
      {label}
    </button>
  );
}
