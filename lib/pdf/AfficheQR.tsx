import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import { PDF_COLORS, getLogoDataUri } from "./theme";
import { CLUB } from "@/lib/constants";

// Affiche A4 « pointage QR » à coller dans un vestiaire. Aux couleurs du club.
// En-tête remonté (logo + nom du club + salle), titre en 2 lignes, QR, 3 étapes.
export type AfficheData = { salle: string | null; qrDataUri: string };

const s = StyleSheet.create({
  page: { paddingTop: 44, paddingBottom: 44, paddingHorizontal: 56, fontFamily: "Helvetica", color: PDF_COLORS.ink, alignItems: "center" },
  // En-tête, remonté tout en haut.
  logo: { width: 104, height: 104, borderRadius: 52, marginBottom: 12 },
  club: { fontFamily: "Helvetica-Bold", fontSize: 20, textTransform: "uppercase", letterSpacing: 1.5, textAlign: "center" },
  salle: { fontSize: 15, fontFamily: "Helvetica-Bold", marginTop: 6, color: PDF_COLORS.orange, textAlign: "center" },
  // Titre, avec un vrai espace au-dessus.
  titre: { fontFamily: "Helvetica-Bold", fontSize: 30, textAlign: "center", marginTop: 40, lineHeight: 1.2 },
  qrBox: { marginTop: 30, marginBottom: 30, padding: 16, borderWidth: 2, borderColor: PDF_COLORS.ink, borderRadius: 16 },
  qr: { width: 250, height: 250 },
  etapes: { flexDirection: "row", gap: 16, marginTop: 4 },
  etape: { width: 150, alignItems: "center" },
  num: { width: 36, height: 36, borderRadius: 18, backgroundColor: PDF_COLORS.orange, color: PDF_COLORS.white, fontFamily: "Helvetica-Bold", fontSize: 18, textAlign: "center", paddingTop: 7, marginBottom: 8 },
  etapeT: { fontSize: 14, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  etapeD: { fontSize: 10, color: PDF_COLORS.smoke, textAlign: "center" },
  essai: { marginTop: 34, fontSize: 13, textAlign: "center", color: PDF_COLORS.ink },
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

        <Text style={s.titre}>À chaque séance,{"\n"}signale ta présence en 2 clics</Text>

        <View style={s.qrBox}>
          <Image src={data.qrDataUri} style={s.qr} />
        </View>

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
          Première séance ? Clique sur <Text style={s.essaiFort}>« C&apos;est ma séance d&apos;essai »</Text>.
        </Text>
      </Page>
    </Document>
  );
}
