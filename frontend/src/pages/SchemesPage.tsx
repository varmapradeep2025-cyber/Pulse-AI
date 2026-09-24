import { useMemo, useState } from "react";
import { sampleSchemes } from "../data/schemes";
import { useLanguage } from "../context/LanguageContext";
import { useSimpleMode } from "../context/SimpleModeContext";
import SchemeCard from "../components/SchemeCard";
import EmptyState from "../components/EmptyState";

const SCHEME_FILTERS = [
  "All",
  "Low-income families",
  "Pregnant women",
  "Senior citizens",
  "Children",
] as const;

export default function SchemesPage() {
  const { t } = useLanguage();
  const { tx } = useSimpleMode();

  const [query, setQuery] = useState("");
  const [filter, setFilter] =
    useState<(typeof SCHEME_FILTERS)[number]>("All");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return sampleSchemes.filter((scheme) => {
      const matchesSearch =
        q.length === 0 ||
        scheme.name.toLowerCase().includes(q) ||
        scheme.whoIsFor.toLowerCase().includes(q) ||
        scheme.documents.some((doc) =>
          doc.toLowerCase().includes(q),
        );

      const who = scheme.whoIsFor.toLowerCase();

      let matchesFilter = true;

      if (filter === "Low-income families") {
        matchesFilter = who.includes("low-income");
      }

      if (filter === "Pregnant women") {
        matchesFilter = who.includes("pregnant");
      }

      if (filter === "Senior citizens") {
        matchesFilter = who.includes("senior");
      }

      if (filter === "Children") {
        matchesFilter = who.includes("children");
      }

      return matchesSearch && matchesFilter;
    });
  }, [query, filter]);

  const heading = tx(
    "action.schemes",
    "scheme.simple",
  );

  return (
    <div className="container page">
      {/* Header */}
      <header className="page__header">
        <h1>{heading}</h1>

        <p>{t("scheme.subtitle")}</p>
      </header>

      {/* Prototype notice */}
      <div
        style={{
          marginBottom: "20px",
          padding: "14px 16px",
          borderRadius: "10px",
          background: "#eff6ff",
          border: "1px solid #bfdbfe",
          color: "#1e3a8a",
          fontSize: "14px",
        }}
      >
        <strong>Prototype information:</strong>{" "}
        The schemes shown here are demonstration
        records. In deployment, Pulse AI can be
        connected to verified government scheme
        information and official application portals.
      </div>

      {/* Search */}
      <label className="search">
        <span className="sr-only">
          {t("scheme.search")}
        </span>

        <input
          type="search"
          placeholder={t("scheme.search")}
          value={query}
          onChange={(event) =>
            setQuery(event.target.value)
          }
        />
      </label>

      {/* Filters */}
      <div
        className="filters"
        role="group"
        aria-label="Filter government schemes"
        style={{
          marginTop: "16px",
        }}
      >
        {SCHEME_FILTERS.map((option) => (
          <button
            key={option}
            type="button"
            className={`chip chip--filter${
              filter === option
                ? " chip--active"
                : ""
            }`}
            aria-pressed={filter === option}
            onClick={() => setFilter(option)}
          >
            {option}
          </button>
        ))}
      </div>

      {/* Result count */}
      {filtered.length > 0 && (
        <p
          style={{
            margin: "18px 0 12px",
            fontSize: "14px",
            opacity: 0.75,
          }}
        >
          Showing{" "}
          <strong>{filtered.length}</strong>{" "}
          scheme
          {filtered.length !== 1 ? "s" : ""}
        </p>
      )}

      {/* Scheme cards */}
      {filtered.length === 0 ? (
        <EmptyState
          icon="🏛️"
          title={t("scheme.noResults")}
          description={t(
            "scheme.noResultsDesc",
          )}
        />
      ) : (
        <div className="card-grid">
          {filtered.map((scheme) => (
            <SchemeCard
              key={scheme.id}
              scheme={scheme}
            />
          ))}
        </div>
      )}
    </div>
  );
}