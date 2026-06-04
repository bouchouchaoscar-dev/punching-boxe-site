"use client";

import { use } from "react";
import { FicheAdherent } from "@/components/admin/FicheAdherent";

export default function FicheAdherentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <FicheAdherent id={id} />;
}
