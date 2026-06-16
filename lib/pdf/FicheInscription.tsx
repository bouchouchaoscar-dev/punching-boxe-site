import { Document, Page, StyleSheet, Svg, Line, Text, View } from "@react-pdf/renderer";
import { styles, PDF_COLORS } from "./theme";
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

// Marquage d'un montant sur la grille : "rond" = compté (cerclé orange),
// "croix" = NON compté (X orange), "barre" = remplacé par le montant remisé
// (barré gris), "none" = grille vierge.
type Marque = "rond" | "croix" | "barre" | "none";
function Montant({ marque, children }: { marque: Marque; children: string }) {
  if (marque === "barre") {
    return (
      <Text
        style={{
          fontFamily: "Helvetica-Bold",
          fontSize: 11,
          color: "#9A9A9A",
          textDecoration: "line-through",
        }}
      >
        {children}
      </Text>
    );
  }
  if (marque === "rond") {
    return (
      <View
        style={{
          borderWidth: 1.3,
          borderColor: PDF_COLORS.orange,
          borderRadius: 9,
          paddingHorizontal: 5,
          paddingVertical: 1,
        }}
      >
        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 11, color: PDF_COLORS.orange }}>
          {children}
        </Text>
      </View>
    );
  }
  if (marque === "croix") {
    return (
      <View style={{ position: "relative", paddingHorizontal: 3, paddingVertical: 1 }}>
        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 11, color: "#9A9A9A" }}>
          {children}
        </Text>
        <Svg
          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <Line x1="6" y1="14" x2="94" y2="86" stroke={PDF_COLORS.orange} strokeWidth="7" />
          <Line x1="94" y1="14" x2="6" y2="86" stroke={PDF_COLORS.orange} strokeWidth="7" />
        </Svg>
      </View>
    );
  }
  return <Text style={styles.price}>{children}</Text>;
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

  // Marquage paramétré sur les VRAIES données du dossier (rien en dur).
  // Vierge → "none" (grille neutre). Rempli → rond sur ce qui compte, croix sinon.
  const markCot = (pkg: string, type: "adulte" | "jeune"): Marque =>
    !filled
      ? "none"
      : data!.packageType === pkg && data!.typeAdherent === type
        ? "rond"
        : "croix";
  const markAdhesion: Marque = !filled ? "none" : data!.adhesionDue ? "rond" : "croix";
  // Prépa = supplément RÉEL uniquement en Boxe Française avec l'option choisie
  // (en Savate & Prépa elle est incluse dans la cotisation, pas additionnée).
  const markPrepa: Marque = !filled
    ? "none"
    : data!.packageType === "boxe_classique" && data!.optionPrepa
      ? "rond"
      : "croix";

  // Format FR d'un montant (entier sans décimales, sinon 2 décimales virgule).
  const fmtMontant = (n: number) => {
    const r = Math.round(n * 100) / 100;
    return Number.isInteger(r) ? `${r}` : r.toFixed(2).replace(".", ",");
  };

  // Cellule "cotisation" d'une formule. Si la formule est CHOISIE et qu'une
  // remise familiale s'applique : montants bruts BARRÉS + montant remisé (du type
  // retenu) affiché à gauche avec le %. Sinon : rond/croix par type (ou neutre).
  const celluleCotisation = (pkg: "boxe_classique" | "savate_prepa") => {
    const adulte = TARIFS.cotisation[pkg].adulte;
    const jeune = TARIFS.cotisation[pkg].jeune;
    const choisie = filled && data!.packageType === pkg;
    const remisePct = data?.remisePct ?? 0;
    if (choisie && remisePct > 0) {
      const base = data!.typeAdherent === "jeune" ? jeune : adulte;
      const remise = base * (1 - remisePct / 100);
      return (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 11, color: PDF_COLORS.orange }}>
            {fmtMontant(remise)} € (−{remisePct}% remise familiale)
          </Text>
          <Montant marque="barre">{`${adulte}`}</Montant>
          <Text style={{ fontSize: 11, color: "#9A9A9A" }}>/</Text>
          <Montant marque="barre">{`${jeune}`}</Montant>
        </View>
      );
    }
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
        <Montant marque={markCot(pkg, "adulte")}>{`${adulte}`}</Montant>
        <Text style={styles.price}>/</Text>
        <Montant marque={markCot(pkg, "jeune")}>{`${jeune}`}</Montant>
        <Text style={styles.price}>€</Text>
      </View>
    );
  };

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
          {celluleCotisation("boxe_classique")}
        </View>
        <View style={[styles.priceRow, f.priceRow]}>
          <Text>
            <Text style={styles.bold}>Savate &amp; Prépa</Text> — Cotisation / Licence (Adultes / Jeunes)
          </Text>
          {celluleCotisation("savate_prepa")}
        </View>
        <Text style={[styles.small, f.small, { marginBottom: 4 }]}>
          Jeunes : moins de 13 ans.
        </Text>
        <View style={[styles.priceRow, f.priceRow]}>
          <Text>
            <Text style={styles.bold}>Adhésion-club</Text> (1ère année)
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
            <Montant marque={markAdhesion}>{`${TARIFS.adhesion} €`}</Montant>
          </View>
        </View>
        <View style={[styles.priceRow, f.priceRow]}>
          <Text>
            <Text style={styles.bold}>Préparation Physique</Text>{" "}
            {filled
              ? data?.packageType === "savate_prepa"
                ? "(incluse dans la formule)"
                : data?.optionPrepa
                  ? "(option choisie)"
                  : "(non prise)"
              : "(option Boxe Française · incluse en Savate et Prépa)"}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
            <Montant marque={markPrepa}>{`+ ${TARIFS.prepaPhysique} €`}</Montant>
          </View>
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
              )}{" "}
              autorise mon enfant{" "}
              {filled ? (
                <Text style={styles.bold}>
                  {data?.prenom} {data?.nom}
                </Text>
              ) : (
                "............................................"
              )}{" "}
              à participer aux activités et entraînements du club Punching Boxe.
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
            mention="Je certifie l'exactitude des informations renseignées ci-dessus."
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
