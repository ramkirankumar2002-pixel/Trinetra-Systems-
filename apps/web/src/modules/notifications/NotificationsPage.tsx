import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { isApiError } from "../../shared/api/client.ts";
import { formatDateTime, StatusPill } from "../../shared/ui/StatusPill.tsx";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type PublicNotification,
} from "./api.ts";
import { formatNotificationType, notificationHref } from "./notificationHref.ts";

export function NotificationsPage() {
  const [read, setRead] = useState("all");
  const [severity, setSeverity] = useState("");
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [items, setItems] = useState<PublicNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const search = new URLSearchParams();
  search.set("page", String(page));
  search.set("pageSize", "20");
  if (read !== "all") search.set("read", read);
  if (severity) search.set("severity", severity);
  if (type) search.set("type", type);
  if (from) search.set("from", from);
  if (to) search.set("to", to);
  const searchKey = search.toString();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void listNotifications(new URLSearchParams(searchKey))
      .then((result) => {
        if (cancelled) {
          return;
        }
        setItems(result.items);
        setUnreadCount(result.unreadCount);
        setTotalPages(result.totalPages);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(isApiError(caught) ? caught.message : "Unable to load notifications");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [searchKey]);

  async function markOne(notification: PublicNotification): Promise<void> {
    if (notification.readAt) {
      return;
    }
    const result = await markNotificationRead(notification.id);
    setItems((current) => current.map((item) => (item.id === result.notification.id ? result.notification : item)));
    setUnreadCount((current) => Math.max(0, current - 1));
  }

  async function markAll(): Promise<void> {
    const result = await markAllNotificationsRead();
    setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })));
    setUnreadCount(result.unreadCount);
  }

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="login-kicker">Inbox</p>
          <h1>Notification center</h1>
          <p className="login-note">
            {unreadCount === 0 ? "No unread notifications" : `${unreadCount} unread`}
          </p>
        </div>
        <button type="button" className="ghost-button" onClick={() => void markAll()} disabled={unreadCount === 0}>
          Mark all as read
        </button>
      </header>

      <form className="filter-bar" onSubmit={(event) => event.preventDefault()}>
        <label>
          Status
          <select
            value={read}
            onChange={(event) => {
              setRead(event.target.value);
              setPage(1);
            }}
          >
            <option value="all">All</option>
            <option value="unread">Unread</option>
            <option value="read">Read</option>
          </select>
        </label>
        <label>
          Severity
          <select
            value={severity}
            onChange={(event) => {
              setSeverity(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All severities</option>
            <option value="INFO">Info</option>
            <option value="SUCCESS">Success</option>
            <option value="WARNING">Warning</option>
            <option value="ERROR">Error</option>
            <option value="CRITICAL">Critical</option>
          </select>
        </label>
        <label>
          Type
          <select
            value={type}
            onChange={(event) => {
              setType(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All types</option>
            <option value="APPROVAL_REQUIRED">Approval required</option>
            <option value="APPROVAL_APPROVED">Approval approved</option>
            <option value="APPROVAL_REJECTED">Approval rejected</option>
            <option value="UNLOADING_ASSIGNED">Unloading assigned</option>
            <option value="WEIGHT_EXCEPTION">Weight exception</option>
            <option value="TRANSACTION_COMPLETED">Transaction completed</option>
          </select>
        </label>
        <label>
          From
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
      </form>

      {loading ? <p className="session-status">Loading notifications…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      {!loading && !error && items.length === 0 ? <p className="empty-state">No notifications match these filters</p> : null}

      <ul className="notification-list">
        {items.map((notification) => (
          <li key={notification.id} className={notification.readAt ? "notification-row" : "notification-row unread"}>
            <span className={`severity-dot severity-${notification.severity.toLowerCase()}`} />
            <div>
              <strong>{notification.title}</strong>
              <p>{notification.message}</p>
              <em>
                {formatNotificationType(notification.type)} · {formatDateTime(notification.createdAt)}
                {notification.transactionId ? " · Related transaction" : ""}
              </em>
            </div>
            <StatusPill value={notification.severity} />
            <div className="notification-row-actions">
              <Link to={notificationHref(notification)} className="text-link" onClick={() => void markOne(notification)}>
                Open
              </Link>
              {notification.readAt ? null : (
                <button type="button" className="text-link" onClick={() => void markOne(notification)}>
                  Mark as read
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {totalPages > 1 ? (
        <div className="pager">
          <button type="button" className="ghost-button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
            Previous
          </button>
          <span>
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            className="ghost-button"
            disabled={page >= totalPages}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </button>
        </div>
      ) : null}
    </main>
  );
}
