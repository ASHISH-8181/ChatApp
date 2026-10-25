import React, { useEffect, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";

import { useUser } from "@/store/user-context";
import { socketService, type ConnectionStatus } from "@/services/socket";
import { ConnectionBadge } from "@/components/ConnectionBadge";
import { LockNavButton } from "@/components/LockNavButton";
import { ThemeNavButton } from "@/components/ThemeNavButton";
import { useTheme } from "@/store/theme-context";
import { Fonts } from "@/constants/theme";
import { Ionicons } from "@/components/Icon";
import { MurderMysteryModal } from "@/components/murder-mystery/MurderMysteryModal";
import { ChessModal } from "@/components/chess/ChessModal";
import { LudoModal } from "@/components/ludo/LudoModal";

export default function GamesTabScreen() {
  const { currentUser } = useUser();
  const { colors, isDark } = useTheme();
  const params = useLocalSearchParams<{ open?: string }>();

  const [showMurderMysteryModal, setShowMurderMysteryModal] = useState(
    () => params.open === "mm" || params.open === "murder-mystery"
  );
  const [showChessModal, setShowChessModal] = useState(
    () => params.open === "chess"
  );
  const [showLudoModal, setShowLudoModal] = useState(
    () => params.open === "ludo"
  );
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    () => socketService.getStatus()
  );

  useEffect(() => {
    const unsub = socketService.subscribeToStatus((status) => {
      setConnectionStatus(status);
    });
    return () => unsub();
  }, []);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={["top"]}>
      {/* Top Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.borderLight }]}>
        <View style={styles.headerLeft}>
          <View style={[styles.headerIconBadge, { backgroundColor: colors.primaryLight }]}>
            <Ionicons name="game-controller" size={22} color={colors.primary} />
          </View>
          <View style={styles.headerTitleWrap}>
            <Text style={[styles.headerTitle, { color: colors.textPrimary, fontFamily: Fonts.bold }]} numberOfLines={1}>Games</Text>
            <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>Multiplayer online games</Text>
          </View>
        </View>

        <View style={styles.headerRightGroup}>
          <ThemeNavButton />
          <LockNavButton compact={true} />
          <ConnectionBadge status={connectionStatus} showText={false} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* GAME 1: CHESS */}
        <View style={[styles.gameCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardTag, styles.chessTag, isDark && { backgroundColor: "#1E2A4A", borderColor: "#2563EB" }]}>
              <Text style={[styles.cardTagText, styles.chessTagText]}>2 PLAYERS • DUEL</Text>
            </View>
            <View style={styles.playerCountPill}>
              <Ionicons name="people" size={13} color={colors.textMuted} />
              <Text style={[styles.playerCountText, { color: colors.textMuted }]}>2 Players</Text>
            </View>
          </View>

          <View style={styles.cardMainRow}>
            <View style={[styles.cardEmojiBox, styles.chessEmojiBox, isDark && { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
              <Text style={styles.cardEmoji}>♟️</Text>
            </View>
            <View style={styles.cardInfo}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary, fontFamily: Fonts.bold }]}>Chess Duel</Text>
              <Text style={[styles.cardGenre, { color: colors.primary, fontFamily: Fonts.medium }]}>Turn-Based Strategy</Text>
            </View>
          </View>

          <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>
            Challenge a friend to a real-time online duel. Includes room code sharing, legal move hints, and checkmate detection.
          </Text>

          <TouchableOpacity
            style={[styles.playBtn, { backgroundColor: colors.primary }]}
            onPress={() => setShowChessModal(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="play" size={16} color="#FFFFFF" style={styles.playBtnIcon} />
            <Text style={[styles.playBtnText, { fontFamily: Fonts.bold }]}>Play Chess</Text>
          </TouchableOpacity>
        </View>

        {/* GAME 2: LUDO CLUB */}
        <View style={[styles.gameCard, { backgroundColor: colors.card, borderColor: isDark ? colors.border : "#FED7AA" }]}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardTag, styles.ludoTag, isDark && { backgroundColor: "#3D2410", borderColor: "#F97316" }]}>
              <Text style={[styles.cardTagText, styles.ludoTagText]}>2 TO 6 PLAYERS • CLASSIC</Text>
            </View>
            <View style={styles.playerCountPill}>
              <Ionicons name="people" size={13} color={colors.textMuted} />
              <Text style={[styles.playerCountText, { color: colors.textMuted }]}>2 - 6 Players</Text>
            </View>
          </View>

          <View style={styles.cardMainRow}>
            <View style={[styles.cardEmojiBox, styles.ludoEmojiBox, isDark && { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
              <Text style={styles.cardEmoji}>🎲</Text>
            </View>
            <View style={styles.cardInfo}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary, fontFamily: Fonts.bold }]}>Ludo Club</Text>
              <Text style={[styles.cardGenre, { color: "#F97316", fontFamily: Fonts.medium }]}>Board Race & Capture</Text>
            </View>
          </View>

          <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>
            Roll 3D dice, race your 4 tokens across the board, capture opponents, and rush home with up to 6 friends.
          </Text>

          <TouchableOpacity
            style={[styles.playBtn, styles.ludoBtn]}
            onPress={() => setShowLudoModal(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="play" size={16} color="#FFFFFF" style={styles.playBtnIcon} />
            <Text style={[styles.playBtnText, { fontFamily: Fonts.bold }]}>Play Ludo</Text>
          </TouchableOpacity>
        </View>

        {/* GAME 3: MURDER MYSTERY */}
        <View style={[styles.gameCard, { backgroundColor: colors.card, borderColor: isDark ? colors.border : "#E9D5FF" }]}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardTag, styles.mysteryTag, isDark && { backgroundColor: "#2A1847", borderColor: "#A855F7" }]}>
              <Text style={[styles.cardTagText, styles.mysteryTagText]}>3 TO 12 PLAYERS • DEDUCTION</Text>
            </View>
            <View style={styles.playerCountPill}>
              <Ionicons name="people" size={13} color={colors.textMuted} />
              <Text style={[styles.playerCountText, { color: colors.textMuted }]}>3 - 12 Players</Text>
            </View>
          </View>

          <View style={styles.cardMainRow}>
            <View style={[styles.cardEmojiBox, styles.mysteryEmojiBox, isDark && { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
              <Text style={styles.cardEmoji}>🕵️</Text>
            </View>
            <View style={styles.cardInfo}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary, fontFamily: Fonts.bold }]}>Murder Mystery</Text>
              <Text style={[styles.cardGenre, { color: "#A855F7", fontFamily: Fonts.medium }]}>Social Deception & Voting</Text>
            </View>
          </View>

          <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>
            Secret murderers strike at night while doctors protect. Discuss suspects by day and vote out the killers before it is too late.
          </Text>

          <TouchableOpacity
            style={[styles.playBtn, styles.mysteryBtn]}
            onPress={() => setShowMurderMysteryModal(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="play" size={16} color="#FFFFFF" style={styles.playBtnIcon} />
            <Text style={[styles.playBtnText, { fontFamily: Fonts.bold }]}>Play Murder Mystery</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Game Modals */}
      <MurderMysteryModal
        visible={showMurderMysteryModal}
        onClose={() => setShowMurderMysteryModal(false)}
        currentUser={currentUser}
      />

      <ChessModal
        visible={showChessModal}
        onClose={() => setShowChessModal(false)}
        currentUser={currentUser}
      />

      <LudoModal
        visible={showLudoModal}
        onClose={() => setShowLudoModal(false)}
        currentUser={currentUser}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  headerLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginRight: 8,
    minWidth: 0,
  },
  headerTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  headerIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#EFF6FF",
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: "#64748B",
  },
  headerRightGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
    gap: 16,
  },
  gameCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  cardTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  cardTagText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  playerCountPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  playerCountText: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "600",
  },
  cardMainRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },
  cardEmojiBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
  cardEmoji: {
    fontSize: 24,
  },
  cardInfo: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.2,
  },
  cardGenre: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
    marginTop: 2,
  },
  cardDesc: {
    fontSize: 13,
    lineHeight: 19,
    color: "#475569",
    marginBottom: 16,
  },
  playBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 44,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  playBtnIcon: {
    marginRight: 6,
  },
  playBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },

  // Chess specific styles
  chessCard: {
    borderColor: "#E2E8F0",
  },
  chessTag: {
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
  },
  chessTagText: {
    color: "#2563EB",
  },
  chessEmojiBox: {
    backgroundColor: "#F1F5F9",
    borderColor: "#CBD5E1",
  },
  chessBtn: {
    backgroundColor: "#2563EB",
  },

  // Ludo specific styles
  ludoCard: {
    borderColor: "#FED7AA",
  },
  ludoTag: {
    backgroundColor: "#FFF7ED",
    borderColor: "#FDBA74",
  },
  ludoTagText: {
    color: "#EA580C",
  },
  ludoEmojiBox: {
    backgroundColor: "#FFF7ED",
    borderColor: "#FED7AA",
  },
  ludoBtn: {
    backgroundColor: "#EA580C",
  },

  // Murder Mystery specific styles
  mysteryCard: {
    borderColor: "#FECDD3",
  },
  mysteryTag: {
    backgroundColor: "#FFF1F2",
    borderColor: "#FDA4AF",
  },
  mysteryTagText: {
    color: "#E11D48",
  },
  mysteryEmojiBox: {
    backgroundColor: "#FFF1F2",
    borderColor: "#FECDD3",
  },
  mysteryBtn: {
    backgroundColor: "#E11D48",
  },
});
