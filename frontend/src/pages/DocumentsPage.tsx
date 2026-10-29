import { useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  documentCategories,
  documentCategoryByType,
  sampleDocuments,
  SYNTHETIC_DOCUMENT_TYPES,
} from "../data/documents";
import { getHospitalName, syntheticHospitals } from "../data/hospitals";
import { syntheticPatientIds } from "../data/patients";
import { markDocumentUploaded } from "../data/demoCitizen";
import { useLanguage } from "../context/LanguageContext";
import DocumentCard from "../components/DocumentCard";
import EmptyState from "../components/EmptyState";
import type {
  Document,
  DocumentCategory,
  DocumentStatus,
} from "../types/domain";
import type { TranslationKey } from "../data/translations";

const CATEGORY_KEYS: Record<DocumentCategory, TranslationKey> = {
  "Identity Documents": "doc.identity",
  "Healthcare Documents": "doc.healthcare",
  "Scheme Documents": "doc.scheme",
  Reports: "doc.reports",
  Prescriptions: "doc.prescriptions",
};

type UploadStage = "idle" | "uploading" | "verifying" | "complete";

interface SchemeUploadState {
  openAdd: boolean;
  documentName: string;
  documentType: string;
  schemeId: string;
}

function formatFileSize(bytes: number): string {
  if (bytes <= 0) {
    return "0 KB";
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsPage() {
  const { t } = useLanguage();

  /*
   * Scheme-driven upload: when the user opens this page from a scheme's
   * "Upload Missing Document" button, the form is prefilled so the upload
   * continues the existing Documents portal flow.
   */
  const location = useLocation();

  const schemeUpload = (
    (location.state as { schemeUpload?: SchemeUploadState } | null)
      ?.schemeUpload
  );

  const [category, setCategory] =
    useState<DocumentCategory | "All">("All");

  const [addOpen, setAddOpen] = useState(Boolean(schemeUpload));

  const [uploadedDocuments, setUploadedDocuments] =
    useState<Document[]>([]);

  const [documentName, setDocumentName] = useState(
    schemeUpload?.documentName ?? "",
  );

  const [documentType, setDocumentType] = useState(
    schemeUpload?.documentType ??
      SYNTHETIC_DOCUMENT_TYPES[0],
  );

  const [patientId, setPatientId] = useState(
    syntheticPatientIds[0],
  );

  const [hospitalId, setHospitalId] = useState(
    syntheticHospitals[0].hospital_id,
  );

  const [selectedFile, setSelectedFile] =
    useState<File | null>(null);

  const [message, setMessage] = useState("");

  const [uploadStage, setUploadStage] =
    useState<UploadStage>("idle");

  const [uploadProgress, setUploadProgress] =
    useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const allDocuments = [
    ...uploadedDocuments,
    ...sampleDocuments,
  ];

  const documents =
    category === "All"
      ? allDocuments
      : allDocuments.filter(
          (doc) => doc.category === category,
        );

  const handleFileChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setSelectedFile(file);

    if (!documentName.trim()) {
      const fileNameWithoutExtension =
        file.name.replace(/\.[^/.]+$/, "");

      setDocumentName(fileNameWithoutExtension);
    }

    setMessage("");
    setUploadStage("idle");
    setUploadProgress(0);
  };

  const clearFileSelection = () => {
    setDocumentName("");
    setSelectedFile(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmitDocument = () => {
    if (!selectedFile) {
      setMessage("Please select a document first.");
      return;
    }

    if (!documentName.trim()) {
      setMessage("Please enter a document name.");
      return;
    }

    setMessage("");
    setUploadStage("uploading");
    setUploadProgress(12);

    /*
     * REALISTIC DEMO UPLOAD
     * ---------------------
     * The upload is simulated locally so the demo works offline.
     * No file is transmitted or stored on any server. A synthetic
     * document record is added to the list below.
     */
    window.setTimeout(() => {
      setUploadProgress(46);
    }, 350);

    window.setTimeout(() => {
      setUploadProgress(74);
      setUploadStage("verifying");
    }, 850);

    window.setTimeout(() => {
      const finishWith = (selectedFileValue: File) => {
        const extension =
          selectedFileValue.name
            .split(".")
            .pop()
            ?.toUpperCase() || "FILE";

        const today = new Date()
          .toISOString()
          .split("T")[0];

        const documentId = `UPL-${Date.now()}`;

        /*
         * The picked file is kept in the browser via an object URL, so the
         * upload is "real" from the user's perspective: it can be opened or
         * downloaded from the document card. Nothing is sent to a server.
         */
        const fileDataUrl = URL.createObjectURL(selectedFileValue);

        const newDocument: Document = {
          id: documentId,
          title: documentName.trim(),
          document_name: documentName.trim(),
          category: documentCategoryByType(documentType),
          dateAdded: today,
          fileType: extension,
          isDemo: true,
          fileDataUrl,

          document_id: documentId,
          patient_id: patientId,
          document_type: documentType,
          hospital_id: hospitalId,
          upload_date: today,
          status: "Processing" as DocumentStatus,
          file_type: extension,
          file_size: formatFileSize(selectedFileValue.size),
          description: `Uploaded for ${patientId} at ${getHospitalName(hospitalId)}.`,
        };

        setUploadedDocuments((current) => [
          newDocument,
          ...current,
        ]);

        setUploadProgress(100);
        setUploadStage("complete");

        setMessage(
          "Document uploaded successfully. It was added to your Documents list.",
        );

        markDocumentUploaded(documentName.trim());

        clearFileSelection();
      };

      finishWith(selectedFile);
    }, 1700);
  };

  const heading = t("action.documents");

  return (
    <div className="container page">
      <header className="page__header page__header--split">
        <div>
          <h1>{heading}</h1>

          <p>{t("doc.subtitle")}</p>
        </div>

        <button
          type="button"
          className="btn btn--primary"
          aria-expanded={addOpen}
          onClick={() =>
            setAddOpen((open) => !open)
          }
        >
          {addOpen
            ? "Close"
            : t("doc.add")}
        </button>
      </header>

      {/* Upload panel */}
      {addOpen && (
        <div className="add-panel">
          <h2>{t("doc.addTitle")}</h2>



          {schemeUpload && (
            <p className="demo-note">
              This upload was opened from the Government
              Schemes section for your profile. "{schemeUpload.documentName}" is
              prefilled — upload or edit it, then return
              to the scheme.
            </p>
          )}

          {/* Document type */}
          <label
            htmlFor="document-type"
            style={{
              display: "block",
              marginTop: "16px",
              marginBottom: "6px",
            }}
          >
            <strong>Document type</strong>
          </label>

          <select
            id="document-type"
            value={documentType}
            onChange={(event) =>
              setDocumentType(event.target.value)
            }
            style={{
              width: "100%",
              maxWidth: "400px",
              padding: "10px",
              borderRadius: "8px",
              border: "1px solid #ccc",
            }}
          >
            {SYNTHETIC_DOCUMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>

          {/* Patient */}
          <label
            htmlFor="document-patient"
            style={{
              display: "block",
              marginTop: "16px",
              marginBottom: "6px",
            }}
          >
            <strong>Patient ID (synthetic)</strong>
          </label>

          <select
            id="document-patient"
            value={patientId}
            onChange={(event) =>
              setPatientId(event.target.value)
            }
            style={{
              width: "100%",
              maxWidth: "400px",
              padding: "10px",
              borderRadius: "8px",
              border: "1px solid #ccc",
            }}
          >
            {syntheticPatientIds.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>

          {/* Hospital */}
          <label
            htmlFor="document-hospital"
            style={{
              display: "block",
              marginTop: "16px",
              marginBottom: "6px",
            }}
          >
            <strong>Hospital (synthetic)</strong>
          </label>

          <select
            id="document-hospital"
            value={hospitalId}
            onChange={(event) =>
              setHospitalId(event.target.value)
            }
            style={{
              width: "100%",
              maxWidth: "400px",
              padding: "10px",
              borderRadius: "8px",
              border: "1px solid #ccc",
            }}
          >
            {syntheticHospitals.map((hospital) => (
              <option
                key={hospital.hospital_id}
                value={hospital.hospital_id}
              >
                {hospital.hospital_id} —{" "}
                {hospital.hospital_name}
              </option>
            ))}
          </select>

          {/* Document name */}
          <label
            htmlFor="document-name"
            style={{
              display: "block",
              marginTop: "16px",
              marginBottom: "6px",
            }}
          >
            <strong>Document name</strong>
          </label>

          <input
            id="document-name"
            type="text"
            placeholder="Example: Blood Test Report"
            value={documentName}
            onChange={(event) =>
              setDocumentName(event.target.value)
            }
            style={{
              width: "100%",
              maxWidth: "400px",
              padding: "10px",
              borderRadius: "8px",
              border: "1px solid #ccc",
            }}
          />

          {/* File selection */}
          <div
            className="add-panel__actions"
            style={{ marginTop: "18px" }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleFileChange}
            />
          </div>

          {selectedFile && (
            <p
              style={{
                marginTop: "10px",
                fontSize: "14px",
              }}
            >
              Selected file:{" "}
              <strong>
                {selectedFile.name}
              </strong>{" "}
              ({formatFileSize(selectedFile.size)})
            </p>
          )}

          {/* Progress */}
          {uploadStage !== "idle" && (
            <div
              style={{
                marginTop: "16px",
                maxWidth: "420px",
              }}
              role="progressbar"
              aria-valuenow={uploadProgress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Upload progress"
            >
              <p
                style={{
                  margin: "0 0 6px",
                  fontSize: "13px",
                  fontWeight: 600,
                }}
                role="status"
              >
                {uploadStage === "uploading" &&
                  "Uploading…"}
                {uploadStage === "verifying" &&
                  "Verifying file…"}
                {uploadStage === "complete" &&
                  "Complete"}
              </p>

              <div className="progress-track">
                <div
                  className="progress-bar"
                  style={{
                    width: `${uploadProgress}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Submit */}
          <div
            style={{
              display: "flex",
              gap: "10px",
              marginTop: "18px",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              className="btn btn--primary"
              onClick={handleSubmitDocument}
              disabled={uploadStage === "uploading" || uploadStage === "verifying"}
            >
              {uploadStage === "uploading" || uploadStage === "verifying"
                ? "Uploading…"
                : "Submit Document"}
            </button>

            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => fileInputRef.current?.click()}
            >
              {t("doc.upload")}
            </button>
          </div>

          {message && (
            <p
              role="status"
              style={{
                marginTop: "16px",
                padding: "10px",
                borderRadius: "8px",
                background: message.includes(
                  "successfully",
                )
                  ? "#dcfce7"
                  : "#fee2e2",
              }}
            >
              {message}
            </p>
          )}



          <p className="demo-note">
            {t("doc.scanNote")}
          </p>
        </div>
      )}

      {/* Category filters */}
      <div
        className="filters"
        role="group"
        aria-label="Filter documents by category"
      >
        {(["All", ...documentCategories] as const).map(
          (cat) => (
            <button
              key={cat}
              type="button"
              className={`chip chip--filter${
                category === cat
                  ? " chip--active"
                  : ""
              }`}
              aria-pressed={category === cat}
              onClick={() =>
                setCategory(
                  cat as DocumentCategory | "All",
                )
              }
            >
              {cat === "All"
                ? t("doc.all")
                : t(CATEGORY_KEYS[cat])}
            </button>
          ),
        )}
      </div>

      {/* Documents */}
      {documents.length === 0 ? (
        <EmptyState
          icon="📁"
          title={t("doc.noDocs")}
          description={t("doc.noDocsDesc")}
        />
      ) : (
        <div className="document-list">
          {documents.map((doc) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
            />
          ))}
        </div>
      )}
    </div>
  );
}