import { renderToBuffer } from "@react-pdf/renderer";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { getAuthUser } from "@/lib/auth-server";
import { estPaiementSolde } from "@/lib/paiement";
import { TARIFS } from "@/lib/pricing";
import { FactureDoc, type FactureData, type FactureEcheance } from "@/lib/pdf/Facture";
import type { Adherent, Paiement } from "@/lib/types";

export const runtime = "nodejs";

// GET — facture/attestation de l'adhérent connecté. Serveur autoritaire :
// montants et état relus en base ; l'adhérent ne peut générer QUE sa facture
// (titulaire_id = user connecté). Refus si aucun paiement validé.
export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return new Response(JSON.stringify({ error: "Service indisponible." }), {
      status: 503,
    });
  }
  const user = await getAuthUser(request);
  if (!user) {
    return new Response(JSON.stringify({ error: "Non authentifié." }), {
      status: 401,
    });
  }

  const adherentId = new URL(request.url).searchParams.get("adherentId") || "";
  if (!adherentId) {
    return new Response(JSON.stringify({ error: "adherentId requis." }), {
      status: 400,
    });
  }

  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("adherents")
    .select("*")
    .eq("id", adherentId)
    .maybeSingle();
  if (!data) {
    return new Response(JSON.stringify({ error: "Dossier introuvable." }), {
      status: 404,
    });
  }
  const a = data as Adherent;

  // Autorisation : le dossier doit appartenir au compte connecté.
  if (a.titulaire_id !== user.id) {
    return new Response(JSON.stringify({ error: "Accès refusé." }), {
      status: 403,
    });
  }

  // Échéances (numérotées) pour le détail fractionné.
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

  const reglees: FactureEcheance[] = paiements
    .filter((p) => p.statut === "paye")
    .map((p) => ({
      numero: p.numero_echeance ?? null,
      montant: Number(p.montant || 0),
      date: p.date_paiement ?? null,
    }));
  const aVenir: FactureEcheance[] = paiements
    .filter((p) => p.statut !== "paye" && p.statut !== "rembourse")
    .map((p) => ({
      numero: p.numero_echeance ?? null,
      montant: Number(p.montant || 0),
      date: p.date_prevue ?? null,
    }));

  const solde = estPaiementSolde(a);

  // Disponibilité : soldé OU au moins une échéance réellement encaissée.
  if (!solde && reglees.length === 0) {
    return new Response(
      JSON.stringify({ error: "Aucun paiement validé pour ce dossier." }),
      { status: 403 },
    );
  }

  // Ventilation autoritaire (détail non stocké → reconstruit exact) :
  // adhésion = 30 € si nouveau membre, cotisation = total − adhésion.
  const montantTotal = Number(a.montant_total || 0);
  const adhesion = a.nouveau_membre ? TARIFS.adhesion : 0;
  const cotisation = Math.round((montantTotal - adhesion) * 100) / 100;
  const fractionne = (a.nb_echeances || 1) > 1;
  const regleAJour = solde
    ? montantTotal
    : Math.round(reglees.reduce((s, e) => s + e.montant, 0) * 100) / 100;

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
    echeancesReglees: reglees,
    echeancesAVenir: aVenir,
    date: new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(
      new Date(),
    ),
  };

  const buffer = await renderToBuffer(<FactureDoc data={factureData} />);
  const type = solde ? "facture" : "attestation";
  const nomFichier = `${type}-punching-boxe-${a.saison}.pdf`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nomFichier}"`,
      "Cache-Control": "no-store",
    },
  });
}
