import React, { useState, useMemo } from "react";
import {
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import type { ChatUser } from "@chatapp/shared";
import { UserAvatar } from "@/components/UserAvatar";

interface RegisteredUsersBarProps {
  users: ChatUser[];
  onlineUserIds?: string[];
  currentUserId?: string;
  onMentionUser?: (username: string) => void;
}


export function RegisteredUsersBar({
  users,
  onlineUserIds = [],
  currentUserId,
  onMentionUser,
}: RegisteredUsersBarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<ChatUser | null>(null);
  const [showFullDirectory, setShowFullDirectory] = useState(false);

  // Online check helper
  const isUserOnline = (userId: string) => {
    return onlineUserIds.includes(userId);
  };

  // Sort and filter users: online users first, then filtered by search query
  const sortedAndFilteredUsers = useMemo(() => {
    const cleanQuery = searchQuery.trim().toLowerCase().replace(/^@/, "");
    const onlineSet = new Set(onlineUserIds);

    const filtered = users.filter((u) => {
      if (!cleanQuery) return true;
      return (
        u.username.toLowerCase().includes(cleanQuery) ||
        u.name.toLowerCase().includes(cleanQuery) ||
        (u.phoneNumber && u.phoneNumber.includes(cleanQuery))
      );
    });

    // Sort online users first
    return filtered.sort((a, b) => {
      const aOnline = onlineSet.has(a.id);
      const bOnline = onlineSet.has(b.id);
      if (aOnline && !bOnline) return -1;
      if (!aOnline && bOnline) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [users, searchQuery, onlineUserIds]);

  if (!users || users.length === 0) {
    return null;
  }

  const isFiltering = searchQuery.trim().length > 0;
  const onlineCount = users.filter((u) => isUserOnline(u.id)).length;

  return (
    <View style={styles.container}>
      {/* Header with Title, Live Presence Count, and Directory Button */}
      <View style={styles.headerRow}>
        <View style={styles.titleWithIcon}>
          <Text style={styles.icon}>👥</Text>
          <Text style={styles.title}>Members</Text>
          <View style={styles.onlineSummaryBadge}>
            <View style={styles.onlineDotMini} />
            <Text style={styles.onlineSummaryText}>{onlineCount} Online</Text>
          </View>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>
              {isFiltering ? `${sortedAndFilteredUsers.length}/${users.length}` : `${users.length} Total`}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.directoryButton}
          onPress={() => setShowFullDirectory(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.directoryButtonText}>📋 View All / Search</Text>
        </TouchableOpacity>
      </View>

      {/* Inline Search Bar */}
      <View style={styles.searchBarWrapper}>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by @username, name, or phone..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery("")}
              style={styles.clearSearchButton}
            >
              <Text style={styles.clearSearchText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filtered Users Horizontal Chips with Live Presence */}
      {sortedAndFilteredUsers.length === 0 ? (
        <View style={styles.emptySearchContainer}>
          <Text style={styles.emptySearchText}>
            No user found matching &quot;{searchQuery}&quot;
          </Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {sortedAndFilteredUsers.map((user) => {
            const isMe = user.id === currentUserId;
            const online = isUserOnline(user.id);

            return (
              <TouchableOpacity
                key={user.id}
                style={[
                  styles.userChip,
                  isMe ? styles.userChipMe : null,
                  online ? styles.userChipOnline : styles.userChipOffline,
                ]}
                onPress={() => setSelectedUser(user)}
                activeOpacity={0.7}
              >
                <UserAvatar
                  name={user.name}
                  username={user.username}
                  avatarUrl={user.avatarUrl}
                  size={42}
                  fontSize={16}
                  showOnlineDot={true}
                  isOnline={online}
                />

                <View style={styles.userInfo}>
                  <View style={styles.nameRow}>
                    <Text
                      style={[styles.userName, isMe ? styles.userNameMe : null]}
                      numberOfLines={1}
                    >
                      {user.name}
                    </Text>
                    {isMe && (
                      <View style={styles.youBadge}>
                        <Text style={styles.youBadgeText}>You</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.handleAndStatus}>
                    <Text style={styles.userHandle} numberOfLines={1}>
                      @{user.username}
                    </Text>
                    <Text
                      style={[
                        styles.presenceLabel,
                        online ? styles.presenceLabelOnline : styles.presenceLabelOffline,
                      ]}
                    >
                      • {online ? "Online" : "Offline"}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Full Directory & Search Modal */}
      <Modal
        visible={showFullDirectory}
        animationType="slide"
        onRequestClose={() => setShowFullDirectory(false)}
      >
        <View style={styles.directoryModalContainer}>
          {/* Directory Header */}
          <View style={styles.directoryHeader}>
            <View>
              <Text style={styles.directoryTitle}>Member Directory</Text>
              <Text style={styles.directorySubtitle}>
                🟢 {onlineCount} online • {users.length} registered
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setShowFullDirectory(false)}
              style={styles.closeDirectoryButton}
            >
              <Text style={styles.closeDirectoryText}>Done</Text>
            </TouchableOpacity>
          </View>

          {/* Directory Search Bar */}
          <View style={styles.directorySearchWrapper}>
            <View style={styles.searchBar}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Search by @username, name, or phone..."
                placeholderTextColor="#9CA3AF"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity
                  onPress={() => setSearchQuery("")}
                  style={styles.clearSearchButton}
                >
                  <Text style={styles.clearSearchText}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Directory Users List */}
          <FlatList
            data={sortedAndFilteredUsers}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.directoryListContent}
            ListEmptyComponent={
              <View style={styles.emptyDirectoryBox}>
                <Text style={styles.emptyDirectoryIcon}>🔍</Text>
                <Text style={styles.emptyDirectoryTitle}>No matching users</Text>
                <Text style={styles.emptyDirectoryDesc}>
                  We could not find any registered user matching &quot;{searchQuery}&quot;.
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const isMe = item.id === currentUserId;
              const online = isUserOnline(item.id);

              return (
                <TouchableOpacity
                  style={[styles.directoryCard, isMe ? styles.directoryCardMe : null]}
                  onPress={() => setSelectedUser(item)}
                  activeOpacity={0.7}
                >
                  <UserAvatar
                    name={item.name}
                    username={item.username}
                    avatarUrl={item.avatarUrl}
                    size={44}
                    fontSize={17}
                    showOnlineDot={true}
                    isOnline={online}
                  />

                  <View style={styles.directoryCardInfo}>
                    <View style={styles.directoryCardNameRow}>
                      <Text style={styles.directoryCardName}>{item.name}</Text>
                      {isMe && (
                        <View style={styles.youBadge}>
                          <Text style={styles.youBadgeText}>You</Text>
                        </View>
                      )}
                      <View
                        style={[
                          styles.statusPill,
                          online ? styles.statusPillOnline : styles.statusPillOffline,
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusPillText,
                            online ? styles.statusPillTextOnline : styles.statusPillTextOffline,
                          ]}
                        >
                          {online ? "Online" : "Offline"}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.directoryCardHandle}>@{item.username}</Text>
                    <Text style={styles.directoryCardPhone}>📞 {item.phoneNumber}</Text>
                  </View>

                  <View style={styles.directoryCardActions}>
                    {onMentionUser && !isMe && (
                      <TouchableOpacity
                        style={styles.mentionButton}
                        onPress={() => {
                          onMentionUser(item.username);
                          setShowFullDirectory(false);
                        }}
                      >
                        <Text style={styles.mentionButtonText}>Mention</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </Modal>

      {/* Single User Profile Detail Modal */}
      <Modal
        visible={!!selectedUser}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedUser(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedUser && (
              <>
                <UserAvatar
                  name={selectedUser.name}
                  username={selectedUser.username}
                  avatarUrl={selectedUser.avatarUrl}
                  size={72}
                  fontSize={28}
                  showOnlineDot={true}
                  isOnline={isUserOnline(selectedUser.id)}
                  style={{ marginBottom: 12 }}
                />

                <Text style={styles.modalName}>{selectedUser.name}</Text>
                <Text style={styles.modalHandle}>@{selectedUser.username}</Text>

                {/* Online / Offline status badge */}
                <View
                  style={[
                    styles.modalStatusBadge,
                    isUserOnline(selectedUser.id)
                      ? styles.modalStatusBadgeOnline
                      : styles.modalStatusBadgeOffline,
                  ]}
                >
                  <View
                    style={[
                      styles.modalStatusDot,
                      isUserOnline(selectedUser.id)
                        ? styles.presenceDotOnline
                        : styles.presenceDotOffline,
                    ]}
                  />
                  <Text
                    style={[
                      styles.modalStatusText,
                      isUserOnline(selectedUser.id)
                        ? styles.modalStatusTextOnline
                        : styles.modalStatusTextOffline,
                    ]}
                  >
                    {isUserOnline(selectedUser.id) ? "Active & Online Now" : "Currently Offline"}
                  </Text>
                </View>

                <View style={styles.modalDivider} />

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>📞 Phone Number</Text>
                  <Text style={styles.detailValue}>{selectedUser.phoneNumber}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>🆔 User ID</Text>
                  <Text style={styles.detailValue} numberOfLines={1}>
                    {selectedUser.id}
                  </Text>
                </View>

                {selectedUser.createdAt && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>📅 Registered</Text>
                    <Text style={styles.detailValue}>
                      {new Date(selectedUser.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                )}

                <View style={styles.modalActionRow}>
                  {onMentionUser && selectedUser.id !== currentUserId && (
                    <TouchableOpacity
                      style={styles.modalMentionButton}
                      onPress={() => {
                        onMentionUser(selectedUser.username);
                        setSelectedUser(null);
                        setShowFullDirectory(false);
                      }}
                    >
                      <Text style={styles.modalMentionText}>
                        Mention @{selectedUser.username}
                      </Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={styles.closeModalButton}
                    onPress={() => setSelectedUser(null)}
                  >
                    <Text style={styles.closeModalButtonText}>Close</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    paddingTop: 8,
    paddingBottom: 8,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  titleWithIcon: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  icon: {
    fontSize: 14,
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
    color: "#374151",
  },
  onlineSummaryBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ECFDF5",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: "#A7F3D0",
    gap: 4,
  },
  onlineDotMini: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#10B981",
  },
  onlineSummaryText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#065F46",
  },
  countBadge: {
    backgroundColor: "#F3F4F6",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  countText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#4B5563",
  },
  directoryButton: {
    backgroundColor: "#EFF6FF",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#DBEAFE",
  },
  directoryButtonText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#2563EB",
  },
  searchBarWrapper: {
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  searchIcon: {
    fontSize: 13,
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: "#111827",
    padding: 0,
  },
  clearSearchButton: {
    padding: 2,
  },
  clearSearchText: {
    fontSize: 12,
    color: "#9CA3AF",
    fontWeight: "700",
  },
  scrollContent: {
    paddingHorizontal: 14,
    gap: 10,
    paddingBottom: 4,
  },
  emptySearchContainer: {
    paddingVertical: 10,
    alignItems: "center",
  },
  emptySearchText: {
    fontSize: 12,
    color: "#9CA3AF",
    fontStyle: "italic",
  },
  userChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 8,
  },
  userChipOnline: {
    borderColor: "#A7F3D0",
  },
  userChipOffline: {
    borderColor: "#E5E7EB",
    opacity: 0.85,
  },
  userChipMe: {
    backgroundColor: "#EFF6FF",
    borderColor: "#93C5FD",
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  avatarInitial: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 13,
  },
  presenceDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    position: "absolute",
    bottom: -1,
    right: -1,
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
  presenceDotOnline: {
    backgroundColor: "#10B981",
  },
  presenceDotOffline: {
    backgroundColor: "#9CA3AF",
  },
  userInfo: {
    maxWidth: 130,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  userName: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1F2937",
  },
  userNameMe: {
    color: "#1D4ED8",
  },
  youBadge: {
    backgroundColor: "#2563EB",
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  youBadgeText: {
    fontSize: 9,
    color: "#FFFFFF",
    fontWeight: "700",
  },
  handleAndStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  userHandle: {
    fontSize: 11,
    color: "#6B7280",
    maxWidth: 70,
  },
  presenceLabel: {
    fontSize: 10,
    fontWeight: "600",
  },
  presenceLabelOnline: {
    color: "#059669",
  },
  presenceLabelOffline: {
    color: "#9CA3AF",
  },
  /* Full Directory Modal */
  directoryModalContainer: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  directoryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  directoryTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
  },
  directorySubtitle: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
  closeDirectoryButton: {
    backgroundColor: "#2563EB",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  closeDirectoryText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  directorySearchWrapper: {
    padding: 14,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  directoryListContent: {
    padding: 14,
    gap: 10,
  },
  directoryCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  directoryCardMe: {
    borderColor: "#93C5FD",
    backgroundColor: "#F0F7FF",
  },
  directoryAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
    position: "relative",
  },
  directoryAvatarText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
  },
  directoryPresenceDot: {
    width: 11,
    height: 11,
    borderRadius: 5.5,
    position: "absolute",
    bottom: 0,
    right: 0,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  directoryPresenceDotOnline: {
    backgroundColor: "#10B981",
  },
  directoryPresenceDotOffline: {
    backgroundColor: "#9CA3AF",
  },
  directoryCardInfo: {
    flex: 1,
  },
  directoryCardNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  directoryCardName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  statusPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusPillOnline: {
    backgroundColor: "#ECFDF5",
  },
  statusPillOffline: {
    backgroundColor: "#F3F4F6",
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: "700",
  },
  statusPillTextOnline: {
    color: "#059669",
  },
  statusPillTextOffline: {
    color: "#6B7280",
  },
  directoryCardHandle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#4F46E5",
    marginTop: 1,
  },
  directoryCardPhone: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
  directoryCardActions: {
    marginLeft: 8,
  },
  mentionButton: {
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  mentionButtonText: {
    fontSize: 12,
    color: "#2563EB",
    fontWeight: "700",
  },
  emptyDirectoryBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    paddingHorizontal: 20,
  },
  emptyDirectoryIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptyDirectoryTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 4,
  },
  emptyDirectoryDesc: {
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
  },
  /* Profile Modal */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContent: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  modalAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  modalAvatarText: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "800",
  },
  modalName: {
    fontSize: 20,
    fontWeight: "800",
    color: "#111827",
  },
  modalHandle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4F46E5",
    marginTop: 2,
    marginBottom: 8,
  },
  modalStatusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
    marginBottom: 16,
  },
  modalStatusBadgeOnline: {
    backgroundColor: "#ECFDF5",
  },
  modalStatusBadgeOffline: {
    backgroundColor: "#F3F4F6",
  },
  modalStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  modalStatusText: {
    fontSize: 12,
    fontWeight: "700",
  },
  modalStatusTextOnline: {
    color: "#059669",
  },
  modalStatusTextOffline: {
    color: "#6B7280",
  },
  modalDivider: {
    width: "100%",
    height: 1,
    backgroundColor: "#E5E7EB",
    marginBottom: 16,
  },
  detailRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  detailLabel: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "500",
  },
  detailValue: {
    fontSize: 13,
    color: "#1F2937",
    fontWeight: "700",
    maxWidth: "55%",
  },
  modalActionRow: {
    width: "100%",
    marginTop: 18,
    gap: 8,
  },
  modalMentionButton: {
    backgroundColor: "#2563EB",
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
  },
  modalMentionText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  closeModalButton: {
    backgroundColor: "#F3F4F6",
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
  },
  closeModalButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#374151",
  },
});
