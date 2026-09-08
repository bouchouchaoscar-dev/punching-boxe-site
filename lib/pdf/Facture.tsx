import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { styles, PDF_COLORS } from "./theme";
import { PdfHeader, PdfFooter } from "./Shared";
import { CLUB } from "@/lib/constants";
import { euro } from "@/lib/pricing";
import { formaterNomComplet } from "@/lib/noms";

// Facture acquittée / Attestation de paiement, générée par l'adhérent depuis son
// espace. Titre + contenu ADAPTATIFS selon l'état réel du paiement. Montants
// autoritaires (relus en base). Signature dactylographiée (pas de manuscrite).

export type FactureEcheance = {
  numero: number | null;
  montant: number;
  date: string | null; // ISO
};

export type FactureData = {
  prenom: string;
  nom: string;
  saison: string; // ex. "2026-2027"
  solde: boolean; // paiement totalement acquitté
  montantTotal: number;
  cotisation: number; // = montantTotal - adhesion
  adhesion: number; // 30 si nouveau membre, sinon 0
  fractionne: boolean;
  nbEcheances: number;
  regleAJour: number;
  echeancesReglees: FactureEcheance[];
  echeancesAVenir: FactureEcheance[];
  date: string; // date de génération, déjà formatée FR
};

const fmtSaison = (s: string) => s.replace("-", "/");
const frDate = (iso?: string | null) => {
  if (!iso) return "—";
  const d = iso.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return d ? `${d[3]}/${d[2]}/${d[1]}` : iso;
};

const s = StyleSheet.create({
  intro: { fontSize: 9.5, lineHeight: 1.5, marginTop: 6, marginBottom: 8 },
  bloc: {
    borderWidth: 0.5,
    borderColor: "#e5e5e5",
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
  },
  ligne: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  ligneLabel: { fontSize: 9.5 },
  ligneVal: { fontSize: 9.5, fontFamily: "Helvetica-Bold" },
  total: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 0.5,
    borderColor: "#ccc",
    marginTop: 4,
    paddingTop: 5,
  },
  totalLabel: { fontSize: 10.5, fontFamily: "Helvetica-Bold" },
  totalVal: {
    fontSize: 10.5,
    fontFamily: "Helvetica-Bold",
    color: PDF_COLORS.orange,
  },
  sousTitre: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    marginTop: 6,
    marginBottom: 3,
  },
  echRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
    fontSize: 9,
  },
  cloture: { fontSize: 9.5, lineHeight: 1.5, marginTop: 10 },
  sign: { marginTop: 22, alignItems: "flex-end" },
  signNom: { fontSize: 10, fontFamily: "Helvetica-Bold", color: PDF_COLORS.ink },
  signRole: { fontSize: 8.5, color: PDF_COLORS.smoke, marginTop: 1 },
});

export function FactureDoc({ data }: { data: FactureData }) {
  const titre = data.solde ? "Facture acquittée" : "Attestation de paiement";
  const nomComplet = formaterNomComplet(data.prenom, data.nom);

  return (
    <Document title={`${titre} — ${nomComplet}`} author={CLUB.nom}>
      <Page size="A4" style={styles.page}>
        <PdfHeader title={titre} season={fmtSaison(data.saison)} />

        <Text style={s.intro}>
          Je soussigné <Text style={styles.bold}>Pascal Bouchoucha</Text>,
          Directeur Sportif du club {CLUB.nom}, atteste que{" "}
          <Text style={styles.bold}>{nomComplet}</Text> adhère au club pour la
          saison {fmtSaison(data.saison)} et{" "}
          {data.solde
            ? "s'est acquitté(e) de la totalité des sommes dues, réparties comme suit :"
            : `s'est acquitté(e) à ce jour de ${euro(data.regleAJour)} sur un total de ${euro(data.montantTotal)}, selon le détail ci-dessous :`}
        </Text>

        {/* Ventilation */}
        <View style={s.bloc}>
          <View style={s.ligne}>
            <Text style={s.ligneLabel}>
              Cotisation annuelle (licence fédérale incluse)
            </Text>
            <Text style={s.ligneVal}>{euro(data.cotisation)}</Text>
          </View>
          {data.adhesion > 0 && (
            <View style={s.ligne}>
              <Text style={s.ligneLabel}>Frais d&apos;adhésion</Text>
              <Text style={s.ligneVal}>{euro(data.adhesion)}</Text>
            </View>
          )}
          <View style={s.total}>
            <Text style={s.totalLabel}>Total</Text>
            <Text style={s.totalVal}>{euro(data.montantTotal)}</Text>
          </View>
        </View>

        {/* Fractionné en cours : échéancier détaillé */}
        {!data.solde && data.fractionne && (
          <View style={s.bloc}>
            <Text style={s.ligneLabel}>
              Paiement en {data.nbEcheances} fois.
            </Text>

            <Text style={s.sousTitre}>Échéances déjà réglées</Text>
            {data.echeancesReglees.length > 0 ? (
              data.echeancesReglees.map((e, i) => (
                <View key={`r${i}`} style={s.echRow}>
                  <Text>
                    Échéance {e.numero ?? i + 1} — réglée le {frDate(e.date)}
                  </Text>
                  <Text style={styles.bold}>{euro(e.montant)}</Text>
                </View>
              ))
            ) : (
              <Text style={s.echRow}>—</Text>
            )}

            <Text style={s.sousTitre}>Échéances à venir</Text>
            {data.echeancesAVenir.length > 0 ? (
              data.echeancesAVenir.map((e, i) => (
                <View key={`v${i}`} style={s.echRow}>
                  <Text>
                    Échéance {e.numero ?? ""} — prévue le {frDate(e.date)}
                  </Text>
                  <Text>{euro(e.montant)}</Text>
                </View>
              ))
            ) : (
              <Text style={s.echRow}>—</Text>
            )}

            <View style={s.total}>
              <Text style={s.totalLabel}>Réglé à ce jour</Text>
              <Text style={s.totalVal}>
                {euro(data.regleAJour)} / {euro(data.montantTotal)}
              </Text>
            </View>
          </View>
        )}

        <Text style={s.cloture}>
          Fait à Nogent-sur-Marne, le {data.date}, pour servir et valoir ce que
          de droit.
        </Text>

        <View style={s.sign}>
          <Text style={s.signNom}>Pascal Bouchoucha</Text>
          <Text style={s.signRole}>Directeur Sportif — {CLUB.nomCourt}</Text>
        </View>

        <PdfFooter />
      </Page>
    </Document>
  );
}
