import React, { useEffect, useState } from "react";
import { Animated, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Fonts } from "@/constants/theme";

interface GameChatBubbleProps {
  text: string;
  senderName: string;
  senderColor?: string;
  onPress: () => void;
  position?: "top" | "bottom";
  style?: any;
}

export function GameChatBubble({
  text,
  senderName,
  senderColor = "#38BDF8",
  onPress,
  position = "top",
  style,
}: GameChatBubbleProps) {
  const [fadeAnim] = useState(() => new Animated.Value(0));
  const [translateYAnim] = useState(() => new Animated.Value(position === "top" ? -8 : 8));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.spring(translateYAnim, {
        toValue: 0,
        friction: 5,
        tension: 100,
        useNativeDriver: true,
      }),
    ]).start();
  }, [text, fadeAnim, translateYAnim]);

  return (
    <Animated.View
      style={[
        styles.bubbleWrapper,
        position === "top" ? styles.bubblePositionTop : styles.bubblePositionBottom,
        {
          opacity: fadeAnim,
          transform: [{ translateY: translateYAnim }],
        },
        style,
      ]}
    >
      <TouchableOpacity
        style={[styles.bubbleContainer, { borderColor: senderColor }]}
        onPress={onPress}
        activeOpacity={0.85}
        accessibilityLabel={`${senderName} said: ${text}. Tap to open chat.`}
      >
        <View style={[styles.senderBadge, { borderColor: senderColor }]}>
          <Text style={[styles.bubbleSender, { color: senderColor }]} numberOfLines={1}>
            {senderName}
          </Text>
        </View>
        <Text style={styles.bubbleText} numberOfLines={3}>
          {text}
        </Text>
        <View style={styles.tapPromptBadge}>
          <Text style={styles.tapPrompt}>Tap to reply 💬</Text>
        </View>

        {/* Speech Bubble Arrow Tail */}
        <View
          style={[
            styles.tail,
            position === "top" ? styles.tailBottom : styles.tailTop,
            {
              borderTopColor: position === "top" ? senderColor : "transparent",
              borderBottomColor: position === "bottom" ? senderColor : "transparent",
            },
          ]}
        />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bubbleWrapper: {
    position: "absolute",
    zIndex: 150,
    alignItems: "center",
    left: 8,
    right: 8,
  },
  bubblePositionTop: {
    top: -64,
  },
  bubblePositionBottom: {
    bottom: -64,
  },
  bubbleContainer: {
    backgroundColor: "#0F172A",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 16,
    minWidth: 140,
    maxWidth: 280,
    alignItems: "center",
  },
  senderBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginBottom: 4,
    borderWidth: 0.5,
  },
  bubbleSender: {
    fontSize: 10,
    fontFamily: Fonts.extraBold,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  bubbleText: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: "#FFFFFF",
    textAlign: "center",
    lineHeight: 20,
    textShadowColor: "rgba(0, 0, 0, 0.75)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  tapPromptBadge: {
    backgroundColor: "rgba(56, 189, 248, 0.15)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 4,
  },
  tapPrompt: {
    fontSize: 10,
    fontFamily: Fonts.bold,
    color: "#38BDF8",
  },
  tail: {
    position: "absolute",
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
  tailBottom: {
    bottom: -7,
    borderTopWidth: 7,
  },
  tailTop: {
    top: -7,
    borderBottomWidth: 7,
  },
});
