/* Pulse AI - Web Push Service Worker */

self.addEventListener("push", (event) => {
  if (!event.data) return;

  try {
    const payload = event.data.json();
    const title = payload.title || "Pulse AI Notification";
    const options = {
      body: payload.body || "You have an update from Pulse AI.",
      icon: payload.icon || "/favicon.ico",
      badge: payload.badge || "/favicon.ico",
      tag: payload.tag || "pulse-ai-queue",
      data: {
        url: payload.url || "/citizen/appointments",
        ...payload.data,
      },
      requireInteraction: true,
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    const text = event.data.text();
    event.waitUntil(
      self.registration.showNotification("Pulse AI", {
        body: text,
        icon: "/favicon.ico",
        data: { url: "/citizen/appointments" },
      }),
    );
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/citizen/appointments";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    }),
  );
});
