import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@/components/Icon";
import { Fonts } from "@/constants/theme";
import { useTheme } from "@/store/theme-context";
import { useUser } from "@/store/user-context";
import { socketService } from "@/services/socket";
import type { FriendRequestInfo, GroupInvitationInfo } from "@chatapp/shared";

interface NotificationBannerData {
  id: string;
  type: "friend_request" | "group_invitation";
  title: string;
  subtitle: string;
  isChugli?: boolean;
  groupId?: string;
  senderName?: string;
}

export function GlobalNotificationToast() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { currentUser } = useUser();

  const [activeBanner, setActiveBanner] = useState<NotificationBannerData | null>(null);
  const [slideAnim] = useState(() => new Animated.Value(-160));
  const dismissTimerRef = useRef<any>(null);

  const dismissBanner = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
    }
    Animated.timing(slideAnim, {
      toValue: -160,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      setActiveBanner(null);
    });
  }, [slideAnim]);

  const showBanner = useCallback((data: NotificationBannerData) => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
    }
    setActiveBanner(data);

    Animated.spring(slideAnim, {
      toValue: 0,
      damping: 18,
      stiffness: 180,
      useNativeDriver: true,
    }).start();

    dismissTimerRef.current = setTimeout(() => {
      dismissBanner();
    }, 6000);
  }, [slideAnim, dismissBanner]);

  useEffect(() => {
    if (!currentUser) return;

    // 1. Listen for incoming friend requests
    const unsubFriendReq = socketService.subscribeToFriendRequests((req: FriendRequestInfo) => {
      if (req.receiverId === currentUser.id) {
        const sender = req.sender?.name || "Someone";
        const username = req.sender?.username ? `@${req.sender.username}` : "";
        showBanner({
          id: req.id,
          type: "friend_request",
          title: `👋 Friend Request from ${sender}`,
          subtitle: `${username} sent you a friend request. Tap to respond!`,
        });
      }
    });

    // 2. Listen for incoming group and Chugli invitations
    const unsubInvitation = socketService.subscribeToInvitations((inv: GroupInvitationInfo) => {
      const targetUserId = (inv as any).userId || (inv as any).invitedUserId;
      if (!targetUserId || targetUserId === currentUser.id) {
        const isChugli = Boolean(inv.isChugli);
        const sender = inv.senderName || "A teammate";
        showBanner({
          id: inv.id,
          type: "group_invitation",
          isChugli,
          groupId: inv.groupId,
          senderName: sender,
          title: isChugli
            ? `🤫 Secret Chugli Invitation: #${inv.groupName}`
            : `📩 Group Invitation: #${inv.groupName}`,
          subtitle: isChugli
            ? `${sender} invited you to secret room #${inv.groupName}. Tap to enter anonymously!`
            : `${sender} invited you to join #${inv.groupName}. Tap to view!`,
        });
      }
    });

    return () => {
      unsubFriendReq();
      unsubInvitation();
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
      }
    };
  }, [currentUser, showBanner]);

  if (!activeBanner) return null;

  const handleBannerPress = () => {
    const banner = activeBanner;
    dismissBanner();

    if (banner.type === "friend_request") {
      router.push({
        pathname: "/(tabs)/chats",
        params: { open: "friendRequests" },
      });
    } else if (banner.type === "group_invitation") {
      router.push({
        pathname: "/(tabs)/groups",
        params: {
          groupId: banner.groupId,
          isChugli: banner.isChugli ? "1" : "0",
          openInviteId: banner.id,
        },
      });
    }
  };

  const topInset = Math.max(insets.top, Platform.OS === "android" ? 16 : 10);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          top: topInset + 6,
          transform: [{ translateY: slideAnim }],
        },
      ]}
      pointerEvents="box-none"
    >
      <TouchableOpacity
        style={[
          styles.toastCard,
          {
            backgroundColor: isDark ? "#1E293B" : "#FFFFFF",
            borderColor: activeBanner.isChugli
              ? "#8B5CF6"
              : activeBanner.type === "friend_request"
              ? "#3B82F6"
              : colors.border,
            shadowColor: activeBanner.isChugli ? "#8B5CF6" : "#0F172A",
          },
        ]}
        activeOpacity={0.88}
        onPress={handleBannerPress}
      >
        <View
          style={[
            styles.iconBox,
            {
              backgroundColor: activeBanner.isChugli
                ? "rgba(139, 92, 246, 0.15)"
                : activeBanner.type === "friend_request"
                ? "rgba(59, 130, 246, 0.15)"
                : "rgba(16, 185, 129, 0.15)",
            },
          ]}
        >
          {activeBanner.isChugli ? (
            <Text style={{ fontSize: 18 }}>🤫</Text>
          ) : activeBanner.type === "friend_request" ? (
            <Ionicons name="person-add" size={18} color="#3B82F6" />
          ) : (
            <Ionicons name="mail" size={18} color="#10B981" />
          )}
        </View>

        <View style={styles.textWrap}>
          <Text
            style={[
              styles.title,
              { color: isDark ? "#F8FAFC" : "#0F172A", fontFamily: Fonts.bold },
            ]}
            numberOfLines={1}
          >
            {activeBanner.title}
          </Text>
          <Text
            style={[
              styles.subtitle,
              { color: isDark ? "#94A3B8" : "#64748B", fontFamily: Fonts.bodyRegular },
            ]}
            numberOfLines={2}
          >
            {activeBanner.subtitle}
          </Text>
        </View>

        <View style={styles.rightAction}>
          <View
            style={[
              styles.openBadge,
              {
                backgroundColor: activeBanner.isChugli
                  ? "#7C3AED"
                  : activeBanner.type === "friend_request"
                  ? "#2563EB"
                  : "#16A34A",
              },
            ]}
          >
            <Text style={styles.openBadgeText}>Open</Text>
          </View>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={(e) => {
              e.stopPropagation();
              dismissBanner();
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={16} color={isDark ? "#94A3B8" : "#64748B"} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 14,
    right: 14,
    zIndex: 99999,
  },
  toastCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    gap: 10,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 10,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
  },
  textWrap: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 13,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 11,
    lineHeight: 15,
  },
  rightAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  openBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
  },
  openBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontFamily: Fonts.bold,
  },
  closeBtn: {
    padding: 3,
  },
});
