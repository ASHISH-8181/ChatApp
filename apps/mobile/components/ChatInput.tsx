import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@/components/Icon";
import { Fonts, Colors } from "@/constants/theme";
import { translateToHindi } from "@/services/translation";
import { useTheme } from "@/store/theme-context";

interface ChatInputProps {
  onSend: (text: string) => Promise<void> | void;
  onPressCamera?: () => void;
  disabled?: boolean;
  placeholder?: string;
  externalText?: string;
}

const EMOJI_CATEGORIES = [
  {
    name: "Quick",
    icon: "flash-outline",
    emojis: ["❤️", "😂", "🔥", "👍", "🎉", "😍", "✨", "😎", "🥺", "🙌", "💯", "🚀"],
  },
  {
    name: "Faces",
    icon: "happy-outline",
    emojis: [
      "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "😉", "😊", "😇", "🥰",
      "😍", "🤩", "😘", "😋", "😜", "🤪", "😝", "🤗", "🤭", "🤫", "🤔", "🤐", "🤨",
      "😐", "😏", "😒", "🙄", "😬", "😮‍💨", "😌", "😴",
    ],
  },
  {
    name: "Hearts",
    icon: "heart-outline",
    emojis: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💔", "❤️‍🔥", "💕", "💞", "💓",
      "💗", "💖", "💘", "👍", "👎", "👏", "🙌", "🤝", "🙏", "✌️", "🤞", "🤟", "🤘",
      "👋", "👌",
    ],
  },
  {
    name: "Fun",
    icon: "sparkles-outline",
    emojis: [
      "🔥", "✨", "⭐", "🌟", "💫", "💥", "💯", "🎉", "🎊", "🎈", "🎂", "🎁", "🏆",
      "🥇", "🚀", "⚡", "🌈", "🍕", "🍔", "🍻", "🥂", "☕", "🍩", "🌹", "🌸", "🌻",
    ],
  },
];

