import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@/components/Icon";
import { Fonts, Colors } from "@/constants/theme";

interface ChatInputProps {
  onSend: (text: string) => Promise<void> | void;
  disabled?: boolean;
  placeholder?: string;
  externalText?: string;
}

export function ChatInput({
  onSend,
  disabled = false,
  placeholder = "Type a message...",
  externalText,
}: ChatInputProps) {
  const [text, setText] = useState("");
  const [isSending, setIsSending] = useState(false);
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
      await onSend(trimmed);
    } catch {
      // Restore text if sending failed
      setText(trimmed);
    } finally {
      setIsSending(false);
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

  return (
    <View style={styles.container}>
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor={Colors.textMuted}
          value={text}
          onChangeText={setText}
          multiline
          maxLength={1000}
          editable={!disabled && !isSending}
          onKeyPress={handleKeyPress}
        />
      </View>

      <Pressable
        onPress={handleSend}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={!canSend}
        hitSlop={4}
      >
        <Animated.View
          style={[
            styles.sendButton,
            canSend ? styles.sendButtonActive : styles.sendButtonDisabled,
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
              color={canSend ? "#FFFFFF" : Colors.textMuted}
              style={{ marginLeft: 2 }}
            />
          )}
        </Animated.View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: Colors.card,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 3,
  },
  inputContainer: {
    flex: 1,
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === "ios" ? 10 : 7,
    maxHeight: 120,
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
    width: 44,
    height: 44,
    borderRadius: 22,
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
});

