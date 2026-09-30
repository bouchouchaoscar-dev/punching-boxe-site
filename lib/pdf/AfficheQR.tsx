import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import { PDF_COLORS, getLogoDataUri } from "./theme";
import { CLUB } from "@/lib/constants";

// Affiche A4 « pointage QR » à coller dans un vestiaire. Aux couleurs du club.
export type AfficheData = { salle: string | null; url: string; qrDataUri: string };

const s = StyleSheet.create({
  page: { padding: 48, fontFamily: "Helvetica", color: PDF_COLORS.ink, alignItems: "center" },
  logo: { width: 64, height: 64, borderRadius: 32, marginBottom: 14 },
  club: { fontSize: 12, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 1, color: PDF_COLORS.smoke },
  salle: { fontSize: 16, fontFamily: "Helvetica-Bold", marginTop: 6, color: PDF_COLORS.orange },
  titre: { fontSize: 30, fontFamily: "Helvetica-Bold", textAlign: "center", marginTop: 20, marginBottom: 6, lineHeight: 1.15 },
  qrBox: { marginTop: 18, marginBottom: 18, padding: 16, borderWidth: 2, borderColor: PDF_COLORS.ink, borderRadius: 16 },
  qr: { width: 260, height: 260 },
  url: { fontSize: 10, color: PDF_COLORS.smoke, marginBottom: 8 },
  etapes: { flexDirection: "row", gap: 14, marginTop: 6 },
  etape: { width: 150, alignItems: "center" },
  num: { width: 34, height: 34, borderRadius: 17, backgroundColor: PDF_COLORS.orange, color: PDF_COLORS.white, fontFamily: "Helvetica-Bold", fontSize: 18, textAlign: "center", paddingTop: 6, marginBottom: 8 },
  etapeT: { fontSize: 14, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  etapeD: { fontSize: 10, color: PDF_COLORS.smoke, textAlign: "center" },
  essai: { marginTop: 26, fontSize: 13, textAlign: "center", color: PDF_COLORS.ink },
  essaiFort: { fontFamily: "Helvetica-Bold" },
});

export function AfficheQRDoc({ data }: { data: AfficheData }) {
  const logo = getLogoDataUri();
  return (
    <Document>
      <Page size="A4" style={s.page}>
        {logo ? <Image src={logo} style={s.logo} /> : null}
        <Text style={s.club}>{CLUB.nomCourt}</Text>
        {data.salle ? <Text style={s.salle}>{data.salle}</Text> : null}

        <Text style={s.titre}>Tu es là ?{"\n"}Signale-le en 10 secondes</Text>

        <View style={s.qrBox}>
          <Image src={data.qrDataUri} style={s.qr} />
        </View>
        <Text style={s.url}>{data.url}</Text>

        <View style={s.etapes}>
          <View style={s.etape}>
            <Text style={s.num}>1</Text>
            <Text style={s.etapeT}>Scanne</Text>
            <Text style={s.etapeD}>Ouvre l&apos;appareil photo et vise le QR code.</Text>
          </View>
          <View style={s.etape}>
            <Text style={s.num}>2</Text>
            <Text style={s.etapeT}>Trouve ton nom</Text>
            <Text style={s.etapeD}>Tape les 3 premières lettres de ton nom.</Text>
          </View>
          <View style={s.etape}>
            <Text style={s.num}>3</Text>
            <Text style={s.etapeT}>Valide</Text>
            <Text style={s.etapeD}>C&apos;est noté, bon entraînement !</Text>
          </View>
        </View>

        <Text style={s.essai}>
          Première séance ? Touche <Text style={s.essaiFort}>« C&apos;est ma séance d&apos;essai »</Text>.
        </Text>
      </Page>
    </Document>
  );
}
