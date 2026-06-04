const WORDS = [
  "Boxe Française",
  "Savate Fitness",
  "Préparation Physique",
  "Tous niveaux",
  "Dès 5 ans",
  "Encadrement fédéral",
];

export function Marquee() {
  const items = [...WORDS, ...WORDS];
  return (
    <div className="overflow-hidden border-y border-line bg-paper-2 py-5">
      <div className="flex w-max animate-marquee items-center gap-6">
        {items.map((w, i) => (
          <div key={i} className="flex items-center gap-6">
            <span className="font-display text-xl font-extrabold uppercase tracking-tight text-ink/80 sm:text-2xl">
              {w}
            </span>
            <span className="h-2 w-2 rotate-45 bg-orange" />
          </div>
        ))}
      </div>
    </div>
  );
}
