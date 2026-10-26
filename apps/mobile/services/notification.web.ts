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

  await sendSystemNotification(title, body);
}

export async function sendFavoriteOnlineNotification(
  name: string,
  username: string
): Promise<void> {
  const title = `⭐ ${name} is online!`;
  const body = `@${username} just came online. Tap to start chatting!`;

  await sendSystemNotification(title, body);
}

export async function sendChugliInvitationNotification(
  senderName: string,
  groupName: string,
  isChugli = true
): Promise<void> {
  const title = isChugli ? `🤫 Chugli Invitation!` : `📩 Group Invitation!`;
  const body = isChugli
    ? `${senderName} invited you to secret Chugli room "${groupName}". Join before session ends!`
    : `${senderName} invited you to join the group "${groupName}".`;

  await sendSystemNotification(title, body);
}

export async function sendFriendRequestNotification(
  senderName: string,
  senderUsername: string
): Promise<void> {
  const title = `👋 New Friend Request!`;
  const body = `${senderName} (@${senderUsername}) sent you a friend request. Tap to respond!`;

  await sendSystemNotification(title, body);
}

export async function sendSystemNotification(
  title: string,
  body: string
): Promise<void> {
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
