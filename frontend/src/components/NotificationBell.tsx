import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  getNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  type InAppNotification,
} from "../api/notifications";

const TYPE_ICONS: Record<string, string> = {
  appointment_confirmed: "📅",
  appointment_reminder: "⏰",
  appointment_rescheduled: "🔄",
  appointment_cancelled: "❌",
  queue_registered: "🎫",
  queue_approaching_turn: "⚠️",
  queue_called: "📢",
  queue_delayed: "⏳",
  queue_paused: "⏸️",
  queue_resumed: "▶️",
  consultation_completed: "✅",
};

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function NotificationBell({
  onOpenPreferences,
}: {
  onOpenPreferences?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const trayRef = useRef<HTMLDivElement>(null);

  const fetchItems = async () => {
    try {
      const data = await getNotifications();
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch {
      // Ignore background fetch errors
    }
  };

  useEffect(() => {
    fetchItems();
    const interval = setInterval(fetchItems, 8000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (trayRef.current && !trayRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleMarkAllRead = async () => {
    setLoading(true);
    await markAllNotificationsAsRead();
    await fetchItems();
    setLoading(false);
  };

  const handleItemClick = async (notif: InAppNotification) => {
    if (!notif.read) {
      await markNotificationAsRead(notif.id);
      await fetchItems();
    }
    setOpen(false);
  };

  return (
    <div className="notification-bell-container" ref={trayRef} style={{ position: "relative" }}>
      <button
        type="button"
        className="notification-bell-btn"
        aria-label={`Notifications, ${unreadCount} unread`}
        onClick={() => setOpen((prev) => !prev)}
        style={{
          background: "transparent",
          border: "1px solid var(--color-border)",
          borderRadius: "50%",
          width: "38px",
          height: "38px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          position: "relative",
          color: "var(--color-text)",
          fontSize: "1.1rem",
        }}
      >
        <span>🔔</span>
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: "-4px",
              right: "-4px",
              backgroundColor: "#ef4444",
              color: "#ffffff",
              fontSize: "0.7rem",
              fontWeight: 700,
              borderRadius: "10px",
              minWidth: "18px",
              height: "18px",
              padding: "0 4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "2px solid var(--color-surface)",
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="notification-dropdown"
          style={{
            position: "absolute",
            top: "46px",
            right: 0,
            width: "360px",
            maxHeight: "480px",
            backgroundColor: "#0f172a",
            border: "1px solid #334155",
            borderRadius: "12px",
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5)",
            zIndex: 1000,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid #1e293b",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#f8fafc" }}>
              Notifications {unreadCount > 0 && <span style={{ color: "#38bdf8" }}>({unreadCount})</span>}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={loading}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#38bdf8",
                  fontSize: "0.8rem",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          <div style={{ overflowY: "auto", maxHeight: "360px", padding: "4px 0" }}>
            {notifications.length === 0 ? (
              <div style={{ padding: "32px 16px", textAlign: "center", color: "#94a3b8", fontSize: "0.85rem" }}>
                <span>🔕</span>
                <p style={{ margin: "8px 0 0" }}>No notifications yet.</p>
              </div>
            ) : (
              notifications.map((notif) => {
                const icon = TYPE_ICONS[notif.type] || "📌";
                return (
                  <Link
                    key={notif.id}
                    to={notif.link || "/citizen/appointments"}
                    onClick={() => handleItemClick(notif)}
                    style={{
                      display: "flex",
                      gap: "12px",
                      padding: "10px 16px",
                      textDecoration: "none",
                      backgroundColor: notif.read ? "transparent" : "rgba(56, 189, 248, 0.08)",
                      borderBottom: "1px solid #1e293b",
                      transition: "background 0.2s",
                    }}
                  >
                    <span style={{ fontSize: "1.3rem", marginTop: "2px" }}>{icon}</span>
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontSize: "0.85rem",
                          fontWeight: notif.read ? 600 : 700,
                          color: notif.read ? "#cbd5e1" : "#ffffff",
                          marginBottom: "2px",
                        }}
                      >
                        {notif.title}
                      </div>
                      <div style={{ fontSize: "0.8rem", color: "#94a3b8", lineHeight: 1.4 }}>
                        {notif.message}
                      </div>
                      <div style={{ fontSize: "0.7rem", color: "#64748b", marginTop: "4px" }}>
                        {formatRelativeTime(notif.createdAt)}
                      </div>
                    </div>
                    {!notif.read && (
                      <span
                        style={{
                          width: "8px",
                          height: "8px",
                          backgroundColor: "#38bdf8",
                          borderRadius: "50%",
                          marginTop: "6px",
                        }}
                      />
                    )}
                  </Link>
                );
              })
            )}
          </div>

          <div
            style={{
              padding: "10px 16px",
              borderTop: "1px solid #1e293b",
              backgroundColor: "#0b1329",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Link
              to="/citizen/appointments"
              onClick={() => setOpen(false)}
              style={{ fontSize: "0.8rem", color: "#cbd5e1", textDecoration: "none", fontWeight: 600 }}
            >
              View Queue
            </Link>
            {onOpenPreferences && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onOpenPreferences();
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#38bdf8",
                  fontSize: "0.8rem",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                ⚙️ Preferences
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
