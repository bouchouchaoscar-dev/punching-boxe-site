import { renderToBuffer } from "@react-pdf/renderer";
import { getSupabaseAdmin } from "@/lib/supabase";
import { estPaiementSolde } from "@/lib/paiement";
import { TARIFS } from "@/lib/pricing";
import {
  FactureDoc,
  type FactureData,
  type FactureEcheance,
} from "./Facture";
import type { Adherent, Paiement } from "@/lib/types";

// SOURCE UNIQUE du document facture/attestation : chargement des données
// (montants/état relus en base = serveur autoritaire), ventilation, rendu PDF.
// Partagée par l'espace adhérent ET l'admin ; l'AUTH est déléguée à l'appelant
// via `authorize` (l'adhérent restreint à son dossier ; l'admin déjà gardé).

export type FactureResult =
  | { ok: true; buffer: Buffer; filename: string; solde: boolean }
  | { ok: false; status: number; error: string };

export async function construireFacturePdf(
  adherentId: string,
  authorize?: (a: Adherent) => boolean,
): Promise<FactureResult> {
  if (!adherentId) return { ok: false, status: 400, error: "adherentId requis." };

  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("adherents")
    .select("*")
    .eq("id", adherentId)
    .maybeSingle();
  if (!data) return { ok: false, status: 404, error: "Dossier introuvable." };
  const a = data as Adherent;

  // Autorisation (avant tout rendu) : politique fournie par l'appelant.
  if (authorize && !authorize(a)) {
    return { ok: false, status: 403, error: "Accès refusé." };
  }

  // Échéances numérotées (détail fractionné).
  const { data: pRows } = await supabase
    .from("paiements")
    .select("montant, statut, numero_echeance, date_prevue, date_paiement")
    .eq("adherent_id", adherentId)
    .not("numero_echeance", "is", null)
    .order("numero_echeance", { ascending: true });
  const paiements = (pRows ?? []) as Pick<
    Paiement,
    "montant" | "statut" | "numero_echeance" | "date_prevue" | "date_paiement"
  >[];

  const echeancesReglees: FactureEcheance[] = paiements
    .filter((p) => p.statut === "paye")
    .map((p) => ({
      numero: p.numero_echeance ?? null,
      montant: Number(p.montant || 0),
      date: p.date_paiement ?? null,
    }));
  const echeancesAVenir: FactureEcheance[] = paiements
    .filter((p) => p.statut !== "paye" && p.statut !== "rembourse")
    .map((p) => ({
      numero: p.numero_echeance ?? null,
      montant: Number(p.montant || 0),
      date: p.date_prevue ?? null,
    }));

  const solde = estPaiementSolde(a);

  // Disponibilité : soldé OU au moins une échéance réellement encaissée.
  if (!solde && echeancesReglees.length === 0) {
    return {
      ok: false,
      status: 403,
      error: "Aucun paiement validé pour ce dossier.",
    };
  }

  // Ventilation exacte (détail non stocké) : frais d'adhésion = TARIFS.adhesion
  // si nouveau membre (source unique), cotisation = total − adhésion.
  const montantTotal = Number(a.montant_total || 0);
  const adhesion = a.nouveau_membre ? TARIFS.adhesion : 0;
  const cotisation = Math.round((montantTotal - adhesion) * 100) / 100;
  const fractionne = (a.nb_echeances || 1) > 1;
  const regleAJour = solde
    ? montantTotal
    : Math.round(
        echeancesReglees.reduce((sum, e) => sum + e.montant, 0) * 100,
      ) / 100;

  const factureData: FactureData = {
    prenom: a.prenom,
    nom: a.nom,
    saison: a.saison,
    solde,
    montantTotal,
    cotisation,
    adhesion,
    fractionne,
    nbEcheances: a.nb_echeances || 1,
    regleAJour,
    echeancesReglees,
    echeancesAVenir,
    date: new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(
      new Date(),
    ),
  };

  const buffer = await renderToBuffer(<FactureDoc data={factureData} />);
  const type = solde ? "facture" : "attestation";
  const filename = `${type}-punching-boxe-${a.saison}.pdf`;
  return { ok: true, buffer, filename, solde };
}
