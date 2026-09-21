import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { isApiError } from "../../shared/api/client.ts";
import { formatDateTime } from "../../shared/ui/StatusPill.tsx";
import { listNotifications, markNotificationRead, type PublicNotification } from "./api.ts";
import { formatNotificationType, notificationHref, unreadLabel } from "./notificationHref.ts";

const POLL_MS = 30_000;

export function NotificationMenu() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<PublicNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  async function refresh(): Promise<void> {
    const result = await listNotifications(new URLSearchParams({ pageSize: "8" }));
    setItems(result.items);
    setUnreadCount(result.unreadCount);
  }

  useEffect(() => {
    void refresh().catch(() => {
      setItems([]);
    });
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refresh().catch(() => undefined);
      }
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, []);

  async function handleOpen(notification: PublicNotification): Promise<void> {
    try {
      if (!notification.readAt) {
        await markNotificationRead(notification.id);
        await refresh();
      }
    } catch (caught) {
      if (!isApiError(caught)) {
        return;
      }
    }
    setOpen(false);
  }

  return (
    <div className="notification-menu">
      <button
        type="button"
        className="ghost-button notification-trigger"
        aria-label="Notifications"
        onClick={() => setOpen((current) => !current)}
      >
        Notifications
        {unreadCount > 0 ? <span className="notification-badge">{unreadLabel(unreadCount)}</span> : null}
      </button>
      {open ? (
        <div className="notification-panel">
          {items.length === 0 ? <p className="login-note">No notifications</p> : null}
          {items.map((notification) => (
            <Link
              key={notification.id}
              to={notificationHref(notification)}
              className={notification.readAt ? "notification-item" : "notification-item unread"}
              onClick={() => void handleOpen(notification)}
            >
              <span className={`severity-dot severity-${notification.severity.toLowerCase()}`} />
              <strong>{notification.title}</strong>
              <span>{notification.message}</span>
              <em>
                {formatNotificationType(notification.type)} · {formatDateTime(notification.createdAt)}
              </em>
            </Link>
          ))}
          <Link to="/notifications" className="notification-footer" onClick={() => setOpen(false)}>
            Open notification center
          </Link>
        </div>
      ) : null}
    </div>
  );
}
