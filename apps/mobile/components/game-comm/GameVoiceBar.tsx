import React, { useEffect, useState } from "react";
import { Animated, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@/components/Icon";
import { Fonts } from "@/constants/theme";

interface GameVoiceBarProps {
  isMuted: boolean;
  isSpeaking: boolean;
  onToggleMic: () => void;
  isSpeakerMuted?: boolean;
  onToggleSpeaker?: () => void;
  onOpenChat: () => void;
  unreadChatCount?: number;
}

export function GameVoiceBar({
  isMuted,
  isSpeaking,
  onToggleMic,
  isSpeakerMuted = false,
  onToggleSpeaker,
  onOpenChat,
  unreadChatCount = 0,
}: GameVoiceBarProps) {
  const [pulseAnim] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (isSpeaking) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.25,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1.0,
            duration: 400,
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isSpeaking, pulseAnim]);

  return (
    <View style={styles.container}>
      {/* Mic Button */}
      <TouchableOpacity
        style={[
          styles.actionBtn,
          isMuted ? styles.btnMuted : isSpeaking ? styles.btnSpeaking : styles.btnLive,
        ]}
        onPress={onToggleMic}
        activeOpacity={0.8}
        accessibilityLabel={isMuted ? "Unmute Voice" : "Mute Voice"}
      >
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <Ionicons
            name={isMuted ? "mic-off" : isSpeaking ? "mic" : "mic"}
            size={13}
            color={isMuted ? "#94A3B8" : "#FFFFFF"}
          />
        </Animated.View>
        <Text
          style={[
            styles.btnText,
            isMuted ? styles.btnTextMuted : styles.btnTextLive,
          ]}
        >
          {isMuted ? "Mic Off" : isSpeaking ? "Speaking" : "Live"}
        </Text>
      </TouchableOpacity>

      {/* Speaker / Media Volume Button */}
      {onToggleSpeaker && (
        <TouchableOpacity
          style={[
            styles.actionBtn,
            isSpeakerMuted ? styles.btnMuted : styles.speakerBtnActive,
          ]}
          onPress={onToggleSpeaker}
          activeOpacity={0.8}
          accessibilityLabel={isSpeakerMuted ? "Unmute Voice Audio" : "Mute Voice Audio"}
        >
          <Ionicons
            name={isSpeakerMuted ? "volume-mute" : "volume-high"}
            size={13}
            color={isSpeakerMuted ? "#94A3B8" : "#38BDF8"}
          />
          <Text
            style={[
              styles.btnText,
              isSpeakerMuted ? styles.btnTextMuted : styles.speakerTextActive,
            ]}
          >
            {isSpeakerMuted ? "Muted" : "Sound"}
          </Text>
        </TouchableOpacity>
      )}

      {/* Chat Button */}
      <TouchableOpacity
        style={styles.chatBtn}
        onPress={onOpenChat}
        activeOpacity={0.8}
        accessibilityLabel="Open In-Game Chat"
      >
        <Ionicons name="chatbubbles" size={13} color="#38BDF8" />
        <Text style={styles.chatBtnText}>Chat</Text>

        {unreadChatCount > 0 && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadBadgeText}>
              {unreadChatCount > 9 ? "9+" : unreadChatCount}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(15, 23, 42, 0.92)",
    paddingHorizontal: 4,
    paddingVertical: 3.5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#334155",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3.5,
    paddingHorizontal: 7,
    paddingVertical: 4.5,
    borderRadius: 10,
  },
  btnMuted: {
    backgroundColor: "rgba(51, 65, 85, 0.65)",
  },
  btnLive: {
    backgroundColor: "#059669",
  },
  btnSpeaking: {
    backgroundColor: "#10B981",
    borderWidth: 1,
    borderColor: "#6EE7B7",
  },
  speakerBtnActive: {
    backgroundColor: "rgba(56, 189, 248, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.4)",
  },
  btnText: {
    fontSize: 10,
    fontFamily: Fonts.extraBold,
  },
  btnTextMuted: {
    color: "#94A3B8",
  },
  btnTextLive: {
    color: "#FFFFFF",
  },
  speakerTextActive: {
    color: "#38BDF8",
  },
  chatBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3.5,
    paddingHorizontal: 7,
    paddingVertical: 4.5,
    borderRadius: 10,
    backgroundColor: "rgba(56, 189, 248, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.4)",
    position: "relative",
  },
  chatBtnText: {
    fontSize: 10,
    fontFamily: Fonts.extraBold,
    color: "#38BDF8",
  },
  unreadBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#EF4444",
    width: 15,
    height: 15,
    borderRadius: 7.5,
    justifyContent: "center",
    alignItems: "center",
  },
  unreadBadgeText: {
    fontSize: 8.5,
    fontFamily: Fonts.bold,
    color: "#FFFFFF",
  },
});

