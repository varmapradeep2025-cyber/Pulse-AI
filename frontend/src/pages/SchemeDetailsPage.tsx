import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { findSchemeBySchemeId, SCHEMES_SYNTHETIC_LABEL } from "../data/schemes";
import { schemeDocumentType } from "../data/documents";
import {
  computeSchemePhase,
  getSchemeTrackingFlags,
  isDocumentAvailable,
  setSchemeTrackingFlags,
  type SchemeTrackingFlags,
  type SchemeTrackingPhase,
} from "../data/demoCitizen";
import {
  evaluateEligibility,
  fieldOptions,
  prefilledAnswers,
  type EligibilityResult,
} from "../data/schemeEligibility";
import EmptyState from "../components/EmptyState";
import { ROUTES } from "../routes";

const PHASE_STYLES: Record<
  SchemeTrackingPhase,
  { label: string; color: string; background: string; border: string }
> = {
  "Not Started": {
    label: "Not Started",
    color: "#374151",
    background: "#f3f4f6",
    border: "#d1d5db",
  },
  "Checking Eligibility": {
    label: "Checking Eligibility",
    color: "#92400e",
    background: "#fef3c7",
    border: "#f59e0b",
  },
  "Documents Pending": {
    label: "Documents Pending",
    color: "#9a3412",
    background: "#ffedd5",
    border: "#fb923c",
  },
  "Ready to Apply": {
    label: "Ready to Apply",
    color: "#1e3a8a",
    background: "#dbeafe",
    border: "#3b82f6",
  },
  "Application Information Viewed": {
    label: "Application Information Viewed",
    color: "#14532d",
    background: "#dcfce7",
    border: "#22c55e",
  },
};

