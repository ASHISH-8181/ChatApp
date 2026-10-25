import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ChatMessage, ChatUser, FriendRequestInfo, FriendshipStatus } from "@chatapp/shared";
import { useUser } from "@/store/user-context";
import { socketService, type ConnectionStatus } from "@/services/socket";
import {
  fetchMessageHistory,
  fetchAllUsers,
  fetchBlockedUsersApi,
  uploadImageApi,
  fetchFavoriteUserIdsApi,
  toggleFavoriteUserApi,
  clearChatApi,
  fetchUserFriendsApi,
  fetchFriendshipStatusApi,
  fetchContactAliasesApi,
  setContactAliasApi,
  deleteContactAliasApi,
} from "@/services/api";
import { mobileCache } from "@/services/cache";
import {
  requestNotificationPermission,
  sendFavoriteOnlineNotification,
} from "@/services/notification";
import { ChatBubble } from "@/components/ChatBubble";
import { ChatInput } from "@/components/ChatInput";
import { PhotoPickerModal } from "@/components/PhotoPickerModal";
import { ViewOncePhotoModal } from "@/components/ViewOncePhotoModal";
import { ImageViewerModal } from "@/components/ImageViewerModal";
import { FloatingEmojiBurst } from "@/components/FloatingEmojiBurst";
import { ConnectionBadge } from "@/components/ConnectionBadge";
import { LockNavButton } from "@/components/LockNavButton";
import { UserAvatar } from "@/components/UserAvatar";
import { EmptyState } from "@/components/EmptyState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { Ionicons } from "@/components/Icon";
import { Fonts, Colors } from "@/constants/theme";
import { ThemeNavButton } from "@/components/ThemeNavButton";
import { useTheme } from "@/store/theme-context";

// Curated avatar palettes for rich visual identity
const AVATAR_PALETTES = [
  { bg: "#3B82F6", light: "#EFF6FF", text: "#FFFFFF" }, // Blue
  { bg: "#8B5CF6", light: "#F5F3FF", text: "#FFFFFF" }, // Purple
  { bg: "#EC4899", light: "#FDF2F8", text: "#FFFFFF" }, // Pink
  { bg: "#F97316", light: "#FFF7ED", text: "#FFFFFF" }, // Orange
  { bg: "#10B981", light: "#ECFDF5", text: "#FFFFFF" }, // Emerald
  { bg: "#06B6D4", light: "#ECFEFF", text: "#FFFFFF" }, // Cyan
  { bg: "#6366F1", light: "#EEF2FF", text: "#FFFFFF" }, // Indigo
  { bg: "#14B8A6", light: "#F0FDFA", text: "#FFFFFF" }, // Teal
];

function getAvatarPalette(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_PALETTES[Math.abs(hash) % AVATAR_PALETTES.length];
}

