import { canDecideApproval } from "./approvalEligibility.js";
import {
  getNotificationDefinition,
  type NotificationType,
  type RecipientRule,
} from "./notificationCatalog.js";

export type RoutedUser = {
  id: string;
  isActive: boolean;
  organizationId: string;
  isAdmin: boolean;
  permissions: string[];
  departmentId: string | null;
  departmentCode: string | null;
  roleCodes: string[];
  defaultSiteId: string | null;
  orgWide: boolean;
  siteIds: string[];
};

export type RoutingEvent = {
  type: NotificationType;
  organizationId: string;
  siteId: string;
  actorUserId: string;
  departmentId?: string | null;
  departmentCode?: string | null;
  assignedUserId?: string | null;
  extraRecipientUserIds?: string[];
};

export function userCanAccessSite(user: RoutedUser, siteId: string): boolean {
  if (user.orgWide || user.isAdmin) {
    return true;
  }
  if (user.defaultSiteId === siteId) {
    return true;
  }
  return user.siteIds.includes(siteId);
}

export function userHasAnyPermission(user: RoutedUser, permissions: string[]): boolean {
  if (user.isAdmin) {
    return true;
  }
  return permissions.some((permission) => user.permissions.includes(permission));
}

export function shouldReceiveEvent(user: RoutedUser, event: RoutingEvent): boolean {
  if (!user.isActive || user.organizationId !== event.organizationId) {
    return false;
  }
  if (user.id === event.actorUserId) {
    return false;
  }
  if (!userCanAccessSite(user, event.siteId)) {
    return false;
  }

  const definition = getNotificationDefinition(event.type);
  return matchesRecipientRule(user, event, definition.recipientRule, definition.permissions);
}

export function matchesRecipientRule(
  user: RoutedUser,
  event: RoutingEvent,
  rule: RecipientRule,
  permissions: string[],
): boolean {
  if (event.extraRecipientUserIds?.includes(user.id) && userCanAccessSite(user, event.siteId)) {
    return true;
  }

  switch (rule) {
    case "APPROVAL_DECIDERS":
      return canDecideApproval({
        userId: user.id,
        isAdmin: user.isAdmin,
        hasDecidePermission: user.isAdmin || user.permissions.includes("approval.decide"),
        departmentId: user.departmentId,
        departmentCode: user.departmentCode,
        roleCodes: user.roleCodes,
        approvalDepartmentId: event.departmentId ?? "",
        approvalDepartmentCode: event.departmentCode ?? "",
        assignedUserId: event.assignedUserId ?? null,
      });
    case "DOCUMENT_VERIFIERS":
      return userHasAnyPermission(user, permissions);
    case "UNLOADING_CREW":
      return userHasAnyPermission(user, permissions);
    case "WEIGHBRIDGE_OPERATORS":
      return userHasAnyPermission(user, permissions);
    case "OPERATIONS":
      return userHasAnyPermission(user, permissions);
    case "EXCEPTION_WATCHERS":
      return userHasAnyPermission(user, permissions);
    case "MANAGEMENT":
      return userHasAnyPermission(user, permissions);
    default: {
      const _exhaustive: never = rule;
      return _exhaustive;
    }
  }
}

export function canManageOperationalAlert(user: {
  roles: Array<{ code: string }>;
  permissions: string[];
}): boolean {
  if (user.roles.some((role) => role.code === "ADMIN")) {
    return true;
  }
  return user.permissions.includes("security.acknowledge");
}
