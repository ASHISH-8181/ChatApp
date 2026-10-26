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
  TouchableWithoutFeedback,
  View,
} from "react-native";

import type { ChatMessage, ChatUser, GroupMemberInfo, ReadReceipt } from "@chatapp/shared";
import { Image } from "expo-image";
import { Fonts, Colors } from "@/constants/theme";
import { Ionicons } from "@/components/Icon";
import { translateToHindi, getCachedHindi, isHindiText } from "@/services/translation";
import { UserAvatar } from "@/components/UserAvatar";
import { VoiceNoteBubble } from "@/components/VoiceNoteBubble";
import { useTheme } from "@/store/theme-context";

interface ChatBubbleProps {
  message: ChatMessage;
  isMe: boolean;
  currentUserId?: string;
  members?: GroupMemberInfo[];
  users?: ChatUser[];
  isChugli?: boolean;
  liveTranslateHindi?: boolean;
  onDelete?: (message: ChatMessage, deleteFor: "me" | "everyone") => void;
  onEdit?: (message: ChatMessage, newText: string) => void | Promise<void>;
  onOpenViewOnce?: (message: ChatMessage) => void;
  onPressImage?: (imageUrl: string) => void;
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


const isEmojiOnly = (text?: string): boolean => {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed || trimmed === "Photo") return false;
  const stripped = trimmed.replace(
    /(\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Emoji_Modifier_Base}|\p{Emoji_Modifier}|\p{Emoji_Component}|\uFE0F|\u200D|\s)/gu,
    ""
  );
  return stripped.length === 0;
};

interface ReaderAvatarBadgeProps {
  reader: ReadReceipt;
  isMe: boolean;
  members?: GroupMemberInfo[];
  users?: ChatUser[];
  alignRight?: boolean;
  isChugli?: boolean;
}

