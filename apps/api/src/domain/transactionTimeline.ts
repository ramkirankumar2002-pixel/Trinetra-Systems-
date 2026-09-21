export type TimelineItem = {
  label: string;
  at: string;
  status: string;
  source: "entity" | "audit";
};

const AUDIT_LABELS: Record<string, string> = {
  TRANSACTION_CREATED: "Vehicle arrived",
  VEHICLE_IDENTIFIED: "Vehicle identified",
  DOCUMENT_UPLOADED: "Document uploaded",
  OCR_COMPLETED: "OCR completed",
  DOCUMENT_VERIFIED: "Document verified",
  DOCUMENT_REJECTED: "Document rejected",
  MATERIAL_ASSIGNED: "Material identified",
  MATERIAL_VERIFIED: "Material verified",
  WORKFLOW_STARTED: "Workflow started",
  FIRST_WEIGHMENT_RECORDED: "First weighment recorded",
  APPROVAL_CREATED: "Approval requested",
  APPROVAL_APPROVED: "Approval approved",
  APPROVAL_REJECTED: "Approval rejected",
  WORKFLOW_STEP_COMPLETED: "Workflow step completed",
  WORKFLOW_STEP_REJECTED: "Workflow step rejected",
  UNLOADING_POINT_ASSIGNED: "Unloading point assigned",
  UNLOADING_STARTED: "Unloading started",
  UNLOADING_COMPLETED: "Unloading completed",
  SECOND_WEIGHMENT_RECORDED: "Second weighment recorded",
  NET_WEIGHT_CALCULATED: "Net weight calculated",
  TRANSACTION_COMPLETED: "Transaction completed",
  TRANSACTION_EXCEPTION: "Transaction exception recorded",
  TRANSACTION_CORRECTION_REQUESTED: "Correction requested",
  TRANSACTION_CORRECTED: "Transaction corrected",
  NOTIFICATION_CREATED: "Notification created",
  NOTIFICATION_READ: "Notification read",
  NOTIFICATION_UNREAD: "Notification marked unread",
  NOTIFICATION_READ_ALL: "Notifications marked read",
  ALERT_CREATED: "Operational alert created",
  ALERT_ACKNOWLEDGED: "Operational alert acknowledged",
  ALERT_RESOLVED: "Operational alert resolved",
};

export function labelForAuditAction(action: string, metadata: Record<string, unknown> | null): string {
  if (action === "WORKFLOW_STARTED" && typeof metadata?.workflowCode === "string") {
    return `${metadata.workflowCode} workflow started`;
  }
  if (action === "MATERIAL_ASSIGNED" && typeof metadata?.materialCode === "string") {
    return `Material identified: ${metadata.materialCode}`;
  }
  if (action === "APPROVAL_CREATED" && typeof metadata?.departmentName === "string") {
    return `${metadata.departmentName} approval requested`;
  }
  if (action === "APPROVAL_APPROVED" && typeof metadata?.departmentName === "string") {
    return `${metadata.departmentName} approved`;
  }
  if (action === "APPROVAL_REJECTED" && typeof metadata?.departmentName === "string") {
    return `${metadata.departmentName} rejected`;
  }
  if (action === "WORKFLOW_STEP_COMPLETED" && typeof metadata?.capability === "string") {
    return `Workflow step completed: ${metadata.capability.replaceAll("_", " ")}`;
  }
  if (action === "UNLOADING_POINT_ASSIGNED" && typeof metadata?.pointCode === "string") {
    return `Unloading point assigned: ${metadata.pointCode}`;
  }
  return AUDIT_LABELS[action] ?? action.replaceAll("_", " ");
}

export function mergeTimeline(
  entityItems: Array<{ label: string; at: string; status: string }>,
  auditItems: Array<{ action: string; at: string; metadata: Record<string, unknown> | null }>,
): TimelineItem[] {
  const items: TimelineItem[] = [
    ...entityItems.map((item) => ({ ...item, source: "entity" as const })),
    ...auditItems.map((item) => ({
      label: labelForAuditAction(item.action, item.metadata),
      at: item.at,
      status: item.action,
      source: "audit" as const,
    })),
  ];

  const auditLabels = new Set(auditItems.map((item) => labelForAuditAction(item.action, item.metadata)));
  const preferred = items.filter((item) => item.source === "audit" || !auditLabels.has(item.label));

  preferred.sort((left, right) => {
    const delta = new Date(left.at).getTime() - new Date(right.at).getTime();
    if (delta !== 0) {
      return delta;
    }
    return left.label.localeCompare(right.label);
  });

  const seen = new Set<string>();
  return preferred.filter((item) => {
    const key = `${item.label}|${item.at.slice(0, 19)}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
