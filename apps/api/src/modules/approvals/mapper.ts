import { ApprovalDecision, WeighmentKind, type Prisma } from "@prisma/client";
import { parseExtractedDocumentData, fieldValue } from "../../domain/extractedDocument.js";
import { documentTypeLabel } from "../../domain/documentTypes.js";
import { parseWorkflowSnapshot } from "../../domain/workflowSnapshot.js";

export const approvalListInclude = {
  department: { select: { id: true, code: true, name: true } },
  assignedUser: { select: { id: true, fullName: true } },
  approverUser: { select: { id: true, fullName: true } },
  site: { select: { id: true, code: true, name: true } },
  transaction: {
    select: {
      id: true,
      referenceNumber: true,
      status: true,
      arrivedAt: true,
      siteId: true,
      workflowSnapshot: true,
      vehicle: {
        select: {
          displayRegistrationNumber: true,
          registrationNumber: true,
          transporterName: true,
        },
      },
      material: { select: { id: true, code: true, name: true } },
      supplier: { select: { id: true, name: true, code: true } },
      weighments: {
        where: { kind: WeighmentKind.GROSS },
        take: 1,
        select: { weightKg: true, recordedAt: true, source: true },
      },
      documents: {
        orderBy: { createdAt: "desc" as const },
        take: 3,
        select: {
          id: true,
          documentType: true,
          status: true,
          originalFileName: true,
          extractedData: true,
        },
      },
    },
  },
} as const;

export type ApprovalRecord = Prisma.ApprovalGetPayload<{ include: typeof approvalListInclude }>;

export type PublicApproval = {
  id: string;
  status: ApprovalDecision;
  stepName: string;
  capability: string;
  snapshotStepSortOrder: number;
  requestedRoleCode: string | null;
  requestedAt: string;
  decidedAt: string | null;
  comments: string | null;
  department: { id: string; code: string; name: string };
  site: { id: string; code: string; name: string };
  assignedUser: { id: string; fullName: string } | null;
  decidedBy: { id: string; fullName: string } | null;
  canDecide: boolean;
  transaction: {
    id: string;
    referenceNumber: string;
    status: string;
    arrivedAt: string;
    vehicleNumber: string | null;
    transporterName: string | null;
    material: { id: string; code: string; name: string } | null;
    supplier: { id: string; name: string; code: string | null } | null;
    workflowCode: string | null;
    workflowName: string | null;
    grossWeightKg: string | null;
    documents: Array<{
      id: string;
      documentType: string;
      documentTypeLabel: string;
      status: string;
      originalFileName: string;
      invoiceNumber: string | null;
      supplierName: string | null;
      materialName: string | null;
    }>;
  };
};

export function toPublicApproval(record: ApprovalRecord, canDecide: boolean): PublicApproval {
  const snapshot = parseWorkflowSnapshot(record.transaction.workflowSnapshot);
  const gross = record.transaction.weighments[0];

  return {
    id: record.id,
    status: record.decision,
    stepName: record.snapshotStepName,
    capability: record.snapshotCapability,
    snapshotStepSortOrder: record.snapshotStepSortOrder,
    requestedRoleCode: record.requestedRoleCode,
    requestedAt: record.requestedAt.toISOString(),
    decidedAt: record.decidedAt?.toISOString() ?? null,
    comments: record.comments,
    department: record.department,
    site: record.site,
    assignedUser: record.assignedUser,
    decidedBy: record.approverUser,
    canDecide,
    transaction: {
      id: record.transaction.id,
      referenceNumber: record.transaction.referenceNumber,
      status: record.transaction.status,
      arrivedAt: record.transaction.arrivedAt.toISOString(),
      vehicleNumber: record.transaction.vehicle?.displayRegistrationNumber ?? null,
      transporterName: record.transaction.vehicle?.transporterName ?? null,
      material: record.transaction.material,
      supplier: record.transaction.supplier,
      workflowCode: snapshot?.workflow.code ?? null,
      workflowName: snapshot?.workflow.name ?? null,
      grossWeightKg: gross ? gross.weightKg.toString() : null,
      documents: record.transaction.documents.map((document) => {
        const extracted = parseExtractedDocumentData(document.extractedData);
        return {
          id: document.id,
          documentType: document.documentType,
          documentTypeLabel: documentTypeLabel(document.documentType),
          status: document.status,
          originalFileName: document.originalFileName,
          invoiceNumber: fieldValue(extracted, "invoiceNumber"),
          supplierName: fieldValue(extracted, "supplierName"),
          materialName: fieldValue(extracted, "materialName"),
        };
      }),
    },
  };
}
