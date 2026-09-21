import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { isApiError } from "../../shared/api/client.ts";
import { formatDateTime, formatKg, StatusPill } from "../../shared/ui/StatusPill.tsx";
import { getTransactionTimeline, type TimelineItem } from "../transactions/api.ts";
import { approveApproval, getApproval, rejectApproval, type PublicApproval } from "./api.ts";

export function ApprovalDetailPage() {
  const { id } = useParams();
  const [approval, setApproval] = useState<PublicApproval | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [comment, setComment] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) {
      return;
    }

    void getApproval(id)
      .then(async (result) => {
        setApproval(result.approval);
        const history = await getTransactionTimeline(result.approval.transaction.id);
        setTimeline(history.items);
      })
      .catch((caught: unknown) => {
        setError(isApiError(caught) ? caught.message : "Unable to load approval");
      });
  }, [id]);

  async function handleApprove(): Promise<void> {
    if (!id) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await approveApproval(id, comment.trim() === "" ? undefined : comment.trim());
      setApproval(result.approval);
      const history = await getTransactionTimeline(result.approval.transaction.id);
      setTimeline(history.items);
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : "Unable to approve request");
    } finally {
      setBusy(false);
    }
  }

  async function handleReject(): Promise<void> {
    if (!id) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await rejectApproval(id, rejectReason.trim());
      setApproval(result.approval);
      setRejectOpen(false);
      const history = await getTransactionTimeline(result.approval.transaction.id);
      setTimeline(history.items);
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : "Unable to reject request");
    } finally {
      setBusy(false);
    }
  }

  if (!approval) {
    return (
      <main className="page-shell">
        <p className={error ? "form-error" : "session-status"}>{error ?? "Loading approval…"}</p>
      </main>
    );
  }

  const invoice = approval.transaction.documents.find((document) => document.invoiceNumber);

  return (
    <main className="page-shell approval-detail">
      <header className="page-header">
        <div>
          <p className="login-kicker">{approval.department.name} approval</p>
          <h1>{approval.transaction.referenceNumber}</h1>
        </div>
        <StatusPill value={approval.status} />
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <section className="card-grid">
        <article className="identity-card">
          <p>
            <span>Vehicle</span>
            {approval.transaction.vehicleNumber ?? "—"}
          </p>
          <p>
            <span>Material</span>
            {approval.transaction.material?.name ?? "—"}
          </p>
          <p>
            <span>Supplier</span>
            {approval.transaction.supplier?.name ?? invoice?.supplierName ?? "—"}
          </p>
          <p>
            <span>Gross weight</span>
            {formatKg(approval.transaction.grossWeightKg)}
          </p>
        </article>
        <article className="identity-card">
          <p>
            <span>Workflow</span>
            {approval.transaction.workflowCode ?? "—"}
          </p>
          <p>
            <span>Step</span>
            {approval.stepName}
          </p>
          <p>
            <span>Document</span>
            {invoice
              ? `${invoice.documentTypeLabel} ${invoice.invoiceNumber}`
              : approval.transaction.documents[0]?.originalFileName ?? "None on file"}
          </p>
          <p>
            <span>Site</span>
            {approval.site.name}
          </p>
        </article>
      </section>

      <section className="identity-card">
        <h2>Evidence already on this transaction</h2>
        <p className="login-note">This screen shows stored records only. Live camera capture is not part of this step.</p>
        <ul className="step-list">
          {approval.transaction.documents.map((document) => (
            <li key={document.id}>
              <strong>
                {document.documentTypeLabel}
                {document.invoiceNumber ? ` ${document.invoiceNumber}` : ""}
              </strong>
              <span>
                {document.status}
                {document.materialName ? ` · ${document.materialName}` : ""}
              </span>
            </li>
          ))}
        </ul>
        <p>
          <Link to={`/transactions/${approval.transaction.id}`}>Open full transaction</Link>
        </p>
      </section>

      {approval.status === "PENDING" && approval.canDecide ? (
        <section className="panel-form decision-panel">
          <h2>Decision</h2>
          <label htmlFor="approvalComment">Approval comment (optional)</label>
          <textarea
            id="approvalComment"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Material quantity verified."
          />
          <div className="decision-actions">
            <button type="button" className="approve-button" onClick={() => void handleApprove()} disabled={busy}>
              Approve
            </button>
            <button type="button" className="reject-button" onClick={() => setRejectOpen(true)} disabled={busy}>
              Reject
            </button>
          </div>
        </section>
      ) : (
        <section className="identity-card">
          <p>
            <span>Decision</span>
            {approval.status}
          </p>
          <p>
            <span>Decided by</span>
            {approval.decidedBy?.fullName ?? "—"}
          </p>
          <p>
            <span>Comments</span>
            {approval.comments ?? "—"}
          </p>
        </section>
      )}

      {rejectOpen ? (
        <section className="panel-form reject-dialog" role="dialog" aria-labelledby="rejectTitle">
          <h2 id="rejectTitle">Reject this request</h2>
          <p className="login-note">A reason is required. The transaction will not continue.</p>
          <label htmlFor="rejectReason">Rejection reason</label>
          <textarea
            id="rejectReason"
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
            placeholder="Vehicle does not match delivery document."
          />
          <div className="decision-actions">
            <button
              type="button"
              className="reject-button"
              onClick={() => void handleReject()}
              disabled={busy || rejectReason.trim().length < 3}
            >
              Confirm rejection
            </button>
            <button type="button" className="ghost-button" onClick={() => setRejectOpen(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        </section>
      ) : null}

      <section className="identity-card">
        <h2>Timeline</h2>
        <ol className="timeline">
          {timeline.map((item) => (
            <li key={`${item.source}-${item.status}-${item.at}-${item.label}`}>
              <strong>{item.label}</strong>
              <span>{formatDateTime(item.at)}</span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
