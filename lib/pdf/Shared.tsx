import { Image, Polyline, Svg, Text, View } from "@react-pdf/renderer";
import { getLogoDataUri, styles } from "./theme";
import { formatDateFr } from "@/lib/tarifs";
import { CLUB } from "@/lib/constants";
import type { SignatureVect } from "./types";

export function PdfHeader({
  title,
  season,
}: {
  title: string;
  season?: string;
}) {
  const logo = getLogoDataUri();
  return (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        {logo ? <Image src={logo} style={styles.logo} /> : null}
        <View>
          <Text style={styles.clubName}>{CLUB.nomCourt}</Text>
          <Text style={styles.clubSub}>{CLUB.localite}</Text>
          <Text style={styles.clubSub}>{CLUB.baseline}</Text>
        </View>
      </View>
      <View style={styles.docTitleWrap}>
        <Text style={styles.docTitle}>{title}</Text>
        {season ? <Text style={styles.docSeason}>Saison {season}</Text> : null}
      </View>
    </View>
  );
}

// Rendu vectoriel de la signature dessinée (SVG natif React-PDF).
export function SignatureSvg({ sig }: { sig: SignatureVect }) {
  return (
    <Svg viewBox={`0 0 ${sig.width} ${sig.height}`} style={{ width: "100%", height: 56 }}>
      {sig.strokes.map((stroke, i) => (
        <Polyline
          key={i}
          points={stroke.map((p) => `${p.x},${p.y}`).join(" ")}
          stroke="#0a0a0a"
          strokeWidth={2.4}
          fill="none"
        />
      ))}
    </Svg>
  );
}

// Bloc « Date + certification + signature » réutilisé par la fiche et le règlement.
export function SignatureBlock({
  sig,
  date,
  mention,
}: {
  sig?: SignatureVect | null;
  date?: string | null;
  mention: string;
}) {
  return (
    <View style={{ marginTop: 12 }} wrap={false}>
      <Text style={{ fontSize: 8.5, marginBottom: 6 }}>{mention}</Text>
      <View style={{ flexDirection: "row", gap: 16, alignItems: "flex-end" }}>
        <View style={{ width: 120 }}>
          <Text style={styles.label}>Fait le :</Text>
          <Text style={{ fontSize: 9, marginTop: 3 }}>
            {date ? formatDateFr(date.slice(0, 10)) : "—"}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Signature :</Text>
          <View
            style={{
              height: 60,
              borderWidth: 1,
              borderColor: "#dddddd",
              borderRadius: 4,
              marginTop: 3,
              justifyContent: "center",
            }}
          >
            {sig ? <SignatureSvg sig={sig} /> : null}
          </View>
        </View>
      </View>
    </View>
  );
}

export function PdfFooter() {
  return (
    <View style={styles.footer} fixed>
      <Text>{CLUB.nom} · {CLUB.formeJuridique}</Text>
      <Text>{CLUB.telephone} · {CLUB.email}</Text>
    </View>
  );
}
