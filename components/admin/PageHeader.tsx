import { type ReactNode } from "react";
import { InfoHint } from "@/components/ui/InfoHint";

// En-tête de page admin — SOURCE UNIQUE (Adhérents, Trombinoscope, Planning,
// Mailing, Tableau de bord). Titre + compteur à gauche (compteur en petit sous
// le titre) ; description hors flux (desktop ET mobile) via une icône « i »
// discrète à droite du titre ; zone d'actions à droite alignée avec le titre.
// Même taille de titre sur toutes les pages.
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
    <div>
      {/* Titre + actions sur la MÊME ligne → actions centrées verticalement sur
          la ligne du titre (align center). Le compteur passe dessous. */}
      <div className="flex items-center justify-between gap-3 md:gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className={`font-display uppercase leading-tight text-ink ${titleClassName}`}>{title}</h1>
          {description && <InfoHint content={description} className="shrink-0" />}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2 md:gap-3">{actions}</div>}
      </div>
      {count != null && <p className="mt-1 text-sm text-smoke">{count}</p>}
    </div>
  );
}
