import {
  ApprovalDecision,
  DocumentStatus,
  OcrStatus,
  PrismaClient,
  TransactionStatus,
  UnloadingPointStatus,
  UnloadingStatus,
  WeighmentKind,
  WeighmentSource,
  WorkflowCapability,
} from "@prisma/client";
import { buildWorkflowSnapshot, parseWorkflowConfig } from "../src/domain/workflowSnapshot.js";

export async function seedDashboardDemoScenarios(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    siteId: string;
    siteBId: string;
    operatorUserId: string;
  },
): Promise<void> {
  const weighbridge = await prisma.weighbridge.findFirst({
    where: { organizationId: input.organizationId, siteId: input.siteId, code: "WB-01" },
  });
  if (!weighbridge) {
    return;
  }

  const vehicles = {
    demo: await requireVehicle(prisma, input.organizationId, "DEMO0001"),
    ap: await requireVehicle(prisma, input.organizationId, "AP39XX1234"),
    mh: await requireVehicle(prisma, input.organizationId, "MH12AB1234"),
    exception: await upsertVehicle(prisma, input.organizationId, "DEMODASHX", "DEMO-DASH-X"),
    siteB: await upsertVehicle(prisma, input.organizationId, "DEMOB001", "DEMO-B001"),
  };

  const sand = await requireMaterial(prisma, input.organizationId, "SAND");
  const steel = await requireMaterial(prisma, input.organizationId, "STEEL");
  const aggregate = await requireMaterial(prisma, input.organizationId, "AGGREGATE");
  const cement = await requireMaterial(prisma, input.organizationId, "CEMENT");
  const type1 = await loadWorkflow(prisma, input.organizationId, "TYPE_1");
  const type2 = await loadWorkflow(prisma, input.organizationId, "TYPE_2");
  const type3 = await loadWorkflow(prisma, input.organizationId, "TYPE_3");
  const supervisor = await prisma.department.findFirst({
    where: { organizationId: input.organizationId, code: "SUPERVISOR" },
  });
  const store = await prisma.department.findFirst({
    where: { organizationId: input.organizationId, code: "STORE" },
  });
  const unloadingPoint = await prisma.unloadingPoint.findFirst({
    where: { organizationId: input.organizationId, siteId: input.siteId, code: "UP-01" },
  });

  if (!supervisor || !store || !unloadingPoint) {
    return;
  }

  await ensureTransaction(prisma, {
    organizationId: input.organizationId,
    siteId: input.siteId,
    weighbridgeId: weighbridge.id,
    createdByUserId: input.operatorUserId,
    referenceNumber: "TRN-DEMO-DASH-ACTIVE",
    status: TransactionStatus.IDENTIFIED,
    vehicleId: vehicles.demo.id,
    arrivedAt: hoursAgo(2),
  });

  const approvalTx = await ensureTransaction(prisma, {
    organizationId: input.organizationId,
    siteId: input.siteId,
    weighbridgeId: weighbridge.id,
    createdByUserId: input.operatorUserId,
    referenceNumber: "TRN-DEMO-DASH-APPROVAL",
    status: TransactionStatus.PENDING_APPROVAL,
    vehicleId: vehicles.ap.id,
    materialId: sand.id,
    workflowDefinitionId: type1.id,
    workflowSnapshot: snapshotFor(type1, sand, "asg-sand"),
    materialSource: "MANUAL",
    arrivedAt: hoursAgo(5),
  });
  if (approvalTx.created) {
    await addGross(prisma, approvalTx.id, weighbridge.id, input.operatorUserId, "18250.000", hoursAgo(4));
    await addDocument(prisma, input.organizationId, approvalTx.id, input.operatorUserId);
    await prisma.approval.create({
      data: {
        organizationId: input.organizationId,
        siteId: input.siteId,
        transactionId: approvalTx.id,
        snapshotStepSortOrder: 6,
        snapshotCapability: WorkflowCapability.APPROVAL,
        snapshotStepName: "Supervisor verification",
        stage: 1,
        departmentId: supervisor.id,
        requestedRoleCode: "SUPERVISOR",
        decision: ApprovalDecision.PENDING,
        requestedAt: hoursAgo(3),
      },
    });
  }

  const unloadTx = await ensureTransaction(prisma, {
    organizationId: input.organizationId,
    siteId: input.siteId,
    weighbridgeId: weighbridge.id,
    createdByUserId: input.operatorUserId,
    referenceNumber: "TRN-DEMO-DASH-UNLOAD",
    status: TransactionStatus.APPROVED,
    vehicleId: vehicles.mh.id,
    materialId: steel.id,
    workflowDefinitionId: type2.id,
    workflowSnapshot: snapshotFor(type2, steel, "asg-steel"),
    materialSource: "MANUAL",
    arrivedAt: hoursAgo(8),
  });
  if (unloadTx.created) {
    await addGross(prisma, unloadTx.id, weighbridge.id, input.operatorUserId, "27400.000", hoursAgo(7));
    await addDocument(prisma, input.organizationId, unloadTx.id, input.operatorUserId);
    await prisma.approval.create({
      data: {
        organizationId: input.organizationId,
        siteId: input.siteId,
        transactionId: unloadTx.id,
        snapshotStepSortOrder: 6,
        snapshotCapability: WorkflowCapability.APPROVAL,
        snapshotStepName: "Store approval",
        stage: 1,
        departmentId: store.id,
        requestedRoleCode: "STORE_OFFICER",
        decision: ApprovalDecision.APPROVED,
        approverUserId: input.operatorUserId,
        comments: "Demo store approval for dashboard seed",
        requestedAt: hoursAgo(6),
        decidedAt: hoursAgo(5),
      },
    });
    await prisma.unloading.create({
      data: {
        transactionId: unloadTx.id,
        unloadingPointId: unloadingPoint.id,
        instructedByUserId: input.operatorUserId,
        status: UnloadingStatus.NOT_STARTED,
        assignedAt: hoursAgo(4),
      },
    });
    await prisma.unloadingPoint.update({
      where: { id: unloadingPoint.id },
      data: { status: UnloadingPointStatus.OCCUPIED },
    });
  }

  const exceptionTx = await ensureTransaction(prisma, {
    organizationId: input.organizationId,
    siteId: input.siteId,
    weighbridgeId: weighbridge.id,
    createdByUserId: input.operatorUserId,
    referenceNumber: "TRN-DEMO-DASH-EXCEPTION",
    status: TransactionStatus.EXCEPTION,
    vehicleId: vehicles.exception.id,
    materialId: aggregate.id,
    workflowDefinitionId: type3.id,
    workflowSnapshot: snapshotFor(type3, aggregate, "asg-agg"),
    materialSource: "MANUAL",
    exceptionReason: "Tare weight is greater than gross weight. Operational exception — not a fraud finding.",
    arrivedAt: hoursAgo(12),
  });
  if (exceptionTx.created) {
    await addGross(prisma, exceptionTx.id, weighbridge.id, input.operatorUserId, "12000.000", hoursAgo(11));
    await prisma.weighment.create({
      data: {
        transactionId: exceptionTx.id,
        weighbridgeId: weighbridge.id,
        sequence: 2,
        kind: WeighmentKind.TARE,
        weightKg: "18500.000",
        recordedAt: hoursAgo(10),
        recordedByUserId: input.operatorUserId,
        source: WeighmentSource.SIMULATED,
      },
    });
    await addDocument(prisma, input.organizationId, exceptionTx.id, input.operatorUserId);
  }

  const doneTx = await ensureTransaction(prisma, {
    organizationId: input.organizationId,
    siteId: input.siteId,
    weighbridgeId: weighbridge.id,
    createdByUserId: input.operatorUserId,
    completedByUserId: input.operatorUserId,
    referenceNumber: "TRN-DEMO-DASH-DONE",
    status: TransactionStatus.COMPLETED,
    vehicleId: vehicles.demo.id,
    materialId: cement.id,
    workflowDefinitionId: type2.id,
    workflowSnapshot: snapshotFor(type2, cement, "asg-cement"),
    materialSource: "MANUAL",
    netWeightKg: "8500.000",
    arrivedAt: hoursAgo(30),
    completedAt: hoursAgo(26),
  });
  if (doneTx.created) {
    await addGross(prisma, doneTx.id, weighbridge.id, input.operatorUserId, "24000.000", hoursAgo(29));
    await prisma.weighment.create({
      data: {
        transactionId: doneTx.id,
        weighbridgeId: weighbridge.id,
        sequence: 2,
        kind: WeighmentKind.TARE,
        weightKg: "15500.000",
        recordedAt: hoursAgo(27),
        recordedByUserId: input.operatorUserId,
        source: WeighmentSource.SIMULATED,
      },
    });
    await addDocument(prisma, input.organizationId, doneTx.id, input.operatorUserId);
    await prisma.approval.create({
      data: {
        organizationId: input.organizationId,
        siteId: input.siteId,
        transactionId: doneTx.id,
        snapshotStepSortOrder: 6,
        snapshotCapability: WorkflowCapability.APPROVAL,
        snapshotStepName: "Store approval",
        stage: 1,
        departmentId: store.id,
        requestedRoleCode: "STORE_OFFICER",
        decision: ApprovalDecision.APPROVED,
        approverUserId: input.operatorUserId,
        requestedAt: hoursAgo(28),
        decidedAt: hoursAgo(28),
      },
    });
    await prisma.unloading.create({
      data: {
        transactionId: doneTx.id,
        unloadingPointId: unloadingPoint.id,
        instructedByUserId: input.operatorUserId,
        startedByUserId: input.operatorUserId,
        completedByUserId: input.operatorUserId,
        status: UnloadingStatus.COMPLETED,
        assignedAt: hoursAgo(28),
        startedAt: hoursAgo(27.5),
        completedAt: hoursAgo(27),
      },
    });
  }

  await ensureTransaction(prisma, {
    organizationId: input.organizationId,
    siteId: input.siteBId,
    createdByUserId: input.operatorUserId,
    referenceNumber: "TRN-DEMO-DASH-SITEB",
    status: TransactionStatus.ARRIVED,
    vehicleId: vehicles.siteB.id,
    arrivedAt: hoursAgo(1),
  });
}

