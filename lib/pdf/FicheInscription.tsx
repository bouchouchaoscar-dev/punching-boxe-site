import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { styles } from "./theme";
import { PdfFooter, PdfHeader, SignatureBlock } from "./Shared";
import { CLUB } from "@/lib/constants";
import { TARIFS, PACKAGE_LABEL } from "@/lib/pricing";
import { saisonCourante } from "@/lib/saison";
import type { FicheData } from "./types";

// Surcharges locales à la FICHE uniquement (pour tenir sur 1 page A4).
const f = StyleSheet.create({
  page: {
    paddingTop: 26,
    paddingBottom: 28,
    paddingHorizontal: 36,
    fontSize: 9,
  },
  rowTight: { flexDirection: "row", marginBottom: 4, gap: 8 },
  h2: { fontSize: 9, marginTop: 8, marginBottom: 4, paddingVertical: 3 },
  priceRow: { paddingVertical: 3 },
  p: { fontSize: 8.5, marginBottom: 3 },
  small: { fontSize: 7.5 },
  box: { padding: 8, marginTop: 4 },
  value: {
    flex: 1,
    fontSize: 9,
    borderBottomWidth: 0.5,
    borderColor: "#999",
    paddingBottom: 1,
  },
});

const frDate = (iso?: string) => {
  if (!iso) return "";
  const m = iso.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
};

type Item = { label: string; value?: string; flex?: number };

function FieldRow({ items }: { items: Item[] }) {
  return (
    <View style={f.rowTight}>
      {items.map((it, i) => (
        <View
          key={i}
          style={{ flex: it.flex ?? 1, flexDirection: "row", alignItems: "flex-end", gap: 6 }}
        >
          <Text style={styles.label}>{it.label}</Text>
          {it.value !== undefined ? (
            <Text style={f.value}>{it.value || " "}</Text>
          ) : (
            <View style={styles.fieldLine} />
          )}
        </View>
      ))}
    </View>
  );
}

function Check({ label, checked }: { label: string; checked?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginRight: 16, marginBottom: 3 }}>
      <View style={styles.checkbox}>
        {checked ? (
          <View style={{ flex: 1, margin: 1.5, backgroundColor: "#0a0a0a" }} />
        ) : null}
      </View>
      <Text style={{ fontSize: 8.5 }}>{label}</Text>
    </View>
  );
}

