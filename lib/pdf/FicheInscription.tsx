import { Document, Page, Text, View } from "@react-pdf/renderer";
import { PDF_COLORS, styles } from "./theme";
import { PdfFooter, PdfHeader } from "./Shared";
import { CLUB } from "@/lib/constants";
import { TARIFS } from "@/lib/pricing";

function FieldRow({
  items,
}: {
  items: { label: string; flex?: number }[];
}) {
  return (
    <View style={styles.row}>
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
    <View style={{ flexDirection: "row", alignItems: "center", marginRight: 16, marginBottom: 4 }}>
      <View style={styles.checkbox} />
      <Text style={{ fontSize: 9 }}>{label}</Text>
    </View>
  );
}

// Fiche d'inscription remasterisée — SANS carré photo (cf. brief).
export function FicheInscriptionDoc() {
  return (
    <Document title={`Fiche d'inscription ${CLUB.saison}`} author={CLUB.nom}>
      <Page size="A4" style={styles.page}>
        <PdfHeader title="Fiche d'inscription" season={CLUB.saison} />

        <Text style={[styles.small, { marginBottom: 4 }]}>
          À remplir lisiblement, en lettres capitales.
        </Text>

        <FieldRow items={[{ label: "Date :", flex: 1.2 }, { label: "Nationalité :", flex: 1.2 }]} />
        <FieldRow items={[{ label: "Nom :" }, { label: "Prénom :" }]} />
        <FieldRow items={[{ label: "Né(e) le :" }, { label: "Tél :" }]} />
        <FieldRow items={[{ label: "Email :" }]} />
        <FieldRow items={[{ label: "Adresse :" }]} />
        <FieldRow items={[{ label: "Code postal :", flex: 0.8 }, { label: "Ville :", flex: 1.4 }]} />

        {/* Tarifs */}
        <Text style={styles.h2}>Cotisation</Text>
        <View style={styles.priceRow}>
          <Text>
            <Text style={styles.bold}>Adhésion-club</Text> (1ère année)
          </Text>
          <Text style={styles.price}>{TARIFS.adhesion} €</Text>
        </View>
        <View style={styles.priceRow}>
          <Text>
            <Text style={styles.bold}>Cotisation / Licence — Adultes</Text>
          </Text>
          <Text style={styles.price}>{TARIFS.cotisationAdulte} €</Text>
        </View>
        <View style={styles.priceRow}>
          <Text>
            <Text style={styles.bold}>Cotisation / Licence — Jeunes</Text> (né·e après le 01/01/2013)
          </Text>
          <Text style={styles.price}>{TARIFS.cotisationJeune} €</Text>
        </View>
        <View style={styles.priceRow}>
          <Text>
            <Text style={styles.bold}>Préparation Physique</Text> (option)
          </Text>
          <Text style={styles.price}>+ {TARIFS.prepaPhysique} €</Text>
        </View>

        {/* Certificat médical */}
        <Text style={styles.h2}>Certificat médical obligatoire</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 2 }}>
          <Check label="Boxe Française : oui / non" />
          <Check label="Savate Forme : oui / non" />
          <Check label="Préparation Physique : oui / non" />
        </View>

        {/* Adhérent mineur */}
        <Text style={styles.h2}>Adhérent mineur</Text>
        <Text style={styles.p}>
          Je soussigné(e) M/Mme ............................................,
          responsable parental de l&apos;élève inscrit ci-dessus,{" "}
          <Text style={styles.bold}>donne / ne donne pas</Text> (rayer la mention
          inutile) l&apos;autorisation au professeur de prendre toutes les
          dispositions médicales en cas d&apos;accident, y compris faire
          transporter l&apos;élève à l&apos;hôpital le plus proche.
        </Text>
        <Text style={styles.small}>
          La personne accompagnant l&apos;élève mineur devra s&apos;assurer de la
          présence du professeur avant de laisser l&apos;enfant. Le {CLUB.nomCourt}{" "}
          décline toute responsabilité en cas de présence supposée et non avérée.
        </Text>

        {/* Personnes à prévenir + signature */}
        <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
          <View style={[styles.box, { flex: 1 }]}>
            <Text style={[styles.bold, { marginBottom: 6, fontSize: 9 }]}>
              Personnes à prévenir en cas d&apos;accident
            </Text>
            <FieldRow items={[{ label: "Nom (1) :" }]} />
            <FieldRow items={[{ label: "Tél (1) :" }]} />
            <FieldRow items={[{ label: "Nom (2) :" }]} />
            <FieldRow items={[{ label: "Tél (2) :" }]} />
          </View>
          <View style={[styles.box, { flex: 1 }]}>
            <Text style={[styles.bold, { marginBottom: 6, fontSize: 9 }]}>
              Mode de règlement / Total
            </Text>
            <FieldRow items={[{ label: "Total :" }]} />
            <FieldRow items={[{ label: "Nb chèques :", flex: 1 }, { label: "Espèces :", flex: 1 }]} />
            <FieldRow items={[{ label: "Stripe en ligne :" }]} />
            <Text style={[styles.bold, { marginTop: 10, fontSize: 9 }]}>
              Signature obligatoire :
            </Text>
            <View style={{ height: 22 }} />
          </View>
        </View>

        <View
          style={{
            marginTop: 10,
            backgroundColor: PDF_COLORS.paper2,
            borderRadius: 4,
            padding: 8,
          }}
        >
          <Text style={styles.small}>
            L&apos;adhésion donne accès à <Text style={styles.bold}>tous les cours
            de Boxe Française et de Savate Fitness</Text>. Inscription possible
            également en ligne sur punching-boxe.com.
          </Text>
        </View>

        <PdfFooter />
      </Page>
    </Document>
  );
}
