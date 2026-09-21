import {
  NotificationCategory,
  NotificationSeverity,
  OperationalAlertStatus,
  PrismaClient,
} from "@prisma/client";

export async function seedDemoNotifications(
  prisma: PrismaClient,
  organizationId: string,
): Promise<void> {
  const supervisor = await prisma.user.findFirst({
    where: { organizationId, email: "supervisor@demo.local" },
  });
  const store = await prisma.user.findFirst({
    where: { organizationId, email: "store@demo.local" },
  });
  const office = await prisma.user.findFirst({
    where: { organizationId, email: "office@demo.local" },
  });
  const operator = await prisma.user.findFirst({
    where: { organizationId, email: "weighbridge@demo.local" },
  });
  if (!supervisor || !store || !office || !operator) {
    return;
  }

  const approvalTx = await prisma.transaction.findFirst({
    where: { organizationId, referenceNumber: "TRN-DEMO-DASH-APPROVAL" },
    include: { approvals: { where: { decision: "PENDING" }, take: 1 } },
  });
  const unloadTx = await prisma.transaction.findFirst({
    where: { organizationId, referenceNumber: "TRN-DEMO-DASH-UNLOAD" },
  });
  const exceptionTx = await prisma.transaction.findFirst({
    where: { organizationId, referenceNumber: "TRN-DEMO-DASH-EXCEPTION" },
  });
  const doneTx = await prisma.transaction.findFirst({
    where: { organizationId, referenceNumber: "TRN-DEMO-DASH-DONE" },
    include: { approvals: { where: { decision: "APPROVED" }, take: 1 } },
  });

  if (approvalTx?.approvals[0]) {
    await prisma.notification.deleteMany({
      where: {
        recipientUserId: supervisor.id,
        approvalId: approvalTx.approvals[0].id,
        eventKey: { startsWith: "legacy:" },
      },
    });
    await upsertNotification(prisma, {
      organizationId,
      siteId: approvalTx.siteId,
      recipientUserId: supervisor.id,
      type: "APPROVAL_REQUIRED",
      category: NotificationCategory.APPROVAL,
      severity: NotificationSeverity.WARNING,
      title: "Supervisor approval required",
      message: `Transaction ${approvalTx.referenceNumber} requires material verification.`,
      transactionId: approvalTx.id,
      approvalId: approvalTx.approvals[0].id,
      eventKey: `approval.required:${approvalTx.approvals[0].id}`,
    });
    await upsertAlert(prisma, {
      organizationId,
      siteId: approvalTx.siteId,
      type: "APPROVAL_REQUIRED",
      severity: NotificationSeverity.WARNING,
      title: "Supervisor approval required",
      message: `Transaction ${approvalTx.referenceNumber} requires material verification.`,
      transactionId: approvalTx.id,
      entityType: "Approval",
      entityId: approvalTx.approvals[0].id,
      eventKey: `approval.required:${approvalTx.approvals[0].id}`,
      status: OperationalAlertStatus.OPEN,
    });
  }

  if (doneTx?.approvals[0]) {
    await upsertNotification(prisma, {
      organizationId,
      siteId: doneTx.siteId,
      recipientUserId: store.id,
      type: "APPROVAL_APPROVED",
      category: NotificationCategory.APPROVAL,
      severity: NotificationSeverity.SUCCESS,
      title: `Store approved ${doneTx.referenceNumber}`,
      message: `Store approved ${doneTx.referenceNumber}.`,
      transactionId: doneTx.id,
      approvalId: doneTx.approvals[0].id,
      eventKey: `approval.approved:${doneTx.approvals[0].id}`,
      readAt: hoursAgo(25),
    });
  }

  if (unloadTx) {
    await upsertNotification(prisma, {
      organizationId,
      siteId: unloadTx.siteId,
      recipientUserId: operator.id,
      type: "UNLOADING_ASSIGNED",
      category: NotificationCategory.WORKFLOW,
      severity: NotificationSeverity.INFO,
      title: "Unloading assigned",
      message: `${unloadTx.referenceNumber} is assigned to an unloading point.`,
      transactionId: unloadTx.id,
      eventKey: `unloading.assigned:${unloadTx.id}:seed`,
    });
  }

  if (exceptionTx) {
    await upsertNotification(prisma, {
      organizationId,
      siteId: exceptionTx.siteId,
      recipientUserId: supervisor.id,
      type: "WEIGHT_EXCEPTION",
      category: NotificationCategory.EXCEPTION,
      severity: NotificationSeverity.ERROR,
      title: `Weight exception on ${exceptionTx.referenceNumber}`,
      message: `Weight validation failed for ${exceptionTx.referenceNumber}. This is an operational exception, not a fraud finding.`,
      transactionId: exceptionTx.id,
      eventKey: `weight.exception:${exceptionTx.id}`,
    });
    await upsertNotification(prisma, {
      organizationId,
      siteId: exceptionTx.siteId,
      recipientUserId: office.id,
      type: "WEIGHT_EXCEPTION",
      category: NotificationCategory.EXCEPTION,
      severity: NotificationSeverity.ERROR,
      title: `Weight exception on ${exceptionTx.referenceNumber}`,
      message: `Weight validation failed for ${exceptionTx.referenceNumber}. This is an operational exception, not a fraud finding.`,
      transactionId: exceptionTx.id,
      eventKey: `weight.exception:${exceptionTx.id}`,
    });
    await upsertAlert(prisma, {
      organizationId,
      siteId: exceptionTx.siteId,
      type: "WEIGHT_EXCEPTION",
      severity: NotificationSeverity.ERROR,
      title: `Weight exception on ${exceptionTx.referenceNumber}`,
      message: `Weight validation failed for ${exceptionTx.referenceNumber}. This is an operational exception, not a fraud finding.`,
      transactionId: exceptionTx.id,
      entityType: "Transaction",
      entityId: exceptionTx.id,
      eventKey: `weight.exception:${exceptionTx.id}`,
      status: OperationalAlertStatus.OPEN,
    });
  }

  if (doneTx) {
    await upsertNotification(prisma, {
      organizationId,
      siteId: doneTx.siteId,
      recipientUserId: office.id,
      type: "TRANSACTION_COMPLETED",
      category: NotificationCategory.WORKFLOW,
      severity: NotificationSeverity.SUCCESS,
      title: `Transaction ${doneTx.referenceNumber} completed`,
      message: `${doneTx.referenceNumber} has been completed.`,
      transactionId: doneTx.id,
      eventKey: `transaction.completed:${doneTx.id}`,
      readAt: hoursAgo(24),
    });
  }
}

