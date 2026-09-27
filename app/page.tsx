import { referenceRoute } from "@/src/foundation/reference-route";

export default function HomePage() {
  return (
    <main className="reference-page">
      <section className="reference-card" aria-labelledby="reference-title">
        <p className="reference-eyebrow">{referenceRoute.eyebrow}</p>
        <h1 id="reference-title" className="reference-title">
          {referenceRoute.title}
        </h1>
        <p className="reference-description">{referenceRoute.description}</p>
        <ul className="reference-checks" aria-label="Foundation guarantees">
          {referenceRoute.guarantees.map((guarantee) => (
            <li key={guarantee} className="reference-check">
              {guarantee}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
