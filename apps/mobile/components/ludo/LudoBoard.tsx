import React from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type {
  LudoColor,
  LudoGameState,
  LudoPlayer,
  LudoToken,
} from "@chatapp/shared";
import { Ionicons } from "@/components/Icon";
import { Fonts } from "@/constants/theme";
import {
  getTokenBoardCoordinates,
  LUDO_COLOR_DARK,
  LUDO_COLOR_HEX,
} from "./ludoEngine";

interface LudoBoardProps {
  room: LudoGameState;
  currentUserId?: string;
  boardSize: number;
  tokenPulseAnim: Animated.Value;
  onMoveToken: (tokenId: number) => void;
  playerBubbleMessages?: Record<string, { text: string; senderName: string; senderColor?: string }>;
  speakingUserIds?: Record<string, boolean>;
  onOpenChat?: () => void;
}

export const LudoBoard = React.memo(function LudoBoard({
  room,
  currentUserId,
  boardSize,
  tokenPulseAnim,
  onMoveToken,
  playerBubbleMessages,
  speakingUserIds,
  onOpenChat,
}: LudoBoardProps) {
  const cellSize = boardSize / 15;
  const yardSize = cellSize * 6;
  const homeSize = cellSize * 3;
  const tokenSize = cellSize * 0.88;

  const myPlayer = room.players.find((p) => p.userId === currentUserId);
  const isMyTurn = myPlayer && room.currentTurnColor === myPlayer.color;

  // Persisted last roll: stays visible across turn changes until the next roll
  const shownDice = room.diceValue ?? room.lastDiceValue ?? null;
  const shownDiceColor = room.diceValue
    ? room.currentTurnColor
    : room.lastDiceColor ?? room.currentTurnColor;

  // Animation for what comes on the dice shown in Home
  const [homeDiceAnim] = React.useState(() => new Animated.Value(1));

  // Re-animate on every new roll (value or roller may repeat, so key on lastActionText too)
  const rollKey = `${room.lastDiceColor ?? ""}-${room.lastDiceValue ?? ""}-${room.lastActionText ?? ""}`;
  React.useEffect(() => {
    if (shownDice) {
      homeDiceAnim.setValue(0.3);
      Animated.sequence([
        Animated.spring(homeDiceAnim, {
          toValue: 1.35,
          friction: 4,
          tension: 120,
          useNativeDriver: true,
        }),
        Animated.spring(homeDiceAnim, {
          toValue: 1.0,
          friction: 6,
          tension: 80,
          useNativeDriver: true,
        }),
      ]).start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollKey, homeDiceAnim]);

  // Group tokens by their board coordinate to prevent total overlapping on safe stars
  const tokenCoordsMap = new Map<string, { player: LudoPlayer; token: LudoToken }[]>();

  room.players.forEach((player) => {
    player.tokens.forEach((token) => {
      const coord = getTokenBoardCoordinates(token, player.color, room.maxPlayers);
      // Round to 1 decimal place to group effectively
      const key = `${coord.row.toFixed(1)}_${coord.col.toFixed(1)}`;
      if (!tokenCoordsMap.has(key)) {
        tokenCoordsMap.set(key, []);
      }
      tokenCoordsMap.get(key)!.push({ player, token });
    });
  });

  return (
    <View style={[styles.outerBoard, { width: boardSize, height: boardSize }]}>
      {/* 1. TOP-LEFT YARD: GREEN */}
      <View
        style={[
          styles.yardContainer,
          {
            top: 0,
            left: 0,
            width: yardSize,
            height: yardSize,
            backgroundColor: LUDO_COLOR_HEX.GREEN,
          },
        ]}
      >
        {renderYardArena("GREEN")}
      </View>

      {/* 2. TOP-RIGHT YARD: YELLOW */}
      <View
        style={[
          styles.yardContainer,
          {
            top: 0,
            right: 0,
            width: yardSize,
            height: yardSize,
            backgroundColor: LUDO_COLOR_HEX.YELLOW,
          },
        ]}
      >
        {renderYardArena("YELLOW")}
      </View>

      {/* 3. BOTTOM-LEFT YARD: RED */}
      <View
        style={[
          styles.yardContainer,
          {
            bottom: 0,
            left: 0,
            width: yardSize,
            height: yardSize,
            backgroundColor: LUDO_COLOR_HEX.RED,
          },
        ]}
      >
        {renderYardArena("RED")}
      </View>

      {/* 4. BOTTOM-RIGHT YARD: BLUE */}
      <View
        style={[
          styles.yardContainer,
          {
            bottom: 0,
            right: 0,
            width: yardSize,
            height: yardSize,
            backgroundColor: LUDO_COLOR_HEX.BLUE,
          },
        ]}
      >
        {renderYardArena("BLUE")}
      </View>

      {/* 5. TOP WING (Rows 0..5, Cols 6..8) */}
      <View
        style={[
          styles.wingContainer,
          {
            top: 0,
            left: yardSize,
            width: homeSize,
            height: yardSize,
          },
        ]}
      >
        {renderTopWing()}
      </View>

      {/* 6. BOTTOM WING (Rows 9..14, Cols 6..8) */}
      <View
        style={[
          styles.wingContainer,
          {
            bottom: 0,
            left: yardSize,
            width: homeSize,
            height: yardSize,
          },
        ]}
      >
        {renderBottomWing()}
      </View>

      {/* 7. LEFT WING (Rows 6..8, Cols 0..5) */}
      <View
        style={[
          styles.wingContainer,
          {
            top: yardSize,
            left: 0,
            width: yardSize,
            height: homeSize,
          },
        ]}
      >
        {renderLeftWing()}
      </View>

      {/* 8. RIGHT WING (Rows 6..8, Cols 9..14) */}
      <View
        style={[
          styles.wingContainer,
          {
            top: yardSize,
            right: 0,
            width: yardSize,
            height: homeSize,
          },
        ]}
      >
        {renderRightWing()}
      </View>

      {/* 9. CENTER HOME (Rows 6..8, Cols 6..8) */}
      <View
        style={[
          styles.homeCenterContainer,
          {
            top: yardSize,
            left: yardSize,
            width: homeSize,
            height: homeSize,
          },
        ]}
      >
        {renderCenterHomeTriangles(homeSize)}
      </View>

      {/* 10. TOKENS LAYER (Positioned directly over board coordinates) */}
      {Array.from(tokenCoordsMap.entries()).map(([key, group]) => {
        return group.map(({ player, token }, groupIndex) => {
          const coord = getTokenBoardCoordinates(token, player.color, room.maxPlayers);
          const isMovable =
            isMyTurn &&
            room.hasRolled &&
            player.userId === currentUserId &&
            room.movableTokens.includes(token.id);

          // Stacking offset if multiple tokens share tile
          const totalInGroup = group.length;
          let offsetX = 0;
          let offsetY = 0;
          if (totalInGroup > 1 && !token.inYard) {
            const angle = (groupIndex / totalInGroup) * 2 * Math.PI;
            const radius = cellSize * 0.18;
            offsetX = Math.cos(angle) * radius;
            offsetY = Math.sin(angle) * radius;
          }

          const topPos = coord.row * cellSize + (cellSize - tokenSize) / 2 + offsetY;
          const leftPos = coord.col * cellSize + (cellSize - tokenSize) / 2 + offsetX;

          return (
            <Animated.View
              key={`${player.color}-${token.id}`}
              style={[
                styles.tokenAbsolute,
                {
                  top: topPos,
                  left: leftPos,
                  width: tokenSize,
                  height: tokenSize,
                  borderRadius: tokenSize / 2,
                  zIndex: isMovable ? 50 : 20 + groupIndex,
                  transform: isMovable ? [{ scale: tokenPulseAnim }] : [],
                },
              ]}
              pointerEvents={isMovable ? "auto" : "none"}
            >
              <TouchableOpacity
                style={[
                  styles.tokenTouch,
                  {
                    backgroundColor: LUDO_COLOR_HEX[player.color],
                    borderColor: isMovable ? "#FDE047" : "#FFFFFF",
                    borderWidth: isMovable ? 2.5 : 1.5,
                  },
                ]}
                disabled={!isMovable}
                onPress={() => onMoveToken(token.id)}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.tokenInnerRing,
                    { borderColor: LUDO_COLOR_DARK[player.color] },
                  ]}
                >
                  {token.isHome ? (
                    <Text style={styles.tokenPipText}>🏆</Text>
                  ) : (
                    <View style={styles.tokenGlossDot} />
                  )}
                </View>
              </TouchableOpacity>
            </Animated.View>
          );
        });
      })}
    </View>
  );

  /**
   * 6x6 Corner Yard Arena with inset white base and 4 circular nests
   */
  function renderYardArena(color: LudoColor) {
    const player = room.players.find((p) => p.color === color);
    const colorHex = LUDO_COLOR_HEX[color];
    const isCurrentTurn = room.currentTurnColor === color;

    return (
      <View
        style={[
          styles.yardInnerCard,
          isCurrentTurn && {
            borderWidth: 2,
            borderColor: "#FFFFFF",
          },
        ]}
      >
        {/* Player Name / Base Label */}
        <View style={styles.yardHeaderRow}>
          <Text style={styles.yardPlayerLabel} numberOfLines={1}>
            {player ? player.name : "Open Slot"}
          </Text>
          {player?.userId === room.adminId && (
            <Text style={styles.hostCrown}>👑</Text>
          )}
          {player && speakingUserIds && speakingUserIds[player.userId] && (
            <Text style={styles.speakingMiniBadge}>🔊</Text>
          )}
        </View>

        {/* Floating Chat Bubble over this Player's Base/Name */}
        {player && playerBubbleMessages && playerBubbleMessages[player.userId] && (
          <TouchableOpacity
            style={[
              styles.yardChatBubble,
              { borderColor: playerBubbleMessages[player.userId].senderColor || colorHex },
            ]}
            onPress={onOpenChat}
            activeOpacity={0.85}
          >
            <View style={styles.yardBubbleHeader}>
              <Ionicons name="chatbubble-ellipses" size={10} color="#38BDF8" />
              <Text style={styles.yardChatSender} numberOfLines={1}>
                {playerBubbleMessages[player.userId].senderName}
              </Text>
            </View>
            <Text style={styles.yardChatText} numberOfLines={2}>
              {playerBubbleMessages[player.userId].text}
            </Text>
            <Text style={styles.yardChatTapPrompt}>Tap to reply 💬</Text>
          </TouchableOpacity>
        )}

        {/* 4 Inset Circular Token Nests */}
        <View style={styles.nestGrid}>
          <View style={styles.nestRow}>
            <View style={[styles.nestCircle, { borderColor: colorHex }]} />
            <View style={[styles.nestCircle, { borderColor: colorHex }]} />
          </View>
          <View style={styles.nestRow}>
            <View style={[styles.nestCircle, { borderColor: colorHex }]} />
            <View style={[styles.nestCircle, { borderColor: colorHex }]} />
          </View>
        </View>
      </View>
    );
  }

  /**
   * Top Wing: 6 rows of 3 cells each
   */
  function renderTopWing() {
    const rows = [];
    for (let r = 0; r < 6; r++) {
      const cells = [];
      for (let c = 0; c < 3; c++) {
        const boardRow = r;
        const boardCol = 6 + c;
        cells.push(renderCell(boardRow, boardCol));
      }
      rows.push(
        <View key={`top-row-${r}`} style={styles.gridRow}>
          {cells}
        </View>
      );
    }
    return rows;
  }

  /**
   * Bottom Wing: 6 rows of 3 cells each
   */
  function renderBottomWing() {
    const rows = [];
    for (let r = 0; r < 6; r++) {
      const cells = [];
      for (let c = 0; c < 3; c++) {
        const boardRow = 9 + r;
        const boardCol = 6 + c;
        cells.push(renderCell(boardRow, boardCol));
      }
      rows.push(
        <View key={`bottom-row-${r}`} style={styles.gridRow}>
          {cells}
        </View>
      );
    }
    return rows;
  }

  /**
   * Left Wing: 3 rows of 6 cells each
   */
  function renderLeftWing() {
    const rows = [];
    for (let r = 0; r < 3; r++) {
      const cells = [];
      for (let c = 0; c < 6; c++) {
        const boardRow = 6 + r;
        const boardCol = c;
        cells.push(renderCell(boardRow, boardCol));
      }
      rows.push(
        <View key={`left-row-${r}`} style={styles.gridRow}>
          {cells}
        </View>
      );
    }
    return rows;
  }

  /**
   * Right Wing: 3 rows of 6 cells each
   */
  function renderRightWing() {
    const rows = [];
    for (let r = 0; r < 3; r++) {
      const cells = [];
      for (let c = 0; c < 6; c++) {
        const boardRow = 6 + r;
        const boardCol = 9 + c;
        cells.push(renderCell(boardRow, boardCol));
      }
      rows.push(
        <View key={`right-row-${r}`} style={styles.gridRow}>
          {cells}
        </View>
      );
    }
    return rows;
  }

  /**
   * Renders an individual track cell on the board
   */
  function renderCell(row: number, col: number) {
    // Check if Home Runway cell
    let runwayColor: LudoColor | null = null;
    if (col === 7 && row >= 9 && row <= 13) runwayColor = "RED";
    else if (row === 7 && col >= 1 && col <= 5) runwayColor = "GREEN";
    else if (col === 7 && row >= 1 && row <= 5) runwayColor = "YELLOW";
    else if (row === 7 && col >= 9 && col <= 13) runwayColor = "BLUE";

    // Check if Starting Tile
    let startColor: LudoColor | null = null;
    let startArrow: string | null = null;
    if (row === 13 && col === 6) {
      startColor = "RED";
      startArrow = "arrow-up";
    } else if (row === 6 && col === 1) {
      startColor = "GREEN";
      startArrow = "arrow-forward";
    } else if (row === 1 && col === 8) {
      startColor = "YELLOW";
      startArrow = "arrow-down";
    } else if (row === 8 && col === 13) {
      startColor = "BLUE";
      startArrow = "arrow-back";
    }

    // Check if Safe Star Tile
    const isSafeStar =
      (row === 8 && col === 2) ||
      (row === 2 && col === 6) ||
      (row === 6 && col === 12) ||
      (row === 12 && col === 8);

    const cellBg = runwayColor
      ? LUDO_COLOR_HEX[runwayColor]
      : startColor
      ? LUDO_COLOR_HEX[startColor]
      : "#FFFFFF";

    return (
      <View
        key={`cell-${row}-${col}`}
        style={[
          styles.cellBox,
          {
            width: cellSize,
            height: cellSize,
            backgroundColor: cellBg,
          },
        ]}
      >
        {startArrow && (
          <Ionicons name={startArrow as any} size={cellSize * 0.55} color="#FFFFFF" />
        )}
        {isSafeStar && !startArrow && (
          <Ionicons name="star" size={cellSize * 0.52} color="#F59E0B" />
        )}
      </View>
    );
  }

  /**
   * 4-Triangle Center Home Victory Triangle with Gold Center Emblem
   */
  function renderCenterHomeTriangles(size: number) {
    const half = size / 2;

    return (
      <View style={[styles.trianglesWrapper, { width: size, height: size }]}>
        {/* Top Triangle: Yellow */}
        <View
          style={[
            styles.trianglePiece,
            {
              top: 0,
              left: 0,
              borderTopWidth: half,
              borderTopColor: LUDO_COLOR_HEX.YELLOW,
              borderLeftWidth: half,
              borderLeftColor: "transparent",
              borderRightWidth: half,
              borderRightColor: "transparent",
            },
          ]}
        />

        {/* Right Triangle: Blue */}
        <View
          style={[
            styles.trianglePiece,
            {
              top: 0,
              right: 0,
              borderRightWidth: half,
              borderRightColor: LUDO_COLOR_HEX.BLUE,
              borderTopWidth: half,
              borderTopColor: "transparent",
              borderBottomWidth: half,
              borderBottomColor: "transparent",
            },
          ]}
        />

        {/* Bottom Triangle: Red */}
        <View
          style={[
            styles.trianglePiece,
            {
              bottom: 0,
              left: 0,
              borderBottomWidth: half,
              borderBottomColor: LUDO_COLOR_HEX.RED,
              borderLeftWidth: half,
              borderLeftColor: "transparent",
              borderRightWidth: half,
              borderRightColor: "transparent",
            },
          ]}
        />

        {/* Left Triangle: Green */}
        <View
          style={[
            styles.trianglePiece,
            {
              top: 0,
              left: 0,
              borderLeftWidth: half,
              borderLeftColor: LUDO_COLOR_HEX.GREEN,
              borderTopWidth: half,
              borderTopColor: "transparent",
              borderBottomWidth: half,
              borderBottomColor: "transparent",
            },
          ]}
        />

        {/* Central Victory / Rolled Dice Badge in player's token color */}
        <Animated.View
          style={[
            styles.centerHomeEmblem,
            {
              width: cellSize * 1.35,
              height: cellSize * 1.35,
              borderRadius: (cellSize * 1.35) / 2,
              backgroundColor: shownDice
                ? LUDO_COLOR_HEX[shownDiceColor]
                : "#0F172A",
              borderColor: shownDice ? "#FFFFFF" : "#FBBF24",
              transform: [{ scale: homeDiceAnim }],
              shadowColor: shownDice
                ? LUDO_COLOR_HEX[shownDiceColor]
                : "#FBBF24",
              shadowOpacity: 0.85,
              shadowRadius: 10,
              elevation: 12,
            },
          ]}
        >
          {shownDice ? (
            <View style={styles.homeDiceContent}>
              <Text style={styles.homeDiceNumber}>{shownDice}</Text>
            </View>
          ) : (
            <Ionicons name="trophy" size={cellSize * 0.6} color="#FBBF24" />
          )}
        </Animated.View>
      </View>
    );
  }
});

