import type { PublicTransaction } from "./api.ts";

const STAGES = [
  { key: "arrival", label: "Vehicle arrival" },
  { key: "identify", label: "Identification" },
  { key: "documents", label: "Document processing" },
  { key: "material", label: "Material verification" },
  { key: "approval", label: "Approval" },
  { key: "assign", label: "Unloading assignment" },
  { key: "unload", label: "Unloading" },
  { key: "tare", label: "Second weighment" },
  { key: "net", label: "Net weight" },
  { key: "complete", label: "Completion" },
] as const;

export function WorkflowStageStrip({ transaction }: { transaction: PublicTransaction }) {
  const completed = completedStages(transaction);

  return (
    <section className="identity-card workflow-strip">
      <h2>Workflow path</h2>
      <p className="login-note">Derived from stored transaction state and events. Missing stages are not invented.</p>
      <ol>
        {STAGES.map((stage) => {
          const done = completed.has(stage.key);
          return (
            <li key={stage.key} className={done ? "stage-done" : "stage-pending"}>
              <strong>{stage.label}</strong>
              <span>{done ? "Recorded" : "Not reached"}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function completedStages(transaction: PublicTransaction): Set<string> {
  const done = new Set<string>(["arrival"]);
  if (transaction.vehicle) done.add("identify");
  if (transaction.documents.length > 0 || transaction.documentStatus) done.add("documents");
  if (transaction.material && (transaction.materialIdentification?.verified || transaction.workflow)) {
    done.add("material");
  }
  if (transaction.approvals.some((item) => item.decision === "APPROVED") || transaction.status === "APPROVED" || transaction.status === "COMPLETED") {
    done.add("approval");
  }
  if (transaction.unloading?.point) done.add("assign");
  if (transaction.unloading?.status === "COMPLETED" || transaction.status === "UNLOADED" || transaction.status === "COMPLETED") {
    done.add("unload");
  }
  if (transaction.tareWeightKg) done.add("tare");
  if (transaction.netWeightKg) done.add("net");
  if (transaction.status === "COMPLETED" && transaction.completedAt) done.add("complete");
  return done;
}
