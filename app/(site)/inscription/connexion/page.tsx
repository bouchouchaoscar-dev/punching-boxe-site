import type { Metadata } from "next";
import { Suspense } from "react";
import { ConnexionForm } from "@/components/auth/ConnexionForm";

export const metadata: Metadata = {
  title: "Connexion — Espace adhérent",
  description:
    "Créez votre compte ou connectez-vous pour vous inscrire en ligne au Punching Boxe de Nogent-Le Perreux et suivre votre dossier d'adhésion.",
};

export default function ConnexionPage() {
  return (
    <Suspense fallback={null}>
      <ConnexionForm />
    </Suspense>
  );
}
