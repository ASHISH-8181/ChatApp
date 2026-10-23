export async function requestNotificationPermission(): Promise<boolean> {
  try {
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "granted") return true;
      if (Notification.permission !== "denied") {
        const res = await Notification.requestPermission();
        return res === "granted";
      }
    }
    return false;
  } catch (error) {
    console.warn("[Notifications Web] Permission request error:", error);
    return false;
  }
}

export async function sendChugliWarningNotification(
  groupName: string,
  remainingMinutes: number
): Promise<void> {
  const title = `⚠️ Chugli Ending in ${remainingMinutes}m!`;
  const body = `Session for "${groupName}" is about to expire. Extend now or the group and all messages will self-destruct!`;

  try {
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "granted") {
        new Notification(title, {
          body,
          icon: "/favicon.ico",
        });
      }
    }
  } catch (error) {
    console.warn("[Notifications Web] Failed to present notification:", error);
  }
}