// Fiche d'inscription. Sans `data` → formulaire VIERGE (téléchargeable).
// Avec `data` → fiche REMPLIE + signée (générée à l'inscription en ligne).
export function FicheInscriptionDoc({ data }: { data?: FicheData } = {}) {
  const saison = saisonCourante(new Date());
  const filled = !!data;
  const v = (s?: string) => (filled ? s ?? "" : undefined);
  const contacts = data?.contacts ?? [];

  return (
    <Document title={`Fiche d'inscription ${saison}`} author={CLUB.nom}>
      <Page size="A4" style={[styles.page, f.page]}>
        <PdfHeader title="Fiche d'inscription" season={saison} />

        {!filled && (
          <Text style={[styles.small, f.small, { marginBottom: 3 }]}>
            À remplir lisiblement, en lettres capitales.
          </Text>
        )}

        <FieldRow
          items={[
            { label: "Date :", value: v(frDate(data?.dateSignature ?? undefined)), flex: 1.2 },
            { label: "Saison :", value: v(saison), flex: 1.2 },
          ]}
        />
        <FieldRow items={[{ label: "Nom :", value: v(data?.nom) }, { label: "Prénom :", value: v(data?.prenom) }]} />
        <FieldRow items={[{ label: "Né(e) le :", value: v(frDate(data?.dateNaissance)) }, { label: "Tél :", value: v(data?.telephone) }]} />
        <FieldRow items={[{ label: "Email :", value: v(data?.email) }]} />
        <FieldRow items={[{ label: "Adresse :", value: v(data?.adresse) }]} />
        <FieldRow items={[{ label: "Code postal :", value: v(data?.codePostal), flex: 0.8 }, { label: "Ville :", value: v(data?.ville), flex: 1.4 }]} />

        {/* Formule + Tarifs */}
        <Text style={[styles.h2, f.h2]}>Formule et cotisation</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 4 }}>
          <Check label={PACKAGE_LABEL.boxe_classique} checked={filled && data?.packageType === "boxe_classique"} />
          <Check label={PACKAGE_LABEL.savate_prepa} checked={filled && data?.packageType === "savate_prepa"} />
        </View>
        <View style={[styles.priceRow, f.priceRow]}>
          <Text>
            <Text style={styles.bold}>Boxe Française</Text> — Cotisation / Licence (Adultes / Jeunes)
          </Text>
          <Text style={styles.price}>
            {TARIFS.cotisation.boxe_classique.adulte} / {TARIFS.cotisation.boxe_classique.jeune} €
          </Text>
        </View>
        <View style={[styles.priceRow, f.priceRow]}>
          <Text>
            <Text style={styles.bold}>Savate &amp; Prépa</Text> — Cotisation / Licence (Adultes / Jeunes)
          </Text>
          <Text style={styles.price}>
            {TARIFS.cotisation.savate_prepa.adulte} / {TARIFS.cotisation.savate_prepa.jeune} €
          </Text>
        </View>
        <Text style={[styles.small, f.small, { marginBottom: 4 }]}>
          Jeunes : né·e après le 01/01/2013.
        </Text>
        <View style={[styles.priceRow, f.priceRow]}>
          <Text>
            <Text style={styles.bold}>Adhésion-club</Text> (1ère année)
          </Text>
          <Text style={styles.price}>{TARIFS.adhesion} €</Text>
        </View>
        <View style={[styles.priceRow, f.priceRow]}>
          <Text>
            <Text style={styles.bold}>Préparation Physique</Text>{" "}
            {filled
              ? data?.optionPrepa
                ? "(incluse / choisie)"
                : "(non prise)"
              : "(option Boxe Française · incluse en Savate et Prépa)"}
          </Text>
          <Text style={styles.price}>+ {TARIFS.prepaPhysique} €</Text>
        </View>
        {filled && (
          <View style={[styles.priceRow, f.priceRow, { marginTop: 2 }]}>
            <Text style={styles.bold}>Total réglé</Text>
            <Text style={styles.price}>{data?.montantTotal} €</Text>
          </View>
        )}

        {/* Adhérent mineur : autorisation parentale (si mineur, ou modèle vierge) */}
        {(!filled || data?.mineur) && (
          <View>
            <Text style={[styles.h2, f.h2]}>Adhérent mineur — autorisation parentale</Text>
            <Text style={[styles.p, f.p]}>
              Je soussigné(e){" "}
              {filled ? (
                <Text style={styles.bold}>{data?.responsable || "—"}</Text>
              ) : (
                "M/Mme ............................................"
              )}
              , responsable légal de l&apos;élève inscrit ci-dessus,{" "}
              <Text style={styles.bold}>
                {filled
                  ? data?.autorisationMedicale
                    ? "donne"
                    : "ne donne pas"
                  : "donne / ne donne pas"}
              </Text>{" "}
              {filled ? "" : "(rayer la mention inutile) "}l&apos;autorisation au
              professeur de prendre toutes les dispositions médicales en cas
              d&apos;accident, y compris faire transporter l&apos;élève à
              l&apos;hôpital le plus proche.
            </Text>
          </View>
        )}

        {/* Personnes à prévenir en cas d'accident */}
        <View style={[styles.box, f.box]}>
          <Text style={[styles.bold, { marginBottom: 4, fontSize: 8.5 }]}>
            Personnes à prévenir en cas d&apos;accident
          </Text>
          <FieldRow
            items={[
              { label: "Nom (1) :", value: v(contacts[0]?.nom) },
              { label: "Tél (1) :", value: v(contacts[0]?.tel) },
            ]}
          />
          <FieldRow
            items={[
              { label: "Nom (2) :", value: v(contacts[1]?.nom) },
              { label: "Tél (2) :", value: v(contacts[1]?.tel) },
            ]}
          />
        </View>

        {/* Signature + certification (rempli) OU zone vierge (modèle) */}
        {filled ? (
          <SignatureBlock
            sig={data?.signature}
            date={data?.dateSignature}
            mention="Je certifie sur l'honneur l'exactitude des informations renseignées ci-dessus."
          />
        ) : (
          <View style={[styles.box, f.box]}>
            <Text style={[styles.bold, { fontSize: 8.5 }]}>Signature obligatoire :</Text>
            <View style={{ height: 28 }} />
          </View>
        )}

        <PdfFooter />
      </Page>
    </Document>
  );
}
