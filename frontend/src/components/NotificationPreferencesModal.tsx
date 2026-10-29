import { useEffect, useState, type FormEvent } from "react";
import {
  getNotificationPreferences,
  registerPushSubscription,
  updateNotificationPreferences,
  type NotificationPreferences,
} from "../api/notifications";

const REMINDER_OPTIONS = [
  { minutes: 1440, label: "24 hours before" },
  { minutes: 60, label: "1 hour before" },
  { minutes: 30, label: "30 minutes before" },
  { minutes: 15, label: "15 minutes before" },
];

export default function NotificationPreferencesModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [pushStatus, setPushStatus] = useState<string>("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setSaveSuccess(false);
      getNotificationPreferences()
        .then((data) => {
          if (data) {
            setPrefs(data);
            setPhone(data.phoneNumber || "");
          }
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const toggleInterval = (minutes: number) => {
    if (!prefs) return;
    const current = new Set(prefs.reminderIntervals);
    if (current.has(minutes)) {
      current.delete(minutes);
    } else {
      current.add(minutes);
    }
    setPrefs({ ...prefs, reminderIntervals: Array.from(current) });
  };

  const handleEnablePush = async () => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setPushStatus("Push notifications are not supported in this browser.");
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushStatus("Permission denied. Enable notifications in your browser settings.");
        return;
      }

      setPushStatus("Registering service worker push subscription...");
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      // In demo/production:
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // Standard placeholder applicationServerKey or VAPID key
        applicationServerKey: "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U",
      });

      const success = await registerPushSubscription(sub.toJSON());
      if (success) {
        setPushStatus("✅ Push notifications enabled successfully!");
        if (prefs) setPrefs({ ...prefs, pushEnabled: true });
      } else {
        setPushStatus("Failed to store push subscription on server.");
      }
    } catch (err) {
      setPushStatus(
        err instanceof Error ? `Push error: ${err.message}` : "Push registration error",
      );
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!prefs) return;
    setSaving(true);
    setSaveSuccess(false);

    try {
      const updated = await updateNotificationPreferences({
        ...prefs,
        phoneNumber: phone.trim() || null,
      });
      if (updated) {
        setPrefs(updated);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
        padding: "16px",
      }}
    >
      <div
        style={{
          backgroundColor: "#0f172a",
          border: "1px solid #334155",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "540px",
          maxHeight: "90vh",
          overflowY: "auto",
          padding: "24px",
          color: "#f8fafc",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h2 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 700, color: "#ffffff" }}>
            ⚙️ Notification Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#94a3b8",
              fontSize: "1.3rem",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        {loading || !prefs ? (
          <div style={{ padding: "32px", textAlign: "center", color: "#94a3b8" }}>
            Loading notification preferences...
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {/* 1. Appointment Reminder Intervals */}
            <div style={{ marginBottom: "20px" }}>
              <h3 style={{ fontSize: "1rem", color: "#38bdf8", marginBottom: "8px" }}>
                1. Appointment Reminders
              </h3>
              <p style={{ fontSize: "0.8rem", color: "#94a3b8", margin: "0 0 10px" }}>
                Choose when you want reminders before your scheduled outpatient visits:
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                {REMINDER_OPTIONS.map((opt) => {
                  const checked = prefs.reminderIntervals.includes(opt.minutes);
                  return (
                    <label
                      key={opt.minutes}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "8px 12px",
                        backgroundColor: checked ? "#1e293b" : "#0b1329",
                        border: checked ? "1px solid #38bdf8" : "1px solid #334155",
                        borderRadius: "8px",
                        cursor: "pointer",
                        fontSize: "0.85rem",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleInterval(opt.minutes)}
                      />
                      <span>{opt.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* 2. Delivery Channels */}
            <div style={{ marginBottom: "20px" }}>
              <h3 style={{ fontSize: "1rem", color: "#38bdf8", marginBottom: "8px" }}>
                2. Delivery Channels
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.85rem" }}>
                  <span>In-App Notifications (Header Bell)</span>
                  <input
                    type="checkbox"
                    checked={prefs.inAppEnabled}
                    onChange={(e) => setPrefs({ ...prefs, inAppEnabled: e.target.checked })}
                  />
                </label>

                <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.85rem" }}>
                  <span>Email Notifications</span>
                  <input
                    type="checkbox"
                    checked={prefs.emailEnabled}
                    onChange={(e) => setPrefs({ ...prefs, emailEnabled: e.target.checked })}
                  />
                </label>

                <div style={{ borderTop: "1px solid #1e293b", paddingTop: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.85rem" }}>
                    <span>Web Push / Mobile Notifications</span>
                    <button
                      type="button"
                      onClick={handleEnablePush}
                      style={{
                        padding: "4px 10px",
                        backgroundColor: "#38bdf8",
                        color: "#0b1329",
                        border: "none",
                        borderRadius: "6px",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Enable Push
                    </button>
                  </div>
                  {pushStatus && (
                    <p style={{ margin: "4px 0 0", fontSize: "0.75rem", color: "#38bdf8" }}>{pushStatus}</p>
                  )}
                </div>

                <div style={{ borderTop: "1px solid #1e293b", paddingTop: "8px" }}>
                  <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "6px" }}>
                    <span>SMS Alerts (India Telecom)</span>
                    <input
                      type="checkbox"
                      checked={prefs.smsEnabled}
                      onChange={(e) => setPrefs({ ...prefs, smsEnabled: e.target.checked })}
                    />
                  </label>
                  {prefs.smsEnabled && (
                    <div>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="10-digit mobile number (+91...)"
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          backgroundColor: "#0b1329",
                          border: "1px solid #334155",
                          borderRadius: "6px",
                          color: "#ffffff",
                          fontSize: "0.85rem",
                          boxSizing: "border-box",
                        }}
                      />
                      <p style={{ fontSize: "0.7rem", color: "#94a3b8", margin: "4px 0 0" }}>
                        Note: SMS delivery requires verified provider credentials & TRAI DLT approved template headers.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 3. Live Queue Alerts */}
            <div style={{ marginBottom: "20px" }}>
              <h3 style={{ fontSize: "1rem", color: "#38bdf8", marginBottom: "8px" }}>
                3. Live Queue Alerts
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.85rem" }}>
                <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span>Approaching turn alerts (2 patients ahead)</span>
                  <input
                    type="checkbox"
                    checked={prefs.notifyApproachingTurn}
                    onChange={(e) => setPrefs({ ...prefs, notifyApproachingTurn: e.target.checked })}
                  />
                </label>
                <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span>Clinic delay & pause updates</span>
                  <input
                    type="checkbox"
                    checked={prefs.notifyDelay}
                    onChange={(e) => setPrefs({ ...prefs, notifyDelay: e.target.checked })}
                  />
                </label>
                <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span>Appointment reschedule & cancellation alerts</span>
                  <input
                    type="checkbox"
                    checked={prefs.notifyAppointmentChanges}
                    onChange={(e) => setPrefs({ ...prefs, notifyAppointmentChanges: e.target.checked })}
                  />
                </label>
              </div>
            </div>

            {saveSuccess && (
              <div
                style={{
                  padding: "8px 12px",
                  backgroundColor: "rgba(34, 197, 94, 0.15)",
                  border: "1px solid #22c55e",
                  borderRadius: "6px",
                  color: "#4ade80",
                  fontSize: "0.85rem",
                  marginBottom: "12px",
                }}
              >
                ✅ Notification preferences saved!
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: "8px 16px",
                  backgroundColor: "transparent",
                  border: "1px solid #334155",
                  borderRadius: "6px",
                  color: "#cbd5e1",
                  fontSize: "0.85rem",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
              <button
                type="submit"
                disabled={saving}
                style={{
                  padding: "8px 20px",
                  backgroundColor: "#38bdf8",
                  color: "#0b1329",
                  border: "none",
                  borderRadius: "6px",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {saving ? "Saving..." : "Save Preferences"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
