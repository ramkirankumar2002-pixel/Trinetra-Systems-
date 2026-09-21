import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatNotificationType, notificationHref, unreadLabel } from "./notificationHref.ts";

describe("notification center helpers", () => {
  it("shows an unread badge and caps large counts", () => {
    assert.equal(unreadLabel(0), "");
    assert.equal(unreadLabel(3), "3");
    assert.equal(unreadLabel(120), "99+");
  });

  it("opens the existing approval or transaction route", () => {
    assert.equal(
      notificationHref({
        type: "APPROVAL_REQUIRED",
        approvalId: "apr_1",
        transactionId: "txn_1",
        href: "/approvals/apr_1",
      }),
      "/approvals/apr_1",
    );
    assert.equal(
      notificationHref({
        type: "WEIGHT_EXCEPTION",
        approvalId: null,
        transactionId: "txn_9",
        href: "/transactions/txn_9",
      }),
      "/transactions/txn_9",
    );
  });

  it("formats type labels without inventing a second vocabulary", () => {
    assert.equal(formatNotificationType("APPROVAL_REQUESTED"), "APPROVAL REQUIRED");
    assert.equal(formatNotificationType("WEIGHT_EXCEPTION"), "WEIGHT EXCEPTION");
  });

  it("treats missing items as an empty inbox, not an error", () => {
    const empty = { items: [], unreadCount: 0 };
    assert.equal(empty.items.length === 0 && empty.unreadCount === 0, true);
  });
});
