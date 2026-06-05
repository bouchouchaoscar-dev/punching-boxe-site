import type { Metadata } from "next";
import { MonEspace } from "@/components/espace/MonEspace";

export const metadata: Metadata = {
  title: "Mon espace adhérent",
  description:
    "Suivez votre dossier d'inscription au Punching Boxe de Nogent-Le Perreux : documents, statut de validation et détails de votre adhésion.",
};

export default function MonEspacePage() {
  return <MonEspace />;
}