export function ChatInput({
  onSend,
  onPressCamera,
  disabled = false,
  placeholder = "Type a message...",
  externalText,
}: ChatInputProps) {
  const { colors, isDark } = useTheme();
  const [text, setText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isTranslatingInput, setIsTranslatingInput] = useState(false);
  const [showEmojiTray, setShowEmojiTray] = useState(false);
  const [selectedCategoryIdx, setSelectedCategoryIdx] = useState(0);
  const [prevExternalText, setPrevExternalText] = useState(externalText);

  // Micro-animation for send button scale
  const [buttonScale] = useState(() => new Animated.Value(1));
  const [activeAnim] = useState(() => new Animated.Value(0));

  if (externalText && externalText !== prevExternalText) {
    setPrevExternalText(externalText);
    setText((prev) => (prev ? `${prev} ${externalText} ` : `${externalText} `));
  }

  const canSend = text.trim().length > 0 && !disabled && !isSending;

  useEffect(() => {
    Animated.spring(activeAnim, {
      toValue: canSend ? 1 : 0,
      friction: 6,
      tension: 60,
      useNativeDriver: true,
    }).start();
  }, [canSend, activeAnim]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || isSending || disabled) return;

    try {
      setIsSending(true);
      setText("");
      setShowEmojiTray(false);
      await onSend(trimmed);
    } catch {
      // Restore text if sending failed
      setText(trimmed);
    } finally {
      setIsSending(false);
    }
  };

  const handleTranslateDraft = async () => {
    const trimmed = text.trim();
    if (!trimmed || isTranslatingInput || disabled) return;
    try {
      setIsTranslatingInput(true);
      const translated = await translateToHindi(trimmed);
      if (translated && translated !== trimmed) {
        setText(translated);
      }
    } catch (err) {
      console.warn("Input translation failed", err);
    } finally {
      setIsTranslatingInput(false);
    }
  };

  const handleKeyPress = (e: any) => {
    if (Platform.OS === "web" && e.nativeEvent.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePressIn = () => {
    Animated.spring(buttonScale, {
      toValue: 0.92,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(buttonScale, {
      toValue: 1,
      friction: 5,
      useNativeDriver: true,
    }).start();
  };

  const handleSelectEmoji = (emoji: string) => {
    setText((prev) => prev + emoji);
  };

  return (
    <View style={[styles.wrapper, { backgroundColor: colors.card }]}>
      {/* Emoji Tray */}
      {showEmojiTray && (
        <View style={[styles.emojiTray, { backgroundColor: colors.backgroundSecondary, borderTopColor: colors.borderLight }]}>
          {/* Category Tabs */}
          <View style={styles.categoryTabs}>
            {EMOJI_CATEGORIES.map((cat, idx) => (
              <Pressable
                key={cat.name}
                style={[
                  styles.categoryTab,
                  { backgroundColor: colors.card, borderColor: colors.borderLight },
                  selectedCategoryIdx === idx && { backgroundColor: colors.primaryLight, borderColor: colors.primary },
                ]}
                onPress={() => setSelectedCategoryIdx(idx)}
              >
                <Ionicons
                  name={cat.icon as any}
                  size={16}
                  color={selectedCategoryIdx === idx ? colors.primary : colors.textMuted}
                />
                <Text
                  style={[
                    styles.categoryTabText,
                    { color: selectedCategoryIdx === idx ? colors.primary : colors.textMuted },
                    selectedCategoryIdx === idx && styles.categoryTabTextActive,
                  ]}
                >
                  {cat.name}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Emoji Grid */}
          <View style={styles.emojiGrid}>
            {EMOJI_CATEGORIES[selectedCategoryIdx].emojis.map((em, i) => (
              <Pressable
                key={`${em}-${i}`}
                style={[styles.emojiItem, { backgroundColor: colors.card }]}
                onPress={() => handleSelectEmoji(em)}
                hitSlop={4}
              >
                <Text style={styles.emojiText}>{em}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* Input Row */}
      <View style={[styles.container, { backgroundColor: colors.card, borderTopColor: colors.borderLight }]}>
        {onPressCamera && (
          <Pressable
            style={[styles.iconButton, { backgroundColor: isDark ? colors.surfaceElevated : colors.inputBackground, borderColor: colors.border }]}
            onPress={() => {
              setShowEmojiTray(false);
              onPressCamera();
            }}
            disabled={disabled || isSending}
            hitSlop={6}
            accessibilityLabel="Share Photo"
          >
            <Ionicons name="camera" size={20} color={colors.primary} />
          </Pressable>
        )}

        {/* Emoji Button */}
        <Pressable
          style={[
            styles.iconButton,
            { backgroundColor: isDark ? colors.surfaceElevated : colors.inputBackground, borderColor: colors.border },
            showEmojiTray && { backgroundColor: colors.primaryLight, borderColor: colors.primary },
          ]}
          onPress={() => setShowEmojiTray((prev) => !prev)}
          disabled={disabled || isSending}
          hitSlop={6}
          accessibilityLabel="Select Emoji"
        >
          <Ionicons
            name={showEmojiTray ? "keypad-outline" : "happy-outline"}
            size={20}
            color={showEmojiTray ? colors.primary : colors.textSecondary}
          />
        </Pressable>

        <View style={[styles.inputContainer, { backgroundColor: isDark ? colors.surfaceElevated : colors.inputBackground, borderColor: colors.border }]}>
          <TextInput
            style={[styles.input, { color: colors.textPrimary }]}
            placeholder={placeholder}
            placeholderTextColor={colors.textMuted}
            value={text}
            onChangeText={setText}
            onFocus={() => setShowEmojiTray(false)}
            multiline
            maxLength={1000}
            editable={!disabled && !isSending}
            onKeyPress={handleKeyPress}
          />
        </View>

        {canSend && (
          <Pressable
            style={styles.translateInputBtn}
            onPress={handleTranslateDraft}
            disabled={isTranslatingInput || disabled}
            hitSlop={4}
            accessibilityLabel="Translate drafted message to Hindi"
          >
            {isTranslatingInput ? (
              <ActivityIndicator size={12} color={colors.primary} />
            ) : (
              <View style={[styles.translateInputChip, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="language" size={13} color={colors.primary} />
                <Text style={[styles.translateInputChipText, { color: colors.primary }]}>हिन्दी</Text>
              </View>
            )}
          </Pressable>
        )}

        <Pressable
          onPress={handleSend}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          disabled={!canSend}
          hitSlop={4}
          accessibilityLabel="Send Message"
        >
          <Animated.View
            style={[
              styles.sendButton,
              canSend ? { backgroundColor: colors.primary } : [styles.sendButtonDisabled, { backgroundColor: isDark ? colors.surfaceElevated : colors.inputBackground, borderColor: colors.border }],
              {
                transform: [{ scale: buttonScale }],
              },
            ]}
          >
            {isSending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons
                name="send"
                size={18}
                color={canSend ? "#FFFFFF" : colors.textMuted}
                style={{ marginLeft: 2 }}
              />
            )}
          </Animated.View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: Colors.card,
  },
  emojiTray: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 14,
    backgroundColor: Colors.backgroundSecondary,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    maxHeight: 180,
  },
  categoryTabs: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  categoryTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  categoryTabActive: {
    backgroundColor: "rgba(59, 130, 246, 0.12)",
    borderColor: Colors.primary,
  },
  categoryTabText: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: Colors.textMuted,
  },
  categoryTabTextActive: {
    color: Colors.primary,
    fontFamily: Fonts.bold,
  },
  emojiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "flex-start",
    alignItems: "center",
  },
  emojiItem: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.card,
  },
  emojiText: {
    fontSize: 22,
  },
  container: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: Colors.card,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 3,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.backgroundSecondary,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  iconButtonActive: {
    backgroundColor: "rgba(59, 130, 246, 0.12)",
    borderColor: Colors.primary,
  },
  cameraButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.backgroundSecondary,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  inputContainer: {
    flex: 1,
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 8 : 6,
    maxHeight: 110,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  input: {
    fontSize: 15,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textPrimary,
    padding: 0,
    textAlignVertical: "center",
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  sendButtonActive: {
    backgroundColor: Colors.primary,
  },
  sendButtonDisabled: {
    backgroundColor: Colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowOpacity: 0,
    elevation: 0,
  },
  translateInputBtn: {
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 2,
  },
  translateInputChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    height: 34,
    paddingHorizontal: 8,
    borderRadius: 17,
    backgroundColor: "rgba(59, 130, 246, 0.09)",
    borderWidth: 1,
    borderColor: "rgba(59, 130, 246, 0.22)",
  },
  translateInputChipText: {
    fontSize: 11,
    fontFamily: Fonts.bold,
    color: Colors.primary,
  },
});

