"use client";

import { use } from "react";
import { RegulariserPaiement } from "@/components/inscription/RegulariserPaiement";

export default function RegulariserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <section className="container-px mx-auto max-w-2xl pt-28 pb-20">
      <RegulariserPaiement id={id} />
    </section>
  );
}
