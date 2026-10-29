import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  SCHEME_CATEGORIES,
    sampleSchemes,
  SCHEME_SCOPES,
} from "../data/schemes";
import { demoCitizenProfile } from "../data/demoCitizen";
import {
  matchSchemesForCitizen,
  type SchemeMatch,
} from "../data/schemeEligibility";
import { useLanguage } from "../context/LanguageContext";
import { useSimpleMode } from "../context/SimpleModeContext";
import SchemeCard from "../components/SchemeCard";
import EmptyState from "../components/EmptyState";
import type { SchemeCategory, SchemeScope } from "../types/domain";
import { citizenSchemePath } from "../routes";

type CategoryFilter = SchemeCategory | "All";
type ScopeFilter = SchemeScope | "All";
type MatchTab = "not-started" | "running";

function MatchReasons({ match }: { match: SchemeMatch }) {
  const { scheme, outcome, reasons } = match;

  const outcomeText =
    outcome === "eligible"
      ? "Potentially relevant — basic criteria matched on the provided info."
      : outcome === "more-info"
        ? "More information required to complete the basic check."
        : "Basic criteria not met based on profile information.";

  return (
    <div className="scheme-match">
      <div className="scheme-match__head">
        <Link to={citizenSchemePath(scheme.scheme_id)}>
          <strong>{scheme.name}</strong>
        </Link>
        <span
          className={`chip chip--match chip--match--${outcome}`}
        >
          {outcome === "eligible"
            ? "Potential match"
            : outcome === "more-info"
              ? "More info needed"
              : "Criteria not met"}
        </span>
      </div>

      <p className="scheme-match__outcome">{outcomeText}</p>

      <ul className="scheme-match__reasons">
        {reasons.matched.map((reason) => (
          <li key={`matched-${reason}`}>
            <span className="scheme-match__icon scheme-match__icon--ok">✓</span>{" "}
            {reason} matched
          </li>
        ))}

        {reasons.notMet.map((reason) => (
          <li key={`notmet-${reason}`}>
            <span className="scheme-match__icon scheme-match__icon--bad">✕</span>{" "}
            {reason} — criterion not met based on profile information
          </li>
        ))}

        {reasons.unknown.map((reason) => (
          <li key={`unknown-${reason}`}>
            <span className="scheme-match__icon scheme-match__icon--warn">•</span>{" "}
            {reason} — more information required
          </li>
        ))}

        {reasons.missingDocuments.map((name) => (
          <li key={`missing-${name}`}>
            <span className="scheme-match__icon scheme-match__icon--warn">⚠</span>{" "}
            Additional document required: {name}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function SchemesPage() {
  const { t } = useLanguage();
  const { tx } = useSimpleMode();

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("All");
  const [scope, setScope] = useState<ScopeFilter>("All");
  const [matchTab, setMatchTab] = useState<MatchTab>("not-started");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return sampleSchemes.filter((scheme) => {
      const matchesSearch =
        q.length === 0 ||
        scheme.name.toLowerCase().includes(q) ||
        scheme.short_description.toLowerCase().includes(q) ||
        scheme.whoIsFor.toLowerCase().includes(q) ||
        scheme.required_documents.some((doc) =>
          doc.toLowerCase().includes(q),
        ) ||
        scheme.eligibility_rules.some((rule) =>
          rule.toLowerCase().includes(q),
        );

      const matchesCategory =
        category === "All" || scheme.category === category;

      const matchesScope =
        scope === "All" || scheme.scope === scope;

      return matchesSearch && matchesCategory && matchesScope;
    });
  }, [query, category, scope]);

  const matches = useMemo(
    () => matchSchemesForCitizen(sampleSchemes),
    [],
  );

  const heading = tx("action.schemes", "scheme.simple");

  return (
    <div className="container page">
      {/* Header */}
      <header className="page__header">
        <h1>{heading}</h1>

        <p>{t("scheme.subtitle")}</p>
      </header>



      {/* Find schemes for me */}
      <section
        style={{
          marginBottom: "24px",
          padding: "16px",
          borderRadius: "12px",
          border: "1px solid #d1e7dd",
          background: "#f6fcf9",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <strong style={{ fontSize: "16px" }}>
              Find schemes for me
            </strong>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: "13px",
                color: "#3f4c48",
              }}
            >
              Compares the{" "}
              <strong>{demoCitizenProfile.label}</strong>{" "}
              profile (Madhya Pradesh · 32 yrs ·
              Very low income · General category) with the
              scheme dataset for indicative eligibility guidance.
            </p>
          </div>

          <button
            type="button"
            className="btn btn--primary"
            onClick={() =>
              setMatchTab((current) =>
                current === "running"
                  ? "not-started"
                  : "running",
              )
            }
          >
            {matchTab === "running" ? "Hide matches" : "Find schemes for me"}
          </button>
        </div>

        {matchTab === "running" && (
          <div
            style={{
              marginTop: "14px",
              borderTop: "1px solid #d1e7dd",
              paddingTop: "14px",
              display: "grid",
              gap: "14px",
            }}
            role="status"
          >
            <p
              style={{
                margin: 0,
                fontSize: "13px",
                fontWeight: 600,
              }}
            >
              Potentially relevant schemes (based on your profile):
            </p>

            {matches.map((match) => (
              <MatchReasons key={match.scheme.scheme_id} match={match} />
            ))}
          </div>
        )}
      </section>

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

      {/* Category filters */}
      <div
        className="filters"
        role="group"
        aria-label="Filter government schemes by category"
        style={{
          marginTop: "16px",
        }}
      >
        {(["All", ...SCHEME_CATEGORIES] as CategoryFilter[]).map(
          (option) => (
            <button
              key={option}
              type="button"
              className={`chip chip--filter${
                category === option
                  ? " chip--active"
                  : ""
              }`}
              aria-pressed={category === option}
              onClick={() => setCategory(option)}
            >
              {option === "All" ? "All categories" : option}
            </button>
          ),
        )}
      </div>

      {/* Scope filters */}
      <div
        className="filters"
        role="group"
        aria-label="Filter government schemes by scope"
        style={{
          marginTop: "10px",
        }}
      >
        {(["All", ...SCHEME_SCOPES] as ScopeFilter[]).map(
          (option) => (
            <button
              key={option}
              type="button"
              className={`chip chip--filter${
                scope === option
                  ? " chip--active"
                  : ""
              }`}
              aria-pressed={scope === option}
              onClick={() => setScope(option)}
            >
              {option === "All"
                ? "Central & State"
                : option === "Central"
                  ? "Central"
                  : "State-specific (MP)"}
            </button>
          ),
        )}
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