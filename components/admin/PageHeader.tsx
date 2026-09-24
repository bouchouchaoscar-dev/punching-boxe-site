import { type ReactNode } from "react";

// En-tête de page admin — SOURCE UNIQUE (Adhérents, Trombinoscope, Planning,
// Mailing). Mobile (< md) : titre réduit, compteur en petit juste dessous,
// description masquée, zone d'action compacte à droite. Desktop (≥ md) : titre
// pleine taille, description visible, actions à droite (rendu inchangé).
//
// `titleClassName` fixe la typo exacte du titre par page (pour ne pas toucher
// le desktop existant). `actions` est fourni par l'appelant, entièrement
// responsable de sa propre présentation responsive.
export function PageHeader({
  title,
  titleClassName = "text-2xl font-black md:text-4xl",
  count,
  description,
  actions,
}: {
  title: string;
  titleClassName?: string;
  count?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 md:flex-wrap md:items-end md:gap-4">
      <div className="min-w-0">
        <h1 className={`font-display uppercase leading-tight text-ink ${titleClassName}`}>{title}</h1>
        {count != null && <p className="mt-1 text-sm text-smoke">{count}</p>}
        {description && <p className="mt-2 hidden max-w-2xl text-sm text-smoke md:block">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2 md:flex-wrap md:justify-end md:gap-3">{actions}</div>}
    </div>
  );
}
