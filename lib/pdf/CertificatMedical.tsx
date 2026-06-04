import { Document, Page, Text, View } from "@react-pdf/renderer";
import { styles } from "./theme";
import { PdfFooter, PdfHeader } from "./Shared";
import { CLUB } from "@/lib/constants";

export function CertificatMedicalDoc() {
  return (
    <Document title="Certificat médical" author={CLUB.nom}>
      <Page size="A4" style={styles.page}>
        <PdfHeader title="Certificat médical" />

        <View style={styles.box}>
          <Text style={[styles.bold, { fontSize: 9, marginBottom: 4 }]}>
            Cachet médical + N°
          </Text>
          <View style={{ height: 90 }} />
        </View>

        <Text style={[styles.h2, { marginTop: 28 }]}>
          Certificat médical de non contre-indication
        </Text>

        <View style={{ marginTop: 14 }}>
          <View style={[styles.row, { alignItems: "flex-end" }]}>
            <Text style={styles.label}>Je soussigné(e) Docteur</Text>
            <View style={styles.fieldLine} />
          </View>

          <Text style={[styles.p, { marginTop: 6 }]}>
            certifie avoir examiné ce jour :
          </Text>

          <View style={[styles.row, { alignItems: "flex-end" }]}>
            <Text style={styles.label}>Mme / Melle / Mr / l&apos;enfant</Text>
            <View style={styles.fieldLine} />
          </View>
          <View style={[styles.row, { alignItems: "flex-end" }]}>
            <Text style={styles.label}>né(e) le</Text>
            <View style={styles.fieldLine} />
          </View>

          <Text style={[styles.p, { marginTop: 10 }]}>
            dont l&apos;état de santé ne présente aucune contre-indication à la
            pratique du sport, et en particulier de la{" "}
            <Text style={styles.bold}>Savate-Boxe Française</Text> et de la{" "}
            <Text style={styles.bold}>Savate-Forme</Text>.
          </Text>

          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 12 }}>
            <Text style={styles.label}>Autorisation à la compétition : </Text>
            <View style={styles.checkbox} />
            <Text style={{ fontSize: 9, marginRight: 14 }}>OUI</Text>
            <View style={styles.checkbox} />
            <Text style={{ fontSize: 9 }}>NON</Text>
          </View>

          <Text style={[styles.p, { marginTop: 14 }]}>
            Certificat remis en main propre, pour servir et valoir ce que de droit.
          </Text>

          <View style={[styles.row, { alignItems: "flex-end", marginTop: 18 }]}>
            <Text style={styles.label}>Fait à</Text>
            <View style={styles.fieldLine} />
            <Text style={styles.label}>, le</Text>
            <View style={[styles.fieldLine, { flex: 0.6 }]} />
          </View>

          <Text style={[styles.label, { marginTop: 24 }]}>Signature :</Text>
        </View>

        <PdfFooter />
      </Page>
    </Document>
  );
}
