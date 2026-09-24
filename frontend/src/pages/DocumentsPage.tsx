import { useRef, useState } from "react";
import {
  documentCategories,
  sampleDocuments,
} from "../data/documents";
import { useLanguage } from "../context/LanguageContext";
import DocumentCard from "../components/DocumentCard";
import EmptyState from "../components/EmptyState";
import { supabase } from "../lib/supabase";
import type { Document, DocumentCategory } from "../types/domain";
import type { TranslationKey } from "../data/translations";

const CATEGORY_KEYS: Record<DocumentCategory, TranslationKey> = {
  "Identity Documents": "doc.identity",
  "Healthcare Documents": "doc.healthcare",
  "Scheme Documents": "doc.scheme",
  Reports: "doc.reports",
  Prescriptions: "doc.prescriptions",
};

export default function DocumentsPage() {
  const { t } = useLanguage();

  const [category, setCategory] =
    useState<DocumentCategory | "All">("All");

  const [addOpen, setAddOpen] = useState(false);

  const [uploadedDocuments, setUploadedDocuments] =
    useState<Document[]>([]);

  const [documentName, setDocumentName] = useState("");

  const [documentCategory, setDocumentCategory] =
    useState<DocumentCategory>("Healthcare Documents");

  const [selectedFile, setSelectedFile] =
    useState<File | null>(null);

  const [message, setMessage] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  const allDocuments = [
    ...sampleDocuments,
    ...uploadedDocuments,
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

    // If the user hasn't entered a name,
    // use the filename automatically.
    if (!documentName.trim()) {
      const fileNameWithoutExtension =
        file.name.replace(/\.[^/.]+$/, "");

      setDocumentName(fileNameWithoutExtension);
    }

    setMessage("");
  };

  const handleSubmitDocument = async () => {
  if (!selectedFile) {
    setMessage("Please select a document first.");
    return;
  }

  if (!documentName.trim()) {
    setMessage("Please enter a document name.");
    return;
  }

  try {
    setMessage("Uploading document...");

    const fileExtension =
      selectedFile.name.split(".").pop() || "file";

    const safeName = documentName
      .trim()
      .replace(/[^a-zA-Z0-9-_]/g, "_");

    const filePath = `${Date.now()}-${safeName}.${fileExtension}`;

    // Upload file to Supabase Storage
    const { error: uploadError } =
      await supabase.storage
        .from("documents")
        .upload(filePath, selectedFile);

    if (uploadError) {
      throw uploadError;
    }

    // Get public URL
    const { data: publicUrlData } =
      supabase.storage
        .from("documents")
        .getPublicUrl(filePath);

    const extension =
      selectedFile.name
        .split(".")
        .pop()
        ?.toUpperCase() || "FILE";

    const newDocument: Document = {
      id: `uploaded-${Date.now()}`,
      title: documentName.trim(),
      category: documentCategory,
      dateAdded: new Date()
        .toISOString()
        .split("T")[0],
      fileType: extension,
      isDemo: false,
    };

    setUploadedDocuments((current) => [
      ...current,
      newDocument,
    ]);

    console.log(
      "Uploaded document URL:",
      publicUrlData.publicUrl,
    );

    setDocumentName("");
    setSelectedFile(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    setMessage(
      "Document uploaded successfully.",
    );
  } catch (error) {
    console.error("Document upload failed:", error);

    setMessage(
      error instanceof Error
        ? `Upload failed: ${error.message}`
        : "Document upload failed.",
    );
  }
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

          <p className="demo-note">
            Upload a document to add it to your
            personal document portal.
          </p>

          {/* Document category */}
          <label
            htmlFor="document-category"
            style={{
              display: "block",
              marginTop: "16px",
              marginBottom: "6px",
            }}
          >
            <strong>Document category</strong>
          </label>

          <select
            id="document-category"
            value={documentCategory}
            onChange={(event) =>
              setDocumentCategory(
                event.target.value as DocumentCategory,
              )
            }
            style={{
              width: "100%",
              maxWidth: "400px",
              padding: "10px",
              borderRadius: "8px",
              border: "1px solid #ccc",
            }}
          >
            {documentCategories.map((cat) => (
              <option
                key={cat}
                value={cat}
              >
                {t(CATEGORY_KEYS[cat])}
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
              </strong>
            </p>
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
            >
              Submit Document
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