
import { useMemo } from "react";

interface WaveformProps {
  n?: number;
  live?: boolean;
  color?: string;
  height?: number;
  width?: number;
  seed?: number;
}

export function Waveform({ n = 48, live = false, color = "var(--accent-400)", height = 28, width, seed = 1 }: WaveformProps) {
  const bars = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      const x = i / Math.max(1, n - 1);
      const jitter = Math.abs(Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453 % 1);
      const env =
        0.58 +
        0.32 * Math.sin(x * 7.0 + seed * 1.7) +
        0.21 * Math.sin(x * 17.3 + seed * 3.1) +
        0.13 * Math.sin(x * 41.0 + seed * 5.3);
      const h = Math.pow(Math.abs(env) * (0.6 + 0.4 * jitter), 0.82);
      out.push(Math.max(0.18, Math.min(1, h)));
    }
    return out;
  }, [n, seed]);

  return (
    <div className="flex items-center" style={{ gap: width ? 2 : 1.5, height, width: width || "100%" }}>
      {bars.map((h, i) => (
        <span
          key={i}
          className={live ? "animate-wave-bar" : ""}
          style={{
            flex: width ? "0 0 auto" : 1,
            width: width ? Math.max(2, (width - n * 2) / n) : undefined,
            height: `${h * 100}%`,
            minHeight: 2,
            borderRadius: 999,
            background: color,
            animationDelay: live ? `${(i % 12) * 70}ms` : undefined,
          }}
        />
      ))}
    </div>
  );
}
