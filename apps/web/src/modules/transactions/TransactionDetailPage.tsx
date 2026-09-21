import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { isApiError } from "../../shared/api/client.ts";
import { useAuth } from "../../shared/auth/AuthContext.tsx";
import { hasPermission } from "../../shared/auth/permissions.ts";
import { formatDateTime, formatKg, StatusPill } from "../../shared/ui/StatusPill.tsx";
import {
  downloadDocumentFile,
  formatConfidence,
  formatFileSize,
  listDocumentTypes,
  listTransactionDocuments,
  ocrFieldLabel,
  processDocument,
  reviewDocument,
  uploadTransactionDocument,
  verifyDocument,
  type DocumentTypeOption,
  type PublicDocument,
} from "../documents/api.ts";
import { listMaterials, type PublicMaterial } from "../materials/api.ts";
import { lookupVehicle } from "../vehicles/api.ts";
import { LiveWeightPanel } from "../weighbridge/LiveWeightPanel.tsx";
import { simulateAnpr, simulateWeight, sourceLabel } from "../weighbridge/api.ts";
import { listUnloadingPoints, type PublicUnloadingPoint } from "../unloading/api.ts";
import { WorkflowStageStrip } from "./WorkflowStageStrip.tsx";
import {
  assignTransactionMaterial,
  assignUnloading,
  completeUnloading,
  finalizeTransaction,
  getTransaction,
  getTransactionTimeline,
  identifyTransaction,
  recordGrossWeighment,
  recordWeighmentFromDevice,
  requestTransactionCorrection,
  startUnloading,
  verifyTransactionMaterial,
  type PublicTransaction,
  type TimelineItem,
} from "./api.ts";

