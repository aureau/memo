import { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Base({ children, sw = 1.75, fill = "none", ...p }: IconProps & { sw?: number }) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill={fill} stroke="currentColor"
      strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" {...p}>
      {children}
    </svg>
  );
}

export function Mic(p: IconProps) {
  return <Base {...p}><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="22" /></Base>;
}

export function Search(p: IconProps) {
  return <Base {...p}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></Base>;
}

export function Settings(p: IconProps) {
  return <Base {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></Base>;
}

export function Play(p: IconProps) {
  return <Base {...p} fill="currentColor" sw={0}><polygon points="8 4 20 12 8 20" /></Base>;
}

export function Pause(p: IconProps) {
  return <Base {...p} fill="currentColor" sw={0}><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></Base>;
}

export function Plus(p: IconProps) {
  return <Base {...p}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></Base>;
}

export function Import(p: IconProps) {
  return <Base {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></Base>;
}

export function X(p: IconProps) {
  return <Base {...p}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></Base>;
}

export function Check(p: IconProps) {
  return <Base {...p} sw={2.25}><polyline points="20 6 9 17 4 12" /></Base>;
}

export function ChevronLeft(p: IconProps) {
  return <Base {...p}><polyline points="15 18 9 12 15 6" /></Base>;
}

export function ChevronDown(p: IconProps) {
  return <Base {...p}><polyline points="6 9 12 15 18 9" /></Base>;
}

export function Clock(p: IconProps) {
  return <Base {...p}><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></Base>;
}

export function Calendar(p: IconProps) {
  return <Base {...p}><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></Base>;
}

export function Trash(p: IconProps) {
  return <Base {...p}><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></Base>;
}

export function FileText(p: IconProps) {
  return <Base {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="13" y2="17" /></Base>;
}

export function Copy(p: IconProps) {
  return <Base {...p}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></Base>;
}

export function Pencil(p: IconProps) {
  return <Base {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></Base>;
}

export function Headphones(p: IconProps) {
  return <Base {...p}><path d="M3 14v-2a9 9 0 0 1 18 0v2" /><path d="M21 16a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 2zM3 16a2 2 0 0 0 2 2h1v-6H5a2 2 0 0 0-2 2z" /></Base>;
}

export function ListIcon(p: IconProps) {
  return <Base {...p}><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></Base>;
}

export function Enter(p: IconProps) {
  return <Base {...p}><polyline points="9 10 4 15 9 20" /><path d="M20 4v7a4 4 0 0 1-4 4H4" /></Base>;
}

export function ListTree(p: IconProps) {
  return <Base {...p}><path d="M21 12h-8" /><path d="M21 6H8" /><path d="M21 18h-8" /><path d="M3 6v4a2 2 0 0 0 2 2h3" /><path d="M3 12v4a2 2 0 0 0 2 2h3" /></Base>;
}

export function FolderOpen(p: IconProps) {
  return <Base {...p}><path d="M4 20h16" /><path d="M6 20V9l3-3h5l2 2h7v12H6z" /></Base>;
}
