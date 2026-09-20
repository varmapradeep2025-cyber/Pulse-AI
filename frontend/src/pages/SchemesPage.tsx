import { useMemo, useState } from "react";
import { sampleSchemes } from "../data/schemes";
import { useLanguage } from "../context/LanguageContext";
import { useSimpleMode } from "../context/SimpleModeContext";
import SchemeCard from "../components/SchemeCard";
import EmptyState from "../components/EmptyState";

export default function SchemesPage() {
  const { t } = useLanguage();
  const { tx } = useSimpleMode();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return sampleSchemes;
    return sampleSchemes.filter((scheme) =>
      scheme.name.toLowerCase().includes(q),
    );
  }, [query]);

  const heading = tx("action.schemes", "scheme.simple");

  return (
    <div className="container page">
      <header className="page__header">
        <h1>{heading}</h1>
        <p>{t("scheme.subtitle")}</p>
      </header>

      <label className="search">
        <span className="sr-only">{t("scheme.search")}</span>
        <input
          type="search"
          placeholder={t("scheme.search")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      {filtered.length === 0 ? (
        <EmptyState
          icon="🏛️"
          title={t("scheme.noResults")}
          description={t("scheme.noResultsDesc")}
        />
      ) : (
        <div className="card-grid">
          {filtered.map((scheme) => (
            <SchemeCard key={scheme.id} scheme={scheme} />
          ))}
        </div>
      )}
    </div>
  );
}