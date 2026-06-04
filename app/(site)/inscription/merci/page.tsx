import type { Metadata } from "next";
import { Suspense } from "react";
import { MerciContent } from "./MerciContent";

export const metadata: Metadata = {
  title: "Inscription confirmée — Merci",
  robots: { index: false },
};

export default function MerciPage() {
  return (
    <Suspense fallback={null}>
      <MerciContent />
    </Suspense>
  );
}
