-- 012 — [Planning] Distinguer « Boxe française » de « Boxe française + Prépa ».
-- Le club a 3 formules (formuleCle : boxe | boxe_prepa | savate_prepa), dérivées
-- de package + option prépa — exactement comme les adhérents (package +
-- option_prepa_physique). On ALIGNE le modèle des cours en ajoutant `avec_prepa`
-- (miroir de adherents.option_prepa_physique), plutôt qu'un enum ad hoc.
--
-- Ainsi un cours « Boxe + Prépa » (package=boxe_classique, avec_prepa=true) pourra
-- en V2 cibler à la fois le segment boxe (via package) ET le segment prépa (via
-- avec_prepa), en réutilisant formuleCle() / la logique de segments existante.
--
-- ADDITIF & non destructif : colonne à défaut false → les cours existants (sans
-- prépa) restent valides. Aucune donnée supprimée.

alter table public.cours
  add column if not exists avec_prepa boolean not null default false;

notify pgrst, 'reload schema';
