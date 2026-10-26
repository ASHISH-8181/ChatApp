import { Platform } from "react-native";

let Notifications: any = null;
if (Platform.OS !== "web") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Notifications = require("expo-notifications");
    if (Notifications?.setNotificationHandler) {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
    }
  } catch (e: any) {
    if (!e?.message?.includes("ExpoTopicSubscriptionModule")) {
      console.log("[Notifications] Native module load note:", e);
    }
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  try {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && "Notification" in window) {
        if (Notification.permission === "granted") return true;
        if (Notification.permission !== "denied") {
          const res = await Notification.requestPermission();
          return res === "granted";
        }
      }
      return false;
    }

    if (!Notifications) return false;

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    return finalStatus === "granted";
  } catch (error) {
    console.warn("[Notifications] Permission request error:", error);
    return false;
  }
}

export async function sendChugliWarningNotification(
  groupName: string,
  remainingMinutes: number
): Promise<void> {
  const title = `⚠️ Chugli Ending in ${remainingMinutes}m!`;
  const body = `Session for "${groupName}" is about to expire. Extend now or the group and all messages will self-destruct!`;

  await sendSystemNotification(title, body, {
    type: "chugli_warning",
    groupName,
    remainingMinutes,
  });
}

export async function sendFavoriteOnlineNotification(
  name: string,
  username: string
): Promise<void> {
  const title = `⭐ ${name} is online!`;
  const body = `@${username} just came online. Tap to start chatting!`;

  await sendSystemNotification(title, body, {
    type: "favorite_online",
    name,
    username,
  });
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

  await sendSystemNotification(title, body, {
    type: "group_invitation",
    groupName,
    isChugli,
  });
}

export async function sendFriendRequestNotification(
  senderName: string,
  senderUsername: string
): Promise<void> {
  const title = `👋 New Friend Request!`;
  const body = `${senderName} (@${senderUsername}) sent you a friend request. Tap to respond!`;

  await sendSystemNotification(title, body, {
    type: "friend_request",
    senderUsername,
  });
}

export async function sendSystemNotification(
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<void> {
  try {
    // 1. Web Notification
    if (Platform.OS === "web" && typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "granted") {
        new Notification(title, {
          body,
          icon: "/favicon.ico",
        });
        return;
      }
    }

    // 2. Native Expo Local Notification
    if (Notifications?.scheduleNotificationAsync) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: true,
          priority: Notifications.AndroidNotificationPriority?.HIGH,
          data: data || {},
        },
        trigger: null,
      });
    }
  } catch (error) {
    console.warn("[Notifications] Failed to present notification:", error);
  }
}
