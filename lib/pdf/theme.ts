import { StyleSheet } from "@react-pdf/renderer";
import fs from "node:fs";
import path from "node:path";

export const PDF_COLORS = {
  orange: "#FF6B00",
  ink: "#0A0A0A",
  smoke: "#666666",
  line: "#DDDDDD",
  paper2: "#FAFAFA",
  white: "#FFFFFF",
};

/** Charge le logo une seule fois en data-URI base64 (fiable en serverless). */
let logoCache: string | null = null;
export function getLogoDataUri(): string | null {
  if (logoCache !== null) return logoCache || null;
  try {
    const p = path.join(process.cwd(), "public", "logo", "logo.png");
    const buf = fs.readFileSync(p);
    logoCache = `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    logoCache = "";
  }
  return logoCache || null;
}

// Polices intégrées (Helvetica) — aucune requête réseau, build stable.
export const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 44,
    paddingHorizontal: 42,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: PDF_COLORS.ink,
    lineHeight: 1.4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 3,
    borderBottomColor: PDF_COLORS.orange,
    paddingBottom: 12,
    marginBottom: 18,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  logo: { width: 46, height: 46 },
  clubName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 13,
    color: PDF_COLORS.ink,
    textTransform: "uppercase",
  },
  clubSub: { fontSize: 7.5, color: PDF_COLORS.smoke, textTransform: "uppercase", letterSpacing: 1 },
  docTitleWrap: { alignItems: "flex-end", maxWidth: 220 },
  docTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 16,
    lineHeight: 1.1,
    color: PDF_COLORS.orange,
    textTransform: "uppercase",
    textAlign: "right",
  },
  docSeason: { fontSize: 9, marginTop: 2, color: PDF_COLORS.smoke },
  h2: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    textTransform: "uppercase",
    color: PDF_COLORS.white,
    backgroundColor: PDF_COLORS.ink,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginTop: 14,
    marginBottom: 8,
  },
  row: { flexDirection: "row", marginBottom: 6, gap: 8 },
  label: { fontFamily: "Helvetica-Bold", fontSize: 9 },
  fieldLine: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: PDF_COLORS.ink,
    minHeight: 14,
  },
  p: { fontSize: 9, marginBottom: 6, textAlign: "justify" },
  small: { fontSize: 8, color: PDF_COLORS.smoke },
  bold: { fontFamily: "Helvetica-Bold" },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: PDF_COLORS.line,
    paddingVertical: 6,
  },
  price: { fontFamily: "Helvetica-Bold", fontSize: 12, color: PDF_COLORS.orange },
  checkbox: { width: 12, height: 12, borderWidth: 1, borderColor: PDF_COLORS.ink, marginRight: 5 },
  footer: {
    position: "absolute",
    bottom: 22,
    left: 42,
    right: 42,
    borderTopWidth: 1,
    borderTopColor: PDF_COLORS.line,
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: PDF_COLORS.smoke,
  },
  box: {
    borderWidth: 1,
    borderColor: PDF_COLORS.line,
    borderRadius: 4,
    padding: 10,
    marginTop: 6,
  },
});
