"use client";

import { presenceActif } from "@/lib/presence";
import { Presence } from "@/components/admin/Presence";

export default function AdminPresencePage() {
  if (!presenceActif()) {
    return (
      <div className="max-w-2xl">
        <h1 className="font-display text-2xl font-black uppercase text-ink md:text-4xl">Présence</h1>
        <p className="mt-4 rounded-xl border border-line bg-paper-2 p-4 text-sm text-smoke">
          Le module Présence est désactivé pour ce club.
        </p>
      </div>
    );
  }
  return <Presence />;
}
