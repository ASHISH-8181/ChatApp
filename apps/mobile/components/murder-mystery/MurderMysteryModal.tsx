import React, { useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type {
  ChatUser,
  MMRoomState,
} from "@chatapp/shared";
import { socketService } from "@/services/socket";
import {
  createMMRoom,
  joinMMRoom,
  fetchMMRoom,
  toggleMMReady,
  startMMGame,
  viewedMMRole,
  submitMMMurdererAction,
  submitMMHealerAction,
  castMMVote,
  sendMMMessage,
} from "@/services/api";
import { Ionicons } from "@/components/Icon";

interface MurderMysteryModalProps {
  visible: boolean;
  onClose: () => void;
  currentUser: ChatUser | null;
}

export function MurderMysteryModal({
  visible,
  onClose,
  currentUser,
}: MurderMysteryModalProps) {
  // Screen state when not inside an active room: 'hub' | 'create' | 'join'
  const [hubTab, setHubTab] = useState<"hub" | "create" | "join">("hub");

  // Room creation form
  const [roomName, setRoomName] = useState("");
  const [numMurderers, setNumMurderers] = useState(1);
  const [votingDuration, setVotingDuration] = useState(60); // 30, 60, 90, 120
  const [creating, setCreating] = useState(false);

  // Room join form
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);

  // Active game room state
  const [activeRoom, setActiveRoom] = useState<MMRoomState | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // In-game selection states
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [actionSubmitted, setActionSubmitted] = useState(false);

  // In-game chat message state
  const [chatInput, setChatInput] = useState("");
  const [sendingChat, setSendingChat] = useState(false);

  // Role reveal dismissed by user
  const [roleDismissed, setRoleDismissed] = useState(false);

  // Animation values for phase popups
  const [phaseFadeAnim] = useState(() => new Animated.Value(0));
  const [pulseAnim] = useState(() => new Animated.Value(1));

  // Local seconds countdown ticker
  const [localTimer, setLocalTimer] = useState<number>(0);

  // Pulse animation loop for suspense
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.08,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  // Fade in animation when phase changes
  useEffect(() => {
    phaseFadeAnim.setValue(0);
    Animated.timing(phaseFadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, [activeRoom?.status, activeRoom?.phaseRound, phaseFadeAnim]);

  // Subscribe to real-time socket events for Murder Mystery
  useEffect(() => {
    const unsubState = socketService.subscribeToMMState((room) => {
      setActiveRoom((prev) => {
        if (!prev || prev.status !== room.status || prev.phaseRound !== room.phaseRound) {
          setSelectedTargetId(null);
          setActionSubmitted(false);
        }
        return room;
      });
      if (room.phaseTimeRemaining !== undefined) {
        setLocalTimer(room.phaseTimeRemaining);
      }
    });

    const unsubMsg = socketService.subscribeToMMMessage((message) => {
      setActiveRoom((prev) => {
        if (!prev || prev.id !== message.roomId) return prev;
        if (prev.messages.some((m) => m.id === message.id)) return prev;
        return { ...prev, messages: [...prev.messages, message] };
      });
    });

    const unsubNight = socketService.subscribeToMMNightResult((data) => {
      // Announce night result
    });

    const unsubVoting = socketService.subscribeToMMVotingResult((data) => {
      // Voting resolved
    });

    const unsubGameOver = socketService.subscribeToMMGameOver((data) => {
      // Game over
    });

    return () => {
      unsubState();
      unsubMsg();
      unsubNight();
      unsubVoting();
      unsubGameOver();
    };
  }, []);

  // Countdown timer interval
  useEffect(() => {
    if (!activeRoom || !activeRoom.phaseExpiresAt) return;
    const interval = setInterval(() => {
      const expiresMs = new Date(activeRoom.phaseExpiresAt!).getTime();
      const diff = Math.max(0, Math.ceil((expiresMs - Date.now()) / 1000));
      setLocalTimer(diff);
    }, 1000);
    return () => clearInterval(interval);
  }, [activeRoom]);

  // Clean error message on click
  const clearError = () => setErrorMsg(null);

  // Auto-connect socket when modal is opened
  useEffect(() => {
    if (visible && currentUser) {
      socketService.connect(currentUser);
    }
  }, [visible, currentUser]);

  // Offline sync / Polling fallback when inside an active room
  useEffect(() => {
    if (!activeRoom || !currentUser) return;
    const interval = setInterval(async () => {
      if (socketService.getStatus() !== "connected") {
        try {
          const fresh = await fetchMMRoom(activeRoom.id, currentUser.id);
          setActiveRoom((prev) => {
            if (!prev || prev.status !== fresh.status || prev.phaseRound !== fresh.phaseRound) {
              setSelectedTargetId(null);
              setActionSubmitted(false);
            }
            return fresh;
          });
          if (fresh.phaseTimeRemaining !== undefined) {
            setLocalTimer(fresh.phaseTimeRemaining);
          }
        } catch {
          // ignore transient poll error
        }
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [activeRoom, currentUser]);

  // Copy room code
  const handleCopyCode = () => {
    if (!activeRoom) return;
    if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(activeRoom.code);
    }
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  // 1. Handle Room Creation
  const handleCreateRoom = async () => {
    if (!currentUser) return;
    try {
      setCreating(true);
      setErrorMsg(null);
      let room: MMRoomState;
      if (socketService.getStatus() === "connected") {
        try {
          room = await socketService.createMMRoom({
            adminId: currentUser.id,
            name: roomName.trim() || undefined,
            numMurderers,
            numHealers: numMurderers, // must always be equal
            votingDuration,
          });
        } catch {
          room = await createMMRoom({
            adminId: currentUser.id,
            name: roomName.trim() || undefined,
            numMurderers,
            numHealers: numMurderers,
            votingDuration,
          });
        }
      } else {
        room = await createMMRoom({
          adminId: currentUser.id,
          name: roomName.trim() || undefined,
          numMurderers,
          numHealers: numMurderers,
          votingDuration,
        });
      }
      setActiveRoom(room);
      setHubTab("hub");
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to create room.");
    } finally {
      setCreating(false);
    }
  };

  // 2. Handle Joining Room
  const handleJoinRoom = async () => {
    if (!currentUser) return;
    const code = joinCode.trim().toUpperCase();
    if (!code) {
      setErrorMsg("Please enter a valid 6-character room code.");
      return;
    }
    try {
      setJoining(true);
      setErrorMsg(null);
      let room: MMRoomState;
      if (socketService.getStatus() === "connected") {
        try {
          room = await socketService.joinMMRoom({
            code,
            userId: currentUser.id,
          });
        } catch {
          room = await joinMMRoom({
            code,
            userId: currentUser.id,
          });
        }
      } else {
        room = await joinMMRoom({
          code,
          userId: currentUser.id,
        });
      }
      setActiveRoom(room);
      setHubTab("hub");
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to join room.");
    } finally {
      setJoining(false);
    }
  };

  // 3. Toggle Ready
  const handleToggleReady = async () => {
    if (!activeRoom || !currentUser) return;
    const me = activeRoom.players.find((p) => p.userId === currentUser.id);
    const newReady = !me?.isReady;
    try {
      let room: MMRoomState | null = null;
      if (socketService.getStatus() === "connected") {
        try {
          room = await socketService.toggleMMReady({
            roomId: activeRoom.id,
            userId: currentUser.id,
            isReady: newReady,
          });
        } catch {
          room = await toggleMMReady(activeRoom.id, currentUser.id, newReady);
        }
      } else {
        room = await toggleMMReady(activeRoom.id, currentUser.id, newReady);
      }
      if (room) setActiveRoom(room);
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  // 4. Start Game (Admin only)
  const handleStartGame = async () => {
    if (!activeRoom || !currentUser) return;
    try {
      setErrorMsg(null);
      setRoleDismissed(false);
      let room: MMRoomState | null = null;
      if (socketService.getStatus() === "connected") {
        try {
          room = await socketService.startMMGame({
            roomId: activeRoom.id,
            userId: currentUser.id,
          });
        } catch {
          room = await startMMGame(activeRoom.id, currentUser.id);
        }
      } else {
        room = await startMMGame(activeRoom.id, currentUser.id);
      }
      if (room) setActiveRoom(room);
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  // 5. Dismiss Role Reveal Screen
  const handleConfirmRole = async () => {
    setRoleDismissed(true);
    if (!activeRoom || !currentUser) return;
    try {
      if (socketService.getStatus() === "connected") {
        try {
          await socketService.viewedMMRole({
            roomId: activeRoom.id,
            userId: currentUser.id,
          });
        } catch {
          await viewedMMRole(activeRoom.id, currentUser.id);
        }
      } else {
        await viewedMMRole(activeRoom.id, currentUser.id);
      }
    } catch (err: any) {
      console.warn("viewedRole err:", err);
    }
  };

  // 6. Submit Murderer Action
  const handleSubmitMurder = async () => {
    if (!activeRoom || !currentUser || !selectedTargetId) return;
    try {
      setActionSubmitted(true);
      if (socketService.getStatus() === "connected") {
        try {
          await socketService.submitMMMurdererAction({
            roomId: activeRoom.id,
            userId: currentUser.id,
            targetUserId: selectedTargetId,
          });
        } catch {
          await submitMMMurdererAction(activeRoom.id, currentUser.id, selectedTargetId);
        }
      } else {
        await submitMMMurdererAction(activeRoom.id, currentUser.id, selectedTargetId);
      }
    } catch (err: any) {
      setActionSubmitted(false);
      setErrorMsg(err.message);
    }
  };

  // 7. Submit Healer Action
  const handleSubmitHeal = async () => {
    if (!activeRoom || !currentUser || !selectedTargetId) return;
    try {
      setActionSubmitted(true);
      if (socketService.getStatus() === "connected") {
        try {
          await socketService.submitMMHealerAction({
            roomId: activeRoom.id,
            userId: currentUser.id,
            targetUserId: selectedTargetId,
          });
        } catch {
          await submitMMHealerAction(activeRoom.id, currentUser.id, selectedTargetId);
        }
      } else {
        await submitMMHealerAction(activeRoom.id, currentUser.id, selectedTargetId);
      }
    } catch (err: any) {
      setActionSubmitted(false);
      setErrorMsg(err.message);
    }
  };

  // 8. Submit Vote
  const handleSubmitVote = async () => {
    if (!activeRoom || !currentUser || !selectedTargetId) return;
    try {
      setActionSubmitted(true);
      if (socketService.getStatus() === "connected") {
        try {
          await socketService.castMMVote({
            roomId: activeRoom.id,
            userId: currentUser.id,
            targetUserId: selectedTargetId,
          });
        } catch {
          await castMMVote(activeRoom.id, currentUser.id, selectedTargetId);
        }
      } else {
        await castMMVote(activeRoom.id, currentUser.id, selectedTargetId);
      }
    } catch (err: any) {
      setActionSubmitted(false);
      setErrorMsg(err.message);
    }
  };

  // 9. Send Discussion Chat Message
  const handleSendMessage = async () => {
    if (!activeRoom || !currentUser || !chatInput.trim()) return;
    try {
      setSendingChat(true);
      const text = chatInput.trim();
      setChatInput("");
      if (socketService.getStatus() === "connected") {
        try {
          await socketService.sendMMMessage({
            roomId: activeRoom.id,
            userId: currentUser.id,
            text,
          });
        } catch {
          const msg = await sendMMMessage(activeRoom.id, currentUser.id, text);
          setActiveRoom((prev) =>
            prev ? { ...prev, messages: [...prev.messages, msg] } : prev
          );
        }
      } else {
        const msg = await sendMMMessage(activeRoom.id, currentUser.id, text);
        setActiveRoom((prev) =>
          prev ? { ...prev, messages: [...prev.messages, msg] } : prev
        );
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setSendingChat(false);
    }
  };

  // 10. Play Again
  const handlePlayAgain = async () => {
    if (!activeRoom || !currentUser) return;
    try {
      setRoleDismissed(false);
      await socketService.playAgainMMRoom(activeRoom.id, currentUser.id);
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  // 11. Leave Room
  const handleLeaveRoom = () => {
    if (activeRoom && currentUser) {
      socketService.leaveMMRoom(activeRoom.id, currentUser.id);
    }
    setActiveRoom(null);
    setHubTab("hub");
  };

  // Player helper computations
  const me = activeRoom?.players.find((p) => p.userId === currentUser?.id);
  const isAdmin = activeRoom?.adminId === currentUser?.id;
  const isAlive = me?.isAlive ?? true;
  const myRole = activeRoom?.myRole;

  const minRequiredPlayers = activeRoom
    ? activeRoom.numMurderers + activeRoom.numHealers + 1
    : 3;
  const allReady = activeRoom?.players.every((p) => p.isReady) ?? false;
  const hasEnoughPlayers = (activeRoom?.players.length ?? 0) >= minRequiredPlayers;
  const canStart = isAdmin && allReady && hasEnoughPlayers;

  // Living players for night / voting actions
  const livingPlayers = activeRoom?.players.filter((p) => p.isAlive) ?? [];
  const livingTargetsForMurder = livingPlayers.filter((p) => p.userId !== currentUser?.id);

  // Runoff candidate filtering
  const eligibleVoteCandidates =
    activeRoom?.status === "RUNOFF_VOTING" && activeRoom.runoffCandidates
      ? livingPlayers.filter(
          (p) => activeRoom.runoffCandidates!.includes(p.userId) && p.userId !== currentUser?.id
        )
      : livingPlayers.filter((p) => p.userId !== currentUser?.id);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea}>
        {/* Error Notification Banner */}
        {errorMsg ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={18} color="#EF4444" />
            <Text style={styles.errorBannerText}>{errorMsg}</Text>
            <TouchableOpacity onPress={clearError} hitSlop={8}>
              <Ionicons name="close" size={16} color="#94A3B8" />
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ---------------------------------------------------------------- */}
        {/* SCREEN 1: HUB (Create / Join options when not in an active room) */}
        {/* ---------------------------------------------------------------- */}
        {!activeRoom ? (
          <View style={styles.hubContainer}>
            {/* Top Bar */}
            <View style={styles.hubHeader}>
              <View style={styles.hubTitleBadge}>
                <Text style={styles.hubTitleEmoji}>🕵️</Text>
                <Text style={styles.hubTitleText}>Murder Mystery</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color="#CBD5E1" />
              </TouchableOpacity>
            </View>

            {hubTab === "hub" && (
              <ScrollView contentContainerStyle={styles.hubBody} showsVerticalScrollIndicator={false}>
                {/* Atmospheric Hero Card */}
                <View style={styles.heroCard}>
                  <Text style={styles.heroEyebrow}>MULTI-PLAYER SOCIAL DEDUCTION</Text>
                  <Text style={styles.heroTitle}>Trust No One In The Shadows</Text>
                  <Text style={styles.heroSubtitle}>
                    Secret Murderers strike in the dark. Healers secretly protect the innocent. The town must deliberate and vote out the killers before everyone falls.
                  </Text>
                </View>

                {/* Hub Action Cards */}
                <View style={styles.hubCardsRow}>
                  {/* Create Room Button Card */}
                  <TouchableOpacity
                    style={[styles.actionCard, styles.actionCardPrimary]}
                    onPress={() => setHubTab("create")}
                    activeOpacity={0.85}
                  >
                    <View style={styles.actionCardIconBox}>
                      <Text style={styles.actionCardIcon}>🏰</Text>
                    </View>
                    <Text style={styles.actionCardTitle}>Create Room</Text>
                    <Text style={styles.actionCardDesc}>
                      Host a game room as Admin. Configure roles, voting timer, and invite friends with your code.
                    </Text>
                    <View style={styles.actionCardBtn}>
                      <Text style={styles.actionCardBtnText}>Create a Match →</Text>
                    </View>
                  </TouchableOpacity>

                  {/* Join Room Button Card */}
                  <TouchableOpacity
                    style={[styles.actionCard, styles.actionCardSecondary]}
                    onPress={() => setHubTab("join")}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.actionCardIconBox, { backgroundColor: "#1E293B" }]}>
                      <Text style={styles.actionCardIcon}>🔑</Text>
                    </View>
                    <Text style={styles.actionCardTitle}>Join with Code</Text>
                    <Text style={styles.actionCardDesc}>
                      Have a 6-digit room code from a friend? Enter it here to join their secret lobby.
                    </Text>
                    <View style={[styles.actionCardBtn, { backgroundColor: "#334155" }]}>
                      <Text style={styles.actionCardBtnText}>Enter Code →</Text>
                    </View>
                  </TouchableOpacity>
                </View>

                {/* Rules Overview */}
                <View style={styles.rulesOverviewCard}>
                  <Text style={styles.rulesTitle}>📜 Game Rules & Roles</Text>
                  <View style={styles.ruleItem}>
                    <Text style={styles.ruleIcon}>🔪</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.ruleName}>Murderers</Text>
                      <Text style={styles.ruleDesc}>
                        Secretly select a victim to kill each night. Win when 50% of original players are eliminated.
                      </Text>
                    </View>
                  </View>
                  <View style={styles.ruleItem}>
                    <Text style={styles.ruleIcon}>❤️</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.ruleName}>Healers</Text>
                      <Text style={styles.ruleDesc}>
                        Secretly choose one player to protect each night. If targeted, that player survives!
                      </Text>
                    </View>
                  </View>
                  <View style={styles.ruleItem}>
                    <Text style={styles.ruleIcon}>🔍</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.ruleName}>Normal Players</Text>
                      <Text style={styles.ruleDesc}>
                        Innocents participate in daytime discussion and voting to expose the murderers. Win when all killers are dead.
                      </Text>
                    </View>
                  </View>
                </View>
              </ScrollView>
            )}

            {/* TAB: Create Room Form */}
            {hubTab === "create" && (
              <ScrollView contentContainerStyle={styles.formContainer} showsVerticalScrollIndicator={false}>
                <TouchableOpacity onPress={() => setHubTab("hub")} style={styles.backLink}>
                  <Ionicons name="arrow-back" size={18} color="#94A3B8" />
                  <Text style={styles.backLinkText}>Back</Text>
                </TouchableOpacity>

                <Text style={styles.formHeaderTitle}>Configure Game Room</Text>

                {/* Optional Room Name */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Room Name (Optional)</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. Midnight Manor, Haunted Asylum..."
                    placeholderTextColor="#64748B"
                    value={roomName}
                    onChangeText={setRoomName}
                  />
                </View>

                {/* Number of Murderers & Healers */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>
                    Murderers & Healers Count (Must Be Equal) *
                  </Text>
                  <Text style={styles.inputSubLabel}>
                    Murderers and healers are always balanced 1:1.
                  </Text>
                  <View style={styles.presetRow}>
                    {[1, 2, 3].map((count) => (
                      <TouchableOpacity
                        key={count}
                        style={[
                          styles.presetBtn,
                          numMurderers === count && styles.presetBtnActive,
                        ]}
                        onPress={() => setNumMurderers(count)}
                      >
                        <Text
                          style={[
                            styles.presetBtnText,
                            numMurderers === count && styles.presetBtnTextActive,
                          ]}
                        >
                          🔪 {count} & ❤️ {count}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Voting Duration */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Voting Time Limit *</Text>
                  <View style={styles.presetRow}>
                    {[30, 60, 90, 120].map((dur) => (
                      <TouchableOpacity
                        key={dur}
                        style={[
                          styles.presetBtn,
                          votingDuration === dur && styles.presetBtnActive,
                        ]}
                        onPress={() => setVotingDuration(dur)}
                      >
                        <Text
                          style={[
                            styles.presetBtnText,
                            votingDuration === dur && styles.presetBtnTextActive,
                          ]}
                        >
                          ⏱️ {dur}s
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Minimum Players info */}
                <View style={styles.infoBox}>
                  <Ionicons name="people" size={20} color="#F59E0B" />
                  <Text style={styles.infoBoxText}>
                    This match will require at least{" "}
                    <Text style={{ fontWeight: "700", color: "#FDE68A" }}>
                      {numMurderers * 2 + 1} players
                    </Text>{" "}
                    ({numMurderers} Murderer{numMurderers > 1 ? "s" : ""}, {numMurderers} Healer{numMurderers > 1 ? "s" : ""}, and at least 1 Normal player).
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.submitBtn, creating && styles.submitBtnDisabled]}
                  onPress={handleCreateRoom}
                  disabled={creating}
                  activeOpacity={0.8}
                >
                  {creating ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.submitBtnText}>Create Room & Enter Lobby</Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            )}

            {/* TAB: Join Room Form */}
            {hubTab === "join" && (
              <View style={styles.formContainer}>
                <TouchableOpacity onPress={() => setHubTab("hub")} style={styles.backLink}>
                  <Ionicons name="arrow-back" size={18} color="#94A3B8" />
                  <Text style={styles.backLinkText}>Back</Text>
                </TouchableOpacity>

                <Text style={styles.formHeaderTitle}>Enter Room Code</Text>
                <Text style={styles.formHeaderSub}>
                  Enter the 6-character room code shared by the room host.
                </Text>

                <View style={styles.inputGroup}>
                  <TextInput
                    style={[styles.textInput, styles.codeInput]}
                    placeholder="e.g. MM9482"
                    placeholderTextColor="#64748B"
                    autoCapitalize="characters"
                    maxLength={10}
                    value={joinCode}
                    onChangeText={setJoinCode}
                  />
                </View>

                <TouchableOpacity
                  style={[styles.submitBtn, joining && styles.submitBtnDisabled]}
                  onPress={handleJoinRoom}
                  disabled={joining}
                  activeOpacity={0.8}
                >
                  {joining ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.submitBtnText}>Join Lobby</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        ) : (
          /* ---------------------------------------------------------------- */
          /* SCREEN 2: ACTIVE GAME ROOM (Lobby, Night, Heal, Voting, GameOver) */
          /* ---------------------------------------------------------------- */
          <View style={styles.gameContainer}>
            {/* Top Game Bar */}
            <View style={styles.gameTopBar}>
              <View style={styles.roomCodeBox}>
                <Text style={styles.roomCodeLabel}>ROOM CODE</Text>
                <TouchableOpacity onPress={handleCopyCode} style={styles.roomCodeBtn}>
                  <Text style={styles.roomCodeText}>{activeRoom.code}</Text>
                  <Ionicons
                    name={copiedCode ? "checkmark" : "copy-outline"}
                    size={16}
                    color={copiedCode ? "#10B981" : "#94A3B8"}
                  />
                </TouchableOpacity>
                {copiedCode && <Text style={styles.copiedBadge}>Copied!</Text>}
              </View>

              <View style={styles.roomTitleCenter}>
                <Text style={styles.roomTitleHeader} numberOfLines={1}>
                  {activeRoom.name}
                </Text>
                <Text style={styles.phaseStatusText}>
                  {activeRoom.status === "LOBBY"
                    ? "Lobby"
                    : `Round ${activeRoom.phaseRound} • ${activeRoom.status.replace("_", " ")}`}
                </Text>
              </View>

              <TouchableOpacity onPress={handleLeaveRoom} style={styles.leaveRoomBtn}>
                <Ionicons name="exit-outline" size={20} color="#EF4444" />
                <Text style={styles.leaveRoomText}>Leave</Text>
              </TouchableOpacity>
            </View>

            {/* ---------------------------------------------------- */}
            {/* SUB-SCREEN A: LOBBY & READY SYSTEM */}
            {/* ---------------------------------------------------- */}
            {activeRoom.status === "LOBBY" && (
              <ScrollView contentContainerStyle={styles.lobbyScroll} showsVerticalScrollIndicator={false}>
                {/* Lobby Specs Badge */}
                <View style={styles.lobbySpecsRow}>
                  <View style={styles.specPill}>
                    <Text style={styles.specPillText}>🔪 {activeRoom.numMurderers} Murderer{activeRoom.numMurderers > 1 ? "s" : ""}</Text>
                  </View>
                  <View style={styles.specPill}>
                    <Text style={styles.specPillText}>❤️ {activeRoom.numHealers} Healer{activeRoom.numHealers > 1 ? "s" : ""}</Text>
                  </View>
                  <View style={styles.specPill}>
                    <Text style={styles.specPillText}>🗳️ {activeRoom.votingDuration}s Vote</Text>
                  </View>
                </View>

                {/* Player Count & Requirement Banner */}
                <View style={styles.playerCountCard}>
                  <View style={styles.playerCountHeader}>
                    <Text style={styles.playerCountTitle}>
                      Players in Lobby ({activeRoom.players.length})
                    </Text>
                    <Text
                      style={[
                        styles.playerCountReq,
                        hasEnoughPlayers ? styles.textSuccess : styles.textWarning,
                      ]}
                    >
                      {hasEnoughPlayers
                        ? "Requirement met ✓"
                        : `Need at least ${minRequiredPlayers} players`}
                    </Text>
                  </View>

                  {/* Player Cards List */}
                  <View style={styles.playersList}>
                    {activeRoom.players.map((p) => {
                      const isMe = p.userId === currentUser?.id;
                      const isRoomAdmin = p.userId === activeRoom.adminId;

                      return (
                        <View key={p.id} style={styles.playerCard}>
                          <View style={styles.playerAvatar}>
                            <Text style={styles.playerAvatarText}>
                              {p.name.charAt(0).toUpperCase()}
                            </Text>
                          </View>

                          <View style={styles.playerInfo}>
                            <View style={styles.playerNameRow}>
                              <Text style={styles.playerName}>
                                {p.name} {isMe ? "(You)" : ""}
                              </Text>
                              {isRoomAdmin && (
                                <View style={styles.adminBadge}>
                                  <Text style={styles.adminBadgeText}>Admin</Text>
                                </View>
                              )}
                            </View>
                            <Text style={styles.playerUsername}>@{p.username}</Text>
                          </View>

                          {/* Ready Status Pill */}
                          <View
                            style={[
                              styles.readyStatusPill,
                              p.isReady ? styles.readyPillActive : styles.readyPillInactive,
                            ]}
                          >
                            <Text
                              style={[
                                styles.readyStatusText,
                                p.isReady ? styles.readyTextActive : styles.readyTextInactive,
                              ]}
                            >
                              {p.isReady ? "Ready ✓" : "Not Ready"}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>

                {/* Action Buttons: Ready Toggle & Admin Start Game */}
                <View style={styles.lobbyFooter}>
                  <TouchableOpacity
                    style={[
                      styles.readyToggleBtn,
                      me?.isReady ? styles.readyToggleActive : styles.readyToggleInactive,
                    ]}
                    onPress={handleToggleReady}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={me?.isReady ? "close-circle" : "checkmark-circle"}
                      size={20}
                      color="#FFFFFF"
                    />
                    <Text style={styles.readyToggleBtnText}>
                      {me?.isReady ? "Cancel Ready" : "I'm Ready"}
                    </Text>
                  </TouchableOpacity>

                  {isAdmin && (
                    <TouchableOpacity
                      style={[
                        styles.startGameBtn,
                        !canStart && styles.startGameBtnDisabled,
                      ]}
                      onPress={handleStartGame}
                      disabled={!canStart}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="play" size={20} color="#FFFFFF" />
                      <Text style={styles.startGameBtnText}>Start Match 🚀</Text>
                    </TouchableOpacity>
                  )}

                  {!canStart && isAdmin && (
                    <Text style={styles.adminStartHint}>
                      {!hasEnoughPlayers
                        ? `Waiting for at least ${minRequiredPlayers} players to join.`
                        : "Waiting for all players to click 'I'm Ready'."}
                    </Text>
                  )}
                </View>
              </ScrollView>
            )}

            {/* ---------------------------------------------------- */}
            {/* SUB-SCREEN B: SECRET ROLE REVEAL POPUP */}
            {/* ---------------------------------------------------- */}
            {activeRoom.status === "ROLE_REVEAL" && !roleDismissed && (
              <Animated.View style={[styles.roleRevealModal, { opacity: phaseFadeAnim }]}>
                <View style={styles.roleCard}>
                  <Text style={styles.roleEyebrow}>YOUR SECRET IDENTITY</Text>

                  {myRole === "MURDERER" && (
                    <>
                      <View style={[styles.roleIconCircle, { backgroundColor: "#7F1D1D" }]}>
                        <Text style={styles.roleBigIcon}>🔪</Text>
                      </View>
                      <Text style={[styles.roleTitle, { color: "#EF4444" }]}>MURDERER</Text>
                      <Text style={styles.roleObjective}>
                        Strike from the shadows. Coordinate with your fellow killer(s) during the night to eliminate townsfolk. Keep your identity completely hidden during daylight voting!
                      </Text>
                    </>
                  )}

                  {myRole === "HEALER" && (
                    <>
                      <View style={[styles.roleIconCircle, { backgroundColor: "#064E3B" }]}>
                        <Text style={styles.roleBigIcon}>❤️</Text>
                      </View>
                      <Text style={[styles.roleTitle, { color: "#10B981" }]}>HEALER</Text>
                      <Text style={styles.roleObjective}>
                        The protector of the innocent. Each night, secretly select a living player to protect. If the murderers target that player, they survive!
                      </Text>
                    </>
                  )}

                  {myRole === "NORMAL" && (
                    <>
                      <View style={[styles.roleIconCircle, { backgroundColor: "#1E3A8A" }]}>
                        <Text style={styles.roleBigIcon}>🔍</Text>
                      </View>
                      <Text style={[styles.roleTitle, { color: "#3B82F6" }]}>NORMAL PLAYER</Text>
                      <Text style={styles.roleObjective}>
                        An innocent villager. Gather clues from night casualties, analyze suspicious behavior in discussion, and vote out the murderers.
                      </Text>
                    </>
                  )}

                  <TouchableOpacity
                    style={styles.roleContinueBtn}
                    onPress={handleConfirmRole}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.roleContinueBtnText}>Continue to Match →</Text>
                  </TouchableOpacity>
                </View>
              </Animated.View>
            )}

            {/* If role dismissed but still waiting for other players */}
            {activeRoom.status === "ROLE_REVEAL" && roleDismissed && (
              <View style={styles.centeredWaitContainer}>
                <ActivityIndicator size="large" color="#EF4444" />
                <Text style={styles.waitingTitle}>Preparing Round 1...</Text>
                <Text style={styles.waitingSubtitle}>
                  Waiting for all players to view their secret roles.
                </Text>
              </View>
            )}

            {/* ---------------------------------------------------- */}
            {/* SUB-SCREEN C: NIGHT PHASE (Murderer Action) */}
            {/* ---------------------------------------------------- */}
            {activeRoom.status === "NIGHT_PHASE" && (
              <Animated.View style={[styles.nightContainer, { opacity: phaseFadeAnim }]}>
                {/* Night Banner Header */}
                <View style={styles.nightBanner}>
                  <Animated.Text style={[styles.nightMoonIcon, { transform: [{ scale: pulseAnim }] }]}>
                    🌙
                  </Animated.Text>
                  <Text style={styles.nightHeaderTitle}>NIGHT TIME</Text>
                  <Text style={styles.nightTimerText}>⏱️ {localTimer}s remaining</Text>
                </View>

                {/* Murderer Action View */}
                {myRole === "MURDERER" && isAlive ? (
                  <View style={styles.actionBox}>
                    <Text style={styles.actionBoxTitle}>🔪 Choose A Player To Kill</Text>
                    <Text style={styles.actionBoxSub}>
                      Select a living player. If multiple murderers choose, all selections will be targeted.
                    </Text>

                    <ScrollView style={styles.targetsList}>
                      {livingTargetsForMurder.map((p) => {
                        const isSelected = selectedTargetId === p.userId;
                        return (
                          <TouchableOpacity
                            key={p.userId}
                            style={[styles.targetRow, isSelected && styles.targetRowSelected]}
                            onPress={() => setSelectedTargetId(p.userId)}
                            disabled={actionSubmitted}
                          >
                            <View style={styles.targetAvatar}>
                              <Text style={styles.targetAvatarText}>{p.name.charAt(0)}</Text>
                            </View>
                            <Text style={styles.targetName}>{p.name}</Text>
                            {isSelected && <Ionicons name="checkmark-circle" size={20} color="#EF4444" />}
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>

                    <TouchableOpacity
                      style={[
                        styles.actionConfirmBtn,
                        (!selectedTargetId || actionSubmitted) && styles.actionConfirmDisabled,
                      ]}
                      onPress={handleSubmitMurder}
                      disabled={!selectedTargetId || actionSubmitted}
                    >
                      <Text style={styles.actionConfirmBtnText}>
                        {actionSubmitted ? "Target Submitted ✓" : "Confirm Kill"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  /* Waiting Screen for Innocent / Dead / Healer */
                  <View style={styles.sleepingBox}>
                    <Text style={styles.sleepingZzz}>💤</Text>
                    <Text style={styles.sleepingTitle}>The Town Is Asleep</Text>
                    <Text style={styles.sleepingSub}>
                      Murderers are prowling the silent streets in the dark...
                    </Text>
                  </View>
                )}
              </Animated.View>
            )}

            {/* ---------------------------------------------------- */}
            {/* SUB-SCREEN D: HEALER PHASE (Heal Action) */}
            {/* ---------------------------------------------------- */}
            {activeRoom.status === "HEALER_PHASE" && (
              <Animated.View style={[styles.healerContainer, { opacity: phaseFadeAnim }]}>
                {/* Heal Banner Header */}
                <View style={styles.healBanner}>
                  <Animated.Text style={[styles.nightMoonIcon, { transform: [{ scale: pulseAnim }] }]}>
                    ❤️
                  </Animated.Text>
                  <Text style={styles.healHeaderTitle}>HEAL TIME</Text>
                  <Text style={styles.nightTimerText}>⏱️ {localTimer}s remaining</Text>
                </View>

                {myRole === "HEALER" && isAlive ? (
                  <View style={styles.actionBox}>
                    <Text style={[styles.actionBoxTitle, { color: "#10B981" }]}>
                      ❤️ Choose A Player To Protect
                    </Text>
                    <Text style={styles.actionBoxSub}>
                      If the murderers target this person tonight, your healing will save their life!
                    </Text>

                    <ScrollView style={styles.targetsList}>
                      {livingPlayers.map((p) => {
                        const isSelected = selectedTargetId === p.userId;
                        return (
                          <TouchableOpacity
                            key={p.userId}
                            style={[
                              styles.targetRow,
                              isSelected && { borderColor: "#10B981", backgroundColor: "#064E3B" },
                            ]}
                            onPress={() => setSelectedTargetId(p.userId)}
                            disabled={actionSubmitted}
                          >
                            <View style={[styles.targetAvatar, { backgroundColor: "#10B981" }]}>
                              <Text style={styles.targetAvatarText}>{p.name.charAt(0)}</Text>
                            </View>
                            <Text style={styles.targetName}>
                              {p.name} {p.userId === currentUser?.id ? "(You)" : ""}
                            </Text>
                            {isSelected && <Ionicons name="checkmark-circle" size={20} color="#10B981" />}
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>

                    <TouchableOpacity
                      style={[
                        styles.actionConfirmBtn,
                        { backgroundColor: "#10B981" },
                        (!selectedTargetId || actionSubmitted) && styles.actionConfirmDisabled,
                      ]}
                      onPress={handleSubmitHeal}
                      disabled={!selectedTargetId || actionSubmitted}
                    >
                      <Text style={styles.actionConfirmBtnText}>
                        {actionSubmitted ? "Protection Cast ✓" : "Cast Protection"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.sleepingBox}>
                    <Text style={styles.sleepingZzz}>✨</Text>
                    <Text style={styles.sleepingTitle}>The Doctor Is Awake</Text>
                    <Text style={styles.sleepingSub}>
                      A secret healer is preparing a potion to save someone...
                    </Text>
                  </View>
                )}
              </Animated.View>
            )}

            {/* ---------------------------------------------------- */}
            {/* SUB-SCREEN E: NIGHT RESULT */}
            {/* ---------------------------------------------------- */}
            {activeRoom.status === "NIGHT_RESULT" && (
              <View style={styles.resultContainer}>
                <Text style={styles.resultDawnEmoji}>🌅</Text>
                <Text style={styles.resultTitle}>Morning Breaks</Text>

                {activeRoom.eliminatedTonight && activeRoom.eliminatedTonight.length > 0 ? (
                  <View style={styles.eliminatedBox}>
                    <Text style={styles.eliminatedNotice}>💀 CASUALTY OF THE NIGHT</Text>
                    {activeRoom.eliminatedTonight.map((name, idx) => (
                      <Text key={idx} style={styles.eliminatedName}>
                        {name} was eliminated!
                      </Text>
                    ))}
                    <Text style={styles.eliminatedDetail}>
                      The body was found at dawn. The victim cannot vote or speak in discussion.
                    </Text>
                  </View>
                ) : (
                  <View style={styles.survivedBox}>
                    <Text style={styles.survivedEmoji}>✨</Text>
                    <Text style={styles.survivedTitle}>Everyone survived the night!</Text>
                    <Text style={styles.survivedDetail}>
                      The healer successfully saved a target or the murderers missed!
                    </Text>
                  </View>
                )}

                <Text style={styles.nextPhaseHint}>
                  Advancing to Town Discussion & Voting in {localTimer}s...
                </Text>
              </View>
            )}

            {/* ---------------------------------------------------- */}
            {/* SUB-SCREEN F: DISCUSSION & VOTING PHASE */}
            {/* ---------------------------------------------------- */}
            {(activeRoom.status === "VOTING" || activeRoom.status === "RUNOFF_VOTING") && (
              <View style={styles.votingContainer}>
                {/* Voting Header */}
                <View style={styles.votingHeaderBanner}>
                  <Text style={styles.votingHeaderEmoji}>🗳️</Text>
                  <View>
                    <Text style={styles.votingHeaderTitle}>
                      {activeRoom.status === "RUNOFF_VOTING"
                        ? "⚠️ RUNOFF VOTE!"
                        : "VOTING TIME"}
                    </Text>
                    <Text style={styles.votingTimerAlert}>
                      ⏱️ Closes in {localTimer} seconds
                    </Text>
                  </View>
                </View>

                {/* Candidate Selection List */}
                {isAlive ? (
                  <View style={styles.voteSelectionBox}>
                    <Text style={styles.voteInstruction}>
                      Cast your vote for who you believe is the murderer:
                    </Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.candidatesRow}>
                      {eligibleVoteCandidates.map((p) => {
                        const isVoted = selectedTargetId === p.userId;
                        return (
                          <TouchableOpacity
                            key={p.userId}
                            style={[styles.candidateCard, isVoted && styles.candidateCardVoted]}
                            onPress={() => setSelectedTargetId(p.userId)}
                            disabled={actionSubmitted}
                          >
                            <View style={styles.candidateAvatar}>
                              <Text style={styles.candidateAvatarText}>{p.name.charAt(0)}</Text>
                            </View>
                            <Text style={styles.candidateName} numberOfLines={1}>
                              {p.name}
                            </Text>
                            {isVoted && <Text style={styles.votedCheck}>✓</Text>}
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>

                    <TouchableOpacity
                      style={[
                        styles.castVoteBtn,
                        (!selectedTargetId || actionSubmitted) && styles.castVoteDisabled,
                      ]}
                      onPress={handleSubmitVote}
                      disabled={!selectedTargetId || actionSubmitted}
                    >
                      <Text style={styles.castVoteBtnText}>
                        {actionSubmitted ? "Vote Cast Secretly ✓" : "Submit Secret Vote"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.spectatorNotice}>
                    <Text style={styles.spectatorNoticeText}>
                      💀 You are eliminated. You cannot vote or send messages.
                    </Text>
                  </View>
                )}

                {/* In-Game Discussion Chat */}
                <View style={styles.discussionChatBox}>
                  <Text style={styles.chatTitle}>💬 Town Deliberation Chat</Text>

                  <ScrollView style={styles.chatMessagesList}>
                    {activeRoom.messages.length === 0 ? (
                      <Text style={styles.emptyChatText}>
                        No theories yet. Living players, share your suspicions!
                      </Text>
                    ) : (
                      activeRoom.messages.map((m) => (
                        <View key={m.id} style={styles.chatMsgRow}>
                          <Text style={styles.chatMsgSender}>{m.senderName}:</Text>
                          <Text style={styles.chatMsgText}>{m.text}</Text>
                        </View>
                      ))
                    )}
                  </ScrollView>

                  {/* Chat Input */}
                  {isAlive && (
                    <View style={styles.chatInputRow}>
                      <TextInput
                        style={styles.chatTextInput}
                        placeholder="Type suspicion or defense..."
                        placeholderTextColor="#64748B"
                        value={chatInput}
                        onChangeText={setChatInput}
                      />
                      <TouchableOpacity
                        style={styles.sendChatBtn}
                        onPress={handleSendMessage}
                        disabled={sendingChat || !chatInput.trim()}
                      >
                        <Ionicons name="send" size={16} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* ---------------------------------------------------- */}
            {/* SUB-SCREEN G: VOTING RESULT */}
            {/* ---------------------------------------------------- */}
            {activeRoom.status === "VOTING_RESULT" && (
              <View style={styles.votingResultBox}>
                <Text style={styles.resultDawnEmoji}>⚖️</Text>
                <Text style={styles.resultTitle}>The Town Verdict</Text>

                {activeRoom.eliminatedInVoting ? (
                  <View style={styles.verdictCard}>
                    <Text style={styles.verdictNotice}>EXECUTED BY TOWN VOTE</Text>
                    <Text style={styles.verdictName}>
                      {activeRoom.eliminatedInVoting.name}
                    </Text>
                    <View style={styles.verdictRolePill}>
                      <Text style={styles.verdictRoleText}>
                        ROLE REVEALED: {activeRoom.eliminatedInVoting.role}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.survivedBox}>
                    <Text style={styles.survivedEmoji}>🤝</Text>
                    <Text style={styles.survivedTitle}>No Player Eliminated</Text>
                    <Text style={styles.survivedDetail}>
                      Voting was tied or no majority was reached.
                    </Text>
                  </View>
                )}

                <Text style={styles.nextPhaseHint}>
                  Checking game status in {localTimer}s...
                </Text>
              </View>
            )}

            {/* ---------------------------------------------------- */}
            {/* SUB-SCREEN H: GAME OVER */}
            {/* ---------------------------------------------------- */}
            {activeRoom.status === "GAME_OVER" && (
              <ScrollView contentContainerStyle={styles.gameOverContainer} showsVerticalScrollIndicator={false}>
                <Text style={styles.gameOverTrophy}>
                  {activeRoom.winnerTeam === "INNOCENTS" ? "🏆" : "🩸"}
                </Text>
                <Text
                  style={[
                    styles.gameOverTitle,
                    activeRoom.winnerTeam === "INNOCENTS" ? styles.textSuccess : styles.textDanger,
                  ]}
                >
                  {activeRoom.winnerTeam === "INNOCENTS"
                    ? "INNOCENTS WIN!"
                    : "MURDERERS WIN!"}
                </Text>
                <Text style={styles.gameOverSub}>
                  {activeRoom.winnerTeam === "INNOCENTS"
                    ? "All Murderers have been eliminated. Justice prevails!"
                    : "Murderers eliminated half the town and overpowered the survivors."}
                </Text>

                {/* Roster with full role reveal */}
                <View style={styles.rosterCard}>
                  <Text style={styles.rosterTitle}>🎭 Full Role Reveals</Text>
                  {activeRoom.players.map((p) => (
                    <View key={p.id} style={styles.rosterRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rosterName}>
                          {p.name} {p.userId === currentUser?.id ? "(You)" : ""}
                        </Text>
                        <Text style={styles.rosterStatus}>
                          {p.isAlive ? "Alive" : `Eliminated via ${p.eliminatedReason}`}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.rosterRoleBadge,
                          p.role === "MURDERER" && styles.badgeDanger,
                          p.role === "HEALER" && styles.badgeSuccess,
                          p.role === "NORMAL" && styles.badgeNormal,
                        ]}
                      >
                        <Text style={styles.rosterRoleText}>{p.role}</Text>
                      </View>
                    </View>
                  ))}
                </View>

                {/* Footer Controls */}
                <View style={styles.gameOverFooter}>
                  {isAdmin && (
                    <TouchableOpacity
                      style={styles.playAgainBtn}
                      onPress={handlePlayAgain}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="refresh" size={18} color="#FFFFFF" />
                      <Text style={styles.playAgainBtnText}>Play Again (Reset to Lobby)</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={styles.leaveGameBtn}
                    onPress={handleLeaveRoom}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.leaveGameBtnText}>Return to Hub</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#09090B",
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#450A0A",
    borderLeftWidth: 4,
    borderLeftColor: "#EF4444",
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
    gap: 8,
  },
  errorBannerText: {
    flex: 1,
    color: "#FCA5A5",
    fontSize: 13,
    fontWeight: "500",
  },
  hubContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  hubHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  hubTitleBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#27272A",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  hubTitleEmoji: {
    fontSize: 18,
  },
  hubTitleText: {
    color: "#F43F5E",
    fontWeight: "800",
    fontSize: 16,
    letterSpacing: 0.5,
  },
  closeBtn: {
    padding: 6,
    backgroundColor: "#27272A",
    borderRadius: 20,
  },
  hubBody: {
    paddingBottom: 40,
  },
  heroCard: {
    backgroundColor: "#18181B",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#3F3F46",
    marginBottom: 20,
  },
  heroEyebrow: {
    color: "#EF4444",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 8,
  },
  heroSubtitle: {
    color: "#94A3B8",
    fontSize: 13,
    lineHeight: 19,
  },
  hubCardsRow: {
    gap: 14,
    marginBottom: 24,
  },
  actionCard: {
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
  },
  actionCardPrimary: {
    backgroundColor: "#1C1917",
    borderColor: "#78350F",
  },
  actionCardSecondary: {
    backgroundColor: "#0F172A",
    borderColor: "#1E293B",
  },
  actionCardIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#451A03",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  actionCardIcon: {
    fontSize: 22,
  },
  actionCardTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 6,
  },
  actionCardDesc: {
    color: "#94A3B8",
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  actionCardBtn: {
    backgroundColor: "#D97706",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: "center",
  },
  actionCardBtnText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
  rulesOverviewCard: {
    backgroundColor: "#18181B",
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: "#27272A",
  },
  rulesTitle: {
    color: "#F8FAFC",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 12,
  },
  ruleItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 12,
  },
  ruleIcon: {
    fontSize: 20,
  },
  ruleName: {
    color: "#E2E8F0",
    fontWeight: "700",
    fontSize: 13,
  },
  ruleDesc: {
    color: "#94A3B8",
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  formContainer: {
    paddingBottom: 40,
  },
  backLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 16,
  },
  backLinkText: {
    color: "#94A3B8",
    fontWeight: "600",
    fontSize: 14,
  },
  formHeaderTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 6,
  },
  formHeaderSub: {
    color: "#94A3B8",
    fontSize: 13,
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    color: "#E2E8F0",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4,
  },
  inputSubLabel: {
    color: "#94A3B8",
    fontSize: 12,
    marginBottom: 10,
  },
  textInput: {
    backgroundColor: "#18181B",
    borderWidth: 1,
    borderColor: "#3F3F46",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: "#FFFFFF",
    fontSize: 15,
  },
  codeInput: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 4,
    textAlign: "center",
    paddingVertical: 14,
  },
  presetRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  presetBtn: {
    backgroundColor: "#18181B",
    borderWidth: 1,
    borderColor: "#3F3F46",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  presetBtnActive: {
    backgroundColor: "#7F1D1D",
    borderColor: "#EF4444",
  },
  presetBtnText: {
    color: "#CBD5E1",
    fontWeight: "600",
    fontSize: 13,
  },
  presetBtnTextActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#451A03",
    padding: 14,
    borderRadius: 12,
    gap: 10,
    marginBottom: 24,
  },
  infoBoxText: {
    flex: 1,
    color: "#FEF3C7",
    fontSize: 12,
    lineHeight: 17,
  },
  submitBtn: {
    backgroundColor: "#DC2626",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  gameContainer: {
    flex: 1,
  },
  gameTopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#27272A",
    backgroundColor: "#18181B",
  },
  roomCodeBox: {
    alignItems: "flex-start",
  },
  roomCodeLabel: {
    color: "#94A3B8",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  roomCodeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  roomCodeText: {
    color: "#F8FAFC",
    fontWeight: "800",
    fontSize: 15,
    letterSpacing: 1,
  },
  copiedBadge: {
    color: "#10B981",
    fontSize: 10,
    fontWeight: "700",
  },
  roomTitleCenter: {
    alignItems: "center",
    flex: 1,
    paddingHorizontal: 8,
  },
  roomTitleHeader: {
    color: "#F1F5F9",
    fontWeight: "700",
    fontSize: 14,
  },
  phaseStatusText: {
    color: "#EF4444",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
    textTransform: "uppercase",
  },
  leaveRoomBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#27272A",
  },
  leaveRoomText: {
    color: "#EF4444",
    fontWeight: "700",
    fontSize: 12,
  },
  lobbyScroll: {
    padding: 16,
    paddingBottom: 40,
  },
  lobbySpecsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  specPill: {
    backgroundColor: "#27272A",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  specPillText: {
    color: "#CBD5E1",
    fontSize: 11,
    fontWeight: "700",
  },
  playerCountCard: {
    backgroundColor: "#18181B",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#27272A",
    marginBottom: 20,
  },
  playerCountHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#27272A",
    paddingBottom: 10,
  },
  playerCountTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  playerCountReq: {
    fontSize: 12,
    fontWeight: "700",
  },
  textSuccess: {
    color: "#10B981",
  },
  textWarning: {
    color: "#F59E0B",
  },
  textDanger: {
    color: "#EF4444",
  },
  playersList: {
    gap: 8,
  },
  playerCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#27272A",
    borderRadius: 12,
    padding: 10,
    gap: 10,
  },
  playerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#3F3F46",
    alignItems: "center",
    justifyContent: "center",
  },
  playerAvatarText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 15,
  },
  playerInfo: {
    flex: 1,
  },
  playerNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  playerName: {
    color: "#F8FAFC",
    fontWeight: "700",
    fontSize: 13,
  },
  adminBadge: {
    backgroundColor: "#78350F",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  adminBadgeText: {
    color: "#FDE68A",
    fontSize: 9,
    fontWeight: "800",
  },
  playerUsername: {
    color: "#94A3B8",
    fontSize: 11,
  },
  readyStatusPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  readyPillActive: {
    backgroundColor: "#064E3B",
  },
  readyPillInactive: {
    backgroundColor: "#3F3F46",
  },
  readyStatusText: {
    fontSize: 11,
    fontWeight: "700",
  },
  readyTextActive: {
    color: "#34D399",
  },
  readyTextInactive: {
    color: "#CBD5E1",
  },
  lobbyFooter: {
    gap: 12,
  },
  readyToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  readyToggleActive: {
    backgroundColor: "#065F46",
  },
  readyToggleInactive: {
    backgroundColor: "#2563EB",
  },
  readyToggleBtnText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 15,
  },
  startGameBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#DC2626",
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  startGameBtnDisabled: {
    backgroundColor: "#3F3F46",
    opacity: 0.6,
  },
  startGameBtnText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 15,
  },
  adminStartHint: {
    textAlign: "center",
    color: "#F59E0B",
    fontSize: 12,
    fontWeight: "600",
  },
  roleRevealModal: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  roleCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#18181B",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#3F3F46",
  },
  roleEyebrow: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    marginBottom: 16,
  },
  roleIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  roleBigIcon: {
    fontSize: 40,
  },
  roleTitle: {
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 12,
  },
  roleObjective: {
    color: "#CBD5E1",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    marginBottom: 24,
  },
  roleContinueBtn: {
    width: "100%",
    backgroundColor: "#DC2626",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  roleContinueBtnText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 15,
  },
  centeredWaitContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  waitingTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },
  waitingSubtitle: {
    color: "#94A3B8",
    fontSize: 13,
    textAlign: "center",
  },
  nightContainer: {
    flex: 1,
    backgroundColor: "#030712",
    padding: 20,
  },
  nightBanner: {
    alignItems: "center",
    marginTop: 10,
    marginBottom: 20,
  },
  nightMoonIcon: {
    fontSize: 44,
    marginBottom: 6,
  },
  nightHeaderTitle: {
    color: "#F8FAFC",
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 2,
  },
  nightTimerText: {
    color: "#F87171",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 4,
  },
  healerContainer: {
    flex: 1,
    backgroundColor: "#022C22",
    padding: 20,
  },
  healBanner: {
    alignItems: "center",
    marginTop: 10,
    marginBottom: 20,
  },
  healHeaderTitle: {
    color: "#F8FAFC",
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 2,
  },
  actionBox: {
    backgroundColor: "#111827",
    borderRadius: 16,
    padding: 16,
    flex: 1,
    borderWidth: 1,
    borderColor: "#1F2937",
  },
  actionBoxTitle: {
    color: "#EF4444",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 4,
  },
  actionBoxSub: {
    color: "#94A3B8",
    fontSize: 12,
    marginBottom: 14,
  },
  targetsList: {
    flex: 1,
    marginBottom: 14,
  },
  targetRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1F2937",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    gap: 12,
    borderWidth: 1,
    borderColor: "transparent",
  },
  targetRowSelected: {
    borderColor: "#EF4444",
    backgroundColor: "#450A0A",
  },
  targetAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
  },
  targetAvatarText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 14,
  },
  targetName: {
    flex: 1,
    color: "#F9FAFB",
    fontWeight: "700",
    fontSize: 14,
  },
  actionConfirmBtn: {
    backgroundColor: "#DC2626",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  actionConfirmDisabled: {
    opacity: 0.5,
  },
  actionConfirmBtnText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 15,
  },
  sleepingBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  sleepingZzz: {
    fontSize: 50,
    marginBottom: 16,
  },
  sleepingTitle: {
    color: "#F8FAFC",
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 6,
  },
  sleepingSub: {
    color: "#94A3B8",
    fontSize: 14,
    textAlign: "center",
  },
  resultContainer: {
    flex: 1,
    backgroundColor: "#0F172A",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  resultDawnEmoji: {
    fontSize: 50,
    marginBottom: 10,
  },
  resultTitle: {
    color: "#F8FAFC",
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 16,
  },
  eliminatedBox: {
    backgroundColor: "#450A0A",
    borderWidth: 1,
    borderColor: "#991B1B",
    borderRadius: 16,
    padding: 20,
    width: "100%",
    alignItems: "center",
    marginBottom: 20,
  },
  eliminatedNotice: {
    color: "#FCA5A5",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 8,
  },
  eliminatedName: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 6,
  },
  eliminatedDetail: {
    color: "#F87171",
    fontSize: 12,
    textAlign: "center",
  },
  survivedBox: {
    backgroundColor: "#064E3B",
    borderWidth: 1,
    borderColor: "#059669",
    borderRadius: 16,
    padding: 20,
    width: "100%",
    alignItems: "center",
    marginBottom: 20,
  },
  survivedEmoji: {
    fontSize: 32,
    marginBottom: 6,
  },
  survivedTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 4,
  },
  survivedDetail: {
    color: "#6EE7B7",
    fontSize: 12,
    textAlign: "center",
  },
  nextPhaseHint: {
    color: "#94A3B8",
    fontSize: 13,
  },
  votingContainer: {
    flex: 1,
    padding: 16,
  },
  votingHeaderBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#18181B",
    borderRadius: 14,
    padding: 14,
    gap: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#3F3F46",
  },
  votingHeaderEmoji: {
    fontSize: 30,
  },
  votingHeaderTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  votingTimerAlert: {
    color: "#F59E0B",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  voteSelectionBox: {
    backgroundColor: "#18181B",
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#27272A",
  },
  voteInstruction: {
    color: "#CBD5E1",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 10,
  },
  candidatesRow: {
    marginBottom: 12,
  },
  candidateCard: {
    backgroundColor: "#27272A",
    borderRadius: 12,
    padding: 10,
    alignItems: "center",
    width: 84,
    marginRight: 8,
    borderWidth: 1,
    borderColor: "transparent",
  },
  candidateCardVoted: {
    borderColor: "#DC2626",
    backgroundColor: "#450A0A",
  },
  candidateAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#3F3F46",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  candidateAvatarText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 14,
  },
  candidateName: {
    color: "#F1F5F9",
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },
  votedCheck: {
    color: "#EF4444",
    fontWeight: "900",
    fontSize: 12,
    marginTop: 2,
  },
  castVoteBtn: {
    backgroundColor: "#DC2626",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  castVoteDisabled: {
    opacity: 0.5,
  },
  castVoteBtnText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 13,
  },
  spectatorNotice: {
    backgroundColor: "#27272A",
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  spectatorNoticeText: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  discussionChatBox: {
    flex: 1,
    backgroundColor: "#18181B",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#27272A",
  },
  chatTitle: {
    color: "#F8FAFC",
    fontWeight: "700",
    fontSize: 13,
    marginBottom: 8,
  },
  chatMessagesList: {
    flex: 1,
    marginBottom: 8,
  },
  emptyChatText: {
    color: "#64748B",
    fontSize: 12,
    textAlign: "center",
    marginTop: 20,
  },
  chatMsgRow: {
    flexDirection: "row",
    marginBottom: 6,
    gap: 6,
  },
  chatMsgSender: {
    color: "#93C5FD",
    fontWeight: "700",
    fontSize: 12,
  },
  chatMsgText: {
    color: "#E2E8F0",
    fontSize: 12,
    flex: 1,
  },
  chatInputRow: {
    flexDirection: "row",
    gap: 8,
  },
  chatTextInput: {
    flex: 1,
    backgroundColor: "#27272A",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: "#FFFFFF",
    fontSize: 13,
  },
  sendChatBtn: {
    backgroundColor: "#2563EB",
    borderRadius: 8,
    width: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  votingResultBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  verdictCard: {
    backgroundColor: "#450A0A",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    width: "100%",
    marginBottom: 16,
  },
  verdictNotice: {
    color: "#F87171",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 6,
  },
  verdictName: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "900",
    marginBottom: 10,
  },
  verdictRolePill: {
    backgroundColor: "#7F1D1D",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  verdictRoleText: {
    color: "#FEE2E2",
    fontWeight: "800",
    fontSize: 12,
  },
  gameOverContainer: {
    padding: 20,
    alignItems: "center",
    paddingBottom: 40,
  },
  gameOverTrophy: {
    fontSize: 60,
    marginBottom: 10,
    marginTop: 10,
  },
  gameOverTitle: {
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  gameOverSub: {
    color: "#94A3B8",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 20,
  },
  rosterCard: {
    backgroundColor: "#18181B",
    borderRadius: 16,
    padding: 16,
    width: "100%",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#27272A",
  },
  rosterTitle: {
    color: "#F8FAFC",
    fontWeight: "800",
    fontSize: 14,
    marginBottom: 12,
  },
  rosterRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#27272A",
  },
  rosterName: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 13,
  },
  rosterStatus: {
    color: "#94A3B8",
    fontSize: 11,
  },
  rosterRoleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeDanger: {
    backgroundColor: "#7F1D1D",
  },
  badgeSuccess: {
    backgroundColor: "#064E3B",
  },
  badgeNormal: {
    backgroundColor: "#1E3A8A",
  },
  rosterRoleText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 11,
  },
  gameOverFooter: {
    width: "100%",
    gap: 10,
  },
  playAgainBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#059669",
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  playAgainBtnText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 15,
  },
  leaveGameBtn: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#27272A",
    paddingVertical: 14,
    borderRadius: 12,
  },
  leaveGameBtnText: {
    color: "#CBD5E1",
    fontWeight: "700",
    fontSize: 14,
  },
});