type WorkflowBundle = {
  id: string;
  code: string;
  name: string;
  config: unknown;
  steps: Array<{
    sortOrder: number;
    capability: WorkflowCapability;
    name: string;
    isRequired: boolean;
    approvalDepartment: { id: string; code: string; name: string } | null;
  }>;
};

function snapshotFor(
  workflow: WorkflowBundle,
  material: { id: string; code: string; name: string; unitOfMeasure: string },
  assignmentId: string,
) {
  return buildWorkflowSnapshot({
    assignmentId,
    material,
    workflow: { id: workflow.id, code: workflow.code, name: workflow.name },
    config: parseWorkflowConfig(workflow.config),
    steps: workflow.steps.map((step) => ({
      sortOrder: step.sortOrder,
      capability: step.capability,
      name: step.name,
      isRequired: step.isRequired,
      approvalDepartment: step.approvalDepartment,
    })),
    source: "MANUAL",
    ocrMaterialName: null,
    ocrConfidence: null,
    identificationStatus: "MATCHED",
    verified: true,
    verifiedAt: new Date().toISOString(),
  });
}

async function ensureTransaction(
  prisma: PrismaClient,
  data: {
    organizationId: string;
    siteId: string;
    weighbridgeId?: string;
    createdByUserId: string;
    completedByUserId?: string;
    referenceNumber: string;
    status: TransactionStatus;
    vehicleId?: string;
    materialId?: string;
    workflowDefinitionId?: string;
    workflowSnapshot?: ReturnType<typeof buildWorkflowSnapshot>;
    materialSource?: string;
    exceptionReason?: string;
    netWeightKg?: string;
    arrivedAt: Date;
    completedAt?: Date;
  },
): Promise<{ id: string; created: boolean }> {
  const existing = await prisma.transaction.findUnique({
    where: {
      organizationId_referenceNumber: {
        organizationId: data.organizationId,
        referenceNumber: data.referenceNumber,
      },
    },
    select: { id: true },
  });
  if (existing) {
    return { id: existing.id, created: false };
  }

  const created = await prisma.transaction.create({
    data: {
      organizationId: data.organizationId,
      siteId: data.siteId,
      weighbridgeId: data.weighbridgeId,
      createdByUserId: data.createdByUserId,
      completedByUserId: data.completedByUserId,
      referenceNumber: data.referenceNumber,
      status: data.status,
      vehicleId: data.vehicleId,
      materialId: data.materialId,
      workflowDefinitionId: data.workflowDefinitionId,
      workflowSnapshot: data.workflowSnapshot ?? undefined,
      materialSource: data.materialSource,
      exceptionReason: data.exceptionReason,
      netWeightKg: data.netWeightKg,
      arrivedAt: data.arrivedAt,
      completedAt: data.completedAt,
    },
    select: { id: true },
  });
  return { id: created.id, created: true };
}

