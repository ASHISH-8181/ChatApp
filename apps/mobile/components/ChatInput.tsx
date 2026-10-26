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
import { voiceRecorderService, VoiceRecorderState } from "@/services/voice-recorder";

interface ChatInputProps {
  onSend: (text: string) => Promise<void> | void;
  onSendAudio?: (audioData: { uri: string; base64?: string; duration: number }) => Promise<void> | void;
  onPressCamera?: () => void;
  disabled?: boolean;
  placeholder?: string;
  externalText?: string;
}

function formatRecordingTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
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
  onSendAudio,
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

  // Voice recording state
  const [voiceState, setVoiceState] = useState<VoiceRecorderState>("idle");
  const [voiceSeconds, setVoiceSeconds] = useState(0);
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);
  const [pulseAnim] = useState(() => new Animated.Value(1));

  // Micro-animation for send button scale
  const [buttonScale] = useState(() => new Animated.Value(1));
  const [activeAnim] = useState(() => new Animated.Value(0));

  if (externalText && externalText !== prevExternalText) {
    setPrevExternalText(externalText);
    setText((prev) => (prev ? `${prev} ${externalText} ` : `${externalText} `));
  }

  const canSend = text.trim().length > 0 && !disabled && !isSending;
  const isRecordingMode = voiceState === "recording" || voiceState === "paused";

  // Pulse animation when recording
  useEffect(() => {
    let anim: Animated.CompositeAnimation | null = null;
    if (voiceState === "recording") {
      anim = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.25, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      );
      anim.start();
    } else {
      pulseAnim.setValue(1);
    }
    return () => {
      anim?.stop();
    };
  }, [voiceState, pulseAnim]);

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

  const handleStartVoiceRecord = async () => {
    if (disabled || isSending || isProcessingAudio) return;
    try {
      setShowEmojiTray(false);
      setVoiceSeconds(0);
      setVoiceState("recording");
      await voiceRecorderService.startRecording((sec) => {
        setVoiceSeconds(sec);
      });
    } catch (err: any) {
      setVoiceState("idle");
      console.warn("Could not start recording:", err);
    }
  };

  const handlePauseVoiceRecord = () => {
    voiceRecorderService.pauseRecording();
    setVoiceState("paused");
  };

  const handleResumeVoiceRecord = () => {
    voiceRecorderService.resumeRecording();
    setVoiceState("recording");
  };

  const handleDeleteVoiceRecord = () => {
    voiceRecorderService.cancelRecording();
    setVoiceState("idle");
    setVoiceSeconds(0);
  };

  const handleSendVoiceRecord = async () => {
    if (isProcessingAudio) return;
    try {
      setIsProcessingAudio(true);
      const res = await voiceRecorderService.stopRecording();
      setVoiceState("idle");
      setVoiceSeconds(0);
      if (res.uri && onSendAudio) {
        await onSendAudio({
          uri: res.uri,
          base64: res.base64,
          duration: res.durationSeconds,
        });
      }
    } catch (err) {
      console.error("Failed to finish recording:", err);
    } finally {
      setIsProcessingAudio(false);
      setVoiceState("idle");
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
      {showEmojiTray && !isRecordingMode && (
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
        {isRecordingMode ? (
          /* WhatsApp-style Voice Recording Interface */
          <View style={styles.recordingBarContainer}>
            {/* Delete / Cancel Button */}
            <Pressable
              style={styles.deleteRecordBtn}
              onPress={handleDeleteVoiceRecord}
              hitSlop={8}
              accessibilityLabel="Delete voice recording"
            >
              <Ionicons name="trash-outline" size={20} color="#EF4444" />
            </Pressable>

            {/* Timer & Pulsing Dot */}
            <View style={styles.recordingTimerGroup}>
              <Animated.View
                style={[
                  styles.recordingDot,
                  voiceState === "paused" ? styles.recordingDotPaused : { transform: [{ scale: pulseAnim }] },
                ]}
              />
              <Text style={[styles.recordingTimerText, { color: colors.textPrimary }]}>
                {formatRecordingTime(voiceSeconds)}
              </Text>
              {voiceState === "paused" && (
                <View style={styles.pausedTag}>
                  <Text style={styles.pausedTagText}>Paused</Text>
                </View>
              )}
            </View>

            {/* Pause / Resume Button */}
            <Pressable
              style={[
                styles.pauseResumeBtn,
                { backgroundColor: isDark ? colors.surfaceElevated : colors.inputBackground, borderColor: colors.border },
              ]}
              onPress={voiceState === "recording" ? handlePauseVoiceRecord : handleResumeVoiceRecord}
              hitSlop={8}
              accessibilityLabel={voiceState === "recording" ? "Pause recording" : "Resume recording"}
            >
              <Ionicons
                name={voiceState === "recording" ? "pause" : "mic"}
                size={18}
                color={colors.primary}
              />
            </Pressable>

            {/* Send Voice Note Button */}
            <Pressable
              onPress={handleSendVoiceRecord}
              disabled={isProcessingAudio}
              hitSlop={6}
              accessibilityLabel="Send voice note"
            >
              <Animated.View style={[styles.sendButton, { backgroundColor: colors.primary }]}>
                {isProcessingAudio ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons name="arrow-up" size={20} color="#FFFFFF" />
                )}
              </Animated.View>
            </Pressable>
          </View>
        ) : (
          /* Normal Typing & Mic Interface */
          <>
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
                <Ionicons name="camera" size={19} color={colors.primary} />
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
                size={19}
                color={showEmojiTray ? colors.primary : colors.textSecondary}
              />
            </Pressable>

            {/* Text Input in Middle */}
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

            {/* Translate to Hindi button if draft present */}
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

            {/* WhatsApp-Style Dynamic Action Button: Voice Mic when empty, Send when typed */}
            {text.trim().length === 0 ? (
              <Pressable
                onPress={handleStartVoiceRecord}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                disabled={disabled || isSending || isProcessingAudio}
                hitSlop={4}
                accessibilityLabel="Record voice note"
              >
                <Animated.View
                  style={[
                    styles.sendButton,
                    { backgroundColor: colors.primary },
                    { transform: [{ scale: buttonScale }] },
                  ]}
                >
                  <Ionicons name="mic" size={19} color="#FFFFFF" />
                </Animated.View>
              </Pressable>
            ) : (
              <Pressable
                onPress={handleSend}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                disabled={!canSend || isSending}
                hitSlop={4}
                accessibilityLabel="Send Message"
              >
                <Animated.View
                  style={[
                    styles.sendButton,
                    { backgroundColor: colors.primary },
                    { transform: [{ scale: buttonScale }] },
                  ]}
                >
                  {isSending ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Ionicons
                      name="arrow-up"
                      size={19}
                      color="#FFFFFF"
                    />
                  )}
                </Animated.View>
              </Pressable>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: "transparent",
    paddingHorizontal: 12,
    paddingBottom: Platform.OS === "ios" ? 22 : 16,
    paddingTop: 4,
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
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: Colors.card,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 6,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 6,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
    width: 36,
    height: 36,
    borderRadius: 18,
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
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 7 : 5,
    minHeight: 38,
    maxHeight: 110,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: "center",
  },
  input: {
    fontSize: 15,
    fontFamily: Fonts.bodyRegular,
    color: Colors.textPrimary,
    padding: 0,
    textAlignVertical: "center",
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
  recordingBarContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 2,
    gap: 10,
  },
  deleteRecordBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  recordingTimerGroup: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#EF4444",
  },
  recordingDotPaused: {
    backgroundColor: "#F59E0B",
  },
  recordingTimerText: {
    fontSize: 15,
    fontFamily: Fonts.bold,
    fontWeight: "700",
  },
  pausedTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "rgba(245, 158, 11, 0.15)",
  },
  pausedTagText: {
    fontSize: 10.5,
    fontWeight: "700",
    color: "#D97706",
  },
  pauseResumeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
  sendRecordBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
  },
});

