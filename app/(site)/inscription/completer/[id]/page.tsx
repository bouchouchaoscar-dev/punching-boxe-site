"use client";

import { use } from "react";
import { CompleterDossier } from "@/components/inscription/CompleterDossier";

export default function CompleterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <section className="container-px mx-auto max-w-2xl pt-28 pb-20">
      <CompleterDossier id={id} />
    </section>
  );
}
