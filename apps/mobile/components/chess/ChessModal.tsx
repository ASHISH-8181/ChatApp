import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
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
  ChessColor,
  ChessGameState,
  GameChatMessage,
} from "@chatapp/shared";
import { Ionicons } from "@/components/Icon";
import { Colors, Fonts } from "@/constants/theme";
import { socketService } from "@/services/socket";
import { GameChatBubble } from "@/components/game-comm/GameChatBubble";
import { GameChatModal } from "@/components/game-comm/GameChatModal";
import { GameVoiceBar } from "@/components/game-comm/GameVoiceBar";
import { useGameVoice } from "@/components/game-comm/useGameVoice";
import {
  coordToAlgebraic,
  findKing,
  getLegalMoves,
  PIECE_GLYPHS,
  PIECE_VALUES,
  type Board,
  type MoveOption,
} from "./chessEngine";

interface ChessModalProps {
  visible: boolean;
  onClose: () => void;
  currentUser: ChatUser | null;
}

export function ChessModal({ visible, onClose, currentUser }: ChessModalProps) {
  const [onlineRoom, setOnlineRoom] = useState<ChessGameState | null>(null);
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const [isCreatingOnline, setIsCreatingOnline] = useState(false);
  const [isJoiningOnline, setIsJoiningOnline] = useState(false);
  const [selectedCoord, setSelectedCoord] = useState<{ row: number; col: number } | null>(null);
  const [legalMoves, setLegalMoves] = useState<MoveOption[]>([]);
  const [copiedCodeNotice, setCopiedCodeNotice] = useState(false);

  // In-Game Live Chat & Voice State
  const [chatMessages, setChatMessages] = useState<GameChatMessage[]>([]);
  const [showChatModal, setShowChatModal] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [playerBubbleMessages, setPlayerBubbleMessages] = useState<
    Record<string, { text: string; senderName: string; senderColor?: string }>
  >({});

  const {
    isMuted,
    isSpeaking,
    speakingUserIds,
    toggleMic,
    isSpeakerMuted,
    toggleSpeaker,
  } = useGameVoice({
    gameType: "chess",
    roomId: onlineRoom?.roomId || "",
    userId: currentUser?.id,
    userName: currentUser?.name,
    enabled: visible && !!onlineRoom && (onlineRoom.status === "playing" || onlineRoom.status === "waiting"),
  });

  // Pulse animation for waiting room & check banner
  const [pulseAnim] = useState(() => new Animated.Value(1));

  useEffect(() => {
    const loopAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.08,
          duration: 750,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 750,
          useNativeDriver: true,
        }),
      ])
    );
    loopAnim.start();
    return () => loopAnim.stop();
  }, [pulseAnim]);

  // Online socket subscriptions
  useEffect(() => {
    if (!visible) return;

    const unsubState = socketService.subscribeToChessState((state) => {
      setOnlineRoom(state);
      setSelectedCoord(null);
      setLegalMoves([]);
    });

    const unsubMove = socketService.subscribeToChessMove(({ room }) => {
      setOnlineRoom(room);
      setSelectedCoord(null);
      setLegalMoves([]);
    });

    return () => {
      unsubState();
      unsubMove();
    };
  }, [visible]);

  // Subscribe to in-game chat messages
  const currentChessRoomId = onlineRoom?.roomId;
  useEffect(() => {
    if (!visible || !currentChessRoomId) return;

    const unsubChat = socketService.subscribeToGameChat((msg) => {
      if (msg.roomId !== currentChessRoomId) return;
      setChatMessages((prev) => [...prev, msg]);

      if (!showChatModal && msg.senderId !== currentUser?.id) {
        setUnreadChatCount((prev) => prev + 1);
      }

      setPlayerBubbleMessages((prev) => ({
        ...prev,
        [msg.senderId]: {
          text: msg.text,
          senderName: msg.senderName,
          senderColor: msg.senderColor,
        },
      }));

      setTimeout(() => {
        setPlayerBubbleMessages((prev) => {
          const copy = { ...prev };
          delete copy[msg.senderId];
          return copy;
        });
      }, 5500);
    });

    return () => {
      unsubChat();
    };
  }, [visible, currentChessRoomId, showChatModal, currentUser?.id]);

  const handleSendChat = (text: string) => {
    if (!onlineRoom || !currentUser) return;
    const isWhite = onlineRoom.whitePlayer?.userId === currentUser.id;
    socketService.sendGameChat({
      gameType: "chess",
      roomId: onlineRoom.roomId,
      senderId: currentUser.id,
      senderName: currentUser.name,
      senderColor: isWhite ? "#38BDF8" : "#94A3B8",
      text,
    });
  };

  // Create room handler
  const handleCreateOnline = async () => {
    if (!currentUser) return;
    setIsCreatingOnline(true);
    setOnlineError(null);
    try {
      const room = await socketService.createChessRoom({
        adminId: currentUser.id,
        name: currentUser.name,
        username: currentUser.username,
        preferredColor: "w",
      });
      setOnlineRoom(room);
    } catch (err: any) {
      setOnlineError(err.message || "Failed to create chess room");
    } finally {
      setIsCreatingOnline(false);
    }
  };

  // Join room handler
  const handleJoinOnline = async () => {
    if (!currentUser || !joinCodeInput.trim()) return;
    setIsJoiningOnline(true);
    setOnlineError(null);
    try {
      const room = await socketService.joinChessRoom({
        code: joinCodeInput.trim().toUpperCase(),
        userId: currentUser.id,
        name: currentUser.name,
        username: currentUser.username,
      });
      setOnlineRoom(room);
      setJoinCodeInput("");
    } catch (err: any) {
      setOnlineError(err.message || "Failed to join chess room");
    } finally {
      setIsJoiningOnline(false);
    }
  };

  const handleLeaveRoom = () => {
    if (onlineRoom && currentUser) {
      socketService.leaveChess(onlineRoom.roomId, currentUser.id);
    }
    setOnlineRoom(null);
    setSelectedCoord(null);
    setLegalMoves([]);
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
              "Resign & Exit Match?\n\nLeaving an ongoing game will count as an immediate forfeit and a LOSS for you! Your opponent will win the match."
            )
          : true;
      if (ok) {
        executeExit();
      }
      return;
    }

    Alert.alert(
      "Resign & Exit Match?",
      "Leaving an ongoing game will count as an immediate forfeit and a LOSS for you! Your opponent will win the match.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Resign & Leave",
          style: "destructive",
          onPress: executeExit,
        },
      ]
    );
  };

  const handleSelectSquare = (row: number, col: number) => {
    if (!onlineRoom || onlineRoom.status !== "playing" || !currentUser) return;

    // Determine current user's color
    const isWhiteUser = onlineRoom.whitePlayer?.userId === currentUser.id;
    const isBlackUser = onlineRoom.blackPlayer?.userId === currentUser.id;
    const myColor: ChessColor | null = isWhiteUser ? "w" : isBlackUser ? "b" : null;

    if (!myColor || onlineRoom.turn !== myColor) return; // Not user's turn

    const board = onlineRoom.board as Board;
    const piece = board[row][col];

    // Deselect if already selected
    if (selectedCoord && selectedCoord.row === row && selectedCoord.col === col) {
      setSelectedCoord(null);
      setLegalMoves([]);
      return;
    }

    // If destination is legal move, send move to server
    if (selectedCoord) {
      const isLegal = legalMoves.some((m) => m.toRow === row && m.toCol === col);
      if (isLegal) {
        const from = coordToAlgebraic(selectedCoord.row, selectedCoord.col);
        const to = coordToAlgebraic(row, col);

        socketService
          .moveChess({
            roomId: onlineRoom.roomId,
            userId: currentUser.id,
            from,
            to,
          })
          .catch((err) => {
            console.error("Chess move error:", err);
          });

        setSelectedCoord(null);
        setLegalMoves([]);
        return;
      }
    }

    // Select piece
    if (piece && piece.color === myColor) {
      setSelectedCoord({ row, col });
      const moves = getLegalMoves(board, row, col);
      setLegalMoves(moves);
    } else {
      setSelectedCoord(null);
      setLegalMoves([]);
    }
  };

  const isWhiteUser = onlineRoom?.whitePlayer?.userId === currentUser?.id;
  const isBlackUser = onlineRoom?.blackPlayer?.userId === currentUser?.id;
  const myColor: ChessColor = isWhiteUser ? "w" : "b";
  const isMyTurn = onlineRoom?.turn === myColor;

  // Board orientation: if current user is Black, flip board so Black is at bottom
  const shouldFlipBoard = isBlackUser;
  const rows = shouldFlipBoard ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  const cols = shouldFlipBoard ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];

  const screenWidth = Dimensions.get("window").width;
  const boardSize = Math.min(screenWidth - 32, 380);
  const squareSize = boardSize / 8;

  const opponentPlayer = isWhiteUser ? onlineRoom?.blackPlayer : onlineRoom?.whitePlayer;
  const mePlayer = isWhiteUser ? onlineRoom?.whitePlayer : onlineRoom?.blackPlayer;

  const capturedWhite = onlineRoom?.capturedWhite || [];
  const capturedBlack = onlineRoom?.capturedBlack || [];
  const whiteScore = capturedBlack.reduce((acc, p) => acc + PIECE_VALUES[p.type], 0);
  const blackScore = capturedWhite.reduce((acc, p) => acc + PIECE_VALUES[p.type], 0);

  const opponentAdvantage = isWhiteUser ? blackScore - whiteScore : whiteScore - blackScore;
  const myAdvantage = isWhiteUser ? whiteScore - blackScore : blackScore - whiteScore;

  const kingPos =
    onlineRoom?.isCheck && onlineRoom?.board
      ? findKing(onlineRoom.board as Board, onlineRoom.turn)
      : null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalContainer} edges={["top", "bottom"]}>
        {/* Top Header Bar */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={confirmLeaveRoom}
          >
            <Ionicons name="arrow-back" size={20} color="#F8FAFC" />
          </TouchableOpacity>

          <View style={styles.headerTitleBox}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {onlineRoom ? `Chess • ${onlineRoom.code}` : "Chess Online"}
            </Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {onlineRoom
                ? onlineRoom.status === "playing" ? "In Game Duel" : "Waiting for Player"
                : "2-Player Duel"}
            </Text>
          </View>

          {/* Right Action: Voice & Chat Communication Bar */}
          {onlineRoom ? (
            <GameVoiceBar
              isMuted={isMuted}
              isSpeaking={isSpeaking}
              onToggleMic={toggleMic}
              isSpeakerMuted={isSpeakerMuted}
              onToggleSpeaker={toggleSpeaker}
              onOpenChat={() => {
                setShowChatModal(true);
                setUnreadChatCount(0);
              }}
              unreadChatCount={unreadChatCount}
            />
          ) : (
            <View style={{ width: 36 }} />
          )}
        </View>

        {/* SCREEN 1: LOBBY (CREATE OR JOIN ROOM) */}
        {!onlineRoom && (
          <ScrollView
            contentContainerStyle={styles.lobbyScroll}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.lobbyCard}>
              <View style={styles.lobbyIconBox}>
                <Text style={styles.lobbyIcon}>♟️</Text>
              </View>

              <Text style={styles.lobbyTitle}>Online 2-Player Chess</Text>
              <Text style={styles.lobbyDesc}>
                Create an online game room and share the 4-letter code with a friend, or enter an existing code to duel in real time!
              </Text>

              {onlineError && (
                <View style={styles.errorAlert}>
                  <Ionicons name="alert-circle" size={16} color="#EF4444" />
                  <Text style={styles.errorAlertText}>{onlineError}</Text>
                </View>
              )}

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
                    <Text style={styles.createBtnText}>Create 2-Player Room</Text>
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
                  placeholder="Enter code (e.g. CH82)"
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

        {/* SCREEN 2: WAITING FOR OPPONENT */}
        {onlineRoom && onlineRoom.status === "waiting" && (
          <View style={styles.waitingContainer}>
            <View style={styles.waitingCard}>
              <Animated.View
                style={[
                  styles.waitingPulseBox,
                  { transform: [{ scale: pulseAnim }] },
                ]}
              >
                <Text style={styles.waitingEmoji}>♟️</Text>
              </Animated.View>

              <Text style={styles.waitingTitle}>Waiting for Opponent...</Text>
              <Text style={styles.waitingSubtitle}>
                Share this 4-letter Room Code with your friend in chat
              </Text>

              {/* Room Code Badge */}
              <TouchableOpacity
                style={styles.roomCodeBadge}
                onPress={() => setCopiedCodeNotice(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.roomCodeText}>{onlineRoom.code}</Text>
                <Ionicons name="copy-outline" size={18} color="#38BDF8" style={{ marginLeft: 8 }} />
              </TouchableOpacity>

              {copiedCodeNotice && (
                <Text style={styles.copiedNoticeText}>Code: {onlineRoom.code} (Ready to share!)</Text>
              )}

              {/* Player Slots */}
              <View style={styles.slotRow}>
                <View style={styles.slotCard}>
                  <View style={[styles.slotDot, { backgroundColor: "#FFFFFF" }]} />
                  <Text style={styles.slotName} numberOfLines={1}>
                    White: {onlineRoom.whitePlayer?.name || "Ready"}
                  </Text>
                  <Text style={styles.slotStatus}>Host (You)</Text>
                </View>

                <View style={[styles.slotCard, styles.slotCardEmpty]}>
                  <View style={[styles.slotDot, { backgroundColor: "#475569" }]} />
                  <Text style={styles.slotNameMuted}>Black: Waiting...</Text>
                  <Text style={styles.slotStatusMuted}>Needs 1 player</Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.cancelRoomBtn}
                onPress={handleLeaveRoom}
                activeOpacity={0.8}
              >
                <Text style={styles.cancelRoomBtnText}>Leave / Cancel Room</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* SCREEN 3: ACTIVE PLAYING GAME */}
        {onlineRoom && (onlineRoom.status === "playing" || onlineRoom.status === "game_over") && (
          <ScrollView
            contentContainerStyle={styles.gameContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Top Bar: Opponent Player */}
            <View style={[styles.playerBar, { position: "relative", marginTop: 22, zIndex: 100 }]}>
              {/* Floating Speech Bubble directly above Opponent's name */}
              {opponentPlayer && playerBubbleMessages[opponentPlayer.userId] && (
                <GameChatBubble
                  text={playerBubbleMessages[opponentPlayer.userId].text}
                  senderName={playerBubbleMessages[opponentPlayer.userId].senderName}
                  senderColor={playerBubbleMessages[opponentPlayer.userId].senderColor}
                  onPress={() => {
                    setShowChatModal(true);
                    setUnreadChatCount(0);
                  }}
                  position="top"
                />
              )}

              <View style={styles.playerInfoLeft}>
                <View
                  style={[
                    styles.playerColorDot,
                    {
                      backgroundColor: isWhiteUser ? "#0F172A" : "#FFFFFF",
                      borderColor: (opponentPlayer && speakingUserIds[opponentPlayer.userId]) ? "#10B981" : "#475569",
                      borderWidth: (opponentPlayer && speakingUserIds[opponentPlayer.userId]) ? 2.5 : 1,
                    },
                  ]}
                />
                <View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={styles.playerName}>
                      {opponentPlayer?.name || "Opponent"} ({isWhiteUser ? "Black" : "White"})
                    </Text>
                    {opponentPlayer && speakingUserIds[opponentPlayer.userId] && (
                      <View style={styles.speakingBadge}>
                        <Text style={styles.speakingBadgeText}>🔊 Speaking</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.playerSubtitle}>
                    {onlineRoom.turn !== myColor ? "Opponent's turn to move..." : "Waiting for you"}
                  </Text>
                </View>
              </View>

              {/* Opponent captured tray */}
              <View style={styles.capturedTray}>
                {(isWhiteUser ? capturedWhite : capturedBlack).slice(-6).map((p, idx) => (
                  <Text key={idx} style={styles.capturedPieceGlyph}>
                    {PIECE_GLYPHS[isWhiteUser ? "w" : "b"][p.type]}
                  </Text>
                ))}
                {opponentAdvantage > 0 && (
                  <View style={styles.advantageBadge}>
                    <Text style={styles.advantageText}>+{opponentAdvantage}</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Check Alert Banner */}
            {onlineRoom.isCheck && !onlineRoom.isCheckmate && (
              <Animated.View style={[styles.checkBanner, { transform: [{ scale: pulseAnim }] }]}>
                <Ionicons name="warning" size={16} color="#EF4444" />
                <Text style={styles.checkBannerText}>
                  CHECK! {onlineRoom.turn === "w" ? "White" : "Black"} King is attacked!
                </Text>
              </Animated.View>
            )}

            {/* Checkmate / Stalemate / Resign Card */}
            {(onlineRoom.isCheckmate || onlineRoom.isStalemate || onlineRoom.status === "game_over") && (
              <View style={styles.winnerCard}>
                <Text style={styles.winnerEmoji}>
                  {onlineRoom.resignedBy ? "🚪" : onlineRoom.isCheckmate ? "🏆" : "🤝"}
                </Text>
                <Text style={styles.winnerTitle}>
                  {onlineRoom.resignedBy
                    ? onlineRoom.resignedBy === currentUser?.id
                      ? "YOU FORFEITED! Counted as a Loss."
                      : `${onlineRoom.resignedByName || "Opponent"} resigned! You win by forfeit! 🏆`
                    : onlineRoom.isCheckmate
                    ? `CHECKMATE! ${onlineRoom.winner === "w" ? "White" : "Black"} Wins!`
                    : "STALEMATE! It's a Draw!"}
                </Text>

                <View style={styles.winnerBtnRow}>
                  <TouchableOpacity
                    style={styles.playAgainBtn}
                    onPress={() => {
                      if (currentUser) {
                        socketService.resetChess(onlineRoom.roomId, currentUser.id);
                      }
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="refresh" size={16} color="#FFFFFF" />
                    <Text style={styles.playAgainBtnText}>Play Again</Text>
                  </TouchableOpacity>

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

            {/* 8x8 Chessboard */}
            <View
              style={[
                styles.boardContainer,
                { width: boardSize, height: boardSize },
              ]}
            >
              {rows.map((r) => (
                <View key={r} style={styles.boardRow}>
                  {cols.map((c) => {
                    const isDark = (r + c) % 2 === 1;
                    const piece = onlineRoom.board[r][c];
                    const isSelected = selectedCoord?.row === r && selectedCoord?.col === c;
                    const isLegalMove = legalMoves.some((m) => m.toRow === r && m.toCol === c);
                    const isCaptureTarget = isLegalMove && piece !== null;
                    const isLastMoveSquare =
                      onlineRoom.lastMove &&
                      (onlineRoom.lastMove.from === coordToAlgebraic(r, c) ||
                        onlineRoom.lastMove.to === coordToAlgebraic(r, c));
                    const isCheckSquare = kingPos && kingPos.row === r && kingPos.col === c;

                    return (
                      <TouchableOpacity
                        key={`${r}-${c}`}
                        style={[
                          styles.square,
                          {
                            width: squareSize,
                            height: squareSize,
                            backgroundColor: isDark ? "#B58863" : "#F0D9B5",
                          },
                          isLastMoveSquare && styles.lastMoveSquare,
                          isSelected && styles.selectedSquare,
                          isCheckSquare && styles.checkSquare,
                        ]}
                        activeOpacity={0.8}
                        onPress={() => handleSelectSquare(r, c)}
                      >
                        {piece && (
                          <Text
                            style={[
                              styles.pieceText,
                              {
                                fontSize: squareSize * 0.68,
                                color: piece.color === "w" ? "#FFFFFF" : "#0F172A",
                                textShadowColor:
                                  piece.color === "w"
                                    ? "rgba(0,0,0,0.6)"
                                    : "rgba(255,255,255,0.2)",
                                textShadowOffset: { width: 0, height: 1 },
                                textShadowRadius: 2,
                              },
                            ]}
                          >
                            {PIECE_GLYPHS[piece.color][piece.type]}
                          </Text>
                        )}

                        {isLegalMove && !isCaptureTarget && (
                          <View style={styles.legalMoveDot} />
                        )}

                        {isCaptureTarget && (
                          <View
                            style={[
                              styles.captureRing,
                              { width: squareSize * 0.85, height: squareSize * 0.85 },
                            ]}
                          />
                        )}

                        {c === (shouldFlipBoard ? 7 : 0) && (
                          <Text
                            style={[
                              styles.rankLabel,
                              { color: isDark ? "#F0D9B5" : "#B58863" },
                            ]}
                          >
                            {8 - r}
                          </Text>
                        )}
                        {r === (shouldFlipBoard ? 0 : 7) && (
                          <Text
                            style={[
                              styles.fileLabel,
                              { color: isDark ? "#F0D9B5" : "#B58863" },
                            ]}
                          >
                            {String.fromCharCode(97 + c)}
                          </Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </View>

            {/* Bottom Bar: Current User Player */}
            <View style={[styles.playerBar, { position: "relative", marginTop: 8, marginBottom: 16, zIndex: 100 }]}>
              {/* Floating Speech Bubble directly above User's name */}
              {currentUser && playerBubbleMessages[currentUser.id] && (
                <GameChatBubble
                  text={playerBubbleMessages[currentUser.id].text}
                  senderName={playerBubbleMessages[currentUser.id].senderName}
                  senderColor={playerBubbleMessages[currentUser.id].senderColor}
                  onPress={() => {
                    setShowChatModal(true);
                    setUnreadChatCount(0);
                  }}
                  position="bottom"
                />
              )}

              <View style={styles.playerInfoLeft}>
                <View
                  style={[
                    styles.playerColorDot,
                    {
                      backgroundColor: isWhiteUser ? "#FFFFFF" : "#0F172A",
                      borderColor: isSpeaking ? "#10B981" : "#E2E8F0",
                      borderWidth: isSpeaking ? 2.5 : 1,
                    },
                  ]}
                />
                <View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={styles.playerName}>
                      {mePlayer?.name || "You"} ({isWhiteUser ? "White" : "Black"})
                    </Text>
                    {!isMuted && (
                      <View style={styles.speakingBadge}>
                        <Text style={styles.speakingBadgeText}>{isSpeaking ? "🎙️ Speaking" : "🎙️ Mic Live"}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.playerSubtitle, isMyTurn && styles.playerSubtitleActive]}>
                    {isMyTurn ? "YOUR TURN TO MOVE" : "Waiting for opponent move..."}
                  </Text>
                </View>
              </View>

              {/* My captured tray */}
              <View style={styles.capturedTray}>
                {(isWhiteUser ? capturedBlack : capturedWhite).slice(-6).map((p, idx) => (
                  <Text key={idx} style={styles.capturedPieceGlyph}>
                    {PIECE_GLYPHS[isWhiteUser ? "b" : "w"][p.type]}
                  </Text>
                ))}
                {myAdvantage > 0 && (
                  <View style={styles.advantageBadge}>
                    <Text style={styles.advantageText}>+{myAdvantage}</Text>
                  </View>
                )}
              </View>
            </View>

            {/* In-Game Resign Option */}
            {onlineRoom.status === "playing" && (
              <TouchableOpacity
                style={styles.resignMatchBtn}
                onPress={confirmLeaveRoom}
                activeOpacity={0.8}
              >
                <Ionicons name="exit-outline" size={16} color="#EF4444" />
                <Text style={styles.resignMatchBtnText}>Resign & Exit (Counts as Loss)</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        )}

        {/* In-Game Full Chat Popup Modal */}
        <GameChatModal
          visible={showChatModal}
          onClose={() => setShowChatModal(false)}
          messages={chatMessages}
          currentUserId={currentUser?.id}
          onSendMessage={handleSendChat}
          title="Chess Duel Chat"
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: "#0A0F1D",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#1E293B",
    justifyContent: "center",
    alignItems: "center",
  },
  leaveButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  headerTitleBox: {
    flex: 1,
    marginHorizontal: 8,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 15,
    fontFamily: Fonts.extraBold,
    color: "#F8FAFC",
  },
  headerSubtitle: {
    fontSize: 10.5,
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
    marginBottom: 20,
  },
  errorAlert: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    padding: 10,
    borderRadius: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
    width: "100%",
  },
  errorAlertText: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: "#EF4444",
  },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#0284C7",
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
  waitingContainer: {
    flex: 1,
    padding: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  waitingCard: {
    width: "100%",
    backgroundColor: "#0F172A",
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  waitingPulseBox: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: "#1E293B",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  waitingEmoji: {
    fontSize: 34,
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
    marginBottom: 18,
  },
  roomCodeBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1E293B",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#38BDF8",
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
  slotRow: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
    marginVertical: 16,
  },
  slotCard: {
    flex: 1,
    backgroundColor: "#1E293B",
    padding: 12,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#334155",
  },
  slotCardEmpty: {
    opacity: 0.6,
    borderStyle: "dashed",
  },
  slotDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginBottom: 6,
  },
  slotName: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: "#F8FAFC",
  },
  slotStatus: {
    fontSize: 10,
    fontFamily: Fonts.medium,
    color: "#10B981",
    marginTop: 2,
  },
  slotNameMuted: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: "#94A3B8",
  },
  slotStatusMuted: {
    fontSize: 10,
    fontFamily: Fonts.medium,
    color: "#64748B",
    marginTop: 2,
  },
  cancelRoomBtn: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  cancelRoomBtnText: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: "#EF4444",
  },

  /* Active Game Screen */
  gameContent: {
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 40,
  },
  playerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  playerInfoLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  playerColorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
  },
  playerName: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: "#F8FAFC",
  },
  playerSubtitle: {
    fontSize: 11,
    fontFamily: Fonts.medium,
    color: "#94A3B8",
  },
  playerSubtitleActive: {
    color: "#38BDF8",
    fontFamily: Fonts.bold,
  },
  capturedTray: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  capturedPieceGlyph: {
    fontSize: 18,
    color: "#CBD5E1",
  },
  advantageBadge: {
    backgroundColor: "#1E293B",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 4,
  },
  advantageText: {
    fontSize: 10,
    fontFamily: Fonts.bold,
    color: "#10B981",
  },
  checkBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(239, 68, 68, 0.18)",
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.4)",
  },
  checkBannerText: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: "#F87171",
  },
  winnerCard: {
    alignItems: "center",
    backgroundColor: "#1E293B",
    padding: 16,
    borderRadius: 18,
    marginVertical: 10,
    width: "100%",
    borderWidth: 1,
    borderColor: "#334155",
  },
  winnerEmoji: {
    fontSize: 32,
    marginBottom: 6,
  },
  winnerTitle: {
    fontSize: 16,
    fontFamily: Fonts.extraBold,
    color: "#F8FAFC",
    marginBottom: 12,
  },
  winnerBtnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  playAgainBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 18,
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
    marginTop: 14,
    marginBottom: 20,
    alignSelf: "center",
  },
  resignMatchBtnText: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: "#EF4444",
  },
  speakingBadge: {
    backgroundColor: "rgba(16, 185, 129, 0.2)",
    borderWidth: 1,
    borderColor: "#10B981",
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 8,
  },
  speakingBadgeText: {
    fontSize: 10,
    fontFamily: Fonts.bold,
    color: "#34D399",
  },
  boardContainer: {
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 3,
    borderColor: "#334155",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
    marginVertical: 8,
  },
  boardRow: {
    flexDirection: "row",
  },
  square: {
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  selectedSquare: {
    backgroundColor: "#EAB308",
  },
  lastMoveSquare: {
    backgroundColor: "rgba(234, 179, 8, 0.4)",
  },
  checkSquare: {
    backgroundColor: "#EF4444",
  },
  pieceText: {
    textAlign: "center",
  },
  legalMoveDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "rgba(16, 185, 129, 0.8)",
  },
  captureRing: {
    position: "absolute",
    borderRadius: 999,
    borderWidth: 3,
    borderColor: "rgba(239, 68, 68, 0.85)",
  },
  rankLabel: {
    position: "absolute",
    top: 2,
    left: 3,
    fontSize: 9,
    fontFamily: Fonts.bold,
  },
  fileLabel: {
    position: "absolute",
    bottom: 1,
    right: 3,
    fontSize: 9,
    fontFamily: Fonts.bold,
  },
});
