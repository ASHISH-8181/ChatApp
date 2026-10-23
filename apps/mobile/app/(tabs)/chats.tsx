import React, { useEffect, useRef, useState } from "react";
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
import type { ChatMessage, ChatUser } from "@chatapp/shared";
import { useUser } from "@/store/user-context";
import { socketService, type ConnectionStatus } from "@/services/socket";
import {
  fetchMessageHistory,
  fetchAllUsers,
  fetchBlockedUsersApi,
} from "@/services/api";
import { ChatBubble } from "@/components/ChatBubble";
import { ChatInput } from "@/components/ChatInput";
import { ConnectionBadge } from "@/components/ConnectionBadge";
import { EmptyState } from "@/components/EmptyState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { Ionicons } from "@/components/Icon";
import { Fonts, Colors } from "@/constants/theme";

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

  // All messages store
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
  const [bannerError, setBannerError] = useState<string | null>(null);

  // Active Personal 1-on-1 Contact (null = show direct chats list)
  const [activeContact, setActiveContact] = useState<ChatUser | null>(null);

  // Blocked users state
  const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);
  const [showBlockModal, setShowBlockModal] = useState(false);

  // Contact list search and filter: 'all' | 'online' | 'ignored'
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "online" | "ignored">("all");

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

    // Load registered users, message history, and blocked user IDs
    Promise.all([
      fetchMessageHistory({ currentUserId: currentUser.id }),
      fetchAllUsers(),
      fetchBlockedUsersApi(currentUser.id).catch(() => ({ blockedUsers: [], blockedUserIds: [] })),
    ])
      .then(([history, users, blockedData]) => {
        if (isMounted) {
          setMessages(history);
          setRegisteredUsers(users);
          setBlockedUserIds(blockedData.blockedUserIds || []);
          setLoadingHistory(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.warn("Initial fetch error:", err.message);
          setBannerError("Unable to load latest data from server.");
          setLoadingHistory(false);
        }
      });

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
    });

    const unsubPresence = socketService.subscribeToPresence((ids) => {
      if (!isMounted) return;
      setOnlineUserIds(ids);
    });

    const unsubReadReceipts = socketService.subscribeToReadReceipts(({ messageIds, reader }) => {
      if (!isMounted) return;
      setMessages((prev) =>
        prev.map((msg) => {
          if (messageIds.includes(msg.id)) {
            const alreadyHasReader = msg.reads.some((r) => r.userId === reader.userId);
            if (alreadyHasReader) return msg;
            return {
              ...msg,
              reads: [...msg.reads, reader],
            };
          }
          return msg;
        })
      );
    });

    const unsubMessages = socketService.subscribeToMessages((newMsg) => {
      if (!isMounted) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    });

    const unsubDeleted = socketService.subscribeToMessageDeleted((data) => {
      if (!isMounted) return;
      if (data.deleteFor === "me") {
        if (data.deletedByUserId === currentUser.id) {
          setMessages((prev) => prev.filter((m) => m.id !== data.messageId));
        }
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === data.messageId
              ? {
                  ...m,
                  isDeletedForEveryone: true,
                  deletedByUserId: data.deletedByUserId,
                  deletedByUsername: data.deletedByUsername || "user",
                }
              : m
          )
        );
      }
    });

    const unsubEdited = socketService.subscribeToMessageEdited((data) => {
      if (!isMounted) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === data.messageId
            ? { ...m, text: data.text, isEdited: true, editedAt: data.editedAt }
            : m
        )
      );
    });

    const unsubBlocked = socketService.subscribeToUserBlocked((data) => {
      if (!isMounted) return;
      if (data.blockerId === currentUser.id) {
        setBlockedUserIds((prev) => [...new Set([...prev, data.targetUserId])]);
      }
    });

    const unsubUnblocked = socketService.subscribeToUserUnblocked((data) => {
      if (!isMounted) return;
      if (data.blockerId === currentUser.id) {
        setBlockedUserIds((prev) => prev.filter((id) => id !== data.targetUserId));
      }
    });

    const unsubErrors = socketService.subscribeToErrors((errText) => {
      if (!isMounted) return;
      setBannerError(errText);
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
      unsubErrors();
    };
  }, [currentUser, setRegisteredUsers]);

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

  // Fetch personal 1-on-1 messages whenever activeContact changes
  useEffect(() => {
    if (!currentUser || !activeContact) return;

    fetchMessageHistory({
      recipientId: activeContact.id,
      currentUserId: currentUser.id,
    })
      .then((history) => {
        setMessages((prev) => {
          const others = prev.filter(
            (m) =>
              !(
                (m.senderId === currentUser.id && m.recipientId === activeContact.id) ||
                (m.senderId === activeContact.id && m.recipientId === currentUser.id)
              )
          );
          return [...others, ...history];
        });
      })
      .catch((err) => {
        console.warn("Failed to fetch direct message history:", err);
      });
  }, [activeContact, currentUser]);

  // Send Personal 1-on-1 Message
  const handleSendPersonalMessage = async (text: string) => {
    if (!activeContact) return;
    try {
      setBannerError(null);
      await socketService.sendMessage(text, { recipientId: activeContact.id });
    } catch (err: any) {
      setBannerError(err.message || "Failed to deliver direct message.");
      throw err;
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

  if (!currentUser) return null;

  // Filter other registered users for the 1-on-1 chat list
  const otherUsers = registeredUsers.filter((u) => u.id !== currentUser.id);

  // Grouped counts
  const regularUsers = otherUsers.filter((u) => !blockedUserIds.includes(u.id));
  const onlineRegularUsers = regularUsers.filter((u) => onlineUserIds.includes(u.id));
  const ignoredUsers = otherUsers.filter((u) => blockedUserIds.includes(u.id));

  const filteredContacts = otherUsers.filter((u) => {
    const isBlocked = blockedUserIds.includes(u.id);

    if (activeFilter === "all") {
      if (isBlocked) return false;
    } else if (activeFilter === "online") {
      if (isBlocked) return false;
      if (!onlineUserIds.includes(u.id)) return false;
    } else if (activeFilter === "ignored") {
      if (!isBlocked) return false;
    }

    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      u.name.toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q) ||
      u.phoneNumber.includes(q)
    );
  });

  // Sort: online users first, then alphabetically
  const sortedContacts = [...filteredContacts].sort((a, b) => {
    const aOnline = onlineUserIds.includes(a.id);
    const bOnline = onlineUserIds.includes(b.id);
    if (aOnline && !bOnline) return -1;
    if (!aOnline && bOnline) return 1;
    return a.name.localeCompare(b.name);
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

  // Filter messages for active 1-on-1 contact
  const personalMessages = activeContact
    ? messages.filter(
        (m) =>
          (m.senderId === currentUser.id && m.recipientId === activeContact.id) ||
          (m.senderId === activeContact.id && m.recipientId === currentUser.id)
      )
    : [];

  const isContactOnline = activeContact ? onlineUserIds.includes(activeContact.id) : false;
  const isContactBlocked = activeContact ? blockedUserIds.includes(activeContact.id) : false;
  const activePalette = activeContact ? getAvatarPalette(activeContact.id || activeContact.username) : null;

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      {/* View 1: Personal 1-on-1 Conversation Room */}
      {activeContact ? (
        <View style={styles.flexContainer}>
          {/* Direct Chat Header */}
          <View style={styles.dmHeader}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => setActiveContact(null)}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
              <Text style={styles.backBtnText}>Chats</Text>
            </TouchableOpacity>

            <View style={styles.dmHeaderCenter}>
              <View style={styles.dmAvatarWrapper}>
                <View style={[styles.dmAvatar, { backgroundColor: activePalette?.bg || Colors.primary }]}>
                  <Text style={styles.dmAvatarText}>
                    {activeContact.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.dmPresenceWrapper}>
                  <PulsingOnlineDot size={10} isOnline={isContactOnline} />
                </View>
              </View>

              <View style={styles.dmHeaderTextWrapper}>
                <View style={styles.dmContactNameRow}>
                  <Text style={styles.dmContactName} numberOfLines={1}>
                    {activeContact.name}
                  </Text>
                  {isContactBlocked && (
                    <View style={styles.ignoredTagMini}>
                      <Text style={styles.ignoredTagMiniText}>Ignored</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.dmContactStatus}>
                  {isContactOnline ? "Online now" : "Offline"} • @{activeContact.username}
                </Text>
              </View>
            </View>

            {/* Block / Unblock Shield Button */}
            <TouchableOpacity
              style={[
                styles.blockHeaderBtn,
                isContactBlocked && styles.blockHeaderBtnBlocked,
              ]}
              onPress={() => setShowBlockModal(true)}
              activeOpacity={0.7}
              accessibilityLabel={isContactBlocked ? "Unblock contact" : "Block contact"}
            >
              <Ionicons
                name={isContactBlocked ? "ban" : "shield-outline"}
                size={16}
                color={isContactBlocked ? "#EF4444" : Colors.textSecondary}
              />
              <Text
                style={[
                  styles.blockHeaderBtnText,
                  isContactBlocked && styles.blockHeaderBtnTextBlocked,
                ]}
              >
                {isContactBlocked ? "Blocked" : "Block"}
              </Text>
            </TouchableOpacity>

            <ConnectionBadge status={connectionStatus} />
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
            style={styles.keyboardContainer}
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
                    onDelete={handleDeleteMessage}
                    onEdit={handleEditMessage}
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

            {/* Direct Message Input */}
            <ChatInput
              onSend={handleSendPersonalMessage}
              disabled={connectionStatus !== "connected"}
              placeholder={
                isContactBlocked
                  ? `Message ${activeContact.name.split(" ")[0]} (User is blocked)...`
                  : `Message ${activeContact.name.split(" ")[0]}...`
              }
            />
          </KeyboardAvoidingView>
        </View>
      ) : (
        /* View 2: Personal Chats List (Direct Messages Directory) */
        <View style={styles.flexContainer}>
          {/* Top Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.appIconBadge}>
                <Ionicons name="chatbubbles" size={20} color={Colors.primary} />
              </View>
              <View>
                <Text style={styles.headerTitle}>Personal Chats</Text>
                <Text style={styles.headerSubtitle}>
                  Signed in as <Text style={styles.userNameHighlight}>@{currentUser.username}</Text>
                </Text>
              </View>
            </View>

            <ConnectionBadge status={connectionStatus} />
          </View>

          {/* Search Bar */}
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={17} color={Colors.textMuted} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name or @username..."
              placeholderTextColor={Colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 ? (
              <TouchableOpacity onPress={() => setSearchQuery("")} hitSlop={8}>
                <Ionicons name="close-circle" size={17} color={Colors.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Quick Presence & Ignored Filters */}
          <View style={styles.filtersRow}>
            {/* Filter 1: All Users */}
            <TouchableOpacity
              style={[styles.filterChip, activeFilter === "all" && styles.filterChipActive]}
              onPress={() => setActiveFilter("all")}
              activeOpacity={0.8}
            >
              <Text style={[styles.filterChipText, activeFilter === "all" && styles.filterChipTextActive]}>
                All Users ({regularUsers.length})
              </Text>
            </TouchableOpacity>

            {/* Filter 2: Online Now */}
            <TouchableOpacity
              style={[styles.filterChip, activeFilter === "online" && styles.filterChipActive]}
              onPress={() => setActiveFilter("online")}
              activeOpacity={0.8}
            >
              <View style={styles.onlineDotMini} />
              <Text style={[styles.filterChipText, activeFilter === "online" && styles.filterChipTextActive]}>
                Online Now ({onlineRegularUsers.length})
              </Text>
            </TouchableOpacity>

            {/* Filter 3: Ignored (Blocked Users) */}
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
              const stats = getContactConversationStats(item.id);
              const palette = getAvatarPalette(item.id || item.username);

              return (
                <TouchableOpacity
                  style={[
                    styles.contactCard,
                    isBlocked && styles.contactCardBlocked,
                  ]}
                  onPress={() => setActiveContact(item)}
                  activeOpacity={0.7}
                >
                  {/* Avatar with Breathing Presence Ring */}
                  <View style={styles.avatarWrap}>
                    <View
                      style={[
                        styles.avatar,
                        { backgroundColor: isBlocked ? "#64748B" : palette.bg },
                      ]}
                    >
                      <Text style={styles.avatarText}>
                        {item.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
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
                        <Text style={styles.contactName} numberOfLines={1}>
                          {item.name}
                        </Text>
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

                    <Text style={styles.contactUsername}>@{item.username}</Text>

                    <Text
                      style={[
                        styles.contactLastMsg,
                        isBlocked && styles.contactLastMsgBlocked,
                      ]}
                      numberOfLines={1}
                    >
                      {stats.lastMessage}
                    </Text>
                  </View>

                  {/* Unread Pill, Unblock Button, or Arrow */}
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
                    <View style={styles.unreadCountPill}>
                      <Text style={styles.unreadCountText}>{stats.unreadCount}</Text>
                    </View>
                  ) : (
                    <Ionicons name="chevron-forward" size={17} color={Colors.border} />
                  )}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyContactsWrap}>
                <Ionicons
                  name={activeFilter === "ignored" ? "shield-outline" : "people-outline"}
                  size={44}
                  color={Colors.textMuted}
                />
                <Text style={styles.emptyContactsTitle}>
                  {activeFilter === "ignored"
                    ? "No Ignored Users"
                    : "No users found"}
                </Text>
                <Text style={styles.emptyContactsSub}>
                  {activeFilter === "ignored"
                    ? "Users you block will appear here. If they send you messages, you can view them safely here without inbox disturbances."
                    : activeFilter === "online"
                    ? "No other users are currently online."
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
    </SafeAreaView>
  );
}


const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.card,
  },
  flexContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    backgroundColor: Colors.card,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  appIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.primaryLight,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: Fonts.extraBold,
    color: Colors.textPrimary,
    letterSpacing: -0.4,
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
    color: Colors.textPrimary,
    paddingVertical: 0,
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
  },
  dmContactName: {
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
    letterSpacing: -0.2,
  },
  dmContactStatus: {
    fontSize: 11,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  keyboardContainer: {
    flex: 1,
    backgroundColor: Colors.background,
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
});