async function addGross(
  prisma: PrismaClient,
  transactionId: string,
  weighbridgeId: string,
  userId: string,
  weightKg: string,
  recordedAt: Date,
): Promise<void> {
  await prisma.weighment.create({
    data: {
      transactionId,
      weighbridgeId,
      sequence: 1,
      kind: WeighmentKind.GROSS,
      weightKg,
      recordedAt,
      recordedByUserId: userId,
      source: WeighmentSource.SIMULATED,
    },
  });
}

async function addDocument(
  prisma: PrismaClient,
  organizationId: string,
  transactionId: string,
  userId: string,
): Promise<void> {
  await prisma.document.create({
    data: {
      organizationId,
      transactionId,
      uploadedByUserId: userId,
      documentType: "INVOICE",
      storageKey: `demo/seed/${transactionId}.txt`,
      originalFileName: "demo-invoice.txt",
      mimeType: "text/plain",
      status: DocumentStatus.VERIFIED,
      ocrStatus: OcrStatus.COMPLETED,
    },
  });
}

async function requireVehicle(prisma: PrismaClient, organizationId: string, registrationNumber: string) {
  const vehicle = await prisma.vehicle.findUnique({
    where: { organizationId_registrationNumber: { organizationId, registrationNumber } },
  });
  if (!vehicle) {
    throw new Error(`Missing demo vehicle ${registrationNumber}`);
  }
  return vehicle;
}

async function upsertVehicle(prisma: PrismaClient, organizationId: string, registrationNumber: string, display: string) {
  return prisma.vehicle.upsert({
    where: { organizationId_registrationNumber: { organizationId, registrationNumber } },
    update: { displayRegistrationNumber: display },
    create: {
      organizationId,
      registrationNumber,
      displayRegistrationNumber: display,
      vehicleType: "Truck",
      transporterName: "Demo Transport",
      notes: "Development dashboard demo vehicle. Not a real registration.",
    },
  });
}

async function requireMaterial(prisma: PrismaClient, organizationId: string, code: string) {
  const material = await prisma.material.findUnique({
    where: { organizationId_code: { organizationId, code } },
  });
  if (!material) {
    throw new Error(`Missing demo material ${code}`);
  }
  return material;
}

async function loadWorkflow(prisma: PrismaClient, organizationId: string, code: string): Promise<WorkflowBundle> {
  const workflow = await prisma.workflowDefinition.findUnique({
    where: { organizationId_code: { organizationId, code } },
    include: {
      steps: {
        include: { approvalDepartment: { select: { id: true, code: true, name: true } } },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!workflow) {
    throw new Error(`Missing demo workflow ${code}`);
  }
  return workflow;
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}
