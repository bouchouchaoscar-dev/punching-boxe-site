import { Image, Text, View } from "@react-pdf/renderer";
import { getLogoDataUri, styles } from "./theme";

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
          <Text style={styles.clubName}>Punching Boxe</Text>
          <Text style={styles.clubSub}>Nogent · Le Perreux</Text>
          <Text style={styles.clubSub}>Savate · Boxe Française</Text>
        </View>
      </View>
      <View style={styles.docTitleWrap}>
        <Text style={styles.docTitle}>{title}</Text>
        {season ? <Text style={styles.docSeason}>Saison {season}</Text> : null}
      </View>
    </View>
  );
}

export function PdfFooter() {
  return (
    <View style={styles.footer} fixed>
      <Text>Punching Boxe de Nogent-Le Perreux · Association loi 1901</Text>
      <Text>06 10 81 49 98 · contact@punching-boxe.com</Text>
    </View>
  );
}