export default function SchemeDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const scheme = useMemo(
    () => (id ? findSchemeBySchemeId(id) : undefined),
    [id],
  );

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [checkResult, setCheckResult] =
    useState<EligibilityResult | null>(null);
  const [showAccess, setShowAccess] = useState(false);
  const [schemeId, setSchemeId] = useState<string | undefined>(scheme?.scheme_id);
  const [flags, setFlags] = useState<SchemeTrackingFlags | null>(
    scheme ? getSchemeTrackingFlags(scheme.scheme_id) : null,
  );

  useEffect(() => {
    if (scheme?.scheme_id === schemeId) {
      return;
    }

    setSchemeId(scheme?.scheme_id);
    setAnswers(scheme ? prefilledAnswers(scheme) : {});
    setCheckResult(null);
    setShowAccess(false);
    setFlags(scheme ? getSchemeTrackingFlags(scheme.scheme_id) : null);
  }, [scheme, schemeId]);

  if (!scheme || !flags) {
    return (
      <div className="container page">
        <EmptyState
          icon="🏛️"
          title="Scheme not found"
          description="The scheme you are looking for does not exist."
        />
        <p style={{ marginTop: "16px" }}>
          <Link className="btn btn--secondary" to={ROUTES.citizenSchemes}>
            ← Back to all schemes
          </Link>
        </p>
      </div>
    );
  }

  const phase = computeSchemePhase(scheme, flags);

  const phaseStyle = PHASE_STYLES[phase];

  const requiredDocuments = scheme.required_documents;

  const availableDocumentNames = requiredDocuments.filter((name) =>
    isDocumentAvailable(name),
  );

  const missingDocumentNames = requiredDocuments.filter(
    (name) => !isDocumentAvailable(name),
  );

  const handleRunCheck = () => {
    const result = evaluateEligibility(scheme, answers);

    setCheckResult(result);

    setSchemeTrackingFlags(scheme.scheme_id, {
      eligibilityChecked: true,
      appearsEligible: result.outcome === "eligible",
    });

    setFlags(getSchemeTrackingFlags(scheme.scheme_id));
  };

  const handleViewAccess = () => {
    setShowAccess(true);

    setSchemeTrackingFlags(scheme.scheme_id, { infoViewed: true });

    setFlags(getSchemeTrackingFlags(scheme.scheme_id));
  };

  const openDocumentsPortal = (documentName: string) => {
    navigate(ROUTES.citizenDocuments, {
      state: {
        schemeUpload: {
          documentName,
          documentType: schemeDocumentType(documentName),
          schemeId: scheme.scheme_id,
        },
      },
    });
  };

  return (
    <div className="container page">
      <p style={{ marginBottom: "12px" }}>
        <Link className="btn btn--secondary" to={ROUTES.citizenSchemes}>
          ← Back to all schemes
        </Link>
      </p>

      {/* Header */}
      <header className="page__header">
        <h1>{scheme.name}</h1>

        <div
          style={{
            display: "flex",
            gap: "8px",
            flexWrap: "wrap",
          }}
        >
          <span className="chip chip--status">{scheme.category}</span>
          <span className="chip chip--scope">
            {scheme.scope === "State" ? "State-specific" : "Central scheme"}
          </span>
          <span className="badge badge--demo">Synthetic demo data</span>
        </div>
      </header>

      {/* Tracking state */}
      <div
        className="scheme-track"
        style={{
          borderColor: phaseStyle.border,
          background: phaseStyle.background,
        }}
      >
        <span
          style={{
            fontWeight: 700,
            fontSize: "13px",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            color: phaseStyle.color,
          }}
        >
          Tracking: {phaseStyle.label}
        </span>

        <p style={{ margin: "0", fontSize: "13px", color: phaseStyle.color }}>
          Prototype tracking state for the demo. Pulse AI has not submitted
          any application — the official government source is the final
          authority.
        </p>
      </div>

      {/* Intro */}
      <section className="scheme-section">
        <h2>Overview</h2>
        <p>{scheme.full_description}</p>

        <p>
          <strong>Coverage / benefit:</strong> {scheme.coverage}
        </p>
      </section>

      {/* Who can apply */}
      <section className="scheme-section">
        <h2>Who can apply</h2>

        <p>
          <strong>Target beneficiaries:</strong>{" "}
          {scheme.target_beneficiaries.join("; ")}
        </p>

        {scheme.age_requirement && (
          <p>
            <strong>Age requirement:</strong> {scheme.age_requirement}
          </p>
        )}

        {scheme.income_requirement && (
          <p>
            <strong>Income requirement:</strong> {scheme.income_requirement}
          </p>
        )}

        {scheme.location_requirement && (
          <p>
            <strong>Location requirement:</strong>{" "}
            {scheme.location_requirement}
          </p>
        )}
      </section>

      {/* Eligibility */}
      <section className="scheme-section">
        <h2>Eligibility</h2>

        <ul className="scheme-card__list">
          {scheme.eligibility_rules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>

        {scheme.info_status === "needs-confirmation" && (
          <p className="demo-note">
            Some details of this scheme require confirmation against the
            official source — benefit figures and rules should be verified
            before use. The official government source is authoritative.
          </p>
        )}
      </section>

      {/* Basic eligibility checker */}
      <section
        className="scheme-section"
        style={{ border: "1px solid var(--color-border)" }}
      >
        <h2>Check basic eligibility</h2>

        <p className="demo-note">
          This is a prototype eligibility assessment based on the{" "}
          <strong>{SCHEMES_SYNTHETIC_LABEL}</strong> citizen profile
          (DEMO-001 · Madhya Pradesh · 32 yrs). It is not an official
          determination.
        </p>

        {scheme.demo_eligibility_fields.length === 0 ? (
          <div>
            <p>
              This scheme has no specific eligibility criteria — it is open to
              everyone. No check is required.
            </p>

            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                const result = evaluateEligibility(scheme, {});

                setCheckResult(result);

                setSchemeTrackingFlags(scheme.scheme_id, {
                  eligibilityChecked: true,
                  appearsEligible: true,
                });

                setFlags(getSchemeTrackingFlags(scheme.scheme_id));
              }}
            >
              Confirm basic eligibility
            </button>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gap: "14px",
              maxWidth: "520px",
            }}
          >
            {scheme.demo_eligibility_fields.map((field) => (
              <label key={field.key} htmlFor={`ell-${field.key}`}>
                <span style={{ fontWeight: 600, fontSize: "14px" }}>
                  {field.label}
                </span>

                {field.note && (
                  <span
                    style={{
                      display: "block",
                      fontSize: "12px",
                      opacity: 0.75,
                      margin: "2px 0 6px",
                    }}
                  >
                    {field.note}
                  </span>
                )}

                <select
                  id={`ell-${field.key}`}
                  value={answers[field.key] ?? ""}
                  onChange={(event) => {
                    const next = { ...answers, [field.key]: event.target.value };

                    setAnswers(next);
                    setCheckResult(null);
                  }}
                  style={{
                    width: "100%",
                    padding: "10px",
                    borderRadius: "8px",
                    border: "1px solid #ccc",
                    marginTop: "6px",
                  }}
                >
                  {fieldOptions(field).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            ))}

            <button
              type="button"
              className="btn btn--primary"
              onClick={handleRunCheck}
              style={{ justifySelf: "start" }}
            >
              Run basic check
            </button>
          </div>
        )}

        {checkResult &&
          (() => {
            const { outcome, fieldResults } = checkResult;

            const message =
              outcome === "eligible"
                ? "Based on the information provided, you appear to meet the basic criteria. Final eligibility is determined by the relevant government authority."
                : outcome === "more-info"
                  ? "More information required to complete the basic eligibility check."
                  : "May not meet the basic criteria based on the provided information. Final eligibility is determined by the relevant government authority.";

            const tone =
              outcome === "eligible"
                ? { background: "#dcfce7", border: "#22c55e", color: "#14532d" }
                : outcome === "more-info"
                  ? { background: "#fef3c7", border: "#f59e0b", color: "#92400e" }
                  : { background: "#fee2e2", border: "#ef4444", color: "#7f1d1d" };

            return (
              <div
                role="status"
                style={{
                  marginTop: "16px",
                  padding: "12px 14px",
                  borderRadius: "10px",
                  border: `1px solid ${tone.border}`,
                  background: tone.background,
                  color: tone.color,
                }}
              >
                <p style={{ margin: "0 0 8px", fontWeight: 700 }}>
                  {outcome === "eligible"
                    ? "Eligible based on provided information"
                    : outcome === "more-info"
                      ? "More information required"
                      : "May not meet the basic criteria"}
                </p>

                <p style={{ margin: "0 0 10px", fontSize: "14px" }}>
                  {message}
                </p>

                <ul
                  style={{
                    margin: 0,
                    paddingLeft: "18px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                    fontSize: "14px",
                  }}
                >
                  {fieldResults.map((fieldResult) => (
                    <li key={fieldResult.field.key}>
                      {fieldResult.result === "matched" && "✓ "}
                      {fieldResult.result === "not-met" && "✕ "}
                      {fieldResult.result === "unknown" && "• "}
                      {fieldResult.field.label}: {fieldResult.selected}
                    </li>
                  ))}
                </ul>

                <p
                  style={{
                    margin: "10px 0 0",
                    fontSize: "12px",
                    opacity: 0.85,
                  }}
                >
                  This is a prototype eligibility assessment, not an official
                  determination.
                </p>
              </div>
            );
          })()}
      </section>

      {/* Required documents */}
      <section className="scheme-section">
        <h2>Required documents</h2>

        {requiredDocuments.length === 0 && (
          <p className="demo-note">
            No documents are required for this scheme.
          </p>
        )}

        {requiredDocuments.length > 0 && (
          <div
            style={{
              display: "grid",
              gap: "10px",
              maxWidth: "520px",
            }}
          >
            {requiredDocuments.map((name) => {
              const available = availableDocumentNames.includes(name);

              return (
                <div
                  key={name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px",
                    padding: "10px 12px",
                    borderRadius: "10px",
                    border: `1px solid ${
                      available ? "#86efac" : "#fcd34d"
                    }`,
                    background: available ? "#f0fdf4" : "#fffbeb",
                  }}
                >
                  <span style={{ fontSize: "14px" }}>
                    {available ? "✓" : "⚠"} {name}
                    {available ? (
                      <span style={{ color: "#166534", marginLeft: "8px" }}>
                        Document available
                      </span>
                    ) : (
                      <span style={{ color: "#92400e", marginLeft: "8px" }}>
                        Document required
                      </span>
                    )}
                  </span>

                  {!available && (
                    <button
                      type="button"
                      className="btn btn--secondary"
                      onClick={() => openDocumentsPortal(name)}
                    >
                      Upload Missing Document
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {missingDocumentNames.length > 0 ? (
          <p className="demo-note">
            {missingDocumentNames.length} document
            {missingDocumentNames.length !== 1 ? "s are" : " is"} missing.
            Upload the missing document
            {missingDocumentNames.length !== 1 ? "s" : ""} in the Documents
            portal to continue the demo flow.
          </p>
        ) : (
          requiredDocuments.length > 0 && (
            <p className="demo-note">
              All required documents are available in the synthetic demo
              citizen's Documents portal.
            </p>
          )
        )}
      </section>

      {/* How to access / apply */}
      <section className="scheme-section">
        <h2>How to access / apply</h2>

        {!showAccess ? (
          <button
            type="button"
            className="btn btn--primary"
            onClick={handleViewAccess}
          >
            View application &amp; access information
          </button>
        ) : (
          <div>
            <p>{scheme.application_method}</p>

            <h3
              style={{
                fontSize: "15px",
                margin: "14px 0 8px",
              }}
            >
              Steps at a glance
            </h3>

            <ol className="scheme-card__list scheme-card__list--steps">
              {scheme.applicationSteps.map((step, index) => (
                <li key={step}>
                  Step {index + 1}: {step}
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>

      {/* Official information */}
      <section className="scheme-section">
        <h2>Official information</h2>

        <p>
          The official government source is the final authority for this
          scheme. Please confirm eligibility and procedures there before
          applying.
        </p>

        <p>
          <a
            href={scheme.official_information_url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn--secondary"
          >
            Official source: {scheme.official_information_url.replace(
              "https://",
              "",
            ).replace("www.", "")}
          </a>
        </p>

        <p className="demo-note">
          Dataset last updated: {scheme.last_updated}. Pulse AI does not
          approve or guarantee any government benefit.
        </p>
      </section>
    </div>
  );
}