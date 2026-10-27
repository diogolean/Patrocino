self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }
  const title = typeof payload.title === "string" && payload.title ? payload.title : "Patrocino";
  const body = typeof payload.body === "string" ? payload.body : "";
  const iconPath = typeof payload.icon === "string" && payload.icon ? payload.icon : "/icons/icon-192.png";
  const icon = new URL(iconPath, self.location.origin).href;
  const url = typeof payload.url === "string" && payload.url.startsWith("/") ? payload.url : "/chat";
  const tag = typeof payload.tag === "string" && payload.tag ? payload.tag : "chat";
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge: icon,
      tag,
      renotify: true,
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = event.notification.data && event.notification.data.url ? event.notification.data.url : "/chat";
  const target = new URL(path, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      for (const client of clients) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        if (typeof client.navigate === "function") {
          try {
            await client.navigate(target);
          } catch {
            // The focused window still opens the conversation on the next click.
          }
        }
        return client.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
