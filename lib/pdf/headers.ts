// En-têtes HTTP des réponses PDF (module SANS JSX → importable partout, y compris
// dans les tests).

// SÛR PAR DÉFAUT : un PDF est présumé PERSONNEL (facture, attestation, document
// signé, trombinoscope…) → jamais public, jamais mis en cache partagé. Pour un
// vrai document générique/public, utiliser explicitement `pdfHeadersPublic`.
export function pdfHeaders(filename: string, inline = true): HeadersInit {
  return {
    "Content-Type": "application/pdf",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
    "Cache-Control": "private, no-store, max-age=0",
  };
}

// PDF réellement PUBLIC et générique (modèles vierges, aperçus de démonstration
// sans aucune donnée personnelle) : cache navigateur/CDN autorisé.
export function pdfHeadersPublic(filename: string, inline = true): HeadersInit {
  return {
    "Content-Type": "application/pdf",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
    "Cache-Control": "public, max-age=3600",
  };
}
