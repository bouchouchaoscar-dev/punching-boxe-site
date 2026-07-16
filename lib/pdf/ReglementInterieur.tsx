// ⚠️ CONTENU JURIDIQUE À RÉÉCRIRE PAR CLIENT.
// Le nom du club vient de `CLUB` (constants.ts), mais les ARTICLES ci-dessous
// sont propres à la boxe (disciplines, certificat médical, matériel…). À chaque
// duplication : réécrire le règlement intérieur selon le sport/statuts du club.
import { Document, Page, Text, View } from "@react-pdf/renderer";
import { styles } from "./theme";
import { PdfFooter, PdfHeader, SignatureBlock } from "./Shared";
import { CLUB } from "@/lib/constants";
import type { ReglementData } from "./types";

function Article({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <View wrap={false} style={{ marginBottom: 4 }}>
      <Text style={styles.h2}>{titre}</Text>
      {children}
    </View>
  );
}

export function ReglementInterieurDoc({ data }: { data?: ReglementData } = {}) {
  const filled = !!data;
  return (
    <Document title="Règlement intérieur" author={CLUB.nom}>
      <Page size="A4" style={styles.page}>
        <PdfHeader title="Règlement intérieur" />

        <Article titre="Mission du club">
          <Text style={styles.p}>
            Le {CLUB.nomCourt} a pour objectif la pratique et l&apos;enseignement
            de la Boxe Française-Savate et disciplines assimilées (Savate-Forme,
            Savate-Défense, Culture Physique…) ainsi que le développement de liens
            d&apos;amitié et de solidarité entre les adhérents.
          </Text>
          <Text style={styles.p}>
            Les activités du P.B.N.P sont ouvertes à toute personne médicalement
            apte à la pratique du sport, ayant acquitté son adhésion et étant à
            jour de sa cotisation annuelle.
          </Text>
        </Article>

        <Article titre="Fonctionnement">
          <Text style={styles.p}>
            Le P.B.N.P est une association loi 1901, dirigée par un comité directeur
            composé d&apos;un Président, un Trésorier et un Secrétaire, dont les
            rôles sont définis par les statuts. Le déroulement de l&apos;assemblée
            générale annuelle est défini par les statuts.
          </Text>
        </Article>

        <Article titre="Inscription">
          <Text style={styles.p}>
            L&apos;inscription est possible tout au long de la saison sportive (de
            septembre à juin). Chaque adhérent peut pratiquer plusieurs disciplines
            et règle chacune des activités choisies.
          </Text>
          <Text style={styles.p}>
            L&apos;inscription est effective lorsque l&apos;adhésion, la cotisation
            et la licence-assurance sont réglées, et que sont remis : la fiche
            d&apos;inscription remplie, une photo d&apos;identité et un certificat
            médical d&apos;aptitude à la Boxe Française-Savate.
          </Text>
          <Text style={styles.p}>
            Le paiement intégral se fait en une fois ; un règlement en deux, trois
            ou quatre fois est possible sur demande (notamment via paiement
            échelonné en ligne).
          </Text>
          <Text style={styles.p}>
            Pour les familles inscrivant plusieurs personnes, une remise est
            consentie sur la cotisation : -10 % pour la 3ème personne, -15 % pour la
            4ème, -20 % pour la 5ème. Le remboursement des cotisations n&apos;est
            possible qu&apos;en cas de force majeure justifié et après accord du
            comité directeur. L&apos;adhésion et la licence-assurance ne sont pas
            remboursées. Tout trimestre commencé est dû.
          </Text>
        </Article>

        <Article titre="Dispositions générales">
          <Text style={styles.p}>
            En cas de faute grave ou de non-respect du présent règlement, le comité
            directeur pourra, après avoir entendu le fautif, prononcer un
            avertissement ou la radiation du club.
          </Text>
          <Text style={styles.p}>
            Tout adhérent ne respectant pas les horaires de début de séance pourra
            se voir refuser l&apos;accès au cours. Seule une tenue de sport adaptée
            à la Boxe Française-Savate, définie par le professeur, sera acceptée. Un
            comportement gênant la bonne conduite du cours est passible de sanctions.
          </Text>
          <Text style={styles.p}>
            La personne accompagnant l&apos;élève mineur devra s&apos;assurer de la
            présence du professeur avant de laisser l&apos;enfant. Le {CLUB.nomCourt}{" "}
            décline toute responsabilité dans le cas d&apos;une présence supposée et
            non avérée, et ne peut être tenu responsable en cas de perte ou de vol
            d&apos;objets dans l&apos;enceinte du club.
          </Text>
        </Article>

        <Article titre="Remboursement et résiliation">
          <Text style={styles.p}>
            L&apos;adhésion au {CLUB.nom} est ferme et définitive pour la saison
            en cours. Aucun remboursement ni arrêt d&apos;adhésion ne peut être
            accordé, sauf dans les deux cas suivants :
          </Text>
          <Text style={styles.p}>
            1. Raison médicale : sur présentation d&apos;un certificat médical
            attestant l&apos;impossibilité définitive de pratiquer toute activité
            sportive. Le remboursement sera effectué au prorata des mois non
            consommés.
          </Text>
          <Text style={styles.p}>
            2. Déménagement : sur présentation d&apos;un justificatif de domicile
            (nouveau bail signé ou acte notarié) attestant un déménagement à plus
            de 50 km du club. Le remboursement sera effectué au prorata des mois
            non consommés.
          </Text>
          <Text style={styles.p}>
            En cas de paiement fractionné, l&apos;ensemble des échéances sera
            prélevé conformément à l&apos;engagement signé. Seuls les deux cas
            ci-dessus permettent l&apos;arrêt des prélèvements.
          </Text>
          <Text style={styles.p}>
            Toute demande de remboursement doit être adressée par email à{" "}
            {CLUB.email} avec les justificatifs nécessaires. Délai de traitement :
            30 jours.
          </Text>
        </Article>

        {filled ? (
          <View style={{ marginTop: 18 }}>
            {data?.mineur ? (
              <>
                <Text style={styles.p}>
                  Adhérent (mineur) :{" "}
                  <Text style={styles.bold}>
                    {data?.prenom} {data?.nom}
                  </Text>
                </Text>
                <Text style={styles.p}>
                  Représentant légal :{" "}
                  <Text style={styles.bold}>{data?.responsable || "—"}</Text>
                </Text>
                <SignatureBlock
                  sig={data?.signature}
                  date={data?.dateSignature}
                  mention={`Je soussigné(e) ${data?.responsable || "—"}, représentant légal de ${data?.prenom} ${data?.nom}, certifie avoir pris connaissance du règlement intérieur et m'engage à le faire respecter.`}
                />
              </>
            ) : (
              <>
                <Text style={styles.p}>
                  Adhérent :{" "}
                  <Text style={styles.bold}>
                    {data?.prenom} {data?.nom}
                  </Text>
                </Text>
                <SignatureBlock
                  sig={data?.signature}
                  date={data?.dateSignature}
                  mention="Lu et approuvé — j'accepte sans réserve le présent règlement intérieur."
                />
              </>
            )}
          </View>
        ) : (
          <View
            style={{
              marginTop: 24,
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 16,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Date :</Text>
              <View style={[styles.fieldLine, { marginTop: 4 }]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Lu et approuvé :</Text>
              <View style={[styles.fieldLine, { marginTop: 4 }]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Signature :</Text>
              <View style={[styles.fieldLine, { marginTop: 4 }]} />
            </View>
          </View>
        )}

        <PdfFooter />
      </Page>
    </Document>
  );
}
