import { HttpError } from "../../lib/httpError.js";
import type { SupportTicketStatus } from "./catalog.js";

const TRANSITIONS: Record<SupportTicketStatus, SupportTicketStatus[]> = {
  OPEN: ["ACKNOWLEDGED", "IN_PROGRESS", "CANCELLED"],
  ACKNOWLEDGED: ["IN_PROGRESS", "WAITING_FOR_CUSTOMER", "CANCELLED"],
  IN_PROGRESS: ["WAITING_FOR_CUSTOMER", "WAITING_FOR_MAINTENANCE", "RESOLVED", "CANCELLED"],
  WAITING_FOR_CUSTOMER: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
  WAITING_FOR_MAINTENANCE: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
  RESOLVED: ["CLOSED", "IN_PROGRESS"],
  CLOSED: [],
  CANCELLED: [],
};

export function allowedTicketTransitions(from: SupportTicketStatus): SupportTicketStatus[] {
  return TRANSITIONS[from];
}

export function canTransitionTicket(from: SupportTicketStatus, to: SupportTicketStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTicketTransition(from: SupportTicketStatus, to: SupportTicketStatus): void {
  if (from === to) {
    return;
  }
  if (!canTransitionTicket(from, to)) {
    throw new HttpError(409, `Cannot change ticket status from ${from} to ${to}`);
  }
}

export function isOpenTicketStatus(status: SupportTicketStatus): boolean {
  return status !== "RESOLVED" && status !== "CLOSED" && status !== "CANCELLED";
}