export function ReaderAvatarBadge({
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
  const readTimeStr = formatTime(reader.readAt) || "recently";

  const readerUser = isChugli ? null : users?.find((u) => u.id === reader.userId);
  const readerAvatarUrl = readerUser?.avatarUrl;

  return (
    <View style={[styles.badgeContainer, isHovered && styles.badgeContainerHovered]}>
      <Pressable
        onHoverIn={() => setIsHovered(true)}
        onHoverOut={() => setIsHovered(false)}
        onPress={() => setIsHovered((prev) => !prev)}
        style={({ pressed }) => [
          (isHovered || pressed) && styles.miniAvatarActive,
        ]}
        hitSlop={6}
        accessibilityLabel={`Read by ${resolvedName} (${resolvedUsername})`}
      >
        <UserAvatar
          name={resolvedName}
          username={resolvedUsername}
          avatarUrl={readerAvatarUrl}
          size={16}
          fontSize={8}
          isChugli={isChugli}
          style={[
            styles.miniAvatar,
            isMe ? styles.miniAvatarBorderMe : styles.miniAvatarBorderOther,
          ]}
        />
      </Pressable>

      {/* Floating Expanded Profile Popover on Hover / Tap - dismissable on outside click */}
      <Modal
        visible={isHovered}
        transparent
        animationType="fade"
        onRequestClose={() => setIsHovered(false)}
      >
        <TouchableWithoutFeedback onPress={() => setIsHovered(false)}>
          <View style={styles.popoverBackdrop}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View style={styles.popoverCenterCard}>
                {/* Header with avatar, display name, and username */}
                <View style={styles.popoverHeader}>
                  <UserAvatar
                    name={resolvedName}
                    username={resolvedUsername}
                    avatarUrl={readerAvatarUrl}
                    size={38}
                    fontSize={15}
                    isChugli={isChugli}
                    style={styles.popoverAvatar}
                  />
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
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
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
  liveTranslateHindi = false,
  onDelete,
  onEdit,
  onOpenViewOnce,
  onPressImage,
}: ChatBubbleProps) {
  const { colors } = useTheme();
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

  // Live Hindi Translation State
  const [manualTranslate, setManualTranslate] = useState<boolean | null>(null);
  const [translatedHindi, setTranslatedHindi] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);

  const shouldTranslate = manualTranslate !== null ? manualTranslate : Boolean(liveTranslateHindi);
  const effectiveHindi = translatedHindi || getCachedHindi(message.text) || null;
  const isTranslationValid =
    Boolean(effectiveHindi) &&
    Boolean(effectiveHindi && /[\u0900-\u097F]/.test(effectiveHindi)) &&
    effectiveHindi?.trim().toLowerCase() !== message.text?.trim().toLowerCase();

  // Perform translation asynchronously when shouldTranslate is active
  useEffect(() => {
    if (
      Boolean(message.isDeletedForEveryone) ||
      !message.text ||
      message.text === "Photo" ||
      isHindiText(message.text) ||
      !shouldTranslate
    ) {
      return;
    }

    const cached = getCachedHindi(message.text);
    if (cached && /[\u0900-\u097F]/.test(cached)) {
      return;
    }

    let isMounted = true;
    Promise.resolve().then(async () => {
      if (!isMounted) return;
      setIsTranslating(true);
      try {
        const res = await translateToHindi(message.text);
        if (isMounted && res) {
          setTranslatedHindi(res);
        }
      } catch {
        // Fallback handled in translation service
      } finally {
        if (isMounted) {
          setIsTranslating(false);
        }
      }
    });

    return () => {
      isMounted = false;
    };
  }, [shouldTranslate, message.text, message.isDeletedForEveryone]);

  const FIVE_MINUTES_MS = 5 * 60 * 1000;

  const getRemainingEditTimeMs = () => {
    const createdTime = new Date(message.createdAt).getTime();
    if (isNaN(createdTime)) return 0;
    const elapsed = Date.now() - createdTime;
    return Math.max(0, FIVE_MINUTES_MS - elapsed);
  };

  const isDeleted = Boolean(message.isDeletedForEveryone);
  const isEmojiOnlyMessage = isEmojiOnly(message.text);
  const showQuickTranslate =
    !isDeleted &&
    !isEmojiOnlyMessage &&
    Boolean(message.text && message.text !== "Photo" && !isHindiText(message.text)) &&
    !shouldTranslate;

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
  const senderUser = isChugli ? null : users?.find((u) => u.id === message.senderId);
  const senderAvatarUrl = senderUser?.avatarUrl;

  // Readers excluding the message sender themselves
  const readers = (message.reads || []).filter(
    (r) => r.userId !== message.senderId
  );
  const hasReaders = readers.length > 0;

  const isVoiceNote = Boolean(
    (message.text && message.text.startsWith("Voice note")) ||
    (message.imageUrl &&
      (message.imageUrl.endsWith(".mp4") ||
        message.imageUrl.endsWith(".m4a") ||
        message.imageUrl.endsWith(".mp3") ||
        message.imageUrl.endsWith(".webm") ||
        message.imageUrl.includes("/audio/") ||
        message.imageUrl.startsWith("data:audio/")))
  );

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
                isDeleted ? styles.bubbleMeDeleted : [styles.bubbleMe, { backgroundColor: colors.bubbleSent }],
                message.isEdited && !isDeleted && styles.bubbleMeEdited,
                showQuickTranslate && !message.isEdited && styles.bubbleWithTranslate,
                showQuickTranslate && message.isEdited && styles.bubbleWithTranslateEdited,
                isSelected && styles.bubbleMeSelected,
                Boolean(message.imageUrl && !message.isViewOnce) && styles.bubbleWithImage,
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
              ) : message.isViewOnce ? (
                /* View Once Message (Sender Perspective) */
                <View>
                  {message.isViewed ? (
                    <View style={styles.viewOnceOpenedContainerMe}>
                      <View style={styles.viewOnceCircleMeOpened}>
                        <Ionicons name="checkmark" size={13} color="#CBD5E1" />
                      </View>
                      <View style={styles.viewOnceTextGroup}>
                        <Text style={styles.viewOnceOpenedTextMe}>Opened</Text>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.viewOnceContainerMe}>
                      <View style={styles.viewOnceCircleMe}>
                        {message.isUploading ? (
                          <ActivityIndicator size={13} color="#FFFFFF" />
                        ) : (
                          <Text style={styles.viewOnceNumberMe}>1</Text>
                        )}
                      </View>
                      <View style={styles.viewOnceTextGroup}>
                        <Text style={styles.viewOnceTitleMe}>Photo</Text>
                        <Text style={styles.viewOnceSubtitleMe}>
                          {message.isUploading ? "Uploading..." : "View once"}
                        </Text>
                      </View>
                    </View>
                  )}
                  {message.text && message.text !== "Photo" ? (
                    <Text style={styles.textMe}>{message.text}</Text>
                  ) : null}
                </View>
              ) : isVoiceNote ? (
                /* Voice Note Message */
                <VoiceNoteBubble
                  audioUrl={message.imageUrl || ""}
                  durationLabel={message.text?.match(/\((.*?)\)/)?.[1] || "0:05"}
                  isMe={true}
                />
              ) : message.imageUrl ? (
                /* Standard Photo Message */
                <View style={styles.imageBubbleContent}>
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => (onPressImage && message.imageUrl ? onPressImage(message.imageUrl) : undefined)}
                    style={styles.imageThumbnailContainer}
                  >
                    <Image
                      source={{ uri: message.imageUrl }}
                      style={styles.imageThumbnail}
                      contentFit="cover"
                      transition={200}
                    />
                    {message.isUploading && (
                      <View style={styles.imageLoadingOverlay}>
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      </View>
                    )}
                  </TouchableOpacity>
                  {message.text && message.text !== "Photo" ? (
                    <Text style={styles.captionMe}>{message.text}</Text>
                  ) : null}
                </View>
              ) : shouldTranslate && isTranslationValid ? (
                /* Live Hindi Translated Message (Sender) */
                <View style={styles.translateWrapper}>
                  <View style={styles.hindiCardMe}>
                    <View style={styles.hindiCardHeader}>
                      <View style={styles.hindiTagMe}>
                        <Ionicons name="language" size={12} color="#FFFFFF" />
                        <Text style={styles.hindiTagLabelMe}>हिन्दी अनुवाद</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => setManualTranslate(false)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        style={styles.showOriginalBtnMe}
                        accessibilityLabel="Show original message"
                      >
                        <Text style={styles.showOriginalTextMe}>Original</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.hindiTextMe}>{effectiveHindi}</Text>
                  </View>
                  <Text style={styles.originalSubMe}>Original: {message.text}</Text>
                </View>
              ) : shouldTranslate && isTranslating ? (
                /* Translating in progress */
                <View style={styles.translateWrapper}>
                  <Text style={styles.textMe}>{message.text}</Text>
                  <View style={styles.translatingBadgeMe}>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <Text style={styles.translatingTextMe}>अनुवाद हो रहा है...</Text>
                  </View>
                </View>
              ) : (
                <Text style={styles.textMe}>{message.text}</Text>
              )}

              <View style={styles.footerMe}>
                <View style={styles.timeAndEditRow}>
                  {timeStr ? (
                    <Text
                      style={isDeleted ? styles.timeMeDeleted : styles.timeMe}
                      numberOfLines={1}
                    >
                      {timeStr}
                    </Text>
                  ) : null}
                  {message.isEdited && !isDeleted ? (
                    <Text style={styles.editedIndicatorMe} numberOfLines={1}>• edited</Text>
                  ) : null}
                  {showQuickTranslate && !isVoiceNote && (
                    <TouchableOpacity
                      onPress={() => setManualTranslate(true)}
                      style={styles.quickTranslateBtnMe}
                      activeOpacity={0.7}
                      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                      accessibilityLabel="Translate to Hindi"
                    >
                      <Ionicons name="language" size={11} color="rgba(255,255,255,0.9)" />
                      <Text style={styles.quickTranslateTextMe}>हिन्दी</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {!isDeleted && (
                  <View style={styles.statusRow}>
                    {message.isUploading ? (
                      <ActivityIndicator size={10} color="#BFDBFE" />
                    ) : !hasReaders ? (
                      <Ionicons name="checkmark" size={13} color="#BFDBFE" />
                    ) : (
                      <View style={styles.readStatusInlineWrap}>
                        <Ionicons name="checkmark-done" size={14} color="#38BDF8" />
                        {readers.slice(0, 3).map((reader) => (
                          <ReaderAvatarBadge
                            key={reader.userId}
                            reader={reader}
                            isMe={isMe}
                            members={members}
                            users={users}
                            isChugli={isChugli}
                          />
                        ))}
                        {readers.length > 3 && (
                          <TouchableOpacity
                            onPress={() => setShowReadersModal(true)}
                            activeOpacity={0.7}
                            style={styles.moreReadersPill}
                            hitSlop={4}
                          >
                            <Text style={styles.moreReadersPillText}>+{readers.length - 3}</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </View>
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
          <UserAvatar
            name={senderDisplayName}
            username={senderDisplayUsername}
            avatarUrl={senderAvatarUrl}
            size={32}
            fontSize={13}
            isChugli={isChugli}
            style={styles.avatar}
          />
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
                  isDeleted ? styles.bubbleOtherDeleted : [styles.bubbleOther, { backgroundColor: colors.bubbleReceived, borderColor: colors.border }],
                  message.isEdited && !isDeleted && styles.bubbleOtherEdited,
                  showQuickTranslate && !message.isEdited && styles.bubbleWithTranslate,
                  showQuickTranslate && message.isEdited && styles.bubbleWithTranslateEdited,
                  isSelected && styles.bubbleOtherSelected,
                  Boolean(message.imageUrl && !message.isViewOnce) && styles.bubbleWithImage,
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
                ) : message.isViewOnce ? (
                  /* View Once Message (Recipient Perspective) */
                  <View>
                    {message.isViewed ? (
                      <View style={styles.viewOnceOpenedContainerOther}>
                        <View style={styles.viewOnceCircleOtherOpened}>
                          <Ionicons name="checkmark" size={13} color="#64748B" />
                        </View>
                        <View style={styles.viewOnceTextGroup}>
                          <Text style={styles.viewOnceOpenedTextOther}>Opened</Text>
                        </View>
                      </View>
                    ) : (
                      <TouchableOpacity
                        activeOpacity={0.75}
                        onPress={() => onOpenViewOnce?.(message)}
                        style={styles.viewOncePillOther}
                      >
                        <View style={styles.viewOnceCircleOther}>
                          <Text style={styles.viewOnceNumberOther}>1</Text>
                        </View>
                        <View style={styles.viewOnceTextGroup}>
                          <View style={styles.viewOnceHeaderRow}>
                            <Text style={styles.viewOnceTitleOther}>Photo</Text>
                            <View style={styles.viewOnceTapHintBadge}>
                              <Text style={styles.viewOnceTapHintText}>Tap to view</Text>
                            </View>
                          </View>
                          <Text style={styles.viewOnceSubtitleOther}>View once</Text>
                        </View>
                      </TouchableOpacity>
                    )}
                    {message.text && message.text !== "Photo" ? (
                      <Text style={styles.textOther}>{message.text}</Text>
                    ) : null}
                  </View>
                ) : isVoiceNote ? (
                  /* Voice Note Message */
                  <VoiceNoteBubble
                    audioUrl={message.imageUrl || ""}
                    durationLabel={message.text?.match(/\((.*?)\)/)?.[1] || "0:05"}
                    isMe={false}
                  />
                ) : message.imageUrl ? (
                  /* Standard Photo Message */
                  <View style={styles.imageBubbleContent}>
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={() => (onPressImage && message.imageUrl ? onPressImage(message.imageUrl) : undefined)}
                      style={styles.imageThumbnailContainer}
                    >
                      <Image
                        source={{ uri: message.imageUrl }}
                        style={styles.imageThumbnail}
                        contentFit="cover"
                        transition={200}
                      />
                    </TouchableOpacity>
                    {message.text && message.text !== "Photo" ? (
                      <Text style={styles.captionOther}>{message.text}</Text>
                    ) : null}
                  </View>
                ) : shouldTranslate && isTranslationValid ? (
                  /* Live Hindi Translated Message (Recipient) */
                  <View style={styles.translateWrapper}>
                    <View style={styles.hindiCardOther}>
                      <View style={styles.hindiCardHeader}>
                        <View style={styles.hindiTagOther}>
                          <Ionicons name="language" size={12} color={Colors.primary} />
                          <Text style={styles.hindiTagLabelOther}>हिन्दी अनुवाद</Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => setManualTranslate(false)}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          style={styles.showOriginalBtnOther}
                          accessibilityLabel="Show original message"
                        >
                          <Text style={styles.showOriginalTextOther}>Original</Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.hindiTextOther}>{effectiveHindi}</Text>
                    </View>
                    <Text style={styles.originalSubOther}>Original: {message.text}</Text>
                  </View>
                ) : shouldTranslate && isTranslating ? (
                  /* Translating in progress */
                  <View style={styles.translateWrapper}>
                    <Text style={styles.textOther}>{message.text}</Text>
                    <View style={styles.translatingBadgeOther}>
                      <ActivityIndicator size="small" color={Colors.primary} />
                      <Text style={styles.translatingTextOther}>अनुवाद हो रहा है...</Text>
                    </View>
                  </View>
                ) : (
                  <Text style={[styles.textOther, { color: colors.textPrimary }]}>{message.text}</Text>
                )}

                <View style={styles.footerOther}>
                  <View style={styles.timeAndEditRow}>
                    {timeStr ? <Text style={styles.timeOther}>{timeStr}</Text> : null}
                    {message.isEdited && !isDeleted ? (
                      <Text style={styles.editedIndicatorOther}>• edited</Text>
                    ) : null}
                    {showQuickTranslate && !isVoiceNote && (
                      <TouchableOpacity
                        onPress={() => setManualTranslate(true)}
                        style={styles.quickTranslateBtnOther}
                        activeOpacity={0.7}
                        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                        accessibilityLabel="Translate to Hindi"
                      >
                        <Ionicons name="language" size={11} color={Colors.primary} />
                        <Text style={styles.quickTranslateTextOther}>हिन्दी</Text>
                      </TouchableOpacity>
                    )}
                  </View>
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
              {/* Option: Live Hindi Translation Toggle */}
              {Boolean(message.text && message.text !== "Photo" && !isDeleted && !isEmojiOnlyMessage) && (
                <TouchableOpacity
                  style={styles.actionOptionBtn}
                  onPress={() => {
                    setShowOptionsModal(false);
                    setIsSelected(false);
                    setManualTranslate(shouldTranslate ? false : true);
                  }}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.actionOptionIcon,
                      {
                        backgroundColor: shouldTranslate
                          ? "rgba(59, 130, 246, 0.12)"
                          : "rgba(16, 185, 129, 0.12)",
                      },
                    ]}
                  >
                    <Ionicons
                      name="language"
                      size={18}
                      color={shouldTranslate ? Colors.primary : "#10B981"}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.actionOptionTitle}>
                      {shouldTranslate ? "Show Original English" : "Translate to Hindi (लाइव अनुवाद)"}
                    </Text>
                    <Text style={styles.actionOptionDesc}>
                      {shouldTranslate
                        ? "Switch back to original English message"
                        : "Instant live translation into Hindi"}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                </TouchableOpacity>
              )}

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

                return (
                  <View key={reader.userId} style={styles.readerItem}>
                    <UserAvatar
                      name={resolvedName}
                      username={resolvedUsername}
                      avatarUrl={isChugli ? null : users?.find((u) => u.id === reader.userId)?.avatarUrl}
                      size={38}
                      fontSize={16}
                      isChugli={isChugli}
                      style={styles.readerAvatar}
                    />
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
    marginVertical: 5,
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
    minWidth: 148,
  },
  bubbleMeEdited: {
    minWidth: 175,
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
    minWidth: 130,
  },
  bubbleOtherEdited: {
    minWidth: 155,
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
    marginBottom: 2,
  },
  textOther: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontFamily: Fonts.bodyRegular,
    lineHeight: 21,
    marginBottom: 2,
  },
  footerMe: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    marginTop: 3,
    flexWrap: "nowrap",
    alignSelf: "flex-end",
  },
  footerOther: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    marginTop: 3,
    flexWrap: "nowrap",
    alignSelf: "flex-end",
  },
  timeAndEditRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    flexShrink: 0,
    flexWrap: "nowrap",
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
    justifyContent: "center",
    marginLeft: 3,
    flexShrink: 0,
  },
  readStatusTouch: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  readStatusInlineWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  moreReadersPill: {
    backgroundColor: "rgba(255, 255, 255, 0.22)",
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 1,
    marginLeft: 1,
  },
  moreReadersPillText: {
    fontSize: 9,
    color: "#FFFFFF",
    fontFamily: Fonts.bold,
  },
  readersCountText: {
    fontSize: 9.5,
    fontFamily: Fonts.bold,
    color: "#38BDF8",
    fontWeight: "700",
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
  popoverBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  popoverCenterCard: {
    width: "82%",
    maxWidth: 270,
    backgroundColor: "#0F172A",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 30,
    borderWidth: 1,
    borderColor: "#334155",
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
  // View Once & Image Styles
  viewOnceContainerMe: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 14,
    marginBottom: 4,
  },
  viewOnceCircleMe: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.8,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  viewOnceNumberMe: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: "#FFFFFF",
  },
  viewOnceTextGroup: {
    flexDirection: "column",
  },
  viewOnceTitleMe: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: "#FFFFFF",
  },
  viewOnceSubtitleMe: {
    fontSize: 11,
    fontFamily: Fonts.bodyMedium,
    color: "rgba(255, 255, 255, 0.8)",
  },
  viewOnceOpenedContainerMe: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 14,
    marginBottom: 4,
  },
  viewOnceCircleMeOpened: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  viewOnceOpenedTextMe: {
    fontSize: 13,
    fontFamily: Fonts.bodyMedium,
    color: "rgba(255, 255, 255, 0.65)",
    fontStyle: "italic",
  },
  viewOncePillOther: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(37, 99, 235, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(37, 99, 235, 0.25)",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 14,
    marginBottom: 4,
  },
  viewOnceCircleOther: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.8,
    borderColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
  },
  viewOnceNumberOther: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: "#2563EB",
  },
  viewOnceHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  viewOnceTitleOther: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: Colors.textPrimary,
  },
  viewOnceTapHintBadge: {
    backgroundColor: "rgba(37, 99, 235, 0.12)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  viewOnceTapHintText: {
    fontSize: 10,
    fontFamily: Fonts.bold,
    color: "#2563EB",
  },
  viewOnceSubtitleOther: {
    fontSize: 11,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textMuted,
  },
  viewOnceOpenedContainerOther: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(148, 163, 184, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.18)",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 14,
    marginBottom: 4,
  },
  viewOnceCircleOtherOpened: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: "#94A3B8",
    alignItems: "center",
    justifyContent: "center",
  },
  viewOnceOpenedTextOther: {
    fontSize: 13,
    fontFamily: Fonts.bodyMedium,
    color: "#94A3B8",
    fontStyle: "italic",
  },
  bubbleWithImage: {
    paddingHorizontal: 4,
    paddingTop: 4,
    paddingBottom: 6,
    width: 250,
    maxWidth: "100%",
    overflow: "hidden",
  },
  imageBubbleContent: {
    width: "100%",
  },
  imageThumbnailContainer: {
    width: "100%",
    height: 180,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "rgba(0, 0, 0, 0.15)",
    marginBottom: 2,
    position: "relative",
  },
  imageThumbnail: {
    width: "100%",
    height: "100%",
  },
  imageLoadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.38)",
    justifyContent: "center",
    alignItems: "center",
  },
  captionMe: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: Fonts.bodyRegular,
    lineHeight: 20,
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 2,
  },
  captionOther: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontFamily: Fonts.bodyRegular,
    lineHeight: 20,
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 2,
  },
  uploadingStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  uploadingTextMe: {
    fontSize: 10,
    color: "#BFDBFE",
    fontFamily: Fonts.bodyMedium,
  },
  uploadingTextOther: {
    fontSize: 10,
    color: Colors.textMuted,
    fontFamily: Fonts.bodyMedium,
  },

  /* Live Hindi Translation Styles */
  translateWrapper: {
    width: "100%",
  },
  hindiCardMe: {
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    borderRadius: 14,
    padding: 10,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.24)",
  },
  hindiCardOther: {
    backgroundColor: "rgba(37, 99, 235, 0.08)",
    borderRadius: 14,
    padding: 10,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "rgba(37, 99, 235, 0.2)",
  },
  hindiCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  hindiTagMe: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  hindiTagOther: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(37, 99, 235, 0.12)",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  hindiTagLabelMe: {
    fontSize: 10,
    fontFamily: Fonts.bold,
    color: "#FFFFFF",
  },
  hindiTagLabelOther: {
    fontSize: 10,
    fontFamily: Fonts.bold,
    color: Colors.primary,
  },
  showOriginalBtnMe: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "rgba(255, 255, 255, 0.16)",
  },
  showOriginalBtnOther: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "rgba(100, 116, 139, 0.1)",
  },
  showOriginalTextMe: {
    fontSize: 10,
    fontFamily: Fonts.bodyMedium,
    color: "rgba(255, 255, 255, 0.9)",
  },
  showOriginalTextOther: {
    fontSize: 10,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textMuted,
  },
  hindiTextMe: {
    fontSize: 15,
    fontFamily: Fonts.bodyMedium,
    color: "#FFFFFF",
    lineHeight: 22,
  },
  hindiTextOther: {
    fontSize: 15,
    fontFamily: Fonts.bodyMedium,
    color: Colors.textPrimary,
    lineHeight: 22,
  },
  originalSubMe: {
    fontSize: 11,
    fontFamily: Fonts.bodyRegular,
    color: "rgba(255, 255, 255, 0.72)",
    marginTop: 2,
    paddingHorizontal: 2,
    fontStyle: "italic",
  },
  originalSubOther: {
    fontSize: 11,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textMuted,
    marginTop: 2,
    paddingHorizontal: 2,
    fontStyle: "italic",
  },
  translatingBadgeMe: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 4,
    alignSelf: "flex-start",
  },
  translatingBadgeOther: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(37, 99, 235, 0.08)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 4,
    alignSelf: "flex-start",
  },
  translatingTextMe: {
    fontSize: 11,
    fontFamily: Fonts.bodyMedium,
    color: "#FFFFFF",
  },
  translatingTextOther: {
    fontSize: 11,
    fontFamily: Fonts.bodyMedium,
    color: Colors.primary,
  },
  bubbleWithTranslate: {
    minWidth: 185,
  },
  bubbleWithTranslateEdited: {
    minWidth: 225,
  },
  quickTranslateBtnMe: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 4,
  },
  quickTranslateBtnOther: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(37, 99, 235, 0.09)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 4,
  },
  quickTranslateTextMe: {
    fontSize: 10,
    fontFamily: Fonts.bold,
    color: "#FFFFFF",
  },
  quickTranslateTextOther: {
    fontSize: 10,
    fontFamily: Fonts.bold,
    color: Colors.primary,
  },
});


