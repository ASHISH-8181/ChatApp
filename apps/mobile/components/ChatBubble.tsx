import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import type { ChatMessage, ChatUser, GroupMemberInfo, ReadReceipt } from "@chatapp/shared";
import { Fonts, Colors } from "@/constants/theme";
import { Ionicons } from "@/components/Icon";

interface ChatBubbleProps {
  message: ChatMessage;
  isMe: boolean;
  currentUserId?: string;
  members?: GroupMemberInfo[];
  users?: ChatUser[];
  isChugli?: boolean;
  onDelete?: (message: ChatMessage, deleteFor: "me" | "everyone") => void;
  onEdit?: (message: ChatMessage, newText: string) => void | Promise<void>;
}

function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return "";
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function getAvatarColor(seed: string): string {
  const colors = [
    "#3B82F6", // blue
    "#8B5CF6", // purple
    "#EC4899", // pink
    "#F97316", // orange
    "#10B981", // emerald
    "#06B6D4", // cyan
    "#6366F1", // indigo
    "#14B8A6", // teal
    "#F43F5E", // rose
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

interface ReaderAvatarBadgeProps {
  reader: ReadReceipt;
  isMe: boolean;
  members?: GroupMemberInfo[];
  users?: ChatUser[];
  alignRight?: boolean;
  isChugli?: boolean;
}

function ReaderAvatarBadge({
  reader,
  isMe,
  members,
  users,
  alignRight = true,
  isChugli = false,
}: ReaderAvatarBadgeProps) {
  const [isHovered, setIsHovered] = useState(false);

  const member = members?.find((m) => m.userId === reader.userId);
  const chugliAlias = member?.anonymousAlias;

  // Resolve user display name (strictly anonymousAlias in Chugli groups)
  const resolvedName = isChugli
    ? chugliAlias || (reader.userName && reader.userName !== "Member" ? reader.userName : "Secret Reader")
    : chugliAlias ||
      reader.userName ||
      member?.name ||
      users?.find((u) => u.id === reader.userId)?.name ||
      "Member";

  // Resolve username
  const rawUsername = isChugli
    ? "secret"
    : chugliAlias
    ? "secret"
    : reader.username ||
      member?.username ||
      users?.find((u) => u.id === reader.userId)?.username ||
      resolvedName.toLowerCase().replace(/\s+/g, "");

  const resolvedUsername = rawUsername.startsWith("@") ? rawUsername : `@${rawUsername}`;
  const initial = (resolvedName || "?").charAt(0).toUpperCase();
  const avatarColor = isChugli ? "#8B5CF6" : getAvatarColor(resolvedUsername || resolvedName);
  const readTimeStr = formatTime(reader.readAt) || "recently";

  return (
    <View style={[styles.badgeContainer, isHovered && styles.badgeContainerHovered]}>
      <Pressable
        onHoverIn={() => setIsHovered(true)}
        onHoverOut={() => setIsHovered(false)}
        onPress={() => setIsHovered((prev) => !prev)}
        style={({ pressed }) => [
          styles.miniAvatar,
          { backgroundColor: avatarColor },
          isMe ? styles.miniAvatarBorderMe : styles.miniAvatarBorderOther,
          (isHovered || pressed) && styles.miniAvatarActive,
        ]}
        hitSlop={6}
        accessibilityLabel={`Read by ${resolvedName} (${resolvedUsername})`}
      >
        <Text style={styles.miniAvatarInitial}>{initial}</Text>
      </Pressable>

      {/* Floating Expanded Profile Popover on Hover / Tap */}
      {isHovered && (
        <View
          style={[
            styles.popoverCard,
            alignRight ? styles.popoverAlignRight : styles.popoverAlignLeft,
          ]}
          pointerEvents="none"
        >
          {/* Header with avatar, display name, and username */}
          <View style={styles.popoverHeader}>
            <View style={[styles.popoverAvatar, { backgroundColor: avatarColor }]}>
              <Text style={styles.popoverAvatarInitial}>{initial}</Text>
            </View>
            <View style={styles.popoverUserInfo}>
              <Text style={styles.popoverName} numberOfLines={1}>
                {resolvedName}
              </Text>
              <Text style={styles.popoverUsername} numberOfLines={1}>
                {resolvedUsername}
              </Text>
            </View>
          </View>

          {/* Divider */}
          <View style={styles.popoverDivider} />

          {/* Read Receipt Status */}
          <View style={styles.popoverStatusRow}>
            <Text style={styles.popoverCheckmark}>✓✓</Text>
            <Text style={styles.popoverStatusText}>Read at {readTimeStr}</Text>
          </View>

          {/* Caret pointer notch pointing down at the avatar */}
          <View
            style={[
              styles.popoverCaret,
              alignRight ? styles.popoverCaretRight : styles.popoverCaretLeft,
            ]}
          />
        </View>
      )}
    </View>
  );
}

export function ChatBubble({
  message,
  isMe,
  currentUserId,
  members,
  users,
  isChugli = false,
  onDelete,
  onEdit,
}: ChatBubbleProps) {
  const [showOptionsModal, setShowOptionsModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showReadersModal, setShowReadersModal] = useState(false);
  const [isBubbleHovered, setIsBubbleHovered] = useState(false);
  const [isSelected, setIsSelected] = useState(false);
  const [editText, setEditText] = useState(message.text);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const hoverTimeoutRef = useRef<any>(null);
  const [entranceAnim] = useState(() => new Animated.Value(0));

  const FIVE_MINUTES_MS = 5 * 60 * 1000;

  const getRemainingEditTimeMs = () => {
    const createdTime = new Date(message.createdAt).getTime();
    if (isNaN(createdTime)) return 0;
    const elapsed = Date.now() - createdTime;
    return Math.max(0, FIVE_MINUTES_MS - elapsed);
  };

  const isDeleted = Boolean(message.isDeletedForEveryone);

  // Live timer for 5-minute countdown when modal is opened or mounted
  useEffect(() => {
    const updateTimer = () => {
      const createdTime = new Date(message.createdAt).getTime();
      if (isNaN(createdTime)) {
        setRemainingSeconds(0);
        return;
      }
      const elapsed = Date.now() - createdTime;
      const msLeft = Math.max(0, FIVE_MINUTES_MS - elapsed);
      setRemainingSeconds(Math.ceil(msLeft / 1000));
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [message.createdAt, FIVE_MINUTES_MS]);

  const canEdit = isMe && !isDeleted && remainingSeconds > 0;
  const mins = Math.floor(remainingSeconds / 60);
  const secs = remainingSeconds % 60;
  const countdownFormatted = `${mins}:${secs < 10 ? "0" : ""}${secs}`;

  const handleHoverIn = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setIsBubbleHovered(true);
  };

  const handleHoverOut = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    hoverTimeoutRef.current = setTimeout(() => {
      setIsBubbleHovered(false);
    }, 400); // 400ms grace period so moving cursor to action button never vanishes
  };

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    Animated.spring(entranceAnim, {
      toValue: 1,
      friction: 8,
      tension: 70,
      useNativeDriver: true,
    }).start();
  }, [entranceAnim]);

  const timeStr = formatTime(message.createdAt);
  const senderDisplayName = isChugli
    ? message.senderName || "Secret Member"
    : message.senderName;
  const senderDisplayUsername = isChugli
    ? "secret"
    : message.senderUsername;

  const initial = (senderDisplayName || "?").charAt(0).toUpperCase();
  const avatarColor = isChugli
    ? "#8B5CF6"
    : getAvatarColor(senderDisplayUsername || senderDisplayName || "");

  // Readers excluding the message sender themselves
  const readers = (message.reads || []).filter(
    (r) => r.userId !== message.senderId
  );
  const hasReaders = readers.length > 0;

  const deletedByName =
    message.deletedByUsername ||
    senderDisplayUsername ||
    senderDisplayName ||
    "user";

  const handleOpenOptions = () => {
    setIsSelected(true);
    setEditError(null);
    const msLeft = getRemainingEditTimeMs();
    setRemainingSeconds(Math.ceil(msLeft / 1000));
    setShowOptionsModal(true);
  };

  const handleSelectEdit = () => {
    setShowOptionsModal(false);
    setEditText(message.text);
    setEditError(null);
    setShowEditModal(true);
  };

  const handleSelectDelete = () => {
    setShowOptionsModal(false);
    setShowDeleteModal(true);
  };

  const handleSaveEdit = async () => {
    const trimmed = editText.trim();
    if (!trimmed) {
      setEditError("Message cannot be empty.");
      return;
    }
    if (trimmed === message.text) {
      setShowEditModal(false);
      setIsSelected(false);
      return;
    }
    if (getRemainingEditTimeMs() <= 0) {
      setEditError("The 5-minute editing window has expired.");
      return;
    }

    try {
      setIsSavingEdit(true);
      setEditError(null);
      await onEdit?.(message, trimmed);
      setShowEditModal(false);
      setIsSelected(false);
    } catch (err: any) {
      setEditError(err.message || "Failed to update message.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  return (
    <>
      {isMe ? (
        <Animated.View
          style={[
            styles.row,
            styles.rowMe,
            {
              opacity: entranceAnim,
              transform: [
                {
                  translateY: entranceAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [5, 0],
                  }),
                },
              ],
            },
          ]}
        >
          {/* Group wrapper handling hover for both bubble and action button */}
          <Pressable
            style={styles.bubbleGroupRowMe}
            onHoverIn={handleHoverIn}
            onHoverOut={handleHoverOut}
          >
            {/* Action icon for web hover / direct tap */}
            {(onDelete || onEdit) && isBubbleHovered && (
              <Pressable
                style={({ pressed }) => [
                  styles.actionIconBtn,
                  pressed && { opacity: 0.7 },
                ]}
                onPress={handleOpenOptions}
                hitSlop={12}
                accessibilityLabel="Message options"
              >
                <Ionicons name="ellipsis-horizontal" size={15} color={Colors.textPrimary} />
              </Pressable>
            )}

            <Pressable
              onLongPress={handleOpenOptions}
              delayLongPress={300}
              style={[
                styles.bubble,
                isDeleted ? styles.bubbleMeDeleted : styles.bubbleMe,
                message.isEdited && !isDeleted && styles.bubbleMeEdited,
                isSelected && styles.bubbleMeSelected,
              ]}
            >
              {isDeleted ? (
                /* Tombstone: deleted for everyone notice in small font */
                <View style={styles.deletedRow}>
                  <Ionicons name="ban-outline" size={13} color="#CBD5E1" style={styles.deletedIcon} />
                  <Text style={styles.deletedTextMe}>
                    This message was deleted by @{deletedByName}
                  </Text>
                </View>
              ) : (
                <Text style={styles.textMe}>{message.text}</Text>
              )}

              <View style={styles.footerMe}>
                <View style={styles.timeAndEditRow}>
                  {timeStr ? (
                    <Text style={isDeleted ? styles.timeMeDeleted : styles.timeMe}>
                      {timeStr}
                    </Text>
                  ) : null}
                  {message.isEdited && !isDeleted ? (
                    <Text style={styles.editedIndicatorMe}>• edited</Text>
                  ) : null}
                </View>

                {!isDeleted && (
                  <>
                    {!hasReaders ? (
                      <View style={styles.statusRow}>
                        <Text style={styles.singleCheck}>✓</Text>
                        <Text style={styles.statusText}>Sent</Text>
                      </View>
                    ) : (
                      <View style={styles.readersGroupMe}>
                        <Text style={styles.doubleCheck}>✓✓</Text>
                        <View style={styles.avatarsRow}>
                          {readers.slice(0, 5).map((reader) => (
                            <ReaderAvatarBadge
                              key={reader.userId}
                              reader={reader}
                              isMe={true}
                              members={members}
                              users={users}
                              alignRight={true}
                              isChugli={isChugli}
                            />
                          ))}
                          {readers.length > 5 && (
                            <TouchableOpacity
                              onPress={() => setShowReadersModal(true)}
                              style={styles.moreBadgeMe}
                              activeOpacity={0.7}
                            >
                              <Text style={styles.moreBadgeTextMe}>
                                +{readers.length - 5}
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    )}
                  </>
                )}
              </View>
            </Pressable>
          </Pressable>
        </Animated.View>
      ) : (
        <Animated.View
          style={[
            styles.row,
            styles.rowOther,
            {
              opacity: entranceAnim,
              transform: [
                {
                  translateY: entranceAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [5, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <View style={styles.contentOther}>
            <View style={styles.senderHeader}>
              <Text style={styles.senderName}>{senderDisplayName}</Text>
              {senderDisplayUsername ? (
                <Text style={styles.senderUsername}>@{senderDisplayUsername}</Text>
              ) : null}
            </View>

            {/* Group wrapper handling hover for both other bubble and action button */}
            <Pressable
              style={styles.bubbleGroupRowOther}
              onHoverIn={handleHoverIn}
              onHoverOut={handleHoverOut}
            >
              <Pressable
                onLongPress={handleOpenOptions}
                delayLongPress={300}
                style={[
                  styles.bubble,
                  isDeleted ? styles.bubbleOtherDeleted : styles.bubbleOther,
                  message.isEdited && !isDeleted && styles.bubbleOtherEdited,
                  isSelected && styles.bubbleOtherSelected,
                ]}
              >
                {isDeleted ? (
                  /* Tombstone: deleted for everyone notice in small font */
                  <View style={styles.deletedRow}>
                    <Ionicons name="ban-outline" size={13} color={Colors.textMuted} style={styles.deletedIcon} />
                    <Text style={styles.deletedTextOther}>
                      This message was deleted by @{deletedByName}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.textOther}>{message.text}</Text>
                )}

                <View style={styles.footerOther}>
                  <View style={styles.timeAndEditRow}>
                    {timeStr ? <Text style={styles.timeOther}>{timeStr}</Text> : null}
                    {message.isEdited && !isDeleted ? (
                      <Text style={styles.editedIndicatorOther}>• edited</Text>
                    ) : null}
                  </View>

                  {!isDeleted && hasReaders && (
                    <View style={styles.readersGroupOther}>
                      <Text style={styles.doubleCheckOther}>✓✓</Text>
                      <View style={styles.avatarsRow}>
                        {readers.slice(0, 5).map((reader) => (
                          <ReaderAvatarBadge
                            key={reader.userId}
                            reader={reader}
                            isMe={false}
                            members={members}
                            users={users}
                            alignRight={false}
                            isChugli={isChugli}
                          />
                        ))}
                        {readers.length > 5 && (
                          <TouchableOpacity
                            onPress={() => setShowReadersModal(true)}
                            style={styles.moreBadgeOther}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.moreBadgeTextOther}>
                              +{readers.length - 5}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  )}
                </View>
              </Pressable>

              {/* Action icon for web hover / direct tap */}
              {(onDelete || onEdit) && isBubbleHovered && (
                <Pressable
                  style={({ pressed }) => [
                    styles.actionIconBtn,
                    pressed && { opacity: 0.7 },
                  ]}
                  onPress={handleOpenOptions}
                  hitSlop={12}
                  accessibilityLabel="Message options"
                >
                  <Ionicons name="ellipsis-horizontal" size={15} color={Colors.textPrimary} />
                </Pressable>
              )}
            </Pressable>
          </View>
        </Animated.View>
      )}

      {/* Message Options Action Sheet Modal (Long-Press Menu) */}
      <Modal
        visible={showOptionsModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowOptionsModal(false);
          setIsSelected(false);
        }}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => {
            setShowOptionsModal(false);
            setIsSelected(false);
          }}
        >
          <Pressable style={styles.actionModalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.actionModalHeader}>
              <View style={styles.actionModalHandle} />
              <Text style={styles.actionModalTitle}>Message Options</Text>
              <Text style={styles.actionModalSubtitle}>
                {canEdit
                  ? `Sent recently • ${mins}m ${secs}s left to edit`
                  : "Choose an action for this message"}
              </Text>
            </View>

            {/* Message preview snippet */}
            <View style={styles.actionPreviewBox}>
              <Text style={styles.actionPreviewText} numberOfLines={2}>
                &ldquo;{message.text}&rdquo;
              </Text>
            </View>

            <View style={styles.actionButtonsList}>
              {/* Option 1: Edit message (ONLY visible within 5 min after sent, disappears after that) */}
              {canEdit && (
                <TouchableOpacity
                  style={styles.actionOptionBtn}
                  onPress={handleSelectEdit}
                  activeOpacity={0.7}
                >
                  <View style={[styles.actionOptionIcon, styles.actionOptionIconEdit]}>
                    <Ionicons name="pencil-outline" size={18} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.actionOptionTitle}>Edit message</Text>
                    <Text style={styles.actionOptionDesc}>
                      Editable for {mins}m {secs}s more
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                </TouchableOpacity>
              )}

              {/* Option 2: Delete message (opens current delete flow with no changes) */}
              {onDelete && (
                <TouchableOpacity
                  style={[styles.actionOptionBtn, styles.actionOptionBtnDelete]}
                  onPress={handleSelectDelete}
                  activeOpacity={0.7}
                >
                  <View style={[styles.actionOptionIcon, styles.actionOptionIconDelete]}>
                    <Ionicons name="trash-outline" size={18} color="#EF4444" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.actionOptionTitle, styles.actionOptionTitleDelete]}>
                      Delete message
                    </Text>
                    <Text style={styles.actionOptionDesc}>
                      {isMe ? "Delete for me or delete for everyone" : "Delete for me"}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            {/* Cancel Button */}
            <TouchableOpacity
              style={styles.cancelModalButton}
              onPress={() => {
                setShowOptionsModal(false);
                setIsSelected(false);
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.cancelModalButtonText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Edit Message Modal */}
      <Modal
        visible={showEditModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!isSavingEdit) {
            setShowEditModal(false);
            setIsSelected(false);
          }
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.editModalContent}>
            <View style={styles.editModalHeader}>
              <View style={styles.editIconWrap}>
                <Ionicons name="pencil" size={20} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.editModalTitle}>Edit Message</Text>
                <Text style={styles.editModalSubtitle}>
                  Messages can only be edited within 5 minutes of sending.
                </Text>
              </View>
            </View>

            {/* Live countdown remaining badge */}
            <View
              style={[
                styles.editTimerBadge,
                remainingSeconds <= 60 && styles.editTimerBadgeUrgent,
              ]}
            >
              <Ionicons
                name="time-outline"
                size={14}
                color={remainingSeconds <= 60 ? "#EF4444" : Colors.primary}
              />
              <Text
                style={[
                  styles.editTimerText,
                  remainingSeconds <= 60 && styles.editTimerTextUrgent,
                ]}
              >
                {remainingSeconds > 0
                  ? `${countdownFormatted} remaining to edit`
                  : "5-minute editing window has expired"}
              </Text>
            </View>

            {/* Text Input for Editing */}
            <View style={styles.editInputContainer}>
              <TextInput
                style={styles.editTextInput}
                value={editText}
                onChangeText={setEditText}
                placeholder="Edit message..."
                placeholderTextColor={Colors.textMuted}
                multiline
                maxLength={2000}
                autoFocus
                editable={!isSavingEdit && remainingSeconds > 0}
              />
              <Text style={styles.editCharCount}>
                {editText.length} / 2000
              </Text>
            </View>

            {/* Edit error banner if any */}
            {editError ? (
              <View style={styles.editErrorBanner}>
                <Ionicons name="alert-circle-outline" size={14} color="#EF4444" />
                <Text style={styles.editErrorText}>{editError}</Text>
              </View>
            ) : null}

            {/* Action Buttons */}
            <View style={styles.editModalActions}>
              <TouchableOpacity
                style={styles.editCancelBtn}
                onPress={() => {
                  setShowEditModal(false);
                  setIsSelected(false);
                }}
                disabled={isSavingEdit}
                activeOpacity={0.7}
              >
                <Text style={styles.editCancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.editSaveBtn,
                  (!editText.trim() ||
                    editText.trim() === message.text ||
                    remainingSeconds <= 0 ||
                    isSavingEdit) &&
                    styles.editSaveBtnDisabled,
                ]}
                onPress={handleSaveEdit}
                disabled={
                  !editText.trim() ||
                  editText.trim() === message.text ||
                  remainingSeconds <= 0 ||
                  isSavingEdit
                }
                activeOpacity={0.8}
              >
                {isSavingEdit ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.editSaveBtnText}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Delete Confirmation & Choice Modal (Current flow unchanged) */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowDeleteModal(false);
          setIsSelected(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.deleteModalContent}>
            <View style={styles.deleteModalHeader}>
              <View style={styles.deleteIconWrap}>
                <Ionicons name="trash-outline" size={20} color="#EF4444" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.deleteModalTitle}>Delete Message?</Text>
                <Text style={styles.deleteModalSubtitle}>
                  Choose how you would like to delete this message.
                </Text>
              </View>
            </View>

            {/* Message preview snippet */}
            <View style={styles.deletePreviewBox}>
              <Text style={styles.deletePreviewText} numberOfLines={2}>
                &ldquo;{message.text}&rdquo;
              </Text>
            </View>

            {/* Delete Actions */}
            <View style={styles.deleteActionsList}>
              {/* Option 1: Delete For Me */}
              <TouchableOpacity
                style={styles.deleteOptionBtn}
                onPress={() => {
                  setShowDeleteModal(false);
                  setIsSelected(false);
                  onDelete?.(message, "me");
                }}
                activeOpacity={0.7}
              >
                <View style={styles.deleteOptionIcon}>
                  <Ionicons name="trash-outline" size={18} color={Colors.textPrimary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.deleteOptionTitle}>Delete for me</Text>
                  <Text style={styles.deleteOptionDesc}>
                    Remove this message from your device only
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Option 2: Delete For Everyone (Only sender can delete for everyone) */}
              {isMe && !isDeleted && (
                <TouchableOpacity
                  style={[styles.deleteOptionBtn, styles.deleteOptionBtnDanger]}
                  onPress={() => {
                    setShowDeleteModal(false);
                    setIsSelected(false);
                    onDelete?.(message, "everyone");
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.deleteOptionIcon, styles.deleteOptionIconDanger]}>
                    <Ionicons name="people-outline" size={18} color="#EF4444" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.deleteOptionTitle, styles.deleteOptionTitleDanger]}>
                      Delete for everyone
                    </Text>
                    <Text style={styles.deleteOptionDesc}>
                      Deletes for all screens with a small notice showing it was deleted by you
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>

            {/* Cancel Button */}
            <TouchableOpacity
              style={styles.cancelModalButton}
              onPress={() => {
                setShowDeleteModal(false);
                setIsSelected(false);
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.cancelModalButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Full Readers List Modal (for large groups or explicit tap) */}
      <Modal
        visible={showReadersModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowReadersModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Message Read Receipts</Text>
              <Text style={styles.modalSubtitle}>
                Read by {readers.length} member{readers.length === 1 ? "" : "s"}
              </Text>
            </View>

            <View style={styles.readersList}>
              {readers.map((reader) => {
                const member = members?.find((m) => m.userId === reader.userId);
                const chugliAlias = member?.anonymousAlias;

                const resolvedName = isChugli
                  ? chugliAlias || (reader.userName && reader.userName !== "Member" ? reader.userName : "Secret Reader")
                  : chugliAlias ||
                    reader.userName ||
                    member?.name ||
                    users?.find((u) => u.id === reader.userId)?.name ||
                    "Member";
                const rawUsername = isChugli
                  ? "secret"
                  : chugliAlias
                  ? "secret"
                  : reader.username ||
                    member?.username ||
                    users?.find((u) => u.id === reader.userId)?.username ||
                    resolvedName.toLowerCase().replace(/\s+/g, "");
                const resolvedUsername = rawUsername.startsWith("@")
                  ? rawUsername
                  : `@${rawUsername}`;
                const initialLetter = (resolvedName || "?").charAt(0).toUpperCase();

                return (
                  <View key={reader.userId} style={styles.readerItem}>
                    <View
                      style={[
                        styles.readerAvatar,
                        { backgroundColor: isChugli ? "#8B5CF6" : getAvatarColor(resolvedUsername || resolvedName) },
                      ]}
                    >
                      <Text style={styles.readerAvatarText}>{initialLetter}</Text>
                    </View>
                    <View style={styles.readerInfo}>
                      <Text style={styles.readerName}>{resolvedName}</Text>
                      <Text style={styles.readerUsername}>{resolvedUsername}</Text>
                      <Text style={styles.readerTime}>
                        Read at {formatTime(reader.readAt) || "Recently"}
                      </Text>
                    </View>
                    <Text style={styles.readerCheck}>✓✓</Text>
                  </View>
                );
              })}
            </View>

            <TouchableOpacity
              style={styles.closeModalButton}
              onPress={() => setShowReadersModal(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.closeModalButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    marginVertical: 4,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "flex-end",
    overflow: "visible",
  },
  rowMe: {
    justifyContent: "flex-end",
  },
  rowOther: {
    justifyContent: "flex-start",
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
    marginBottom: 4,
  },
  avatarText: {
    color: "#FFFFFF",
    fontFamily: Fonts.bold,
    fontSize: 14,
  },
  contentOther: {
    maxWidth: "80%",
    alignItems: "flex-start",
    overflow: "visible",
  },
  senderHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginLeft: 4,
    marginBottom: 3,
  },
  senderName: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: Colors.textSecondary,
  },
  senderUsername: {
    fontSize: 11,
    color: Colors.primary,
    fontFamily: Fonts.medium,
  },
  bubble: {
    maxWidth: "85%",
    minWidth: 120,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 18,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
    overflow: "visible",
  },
  bubbleMe: {
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 4,
    minWidth: 135,
  },
  bubbleMeEdited: {
    minWidth: 165,
  },
  bubbleMeSelected: {
    borderWidth: 2,
    borderColor: "#93C5FD",
  },
  bubbleOther: {
    backgroundColor: Colors.card,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    minWidth: 120,
  },
  bubbleOtherEdited: {
    minWidth: 145,
  },
  bubbleOtherSelected: {
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  textMe: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: Fonts.bodyRegular,
    lineHeight: 21,
  },
  textOther: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontFamily: Fonts.bodyRegular,
    lineHeight: 21,
  },
  footerMe: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
    marginTop: 5,
    overflow: "visible",
    flexWrap: "nowrap",
  },
  footerOther: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
    marginTop: 5,
    overflow: "visible",
    flexWrap: "nowrap",
  },
  timeAndEditRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  editedIndicatorMe: {
    fontSize: 9.5,
    color: "#BFDBFE",
    fontFamily: Fonts.bodyMedium,
    fontStyle: "italic",
    flexShrink: 0,
  },
  editedIndicatorOther: {
    fontSize: 9.5,
    color: Colors.textMuted,
    fontFamily: Fonts.bodyMedium,
    fontStyle: "italic",
    flexShrink: 0,
  },
  timeMe: {
    fontSize: 10,
    color: "#DBEAFE",
    fontFamily: Fonts.bodyMedium,
    flexShrink: 0,
  },
  timeOther: {
    fontSize: 10,
    color: Colors.textMuted,
    fontFamily: Fonts.bodyMedium,
    flexShrink: 0,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  singleCheck: {
    fontSize: 11,
    color: "#BFDBFE",
    fontWeight: "700",
  },
  statusText: {
    fontSize: 10,
    color: "#BFDBFE",
    fontFamily: Fonts.bodyMedium,
  },
  doubleCheck: {
    fontSize: 11,
    color: "#67E8F9", // bright cyan double check
    fontWeight: "800",
    marginRight: 2,
  },
  doubleCheckOther: {
    fontSize: 11,
    color: "#0284C7", // bright blue double check
    fontWeight: "800",
    marginRight: 2,
  },
  readersGroupMe: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    overflow: "visible",
  },
  readersGroupOther: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    overflow: "visible",
  },
  avatarsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    overflow: "visible",
  },

  /* Mini Avatar Badge & Popover */
  badgeContainer: {
    position: "relative",
    zIndex: 20,
  },
  badgeContainerHovered: {
    zIndex: 99999,
  },
  miniAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
    cursor: Platform.OS === "web" ? "pointer" : "auto",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  miniAvatarBorderMe: {
    borderWidth: 1.5,
    borderColor: "#93C5FD",
  },
  miniAvatarBorderOther: {
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
  miniAvatarActive: {
    transform: [{ scale: 1.15 }],
    borderColor: "#FBBF24",
  },
  miniAvatarInitial: {
    color: "#FFFFFF",
    fontSize: 10,
    fontFamily: Fonts.bold,
  },

  /* Popover Floating Profile Card */
  popoverCard: {
    position: "absolute",
    bottom: 30,
    width: 200,
    backgroundColor: "#0F172A",
    borderRadius: 12,
    padding: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 25,
    borderWidth: 1,
    borderColor: "#334155",
    zIndex: 99999,
  },
  popoverAlignRight: {
    right: -6,
  },
  popoverAlignLeft: {
    left: -6,
  },
  popoverHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  popoverAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  popoverAvatarInitial: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: Fonts.bold,
  },
  popoverUserInfo: {
    flex: 1,
  },
  popoverName: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: "#F8FAFC",
  },
  popoverUsername: {
    fontSize: 11,
    fontFamily: Fonts.medium,
    color: "#60A5FA",
    marginTop: 1,
  },
  popoverDivider: {
    height: 1,
    backgroundColor: "#1E293B",
    marginVertical: 7,
  },
  popoverStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  popoverCheckmark: {
    fontSize: 11,
    color: "#38BDF8",
    fontWeight: "800",
  },
  popoverStatusText: {
    fontSize: 10,
    color: "#94A3B8",
    fontFamily: Fonts.bodyMedium,
  },
  popoverCaret: {
    position: "absolute",
    bottom: -6,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 6,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#0F172A",
  },
  popoverCaretRight: {
    right: 10,
  },
  popoverCaretLeft: {
    left: 10,
  },

  /* More readers badge (+N) */
  moreBadgeMe: {
    height: 22,
    paddingHorizontal: 5,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.25)",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 2,
  },
  moreBadgeTextMe: {
    color: "#FFFFFF",
    fontSize: 10,
    fontFamily: Fonts.bold,
  },
  moreBadgeOther: {
    height: 22,
    paddingHorizontal: 5,
    borderRadius: 11,
    backgroundColor: Colors.borderLight,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 2,
  },
  moreBadgeTextOther: {
    color: Colors.textSecondary,
    fontSize: 10,
    fontFamily: Fonts.bold,
  },

  /* Readers Modal */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContent: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: Colors.card,
    borderRadius: 20,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  modalHeader: {
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    paddingBottom: 10,
  },
  modalTitle: {
    fontSize: 16,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
  },
  modalSubtitle: {
    fontSize: 12,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textMuted,
    marginTop: 2,
  },
  readersList: {
    gap: 10,
    maxHeight: 280,
  },
  readerItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 5,
  },
  readerAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  readerAvatarText: {
    color: "#FFFFFF",
    fontFamily: Fonts.bold,
    fontSize: 14,
  },
  readerInfo: {
    flex: 1,
  },
  readerName: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
  },
  readerUsername: {
    fontSize: 11,
    fontFamily: Fonts.medium,
    color: Colors.primary,
    marginTop: 1,
  },
  readerTime: {
    fontSize: 11,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textMuted,
    marginTop: 1,
  },
  readerCheck: {
    fontSize: 12,
    color: "#0284C7",
    fontWeight: "800",
  },
  closeModalButton: {
    marginTop: 16,
    backgroundColor: Colors.backgroundSecondary,
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: "center",
  },
  closeModalButtonText: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Colors.textSecondary,
  },

  /* Deleted Message Tombstone Styles (Small font per requirement) */
  bubbleMeDeleted: {
    backgroundColor: "rgba(30, 41, 59, 0.75)",
    borderWidth: 1,
    borderColor: "#334155",
    borderStyle: "dashed",
    borderBottomRightRadius: 4,
  },
  bubbleOtherDeleted: {
    backgroundColor: Colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderStyle: "dashed",
    borderBottomLeftRadius: 4,
  },
  deletedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 2,
  },
  deletedIcon: {
    opacity: 0.7,
  },
  deletedTextMe: {
    color: "#CBD5E1",
    fontSize: 11,
    fontStyle: "italic",
    fontFamily: Fonts.bodyMedium,
  },
  deletedTextOther: {
    color: Colors.textMuted,
    fontSize: 11,
    fontStyle: "italic",
    fontFamily: Fonts.bodyMedium,
  },
  timeMeDeleted: {
    fontSize: 9,
    color: "#64748B",
    fontFamily: Fonts.bodyMedium,
  },

  /* Group wrapper preventing hover gaps */
  bubbleGroupRowMe: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "flex-end",
    maxWidth: "88%",
  },
  bubbleGroupRowOther: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "flex-start",
    maxWidth: "100%",
  },

  /* Delete trigger action button */
  actionIconBtn: {
    padding: 7,
    borderRadius: 16,
    backgroundColor: Colors.card,
    marginHorizontal: 4,
    marginBottom: 6,
    cursor: Platform.OS === "web" ? "pointer" : "auto",
    borderWidth: 1,
    borderColor: Colors.borderLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 3,
    zIndex: 10,
  },

  /* Delete Confirmation Modal */
  deleteModalContent: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: Colors.card,
    borderRadius: 24,
    padding: 22,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  deleteModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  deleteIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  deleteModalTitle: {
    fontSize: 16,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
  },
  deleteModalSubtitle: {
    fontSize: 12,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textMuted,
    marginTop: 2,
  },
  deletePreviewBox: {
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 12,
    padding: 10,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
    marginBottom: 16,
  },
  deletePreviewText: {
    fontSize: 13,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textSecondary,
    fontStyle: "italic",
  },
  deleteActionsList: {
    gap: 10,
    marginBottom: 14,
  },
  deleteOptionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: Colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  deleteOptionBtnDanger: {
    backgroundColor: "rgba(239, 68, 68, 0.06)",
    borderColor: "rgba(239, 68, 68, 0.2)",
  },
  deleteOptionIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.card,
    justifyContent: "center",
    alignItems: "center",
  },
  deleteOptionIconDanger: {
    backgroundColor: "rgba(239, 68, 68, 0.12)",
  },
  deleteOptionTitle: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
  },
  deleteOptionTitleDanger: {
    color: "#EF4444",
  },
  deleteOptionDesc: {
    fontSize: 11,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textMuted,
    marginTop: 2,
    lineHeight: 15,
  },
  cancelModalButton: {
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    backgroundColor: Colors.backgroundSecondary,
  },
  cancelModalButtonText: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Colors.textSecondary,
  },

  /* Message Options Action Sheet Modal (Long-Press Menu) */
  actionModalContent: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: Colors.card,
    borderRadius: 24,
    padding: 22,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  actionModalHeader: {
    alignItems: "center",
    marginBottom: 14,
  },
  actionModalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.borderLight,
    marginBottom: 10,
  },
  actionModalTitle: {
    fontSize: 16,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
  },
  actionModalSubtitle: {
    fontSize: 12,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textMuted,
    marginTop: 2,
    textAlign: "center",
  },
  actionPreviewBox: {
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 12,
    padding: 10,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
    marginBottom: 16,
  },
  actionPreviewText: {
    fontSize: 13,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textSecondary,
    fontStyle: "italic",
  },
  actionButtonsList: {
    gap: 10,
    marginBottom: 14,
  },
  actionOptionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: Colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  actionOptionBtnDelete: {
    backgroundColor: "rgba(239, 68, 68, 0.04)",
    borderColor: "rgba(239, 68, 68, 0.15)",
  },
  actionOptionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.card,
    justifyContent: "center",
    alignItems: "center",
  },
  actionOptionIconEdit: {
    backgroundColor: "rgba(59, 130, 246, 0.12)",
  },
  actionOptionIconDelete: {
    backgroundColor: "rgba(239, 68, 68, 0.12)",
  },
  actionOptionTitle: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
  },
  actionOptionTitleDelete: {
    color: "#EF4444",
  },
  actionOptionDesc: {
    fontSize: 11,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textMuted,
    marginTop: 2,
  },

  /* Edit Message Modal Styles */
  editModalContent: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: Colors.card,
    borderRadius: 24,
    padding: 22,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  editModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  editIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(59, 130, 246, 0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  editModalTitle: {
    fontSize: 16,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
  },
  editModalSubtitle: {
    fontSize: 12,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textMuted,
    marginTop: 2,
  },
  editTimerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(59, 130, 246, 0.08)",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    alignSelf: "flex-start",
    marginBottom: 12,
  },
  editTimerBadgeUrgent: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
  },
  editTimerText: {
    fontSize: 12,
    fontFamily: Fonts.bodyMedium,
    color: Colors.primary,
  },
  editTimerTextUrgent: {
    color: "#EF4444",
  },
  editInputContainer: {
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    marginBottom: 12,
  },
  editTextInput: {
    fontSize: 15,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textPrimary,
    minHeight: 70,
    maxHeight: 160,
    textAlignVertical: "top",
  },
  editCharCount: {
    fontSize: 10,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textMuted,
    alignSelf: "flex-end",
    marginTop: 4,
  },
  editErrorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    padding: 8,
    borderRadius: 8,
    marginBottom: 12,
  },
  editErrorText: {
    fontSize: 12,
    fontFamily: Fonts.bodyMedium,
    color: "#EF4444",
    flex: 1,
  },
  editModalActions: {
    flexDirection: "row",
    gap: 10,
  },
  editCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    backgroundColor: Colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  editCancelBtnText: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: Colors.textSecondary,
  },
  editSaveBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primary,
  },
  editSaveBtnDisabled: {
    opacity: 0.5,
  },
  editSaveBtnText: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: "#FFFFFF",
  },
});