async function upsertNotification(
  prisma: PrismaClient,
  data: {
    organizationId: string;
    siteId: string;
    recipientUserId: string;
    type: string;
    category: NotificationCategory;
    severity: NotificationSeverity;
    title: string;
    message: string;
    transactionId?: string;
    approvalId?: string;
    eventKey: string;
    readAt?: Date;
  },
): Promise<void> {
  await prisma.notification.upsert({
    where: {
      recipientUserId_eventKey: {
        recipientUserId: data.recipientUserId,
        eventKey: data.eventKey,
      },
    },
    update: {
      title: data.title,
      message: data.message,
    },
    create: {
      organizationId: data.organizationId,
      siteId: data.siteId,
      recipientUserId: data.recipientUserId,
      type: data.type,
      category: data.category,
      severity: data.severity,
      title: data.title,
      message: data.message,
      entityType: data.approvalId ? "Approval" : "Transaction",
      entityId: data.approvalId ?? data.transactionId ?? null,
      transactionId: data.transactionId,
      approvalId: data.approvalId,
      eventKey: data.eventKey,
      readAt: data.readAt,
    },
  });
}

async function upsertAlert(
  prisma: PrismaClient,
  data: {
    organizationId: string;
    siteId: string;
    type: string;
    severity: NotificationSeverity;
    title: string;
    message: string;
    transactionId?: string;
    entityType: string;
    entityId: string;
    eventKey: string;
    status: OperationalAlertStatus;
  },
): Promise<void> {
  await prisma.operationalAlert.upsert({
    where: {
      organizationId_eventKey: {
        organizationId: data.organizationId,
        eventKey: data.eventKey,
      },
    },
    update: {
      title: data.title,
      message: data.message,
    },
    create: data,
  });
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}
