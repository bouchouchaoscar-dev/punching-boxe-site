"use client";

import { useEffect, useRef, useState } from "react";

// Palette d'emojis curative (légère, sans dépendance) : sélection pertinente pour
// un club de boxe + emails (pas de picker Unicode complet, volontairement léger
// et dans la DA). Insertion au curseur via onPick.
const EMOJIS = [
  "🥊", "👊", "🥋", "🔥", "💪", "🏆", "🥇", "🏅",
  "⭐", "✨", "🎉", "🎊", "✅", "⚠️", "❌", "📣",
  "📢", "✉️", "📧", "📅", "🗓️", "⏰", "💰", "💳",
  "🤝", "👋", "🙌", "👏", "👍", "💯", "🚀", "🎯",
  "🙂", "😊", "😉", "😀", "❤️", "🧡", "💛", "📝",
];

export function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Insérer un emoji"
        title="Insérer un emoji"
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-white text-base transition-colors hover:border-orange"
      >
        🙂
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 w-[17rem] rounded-xl border border-line bg-white p-2 shadow-[0_20px_45px_-20px_rgba(0,0,0,0.3)]">
          <div className="grid grid-cols-8 gap-0.5">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  onPick(e);
                  setOpen(false);
                }}
                className="flex h-7 w-7 items-center justify-center rounded-md text-lg transition-colors hover:bg-paper-2"
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
