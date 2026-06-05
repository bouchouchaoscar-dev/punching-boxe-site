import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { styles } from "./theme";
import { PdfFooter, PdfHeader } from "./Shared";
import { CLUB } from "@/lib/constants";
import { TARIFS } from "@/lib/pricing";

// Surcharges locales à la FICHE uniquement (pour tenir sur 1 page A4).
// N'affecte ni le certificat médical ni le règlement intérieur.
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
});

function FieldRow({ items }: { items: { label: string; flex?: number }[] }) {
  return (
    <View style={f.rowTight}>
      {items.map((it, i) => (
        <View
          key={i}
          style={{ flex: it.flex ?? 1, flexDirection: "row", alignItems: "flex-end", gap: 6 }}
        >
          <Text style={styles.label}>{it.label}</Text>
          <View style={styles.fieldLine} />
        </View>
      ))}
    </View>
  );
}

function Check({ label }: { label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginRight: 16, marginBottom: 3 }}>
      <View style={styles.checkbox} />
      <Text style={{ fontSize: 8.5 }}>{label}</Text>
    </View>
  );
}

// Fiche d'inscription remasterisée — SANS carré photo (cf. brief).
export function FicheInscriptionDoc() {
  return (
    <Document title={`Fiche d'inscription ${CLUB.saison}`} author={CLUB.nom}>
      <Page size="A4" style={[styles.page, f.page]}>
        <PdfHeader title="Fiche d'inscription" season={CLUB.saison} />

        <Text style={[styles.small, f.small, { marginBottom: 3 }]}>
          À remplir lisiblement, en lettres capitales.
        </Text>

        <FieldRow items={[{ label: "Date :", flex: 1.2 }, { label: "Nationalité :", flex: 1.2 }]} />
        <FieldRow items={[{ label: "Nom :" }, { label: "Prénom :" }]} />
        <FieldRow items={[{ label: "Né(e) le :" }, { label: "Tél :" }]} />
        <FieldRow items={[{ label: "Email :" }]} />
        <FieldRow items={[{ label: "Adresse :" }]} />
        <FieldRow items={[{ label: "Code postal :", flex: 0.8 }, { label: "Ville :", flex: 1.4 }]} />

        {/* Formule + Tarifs */}
        <Text style={[styles.h2, f.h2]}>Formule & cotisation</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 4 }}>
          <Check label="Package Boxe Française" />
          <Check label="Package Savate & Prépa" />
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
            <Text style={styles.bold}>Préparation Physique</Text> (option Boxe Française · incluse en Savate & Prépa)
          </Text>
          <Text style={styles.price}>+ {TARIFS.prepaPhysique} €</Text>
        </View>

        {/* Adhérent mineur */}
        <Text style={[styles.h2, f.h2]}>Adhérent mineur</Text>
        <Text style={[styles.p, f.p]}>
          Je soussigné(e) M/Mme ............................................,
          responsable parental de l&apos;élève inscrit ci-dessus,{" "}
          <Text style={styles.bold}>donne / ne donne pas</Text> (rayer la mention
          inutile) l&apos;autorisation au professeur de prendre toutes les
          dispositions médicales en cas d&apos;accident, y compris faire
          transporter l&apos;élève à l&apos;hôpital le plus proche.
        </Text>
        <Text style={[styles.small, f.small]}>
          La personne accompagnant l&apos;élève mineur devra s&apos;assurer de la
          présence du professeur avant de laisser l&apos;enfant. Le {CLUB.nomCourt}{" "}
          décline toute responsabilité en cas de présence supposée et non avérée.
        </Text>

        {/* Personnes à prévenir + règlement */}
        <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
          <View style={[styles.box, f.box, { flex: 1 }]}>
            <Text style={[styles.bold, { marginBottom: 4, fontSize: 8.5 }]}>
              Personnes à prévenir en cas d&apos;accident
            </Text>
            <FieldRow items={[{ label: "Nom (1) :" }]} />
            <FieldRow items={[{ label: "Tél (1) :" }]} />
            <FieldRow items={[{ label: "Nom (2) :" }]} />
            <FieldRow items={[{ label: "Tél (2) :" }]} />
          </View>
          <View style={[styles.box, f.box, { flex: 1 }]}>
            <Text style={[styles.bold, { marginBottom: 4, fontSize: 8.5 }]}>
              Mode de règlement / Total
            </Text>
            <FieldRow items={[{ label: "Total :" }]} />
            <FieldRow items={[{ label: "Nb chèques :", flex: 1 }, { label: "Espèces :", flex: 1 }]} />
            <FieldRow items={[{ label: "Stripe en ligne :" }]} />
            <Text style={[styles.bold, { marginTop: 8, fontSize: 8.5 }]}>
              Signature obligatoire :
            </Text>
            <View style={{ height: 14 }} />
          </View>
        </View>

        <PdfFooter />
      </Page>
    </Document>
  );
}
