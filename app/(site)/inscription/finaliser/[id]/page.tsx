"use client";

import { use } from "react";
import { FinaliserPaiement } from "@/components/inscription/FinaliserPaiement";

export default function FinaliserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <section className="container-px mx-auto max-w-2xl pt-28 pb-20">
      <FinaliserPaiement id={id} />
    </section>
  );
}
