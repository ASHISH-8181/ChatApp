import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type {
  ChatUser,
  LudoGameState,
  LudoPlayer,
} from "@chatapp/shared";
import { Ionicons } from "@/components/Icon";
import { Colors, Fonts } from "@/constants/theme";
import { socketService } from "@/services/socket";
import { LudoBoard } from "./LudoBoard";
import { LUDO_COLOR_HEX } from "./ludoEngine";

interface LudoModalProps {
  visible: boolean;
  onClose: () => void;
  currentUser: ChatUser | null;
}

export function LudoModal({ visible, onClose, currentUser }: LudoModalProps) {
  const [onlineRoom, setOnlineRoom] = useState<LudoGameState | null>(null);
  const [playerCount, setPlayerCount] = useState<number>(4);
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const [isCreatingOnline, setIsCreatingOnline] = useState(false);
  const [isJoiningOnline, setIsJoiningOnline] = useState(false);
  const [isRolling, setIsRolling] = useState(false);
  const [copiedCodeNotice, setCopiedCodeNotice] = useState(false);

  // Animation values using useState for React 19 compiler safety
  const [diceRotateAnim] = useState(() => new Animated.Value(0));
  const [diceScaleAnim] = useState(() => new Animated.Value(1));
  const [tokenPulseAnim] = useState(() => new Animated.Value(1));

  // Pulse animation for movable tokens
  useEffect(() => {
    const loopAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(tokenPulseAnim, {
          toValue: 1.25,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(tokenPulseAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ])
    );
    loopAnim.start();
    return () => loopAnim.stop();
  }, [tokenPulseAnim]);

  const triggerDiceAnimation = useCallback((finalValue: number) => {
    setIsRolling(true);
    diceRotateAnim.setValue(0);
    diceScaleAnim.setValue(1);

    Animated.parallel([
      Animated.timing(diceRotateAnim, {
        toValue: 1,
        duration: 550,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(diceScaleAnim, {
          toValue: 1.3,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(diceScaleAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      setIsRolling(false);
    });
  }, [diceRotateAnim, diceScaleAnim]);

  // Online Socket Subscriptions
  useEffect(() => {
    if (!visible) return;

    const unsubState = socketService.subscribeToLudoState((state) => {
      setOnlineRoom(state);
    });

    const unsubDice = socketService.subscribeToLudoDice(({ value }) => {
      triggerDiceAnimation(value);
    });

    return () => {
      unsubState();
      unsubDice();
    };
  }, [visible, triggerDiceAnimation]);

  // Create Room Handler
  const handleCreateOnline = async () => {
    if (!currentUser) return;
    setIsCreatingOnline(true);
    setOnlineError(null);
    try {
      const room = await socketService.createLudoRoom({
        adminId: currentUser.id,
        name: currentUser.name,
        username: currentUser.username,
        maxPlayers: playerCount,
        color: "RED",
      });
      setOnlineRoom(room);
    } catch (err: any) {
      setOnlineError(err.message || "Failed to create ludo room");
    } finally {
      setIsCreatingOnline(false);
    }
  };

  // Join Room Handler
  const handleJoinOnline = async () => {
    if (!currentUser || !joinCodeInput.trim()) return;
    setIsJoiningOnline(true);
    setOnlineError(null);
    try {
      const room = await socketService.joinLudoRoom({
        code: joinCodeInput.trim().toUpperCase(),
        userId: currentUser.id,
        name: currentUser.name,
        username: currentUser.username,
      });
      setOnlineRoom(room);
      setJoinCodeInput("");
    } catch (err: any) {
      setOnlineError(err.message || "Failed to join ludo room");
    } finally {
      setIsJoiningOnline(false);
    }
  };

  const handleStartOnlineGame = async () => {
    if (!onlineRoom || !currentUser) return;
    try {
      await socketService.startLudoGame(onlineRoom.roomId, currentUser.id);
    } catch (err: any) {
      setOnlineError(err.message || "Failed to start game");
    }
  };

  const handleRollDice = async () => {
    if (!onlineRoom || !currentUser || isRolling) return;
    try {
      const res = await socketService.rollLudoDice(onlineRoom.roomId, currentUser.id);
      triggerDiceAnimation(res.value);
    } catch (err: any) {
      setOnlineError(err.message || "Failed to roll dice");
    }
  };

  const handleMoveToken = (tokenId: number) => {
    if (!onlineRoom || !currentUser) return;
    socketService
      .moveLudoToken({
        roomId: onlineRoom.roomId,
        userId: currentUser.id,
        tokenId,
      })
      .catch((err) => {
        console.error("Move token failed:", err);
      });
  };

  const handleLeaveRoom = () => {
    if (onlineRoom && currentUser) {
      socketService.leaveLudo(onlineRoom.roomId, currentUser.id);
    }
    setOnlineRoom(null);
    setOnlineError(null);
  };

  const confirmLeaveRoom = () => {
    const executeExit = () => {
      handleLeaveRoom();
      onClose();
    };

    if (!onlineRoom || onlineRoom.status !== "playing") {
      executeExit();
      return;
    }

    if (Platform.OS === "web") {
      const ok =
        typeof window !== "undefined" && window.confirm
          ? window.confirm(
              "Exit & Forfeit Match?\n\nLeaving an ongoing match will count as an immediate forfeit and a LOSS for you! Do you wish to leave?"
            )
          : true;
      if (ok) {
        executeExit();
      }
      return;
    }

    Alert.alert(
      "Exit & Forfeit Match?",
      "Leaving an ongoing match will count as an immediate forfeit and a LOSS for you! Do you wish to leave?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Forfeit & Leave",
          style: "destructive",
          onPress: executeExit,
        },
      ]
    );
  };

  const activePlayer = onlineRoom?.players.find(
    (p) => p.color === onlineRoom.currentTurnColor
  );
  const myPlayer = onlineRoom?.players.find((p) => p.userId === currentUser?.id);
  const isMyTurn = myPlayer && onlineRoom?.currentTurnColor === myPlayer.color;

  const { width: screenWidth, height: screenHeight } = Dimensions.get("window");
  const boardSize = Math.floor(Math.min(screenWidth - 24, screenHeight * 0.46, 360));

  const spin = diceRotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "720deg"],
  });

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalContainer} edges={["top", "bottom"]}>
        {/* Top Header Bar */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={confirmLeaveRoom}
          >
            <Ionicons name="arrow-back" size={22} color="#F8FAFC" />
          </TouchableOpacity>

          <View style={styles.headerTitleBox}>
            <Text style={styles.headerTitle}>Ludo Club Online</Text>
            <Text style={styles.headerSubtitle}>
              {onlineRoom
                ? `Room: ${onlineRoom.code} • ${onlineRoom.players.length}/${onlineRoom.maxPlayers} Players`
                : "Up to 6 Players Online"}
            </Text>
          </View>

          {/* Spacer to keep title centered, removing duplicate exit button */}
          <View style={{ width: 40 }} />
        </View>

        {/* SCREEN 1: LOBBY (CREATE OR JOIN ROOM) */}
        {!onlineRoom && (
          <ScrollView
            contentContainerStyle={styles.lobbyScroll}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.lobbyCard}>
              <View style={styles.lobbyIconBox}>
                <Text style={styles.lobbyIcon}>🎲</Text>
              </View>

              <Text style={styles.lobbyTitle}>Online Ludo Room</Text>
              <Text style={styles.lobbyDesc}>
                Create an online room for up to 6 players or enter an existing 4-letter room code to race your tokens in real time!
              </Text>

              {onlineError && (
                <View style={styles.errorAlert}>
                  <Ionicons name="alert-circle" size={16} color="#EF4444" />
                  <Text style={styles.errorAlertText}>{onlineError}</Text>
                </View>
              )}

              {/* Player Count Selector for New Room */}
              <View style={styles.playerCountContainer}>
                <Text style={styles.playerCountTitle}>Select Max Players:</Text>
                <View style={styles.playerCountRow}>
                  {[2, 3, 4, 5, 6].map((count) => (
                    <TouchableOpacity
                      key={count}
                      style={[
                        styles.countPill,
                        playerCount === count && styles.countPillActive,
                      ]}
                      onPress={() => setPlayerCount(count)}
                    >
                      <Text
                        style={[
                          styles.countPillText,
                          playerCount === count && styles.countPillTextActive,
                        ]}
                      >
                        {count}P
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Create Room Button */}
              <TouchableOpacity
                style={styles.createBtn}
                onPress={handleCreateOnline}
                disabled={isCreatingOnline}
                activeOpacity={0.85}
              >
                {isCreatingOnline ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Ionicons name="add-circle" size={18} color="#FFFFFF" />
                    <Text style={styles.createBtnText}>
                      Create Room ({playerCount} Players)
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              <View style={styles.orDividerRow}>
                <View style={styles.orDividerLine} />
                <Text style={styles.orDividerText}>OR JOIN WITH CODE</Text>
                <View style={styles.orDividerLine} />
              </View>

              {/* Join Code Input */}
              <View style={styles.joinInputRow}>
                <TextInput
                  style={styles.joinInput}
                  placeholder="Enter code (e.g. LU44)"
                  placeholderTextColor="#64748B"
                  value={joinCodeInput}
                  onChangeText={setJoinCodeInput}
                  autoCapitalize="characters"
                  maxLength={6}
                />
                <TouchableOpacity
                  style={styles.joinSubmitBtn}
                  onPress={handleJoinOnline}
                  disabled={isJoiningOnline || !joinCodeInput.trim()}
                  activeOpacity={0.85}
                >
                  {isJoiningOnline ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.joinSubmitBtnText}>Join</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        )}

        {/* SCREEN 2: WAITING LOBBY (WAITING FOR PLAYERS) */}
        {onlineRoom && onlineRoom.status === "waiting" && (
          <ScrollView
            contentContainerStyle={styles.waitingScroll}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.waitingCard}>
              <Text style={styles.waitingEmoji}>🎲</Text>
              <Text style={styles.waitingTitle}>Waiting for Players...</Text>
              <Text style={styles.waitingSubtitle}>
                Share this Room Code with friends in chat to join!
              </Text>

              {/* Room Code Badge */}
              <TouchableOpacity
                style={styles.roomCodeBadge}
                onPress={() => setCopiedCodeNotice(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.roomCodeText}>{onlineRoom.code}</Text>
                <Ionicons name="copy-outline" size={18} color="#FB923C" style={{ marginLeft: 8 }} />
              </TouchableOpacity>

              {copiedCodeNotice && (
                <Text style={styles.copiedNoticeText}>Code: {onlineRoom.code} (Ready to share!)</Text>
              )}

              {/* Connected Players List */}
              <View style={styles.playersListCard}>
                <Text style={styles.playersListTitle}>
                  Joined Players ({onlineRoom.players.length} / {onlineRoom.maxPlayers}):
                </Text>

                {onlineRoom.players.map((p, idx) => (
                  <View key={p.id} style={styles.playerRowItem}>
                    <View style={[styles.playerColorIcon, { backgroundColor: LUDO_COLOR_HEX[p.color] }]} />
                    <Text style={styles.playerRowName}>
                      {p.name} {p.userId === onlineRoom.adminId ? "👑 (Host)" : ""}
                    </Text>
                    <Text style={styles.playerRowStatus}>Connected</Text>
                  </View>
                ))}

                {Array.from({ length: onlineRoom.maxPlayers - onlineRoom.players.length }).map((_, i) => (
                  <View key={`empty-${i}`} style={styles.emptySlotRow}>
                    <View style={styles.emptySlotDot} />
                    <Text style={styles.emptySlotText}>Waiting for player to join...</Text>
                  </View>
                ))}
              </View>

              {/* Start Game Button (for Host once 2+ players are in) */}
              {onlineRoom.adminId === currentUser?.id ? (
                <TouchableOpacity
                  style={[
                    styles.startGameBtn,
                    onlineRoom.players.length < 2 && styles.startGameBtnDisabled,
                  ]}
                  onPress={handleStartOnlineGame}
                  disabled={onlineRoom.players.length < 2}
                  activeOpacity={0.85}
                >
                  <Ionicons name="play" size={18} color="#FFFFFF" />
                  <Text style={styles.startGameBtnText}>
                    {onlineRoom.players.length < 2
                      ? "Waiting for at least 2 players..."
                      : `Start Game (${onlineRoom.players.length} Players)`}
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.waitingForHostBox}>
                  <ActivityIndicator size="small" color="#FB923C" />
                  <Text style={styles.waitingForHostText}>Waiting for Host to start game...</Text>
                </View>
              )}
            </View>
          </ScrollView>
        )}

        {/* SCREEN 3: ACTIVE PLAYING GAME */}
        {onlineRoom && (onlineRoom.status === "playing" || onlineRoom.status === "game_over") && (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Status Announcement Bar */}
            <View
              style={[
                styles.actionAlertBox,
                { borderColor: LUDO_COLOR_HEX[onlineRoom.currentTurnColor] },
              ]}
            >
              <View
                style={[
                  styles.turnDot,
                  { backgroundColor: LUDO_COLOR_HEX[onlineRoom.currentTurnColor] },
                ]}
              />
              <Text style={styles.actionAlertText}>
                {onlineRoom.lastActionText || "Game in progress"}
              </Text>
            </View>

            {/* Victory Podium */}
            {onlineRoom.status === "game_over" && (
              <View style={styles.victoryCard}>
                <Text style={styles.victoryTrophy}>🏆</Text>
                <Text style={styles.victoryTitle}>GAME FINISHED!</Text>
                <View style={styles.podiumList}>
                  {onlineRoom.winnerList.map((w) => {
                    const matchedPlayer = onlineRoom.players.find((p) => p.color === w.color);
                    const isForfeited = matchedPlayer?.isForfeited;
                    return (
                      <View key={w.color} style={styles.podiumItem}>
                        <Text style={styles.podiumRank}>
                          {isForfeited ? "🚪 Loss" : w.rank === 1 ? "🥇 1st" : w.rank === 2 ? "🥈 2nd" : w.rank === 3 ? "🥉 3rd" : `#${w.rank}`}
                        </Text>
                        <View
                          style={[
                            styles.podiumColorTag,
                            { backgroundColor: isForfeited ? "#475569" : LUDO_COLOR_HEX[w.color] },
                          ]}
                        >
                          <Text style={styles.podiumColorText}>
                            {w.name} {isForfeited ? "(Forfeit)" : ""}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>

                <View style={styles.winnerBtnRow}>
                  {onlineRoom.adminId === currentUser?.id && (
                    <TouchableOpacity
                      style={styles.playAgainBtn}
                      onPress={() => {
                        if (currentUser) {
                          socketService.resetLudo(onlineRoom.roomId, currentUser.id);
                        }
                      }}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="refresh" size={16} color="#FFFFFF" />
                      <Text style={styles.playAgainBtnText}>Play Again</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={styles.leaveAfterGameBtn}
                    onPress={() => {
                      handleLeaveRoom();
                      onClose();
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="exit-outline" size={16} color="#EF4444" />
                    <Text style={styles.leaveAfterGameBtnText}>Exit</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* 5th & 6th Player Pods (for 5-6 player rooms) */}
            {onlineRoom.players.length >= 5 && (
              <View style={styles.extraPlayersRow}>
                {onlineRoom.players[4] && renderExtraPlayerPod(onlineRoom.players[4])}
                {onlineRoom.players[5] && renderExtraPlayerPod(onlineRoom.players[5])}
              </View>
            )}

            {/* Authentic 15x15 Classic Ludo Board */}
            <LudoBoard
              room={onlineRoom}
              currentUserId={currentUser?.id}
              boardSize={boardSize}
              tokenPulseAnim={tokenPulseAnim}
              onMoveToken={handleMoveToken}
            />

            {/* Dice Rolling & Turn Action Bar */}
            <View style={styles.diceSection}>
              {/* Active Player Status Badge */}
              <View
                style={[
                  styles.activePlayerBadge,
                  { backgroundColor: LUDO_COLOR_HEX[onlineRoom.currentTurnColor] },
                ]}
              >
                <Ionicons name="person" size={16} color="#FFFFFF" />
                <Text style={styles.activePlayerName}>
                  {`${activePlayer?.name || "Player"}'s Turn`}
                </Text>
              </View>

              {/* Animated 3D Dice Box (Always shows dice face) */}
              <TouchableOpacity
                style={styles.diceTouchable}
                onPress={handleRollDice}
                disabled={!isMyTurn || isRolling || onlineRoom.hasRolled}
                activeOpacity={0.8}
              >
                <Animated.View
                  style={[
                    styles.diceCube,
                    !isMyTurn && styles.diceCubeInactive,
                    {
                      transform: [
                        { rotate: spin },
                        { scale: diceScaleAnim },
                      ],
                    },
                  ]}
                >
                  {renderDicePips(onlineRoom.diceValue || 6)}
                </Animated.View>
              </TouchableOpacity>

              {/* Roll text according to player chance below the dice */}
              <TouchableOpacity
                style={[
                  styles.rollChanceBtn,
                  isMyTurn && !onlineRoom.hasRolled
                    ? {
                        backgroundColor: LUDO_COLOR_HEX[onlineRoom.currentTurnColor],
                        borderColor: "#FDE047",
                        borderWidth: 2,
                      }
                    : styles.rollChanceBtnDisabled,
                ]}
                onPress={handleRollDice}
                disabled={!isMyTurn || isRolling || onlineRoom.hasRolled}
                activeOpacity={0.85}
              >
                {isRolling ? (
                  <View style={styles.rollChanceRow}>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <Text style={styles.rollChanceText}>Rolling Dice...</Text>
                  </View>
                ) : isMyTurn ? (
                  !onlineRoom.hasRolled ? (
                    <View style={styles.rollChanceRow}>
                      <Ionicons name="dice" size={18} color="#FFFFFF" />
                      <Text style={styles.rollChanceText}>YOUR CHANCE • ROLL DICE</Text>
                    </View>
                  ) : (
                    <View style={styles.rollChanceRow}>
                      <Ionicons name="hand-right" size={16} color="#FFFFFF" />
                      <Text style={styles.rollChanceText}>
                        {onlineRoom.movableTokens.length > 0
                          ? `Rolled ${onlineRoom.diceValue}! Tap a token to move`
                          : `Rolled ${onlineRoom.diceValue} • No legal moves`}
                      </Text>
                    </View>
                  )
                ) : (
                  <View style={styles.rollChanceRow}>
                    <View
                      style={[
                        styles.playerChanceDot,
                        { backgroundColor: LUDO_COLOR_HEX[onlineRoom.currentTurnColor] },
                      ]}
                    />
                    <Text style={styles.rollChanceTextWaiting}>
                      {`${activePlayer?.name || "Player"}'s Chance to Roll...`}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {/* In-Game Exit / Resign Button */}
            {onlineRoom.status === "playing" && (
              <TouchableOpacity
                style={styles.resignMatchBtn}
                onPress={confirmLeaveRoom}
                activeOpacity={0.8}
              >
                <Ionicons name="exit-outline" size={16} color="#EF4444" />
                <Text style={styles.resignMatchBtnText}>Exit Game (Counts as Loss)</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );

  function renderExtraPlayerPod(player: LudoPlayer) {
    if (!onlineRoom) return null;
    const isCurrent = player.color === onlineRoom.currentTurnColor;
    const isMe = player.userId === currentUser?.id;
    const colorHex = LUDO_COLOR_HEX[player.color];

    return (
      <View
        key={player.color}
        style={[
          styles.extraPlayerCard,
          { borderColor: colorHex },
          isCurrent && styles.extraPlayerCardActive,
        ]}
      >
        <View style={styles.baseHeaderRow}>
          <View style={[styles.baseColorSquare, { backgroundColor: colorHex }]} />
          <Text style={styles.basePlayerName} numberOfLines={1}>
            {player.name} {isMe ? "(You)" : ""}
          </Text>
          {player.hasFinished && <Text style={styles.rankBadge}>#{player.rank}</Text>}
        </View>

        <View style={styles.baseTokensGrid}>
          {player.tokens.map((token) => {
            const isMovable =
              isMe &&
              isCurrent &&
              onlineRoom.hasRolled &&
              onlineRoom.movableTokens.includes(token.id);

            return (
              <TouchableOpacity
                key={token.id}
                style={styles.tokenSlot}
                disabled={!isMovable}
                onPress={() => handleMoveToken(token.id)}
              >
                <Animated.View
                  style={[
                    styles.tokenCircle,
                    { backgroundColor: colorHex },
                    token.isHome && styles.tokenHomeCircle,
                    isMovable && {
                      transform: [{ scale: tokenPulseAnim }],
                      borderColor: "#FBBF24",
                      borderWidth: 2.5,
                    },
                  ]}
                >
                  {token.isHome ? (
                    <Text style={styles.tokenLabel}>🏆</Text>
                  ) : (
                    <View style={styles.tokenGlossDot} />
                  )}
                </Animated.View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  }

  function renderDicePips(value: number) {
    const pips: Record<number, number[]> = {
      1: [4],
      2: [0, 8],
      3: [0, 4, 8],
      4: [0, 2, 6, 8],
      5: [0, 2, 4, 6, 8],
      6: [0, 2, 3, 5, 6, 8],
    };

    const activePips = pips[value] || [4];

    return (
      <View style={styles.dicePipGrid}>
        {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((index) => (
          <View key={index} style={styles.pipCell}>
            {activePips.includes(index) && <View style={styles.pipDot} />}
          </View>
        ))}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: "#070B14",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#1E293B",
    justifyContent: "center",
    alignItems: "center",
  },
  leaveButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  headerTitleBox: {
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: Fonts.extraBold,
    color: "#F8FAFC",
  },
  headerSubtitle: {
    fontSize: 11,
    fontFamily: Fonts.medium,
    color: "#94A3B8",
    marginTop: 1,
  },

  /* Lobby */
  lobbyScroll: {
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
    flexGrow: 1,
  },
  lobbyCard: {
    width: "100%",
    backgroundColor: "#0F172A",
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: "#1E293B",
    alignItems: "center",
  },
  lobbyIconBox: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "#1E293B",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#334155",
  },
  lobbyIcon: {
    fontSize: 34,
  },
  lobbyTitle: {
    fontSize: 20,
    fontFamily: Fonts.extraBold,
    color: "#F8FAFC",
    textAlign: "center",
  },
  lobbyDesc: {
    fontSize: 13,
    fontFamily: Fonts.bodyRegular,
    color: "#94A3B8",
    textAlign: "center",
    lineHeight: 19,
    marginTop: 6,
    marginBottom: 18,
  },
  errorAlert: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    padding: 10,
    borderRadius: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
    width: "100%",
  },
  errorAlertText: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: "#EF4444",
  },
  playerCountContainer: {
    width: "100%",
    marginBottom: 16,
  },
  playerCountTitle: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: "#CBD5E1",
    marginBottom: 8,
  },
  playerCountRow: {
    flexDirection: "row",
    gap: 8,
    width: "100%",
  },
  countPill: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
  },
  countPillActive: {
    backgroundColor: "#EA580C",
    borderColor: "#EA580C",
  },
  countPillText: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: "#94A3B8",
  },
  countPillTextActive: {
    color: "#FFFFFF",
  },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#EA580C",
    paddingVertical: 14,
    borderRadius: 14,
    width: "100%",
  },
  createBtnText: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: "#FFFFFF",
  },
  orDividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 18,
    width: "100%",
  },
  orDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#1E293B",
  },
  orDividerText: {
    marginHorizontal: 10,
    fontSize: 10,
    fontFamily: Fonts.bold,
    color: "#64748B",
    letterSpacing: 0.5,
  },
  joinInputRow: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },
  joinInput: {
    flex: 1,
    backgroundColor: "#1E293B",
    borderRadius: 12,
    paddingHorizontal: 14,
    color: "#F8FAFC",
    fontFamily: Fonts.bold,
    fontSize: 14,
    borderWidth: 1,
    borderColor: "#334155",
  },
  joinSubmitBtn: {
    backgroundColor: "#334155",
    paddingHorizontal: 22,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 12,
  },
  joinSubmitBtnText: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: "#FFFFFF",
  },

  /* Waiting Screen */
  waitingScroll: {
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
    flexGrow: 1,
  },
  waitingCard: {
    width: "100%",
    backgroundColor: "#0F172A",
    borderRadius: 24,
    padding: 22,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  waitingEmoji: {
    fontSize: 34,
    marginBottom: 8,
  },
  waitingTitle: {
    fontSize: 19,
    fontFamily: Fonts.extraBold,
    color: "#F8FAFC",
  },
  waitingSubtitle: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: "#94A3B8",
    textAlign: "center",
    marginTop: 4,
    marginBottom: 16,
  },
  roomCodeBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1E293B",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#FB923C",
    marginBottom: 8,
  },
  roomCodeText: {
    fontSize: 24,
    fontFamily: Fonts.extraBold,
    color: "#F8FAFC",
    letterSpacing: 2,
  },
  copiedNoticeText: {
    fontSize: 11,
    fontFamily: Fonts.bold,
    color: "#10B981",
    marginBottom: 14,
  },
  playersListCard: {
    width: "100%",
    backgroundColor: "#1E293B",
    borderRadius: 16,
    padding: 14,
    marginVertical: 14,
    gap: 8,
  },
  playersListTitle: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: "#CBD5E1",
    marginBottom: 4,
  },
  playerRowItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#0F172A",
    padding: 10,
    borderRadius: 10,
  },
  playerColorIcon: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  playerRowName: {
    flex: 1,
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: "#F8FAFC",
  },
  playerRowStatus: {
    fontSize: 10,
    fontFamily: Fonts.medium,
    color: "#10B981",
  },
  emptySlotRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#334155",
    borderStyle: "dashed",
  },
  emptySlotDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#475569",
  },
  emptySlotText: {
    fontSize: 11,
    fontFamily: Fonts.medium,
    color: "#64748B",
  },
  startGameBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 14,
    width: "100%",
    marginTop: 6,
  },
  startGameBtnDisabled: {
    backgroundColor: "#334155",
    opacity: 0.6,
  },
  startGameBtnText: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: "#FFFFFF",
  },
  waitingForHostBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
  },
  waitingForHostText: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: "#FB923C",
  },

  /* Active Game Screen */
  scrollContent: {
    alignItems: "center",
    padding: 16,
    paddingBottom: 75,
  },
  actionAlertBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#0F172A",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    width: "100%",
    marginBottom: 14,
  },
  turnDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  actionAlertText: {
    flex: 1,
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: "#F8FAFC",
  },
  victoryCard: {
    alignItems: "center",
    backgroundColor: "#1E293B",
    padding: 16,
    borderRadius: 18,
    marginBottom: 14,
    width: "100%",
    borderWidth: 1,
    borderColor: "#F59E0B",
  },
  victoryTrophy: {
    fontSize: 32,
    marginBottom: 4,
  },
  victoryTitle: {
    fontSize: 17,
    fontFamily: Fonts.extraBold,
    color: "#F8FAFC",
  },
  podiumList: {
    width: "100%",
    marginVertical: 10,
    gap: 6,
  },
  podiumItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  podiumRank: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: "#FBBF24",
  },
  podiumColorTag: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
  },
  podiumColorText: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: "#FFFFFF",
  },
  winnerBtnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 4,
  },
  playAgainBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  playAgainBtnText: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: "#FFFFFF",
  },
  leaveAfterGameBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#334155",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  leaveAfterGameBtnText: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: "#EF4444",
  },
  resignMatchBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginTop: 10,
    marginBottom: 20,
    alignSelf: "center",
  },
  resignMatchBtnText: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: "#EF4444",
  },
  extraPlayersRow: {
    flexDirection: "row",
    gap: 8,
    width: "100%",
    marginBottom: 10,
  },
  extraPlayerCard: {
    flex: 1,
    backgroundColor: "#0F172A",
    borderRadius: 14,
    padding: 8,
    borderWidth: 1.5,
  },
  extraPlayerCardActive: {
    borderWidth: 2.5,
    shadowColor: "#FBBF24",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 4,
  },
  baseHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  baseColorSquare: {
    width: 12,
    height: 12,
    borderRadius: 4,
  },
  basePlayerName: {
    flex: 1,
    fontSize: 11,
    fontFamily: Fonts.bold,
    color: "#F8FAFC",
  },
  rankBadge: {
    fontSize: 10,
    fontFamily: Fonts.bold,
    color: "#10B981",
  },
  baseTokensGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 4,
  },
  tokenSlot: {
    flex: 1,
    alignItems: "center",
  },
  tokenCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
  tokenHomeCircle: {
    backgroundColor: "#10B981",
  },
  tokenLabel: {
    fontSize: 8,
    fontFamily: Fonts.extraBold,
    color: "#FFFFFF",
  },
  diceSection: {
    alignItems: "center",
    marginTop: 16,
    marginBottom: 12,
    width: "100%",
  },
  activePlayerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 12,
  },
  activePlayerName: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: "#FFFFFF",
  },
  diceTouchable: {
    marginBottom: 8,
  },
  diceCube: {
    width: 68,
    height: 68,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
    borderWidth: 2,
    borderColor: "#E2E8F0",
  },
  diceCubeInactive: {
    opacity: 0.6,
  },
  tokenGlossDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
  },
  rollChanceBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  rollChanceBtnDisabled: {
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
  },
  rollChanceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rollChanceText: {
    fontSize: 13,
    fontFamily: Fonts.extraBold,
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  playerChanceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  rollChanceTextWaiting: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: "#94A3B8",
  },
  dicePipGrid: {
    width: 48,
    height: 48,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignContent: "space-between",
  },
  pipCell: {
    width: 14,
    height: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  pipDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#0F172A",
  },
  rollHint: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: "#94A3B8",
    marginTop: 4,
  },
});
