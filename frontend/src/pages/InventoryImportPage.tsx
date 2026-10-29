import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { Link } from "react-router-dom";
import {
  InventoryApiError,
  confirmInventoryImport,
  downloadInventoryTemplate,
  fileIssuesFromError,
  getInventorySummary,
  previewInventoryImport,
  type InventoryCorrectionMode,
  type InventoryDatasetKind,
  type InventoryImportResult,
  type InventoryIssue,
  type InventoryLedgerSummary,
  type InventoryPreview,
  type InventoryRowResult,
} from "../api/inventoryImport";

const MAX_PREVIEW_ROWS = 200;

function formatDate(value: string | null): string {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "Not imported";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function datasetLabel(kind: InventoryDatasetKind): string {
  return kind === "synthetic" ? "Synthetic data" : "Real hospital data";
}

function correctionLabel(mode: InventoryCorrectionMode): string {
  return mode === "reject" ? "Reject existing reports" : "Replace existing reports";
}

function issueTone(severity: "error" | "warning"): string {
  return severity === "error" ? "inventory-issue--error" : "inventory-issue--warning";
}

function statusTone(status: InventoryRowResult["status"]): string {
  return `inventory-row-status inventory-row-status--${status}`;
}

function errorText(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The inventory request could not be completed.";
}

function isAccessError(error: unknown): boolean {
  return (
    error instanceof InventoryApiError &&
    (error.status === 403 || error.code === "INVENTORY_STAFF_ACCESS_REQUIRED")
  );
}

function isSchemaError(error: unknown): boolean {
  return (
    error instanceof InventoryApiError &&
    error.code === "INVENTORY_SCHEMA_NOT_READY"
  );
}

function RowIssues({ issues }: { issues: InventoryIssue[] }) {
  if (issues.length === 0) {
    return <span className="inventory-muted">No issues</span>;
  }

  return (
    <div className="inventory-issues">
      {issues.map((issue, index) => (
        <span
          className={`inventory-issue ${issueTone(issue.severity)}`}
          key={`${issue.code}-${issue.field ?? "row"}-${index}`}
        >
          {issue.message}
        </span>
      ))}
    </div>
  );
}

function SummaryCards({ summary }: { summary: InventoryLedgerSummary }) {
  return (
    <div className="inventory-summary-grid">
      <div className="inventory-summary-card">
        <span>Latest real report</span>
        <strong>
          {summary.latestReal ? formatDate(summary.latestReal.reportDate) : "None yet"}
        </strong>
        <small>{summary.realRowCount} real daily report rows stored</small>
      </div>
      <div className="inventory-summary-card inventory-summary-card--synthetic">
        <span>Latest synthetic report</span>
        <strong>
          {summary.latestSynthetic
            ? formatDate(summary.latestSynthetic.reportDate)
            : "None yet"}
        </strong>
        <small>{summary.syntheticRowCount} synthetic daily report rows stored</small>
      </div>
      <div className="inventory-summary-card">
        <span>Recent previews</span>
        <strong>{summary.recentBatches.length}</strong>
        <small>Review-only batches shown below</small>
      </div>
      <div className="inventory-summary-card">
        <span>Scenarios are using</span>
        <strong>
          {summary.active ? summary.active.kind : "No active source"}
        </strong>
        <small>
          {summary.active
            ? `${summary.active.rowCount} stock rows · ${summary.active.stockoutRows} stock-outs · snapshot ${formatDate(summary.active.snapshotDate)}`
            : "Run an import or seed legacy inventory data."}
        </small>
      </div>
    </div>
  );
}

function BatchHistory({ summary }: { summary: InventoryLedgerSummary }) {
  if (summary.recentBatches.length === 0) {
    return (
      <p className="inventory-empty">
        No inventory workbooks have been previewed yet.
      </p>
    );
  }

  return (
    <div className="inventory-table-wrap">
      <table className="inventory-table">
        <thead>
          <tr>
            <th>File</th>
            <th>Class</th>
            <th>Status</th>
            <th>Period</th>
            <th>Rows</th>
            <th>Submitted</th>
          </tr>
        </thead>
        <tbody>
          {summary.recentBatches.map((batch) => (
            <tr key={batch.batchId}>
              <td>{batch.fileName}</td>
              <td>
                <span className="inventory-badge">{datasetLabel(batch.datasetKind)}</span>
              </td>
              <td>{batch.status}</td>
              <td>
                {formatDate(batch.reportingPeriodStart)}
                {batch.reportingPeriodEnd &&
                  batch.reportingPeriodEnd !== batch.reportingPeriodStart &&
                  ` to ${formatDate(batch.reportingPeriodEnd)}`}
              </td>
              <td>
                {batch.acceptedCount} accepted
                {batch.rejectedCount > 0 && `, ${batch.rejectedCount} rejected`}
              </td>
              <td>{formatDateTime(batch.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PreviewTable({ preview }: { preview: InventoryPreview }) {
  const visibleRows = preview.rows.slice(0, MAX_PREVIEW_ROWS);

  return (
    <div className="inventory-table-wrap">
      <table className="inventory-table inventory-table--preview">
        <thead>
          <tr>
            <th>Row</th>
            <th>Date</th>
            <th>Hospital</th>
            <th>Medicine</th>
            <th>Opening</th>
            <th>Received</th>
            <th>Dispensed</th>
            <th>Closing</th>
            <th>Minimum</th>
            <th>Safety</th>
            <th>Reserved</th>
            <th>Pending order</th>
            <th>Supplier</th>
            <th>Stock-out</th>
            <th>Source</th>
            <th>Status</th>
            <th>Validation</th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row) => (
            <tr key={`${row.row_number}-${row.key ?? "invalid"}`}>
              <td>{row.row_number}</td>
              <td>{formatDate(row.data?.report_date ?? null)}</td>
              <td>{row.data?.hospital_id ?? "Unknown"}</td>
              <td>
                {row.data?.medicine_name ?? "Unknown"}
                {row.data && <small> #{row.data.medicine_id}</small>}
              </td>
              <td>{row.data?.opening_stock ?? "Not available"}</td>
              <td>{row.data?.quantity_received ?? "Not available"}</td>
              <td>{row.data?.quantity_dispensed ?? "Not available"}</td>
              <td>{row.data?.closing_stock ?? "Not available"}</td>
              <td>{row.data?.minimum_stock_level ?? "Not available"}</td>
              <td>{row.data?.safety_stock ?? "Not set"}</td>
              <td>{row.data?.reserved_stock ?? "Not set"}</td>
              <td>{row.data?.pending_order_quantity ?? "Not set"}</td>
              <td>{row.data?.supplier_id ?? "Not set"}</td>
              <td>
                {row.data?.stockout_flag === null || row.data?.stockout_flag === undefined
                  ? "Not set"
                  : row.data.stockout_flag
                    ? "Yes"
                    : "No"}
              </td>
              <td>{row.data?.data_source ?? "Not set"}</td>
              <td>
                <span className={statusTone(row.status)}>{row.status}</span>
              </td>
              <td>
                <RowIssues issues={row.issues} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {preview.rows.length > visibleRows.length && (
        <p className="inventory-table-note">
          Showing the first {visibleRows.length} of {preview.rows.length} rows.
          The import applies to every accepted row shown in the counts above.
        </p>
      )}
    </div>
  );
}

export default function InventoryImportPage() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [summary, setSummary] = useState<InventoryLedgerSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<unknown>(null);
  const [file, setFile] = useState<File | null>(null);
  const [datasetKind, setDatasetKind] = useState<InventoryDatasetKind | "">("");
  const [correctionMode, setCorrectionMode] =
    useState<InventoryCorrectionMode>("reject");
  const [preview, setPreview] = useState<InventoryPreview | null>(null);
  const [importResult, setImportResult] = useState<InventoryImportResult | null>(
    null,
  );
  const [formError, setFormError] = useState<unknown>(null);
  const [fileIssues, setFileIssues] = useState<InventoryIssue[]>([]);
  const [busy, setBusy] = useState<"preview" | "confirm" | "download" | null>(
    null,
  );

  async function loadSummary(options?: { refreshSession?: boolean } | unknown) {
    const refreshSession =
      typeof options === "object" &&
      options !== null &&
      "refreshSession" in options
        ? Boolean((options as { refreshSession?: boolean }).refreshSession)
        : false;
    setSummaryLoading(true);

    try {
      const nextSummary = await getInventorySummary({ refreshSession });
      setSummary(nextSummary);
      setSummaryError(null);
    } catch (error) {
      setSummaryError(error);
    } finally {
      setSummaryLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    getInventorySummary()
      .then((nextSummary) => {
        if (active) {
          setSummary(nextSummary);
          setSummaryError(null);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setSummaryError(error);
        }
      })
      .finally(() => {
        if (active) {
          setSummaryLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const accessDenied = isAccessError(summaryError) || isAccessError(formError);
  const schemaUnavailable =
    isSchemaError(summaryError) || isSchemaError(formError);
  const canPreview = Boolean(
    file && datasetKind && busy === null && !schemaUnavailable && !accessDenied,
  );
  const canConfirm =
    Boolean(preview && preview.acceptedCount > 0 && !importResult) &&
    busy === null &&
    !schemaUnavailable &&
    !accessDenied;

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;
    setPreview(null);
    setImportResult(null);
    setFormError(null);
    setFileIssues([]);

    if (!nextFile) {
      setFile(null);
      return;
    }

    if (!nextFile.name.toLowerCase().endsWith(".xlsx")) {
      setFile(null);
      setFormError(new Error("Choose an .xlsx workbook. Legacy .xls and CSV files are not accepted."));
      if (fileInput.current) {
        fileInput.current.value = "";
      }
      return;
    }

    if (nextFile.size > 5 * 1024 * 1024) {
      setFile(null);
      setFormError(new Error("Workbooks must be 5 MB or smaller."));
      if (fileInput.current) {
        fileInput.current.value = "";
      }
      return;
    }

    setFile(nextFile);
  }

  async function handlePreview() {
    if (!file || !datasetKind || busy !== null) {
      setFormError(new Error("Choose a workbook and its data class before previewing."));
      return;
    }

    setBusy("preview");
    setFormError(null);
    setFileIssues([]);
    setPreview(null);
    setImportResult(null);

    try {
      const nextPreview = await previewInventoryImport(
        file,
        datasetKind,
        correctionMode,
      );
      setPreview(nextPreview);
      await loadSummary();
    } catch (error) {
      setFormError(error);
      setFileIssues(fileIssuesFromError(error));
    } finally {
      setBusy(null);
    }
  }

  async function handleConfirm() {
    if (!preview || busy !== null) {
      return;
    }

    setBusy("confirm");
    setFormError(null);

    try {
      const result = await confirmInventoryImport(preview.batchId);
      setImportResult(result);
      await loadSummary();
    } catch (error) {
      setFormError(error);
    } finally {
      setBusy(null);
    }
  }

  async function handleDownload(sample: boolean) {
    setBusy("download");
    setFormError(null);

    try {
      const blob = await downloadInventoryTemplate(sample);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = sample
        ? "pulse-inventory-sample.xlsx"
        : "pulse-inventory-template.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setFormError(error);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="appointment-page inventory-page">
      <div className="container">
        <header className="inventory-header">
          <div>
            <p className="appointment-eyebrow">Hospital Portal</p>
            <h1>Inventory data import</h1>
            <p>
              Preview daily or multi-day stock reports before they are saved. Each
              accepted report is stored as synthetic or real hospital data, never
              both in the same class.
            </p>
          </div>
          <div className="inventory-header__actions">
            <button
              className="btn btn--secondary"
              disabled={busy !== null}
              onClick={() => handleDownload(false)}
              type="button"
            >
              Download blank template
            </button>
            <button
              className="btn btn--ghost"
              disabled={busy !== null}
              onClick={() => handleDownload(true)}
              type="button"
            >
              Download sample
            </button>
          </div>
        </header>

        {accessDenied && (
          <div className="appointment-access-card inventory-access-card">
            <h2>
              {summaryError instanceof InventoryApiError &&
              summaryError.code === "INVENTORY_HOSPITAL_SCOPE_REQUIRED"
                ? "Inventory hospital scope required"
                : "Inventory access required"}
            </h2>
            <p>
              {summaryError instanceof InventoryApiError &&
              summaryError.code === "INVENTORY_HOSPITAL_SCOPE_REQUIRED"
                ? "Your account is assigned inventory staff access, but has no hospital IDs configured. Ask an administrator to assign at least one hospital ID in app_metadata.inventory_hospital_ids (e.g. [1, 2]), or grant full access via INVENTORY_STAFF_USER_IDS."
                : "This account is signed in but is not assigned to inventory access. Ask an administrator to add your Supabase user ID to INVENTORY_STAFF_USER_IDS, or set trusted app_metadata.inventory_staff and at least one hospital ID in app_metadata.inventory_hospital_ids."}
            </p>
            {summaryError instanceof InventoryApiError &&
              Boolean(
                (summaryError.details as { userId?: string } | undefined)?.userId,
              ) && (
                <p className="inventory-muted" style={{ marginTop: "8px" }}>
                  Your Supabase user ID:{" "}
                  <code>
                    {(summaryError.details as { userId: string }).userId}
                  </code>
                </p>
              )}
            <button
              className="btn btn--secondary"
              disabled={summaryLoading}
              onClick={() => loadSummary({ refreshSession: true })}
              type="button"
            >
              {summaryLoading ? "Checking access..." : "Check access again"}
            </button>
          </div>
        )}

        {!accessDenied && schemaUnavailable && (
          <div className="appointment-access-card inventory-access-card">
            <h2>Inventory storage is not ready</h2>
            <p>
              The inventory import migration has not been applied to this
              Supabase project. Apply
              <code>20261026000200_inventory_import.sql</code> before uploading
              workbooks.
            </p>
            <button
              className="btn btn--secondary"
              onClick={loadSummary}
              type="button"
            >
              Check storage again
            </button>
          </div>
        )}

        {summaryError && !accessDenied && !schemaUnavailable ? (
          <div className="appointment-page-error">
            <p>{errorText(summaryError)}</p>
            <button className="btn btn--secondary" onClick={loadSummary} type="button">
              Retry
            </button>
          </div>
        ) : null}

        {summary && <SummaryCards summary={summary} />}

        {!accessDenied ? (
        <div className="inventory-layout">
          <section className="inventory-panel" aria-labelledby="inventory-upload-title">
            <div className="inventory-panel__head">
              <div>
                <h2 id="inventory-upload-title">Upload and preview</h2>
                <p className="inventory-muted">
                  Nothing is imported until you confirm the validated preview.
                </p>
              </div>
            </div>

            <div className="inventory-step">
              <span className="inventory-step__number">1</span>
              <div>
                <h3>Choose the data class</h3>
                <p className="inventory-muted">
                  Synthetic and real records are stored with separate uniqueness
                  rules, so a practice report can never overwrite an operational report.
                </p>
                <div className="inventory-radio-group">
                  <label>
                    <input
                      checked={datasetKind === "synthetic"}
                      name="datasetKind"
                      onChange={() => {
                        setDatasetKind("synthetic");
                        setPreview(null);
                        setImportResult(null);
                      }}
                      type="radio"
                      value="synthetic"
                    />
                    <span>
                      <strong>Practice dataset</strong>
                      <small>Test and simulated data.</small>
                    </span>
                  </label>
                  <label>
                    <input
                      checked={datasetKind === "real"}
                      name="datasetKind"
                      onChange={() => {
                        setDatasetKind("real");
                        setPreview(null);
                        setImportResult(null);
                      }}
                      type="radio"
                      value="real"
                    />
                    <span>
                      <strong>Real hospital data</strong>
                      <small>Authorized operational stock reports only.</small>
                    </span>
                  </label>
                </div>
              </div>
            </div>

            <div className="inventory-step">
              <span className="inventory-step__number">2</span>
              <div>
                <h3>Choose duplicate handling</h3>
                <div className="inventory-radio-group">
                  <label>
                    <input
                      checked={correctionMode === "reject"}
                      name="correctionMode"
                      onChange={() => {
                        setCorrectionMode("reject");
                        setPreview(null);
                        setImportResult(null);
                      }}
                      type="radio"
                      value="reject"
                    />
                    <span>
                      <strong>Reject existing reports</strong>
                      <small>Default. Stops before changing any existing report.</small>
                    </span>
                  </label>
                  <label>
                    <input
                      checked={correctionMode === "replace"}
                      name="correctionMode"
                      onChange={() => {
                        setCorrectionMode("replace");
                        setPreview(null);
                        setImportResult(null);
                      }}
                      type="radio"
                      value="replace"
                    />
                    <span>
                      <strong>Replace existing reports</strong>
                      <small>Use only for an intentional correction of the same key.</small>
                    </span>
                  </label>
                </div>
              </div>
            </div>

            <div className="inventory-step">
              <span className="inventory-step__number">3</span>
              <div>
                <h3>Select the workbook</h3>
                <input
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="inventory-file-input"
                  id="inventory-file"
                  onChange={handleFileChange}
                  ref={fileInput}
                  type="file"
                />
                <label className="inventory-file-label" htmlFor="inventory-file">
                  <strong>{file ? file.name : "Choose an .xlsx workbook"}</strong>
                  <span>
                    {file
                      ? `${formatBytes(file.size)} selected`
                      : "Maximum 20 MB, first worksheet, header row 1, up to 10,000 data rows."}
                  </span>
                </label>
              </div>
            </div>

            <div className="inventory-preview-actions">
              <button
                className="btn btn--primary"
                disabled={!canPreview}
                onClick={handlePreview}
                type="button"
              >
                {busy === "preview" ? "Validating workbook..." : "Preview workbook"}
              </button>
              <span className="inventory-muted">
                {datasetKind ? datasetLabel(datasetKind) : "Select a data class"}
                {file ? ` | ${correctionLabel(correctionMode)}` : ""}
              </span>
            </div>

            {formError ? (
              <div className="inventory-form-error" role="alert">
                <p>{errorText(formError)}</p>
                {fileIssues.length > 0 && (
                  <ul>
                    {fileIssues.map((issue, index) => (
                      <li key={`${issue.code}-${index}`}>{issue.message}</li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </section>

          <aside className="inventory-side">
            <section className="inventory-panel">
              <h2>Import rules</h2>
              <ul className="inventory-rules">
                <li>Every row must pass required fields, hospital/medicine IDs, units, and date checks.</li>
                <li>Closing stock must match opening + received - dispensed - expired + adjustments.</li>
                <li>Warnings are visible before confirmation; errors reject the row.</li>
                <li>Duplicate keys inside a file are rejected before any import.</li>
                <li>Previews expire after 24 hours. Upload again instead of reusing an old preview.</li>
                <li>Hospital-scoped staff can preview, import, and summarize only assigned hospitals.</li>
                <li>This milestone does not overwrite current stock, demand history, orders, or forecasts.</li>
              </ul>
            </section>

            <section className="inventory-panel">
              <h2>Recent import batches</h2>
              {summaryLoading ? (
                <p className="inventory-muted">Loading inventory history...</p>
              ) : summary ? (
                <BatchHistory summary={summary} />
              ) : (
                <p className="inventory-muted">Inventory history is unavailable.</p>
              )}
            </section>
          </aside>
        </div>
        ) : null}

        {preview && (
          <section className="inventory-panel inventory-preview" aria-labelledby="inventory-preview-title">
            <div className="inventory-panel__head">
              <div>
                <p className="appointment-eyebrow">Validated preview</p>
                <h2 id="inventory-preview-title">{preview.fileName}</h2>
                <p className="inventory-muted">
                  {datasetLabel(preview.datasetKind)} | {correctionLabel(preview.correctionMode)}
                </p>
              </div>
              <span className={`inventory-batch-status inventory-batch-status--${preview.status}`}>
                {preview.status}
              </span>
            </div>

            <div className="inventory-preview-meta">
              <span>
                Period:{" "}
                <strong>
                  {formatDate(preview.reportingPeriodStart)}
                  {preview.reportingPeriodEnd &&
                    preview.reportingPeriodEnd !== preview.reportingPeriodStart &&
                    ` to ${formatDate(preview.reportingPeriodEnd)}`}
                </strong>
              </span>
              <span>
                Expires: <strong>{formatDateTime(preview.expiresAt)}</strong>
              </span>
              <span>
                File hash: <code>{preview.fileHash.slice(0, 12)}...</code>
              </span>
            </div>

            <div className="inventory-counts">
              <div>
                <strong>{preview.acceptedCount}</strong>
                <span>will be imported</span>
              </div>
              <div className="inventory-count--warning">
                <strong>{preview.warningCount}</strong>
                <span>warnings</span>
              </div>
              <div className="inventory-count--error">
                <strong>{preview.rejectedCount}</strong>
                <span>rejected</span>
              </div>
              <div>
                <strong>{preview.replacementCount}</strong>
                <span>will replace</span>
              </div>
            </div>

            {preview.fileWarnings.length > 0 && (
              <div className="inventory-file-warnings">
                {preview.fileWarnings.map((issue, index) => (
                  <p key={`${issue.code}-${index}`}>{issue.message}</p>
                ))}
              </div>
            )}

            <PreviewTable preview={preview} />

            <div className="inventory-confirm">
              <div>
                <strong>
                  {importResult
                    ? "Import completed"
                    : preview.acceptedCount > 0
                      ? "Confirm only after checking warnings and rejected rows."
                      : "No rows can be imported from this preview."}
                </strong>
                <p className="inventory-muted">
                  {importResult
                    ? `${importResult.importedCount} records imported, ${importResult.replacedCount} replaced, ${importResult.rejectedCount} rejected rows left untouched.`
                    : `Import target: ${datasetLabel(preview.datasetKind).toLowerCase()}, ${correctionLabel(preview.correctionMode).toLowerCase()}.`}
                </p>
              </div>
              <button
                className="btn btn--primary"
                disabled={!canConfirm}
                onClick={handleConfirm}
                type="button"
              >
                {busy === "confirm"
                  ? "Importing..."
                  : importResult
                    ? "Imported"
                    : `Confirm import (${preview.acceptedCount})`}
              </button>
            </div>

            {importResult && (
              <div
                style={{
                  marginTop: "1.25rem",
                  padding: "1.25rem",
                  borderRadius: "var(--radius, 8px)",
                  background: "var(--color-primary-soft, #eff6ff)",
                  border: "2px solid var(--color-primary, #2563eb)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ fontSize: "1.5rem" }}>🚀</span>
                  <div>
                    <h3 style={{ margin: 0, color: "var(--color-primary-dark, #1e40af)" }}>
                      Inventory Dataset Ready for Scenario Simulation
                    </h3>
                    <p style={{ margin: 0, fontSize: "0.92rem", color: "var(--color-text-muted, #475569)" }}>
                      Your imported inventory ({importResult.importedCount} records) is now active and immediately connects to all five disruption stress tests.
                    </p>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                  <Link
                    to="/operations/scenarios"
                    className="btn btn--primary"
                    style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
                  >
                    Simulate 5 Scenarios with This Inventory →
                  </Link>
                  <Link
                    to="/operations/intelligence"
                    className="btn btn--secondary"
                    style={{ textDecoration: "none" }}
                  >
                    View Operational Intelligence
                  </Link>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
