import { Prisma } from "@prisma/client";
import type { NotificationCategory } from "../../domain/notificationCatalog.js";
import {
  shouldReceiveEvent,
  type RoutedUser,
  type RoutingEvent,
} from "../../domain/notificationRouting.js";
import { prisma } from "../../db/client.js";

type DbClient = Prisma.TransactionClient | typeof prisma;

const userRoutingInclude = {
  defaultDepartment: { select: { id: true, code: true } },
  defaultSite: { select: { id: true } },
  userRoles: {
    include: {
      role: {
        select: {
          code: true,
          rolePermissions: { select: { permission: { select: { code: true } } } },
        },
      },
      site: { select: { id: true } },
    },
  },
} as const;

export function toRoutedUser(user: {
  id: string;
  isActive: boolean;
  organizationId: string;
  defaultDepartment: { id: string; code: string } | null;
  defaultSite: { id: string } | null;
  userRoles: Array<{
    role: { code: string; rolePermissions: Array<{ permission: { code: string } }> };
    site: { id: string } | null;
  }>;
}): RoutedUser {
  const roleCodes = user.userRoles.map((assignment) => assignment.role.code);
  const isAdmin = roleCodes.includes("ADMIN");
  const permissions = [...new Set(user.userRoles.flatMap((assignment) =>
    assignment.role.rolePermissions.map((item) => item.permission.code),
  ))];
  const siteIds = user.userRoles
    .map((assignment) => assignment.site?.id)
    .filter((id): id is string => id !== undefined);
  const orgWide = user.userRoles.some((assignment) => assignment.site === null);

  return {
    id: user.id,
    isActive: user.isActive,
    organizationId: user.organizationId,
    isAdmin,
    permissions,
    departmentId: user.defaultDepartment?.id ?? null,
    departmentCode: user.defaultDepartment?.code ?? null,
    roleCodes,
    defaultSiteId: user.defaultSite?.id ?? null,
    orgWide,
    siteIds,
  };
}

export async function resolveEventRecipients(db: DbClient, event: RoutingEvent): Promise<RoutedUser[]> {
  const extraIds = event.extraRecipientUserIds ?? [];
  const candidates = await db.user.findMany({
    where: {
      organizationId: event.organizationId,
      isActive: true,
      deletedAt: null,
      OR: [
        { userRoles: { some: { role: { code: "ADMIN" } } } },
        {
          userRoles: {
            some: {
              role: {
                rolePermissions: {
                  some: { permission: { code: { in: CANDIDATE_PERMISSIONS } } },
                },
              },
            },
          },
        },
        ...(extraIds.length > 0 ? [{ id: { in: extraIds } }] : []),
      ],
    },
    include: userRoutingInclude,
  });

  return candidates.map(toRoutedUser).filter((user) => shouldReceiveEvent(user, event));
}

export async function isCategoryEnabled(
  db: DbClient,
  userId: string,
  category: NotificationCategory,
): Promise<boolean> {
  const preference = await db.notificationPreference.findUnique({
    where: { userId_category: { userId, category } },
    select: { inAppEnabled: true },
  });
  return preference?.inAppEnabled ?? true;
}

const CANDIDATE_PERMISSIONS = [
  "approval.decide",
  "document.verify",
  "document.upload",
  "unloading.assign",
  "unloading.manage",
  "weighment.record",
  "transaction.create",
  "transaction.update",
  "transaction.finalize",
  "transaction.correct",
  "dashboard.read",
  "report.read",
  "weighbridge.read",
  "weighbridge.manage",
  "camera.read",
  "camera.manage",
  "gateway.read",
  "gateway.manage",
  "sync.read",
  "sync.manage",
  "anomaly.read",
  "anomaly.acknowledge",
  "security.read",
  "reliability.read",
  "reliability.manage",
  "monitoring.read",
  "support.ticket.read",
  "support.ticket.manage",
  "support.maintenance.read",
  "maintenance.manage",
];
