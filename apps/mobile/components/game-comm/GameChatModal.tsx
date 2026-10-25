import React, { useRef, useState, useEffect } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import type { GameChatMessage } from "@chatapp/shared";
import { Ionicons } from "@/components/Icon";
import { Colors, Fonts } from "@/constants/theme";

interface GameChatModalProps {
  visible: boolean;
  onClose: () => void;
  messages: GameChatMessage[];
  currentUserId?: string;
  onSendMessage: (text: string) => void;
  title?: string;
}

const QUICK_EMOTES = [
  "Good move! 👏",
  "Nice try! 🎯",
  "Checkmate! ♟️",
  "Roll a 6! 🎲",
  "GG! 🤝",
  "Oops! 😅",
  "Hurry up! ⏳",
  "Thanks! 🙌",
];

export function GameChatModal({
  visible,
  onClose,
  messages,
  currentUserId,
  onSendMessage,
  title = "In-Game Chat",
}: GameChatModalProps) {
  const [inputText, setInputText] = useState("");
  const flatListRef = useRef<FlatList<GameChatMessage>>(null);

  useEffect(() => {
    if (visible && messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 150);
    }
  }, [visible, messages.length]);

  const handleSend = () => {
    const trimmed = inputText.trim();
    if (!trimmed) return;
    onSendMessage(trimmed);
    setInputText("");
  };

  const handleSendQuick = (emote: string) => {
    onSendMessage(emote);
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />

        <View style={styles.dialogContainer}>
          {/* Header Bar with Title and Close Button */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <View style={styles.headerIconBox}>
                <Ionicons name="chatbubbles" size={18} color="#2563EB" />
              </View>
              <Text style={styles.headerTitle}>{title}</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{messages.length}</Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              activeOpacity={0.7}
              accessibilityLabel="Close Chat Popup"
            >
              <Ionicons name="close" size={20} color="#F8FAFC" />
            </TouchableOpacity>
          </View>

          {/* Quick Emotes Bar */}
          <View style={styles.quickBarContainer}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickBarScroll}
            >
              {QUICK_EMOTES.map((emote, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.emoteChip}
                  onPress={() => handleSendQuick(emote)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.emoteChipText}>{emote}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Messages Stream */}
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messagesList}
            renderItem={({ item }) => {
              const isMe = item.senderId === currentUserId;
              const formattedTime = new Date(item.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              });

              return (
                <View
                  style={[
                    styles.messageRow,
                    isMe ? styles.messageRowMe : styles.messageRowOther,
                  ]}
                >
                  {!isMe && (
                    <Text style={styles.senderHeaderName}>
                      {item.senderName}
                    </Text>
                  )}
                  <View
                    style={[
                      styles.messageBubble,
                      isMe ? styles.messageBubbleMe : styles.messageBubbleOther,
                      item.senderColor ? { borderColor: item.senderColor } : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.messageText,
                        isMe ? styles.messageTextMe : styles.messageTextOther,
                      ]}
                    >
                      {item.text}
                    </Text>
                    <Text
                      style={[
                        styles.messageTime,
                        isMe ? styles.messageTimeMe : styles.messageTimeOther,
                      ]}
                    >
                      {formattedTime}
                    </Text>
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyEmoji}>💬</Text>
                <Text style={styles.emptyTitle}>No messages yet</Text>
                <Text style={styles.emptySubtitle}>
                  Send a quick emote or chat with fellow players!
                </Text>
              </View>
            }
          />

          {/* Input Bar */}
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.textInput}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Type message..."
              placeholderTextColor="#64748B"
              returnKeyType="send"
              onSubmitEditing={handleSend}
            />
            <TouchableOpacity
              style={[styles.sendBtn, !inputText.trim() && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!inputText.trim()}
              activeOpacity={0.8}
            >
              <Ionicons name="send" size={16} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15, 23, 42, 0.6)",
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  dialogContainer: {
    backgroundColor: "#0F172A",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "75%",
    minHeight: 380,
    borderWidth: 1,
    borderColor: "#1E293B",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 20,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
    backgroundColor: "#1E293B",
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerIconBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: "rgba(37, 99, 235, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: Fonts.extraBold,
    color: "#F8FAFC",
  },
  countBadge: {
    backgroundColor: "#334155",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  countBadgeText: {
    fontSize: 11,
    fontFamily: Fonts.bold,
    color: "#94A3B8",
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
  },
  quickBarContainer: {
    backgroundColor: "#0F172A",
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
    paddingVertical: 8,
  },
  quickBarScroll: {
    paddingHorizontal: 14,
    gap: 8,
  },
  emoteChip: {
    backgroundColor: "#1E293B",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#334155",
  },
  emoteChipText: {
    fontSize: 12,
    fontFamily: Fonts.semiBold,
    color: "#E2E8F0",
  },
  messagesList: {
    padding: 16,
    flexGrow: 1,
    gap: 10,
  },
  messageRow: {
    maxWidth: "80%",
    marginBottom: 4,
  },
  messageRowMe: {
    alignSelf: "flex-end",
    alignItems: "flex-end",
  },
  messageRowOther: {
    alignSelf: "flex-start",
    alignItems: "flex-start",
  },
  senderHeaderName: {
    fontSize: 11,
    fontFamily: Fonts.bold,
    color: "#94A3B8",
    marginBottom: 2,
    marginLeft: 4,
  },
  messageBubble: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
  },
  messageBubbleMe: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
    borderBottomRightRadius: 4,
  },
  messageBubbleOther: {
    backgroundColor: "#1E293B",
    borderColor: "#334155",
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 14,
    fontFamily: Fonts.medium,
    lineHeight: 19,
  },
  messageTextMe: {
    color: "#FFFFFF",
  },
  messageTextOther: {
    color: "#F8FAFC",
  },
  messageTime: {
    fontSize: 9,
    marginTop: 3,
    alignSelf: "flex-end",
  },
  messageTimeMe: {
    color: "rgba(255, 255, 255, 0.7)",
  },
  messageTimeOther: {
    color: "#64748B",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 36,
  },
  emptyEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: "#F8FAFC",
  },
  emptySubtitle: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: "#64748B",
    textAlign: "center",
    marginTop: 4,
    maxWidth: 220,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#1E293B",
    borderTopWidth: 1,
    borderTopColor: "#334155",
  },
  textInput: {
    flex: 1,
    height: 40,
    backgroundColor: "#0F172A",
    borderRadius: 20,
    paddingHorizontal: 14,
    fontSize: 14,
    fontFamily: Fonts.medium,
    color: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#334155",
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
});
