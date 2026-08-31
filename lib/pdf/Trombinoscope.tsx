import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  Image,
} from "@react-pdf/renderer";
import { CLUB } from "@/lib/constants";

// Trombinoscope des adhérents actifs : grille de vignettes paginée, imprimable.
// Photos EMBARQUÉES (data-URI) fournies par l'appelant ; placeholder (initiales)
// si absente. Contenu épuré : photo + nom/prénom + formule + pastille payé.

export type TrombiMembre = {
  nom: string;
  prenom: string;
  formule: string;
  paye: boolean;
  photo: string | null; // data-URI ou null
  initiales: string;
};

const GREEN = "#16a34a";
const ORANGE = "#F84800";
const INK = "#0a0a0a";
const SMOKE = "#6b6b6b";
const LINE = "#e5e5e5";

const s = StyleSheet.create({
  page: {
    paddingTop: 64,
    paddingBottom: 40,
    paddingHorizontal: 28,
    fontSize: 9,
    color: INK,
  },
  header: {
    position: "absolute",
    top: 24,
    left: 28,
    right: 28,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 1,
    borderColor: LINE,
    paddingBottom: 8,
  },
  title: { fontSize: 14, fontFamily: "Helvetica-Bold", color: INK },
  sub: { fontSize: 9, color: SMOKE },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: {
    width: "25%",
    padding: 6,
    alignItems: "center",
  },
  photo: {
    width: 88,
    height: 88,
    borderRadius: 6,
    objectFit: "cover",
    borderWidth: 0.5,
    borderColor: LINE,
  },
  placeholder: {
    width: 88,
    height: 88,
    borderRadius: 6,
    backgroundColor: "#f2f2f2",
    borderWidth: 0.5,
    borderColor: LINE,
    alignItems: "center",
    justifyContent: "center",
  },
  initiales: { fontSize: 24, fontFamily: "Helvetica-Bold", color: "#b9b9b9" },
  nom: {
    marginTop: 6,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
  },
  formule: { fontSize: 7.5, color: SMOKE, textAlign: "center", marginTop: 1 },
  statutRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 3,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  statutTxt: { fontSize: 7 },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 28,
    right: 28,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7.5,
    color: SMOKE,
  },
});

export function TrombinoscopeDoc({
  saison,
  date,
  membres,
}: {
  saison: string;
  date: string;
  membres: TrombiMembre[];
}) {
  return (
    <Document title={`${CLUB.nomCourt} — Adhérents ${saison}`} author={CLUB.nom}>
      <Page size="A4" style={s.page} wrap>
        {/* En-tête répété sur chaque page */}
        <View style={s.header} fixed>
          <Text style={s.title}>
            {CLUB.nomCourt} — Adhérents {saison}
          </Text>
          <Text style={s.sub}>
            {membres.length} adhérent{membres.length > 1 ? "s" : ""} actif
            {membres.length > 1 ? "s" : ""} · {date}
          </Text>
        </View>

        <View style={s.grid}>
          {membres.map((m, i) => (
            <View key={i} style={s.cell} wrap={false}>
              {m.photo ? (
                // eslint-disable-next-line jsx-a11y/alt-text
                <Image src={m.photo} style={s.photo} />
              ) : (
                <View style={s.placeholder}>
                  <Text style={s.initiales}>{m.initiales}</Text>
                </View>
              )}
              <Text style={s.nom}>
                {m.prenom} {m.nom}
              </Text>
              <Text style={s.formule}>{m.formule}</Text>
              <View style={s.statutRow}>
                <View
                  style={[s.dot, { backgroundColor: m.paye ? GREEN : ORANGE }]}
                />
                <Text style={[s.statutTxt, { color: m.paye ? GREEN : ORANGE }]}>
                  {m.paye ? "Payé" : "En cours"}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <View style={s.footer} fixed>
          <Text>{CLUB.nom}</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} / ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