const styles = StyleSheet.create({
  outerBoard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 2.5,
    borderColor: "#334155",
    position: "relative",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 10,
  },
  yardContainer: {
    position: "absolute",
    padding: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  yardInnerCard: {
    flex: 1,
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 6,
    justifyContent: "space-between",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  yardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 4,
    maxWidth: "100%",
  },
  yardPlayerLabel: {
    fontSize: 9,
    fontFamily: Fonts.extraBold,
    color: "#0F172A",
  },
  hostCrown: {
    fontSize: 9,
  },
  speakingMiniBadge: {
    fontSize: 9,
  },
  yardChatBubble: {
    position: "absolute",
    top: 2,
    left: 2,
    right: 2,
    bottom: 2,
    backgroundColor: "#0F172A",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 2,
    zIndex: 100,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  yardBubbleHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 2,
  },
  yardChatSender: {
    fontSize: 9.5,
    fontFamily: Fonts.extraBold,
    color: "#CBD5E1",
    textTransform: "uppercase",
  },
  yardChatText: {
    fontSize: 12,
    fontFamily: Fonts.extraBold,
    color: "#FFFFFF",
    textAlign: "center",
    lineHeight: 16,
    textShadowColor: "rgba(0, 0, 0, 0.75)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  yardChatTapPrompt: {
    fontSize: 8.5,
    fontFamily: Fonts.bold,
    color: "#38BDF8",
    marginTop: 3,
  },
  nestGrid: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  nestRow: {
    flexDirection: "row",
    gap: 8,
  },
  nestCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2.5,
    backgroundColor: "#F1F5F9",
  },
  wingContainer: {
    position: "absolute",
    backgroundColor: "#E2E8F0",
  },
  gridRow: {
    flexDirection: "row",
  },
  cellBox: {
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 0.6,
    borderColor: "#CBD5E1",
  },
  homeCenterContainer: {
    position: "absolute",
    backgroundColor: "#0F172A",
    justifyContent: "center",
    alignItems: "center",
  },
  trianglesWrapper: {
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  trianglePiece: {
    position: "absolute",
    width: 0,
    height: 0,
  },
  centerHomeEmblem: {
    backgroundColor: "#0F172A",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#FBBF24",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 10,
  },
  tokenAbsolute: {
    position: "absolute",
  },
  tokenTouch: {
    width: "100%",
    height: "100%",
    borderRadius: 999,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 6,
  },
  tokenInnerRing: {
    width: "72%",
    height: "72%",
    borderRadius: 999,
    borderWidth: 1.2,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.25)",
  },
  tokenPipText: {
    fontSize: 8,
    fontFamily: Fonts.extraBold,
    color: "#FFFFFF",
  },
  tokenGlossDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
  },
  homeDiceContent: {
    justifyContent: "center",
    alignItems: "center",
  },
  homeDiceNumber: {
    fontSize: 16,
    fontFamily: Fonts.extraBold,
    color: "#FFFFFF",
    textShadowColor: "rgba(0, 0, 0, 0.4)",
    textShadowOffset: { width: 0, height: 1.5 },
    textShadowRadius: 3,
  },
});