export function TransactionDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [transaction, setTransaction] = useState<PublicTransaction | null>(null);
  const [documents, setDocuments] = useState<PublicDocument[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentTypeOption[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [plate, setPlate] = useState("");
  const [weight, setWeight] = useState("");
  const [tareWeight, setTareWeight] = useState("");
  const [source, setSource] = useState<"MANUAL" | "SIMULATED">("MANUAL");
  const [tareSource, setTareSource] = useState<"MANUAL" | "SIMULATED">("MANUAL");
  const [unloadNotes, setUnloadNotes] = useState("");
  const [selectedPointId, setSelectedPointId] = useState("");
  const [points, setPoints] = useState<PublicUnloadingPoint[]>([]);
  const [correctionField, setCorrectionField] = useState("TARE_WEIGHT");
  const [correctionOriginal, setCorrectionOriginal] = useState("");
  const [correctionProposed, setCorrectionProposed] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [documentType, setDocumentType] = useState("INVOICE");
  const [file, setFile] = useState<File | null>(null);
  const [anprPlate, setAnprPlate] = useState("");
  const [fieldEdits, setFieldEdits] = useState<Record<string, string>>({});
  const [materials, setMaterials] = useState<PublicMaterial[]>([]);
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canWeigh = hasPermission(user, "weighment.record");
  const canUpload = hasPermission(user, "document.upload");
  const canVerify = hasPermission(user, "document.verify");
  const canAssignMaterial = hasPermission(user, "transaction.update", "transaction.create");
  const canOpenApprovals = hasPermission(user, "approval.decide");
  const canAssignUnload = hasPermission(user, "unloading.assign");
  const canManageUnload = hasPermission(user, "unloading.manage");
  const canFinalize = hasPermission(user, "transaction.finalize");
  const canCorrect = hasPermission(user, "transaction.correct");

  useEffect(() => {
    if (!id) {
      return;
    }

    void Promise.all([
      getTransaction(id),
      listTransactionDocuments(id),
      getTransactionTimeline(id),
    ])
      .then(([result, documentResult, timelineResult]) => {
        setTransaction(result.transaction);
        setTimeline(timelineResult.items);
        setDocuments(documentResult.documents);
        setSelectedDocumentId(documentResult.documents[0]?.id ?? null);
        setSelectedMaterialId(result.transaction.material?.id ?? result.transaction.suggestion?.material?.id ?? "");
        setError(null);
      })
      .catch((caught: unknown) => {
        setError(isApiError(caught) ? caught.message : "Unable to load transaction");
      });

    void listDocumentTypes()
      .then((typeResult) => {
        setDocumentTypes(typeResult.documentTypes);
        if (typeResult.documentTypes[0] && documentType === "") {
          setDocumentType(typeResult.documentTypes[0].code);
        }
      })
      .catch(() => undefined);

    void listMaterials(new URLSearchParams({ pageSize: "50" }))
      .then((materialResult) => setMaterials(materialResult.items))
      .catch(() => undefined);

    void listUnloadingPoints()
      .then((pointResult) => setPoints(pointResult.items))
      .catch(() => undefined);
  }, [id]);

  const selectedDocument = documents.find((document) => document.id === selectedDocumentId) ?? documents[0] ?? null;

  useEffect(() => {
    if (!selectedDocument?.ocr) {
      setFieldEdits({});
      return;
    }

    const next: Record<string, string> = {};
    for (const field of selectedDocument.ocr.fields) {
      next[field.name] = field.value;
    }
    setFieldEdits(next);
  }, [selectedDocument]);

  async function refreshTransaction(next?: PublicTransaction): Promise<void> {
    if (!id) {
      return;
    }

    const result = next ? { transaction: next } : await getTransaction(id);
    const documentResult = await listTransactionDocuments(id);
    const timelineResult = await getTransactionTimeline(id);
    setTransaction(result.transaction);
    setTimeline(timelineResult.items);
    setSelectedMaterialId(result.transaction.material?.id ?? result.transaction.suggestion?.material?.id ?? selectedMaterialId);
    setDocuments(documentResult.documents);
    setSelectedDocumentId((current) => {
      if (current && documentResult.documents.some((document) => document.id === current)) {
        return current;
      }
      return documentResult.documents[0]?.id ?? null;
    });
  }

  async function handleIdentify(): Promise<void> {
    if (!id) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const found = await lookupVehicle(plate);
      if (!found.vehicle) {
        setError("Vehicle was not found. Register it under Vehicles first.");
        return;
      }
      const result = await identifyTransaction(id, found.vehicle.id);
      await refreshTransaction(result.transaction);
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : "Unable to identify vehicle");
    } finally {
      setBusy(false);
    }
  }

  async function handleSimulateWeight(): Promise<void> {
    if (!transaction?.weighbridge) {
      setError("This transaction has no weighbridge");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const result = await simulateWeight(transaction.weighbridge.id);
      setWeight(String(result.reading.kg));
      setSource("SIMULATED");
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : "Simulated weight failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleCaptureLive(kind: "GROSS" | "TARE"): Promise<void> {
    if (!id) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await recordWeighmentFromDevice(id, kind);
      await refreshTransaction(result.transaction);
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : "Stable weight reading is not available.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCapture(): Promise<void> {
    if (!id) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const result = await recordGrossWeighment(id, { weightKg: weight, source, kind: "GROSS" });
      await refreshTransaction(result.transaction);
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : "Unable to record weighment");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload(): Promise<void> {
    if (!id || !file) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const result = await uploadTransactionDocument(id, file, documentType);
      setFile(null);
      setSelectedDocumentId(result.document.id);
      await refreshTransaction();
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : "Unable to upload document");
    } finally {
      setBusy(false);
    }
  }

  async function handleSimulateAnpr(): Promise<void> {
    if (!transaction?.weighbridge) {
      setError("This transaction has no weighbridge");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const result = await simulateAnpr(transaction.weighbridge.id);
      setAnprPlate(result.detection.plate);
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : "Simulated ANPR failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleProcess(forceVehicleMismatch = false): Promise<void> {
    if (!selectedDocument) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const result = await processDocument(selectedDocument.id, {
        ...(anprPlate === "" ? {} : { anprVehicleNumber: anprPlate }),
        forceVehicleMismatch,
      });
      setSelectedDocumentId(result.document.id);
      await refreshTransaction();
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : "Unable to process document");
    } finally {
      setBusy(false);
    }
  }

  async function handleReview(): Promise<void> {
    if (!selectedDocument) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await reviewDocument(selectedDocument.id, fieldEdits, anprPlate === "" ? undefined : anprPlate);
      await refreshTransaction();
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : "Unable to save document review");
    } finally {
      setBusy(false);
    }
  }

  async function handleAssignMaterial(source: "MANUAL" | "OCR"): Promise<void> {
    if (!id) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const result = await assignTransactionMaterial(
        id,
        source === "OCR" ? { source } : { source, materialId: selectedMaterialId },
      );
      await refreshTransaction(result.transaction);
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : "Unable to assign material");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyMaterial(): Promise<void> {
    if (!id) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const result = await verifyTransactionMaterial(
        id,
        selectedMaterialId === "" ? {} : { materialId: selectedMaterialId },
      );
      await refreshTransaction(result.transaction);
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : "Unable to verify material");
    } finally {
      setBusy(false);
    }
  }

  async function handleAssignUnloading(): Promise<void> {
    if (!id) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await assignUnloading(id, selectedPointId === "" ? undefined : selectedPointId);
      await refreshTransaction(result.transaction);
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : "Unable to assign unloading point");
    } finally {
      setBusy(false);
    }
  }

  async function handleStartUnloading(): Promise<void> {
    if (!id) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await startUnloading(id);
      await refreshTransaction(result.transaction);
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : "Unable to start unloading");
    } finally {
      setBusy(false);
    }
  }

  async function handleCompleteUnloading(): Promise<void> {
    if (!id) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await completeUnloading(id, unloadNotes === "" ? undefined : unloadNotes);
      await refreshTransaction(result.transaction);
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : "Unable to complete unloading");
    } finally {
      setBusy(false);
    }
  }

  async function handleSimulateTare(): Promise<void> {
    if (!transaction?.weighbridge) {
      setError("This transaction has no weighbridge");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await simulateWeight(transaction.weighbridge.id);
      setTareWeight(String(result.reading.kg));
      setTareSource("SIMULATED");
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : "Simulated weight failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleSecondWeighment(): Promise<void> {
    if (!id) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await recordGrossWeighment(id, { weightKg: tareWeight, source: tareSource, kind: "TARE" });
      await refreshTransaction(result.transaction);
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : "Unable to record second weighment");
    } finally {
      setBusy(false);
    }
  }

  async function handleFinalize(): Promise<void> {
    if (!id) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await finalizeTransaction(id);
      await refreshTransaction(result.transaction);
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : "Unable to finalize transaction");
    } finally {
      setBusy(false);
    }
  }

  async function handleCorrection(): Promise<void> {
    if (!id) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await requestTransactionCorrection(id, {
        field: correctionField,
        originalValue: correctionOriginal,
        proposedValue: correctionProposed,
        reason: correctionReason,
      });
      await refreshTransaction();
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : "Unable to request correction");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerification(decision: "VERIFIED" | "REJECTED"): Promise<void> {
    if (!selectedDocument) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await verifyDocument(selectedDocument.id, decision);
      await refreshTransaction();
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : "Unable to update document verification");
    } finally {
      setBusy(false);
    }
  }

  if (!transaction) {
    return (
      <main className="page-shell">
        <p className={error ? "form-error" : "session-status"}>{error ?? "Loading transaction…"}</p>
      </main>
    );
  }

  const gross = transaction.weighments.find((weighment) => weighment.kind === "GROSS");

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="login-kicker">Trinetra transaction</p>
          <h1>{transaction.referenceNumber}</h1>
        </div>
        <div>
          {transaction.operationMode && transaction.operationMode !== "PRODUCTION" ? (
            <StatusPill value={transaction.operationMode} />
          ) : null}
          <StatusPill value={transaction.status} />
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <section className="card-grid">
        <article className="identity-card">
          <p>
            <span>Vehicle</span>
            {transaction.vehicle?.displayRegistrationNumber ?? "Not identified"}
          </p>
          <p>
            <span>Site</span>
            {transaction.site.name}
          </p>
          <p>
            <span>Weighbridge</span>
            {transaction.weighbridge?.code ?? "—"}
          </p>
          <p>
            <span>Operator</span>
            {transaction.operator.fullName}
          </p>
          <p>
            <span>Arrival</span>
            {formatDateTime(transaction.arrivedAt)}
          </p>
        </article>
        <article className="identity-card">
          <p>
            <span>Gross weight</span>
            {formatKg(transaction.grossWeightKg)}
          </p>
          <p>
            <span>Tare weight</span>
            {formatKg(transaction.tareWeightKg)}
          </p>
          <p>
            <span>Net weight</span>
            {formatKg(transaction.netWeightKg)}
          </p>
          {gross ? (
            <p>
              <span>Recorded</span>
              {formatDateTime(gross.recordedAt)} · {sourceLabel(gross.source)}
            </p>
          ) : (
            <p className="login-note">First weighment has not been captured.</p>
          )}
          <p>
            <span>Document</span>
            {transaction.documentStatus ?? "Not uploaded"}
          </p>
          <p>
            <span>Material</span>
            {transaction.material?.name ?? "Not identified"}
          </p>
          <p>
            <span>Workflow</span>
            {transaction.workflow?.code ?? "Not applied"}
          </p>
          <p>
            <span>Supplier</span>
            {transaction.supplier?.name ?? transaction.vehicle?.transporterName ?? "—"}
          </p>
        </article>
        <article className="identity-card next-action-card">
          <p>
            <span>Next action</span>
            {transaction.nextAction.label}
          </p>
          <p>
            <span>Required approval</span>
            {transaction.approval.required
              ? transaction.approval.departments.map((department) => department.name).join(" / ")
              : "None"}
          </p>
          <p className="login-note">{transaction.approval.reason}</p>
          {canOpenApprovals && transaction.pendingApproval ? (
            <p>
              <Link to={`/approvals/${transaction.pendingApproval.id}`}>
                Open {transaction.pendingApproval.department.name} approval
              </Link>
            </p>
          ) : null}
        </article>
      </section>

      {transaction.allowedActions.includes("identify") ? (
        <section className="panel-form">
          <h2>Identify vehicle</h2>
          <label htmlFor="identifyPlate">Vehicle number</label>
          <input id="identifyPlate" value={plate} onChange={(event) => setPlate(event.target.value)} />
          <button type="button" onClick={() => void handleIdentify()} disabled={busy || plate === ""}>
            Confirm vehicle
          </button>
        </section>
      ) : null}

      {canUpload && transaction.allowedActions.includes("upload_document") ? (
        <section className="panel-form">
          <h2>Upload document</h2>
          <p className="login-note">PDF or image only. Files stay private and are not published as public URLs.</p>
          <label htmlFor="documentType">Document type</label>
          <select id="documentType" value={documentType} onChange={(event) => setDocumentType(event.target.value)}>
            {documentTypes.map((type) => (
              <option key={type.code} value={type.code}>
                {type.label}
              </option>
            ))}
          </select>
          <label htmlFor="documentFile">File</label>
          <input
            id="documentFile"
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <button type="button" onClick={() => void handleUpload()} disabled={busy || file === null}>
            Upload document
          </button>
        </section>
      ) : null}

      {documents.length > 0 ? (
        <section className="panel-form document-review">
          <h2>Document review</h2>
          <label htmlFor="selectedDocument">Uploaded document</label>
          <select
            id="selectedDocument"
            value={selectedDocument?.id ?? ""}
            onChange={(event) => setSelectedDocumentId(event.target.value)}
          >
            {documents.map((document) => (
              <option key={document.id} value={document.id}>
                {document.documentTypeLabel} · {document.originalFileName}
              </option>
            ))}
          </select>

          {selectedDocument ? (
            <>
              <div className="card-grid">
                <article className="identity-card">
                  <p>
                    <span>Type</span>
                    {selectedDocument.documentTypeLabel}
                  </p>
                  <p>
                    <span>File</span>
                    {selectedDocument.originalFileName} · {formatFileSize(selectedDocument.fileSize)}
                  </p>
                  <p>
                    <span>Status</span>
                    <StatusPill value={selectedDocument.status} />
                  </p>
                  <p>
                    <span>OCR</span>
                    {selectedDocument.simulatedOcr ? "Simulated OCR" : selectedDocument.ocrStatus}
                  </p>
                  <p>
                    <span>Uploaded by</span>
                    {selectedDocument.uploadedBy.fullName}
                  </p>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() =>
                      void downloadDocumentFile(selectedDocument.id, selectedDocument.originalFileName).catch(
                        (caught: unknown) => {
                          setError(isApiError(caught) ? caught.message : "Unable to download document");
                        },
                      )
                    }
                    disabled={busy}
                  >
                    Download file
                  </button>
                </article>
                <article className="identity-card">
                  <p>
                    <span>Vehicle comparison</span>
                    {selectedDocument.vehicleComparison ? (
                      <StatusPill value={selectedDocument.vehicleComparison.result} />
                    ) : (
                      "Not compared yet"
                    )}
                  </p>
                  <p>
                    <span>ANPR</span>
                    {selectedDocument.vehicleComparison?.anprVehicleNumber ?? (anprPlate || "Not captured")}
                  </p>
                  <p>
                    <span>OCR vehicle</span>
                    {selectedDocument.vehicleComparison?.ocrVehicleNumber ?? "—"}
                  </p>
                  <p>
                    <span>Registered</span>
                    {selectedDocument.vehicleComparison?.registeredVehicleNumber ??
                      transaction.vehicle?.registrationNumber ??
                      "—"}
                  </p>
                  <p className="login-note">
                    A mismatch is not treated as fraud. ANPR and OCR can be wrong. An authorized user must review it.
                  </p>
                </article>
              </div>

              <label htmlFor="anprPlate">ANPR vehicle number (optional, simulated)</label>
              <input
                id="anprPlate"
                value={anprPlate}
                onChange={(event) => setAnprPlate(event.target.value)}
                placeholder="Use simulated ANPR or type a plate"
              />
              <div className="button-row">
                <button type="button" className="ghost-button" onClick={() => void handleSimulateAnpr()} disabled={busy}>
                  Simulate ANPR
                </button>
                {canUpload && selectedDocument.allowedActions.includes("process") ? (
                  <>
                    <button type="button" onClick={() => void handleProcess(false)} disabled={busy}>
                      Run simulated OCR
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => void handleProcess(true)}
                      disabled={busy}
                    >
                      Simulate mismatch
                    </button>
                  </>
                ) : null}
              </div>

              {selectedDocument.ocr ? (
                <>
                  <p className="login-note">
                    These values came from simulated OCR ({selectedDocument.ocr.provider}). This is not a real scan.
                  </p>
                  {selectedDocument.ocr.fields.map((field) => (
                    <label key={field.name} htmlFor={`ocr-${field.name}`}>
                      {ocrFieldLabel(field.name)}
                      <span className={field.lowConfidence ? "confidence-low" : "confidence"}>
                        Confidence {formatConfidence(field.confidence)}
                        {field.corrected ? " · corrected" : ""}
                      </span>
                      <input
                        id={`ocr-${field.name}`}
                        value={fieldEdits[field.name] ?? field.value}
                        onChange={(event) =>
                          setFieldEdits((current) => ({ ...current, [field.name]: event.target.value }))
                        }
                        disabled={!canVerify || !selectedDocument.allowedActions.includes("review")}
                      />
                    </label>
                  ))}
                  {canVerify && selectedDocument.allowedActions.includes("review") ? (
                    <div className="button-row">
                      <button type="button" className="ghost-button" onClick={() => void handleReview()} disabled={busy}>
                        Save corrections
                      </button>
                      <button type="button" onClick={() => void handleVerification("VERIFIED")} disabled={busy}>
                        Verify document
                      </button>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => void handleVerification("REJECTED")}
                        disabled={busy}
                      >
                        Reject document
                      </button>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="login-note">Run simulated OCR to extract invoice, vehicle, supplier, and material fields.</p>
              )}
            </>
          ) : null}
        </section>
      ) : null}

      {transaction.status !== "ARRIVED" ? (
        <section className="panel-form">
          <h2>Material and workflow</h2>
          <p>
            <span>Material</span>
            {transaction.material ? `${transaction.material.name} (${transaction.material.code})` : "Not assigned"}
          </p>
          <p>
            <span>Workflow</span>
            {transaction.workflow ? `${transaction.workflow.code} — ${transaction.workflow.name}` : "Not applied"}
          </p>
          {transaction.suggestion?.ocrMaterialName ? (
            <p className="login-note">
              Simulated OCR suggested {transaction.suggestion.ocrMaterialName}
              {transaction.suggestion.ocrConfidence !== null
                ? ` (${Math.round(transaction.suggestion.ocrConfidence * 100)}% confidence)`
                : ""}
              . {transaction.suggestion.reason}
            </p>
          ) : null}
          {transaction.workflow ? (
            <ul className="step-list">
              {transaction.workflow.steps.map((step) => (
                <li key={`${step.sortOrder}-${step.capability}`}>
                  <strong>{step.name}</strong>
                  <span>
                    {step.isRequired ? "Required" : "Optional"}
                    {step.approvalDepartment ? ` · ${step.approvalDepartment.name}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {canAssignMaterial && transaction.allowedActions.includes("assign_material") ? (
            <>
              <label htmlFor="assignedMaterial">Select material</label>
              <select
                id="assignedMaterial"
                value={selectedMaterialId}
                onChange={(event) => setSelectedMaterialId(event.target.value)}
              >
                <option value="">Choose material</option>
                {materials.map((material) => (
                  <option key={material.id} value={material.id}>
                    {material.name} ({material.code})
                    {material.defaultWorkflow ? ` · ${material.defaultWorkflow.workflow.code}` : ""}
                  </option>
                ))}
              </select>
              <div className="button-row">
                <button
                  type="button"
                  onClick={() => void handleAssignMaterial("MANUAL")}
                  disabled={busy || selectedMaterialId === ""}
                >
                  Apply material workflow
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => void handleAssignMaterial("OCR")}
                  disabled={busy}
                >
                  Apply from simulated OCR
                </button>
              </div>
            </>
          ) : null}
          {canAssignMaterial && transaction.allowedActions.includes("verify_material") ? (
            <div className="button-row">
              <button type="button" onClick={() => void handleVerifyMaterial()} disabled={busy}>
                Confirm material and workflow
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {canWeigh && transaction.allowedActions.includes("record_gross") ? (
        <section className="panel-form">
          <h2>First weighment</h2>
          <LiveWeightPanel weighbridgeId={transaction.weighbridge?.id} />
          <button type="button" className="approve-button" onClick={() => void handleCaptureLive("GROSS")} disabled={busy}>
            Capture live weight
          </button>
          <p className="login-note">SIMULATED / MANUAL entry below is not a hardware reading. Official live capture uses the panel above.</p>
          <label htmlFor="weight">SIMULATED / MANUAL weight (KG)</label>
          <input id="weight" value={weight} onChange={(event) => setWeight(event.target.value)} />
          <div className="button-row">
            <button type="button" className="ghost-button" onClick={() => void handleSimulateWeight()} disabled={busy}>
              Simulate weighbridge
            </button>
            <button type="button" onClick={() => void handleCapture()} disabled={busy || weight === ""}>
              Capture {source === "SIMULATED" ? "simulated" : "manual"} weight
            </button>
          </div>
        </section>
      ) : null}

      {transaction.instruction ? (
        <article className="unloading-instruction" aria-live="polite">
          <p className="login-kicker">Driver / operator instruction</p>
          <p>
            <span>Vehicle</span>
            {transaction.instruction.vehicle}
          </p>
          <p>
            <span>Material</span>
            {transaction.instruction.material}
          </p>
          <p>
            <span>Transaction</span>
            {transaction.instruction.referenceNumber}
          </p>
          <p className="instruction-point">
            <span>Proceed to</span>
            {transaction.instruction.pointName}
          </p>
          <p>
            <span>Status</span>
            {transaction.instruction.displayStatus}
          </p>
        </article>
      ) : null}

      {canAssignUnload && transaction.allowedActions.includes("assign_unloading") ? (
        <section className="panel-form">
          <h2>Assign unloading point</h2>
          <p className="login-note">Assignment uses configured site/material rules. Leave the list on Auto to use those rules.</p>
          <label htmlFor="unloadPoint">Unloading point</label>
          <select id="unloadPoint" value={selectedPointId} onChange={(event) => setSelectedPointId(event.target.value)}>
            <option value="">Auto-assign from rules</option>
            {points
              .filter((point) => point.site.id === transaction.site.id && point.isActive)
              .map((point) => (
                <option key={point.id} value={point.id}>
                  {point.code} · {point.name}
                </option>
              ))}
          </select>
          <button type="button" className="approve-button" onClick={() => void handleAssignUnloading()} disabled={busy}>
            Assign unloading point
          </button>
        </section>
      ) : null}

      {canManageUnload && transaction.allowedActions.includes("start_unloading") ? (
        <section className="panel-form">
          <h2>Start unloading</h2>
          <button type="button" className="approve-button" onClick={() => void handleStartUnloading()} disabled={busy}>
            Start unloading
          </button>
        </section>
      ) : null}

      {canManageUnload && transaction.allowedActions.includes("complete_unloading") ? (
        <section className="panel-form">
          <h2>Complete unloading</h2>
          <label htmlFor="unloadNotes">Notes (optional)</label>
          <textarea id="unloadNotes" value={unloadNotes} onChange={(event) => setUnloadNotes(event.target.value)} />
          <button type="button" className="approve-button" onClick={() => void handleCompleteUnloading()} disabled={busy}>
            Mark as unloaded
          </button>
        </section>
      ) : null}

      {canWeigh && transaction.allowedActions.includes("record_tare") ? (
        <section className="panel-form">
          <h2>Second weighment (tare)</h2>
          <LiveWeightPanel weighbridgeId={transaction.weighbridge?.id} />
          <button type="button" className="approve-button" onClick={() => void handleCaptureLive("TARE")} disabled={busy}>
            Capture live tare weight
          </button>
          <p className="login-note">SIMULATED / MANUAL tare below is stored separately from live hardware. The server calculates net weight.</p>
          <label htmlFor="tareWeight">SIMULATED / MANUAL tare weight (KG)</label>
          <input id="tareWeight" value={tareWeight} onChange={(event) => setTareWeight(event.target.value)} />
          <div className="button-row">
            <button type="button" className="ghost-button" onClick={() => void handleSimulateTare()} disabled={busy}>
              Simulate weighbridge
            </button>
            <button type="button" onClick={() => void handleSecondWeighment()} disabled={busy || tareWeight === ""}>
              Capture {tareSource === "SIMULATED" ? "simulated" : "manual"} tare
            </button>
          </div>
        </section>
      ) : null}

      {canFinalize && transaction.allowedActions.includes("finalize") ? (
        <section className="panel-form">
          <h2>Finalize transaction</h2>
          <p>
            Gross {formatKg(transaction.grossWeightKg)} · Tare {formatKg(transaction.tareWeightKg)} · Net{" "}
            {formatKg(transaction.netWeightKg)}
          </p>
          <button type="button" className="approve-button" onClick={() => void handleFinalize()} disabled={busy}>
            Complete transaction
          </button>
        </section>
      ) : null}

      {transaction.status === "COMPLETED" ? (
        <article className="unloading-instruction completed-summary">
          <p className="login-kicker">Trinetra transaction</p>
          <p>
            <span>Transaction</span>
            {transaction.referenceNumber}
          </p>
          <p>
            <span>Vehicle</span>
            {transaction.vehicle?.displayRegistrationNumber ?? "—"}
          </p>
          <p>
            <span>Material</span>
            {transaction.material?.name ?? "—"}
          </p>
          <p>
            <span>Gross weight</span>
            {formatKg(transaction.grossWeightKg)}
          </p>
          <p>
            <span>Tare weight</span>
            {formatKg(transaction.tareWeightKg)}
          </p>
          <p>
            <span>Net weight</span>
            {formatKg(transaction.netWeightKg)}
          </p>
          <p>
            <span>Unloading point</span>
            {transaction.unloading?.point?.name ?? "—"}
          </p>
          <p>
            <span>Status</span>
            COMPLETED
          </p>
          <p>
            <span>Completed</span>
            {transaction.completedAt ? formatDateTime(transaction.completedAt) : "—"}
          </p>
        </article>
      ) : null}

      {transaction.exceptionReason ? <p className="form-error">{transaction.exceptionReason}</p> : null}

      {canCorrect && transaction.status === "COMPLETED" ? (
        <section className="panel-form">
          <h2>Request correction</h2>
          <p className="login-note">Completed values are not edited here. This only records a review request.</p>
          <label htmlFor="correctionField">Field</label>
          <select id="correctionField" value={correctionField} onChange={(event) => setCorrectionField(event.target.value)}>
            <option value="GROSS_WEIGHT">Gross weight</option>
            <option value="TARE_WEIGHT">Tare weight</option>
            <option value="NET_WEIGHT">Net weight</option>
            <option value="UNLOADING_POINT">Unloading point</option>
          </select>
          <label htmlFor="correctionOriginal">Original value</label>
          <input id="correctionOriginal" value={correctionOriginal} onChange={(event) => setCorrectionOriginal(event.target.value)} />
          <label htmlFor="correctionProposed">Corrected value</label>
          <input id="correctionProposed" value={correctionProposed} onChange={(event) => setCorrectionProposed(event.target.value)} />
          <label htmlFor="correctionReason">Reason</label>
          <textarea id="correctionReason" value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} />
          <button
            type="button"
            className="ghost-button"
            onClick={() => void handleCorrection()}
            disabled={busy || correctionOriginal === "" || correctionProposed === "" || correctionReason.length < 8}
          >
            Request correction
          </button>
        </section>
      ) : null}

      <WorkflowStageStrip transaction={transaction} />

      <section className="identity-card">
        <h2>Timeline</h2>
        <ol className="timeline">
          {(timeline.length > 0 ? timeline : transaction.timeline).map((item) => (
            <li key={`${item.status}-${item.at}-${item.label}`}>
              <strong>{item.label}</strong>
              <span>{formatDateTime(item.at)}</span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
