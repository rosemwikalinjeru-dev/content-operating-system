export function Planned({ title, phase, items }: { title: string; phase: string; items: string[] }) {
  return (
    <section>
      <p className="eyebrow">{phase}</p>
      <h1 className="font-display mb-4 text-4xl">{title}</h1>
      <div className="card max-w-2xl">
        <p className="mb-3 text-muted">This area is built in {phase}. Planned capabilities:</p>
        <ul className="list-disc space-y-1 pl-5">
          {items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