function createTempPhotoMessageId(): string {
  return `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// Breathing pulsing online presence badge
function PulsingOnlineDot({ size = 12, isOnline }: { size?: number; isOnline: boolean }) {
  const [pulseAnim] = useState(() => new Animated.Value(1));
  const [opacityAnim] = useState(() => new Animated.Value(0.7));


  useEffect(() => {
    if (!isOnline) {
      pulseAnim.setValue(1);
      opacityAnim.setValue(0);
      return;
    }

    const animation = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.8,
            duration: 1600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(opacityAnim, {
            toValue: 0,
            duration: 1600,
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 0.7,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      ])
    );

    animation.start();
    return () => animation.stop();
  }, [isOnline, pulseAnim, opacityAnim]);

  if (!isOnline) {
    return <View style={[styles.presenceDotOffline, { width: size, height: size, borderRadius: size / 2 }]} />;
  }

  return (
    <View style={[styles.presenceContainer, { width: size, height: size }]}>
      <Animated.View
        style={[
          styles.presencePulseRing,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            transform: [{ scale: pulseAnim }],
            opacity: opacityAnim,
          },
        ]}
      />
      <View style={[styles.presenceDotOnline, { width: size, height: size, borderRadius: size / 2 }]} />
    </View>
  );
}

export default function ChatsTabScreen() {
  const { currentUser, registeredUsers, setRegisteredUsers } = useUser();
  const { colors, isDark } = useTheme();

  // All messages store: hydrate immediately from fast memory cache if available
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (currentUser) {
      return mobileCache.getSyncMessages(currentUser.id) || [];
    }
    return [];
  });
  const [loadingHistory, setLoadingHistory] = useState(() => {
    if (currentUser) {
      const cached = mobileCache.getSyncMessages(currentUser.id);
      return !cached || cached.length === 0;
    }
    return true;
  });
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
  const [bannerError, setBannerError] = useState<string | null>(null);

  // Active Personal 1-on-1 Contact (null = show direct chats list)
  const [activeContact, setActiveContact] = useState<ChatUser | null>(null);
  const activeContactRef = useRef<ChatUser | null>(activeContact);
  useEffect(() => {
    activeContactRef.current = activeContact;
  }, [activeContact]);

  // Blocked users state
  const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);
  const [showBlockModal, setShowBlockModal] = useState(false);

  // Favorite persons state
  const [favoriteUserIds, setFavoriteUserIds] = useState<string[]>([]);
  const [favoriteModalUser, setFavoriteModalUser] = useState<ChatUser | null>(null);
  const [favoriteActionLoading, setFavoriteActionLoading] = useState(false);
  const [favoriteToast, setFavoriteToast] = useState<{
    user: { id: string; name: string; username: string };
  } | null>(null);

  const [toastAnim] = useState(() => new Animated.Value(-140));
  const toastTimerRef = useRef<any>(null);
  const prevOnlineUserIdsRef = useRef<string[]>([]);
  const notifiedFavoriteIdsRef = useRef<Map<string, number>>(new Map());

  const dismissFavoriteToast = useCallback(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    Animated.timing(toastAnim, {
      toValue: -140,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setFavoriteToast(null);
    });
  }, [toastAnim]);

  const triggerFavoriteToast = useCallback(
    (user: { id: string; name: string; username: string }) => {
      setFavoriteToast({ user });
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);

      toastAnim.setValue(-140);
      Animated.spring(toastAnim, {
        toValue: Platform.OS === "ios" ? 54 : 20,
        useNativeDriver: true,
        tension: 80,
        friction: 10,
      }).start();

      toastTimerRef.current = setTimeout(() => {
        dismissFavoriteToast();
      }, 5000);
    },
    [toastAnim, dismissFavoriteToast]
  );

  // 3-dots Chat Options, Clear Chat & Unfriend state
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);
  const [isClearingChat, setIsClearingChat] = useState(false);
  const [showUnfriendConfirmModal, setShowUnfriendConfirmModal] = useState(false);
  const [isUnfriending, setIsUnfriending] = useState(false);

  // Live Hindi Translation state for active chat
  const [liveTranslateHindi, setLiveTranslateHindi] = useState(false);

  // Floating Emoji burst state (plays once when first seen)
  const [floatingEmoji, setFloatingEmoji] = useState<string | null>(null);
  const seenAnimatedMessageIdsRef = useRef<Set<string>>(new Set());

  const triggerEmojiBurstIfNew = useCallback((msg: ChatMessage) => {
    if (!msg || !msg.text || !msg.id) return;
    if (seenAnimatedMessageIdsRef.current.has(msg.id)) return;
    seenAnimatedMessageIdsRef.current.add(msg.id);

    // Regex to match emojis
    const emojiRegex = /(\p{Extended_Pictographic}|\p{Emoji_Presentation})/gu;
    const matches = msg.text.match(emojiRegex);
    if (matches && matches.length > 0 && msg.text.trim().length <= 32) {
      setFloatingEmoji(matches[0]);
    }
  }, []);

  // Map contactId -> latest message timestamp (in ms) for recency ordering
  const contactLatestMsgTimeMap = useMemo(() => {
    if (!currentUser) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const m of messages) {
      if (m.deletedForUserIds?.includes(currentUser.id)) continue;
      let otherId: string | null = null;
      if (m.senderId === currentUser.id && m.recipientId) {
        otherId = m.recipientId;
      } else if (m.recipientId === currentUser.id && m.senderId) {
        otherId = m.senderId;
      }
      if (otherId) {
        const time = new Date(m.createdAt).getTime();
        const prev = map.get(otherId) || 0;
        if (time > prev) {
          map.set(otherId, time);
        }
      }
    }
    return map;
  }, [messages, currentUser]);

  // Friendship state
  const [friendIds, setFriendIds] = useState<string[]>([]);
  const [incomingFriendRequests, setIncomingFriendRequests] = useState<FriendRequestInfo[]>([]);
  const [outgoingFriendRequests, setOutgoingFriendRequests] = useState<FriendRequestInfo[]>([]);
  const [activeFriendshipStatus, setActiveFriendshipStatus] = useState<FriendshipStatus>("none");
  const [activeFriendRequestId, setActiveFriendRequestId] = useState<string | null>(null);
  const [friendActionLoading, setFriendActionLoading] = useState(false);
  const [showAddFriendModal, setShowAddFriendModal] = useState(false);
  const [addFriendUsername, setAddFriendUsername] = useState("");
  const [addFriendSubmitting, setAddFriendSubmitting] = useState(false);
  const [addFriendError, setAddFriendError] = useState<string | null>(null);
  const [addFriendSuccess, setAddFriendSuccess] = useState<string | null>(null);

  // Contact list search and filter: 'all' | 'friends' | 'online' | 'favorites' | 'ignored'
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "friends" | "online" | "favorites" | "ignored">("all");

  // Private Contact Aliases (Custom Nicknames visible only to current user)
  const [contactAliases, setContactAliases] = useState<Record<string, string>>({});
  const [renameContactUser, setRenameContactUser] = useState<ChatUser | null>(null);
  const [newCustomName, setNewCustomName] = useState("");
  const [isSavingAlias, setIsSavingAlias] = useState(false);
  const [aliasError, setAliasError] = useState<string | null>(null);

  // View Once & Photo Sharing state
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const [activeViewOnce, setActiveViewOnce] = useState<{ url: string; senderName: string } | null>(null);
  const [expandedImage, setExpandedImage] = useState<{ url: string; caption?: string } | null>(null);

  const flatListRef = useRef<FlatList<ChatMessage>>(null);

  // Guard: if no user set, redirect back to entry screen
  useEffect(() => {
    if (!currentUser) {
      router.replace("/");
    }
  }, [currentUser]);

  // Connect and load users, messages, & blocked list
  useEffect(() => {
    if (!currentUser) return;

    let isMounted = true;

    // Request notification permission on platforms that support it
    requestNotificationPermission().catch(() => {});

    // 1. Instantly populate from local persistent cache (0ms instant UI rendering)
    Promise.all([
      mobileCache.getCachedMessages(currentUser.id),
      mobileCache.getCachedUsers(),
      mobileCache.getCachedBlocked(currentUser.id),
      mobileCache.getCachedFavorites(currentUser.id),
      mobileCache.getCachedFriends(currentUser.id),
      mobileCache.getCachedAliases(currentUser.id),
    ]).then(([cachedMessages, cachedUsers, cachedBlocked, cachedFavs, cachedFriends, cachedAliases]) => {
      if (!isMounted) return;
      if (cachedMessages && cachedMessages.length > 0) {
        cachedMessages.forEach((m) => seenAnimatedMessageIdsRef.current.add(m.id));
        setMessages(cachedMessages);
        setLoadingHistory(false);
      }
      if (cachedUsers && cachedUsers.length > 0) {
        setRegisteredUsers(cachedUsers);
      }
      if (cachedBlocked) {
        setBlockedUserIds(cachedBlocked.blockedUserIds || []);
      }
      if (cachedFavs) {
        setFavoriteUserIds(cachedFavs);
      }
      if (cachedFriends) {
        setFriendIds(cachedFriends.friendIds || []);
        setIncomingFriendRequests(cachedFriends.incomingRequests || []);
        setOutgoingFriendRequests(cachedFriends.outgoingRequests || []);
      }
      if (cachedAliases) {
        setContactAliases((prev) => ({ ...cachedAliases, ...prev }));
      }
    });

    // 2. Fetch latest data from server in background (Stale-While-Revalidate)
    Promise.all([
      fetchMessageHistory({ currentUserId: currentUser.id }),
      fetchAllUsers(),
      fetchBlockedUsersApi(currentUser.id).catch(() => ({ blockedUsers: [], blockedUserIds: [] })),
      fetchFavoriteUserIdsApi(currentUser.id).catch(() => []),
      fetchUserFriendsApi(currentUser.id).catch(() => ({
        friends: [],
        friendIds: [],
        incomingRequests: [],
        outgoingRequests: [],
      })),
    ])
      .then(([history, users, blockedData, favIds, friendsData]) => {
        if (isMounted) {
          history.forEach((m) => seenAnimatedMessageIdsRef.current.add(m.id));
          setMessages(history);
          setRegisteredUsers(users);
          setBlockedUserIds(blockedData.blockedUserIds || []);
          setFavoriteUserIds(favIds || []);
          setFriendIds(friendsData.friendIds || []);
          setIncomingFriendRequests(friendsData.incomingRequests || []);
          setOutgoingFriendRequests(friendsData.outgoingRequests || []);
          setLoadingHistory(false);

          // Update cache for instantaneous subsequent launches
          mobileCache.setCachedMessages(currentUser.id, history);
          mobileCache.setCachedUsers(users);
          mobileCache.setCachedBlocked(currentUser.id, blockedData);
          mobileCache.setCachedFavorites(currentUser.id, favIds || []);
          mobileCache.setCachedFriends(currentUser.id, friendsData);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.warn("Initial fetch error:", err.message);
          setLoadingHistory(false);
        }
      });

    // 3. Load private contact aliases
    fetchContactAliasesApi(currentUser.id)
      .then((aliases) => {
        if (isMounted && aliases) {
          setContactAliases((prev) => ({ ...prev, ...aliases }));
          mobileCache.setCachedAliases(currentUser.id, aliases);
        }
      })
      .catch((err) => console.warn("Failed to fetch contact aliases:", err));

    // Connect to Socket.IO server
    socketService.connect(currentUser);

    const unsubStatus = socketService.subscribeToStatus((status) => {
      if (!isMounted) return;
      setConnectionStatus(status);
      if (status === "connected") setBannerError(null);
      else if (status === "error") setBannerError("Connection error: Unable to reach chat server.");
    });

    const unsubUsers = socketService.subscribeToUsers((users: ChatUser[]) => {
      if (!isMounted) return;
      setRegisteredUsers(users);
      mobileCache.setCachedUsers(users);
    });

    const unsubPresence = socketService.subscribeToPresence((ids) => {
      if (!isMounted) return;
      setOnlineUserIds(ids);
    });

    const unsubReadReceipts = socketService.subscribeToReadReceipts(({ messageIds, reader }) => {
      if (!isMounted) return;
      setMessages((prev) => {
        const next = prev.map((msg) => {
          if (messageIds.includes(msg.id)) {
            const alreadyHasReader = msg.reads.some((r) => r.userId === reader.userId);
            if (alreadyHasReader) return msg;
            return {
              ...msg,
              reads: [...msg.reads, reader],
            };
          }
          return msg;
        });
        mobileCache.setCachedMessages(currentUser.id, next);
        return next;
      });
    });

    const unsubMessages = socketService.subscribeToMessages((newMsg) => {
      if (!isMounted) return;
      triggerEmojiBurstIfNew(newMsg);
      setMessages((prev) => {
        // If message already exists by id, ignore duplicate
        if (prev.some((m) => m.id === newMsg.id)) return prev;

        // If this matches an optimistic pending message via clientTempId, replace in-place
        if (newMsg.clientTempId) {
          const tempIdx = prev.findIndex((m) => m.id === newMsg.clientTempId);
          if (tempIdx !== -1) {
            const next = [...prev];
            next[tempIdx] = {
              ...newMsg,
              imageUrl: next[tempIdx].imageUrl || newMsg.imageUrl,
              isUploading: false,
            };
            mobileCache.setCachedMessages(currentUser.id, next);
            return next;
          }
        }

        // If sender is current user and we have a pending uploading message, replace it
        if (currentUser && newMsg.senderId === currentUser.id && newMsg.imageUrl) {
          const pendingIdx = prev.findIndex(
            (m) =>
              m.isUploading &&
              m.senderId === newMsg.senderId &&
              m.recipientId === newMsg.recipientId
          );
          if (pendingIdx !== -1) {
            const next = [...prev];
            next[pendingIdx] = {
              ...newMsg,
              imageUrl: next[pendingIdx].imageUrl || newMsg.imageUrl,
              isUploading: false,
            };
            mobileCache.setCachedMessages(currentUser.id, next);
            return next;
          }
        }

        const next = [...prev, newMsg];
        mobileCache.setCachedMessages(currentUser.id, next);
        return next;
      });
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    });

    const unsubDeleted = socketService.subscribeToMessageDeleted((data) => {
      if (!isMounted) return;
      if (data.deleteFor === "me") {
        if (data.deletedByUserId === currentUser.id) {
          setMessages((prev) => {
            const next = prev.filter((m) => m.id !== data.messageId);
            mobileCache.setCachedMessages(currentUser.id, next);
            return next;
          });
        }
      } else {
        setMessages((prev) => {
          const next = prev.map((m) =>
            m.id === data.messageId
              ? {
                  ...m,
                  isDeletedForEveryone: true,
                  deletedByUserId: data.deletedByUserId,
                  deletedByUsername: data.deletedByUsername || "user",
                }
              : m
          );
          mobileCache.setCachedMessages(currentUser.id, next);
          return next;
        });
      }
    });

    const unsubEdited = socketService.subscribeToMessageEdited((data) => {
      if (!isMounted) return;
      setMessages((prev) => {
        const next = prev.map((m) =>
          m.id === data.messageId
            ? { ...m, text: data.text, isEdited: true, editedAt: data.editedAt }
            : m
        );
        mobileCache.setCachedMessages(currentUser.id, next);
        return next;
      });
    });

    const unsubBlocked = socketService.subscribeToUserBlocked((data) => {
      if (!isMounted) return;
      if (data.blockerId === currentUser.id) {
        setBlockedUserIds((prev) => {
          const next = [...new Set([...prev, data.targetUserId])];
          mobileCache.setCachedBlocked(currentUser.id, { blockedUsers: [], blockedUserIds: next });
          return next;
        });
      }
    });

    const unsubUnblocked = socketService.subscribeToUserUnblocked((data) => {
      if (!isMounted) return;
      if (data.blockerId === currentUser.id) {
        setBlockedUserIds((prev) => {
          const next = prev.filter((id) => id !== data.targetUserId);
          mobileCache.setCachedBlocked(currentUser.id, { blockedUsers: [], blockedUserIds: next });
          return next;
        });
      }
    });

    const unsubErrors = socketService.subscribeToErrors((errText) => {
      if (!isMounted) return;
      setBannerError(errText);
    });

    const unsubViewOnce = socketService.subscribeToViewOnceOpened((data) => {
      if (!isMounted) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === data.messageId
            ? {
                ...m,
                isViewed: true,
                imageUrl: undefined,
                viewedAt: data.viewedAt,
                viewedByUserId: data.userId,
              }
            : m
        )
      );
    });

    const unsubFavOnline = socketService.subscribeToFavoriteOnline((data) => {
      if (!isMounted) return;
      const now = Date.now();
      const last = notifiedFavoriteIdsRef.current.get(data.userId) || 0;
      if (now - last < 60000) return;
      notifiedFavoriteIdsRef.current.set(data.userId, now);

      sendFavoriteOnlineNotification(data.name, data.username);
      triggerFavoriteToast({ id: data.userId, name: data.name, username: data.username });
    });

    const unsubFriendReq = socketService.subscribeToFriendRequests((req) => {
      if (!isMounted) return;
      if (req.receiverId === currentUser.id) {
        setIncomingFriendRequests((prev) => [req, ...prev.filter((r) => r.id !== req.id)]);
        if (activeContactRef.current && activeContactRef.current.id === req.senderId) {
          setActiveFriendshipStatus("pending_received");
          setActiveFriendRequestId(req.id);
        }
      }
    });

    const unsubFriendResponded = socketService.subscribeToFriendResponded(({ requestId, status, user }) => {
      if (!isMounted) return;
      setIncomingFriendRequests((prev) => prev.filter((r) => r.id !== requestId));
      if (status === "accepted") {
        setOutgoingFriendRequests((prev) => prev.filter((r) => r.id !== requestId));
        setFriendIds((prev) => Array.from(new Set([...prev, user.id])));
        if (activeContactRef.current && activeContactRef.current.id === user.id) {
          setActiveFriendshipStatus("friends");
        }
      } else if (status === "declined") {
        // Mark outgoing request as declined in state so the user sees "Declined" in Sent Requests tab
        setOutgoingFriendRequests((prev) =>
          prev.map((r) => (r.id === requestId ? { ...r, status: "declined" } : r))
        );
        if (activeContactRef.current && activeContactRef.current.id === user.id) {
          setActiveFriendshipStatus("none");
          setActiveFriendRequestId(null);
        }
      }
    });

    const unsubFriendUnfriended = socketService.subscribeToFriendUnfriended(({ userId, targetUserId }) => {
      if (!isMounted) return;
      const otherId = userId === currentUser.id ? targetUserId : userId;
      setFriendIds((prev) => prev.filter((id) => id !== otherId));
      if (activeContactRef.current && activeContactRef.current.id === otherId) {
        setActiveFriendshipStatus("none");
        setActiveFriendRequestId(null);
      }
      setFavoriteUserIds((prev) => prev.filter((id) => id !== otherId));
      setContactAliases((prev) => {
        if (!prev[otherId]) return prev;
        const next = { ...prev };
        delete next[otherId];
        return next;
      });
    });

    return () => {
      isMounted = false;
      unsubStatus();
      unsubUsers();
      unsubPresence();
      unsubReadReceipts();
      unsubMessages();
      unsubDeleted();
      unsubEdited();
      unsubBlocked();
      unsubUnblocked();
      unsubFavOnline();
      unsubFriendReq();
      unsubFriendResponded();
      unsubFriendUnfriended();
      unsubErrors();
      unsubViewOnce();
    };
  }, [currentUser, setRegisteredUsers, triggerFavoriteToast, triggerEmojiBurstIfNew]);

  // When activeContact is selected, automatically mark unread messages from that contact as read
  // (Privacy rule: if the contact is blocked, never mark as read so they cannot see read status)
  useEffect(() => {
    if (!currentUser || !activeContact || messages.length === 0) return;
    if (blockedUserIds.includes(activeContact.id)) return;

    const unreadFromActiveContact = messages
      .filter(
        (m) =>
          m.senderId === activeContact.id &&
          m.recipientId === currentUser.id &&
          !m.reads.some((r) => r.userId === currentUser.id)
      )
      .map((m) => m.id);

    if (unreadFromActiveContact.length > 0) {
      socketService.markMessagesAsRead(unreadFromActiveContact);
    }
  }, [messages, currentUser, activeContact, blockedUserIds]);

  // Fetch personal 1-on-1 messages and friendship status whenever activeContact changes
  useEffect(() => {
    if (!currentUser || !activeContact) return;

    fetchMessageHistory({
      recipientId: activeContact.id,
      currentUserId: currentUser.id,
    })
      .then((history) => {
        history.forEach((m) => seenAnimatedMessageIdsRef.current.add(m.id));
        setMessages((prev) => {
          const others = prev.filter(
            (m) =>
              !(
                (m.senderId === currentUser.id && m.recipientId === activeContact.id) ||
                (m.senderId === activeContact.id && m.recipientId === currentUser.id)
              )
          );
          const next = [...others, ...history];
          mobileCache.setCachedMessages(currentUser.id, next);
          return next;
        });
      })
      .catch((err) => {
        console.warn("Failed to fetch direct message history:", err);
      });

    // Fetch friendship status between current user and active contact
    fetchFriendshipStatusApi(currentUser.id, activeContact.id)
      .then((res) => {
        setActiveFriendshipStatus(res.status);
        setActiveFriendRequestId(res.requestId || null);
        if (res.isFriend) {
          setFriendIds((prev) => Array.from(new Set([...prev, activeContact.id])));
        }
      })
      .catch((err) => {
        console.warn("Failed to fetch friendship status:", err);
      });
  }, [activeContact, currentUser]);

  // Send Friend Request
  const handleSendFriendRequest = async (targetUsername: string) => {
    if (!currentUser) return;
    const clean = targetUsername.trim().replace(/^@/, "");
    if (!clean) return;

    setFriendActionLoading(true);
    setAddFriendError(null);
    setAddFriendSuccess(null);

    try {
      const res = await socketService.sendFriendRequest(currentUser.id, clean);
      if (res.status === "accepted") {
        setFriendIds((prev) => Array.from(new Set([...prev, res.receiverId, res.senderId])));
        if (activeContact && (activeContact.id === res.receiverId || activeContact.id === res.senderId)) {
          setActiveFriendshipStatus("friends");
        }
        setAddFriendSuccess(`You are now friends with @${clean}!`);
      } else {
        setOutgoingFriendRequests((prev) => [res, ...prev.filter((r) => r.id !== res.id)]);
        if (activeContact && activeContact.username.toLowerCase() === clean.toLowerCase()) {
          setActiveFriendshipStatus("pending_sent");
          setActiveFriendRequestId(res.id);
        }
        setAddFriendSuccess(`Friend request sent to @${clean}!`);
      }
    } catch (err: any) {
      console.warn("Friend request error:", err.message);
      setAddFriendError(err.message || "Failed to send friend request.");
      setBannerError(err.message || "Failed to send friend request.");
    } finally {
      setFriendActionLoading(false);
    }
  };

  // Respond to Friend Request (Accept or Decline)
  const handleRespondFriendRequest = async (requestId: string, action: "accept" | "declined") => {
    if (!currentUser) return;
    setFriendActionLoading(true);

    try {
      const res = await socketService.respondFriendRequest(requestId, currentUser.id, action);
      setIncomingFriendRequests((prev) => prev.filter((r) => r.id !== requestId));

      if (action === "accept") {
        const otherUserId = res.senderId === currentUser.id ? res.receiverId : res.senderId;
        setFriendIds((prev) => Array.from(new Set([...prev, otherUserId])));
        if (activeContact && (activeContact.id === otherUserId || activeContact.id === res.senderId || activeContact.id === res.receiverId)) {
          setActiveFriendshipStatus("friends");
        }
        setBannerError(null);
      } else {
        if (activeContact && (activeContact.id === res.senderId || activeContact.id === res.receiverId)) {
          setActiveFriendshipStatus("none");
          setActiveFriendRequestId(null);
        }
      }
    } catch (err: any) {
      console.warn("Respond friend request error:", err.message);
      setBannerError(err.message || "Failed to respond to friend request.");
    } finally {
      setFriendActionLoading(false);
    }
  };

  // Send Personal 1-on-1 Message
  const handleSendPersonalMessage = async (text: string) => {
    if (!activeContact || !currentUser) return;

    // Single message enforcement for non-friends
    const isFriend = friendIds.includes(activeContact.id);
    if (!isFriend) {
      const sentCount = personalMessages.filter((m) => m.senderId === currentUser.id).length;
      if (sentCount >= 1) {
        setBannerError("You cannot send messages as they are not your friend.");
        return;
      }
    }

    try {
      setBannerError(null);
      // Trigger floating burst immediately for sender if emoji present
      const emojiRegex = /(\p{Extended_Pictographic}|\p{Emoji_Presentation})/gu;
      const matches = text.match(emojiRegex);
      if (matches && matches.length > 0 && text.trim().length <= 32) {
        setFloatingEmoji(matches[0]);
      }
      await socketService.sendMessage(text, { recipientId: activeContact.id });
    } catch (err: any) {
      setBannerError(err.message || "Failed to deliver direct message.");
      throw err;
    }
  };

  // Clear all messages in 1-on-1 chat for the current user
  const handleClearChat = async () => {
    if (!activeContact || !currentUser) return;
    try {
      setIsClearingChat(true);
      await clearChatApi({
        currentUserId: currentUser.id,
        recipientId: activeContact.id,
      });

      // Clear locally for the active conversation
      setMessages((prev) => {
        const next = prev.filter(
          (m) =>
            !(
              (m.senderId === currentUser.id && m.recipientId === activeContact.id) ||
              (m.senderId === activeContact.id && m.recipientId === currentUser.id)
            )
        );
        mobileCache.setCachedMessages(currentUser.id, next);
        return next;
      });

      setShowClearConfirmModal(false);
      setShowOptionsMenu(false);
    } catch (err: any) {
      console.warn("Failed to clear chat:", err);
      setBannerError(err.message || "Failed to clear chat");
    } finally {
      setIsClearingChat(false);
    }
  };

  // Unfriend contact: deletes friendship, removes from friends list, and disables messaging until re-added
  const handleUnfriendContact = async () => {
    if (!activeContact || !currentUser) return;
    try {
      setIsUnfriending(true);
      await socketService.unfriendUser(currentUser.id, activeContact.id);
      setFriendIds((prev) => prev.filter((id) => id !== activeContact.id));
      setActiveFriendshipStatus("none");
      setActiveFriendRequestId(null);
      setFavoriteUserIds((prev) => prev.filter((id) => id !== activeContact.id));
      setContactAliases((prev) => {
        if (!prev[activeContact.id]) return prev;
        const next = { ...prev };
        delete next[activeContact.id];
        return next;
      });
      setShowUnfriendConfirmModal(false);
      setShowOptionsMenu(false);
      setBannerError(null);
    } catch (err: any) {
      console.warn("Failed to unfriend:", err);
      setBannerError(err.message || "Failed to unfriend user");
    } finally {
      setIsUnfriending(false);
    }
  };

  // Save private contact alias (nickname) - Only allowed for friends
  const handleSaveContactAlias = async () => {
    if (!currentUser || !renameContactUser) return;
    if (!friendIds.includes(renameContactUser.id)) {
      setAliasError("You can only rename your friends.");
      return;
    }
    const clean = newCustomName.trim();
    setIsSavingAlias(true);
    setAliasError(null);
    try {
      // Optimistically update local state & persistence
      const updated = { ...contactAliases };
      if (clean) {
        updated[renameContactUser.id] = clean;
      } else {
        delete updated[renameContactUser.id];
      }
      setContactAliases(updated);
      await setStoredItem(`contact_aliases_${currentUser.id}`, JSON.stringify(updated));

      // Sync with socket/backend API
      try {
        await socketService.setContactAlias(currentUser.id, renameContactUser.id, clean);
      } catch {
        await setContactAliasApi(currentUser.id, renameContactUser.id, clean);
      }

      setRenameContactUser(null);
      setNewCustomName("");
    } catch (err: any) {
      console.warn("Failed to set contact alias:", err);
      setAliasError(err.message || "Failed to update nickname");
    } finally {
      setIsSavingAlias(false);
    }
  };

  // Reset private contact alias to original name
  const handleResetContactAlias = async () => {
    if (!currentUser || !renameContactUser) return;
    setIsSavingAlias(true);
    setAliasError(null);
    try {
      const updated = { ...contactAliases };
      delete updated[renameContactUser.id];
      setContactAliases(updated);
      await setStoredItem(`contact_aliases_${currentUser.id}`, JSON.stringify(updated));

      try {
        await socketService.setContactAlias(currentUser.id, renameContactUser.id, "");
      } catch {
        await deleteContactAliasApi(currentUser.id, renameContactUser.id);
      }

      setRenameContactUser(null);
      setNewCustomName("");
    } catch (err: any) {
      console.warn("Failed to reset contact alias:", err);
      setAliasError(err.message || "Failed to reset name");
    } finally {
      setIsSavingAlias(false);
    }
  };

  // Send Personal Photo Message (Background Upload with Immediate Optimistic Display)
  const handleSendPersonalPhoto = async (data: {
    localUri: string;
    base64?: string | null;
    isViewOnce: boolean;
    caption: string;
  }) => {
    if (!activeContact || !currentUser) return;

    // Single message enforcement for non-friends
    const isFriend = friendIds.includes(activeContact.id);
    if (!isFriend) {
      const sentCount = personalMessages.filter((m) => m.senderId === currentUser.id).length;
      if (sentCount >= 1) {
        setBannerError("You cannot send messages as they are not your friend.");
        return;
      }
    }

    const tempId = createTempPhotoMessageId();
    const nowIso = new Date().toISOString();

    // 1. Immediately show local preview in chat bubble with upload indicator
    const optimisticMessage: ChatMessage = {
      id: tempId,
      senderId: currentUser.id,
      senderName: currentUser.name,
      senderUsername: currentUser.username,
      recipientId: activeContact.id,
      text: data.caption || (data.isViewOnce ? "Photo" : ""),
      imageUrl: data.localUri,
      isViewOnce: data.isViewOnce,
      isViewed: false,
      reads: [],
      createdAt: nowIso,
      isUploading: true,
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 60);

    // 2. Perform fast background Cloudinary upload & socket delivery
    (async () => {
      try {
        const dataUri = data.base64
          ? `data:image/jpeg;base64,${data.base64}`
          : data.localUri;

        const uploadRes = await uploadImageApi(dataUri, "chatapp/view_once");

        const confirmedMsg = await socketService.sendMessage(data.caption || "Photo", {
          recipientId: activeContact.id,
          imageUrl: uploadRes.url,
          imagePublicId: uploadRes.publicId,
          isViewOnce: data.isViewOnce,
          clientTempId: tempId,
        });

        // 3. Mark upload as complete and ensure no duplicate entries
        setMessages((prev) => {
          const alreadyHasConfirmed = prev.some((m) => m.id === confirmedMsg.id);
          if (alreadyHasConfirmed) {
            return prev.filter((m) => m.id !== tempId);
          }
          return prev.map((m) =>
            m.id === tempId
              ? {
                  ...confirmedMsg,
                  imageUrl: confirmedMsg.imageUrl || data.localUri,
                  isUploading: false,
                }
              : m
          );
        });
      } catch (err: any) {
        console.error("Background photo upload failed:", err);
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setBannerError(err?.message || "Failed to upload photo. Please check your connection.");
      }
    })();
  };

  // Open View-Once Photo (Secure one-time fetch)
  const handleOpenViewOnce = async (message: ChatMessage) => {
    try {
      setBannerError(null);
      const secureUrl = await socketService.openViewOnceMessage(message.id);
      setActiveViewOnce({
        url: secureUrl,
        senderName: activeContact?.name || message.senderName || "Photo",
      });
    } catch (err: any) {
      setBannerError(err.message || "Unable to view photo. It may have expired.");
    }
  };

  // Delete message: either "me" or "everyone"
  const handleDeleteMessage = async (message: ChatMessage, deleteFor: "me" | "everyone") => {
    if (!currentUser) return;
    try {
      // Optimistic state update
      if (deleteFor === "me") {
        setMessages((prev) => prev.filter((m) => m.id !== message.id));
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === message.id
              ? {
                  ...m,
                  isDeletedForEveryone: true,
                  deletedByUserId: currentUser.id,
                  deletedByUsername: currentUser.username,
                }
              : m
          )
        );
      }
      await socketService.deleteMessage(message.id, deleteFor);
    } catch (err: any) {
      console.warn("Failed to delete message:", err.message);
      setBannerError(err.message || "Failed to delete message");
    }
  };

  // Edit message (within 5 minutes of sending)
  const handleEditMessage = async (message: ChatMessage, newText: string) => {
    if (!currentUser) return;
    try {
      // Optimistic update
      setMessages((prev) =>
        prev.map((m) =>
          m.id === message.id
            ? {
                ...m,
                text: newText,
                isEdited: true,
                editedAt: new Date().toISOString(),
              }
            : m
        )
      );
      await socketService.editMessage(message.id, newText);
    } catch (err: any) {
      console.warn("Failed to edit message:", err.message);
      setBannerError(err.message || "Failed to edit message");
      throw err;
    }
  };

  // Block a user
  const handleBlockUser = async (targetUserId: string) => {
    try {
      setBlockedUserIds((prev) => [...new Set([...prev, targetUserId])]);
      setShowBlockModal(false);
      await socketService.blockUser(targetUserId);
    } catch (err: any) {
      console.warn("Failed to block user:", err.message);
      setBannerError(err.message || "Failed to block user");
    }
  };

  // Unblock a user
  const handleUnblockUser = async (targetUserId: string) => {
    try {
      setBlockedUserIds((prev) => prev.filter((id) => id !== targetUserId));
      setShowBlockModal(false);
      await socketService.unblockUser(targetUserId);
    } catch (err: any) {
      console.warn("Failed to unblock user:", err.message);
      setBannerError(err.message || "Failed to unblock user");
    }
  };

  // Presence detection for favorite person coming online
  useEffect(() => {
    if (!currentUser || onlineUserIds.length === 0) {
      prevOnlineUserIdsRef.current = onlineUserIds;
      return;
    }

    const newlyOnline = onlineUserIds.filter(
      (id) => !prevOnlineUserIdsRef.current.includes(id) && id !== currentUser.id
    );
    prevOnlineUserIdsRef.current = onlineUserIds;

    if (newlyOnline.length > 0 && favoriteUserIds.length > 0) {
      for (const favId of newlyOnline) {
        if (favoriteUserIds.includes(favId)) {
          const favUser = registeredUsers.find((u) => u.id === favId);
          if (favUser) {
            const now = Date.now();
            const lastNotified = notifiedFavoriteIdsRef.current.get(favId) || 0;
            if (now - lastNotified >= 60000) {
              notifiedFavoriteIdsRef.current.set(favId, now);
              sendFavoriteOnlineNotification(favUser.name, favUser.username);
              triggerFavoriteToast({ id: favUser.id, name: favUser.name, username: favUser.username });
            }
          }
        }
      }
    }
  }, [onlineUserIds, favoriteUserIds, registeredUsers, currentUser, triggerFavoriteToast]);

  // Toggle favorite user (Single Favorite Person Rule - Friends only)
  const handleToggleFavorite = async (targetUser: ChatUser) => {
    if (!currentUser) return;
    if (!friendIds.includes(targetUser.id)) {
      setFavoriteModalUser(null);
      setBannerError("Favorite person can only be selected from your Friends list.");
      return;
    }
    setFavoriteActionLoading(true);
    const wasFavorite = favoriteUserIds.includes(targetUser.id);
    // Enforce single favorite: if toggling off -> []; if toggling on -> replace with [targetUser.id]
    const nextFavoriteUserIds = wasFavorite ? [] : [targetUser.id];

    // Optimistic update
    setFavoriteUserIds(nextFavoriteUserIds);

    try {
      const res = await toggleFavoriteUserApi(currentUser.id, targetUser.id);
      setFavoriteUserIds(res.favoriteUserIds);
      setFavoriteModalUser(null);
    } catch (err: any) {
      console.warn("Failed to toggle favorite:", err.message);
      // Revert optimistic update
      setFavoriteUserIds(favoriteUserIds);
      setBannerError(err.message || "Failed to update favorite status");
    } finally {
      setFavoriteActionLoading(false);
    }
  };

  if (!currentUser) return null;

  // Filter other registered users for the 1-on-1 chat list
  const otherUsers = registeredUsers.filter((u) => u.id !== currentUser.id);

  // Grouped counts
  const regularUsers = otherUsers.filter((u) => !blockedUserIds.includes(u.id));
  const friendUsers = regularUsers.filter((u) => friendIds.includes(u.id));
  const nonFriendUsers = regularUsers.filter((u) => !friendIds.includes(u.id));
  const onlineFriendUsers = friendUsers.filter((u) => onlineUserIds.includes(u.id));
  const ignoredUsers = otherUsers.filter((u) => blockedUserIds.includes(u.id));

  const filteredContacts = otherUsers.filter((u) => {
    const isBlocked = blockedUserIds.includes(u.id);

    if (activeFilter === "all") {
      if (isBlocked) return false;
      // In "All Users" tab, hide friends! They are exclusively displayed in the Friends tab
      if (friendIds.includes(u.id)) return false;
    } else if (activeFilter === "friends") {
      if (isBlocked) return false;
      if (!friendIds.includes(u.id)) return false;
    } else if (activeFilter === "online") {
      if (isBlocked) return false;
      // In "Online Now" tab, only friends who are online are shown!
      if (!friendIds.includes(u.id)) return false;
      if (!onlineUserIds.includes(u.id)) return false;
    } else if (activeFilter === "favorites") {
      if (isBlocked) return false;
      if (!friendIds.includes(u.id)) return false;
      if (!favoriteUserIds.includes(u.id)) return false;
    } else if (activeFilter === "ignored") {
      if (!isBlocked) return false;
    }

    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    const customAlias = (contactAliases[u.id] || "").toLowerCase();
    return (
      u.name.toLowerCase().includes(q) ||
      customAlias.includes(q) ||
      u.username.toLowerCase().includes(q) ||
      u.phoneNumber.includes(q)
    );
  });

  // Story ribbon removed per requirements

  // Sort rules:
  // 1. In Friends and Favorites tabs, favorite person remains at the top. In All Users tab, no favorite pinning!
  // 2. Below favorite: contacts with the latest message (sent or received) on top
  // 3. Fallback: online status, then alphabetically by name (using custom alias if set)
  const sortedContacts = [...filteredContacts].sort((a, b) => {
    if (activeFilter === "friends" || activeFilter === "favorites") {
      const aFav = favoriteUserIds.includes(a.id);
      const bFav = favoriteUserIds.includes(b.id);
      if (aFav && !bFav) return -1;
      if (!aFav && bFav) return 1;
    }

    // Contact with the latest message (sent or received) comes first
    const aTime = contactLatestMsgTimeMap.get(a.id) || 0;
    const bTime = contactLatestMsgTimeMap.get(b.id) || 0;
    if (aTime !== bTime) {
      return bTime - aTime;
    }

    const aOnline = onlineUserIds.includes(a.id);
    const bOnline = onlineUserIds.includes(b.id);
    if (aOnline && !bOnline) return -1;
    if (!aOnline && bOnline) return 1;
    const nameA = contactAliases[a.id] || a.name;
    const nameB = contactAliases[b.id] || b.name;
    return nameA.localeCompare(nameB);
  });

  // Get conversation snippet with a contact
  const getContactConversationStats = (contactId: string) => {
    const conversation = messages.filter(
      (m) =>
        (m.senderId === currentUser.id && m.recipientId === contactId) ||
        (m.senderId === contactId && m.recipientId === currentUser.id)
    );

    const lastMsg = conversation[conversation.length - 1];
    const unreadCount = conversation.filter(
      (m) =>
        m.senderId === contactId &&
        m.recipientId === currentUser.id &&
        !m.reads.some((r) => r.userId === currentUser.id)
    ).length;

    let displaySnippet = "No messages yet • Say hello";
    if (lastMsg) {
      if (lastMsg.isDeletedForEveryone) {
        displaySnippet = `🚫 Message deleted by @${lastMsg.deletedByUsername || "user"}`;
      } else {
        displaySnippet = lastMsg.text;
      }
    }

    return {
      lastMessage: displaySnippet,
      lastTime: lastMsg
        ? new Date(lastMsg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "",
      unreadCount,
    };
  };

  // Filter messages for active 1-on-1 contact (with deduplication)
  const personalMessages = activeContact
    ? messages
        .filter(
          (m) =>
            (m.senderId === currentUser.id && m.recipientId === activeContact.id) ||
            (m.senderId === activeContact.id && m.recipientId === currentUser.id)
        )
        .filter((m, idx, arr) => arr.findIndex((x) => x.id === m.id) === idx)
    : [];

  const isContactOnline = activeContact ? onlineUserIds.includes(activeContact.id) : false;
  const isContactBlocked = activeContact ? blockedUserIds.includes(activeContact.id) : false;
  const isContactFavorite = activeContact ? favoriteUserIds.includes(activeContact.id) : false;
  const isContactFriend = activeContact ? friendIds.includes(activeContact.id) : false;
  const sentMessagesToContactCount = currentUser && activeContact
    ? personalMessages.filter((m) => m.senderId === currentUser.id).length
    : 0;
  // User cannot send messages if they are not friends and have already sent >= 1 message
  const isMessageSendingBlocked = Boolean(activeContact && !isContactFriend && sentMessagesToContactCount >= 1);
  const activePalette = activeContact ? getAvatarPalette(activeContact.id || activeContact.username) : null;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.card }]} edges={["top"]}>
      {/* Floating Favorite Person Online Banner Toast */}
      {favoriteToast && (
        <Animated.View
          style={[
            styles.favoriteToastContainer,
            { transform: [{ translateY: toastAnim }] },
          ]}
        >
          <TouchableOpacity
            style={styles.favoriteToastCard}
            activeOpacity={0.9}
            onPress={() => {
              const target = registeredUsers.find((u) => u.id === favoriteToast.user.id) || {
                id: favoriteToast.user.id,
                name: favoriteToast.user.name,
                username: favoriteToast.user.username,
                phoneNumber: "",
                createdAt: new Date().toISOString(),
              };
              setActiveContact(target);
              dismissFavoriteToast();
            }}
          >
            <View style={styles.favoriteToastIconWrap}>
              <Ionicons name="star" size={18} color="#FFFFFF" />
            </View>
            <View style={styles.favoriteToastTextWrap}>
              <Text style={styles.favoriteToastTitle}>
                {favoriteToast.user.name} is online!
              </Text>
              <Text style={styles.favoriteToastSubtitle}>
                @{favoriteToast.user.username} just came online • Tap to chat
              </Text>
            </View>
            <TouchableOpacity
              style={styles.favoriteToastCloseBtn}
              onPress={(e) => {
                e.stopPropagation?.();
                dismissFavoriteToast();
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={16} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* View 1: Personal 1-on-1 Conversation Room */}
      {activeContact ? (
        <View style={[styles.flexContainer, { backgroundColor: colors.background }]}>
          {/* Direct Chat Header */}
          <View style={[styles.dmHeader, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.backBtn, { backgroundColor: isDark ? "rgba(255,255,255,0.06)" : colors.backgroundSecondary }]}
              onPress={() => setActiveContact(null)}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
              <Text style={[styles.backBtnText, { color: colors.textPrimary }]}>Chats</Text>
            </TouchableOpacity>

            <View style={styles.dmHeaderCenter}>
              <View style={styles.dmAvatarWrapper}>
                <UserAvatar
                  name={contactAliases[activeContact.id] || activeContact.name}
                  username={activeContact.username}
                  avatarUrl={activeContact.avatarUrl}
                  size={38}
                  fontSize={16}
                  backgroundColor={activePalette?.bg || Colors.primary}
                />
                <View style={styles.dmPresenceWrapper}>
                  <PulsingOnlineDot size={9} isOnline={isContactOnline} />
                </View>
              </View>

              <TouchableOpacity
                style={styles.dmHeaderTextWrapper}
                onPress={() => {
                  if (isContactFriend) setFavoriteModalUser(activeContact);
                }}
                onLongPress={() => {
                  if (isContactFriend) {
                    setNewCustomName(contactAliases[activeContact.id] || activeContact.name);
                    setAliasError(null);
                    setRenameContactUser(activeContact);
                  }
                }}
                delayLongPress={250}
                activeOpacity={isContactFriend ? 0.7 : 1}
              >
                <View style={styles.dmContactNameRow}>
                  <Text style={[styles.dmContactName, { color: colors.textPrimary }]} numberOfLines={1} ellipsizeMode="tail">
                    {contactAliases[activeContact.id] || activeContact.name}
                  </Text>
                  {contactAliases[activeContact.id] && (
                    <View style={styles.aliasIndicatorHeader}>
                      <Ionicons name="pencil" size={10} color={colors.primary} />
                    </View>
                  )}
                  {isContactFavorite && isContactFriend && (
                    <View style={styles.favoriteBadgeHeader}>
                      <Ionicons name="star" size={11} color="#F59E0B" />
                    </View>
                  )}
                  {isContactFriend && (
                    <View style={styles.friendBadgeHeader}>
                      <Ionicons name="people" size={10} color="#10B981" />
                      <Text style={styles.friendBadgeHeaderText}>Friends</Text>
                    </View>
                  )}
                  {isContactBlocked && (
                    <View style={styles.ignoredTagMini}>
                      <Text style={styles.ignoredTagMiniText}>Ignored</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.dmContactStatus, { color: isContactOnline ? colors.success : colors.textMuted }]} numberOfLines={1} ellipsizeMode="tail">
                  {isContactOnline ? "Online now" : "Offline"} • @{activeContact.username}
                  {activeFriendshipStatus === "pending_sent" ? " • Request Sent" : ""}
                  {activeFriendshipStatus === "pending_received" ? " • Wants to be friends" : ""}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Header Right Actions: Theme Toggle and Options Menu */}
            <View style={styles.dmHeaderRightActions}>
              <ThemeNavButton />
              <TouchableOpacity
                style={[
                  styles.optionsHeaderBtn,
                  {
                    backgroundColor: isDark ? colors.surfaceElevated : colors.backgroundSecondary,
                    borderColor: colors.border,
                    borderWidth: 1,
                  },
                ]}
                onPress={() => setShowOptionsMenu(true)}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Chat options"
              >
                <Ionicons
                  name="ellipsis-vertical"
                  size={20}
                  color={colors.textPrimary}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Blocked Contact Notice Banner */}
          {isContactBlocked && (
            <View style={styles.blockedBanner}>
              <View style={styles.blockedBannerContent}>
                <Ionicons name="ban" size={15} color="#EF4444" />
                <Text style={styles.blockedBannerText}>
                  You blocked this user. Incoming texts are sent to the Ignored tab.
                </Text>
              </View>
              <TouchableOpacity
                style={styles.unblockBannerBtn}
                onPress={() => handleUnblockUser(activeContact.id)}
                activeOpacity={0.8}
              >
                <Text style={styles.unblockBannerBtnText}>Unblock</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Banner Error */}
          {bannerError ? (
            <ErrorBanner
              message={bannerError}
              onRetry={() => socketService.connect(currentUser)}
              onDismiss={() => setBannerError(null)}
            />
          ) : null}

          {/* 1-on-1 Messages List */}
          <KeyboardAvoidingView
            style={[styles.keyboardContainer, { backgroundColor: colors.background }]}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
          >
            {loadingHistory ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.loadingText}>Loading direct messages...</Text>
              </View>
            ) : (
              <FlatList
                ref={flatListRef}
                data={personalMessages}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <ChatBubble
                    message={item}
                    isMe={item.senderId === currentUser.id}
                    currentUserId={currentUser.id}
                    users={registeredUsers}
                    liveTranslateHindi={liveTranslateHindi}
                    onDelete={handleDeleteMessage}
                    onEdit={handleEditMessage}
                    onOpenViewOnce={handleOpenViewOnce}
                    onPressImage={(url) => setExpandedImage({ url, caption: item.text })}
                  />
                )}
                contentContainerStyle={[
                  styles.listContent,
                  personalMessages.length === 0 ? styles.emptyListContent : null,
                ]}
                ListEmptyComponent={
                  <EmptyState
                    title={
                      isContactBlocked
                        ? `Ignored Chat with ${activeContact.name}`
                        : `Personal Chat with ${activeContact.name}`
                    }
                    subtitle={
                      isContactBlocked
                        ? "This user is blocked. If they text you, messages will be captured here."
                        : "Messages sent here are end-to-end synchronized between you two. Say hello!"
                    }
                  />
                }
                onContentSizeChange={() => {
                  if (personalMessages.length > 0) {
                    flatListRef.current?.scrollToEnd({ animated: false });
                  }
                }}
              />
            )}

            {/* Direct Message Input or Non-Friend Block Notice */}
            {isMessageSendingBlocked ? (
              <View style={styles.nonFriendNoticeCard}>
                <View style={styles.nonFriendNoticeTop}>
                  <Ionicons name="lock-closed" size={17} color="#EF4444" />
                  <Text style={styles.nonFriendNoticeTitle}>
                    You cannot send messages as they are not your friend.
                  </Text>
                </View>
                <Text style={styles.nonFriendNoticeDesc}>
                  You have already shared your single allowed message. Send a friend request to continue chatting.
                </Text>

                {activeFriendshipStatus === "none" && (
                  <TouchableOpacity
                    style={styles.friendNoticeActionBtn}
                    onPress={() => handleSendFriendRequest(activeContact.username)}
                    disabled={friendActionLoading}
                    activeOpacity={0.8}
                  >
                    {friendActionLoading ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Ionicons name="person-add" size={15} color="#FFFFFF" />
                        <Text style={styles.friendNoticeActionBtnText}>
                          Send Friend Request to @{activeContact.username}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}

                {activeFriendshipStatus === "pending_sent" && (
                  <View style={styles.friendNoticePendingTag}>
                    <Ionicons name="time" size={14} color="#F59E0B" />
                    <Text style={styles.friendNoticePendingText}>
                      Friend request pending. Waiting for @{activeContact.username} to accept.
                    </Text>
                  </View>
                )}

                {activeFriendshipStatus === "pending_received" && activeFriendRequestId && (
                  <TouchableOpacity
                    style={[styles.friendNoticeActionBtn, { backgroundColor: "#10B981" }]}
                    onPress={() => handleRespondFriendRequest(activeFriendRequestId, "accept")}
                    disabled={friendActionLoading}
                    activeOpacity={0.8}
                  >
                    {friendActionLoading ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle" size={15} color="#FFFFFF" />
                        <Text style={styles.friendNoticeActionBtnText}>
                          Accept Friend Request from @{activeContact.username}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <>
                {!isContactFriend && sentMessagesToContactCount === 0 && (
                  <View
                    style={[
                      styles.nonFriendSingleNoticeBanner,
                      {
                        backgroundColor: isDark ? "rgba(59, 130, 246, 0.15)" : "rgba(59, 130, 246, 0.08)",
                        borderColor: isDark ? "rgba(59, 130, 246, 0.3)" : "rgba(59, 130, 246, 0.2)",
                      },
                    ]}
                  >
                    <Ionicons name="information-circle" size={14} color={colors.primary} />
                    <Text style={[styles.nonFriendSingleNoticeText, { color: colors.primary }]}>
                      You are not friends. You are allowed to share 1 single message.
                    </Text>
                  </View>
                )}
                <ChatInput
                  onSend={handleSendPersonalMessage}
                  onPressCamera={() => setShowPhotoPicker(true)}
                  disabled={connectionStatus !== "connected"}
                  placeholder={
                    isContactBlocked
                      ? `Message ${activeContact.name.split(" ")[0]} (User is blocked)...`
                      : !isContactFriend
                      ? `Send 1 single message...`
                      : `Message ${activeContact.name.split(" ")[0]}...`
                  }
                />
              </>
            )}
          </KeyboardAvoidingView>
        </View>
      ) : (
        /* View 2: Personal Chats List (Direct Messages Directory) */
        <View style={[styles.flexContainer, { backgroundColor: colors.background }]}>
          {/* Top Header */}
          <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.borderLight }]}>
            <View style={styles.headerLeft}>
              <View style={[styles.appIconBadge, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="chatbubbles" size={20} color={colors.primary} />
              </View>
              <View style={styles.headerTitleWrap}>
                <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>Personal Chats</Text>
                <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                  Signed in as <Text style={{ fontFamily: Fonts.bodySemiBold, color: colors.primary }}>@{currentUser.username}</Text>
                </Text>
              </View>
            </View>

            <View style={styles.headerRightGroup}>
              <ThemeNavButton />
              <LockNavButton compact={true} />
              <TouchableOpacity
                style={[styles.addFriendHeaderActionBtn, { backgroundColor: colors.primaryLight }]}
                onPress={() => setShowAddFriendModal(true)}
                activeOpacity={0.8}
                accessibilityLabel="Add Friends & Requests"
              >
                <Ionicons name="person-add" size={17} color={colors.primary} />
                {incomingFriendRequests.length > 0 && (
                  <View style={styles.incomingFriendBadge}>
                    <Text style={styles.incomingFriendBadgeText}>
                      {incomingFriendRequests.length}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
              <ConnectionBadge status={connectionStatus} showText={false} />
            </View>
          </View>

          {/* Search Bar */}
          <View style={[styles.searchContainer, { backgroundColor: isDark ? colors.surfaceElevated : colors.card, borderColor: colors.border }]}>
            <Ionicons name="search" size={17} color={colors.textMuted} style={styles.searchIcon} />
            <TextInput
              style={[styles.searchInput, { color: colors.textPrimary }]}
              placeholder="Search by name or @username..."
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 ? (
              <TouchableOpacity onPress={() => setSearchQuery("")} hitSlop={8}>
                <Ionicons name="close-circle" size={17} color={colors.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Stories section removed */}

          {/* Quick Presence, Friends & Ignored Filters */}
          <View style={styles.filtersRow}>
            {/* Filter 1: All Users */}
            <TouchableOpacity
              style={[
                styles.filterChip,
                {
                  backgroundColor: activeFilter === "all" ? colors.primary : (isDark ? colors.card : colors.backgroundSecondary),
                  borderColor: activeFilter === "all" ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setActiveFilter("all")}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.filterChipText,
                  {
                    color: activeFilter === "all" ? "#FFFFFF" : colors.textSecondary,
                    fontFamily: activeFilter === "all" ? Fonts.bold : Fonts.medium,
                  },
                ]}
              >
                All Users ({nonFriendUsers.length})
              </Text>
            </TouchableOpacity>

            {/* Filter: Friends */}
            <TouchableOpacity
              style={[
                styles.filterChip,
                {
                  backgroundColor: activeFilter === "friends" ? colors.primary : (isDark ? colors.card : colors.backgroundSecondary),
                  borderColor: activeFilter === "friends" ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setActiveFilter("friends")}
              activeOpacity={0.8}
            >
              <Ionicons
                name="people"
                size={12}
                color={activeFilter === "friends" ? "#FFFFFF" : colors.textMuted}
              />
              <Text
                style={[
                  styles.filterChipText,
                  {
                    color: activeFilter === "friends" ? "#FFFFFF" : colors.textSecondary,
                    fontFamily: activeFilter === "friends" ? Fonts.bold : Fonts.medium,
                  },
                ]}
              >
                Friends ({friendUsers.length})
              </Text>
            </TouchableOpacity>

            {/* Filter 2: Online Now */}
            <TouchableOpacity
              style={[
                styles.filterChip,
                {
                  backgroundColor: activeFilter === "online" ? colors.primary : (isDark ? colors.card : colors.backgroundSecondary),
                  borderColor: activeFilter === "online" ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setActiveFilter("online")}
              activeOpacity={0.8}
            >
              <View style={styles.onlineDotMini} />
              <Text
                style={[
                  styles.filterChipText,
                  {
                    color: activeFilter === "online" ? "#FFFFFF" : colors.textSecondary,
                    fontFamily: activeFilter === "online" ? Fonts.bold : Fonts.medium,
                  },
                ]}
              >
                Online Now ({onlineFriendUsers.length})
              </Text>
            </TouchableOpacity>

            {/* Filter 3: Favorites */}
            <TouchableOpacity
              style={[
                styles.filterChip,
                {
                  backgroundColor: activeFilter === "favorites" ? colors.primary : (isDark ? colors.card : colors.backgroundSecondary),
                  borderColor: activeFilter === "favorites" ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setActiveFilter("favorites")}
              activeOpacity={0.8}
            >
              <Ionicons
                name="star"
                size={12}
                color={activeFilter === "favorites" ? "#FFFFFF" : "#F59E0B"}
              />
              <Text
                style={[
                  styles.filterChipText,
                  {
                    color: activeFilter === "favorites" ? "#FFFFFF" : colors.textSecondary,
                    fontFamily: activeFilter === "favorites" ? Fonts.bold : Fonts.medium,
                  },
                ]}
              >
                Favorites ({favoriteUserIds.length})
              </Text>
            </TouchableOpacity>

            {/* Filter 4: Ignored (Blocked Users) */}
            <TouchableOpacity
              style={[
                styles.filterChip,
                activeFilter === "ignored" && styles.filterChipActiveIgnored,
              ]}
              onPress={() => setActiveFilter("ignored")}
              activeOpacity={0.8}
            >
              <Ionicons
                name="ban"
                size={12}
                color={activeFilter === "ignored" ? "#EF4444" : Colors.textMuted}
              />
              <Text
                style={[
                  styles.filterChipText,
                  activeFilter === "ignored" && styles.filterChipTextActiveIgnored,
                ]}
              >
                Ignored ({ignoredUsers.length})
              </Text>
            </TouchableOpacity>
          </View>

          {/* Contacts / Users Direct Message List */}
          <FlatList
            data={sortedContacts}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.contactsList}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const isOnline = onlineUserIds.includes(item.id);
              const isBlocked = blockedUserIds.includes(item.id);
              const isFriend = friendIds.includes(item.id);
              // Favorites strictly restricted to friends and hidden in All Users tab
              const isFavorite = favoriteUserIds.includes(item.id) && isFriend && activeFilter !== "all";
              const stats = getContactConversationStats(item.id);
              const palette = getAvatarPalette(item.id || item.username);
              const displayName = contactAliases[item.id] || item.name;
              const hasCustomAlias = Boolean(contactAliases[item.id]);

              const outgoingReq = outgoingFriendRequests.find(
                (r) => r.receiverId === item.id || r.receiver?.id === item.id
              );
              const incomingReq = incomingFriendRequests.find(
                (r) => r.senderId === item.id || r.sender?.id === item.id
              );

              return (
                <TouchableOpacity
                  style={[
                    styles.contactCard,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                      shadowColor: isDark ? "#000000" : "#0F172A",
                      shadowOpacity: isDark ? 0.3 : 0.04,
                    },
                    isBlocked && styles.contactCardBlocked,
                    isFavorite && { borderColor: "#F59E0B" },
                  ]}
                  onPress={() => setActiveContact(item)}
                  onLongPress={() => {
                    if (isFriend) {
                      setNewCustomName(contactAliases[item.id] || item.name);
                      setAliasError(null);
                      setRenameContactUser(item);
                    }
                  }}
                  delayLongPress={280}
                  activeOpacity={0.7}
                >
                  {/* Avatar with Breathing Presence Ring */}
                  <View style={styles.avatarWrap}>
                    <UserAvatar
                      name={displayName}
                      username={item.username}
                      avatarUrl={item.avatarUrl}
                      size={50}
                      fontSize={20}
                      backgroundColor={isBlocked ? "#64748B" : palette.bg}
                    />
                    {isFavorite && <View style={styles.favoriteAvatarRing} />}
                    <View style={styles.avatarPresenceWrapper}>
                      {isBlocked ? (
                        <View style={styles.blockedAvatarBadge}>
                          <Ionicons name="ban" size={9} color="#FFFFFF" />
                        </View>
                      ) : (
                        <PulsingOnlineDot size={12} isOnline={isOnline} />
                      )}
                    </View>
                  </View>

                  {/* Info */}
                  <View style={styles.contactInfo}>
                    <View style={styles.contactTopRow}>
                      <View style={styles.contactNameContainer}>
                        <Text style={[styles.contactName, { color: colors.textPrimary }]} numberOfLines={1}>
                          {displayName}
                        </Text>
                        {hasCustomAlias && (
                          <View style={styles.aliasIndicatorBadge}>
                            <Ionicons name="pencil" size={9} color={Colors.primary} />
                          </View>
                        )}
                        {isFavorite && (
                          <View style={styles.favoriteStarBadge}>
                            <Ionicons name="star" size={11} color="#F59E0B" />
                          </View>
                        )}
                        {isFriend && (
                          <View style={styles.friendBadgeCard}>
                            <Ionicons name="people" size={10} color="#10B981" />
                          </View>
                        )}
                        {!isFriend && !isBlocked && (
                          outgoingReq?.status === "declined" ? (
                            <View style={[styles.cardAddFriendPill, styles.cardAddFriendPillDeclined]}>
                              <Ionicons name="close-circle" size={11} color="#EF4444" />
                              <Text style={[styles.cardAddFriendPillText, styles.cardAddFriendPillTextDeclined]}>
                                Declined
                              </Text>
                            </View>
                          ) : outgoingReq?.status === "pending" ? (
                            <View style={[styles.cardAddFriendPill, styles.cardAddFriendPillPending]}>
                              <Ionicons name="time" size={11} color="#D97706" />
                              <Text style={[styles.cardAddFriendPillText, styles.cardAddFriendPillTextPending]}>
                                Requested
                              </Text>
                            </View>
                          ) : incomingReq ? (
                            <TouchableOpacity
                              style={[
                                styles.cardAddFriendPill,
                                {
                                  backgroundColor: "rgba(16, 185, 129, 0.12)",
                                  borderColor: "rgba(16, 185, 129, 0.3)",
                                },
                              ]}
                              onPress={(e) => {
                                e.stopPropagation?.();
                                handleRespondFriendRequest(incomingReq.id, "accept");
                              }}
                              activeOpacity={0.7}
                            >
                              <Ionicons name="checkmark-circle" size={11} color="#10B981" />
                              <Text style={[styles.cardAddFriendPillText, { color: "#10B981" }]}>
                                Accept
                              </Text>
                            </TouchableOpacity>
                          ) : (
                            <TouchableOpacity
                              style={styles.cardAddFriendPill}
                              onPress={(e) => {
                                e.stopPropagation?.();
                                handleSendFriendRequest(item.username);
                              }}
                              activeOpacity={0.7}
                            >
                              <Ionicons name="person-add" size={11} color={Colors.primary} />
                              <Text style={styles.cardAddFriendPillText}>Add Friend</Text>
                            </TouchableOpacity>
                          )
                        )}
                        {isBlocked && (
                          <View style={styles.ignoredBadge}>
                            <Text style={styles.ignoredBadgeText}>Ignored</Text>
                          </View>
                        )}
                      </View>
                      {stats.lastTime ? (
                        <Text style={styles.contactTime}>{stats.lastTime}</Text>
                      ) : null}
                    </View>

                    <TouchableOpacity
                      onLongPress={() => {
                        if (isFriend && activeFilter !== "all") {
                          setFavoriteModalUser(item);
                        }
                      }}
                      delayLongPress={280}
                      activeOpacity={isFriend && activeFilter !== "all" ? 0.7 : 1}
                    >
                      <Text style={[styles.contactUsername, { color: colors.primary }]}>@{item.username}</Text>
                    </TouchableOpacity>

                    <Text
                      style={[
                        styles.contactLastMsg,
                        { color: colors.textSecondary },
                        isBlocked && styles.contactLastMsgBlocked,
                      ]}
                      numberOfLines={1}
                    >
                      {stats.lastMessage}
                    </Text>
                  </View>

                  {/* Unread Pill, Unblock Button, Star or Arrow */}
                  {isBlocked ? (
                    <TouchableOpacity
                      style={styles.cardUnblockBtn}
                      onPress={(e) => {
                        e.stopPropagation?.();
                        handleUnblockUser(item.id);
                      }}
                      activeOpacity={0.8}
                      accessibilityLabel={`Unblock ${item.name}`}
                    >
                      <Text style={styles.cardUnblockBtnText}>Unblock</Text>
                    </TouchableOpacity>
                  ) : stats.unreadCount > 0 ? (
                    <View style={[styles.unreadCountPill, { backgroundColor: colors.primary }]}>
                      <Text style={styles.unreadCountText}>{stats.unreadCount}</Text>
                    </View>
                  ) : isFavorite ? (
                    <TouchableOpacity
                      style={styles.starTouchBtn}
                      onPress={(e) => {
                        e.stopPropagation?.();
                        setFavoriteModalUser(item);
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityLabel="Favorite Person"
                    >
                      <Ionicons
                        name="star"
                        size={16}
                        color="#F59E0B"
                      />
                    </TouchableOpacity>
                  ) : (
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color={colors.border}
                    />
                  )}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyContactsWrap}>
                <Ionicons
                  name={
                    activeFilter === "ignored"
                      ? "shield-outline"
                      : activeFilter === "favorites"
                      ? "star-outline"
                      : "people-outline"
                  }
                  size={44}
                  color={activeFilter === "favorites" ? "#F59E0B" : Colors.textMuted}
                />
                <Text style={[styles.emptyContactsTitle, { color: colors.textPrimary }]}>
                  {activeFilter === "ignored"
                    ? "No Ignored Users"
                    : activeFilter === "favorites"
                    ? "No Favorite People Yet"
                    : activeFilter === "online"
                    ? "No Online Friends"
                    : "No users found"}
                </Text>
                <Text style={[styles.emptyContactsSub, { color: colors.textSecondary }]}>
                  {activeFilter === "ignored"
                    ? "Users you block will appear here. If they send you messages, you can view them safely here without inbox disturbances."
                    : activeFilter === "favorites"
                    ? "Long press any username or contact card to add them as your favorite person and get notified when they come online!"
                    : activeFilter === "online"
                    ? "None of your friends are currently online."
                    : "No registered users match your search."}
                </Text>
              </View>
            }
          />
        </View>
      )}

      {/* Block / Unblock Confirmation Modal */}
      {activeContact && (
        <Modal
          visible={showBlockModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowBlockModal(false)}
        >
          <View style={styles.blockModalOverlay}>
            <View style={styles.blockModalCard}>
              <View
                style={[
                  styles.blockModalIconWrap,
                  isContactBlocked ? styles.blockModalIconWrapGreen : styles.blockModalIconWrapRed,
                ]}
              >
                <Ionicons
                  name={isContactBlocked ? "checkmark-circle" : "ban"}
                  size={24}
                  color={isContactBlocked ? "#10B981" : "#EF4444"}
                />
              </View>

              <Text style={styles.blockModalTitle}>
                {isContactBlocked
                  ? `Unblock ${activeContact.name}?`
                  : `Block ${activeContact.name}?`}
              </Text>

              <Text style={styles.blockModalDesc}>
                {isContactBlocked
                  ? `@${activeContact.username} will be moved back to your regular chat list and you will be able to receive direct communications again.`
                  : `@${activeContact.username} will not know they are blocked. Their messages will be safely stored and viewable only inside your "Ignored" tab.`}
              </Text>

              <View style={styles.blockModalActions}>
                <TouchableOpacity
                  style={[
                    styles.blockConfirmBtn,
                    isContactBlocked ? styles.unblockConfirmBtn : styles.blockDestructiveBtn,
                  ]}
                  onPress={() => {
                    if (isContactBlocked) {
                      handleUnblockUser(activeContact.id);
                    } else {
                      handleBlockUser(activeContact.id);
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.blockConfirmBtnText}>
                    {isContactBlocked ? "Yes, Unblock" : "Block User"}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.blockCancelBtn}
                  onPress={() => setShowBlockModal(false)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.blockCancelBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Photo Picker Modal (Camera / Gallery + View-Once toggle) */}
      <PhotoPickerModal
        visible={showPhotoPicker}
        onClose={() => setShowPhotoPicker(false)}
        onSendPhoto={handleSendPersonalPhoto}
      />

      {/* View Once Photo Fullscreen Viewer */}
      <ViewOncePhotoModal
        visible={!!activeViewOnce}
        imageUrl={activeViewOnce?.url}
        senderName={activeViewOnce?.senderName}
        onClose={() => setActiveViewOnce(null)}
      />

      {/* Standard Photo Full Window Zoom Viewer */}
      <ImageViewerModal
        visible={!!expandedImage}
        imageUrl={expandedImage?.url}
        caption={expandedImage?.caption}
        onClose={() => setExpandedImage(null)}
      />

      {/* Favorite Person Action Modal (Single Favorite Rule) */}
      {favoriteModalUser && (() => {
        const isThisUserFav = favoriteUserIds.includes(favoriteModalUser.id);
        const currentFavUser = favoriteUserIds.length > 0 && !isThisUserFav
          ? registeredUsers.find((u) => u.id === favoriteUserIds[0])
          : null;

        let title = "Set as Favorite Person ⭐";
        let desc = `Add ${favoriteModalUser.name} (@${favoriteModalUser.username}) as your Favorite Person. Only one person can be set as your favorite at a time. You will receive an instant notification whenever they come online!`;
        let btnText = "⭐ Set as Favorite Person";

        if (isThisUserFav) {
          title = "Favorite Person ⭐";
          desc = `${favoriteModalUser.name} (@${favoriteModalUser.username}) is currently your single Favorite Person. You receive instant notifications when they come online.`;
          btnText = "Remove from Favorites";
        } else if (currentFavUser) {
          title = "Change Favorite Person? ⭐";
          desc = `${currentFavUser.name} (@${currentFavUser.username}) is currently your Favorite Person. Only one person can be your favorite at a time. Do you want to replace them with ${favoriteModalUser.name} (@${favoriteModalUser.username})?`;
          btnText = `⭐ Replace with ${favoriteModalUser.name.split(" ")[0]}`;
        }

        return (
          <Modal
            visible={!!favoriteModalUser}
            transparent
            animationType="fade"
            onRequestClose={() => setFavoriteModalUser(null)}
          >
            <View style={styles.blockModalOverlay}>
              <View style={[styles.blockModalCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
                <View style={styles.favoriteModalIconWrap}>
                  <Ionicons
                    name={isThisUserFav ? "star" : "star-outline"}
                    size={28}
                    color="#F59E0B"
                  />
                </View>

                <Text style={[styles.blockModalTitle, { color: colors.textPrimary }]}>{title}</Text>

                <Text style={[styles.blockModalDesc, { color: colors.textSecondary }]}>{desc}</Text>

                <View style={styles.blockModalActions}>
                  <TouchableOpacity
                    style={[
                      styles.blockConfirmBtn,
                      isThisUserFav ? styles.removeFavoriteBtn : styles.setFavoriteBtn,
                    ]}
                    onPress={() => handleToggleFavorite(favoriteModalUser)}
                    activeOpacity={0.8}
                    disabled={favoriteActionLoading}
                  >
                    {favoriteActionLoading ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Text style={styles.blockConfirmBtnText}>{btnText}</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.blockCancelBtn, { backgroundColor: isDark ? colors.surfaceElevated : colors.backgroundSecondary, borderColor: colors.border, borderWidth: 1 }]}
                    onPress={() => setFavoriteModalUser(null)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.blockCancelBtnText, { color: colors.textPrimary }]}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        );
      })()}

      {/* 3-Dots Chat Options Modal */}
      {activeContact && (
        <Modal
          visible={showOptionsMenu}
          transparent
          animationType="fade"
          onRequestClose={() => setShowOptionsMenu(false)}
        >
          <TouchableOpacity
            style={styles.optionsModalOverlay}
            activeOpacity={1}
            onPress={() => setShowOptionsMenu(false)}
          >
            <View style={[styles.optionsModalCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
              <View style={styles.optionsModalHeader}>
                <UserAvatar
                  name={contactAliases[activeContact.id] || activeContact.name}
                  username={activeContact.username}
                  avatarUrl={activeContact.avatarUrl}
                  size={46}
                  fontSize={18}
                  backgroundColor={activePalette?.bg || Colors.primary}
                />
                <View style={styles.optionsModalHeaderInfo}>
                  <Text style={[styles.optionsModalName, { color: colors.textPrimary }]} numberOfLines={1}>
                    {activeContact.name}
                  </Text>
                  <Text style={[styles.optionsModalUsername, { color: colors.textSecondary }]} numberOfLines={1}>
                    @{activeContact.username}
                  </Text>
                </View>
              </View>

              <View style={[styles.optionsDivider, { backgroundColor: colors.border }]} />

              {/* Action: Rename Friend (Friends only) */}
              {isContactFriend && (
                <TouchableOpacity
                  style={styles.optionsActionRow}
                  onPress={() => {
                    setShowOptionsMenu(false);
                    setNewCustomName(contactAliases[activeContact.id] || activeContact.name);
                    setAliasError(null);
                    setTimeout(() => setRenameContactUser(activeContact), 150);
                  }}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.optionsActionIconWrap,
                      { backgroundColor: "rgba(37, 99, 235, 0.12)" },
                    ]}
                  >
                    <Ionicons name="pencil" size={20} color={Colors.primary} />
                  </View>
                  <View style={styles.optionsActionTextWrap}>
                    <Text style={styles.optionsActionTitle}>
                      {contactAliases[activeContact.id] ? "Edit Friend Nickname" : "Rename Friend"}
                    </Text>
                    <Text style={styles.optionsActionSub}>
                      {contactAliases[activeContact.id]
                        ? `Customized as "${contactAliases[activeContact.id]}" for you`
                        : "Set a private nickname visible only to you"}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}

              {/* Action 1: Favorite Person (Friends only) */}
              {isContactFriend && (
                <TouchableOpacity
                  style={styles.optionsActionRow}
                  onPress={() => {
                    setShowOptionsMenu(false);
                    setTimeout(() => setFavoriteModalUser(activeContact), 150);
                  }}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.optionsActionIconWrap,
                      { backgroundColor: "rgba(245, 158, 11, 0.12)" },
                    ]}
                  >
                    <Ionicons
                      name={isContactFavorite ? "star" : "star-outline"}
                      size={20}
                      color="#F59E0B"
                    />
                  </View>
                  <View style={styles.optionsActionTextWrap}>
                    <Text style={styles.optionsActionTitle}>
                      {isContactFavorite
                        ? "Remove from Favorites"
                        : "Set as Favorite Person ⭐"}
                    </Text>
                    <Text style={styles.optionsActionSub}>
                      {isContactFavorite
                        ? "Currently notified when online"
                        : "Get notified when they come online"}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}

              {/* Action: Unfriend Contact (Friends only) */}
              {isContactFriend && (
                <TouchableOpacity
                  style={styles.optionsActionRow}
                  onPress={() => {
                    setShowOptionsMenu(false);
                    setTimeout(() => setShowUnfriendConfirmModal(true), 150);
                  }}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.optionsActionIconWrap,
                      { backgroundColor: "rgba(239, 68, 68, 0.12)" },
                    ]}
                  >
                    <Ionicons name="person-remove-outline" size={20} color="#EF4444" />
                  </View>
                  <View style={styles.optionsActionTextWrap}>
                    <Text style={[styles.optionsActionTitle, { color: "#EF4444" }]}>
                      Unfriend @{activeContact.username}
                    </Text>
                    <Text style={styles.optionsActionSub}>
                      Remove from friends list and restrict messaging
                    </Text>
                  </View>
                </TouchableOpacity>
              )}

              {/* Action: Live Hindi Translation Toggle */}
              <TouchableOpacity
                style={styles.optionsActionRow}
                onPress={() => {
                  setLiveTranslateHindi((prev) => !prev);
                  setShowOptionsMenu(false);
                }}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.optionsActionIconWrap,
                    {
                      backgroundColor: liveTranslateHindi
                        ? "rgba(16, 185, 129, 0.15)"
                        : "rgba(59, 130, 246, 0.12)",
                    },
                  ]}
                >
                  <Ionicons
                    name="language"
                    size={20}
                    color={liveTranslateHindi ? "#10B981" : Colors.primary}
                  />
                </View>
                <View style={styles.optionsActionTextWrap}>
                  <Text style={styles.optionsActionTitle}>
                    Live Hindi Translation: {liveTranslateHindi ? "ON" : "OFF"}
                  </Text>
                  <Text style={styles.optionsActionSub}>
                    {liveTranslateHindi
                      ? "Automatically translating chat messages into Hindi"
                      : "Tap to turn on live auto-translation of English messages"}
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Action 2: Clear Chat History */}
              <TouchableOpacity
                style={styles.optionsActionRow}
                onPress={() => {
                  setShowOptionsMenu(false);
                  setTimeout(() => setShowClearConfirmModal(true), 150);
                }}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.optionsActionIconWrap,
                    { backgroundColor: "rgba(239, 68, 68, 0.12)" },
                  ]}
                >
                  <Ionicons name="trash-outline" size={20} color="#EF4444" />
                </View>
                <View style={styles.optionsActionTextWrap}>
                  <Text style={[styles.optionsActionTitle, { color: "#EF4444" }]}>
                    Clear Chat
                  </Text>
                  <Text style={styles.optionsActionSub}>
                    Delete all messages for you in this conversation
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Action 3: Block / Unblock Contact */}
              <TouchableOpacity
                style={styles.optionsActionRow}
                onPress={() => {
                  setShowOptionsMenu(false);
                  setTimeout(() => setShowBlockModal(true), 150);
                }}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.optionsActionIconWrap,
                    {
                      backgroundColor: isContactBlocked
                        ? "rgba(16, 185, 129, 0.12)"
                        : "rgba(100, 116, 139, 0.12)",
                    },
                  ]}
                >
                  <Ionicons
                    name={isContactBlocked ? "shield-checkmark-outline" : "ban-outline"}
                    size={20}
                    color={isContactBlocked ? "#10B981" : Colors.textSecondary}
                  />
                </View>
                <View style={styles.optionsActionTextWrap}>
                  <Text style={styles.optionsActionTitle}>
                    {isContactBlocked ? "Unblock Contact" : "Block Contact"}
                  </Text>
                  <Text style={styles.optionsActionSub}>
                    {isContactBlocked
                      ? "Move conversation back to inbox"
                      : "Move incoming texts to Ignored"}
                  </Text>
                </View>
              </TouchableOpacity>

              <View style={[styles.optionsDivider, { backgroundColor: colors.border }]} />

              <TouchableOpacity
                style={[styles.optionsCancelBtn, { backgroundColor: isDark ? colors.surfaceElevated : colors.backgroundSecondary, borderColor: colors.border, borderWidth: 1 }]}
                onPress={() => setShowOptionsMenu(false)}
                activeOpacity={0.7}
              >
                <Text style={[styles.optionsCancelBtnText, { color: colors.textPrimary }]}>Close</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Clear Chat Confirmation Modal */}
      {activeContact && (
        <Modal
          visible={showClearConfirmModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowClearConfirmModal(false)}
        >
          <View style={styles.blockModalOverlay}>
            <View style={[styles.blockModalCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
              <View
                style={[
                  styles.blockModalIconWrap,
                  { backgroundColor: "rgba(239, 68, 68, 0.12)" },
                ]}
              >
                <Ionicons name="trash" size={26} color="#EF4444" />
              </View>

              <Text style={[styles.blockModalTitle, { color: colors.textPrimary }]}>Clear Chat?</Text>

              <Text style={[styles.blockModalDesc, { color: colors.textSecondary }]}>
                This will delete all messages in this conversation for you. {activeContact.name} will still have their copy.
              </Text>

              <View style={styles.blockModalActions}>
                <TouchableOpacity
                  style={[styles.blockConfirmBtn, styles.blockDestructiveBtn]}
                  onPress={handleClearChat}
                  disabled={isClearingChat}
                  activeOpacity={0.8}
                >
                  {isClearingChat ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.blockConfirmBtnText}>Clear Messages</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.blockCancelBtn, { backgroundColor: isDark ? colors.surfaceElevated : colors.backgroundSecondary, borderColor: colors.border, borderWidth: 1 }]}
                  onPress={() => setShowClearConfirmModal(false)}
                  disabled={isClearingChat}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.blockCancelBtnText, { color: colors.textPrimary }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Unfriend Confirmation Modal */}
      {activeContact && (
        <Modal
          visible={showUnfriendConfirmModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowUnfriendConfirmModal(false)}
        >
          <View style={styles.blockModalOverlay}>
            <View style={[styles.blockModalCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
              <View
                style={[
                  styles.blockModalIconWrap,
                  { backgroundColor: "rgba(239, 68, 68, 0.12)" },
                ]}
              >
                <Ionicons name="person-remove" size={26} color="#EF4444" />
              </View>

              <Text style={[styles.blockModalTitle, { color: colors.textPrimary }]}>Unfriend @{activeContact.username}?</Text>

              <Text style={[styles.blockModalDesc, { color: colors.textSecondary }]}>
                Are you sure you want to unfriend {activeContact.name}? You will no longer be friends and messaging will be restricted until you add each other back.
              </Text>

              <View style={styles.blockModalActions}>
                <TouchableOpacity
                  style={[styles.blockConfirmBtn, styles.blockDestructiveBtn]}
                  onPress={handleUnfriendContact}
                  disabled={isUnfriending}
                  activeOpacity={0.8}
                >
                  {isUnfriending ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.blockConfirmBtnText}>Unfriend</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.blockCancelBtn, { backgroundColor: isDark ? colors.surfaceElevated : colors.backgroundSecondary, borderColor: colors.border, borderWidth: 1 }]}
                  onPress={() => setShowUnfriendConfirmModal(false)}
                  disabled={isUnfriending}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.blockCancelBtnText, { color: colors.textPrimary }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Rename Contact / Custom Nickname Modal */}
      {renameContactUser && (
        <Modal
          visible={!!renameContactUser}
          transparent
          animationType="fade"
          onRequestClose={() => {
            if (!isSavingAlias) setRenameContactUser(null);
          }}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.blockModalOverlay}
          >
            <View style={[styles.renameModalCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
              <View style={styles.renameModalHeader}>
                <View style={styles.renameModalIconBadge}>
                  <Ionicons name="pencil" size={20} color={colors.primary} />
                </View>
                <View style={styles.renameModalTitleWrap}>
                  <Text style={[styles.renameModalTitle, { color: colors.textPrimary }]}>Rename Friend</Text>
                  <Text style={[styles.renameModalSubtitle, { color: colors.textSecondary }]}>
                    Personal nickname for your friend, visible only to you
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.renameModalCloseBtn}
                  onPress={() => setRenameContactUser(null)}
                  disabled={isSavingAlias}
                >
                  <Ionicons name="close" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              {/* Locked Username Card (Immutable) */}
              <View style={[styles.lockedUsernameBox, { backgroundColor: isDark ? colors.surfaceElevated : "#F1F5F9", borderColor: colors.border }]}>
                <View style={styles.lockedUsernameHeaderRow}>
                  <View style={styles.lockedUsernameRow}>
                    <Ionicons name="lock-closed" size={13} color={colors.textSecondary} />
                    <Text style={[styles.lockedUsernameText, { color: colors.textPrimary }]}>
                      @{renameContactUser.username}
                    </Text>
                  </View>
                  <View style={styles.lockedBadge}>
                    <Text style={styles.lockedBadgeText}>Username cannot be changed</Text>
                  </View>
                </View>
                <Text style={[styles.lockedUsernameNote, { color: colors.textSecondary }]}>
                  Usernames are permanent and unique across ChatApp. This nickname is purely for your view and is not shared with anyone else.
                </Text>
              </View>

              {/* Original Name info */}
              <View style={styles.originalNameRow}>
                <Text style={[styles.originalNameLabel, { color: colors.textSecondary }]}>Original Name:</Text>
                <Text style={[styles.originalNameValue, { color: colors.textPrimary }]}>{renameContactUser.name}</Text>
              </View>

              {aliasError && (
                <View style={styles.friendAlertError}>
                  <Ionicons name="alert-circle" size={15} color="#EF4444" />
                  <Text style={styles.friendAlertErrorText}>{aliasError}</Text>
                </View>
              )}

              {/* Input for custom nickname */}
              <View style={styles.renameInputContainer}>
                <Text style={[styles.renameInputLabel, { color: colors.textPrimary }]}>Custom Nickname</Text>
                <View style={[styles.renameInputWrapper, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <TextInput
                    style={[styles.renameTextInput, { color: colors.textPrimary }]}
                    value={newCustomName}
                    onChangeText={setNewCustomName}
                    placeholder={`e.g. Bestie, Mom, Boss...`}
                    placeholderTextColor={colors.textMuted}
                    maxLength={40}
                    autoFocus
                  />
                  {newCustomName.length > 0 && (
                    <TouchableOpacity
                      onPress={() => setNewCustomName("")}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Modal Actions */}
              <View style={styles.renameModalActions}>
                <TouchableOpacity
                  style={[styles.renameSaveBtn, isSavingAlias && styles.friendSendBtnDisabled]}
                  onPress={handleSaveContactAlias}
                  disabled={isSavingAlias}
                  activeOpacity={0.8}
                >
                  {isSavingAlias ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.renameSaveBtnText}>Save Nickname</Text>
                  )}
                </TouchableOpacity>

                {contactAliases[renameContactUser.id] && (
                  <TouchableOpacity
                    style={styles.renameResetBtn}
                    onPress={handleResetContactAlias}
                    disabled={isSavingAlias}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="refresh-outline" size={15} color="#EF4444" />
                    <Text style={styles.renameResetBtnText}>Reset to Original Name</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[styles.renameCancelBtn, { backgroundColor: isDark ? colors.surfaceElevated : colors.backgroundSecondary, borderColor: colors.border, borderWidth: 1 }]}
                  onPress={() => setRenameContactUser(null)}
                  disabled={isSavingAlias}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.renameCancelBtnText, { color: colors.textPrimary }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}

      {/* Add / Manage Friends Modal */}
      {showAddFriendModal && (
        <Modal
          visible={showAddFriendModal}
          transparent
          animationType="slide"
          onRequestClose={() => {
            setShowAddFriendModal(false);
            setAddFriendError(null);
            setAddFriendSuccess(null);
          }}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.blockModalOverlay}
          >
            <View style={styles.friendModalCard}>
              {/* Header */}
              <View style={styles.friendModalHeader}>
                <View style={styles.friendModalTitleRow}>
                  <View style={styles.friendModalIconBadge}>
                    <Ionicons name="person-add" size={20} color={Colors.primary} />
                  </View>
                  <View>
                    <Text style={styles.friendModalTitle}>Add Friend</Text>
                    <Text style={styles.friendModalSubtitle}>
                      Send request to chat freely
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setShowAddFriendModal(false);
                    setAddFriendError(null);
                    setAddFriendSuccess(null);
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close" size={22} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* Input Row */}
              <View style={styles.friendInputContainer}>
                <Text style={styles.friendAtSymbol}>@</Text>
                <TextInput
                  style={styles.friendInput}
                  placeholder="Enter username"
                  placeholderTextColor={Colors.textMuted}
                  value={addFriendUsername}
                  onChangeText={(t) => {
                    setAddFriendUsername(t);
                    setAddFriendError(null);
                    setAddFriendSuccess(null);
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  style={[
                    styles.friendSendBtn,
                    (!addFriendUsername.trim() || addFriendSubmitting) && styles.friendSendBtnDisabled,
                  ]}
                  disabled={!addFriendUsername.trim() || addFriendSubmitting}
                  onPress={async () => {
                    if (!addFriendUsername.trim()) return;
                    setAddFriendSubmitting(true);
                    await handleSendFriendRequest(addFriendUsername);
                    setAddFriendSubmitting(false);
                    setAddFriendUsername("");
                  }}
                  activeOpacity={0.8}
                >
                  {addFriendSubmitting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.friendSendBtnText}>Send</Text>
                  )}
                </TouchableOpacity>
              </View>

              {/* Status alerts */}
              {addFriendError && (
                <View style={styles.friendAlertError}>
                  <Ionicons name="alert-circle" size={14} color="#EF4444" />
                  <Text style={styles.friendAlertErrorText}>{addFriendError}</Text>
                </View>
              )}
              {addFriendSuccess && (
                <View style={styles.friendAlertSuccess}>
                  <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                  <Text style={styles.friendAlertSuccessText}>{addFriendSuccess}</Text>
                </View>
              )}

              {/* Pending Incoming Requests */}
              {incomingFriendRequests.length > 0 && (
                <View style={styles.friendRequestsSection}>
                  <Text style={styles.friendRequestsSectionTitle}>
                    Incoming Requests ({incomingFriendRequests.length})
                  </Text>
                  {incomingFriendRequests.map((req) => (
                    <View key={req.id} style={styles.friendRequestItem}>
                      <UserAvatar
                        name={req.sender?.name}
                        username={req.sender?.username}
                        avatarUrl={req.sender?.avatarUrl}
                        size={40}
                        fontSize={16}
                      />
                      <View style={styles.friendRequestItemInfo}>
                        <Text style={styles.friendRequestItemName} numberOfLines={1}>
                          {req.sender?.name || req.sender?.username}
                        </Text>
                        <Text style={styles.friendRequestItemUsername}>
                          @{req.sender?.username}
                        </Text>
                      </View>
                      <View style={styles.friendRequestItemActions}>
                        <TouchableOpacity
                          style={styles.friendAcceptBtn}
                          onPress={() => handleRespondFriendRequest(req.id, "accept")}
                          disabled={friendActionLoading}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.friendAcceptBtnText}>Accept</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.friendDeclineBtn}
                          onPress={() => handleRespondFriendRequest(req.id, "declined")}
                          disabled={friendActionLoading}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.friendDeclineBtnText}>Decline</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* Outgoing Pending Requests */}
              {outgoingFriendRequests.length > 0 && (
                <View style={styles.friendRequestsSection}>
                  <Text style={styles.friendRequestsSectionTitle}>
                    Sent Requests ({outgoingFriendRequests.length})
                  </Text>
                  {outgoingFriendRequests.map((req) => (
                    <View key={req.id} style={styles.friendRequestItem}>
                      <UserAvatar
                        name={req.receiver?.name}
                        username={req.receiver?.username}
                        avatarUrl={req.receiver?.avatarUrl}
                        size={40}
                        fontSize={16}
                      />
                      <View style={styles.friendRequestItemInfo}>
                        <Text style={styles.friendRequestItemName} numberOfLines={1}>
                          {req.receiver?.name || req.receiver?.username}
                        </Text>
                        <Text style={styles.friendRequestItemUsername}>
                          @{req.receiver?.username}
                        </Text>
                      </View>
                      {req.status === "declined" ? (
                        <View style={styles.declinedTagPill}>
                          <Ionicons name="close-circle" size={12} color="#EF4444" />
                          <Text style={styles.declinedTagPillText}>Declined</Text>
                        </View>
                      ) : (
                        <View style={styles.pendingTagPill}>
                          <Ionicons name="time" size={12} color="#D97706" />
                          <Text style={styles.pendingTagPillText}>Pending</Text>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}

      {/* Floating Animated Emoji Burst (First-Time User View) */}
      {floatingEmoji && (
        <FloatingEmojiBurst
          emoji={floatingEmoji}
          onComplete={() => setFloatingEmoji(null)}
        />
      )}
    </SafeAreaView>
  );
}


const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "transparent",
  },
  flexContainer: {
    flex: 1,
    backgroundColor: "transparent",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    backgroundColor: Colors.card,
  },
  headerLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginRight: 10,
    minWidth: 0,
  },
  headerTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  appIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.primaryLight,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: Fonts.extraBold,
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  userNameHighlight: {
    fontFamily: Fonts.bodySemiBold,
    color: Colors.primary,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.card,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    height: 44,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: Fonts.bodyRegular,
    paddingVertical: 0,
  },
  storiesSection: {
    paddingVertical: 10,
  },
  storiesContent: {
    paddingHorizontal: 16,
    gap: 14,
  },
  storyItem: {
    alignItems: "center",
    width: 60,
    gap: 5,
  },
  yourStoryAvatarWrap: {
    position: "relative",
  },
  storyPlusBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  activeStoryRing: {
    padding: 2,
    borderRadius: 27,
    borderWidth: 2,
    position: "relative",
  },
  storyOnlineDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#10B981",
    borderWidth: 2,
  },
  storyLabel: {
    fontSize: 11,
    fontFamily: Fonts.medium,
    textAlign: "center",
  },
  filtersRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  filterChipText: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: Colors.textSecondary,
  },
  filterChipTextActive: {
    color: "#FFFFFF",
    fontFamily: Fonts.bold,
  },
  onlineDotMini: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: Colors.success,
  },
  contactsList: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 10,
  },
  contactCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.card,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    gap: 13,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  avatarWrap: {
    position: "relative",
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  avatarText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontFamily: Fonts.bold,
  },
  avatarPresenceWrapper: {
    position: "absolute",
    bottom: -1,
    right: -1,
  },
  contactInfo: {
    flex: 1,
    gap: 2,
  },
  contactTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  contactName: {
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
    letterSpacing: -0.2,
    maxWidth: 180,
  },
  contactTime: {
    fontSize: 11,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textMuted,
  },
  contactUsername: {
    fontSize: 12,
    fontFamily: Fonts.bodyMedium,
    color: Colors.primary,
  },
  contactLastMsg: {
    fontSize: 13,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  unreadCountPill: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    minWidth: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  unreadCountText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontFamily: Fonts.bold,
  },
  emptyContactsWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 64,
    gap: 10,
  },
  emptyContactsTitle: {
    fontSize: 16,
    fontFamily: Fonts.bold,
    color: Colors.textSecondary,
  },
  emptyContactsSub: {
    fontSize: 13,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textMuted,
    textAlign: "center",
    paddingHorizontal: 24,
  },

  // Pulsing Presence Indicator Styles
  presenceContainer: {
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  presencePulseRing: {
    position: "absolute",
    backgroundColor: Colors.success,
  },
  presenceDotOnline: {
    backgroundColor: Colors.success,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  presenceDotOffline: {
    backgroundColor: Colors.textMuted,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },

  // 1-on-1 Direct Chat Room Styles
  dmHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 2,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  backBtnText: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
  },
  dmHeaderCenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
    marginHorizontal: 8,
  },
  dmAvatarWrapper: {
    position: "relative",
  },
  dmAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
  },
  dmAvatarText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: Fonts.bold,
  },
  dmPresenceWrapper: {
    position: "absolute",
    bottom: -1,
    right: -1,
  },
  dmHeaderTextWrapper: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  dmContactName: {
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  dmContactStatus: {
    fontSize: 11,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  keyboardContainer: {
    flex: 1,
    backgroundColor: "transparent",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontFamily: Fonts.bodyMedium,
  },
  listContent: {
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  emptyListContent: {
    flexGrow: 1,
    justifyContent: "center",
  },

  /* Direct Chat Header Block / Ignored Additions */
  dmContactNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  ignoredTagMini: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  ignoredTagMiniText: {
    fontSize: 10,
    fontFamily: Fonts.bold,
    color: "#EF4444",
  },
  blockHeaderBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: Colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  blockHeaderBtnBlocked: {
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  blockHeaderBtnText: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: Colors.textSecondary,
  },
  blockHeaderBtnTextBlocked: {
    color: "#EF4444",
  },

  /* Blocked Notice Banner */
  blockedBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(239, 68, 68, 0.2)",
    gap: 10,
  },
  blockedBannerContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  blockedBannerText: {
    flex: 1,
    fontSize: 12,
    fontFamily: Fonts.bodyMedium,
    color: "#EF4444",
  },
  unblockBannerBtn: {
    backgroundColor: "#EF4444",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  unblockBannerBtnText: {
    fontSize: 11,
    fontFamily: Fonts.bold,
    color: "#FFFFFF",
  },

  /* Filter Chip for Ignored */
  filterChipActiveIgnored: {
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderColor: "rgba(239, 68, 68, 0.35)",
  },
  filterChipTextActiveIgnored: {
    color: "#EF4444",
    fontFamily: Fonts.bold,
  },

  /* Contact Card for Ignored / Blocked Users */
  contactCardBlocked: {
    backgroundColor: "rgba(241, 245, 249, 0.5)",
    borderColor: "rgba(203, 213, 225, 0.8)",
  },
  blockedAvatarBadge: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#EF4444",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
  contactNameContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  ignoredBadge: {
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.25)",
  },
  ignoredBadgeText: {
    fontSize: 10,
    fontFamily: Fonts.bold,
    color: "#EF4444",
  },
  contactLastMsgBlocked: {
    color: Colors.textMuted,
    fontStyle: "italic",
  },
  cardUnblockBtn: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  cardUnblockBtnText: {
    fontSize: 11,
    fontFamily: Fonts.bold,
    color: "#EF4444",
  },

  /* Block / Unblock Modal */
  blockModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  blockModalCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: Colors.card,
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  blockModalIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
  },
  blockModalIconWrapRed: {
    backgroundColor: "rgba(239, 68, 68, 0.12)",
  },
  blockModalIconWrapGreen: {
    backgroundColor: "rgba(16, 185, 129, 0.12)",
  },
  blockModalTitle: {
    fontSize: 17,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
    textAlign: "center",
    marginBottom: 8,
  },
  blockModalDesc: {
    fontSize: 13,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 20,
  },
  blockModalActions: {
    width: "100%",
    gap: 10,
  },
  blockConfirmBtn: {
    width: "100%",
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
  },
  blockDestructiveBtn: {
    backgroundColor: "#EF4444",
  },
  unblockConfirmBtn: {
    backgroundColor: "#10B981",
  },
  blockConfirmBtnText: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: "#FFFFFF",
  },
  blockCancelBtn: {
    width: "100%",
    paddingVertical: 11,
    borderRadius: 14,
    alignItems: "center",
    backgroundColor: Colors.backgroundSecondary,
  },
  blockCancelBtnText: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Colors.textSecondary,
  },
  dmHeaderRightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  favoriteBadgeHeader: {
    marginLeft: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: "rgba(245, 158, 11, 0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  favoriteHeaderBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  favoriteHeaderBtnActive: {
    backgroundColor: "rgba(245, 158, 11, 0.14)",
    borderColor: "rgba(245, 158, 11, 0.4)",
  },
  filterChipActiveFavorite: {
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    borderColor: "#F59E0B",
  },
  filterChipTextActiveFavorite: {
    color: "#F59E0B",
    fontFamily: Fonts.bold,
  },
  contactCardFavorite: {
    borderColor: "rgba(245, 158, 11, 0.35)",
  },
  favoriteAvatarRing: {
    position: "absolute",
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: 27,
    borderWidth: 2,
    borderColor: "#F59E0B",
  },
  favoriteStarBadge: {
    marginLeft: 6,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 6,
    backgroundColor: "rgba(245, 158, 11, 0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  starTouchBtn: {
    padding: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  favoriteModalIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(245, 158, 11, 0.14)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
  },
  setFavoriteBtn: {
    backgroundColor: "#F59E0B",
  },
  removeFavoriteBtn: {
    backgroundColor: "#EF4444",
  },
  favoriteToastContainer: {
    position: "absolute",
    top: 0,
    left: 16,
    right: 16,
    zIndex: 99999,
  },
  favoriteToastCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1E293B",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#F59E0B",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  favoriteToastIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F59E0B",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  favoriteToastTextWrap: {
    flex: 1,
  },
  favoriteToastTitle: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: "#FFFFFF",
    marginBottom: 2,
  },
  favoriteToastSubtitle: {
    fontSize: 12,
    fontFamily: Fonts.bodyRegular,
    color: "#CBD5E1",
  },
  favoriteToastCloseBtn: {
    padding: 6,
    marginLeft: 8,
  },
  optionsHeaderBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  liveTranslateHeaderBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 17,
    backgroundColor: "rgba(59, 130, 246, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(59, 130, 246, 0.25)",
  },
  liveTranslateHeaderBtnActive: {
    backgroundColor: "#10B981",
    borderColor: "#10B981",
  },
  liveTranslateHeaderText: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: Colors.primary,
  },
  liveTranslateHeaderTextActive: {
    color: "#FFFFFF",
  },
  optionsModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end",
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
    paddingHorizontal: 16,
  },
  optionsModalCard: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    padding: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 8,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  optionsModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingBottom: 14,
  },
  optionsModalAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  optionsModalAvatarText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontFamily: Fonts.bold,
  },
  optionsModalHeaderInfo: {
    flex: 1,
  },
  optionsModalName: {
    fontSize: 16,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
  },
  optionsModalUsername: {
    fontSize: 13,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  optionsDivider: {
    height: 1,
    backgroundColor: Colors.borderLight,
    marginVertical: 6,
  },
  optionsActionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 14,
  },
  optionsActionIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  optionsActionTextWrap: {
    flex: 1,
  },
  optionsActionTitle: {
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
  },
  optionsActionSub: {
    fontSize: 12,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textMuted,
    marginTop: 2,
  },
  optionsCancelBtn: {
    marginTop: 8,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 12,
  },
  optionsCancelBtnText: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: Colors.textSecondary,
  },
  friendBadgeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  friendBadgeHeaderText: {
    fontSize: 10,
    fontFamily: Fonts.bodySemiBold,
    color: "#10B981",
  },
  nonFriendNoticeCard: {
    backgroundColor: "#FEF2F2",
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 10,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  nonFriendNoticeTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  nonFriendNoticeTitle: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: "#B91C1C",
    flex: 1,
  },
  nonFriendNoticeDesc: {
    fontSize: 12,
    fontFamily: Fonts.bodyRegular,
    color: "#7F1D1D",
    lineHeight: 17,
    marginBottom: 12,
  },
  friendNoticeActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  friendNoticeActionBtnText: {
    fontSize: 13,
    fontFamily: Fonts.semiBold,
    color: "#FFFFFF",
  },
  friendNoticePendingTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  friendNoticePendingText: {
    fontSize: 12,
    fontFamily: Fonts.bodyMedium,
    color: "#B45309",
    flex: 1,
  },
  nonFriendSingleNoticeBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(59, 130, 246, 0.1)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginHorizontal: 16,
    marginBottom: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(59, 130, 246, 0.2)",
  },
  nonFriendSingleNoticeText: {
    fontSize: 12,
    fontFamily: Fonts.bodyMedium,
    color: Colors.primary,
    flex: 1,
  },
  headerRightGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  addFriendHeaderActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.primaryLight,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  incomingFriendBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#EF4444",
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
  incomingFriendBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontFamily: Fonts.bold,
  },
  filterChipActiveFriend: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    borderColor: "#10B981",
  },
  filterChipTextActiveFriend: {
    color: "#10B981",
    fontFamily: Fonts.semiBold,
  },
  friendBadgeCard: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    marginLeft: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  friendModalCard: {
    backgroundColor: Colors.card,
    borderRadius: 24,
    padding: 20,
    width: "100%",
    maxWidth: 420,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  friendModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  friendModalTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  friendModalIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.primaryLight,
    justifyContent: "center",
    alignItems: "center",
  },
  friendModalTitle: {
    fontSize: 17,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
  },
  friendModalSubtitle: {
    fontSize: 12,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  friendInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 46,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  friendAtSymbol: {
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: Colors.primary,
    marginRight: 4,
  },
  friendInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textPrimary,
    paddingVertical: 0,
  },
  friendSendBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  friendSendBtnDisabled: {
    opacity: 0.5,
  },
  friendSendBtnText: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: "#FFFFFF",
  },
  friendAlertError: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  friendAlertErrorText: {
    fontSize: 12,
    fontFamily: Fonts.bodyMedium,
    color: "#EF4444",
    flex: 1,
  },
  friendAlertSuccess: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  friendAlertSuccessText: {
    fontSize: 12,
    fontFamily: Fonts.bodyMedium,
    color: "#10B981",
    flex: 1,
  },
  friendRequestsSection: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    paddingTop: 12,
  },
  friendRequestsSectionTitle: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  friendRequestItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    gap: 10,
  },
  friendRequestAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.primaryLight,
    justifyContent: "center",
    alignItems: "center",
  },
  friendRequestAvatarText: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: Colors.primary,
  },
  friendRequestItemInfo: {
    flex: 1,
  },
  friendRequestItemName: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
  },
  friendRequestItemUsername: {
    fontSize: 11,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textSecondary,
  },
  friendRequestItemActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  friendAcceptBtn: {
    backgroundColor: "#10B981",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  friendAcceptBtnText: {
    fontSize: 11,
    fontFamily: Fonts.bold,
    color: "#FFFFFF",
  },
  friendDeclineBtn: {
    backgroundColor: Colors.backgroundSecondary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  friendDeclineBtnText: {
    fontSize: 11,
    fontFamily: Fonts.medium,
    color: Colors.textMuted,
  },
  pendingTagPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  pendingTagPillText: {
    fontSize: 11,
    fontFamily: Fonts.semiBold,
    color: "#D97706",
  },
  declinedTagPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  declinedTagPillText: {
    fontSize: 11,
    fontFamily: Fonts.semiBold,
    color: "#EF4444",
  },
  cardAddFriendPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(37, 99, 235, 0.1)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(37, 99, 235, 0.25)",
    marginLeft: 6,
  },
  cardAddFriendPillPending: {
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    borderColor: "rgba(245, 158, 11, 0.25)",
  },
  cardAddFriendPillDeclined: {
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    borderColor: "rgba(239, 68, 68, 0.2)",
  },
  cardAddFriendPillText: {
    fontSize: 10,
    fontFamily: Fonts.bold,
    color: Colors.primary,
  },
  cardAddFriendPillTextPending: {
    color: "#D97706",
  },
  cardAddFriendPillTextDeclined: {
    color: "#EF4444",
  },
  aliasIndicatorHeader: {
    marginLeft: 6,
    padding: 3,
    borderRadius: 6,
    backgroundColor: "rgba(37, 99, 235, 0.12)",
  },
  aliasIndicatorBadge: {
    marginLeft: 4,
    padding: 2,
    borderRadius: 4,
    backgroundColor: "rgba(37, 99, 235, 0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  renameModalCard: {
    backgroundColor: Colors.card,
    borderRadius: 24,
    padding: 22,
    width: "100%",
    maxWidth: 420,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 8,
  },
  renameModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  renameModalIconBadge: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "rgba(37, 99, 235, 0.12)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  renameModalTitleWrap: {
    flex: 1,
  },
  renameModalTitle: {
    fontSize: 17,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
  },
  renameModalSubtitle: {
    fontSize: 12,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  renameModalCloseBtn: {
    padding: 6,
  },
  lockedUsernameBox: {
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  lockedUsernameHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  lockedUsernameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  lockedUsernameText: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
  },
  lockedBadge: {
    backgroundColor: "rgba(100, 116, 139, 0.15)",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  lockedBadgeText: {
    fontSize: 10,
    fontFamily: Fonts.bold,
    color: Colors.textSecondary,
  },
  lockedUsernameNote: {
    fontSize: 11,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textMuted,
    lineHeight: 16,
  },
  originalNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  originalNameLabel: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: Colors.textSecondary,
  },
  originalNameValue: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
  },
  renameInputContainer: {
    marginBottom: 18,
  },
  renameInputLabel: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  renameInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    height: 46,
  },
  renameTextInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textPrimary,
    paddingVertical: 0,
  },
  renameModalActions: {
    gap: 10,
  },
  renameSaveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  renameSaveBtnText: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: "#FFFFFF",
  },
  renameResetBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
    backgroundColor: "rgba(239, 68, 68, 0.05)",
  },
  renameResetBtnText: {
    fontSize: 13,
    fontFamily: Fonts.semiBold,
    color: "#EF4444",
  },
  renameCancelBtn: {
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  renameCancelBtnText: {
    fontSize: 13,
    fontFamily: Fonts.medium,
    color: Colors.textSecondary,
  },
});

