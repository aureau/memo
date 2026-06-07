
import { Mic } from "./icons";

export function RecordFab({ onClick }: { onClick: () => void }) {
  return (
    <div className="absolute right-6 bottom-6 z-40">
      <button
        onClick={onClick}
        aria-label="Start recording"
        className="w-14 h-14 rounded-full bg-[var(--accent-500)] hover:bg-[var(--accent-600)] text-white shadow-lg flex items-center justify-center transition-colors"
        title="Start recording (⌘R)"
      >
        <span className="w-[22px] h-[22px] inline-flex items-center justify-center text-[22px]">
          <Mic />
        </span>
      </button>
    </div>
  );
}
