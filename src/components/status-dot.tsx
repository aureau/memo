
import { MeetingStatus, statusInfo } from "@/lib/types";

export function StatusDot({ status, size = 7 }: { status: MeetingStatus; size?: number }) {
  const s = statusInfo(status);
  return (
    <span
      title={s.label}
      className={status === "transcribing" ? "animate-pulse" : ""}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: s.color,
        display: "inline-block",
        flexShrink: 0,
      }}
    />
  );
}
