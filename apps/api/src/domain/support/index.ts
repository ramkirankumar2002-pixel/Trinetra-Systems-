export {
  ACTIVE_MAINTENANCE_STATUSES,
  CUSTOMER_SUPPORT_PERMISSIONS,
  OPEN_TICKET_STATUSES,
  SERVICE_MAINTENANCE_STATUSES,
  SERVICE_MAINTENANCE_TYPES,
  STAFF_SUPPORT_PERMISSIONS,
  SUPPORT_ACTIVITY_TYPES,
  SUPPORT_ACTIVITY_VISIBILITIES,
  SUPPORT_ENGINEER_PERMISSIONS,
  SUPPORT_PERMISSIONS,
  SUPPORT_PERMISSION_CODES,
  SUPPORT_TICKET_CATEGORIES,
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_TICKET_STATUSES,
  isAdminAssignablePermission,
  isServiceMaintenanceStatus,
  isServiceMaintenanceType,
  isSupportActivityType,
  isSupportTicketCategory,
  isSupportTicketPriority,
  isSupportTicketStatus,
} from "./catalog.js";
export type {
  ServiceMaintenanceStatus,
  ServiceMaintenanceType,
  SupportActivityType,
  SupportActivityVisibility,
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketStatus,
} from "./catalog.js";
export {
  allowedTicketTransitions,
  assertTicketTransition,
  canTransitionTicket,
  isOpenTicketStatus,
} from "./ticketLifecycle.js";
export {
  assertMaintenanceTransition,
  canTransitionMaintenance,
  isActiveMaintenanceStatus,
} from "./maintenanceLifecycle.js";
export { formatSupportNumber, parseSupportSequence, supportNumberPrefix } from "./numbers.js";
