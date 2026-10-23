import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
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
import { SafeAreaView } from "react-native-safe-area-context";
import type { ChatMessage, GroupChat, GroupInvitationInfo } from "@chatapp/shared";
import { useUser } from "@/store/user-context";
import { socketService, type ConnectionStatus } from "@/services/socket";
import {
  fetchGroups,
  createGroup,
  inviteGroupMembers,
  fetchMessageHistory,
  fetchAllUsers,
  fetchUserInvitations,
  respondToGroupInvitation,
  extendChugliSession,
  endChugliSession,
  setChugliMemberAlias,
} from "@/services/api";
import {
  sendChugliWarningNotification,
  requestNotificationPermission,
} from "@/services/notification";
import { generateRandomAlias, formatCountdown } from "@/utils/chugli";
import { ChatBubble } from "@/components/ChatBubble";
import { ChatInput } from "@/components/ChatInput";
import { EmptyState } from "@/components/EmptyState";
import { ErrorBanner } from "@/components/ErrorBanner";
import { Ionicons } from "@/components/Icon";

export default function GroupsTabScreen() {
  const { currentUser, registeredUsers, setRegisteredUsers } = useUser();

  const [groups, setGroups] = useState<GroupChat[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [bannerSuccess, setBannerSuccess] = useState<string | null>(null);

  // Pending Invitations received by currentUser
  const [pendingInvitations, setPendingInvitations] = useState<GroupInvitationInfo[]>([]);

  // Active Group Chat Room (null = groups list)
  const [activeGroup, setActiveGroup] = useState<GroupChat | null>(null);

  // Search in groups list
  const [groupSearchQuery, setGroupSearchQuery] = useState("");

  // Create Standard Group Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDescription, setNewGroupDescription] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);

  // Right-side Hamburger Actions Drawer State
  const [showActionsDrawer, setShowActionsDrawer] = useState(false);
  const [drawerSlideAnim] = useState(() => new Animated.Value(340));

  useEffect(() => {
    if (showActionsDrawer) {
      Animated.spring(drawerSlideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 24,
        stiffness: 220,
      }).start();
    } else {
      drawerSlideAnim.setValue(340);
    }
  }, [showActionsDrawer, drawerSlideAnim]);

  const handleCloseActionsDrawer = () => {
    Animated.timing(drawerSlideAnim, {
      toValue: 340,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      setShowActionsDrawer(false);
    });
  };

  // Chugli (Secret Ephemeral Group) Modal State
  const [showChugliModal, setShowChugliModal] = useState(false);
  const [chugliName, setChugliName] = useState("");
  const [chugliDurationPreset, setChugliDurationPreset] = useState<"1" | "5" | "10" | "30" | "60" | "custom">("10");
  const [chugliCustomDuration, setChugliCustomDuration] = useState("15");
  const [chugliCreatorAlias, setChugliCreatorAlias] = useState(generateRandomAlias());
  const [chugliSelectedUserIds, setChugliSelectedUserIds] = useState<string[]>([]);
  const [chugliUserSearch, setChugliUserSearch] = useState("");
  const [creatingChugli, setCreatingChugli] = useState(false);

  // Live countdown ticker
  const [, setTimerTick] = useState(0);

  // Secret Anonymous Alias Prompt Modal
  const [showAliasModal, setShowAliasModal] = useState(false);
  const [targetChugliGroup, setTargetChugliGroup] = useState<GroupChat | null>(null);
  const [targetChugliInvite, setTargetChugliInvite] = useState<GroupInvitationInfo | null>(null);
  const [myAliasInput, setMyAliasInput] = useState(generateRandomAlias());
  const [settingAlias, setSettingAlias] = useState(false);

  // Admin 10-Minute Warning / Extend Modal
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [warningGroupInfo, setWarningGroupInfo] = useState<{
    groupId: string;
    groupName: string;
    remainingMinutes: number;
    expiresAt?: string;
  } | null>(null);
  const [extendingSession, setExtendingSession] = useState(false);

  // Invite Members Modal State (inside existing group)
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteUserIds, setInviteUserIds] = useState<string[]>([]);
  const [inviteSearchQuery, setInviteSearchQuery] = useState("");
  const [inviting, setInviting] = useState(false);

  // Group Members Info Modal
  const [showMembersModal, setShowMembersModal] = useState(false);

  const flatListRef = useRef<FlatList<ChatMessage>>(null);

  // Live timer interval to tick countdowns and auto-prune expired Chugli sessions every second
  useEffect(() => {
    const timer = setInterval(() => {
      setTimerTick(Date.now());
      setActiveGroup((curr) => {
        if (curr?.isChugli && curr.expiresAt && Date.now() >= new Date(curr.expiresAt).getTime()) {
          setGroups((prev) => prev.filter((g) => g.id !== curr.id));
          setShowWarningModal(false);
          setShowMembersModal(false);
          setBannerError(`💥 Chugli group "${curr.name}" time expired and self-destructed.`);
          return null;
        }
        return curr;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Request notifications permission on start
  useEffect(() => {
    requestNotificationPermission().catch(() => {});
  }, []);

  // Initial load of groups, invitations, messages, and registered users
  useEffect(() => {
    if (!currentUser) return;

    let isMounted = true;

    Promise.all([
      fetchGroups(currentUser.id),
      fetchUserInvitations(currentUser.id),
      fetchMessageHistory(),
      fetchAllUsers(),
    ])
      .then(([loadedGroups, loadedInvites, loadedMessages, users]) => {
        if (!isMounted) return;
        setGroups(loadedGroups);
        setPendingInvitations(loadedInvites);
        setMessages(loadedMessages);
        setRegisteredUsers(users);
        setLoadingGroups(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.warn("Error loading groups & invites:", err.message);
        setBannerError("Unable to load latest groups and invitations.");
        setLoadingGroups(false);
      });

    const unsubStatus = socketService.subscribeToStatus((status) => {
      if (!isMounted) return;
      setConnectionStatus(status);
      if (status === "connected") setBannerError(null);
    });

    const unsubPresence = socketService.subscribeToPresence((ids) => {
      if (!isMounted) return;
      setOnlineUserIds(ids);
    });

    const unsubReadReceipts = socketService.subscribeToReadReceipts(({ messageIds, reader }) => {
      if (!isMounted) return;
      setMessages((prev) =>
        prev.map((msg) => {
          if (messageIds.includes(msg.id)) {
            const alreadyHasReader = msg.reads.some((r) => r.userId === reader.userId);
            if (alreadyHasReader) return msg;
            return {
              ...msg,
              reads: [...msg.reads, reader],
            };
          }
          return msg;
        })
      );
    });

    const unsubMessages = socketService.subscribeToMessages((newMsg) => {
      if (!isMounted) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    });

    // Real-time group creation and member updates
    const unsubGroups = socketService.subscribeToGroups((group) => {
      if (!isMounted) return;
      setGroups((prev) => {
        const index = prev.findIndex((g) => g.id === group.id);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = group;
          return updated;
        }
        return [group, ...prev];
      });

      setActiveGroup((current) => (current && current.id === group.id ? group : current));
    });

    // Real-time invitation received
    const unsubInvitations = socketService.subscribeToInvitations((invitation) => {
      if (!isMounted) return;
      if (invitation.senderId === currentUser.id) return; // ignore self-sent
      setPendingInvitations((prev) => {
        if (prev.some((i) => i.id === invitation.id)) return prev;
        return [invitation, ...prev];
      });
      setBannerSuccess(`You received an invitation to join "${invitation.groupName}"!`);
      setTimeout(() => setBannerSuccess(null), 4500);
    });

    // Real-time Chugli 10-minute warning
    const unsubWarning = socketService.subscribeToChugliWarning((data) => {
      if (!isMounted) return;
      sendChugliWarningNotification(data.groupName, data.remainingMinutes);
      setWarningGroupInfo(data);
      setShowWarningModal(true);
    });

    // Real-time Chugli session extended
    const unsubExtended = socketService.subscribeToChugliExtended((data) => {
      if (!isMounted) return;
      setGroups((prev) =>
        prev.map((g) => (g.id === data.group.id ? data.group : g))
      );
      setActiveGroup((curr) =>
        curr && curr.id === data.group.id ? data.group : curr
      );
      setBannerSuccess(`Chugli session for "${data.group.name}" extended!`);
      setTimeout(() => setBannerSuccess(null), 4000);
      setShowWarningModal(false);
    });

    // Real-time Chugli session expired & deleted
    const unsubExpired = socketService.subscribeToChugliExpired((data) => {
      if (!isMounted) return;
      setGroups((prev) => prev.filter((g) => g.id !== data.groupId));
      setActiveGroup((curr) => {
        if (curr && curr.id === data.groupId) {
          setBannerError(`💥 Chugli group "${data.groupName}" time expired and self-destructed.`);
          return null;
        }
        return curr;
      });
      setShowWarningModal(false);
    });

    const unsubDeleted = socketService.subscribeToMessageDeleted((data) => {
      if (!isMounted) return;
      if (data.deleteFor === "me") {
        if (data.deletedByUserId === currentUser.id) {
          setMessages((prev) => prev.filter((m) => m.id !== data.messageId));
        }
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === data.messageId
              ? {
                  ...m,
                  isDeletedForEveryone: true,
                  deletedByUserId: data.deletedByUserId,
                  deletedByUsername: data.deletedByUsername || "user",
                }
              : m
          )
        );
      }
    });

    const unsubEdited = socketService.subscribeToMessageEdited((data) => {
      if (!isMounted) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === data.messageId
            ? { ...m, text: data.text, isEdited: true, editedAt: data.editedAt }
            : m
        )
      );
    });

    return () => {
      isMounted = false;
      unsubStatus();
      unsubPresence();
      unsubReadReceipts();
      unsubMessages();
      unsubDeleted();
      unsubEdited();
      unsubGroups();
      unsubInvitations();
      unsubWarning();
      unsubExtended();
      unsubExpired();
    };
  }, [currentUser, setRegisteredUsers]);

  // Automatically mark unread messages in active group as read
  useEffect(() => {
    if (!currentUser || !activeGroup || messages.length === 0) return;

    const unreadInActiveGroup = messages
      .filter(
        (m) =>
          m.groupId === activeGroup.id &&
          m.senderId !== currentUser.id &&
          !m.reads.some((r) => r.userId === currentUser.id)
      )
      .map((m) => m.id);

    if (unreadInActiveGroup.length > 0) {
      socketService.markMessagesAsRead(unreadInActiveGroup);
    }
  }, [messages, currentUser, activeGroup]);

  // Fetch group messages whenever activeGroup opens or changes
  useEffect(() => {
    if (!currentUser || !activeGroup) return;

    let isCurrent = true;

    fetchMessageHistory({ groupId: activeGroup.id })
      .then((history) => {
        if (!isCurrent) return;
        setMessages((prev) => {
          const others = prev.filter((m) => m.groupId !== activeGroup.id);
          return [...others, ...history];
        });
      })
      .catch((err) => {
        if (!isCurrent) return;
        console.warn("Failed to fetch group message history:", err);
      });

    return () => {
      isCurrent = false;
    };
  }, [activeGroup, currentUser]);

  // Handle Send Message to Group
  const handleSendGroupMessage = async (text: string) => {
    if (!activeGroup) return;
    try {
      setBannerError(null);
      await socketService.sendMessage(text, { groupId: activeGroup.id });
    } catch (err: any) {
      setBannerError(err.message || "Failed to deliver group message.");
      throw err;
    }
  };

  // Handle Delete Message in Group
  const handleDeleteMessage = async (message: ChatMessage, deleteFor: "me" | "everyone") => {
    if (!currentUser) return;
    try {
      if (deleteFor === "me") {
        setMessages((prev) => prev.filter((m) => m.id !== message.id));
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === message.id
              ? {
                  ...m,
                  isDeletedForEveryone: true,
                  deletedByUserId: currentUser.id,
                  deletedByUsername: currentUser.username,
                }
              : m
          )
        );
      }
      await socketService.deleteMessage(message.id, deleteFor);
    } catch (err: any) {
      console.warn("Failed to delete group message:", err.message);
      setBannerError(err.message || "Failed to delete message");
    }
  };

  // Handle Edit Message in Group (within 5 minutes)
  const handleEditMessage = async (message: ChatMessage, newText: string) => {
    if (!currentUser) return;
    try {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === message.id
            ? {
                ...m,
                text: newText,
                isEdited: true,
                editedAt: new Date().toISOString(),
              }
            : m
        )
      );
      await socketService.editMessage(message.id, newText);
    } catch (err: any) {
      console.warn("Failed to edit group message:", err.message);
      setBannerError(err.message || "Failed to edit message");
      throw err;
    }
  };

  // Toggle user selection in Create Group
  const toggleSelectUser = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  // Toggle user selection in Invite Modal
  const toggleInviteUser = (userId: string) => {
    setInviteUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  // Handle Create Group Submission with Invitations
  const handleCreateGroupSubmit = async () => {
    if (!currentUser) return;
    const cleanName = newGroupName.trim();
    if (!cleanName || cleanName.length < 2) {
      setBannerError("Please enter a group name (at least 2 characters).");
      return;
    }

    try {
      setCreatingGroup(true);
      setBannerError(null);

      const newGroup = await createGroup({
        name: cleanName,
        description: newGroupDescription.trim() || undefined,
        createdById: currentUser.id,
        inviteUserIds: selectedUserIds,
      });

      setGroups((prev) => [newGroup, ...prev]);
      setShowCreateModal(false);
      setNewGroupName("");
      setNewGroupDescription("");
      setSelectedUserIds([]);
      setActiveGroup(newGroup);

      if (selectedUserIds.length > 0) {
        setBannerSuccess(`Group created! Sent invitations to ${selectedUserIds.length} user(s).`);
        setTimeout(() => setBannerSuccess(null), 4000);
      }
    } catch (err: any) {
      setBannerError(err.message || "Failed to create group.");
    } finally {
      setCreatingGroup(false);
    }
  };

  // Handle Send Invitations to Active Group
  const handleInviteSubmit = async () => {
    if (!activeGroup || !currentUser || inviteUserIds.length === 0) return;

    try {
      setInviting(true);
      setBannerError(null);

      const updatedGroup = await inviteGroupMembers({
        groupId: activeGroup.id,
        senderId: currentUser.id,
        memberUserIds: inviteUserIds,
      });

      setActiveGroup(updatedGroup);
      setGroups((prev) =>
        prev.map((g) => (g.id === updatedGroup.id ? updatedGroup : g))
      );
      setShowInviteModal(false);
      setInviteUserIds([]);

      setBannerSuccess(`Invitations sent to ${inviteUserIds.length} user(s) to join #${activeGroup.name}!`);
      setTimeout(() => setBannerSuccess(null), 4000);
    } catch (err: any) {
      setBannerError(err.message || "Failed to send invitations.");
    } finally {
      setInviting(false);
    }
  };

  // Open Chugli Creation Modal
  const handleOpenChugliModal = () => {
    setChugliName("");
    setChugliDurationPreset("10");
    setChugliCustomDuration("15");
    setChugliCreatorAlias(generateRandomAlias());
    setChugliSelectedUserIds([]);
    setChugliUserSearch("");
    setShowChugliModal(true);
  };

  // Toggle user selection in Chugli creation
  const toggleChugliSelectUser = (userId: string) => {
    setChugliSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  // Handle Create Chugli Group Submission
  const handleCreateChugliSubmit = async () => {
    if (!currentUser) return;
    const cleanName = chugliName.trim();
    if (!cleanName || cleanName.length < 2) {
      setBannerError("Please enter a group name or topic for Chugli (at least 2 characters).");
      return;
    }

    let duration = 10;
    if (chugliDurationPreset === "1") duration = 1;
    else if (chugliDurationPreset === "5") duration = 5;
    else if (chugliDurationPreset === "10") duration = 10;
    else if (chugliDurationPreset === "30") duration = 30;
    else if (chugliDurationPreset === "60") duration = 60;
    else {
      const parsed = parseInt(chugliCustomDuration.trim(), 10);
      duration = isNaN(parsed) || parsed < 1 ? 10 : Math.min(parsed, 1440);
    }

    const cleanAlias = chugliCreatorAlias.trim() || generateRandomAlias();

    try {
      setCreatingChugli(true);
      setBannerError(null);

      const newGroup = await createGroup({
        name: cleanName,
        createdById: currentUser.id,
        inviteUserIds: chugliSelectedUserIds,
        isChugli: true,
        durationMinutes: duration,
        creatorAlias: cleanAlias,
      });

      setGroups((prev) => [newGroup, ...prev]);
      setShowChugliModal(false);
      setActiveGroup(newGroup);

      const inviteMsg =
        chugliSelectedUserIds.length > 0
          ? ` Sent invitations to ${chugliSelectedUserIds.length} user(s).`
          : "";
      setBannerSuccess(`🤫 Chugli group "${newGroup.name}" created! Closes in ${duration} mins.${inviteMsg}`);
      setTimeout(() => setBannerSuccess(null), 4500);
    } catch (err: any) {
      setBannerError(err.message || "Failed to create Chugli group.");
    } finally {
      setCreatingChugli(false);
    }
  };

  // Select a group from the list (prompts for anonymous alias if not set in Chugli)
  const handleSelectGroup = (group: GroupChat) => {
    if (!currentUser) return;
    if (group.isChugli) {
      const myMember = group.members.find((m) => m.userId === currentUser.id);
      if (!myMember?.anonymousAlias) {
        setTargetChugliGroup(group);
        setTargetChugliInvite(null);
        setMyAliasInput(generateRandomAlias());
        setShowAliasModal(true);
        return;
      }
    }
    setActiveGroup(group);
  };

  // Handle Respond to Invitation (with alias prompt for Chugli)
  const handleInitiateRespondInvitation = (
    invitation: GroupInvitationInfo,
    response: "accept" | "decline"
  ) => {
    if (response === "decline") {
      handleRespondInvitation(invitation, "decline");
      return;
    }

    if (invitation.isChugli) {
      setTargetChugliInvite(invitation);
      setTargetChugliGroup(null);
      setMyAliasInput(generateRandomAlias());
      setShowAliasModal(true);
    } else {
      handleRespondInvitation(invitation, "accept");
    }
  };

  // Confirm Secret Alias for joining/entering Chugli
  const handleConfirmAlias = async () => {
    if (!currentUser) return;
    const cleanAlias = myAliasInput.trim() || generateRandomAlias();

    try {
      setSettingAlias(true);
      setBannerError(null);

      if (targetChugliInvite) {
        const joinedGroup = await respondToGroupInvitation(
          targetChugliInvite.id,
          currentUser.id,
          "accept",
          cleanAlias
        );
        setPendingInvitations((prev) => prev.filter((i) => i.id !== targetChugliInvite.id));
        setGroups((prev) => {
          const idx = prev.findIndex((g) => g.id === joinedGroup.id);
          if (idx >= 0) {
            const copy = [...prev];
            copy[idx] = joinedGroup;
            return copy;
          }
          return [joinedGroup, ...prev];
        });
        setActiveGroup(joinedGroup);
        setShowAliasModal(false);
        setBannerSuccess(`Joined 🤫 #${joinedGroup.name} as "${cleanAlias}"!`);
        setTimeout(() => setBannerSuccess(null), 4000);
      } else if (targetChugliGroup) {
        const updatedGroup = await setChugliMemberAlias(
          targetChugliGroup.id,
          currentUser.id,
          cleanAlias
        );
        setGroups((prev) =>
          prev.map((g) => (g.id === updatedGroup.id ? updatedGroup : g))
        );
        setActiveGroup(updatedGroup);
        setShowAliasModal(false);
        setBannerSuccess(`Secret identity set to "${cleanAlias}"!`);
        setTimeout(() => setBannerSuccess(null), 3000);
      }
    } catch (err: any) {
      setBannerError(err.message || "Failed to set secret alias.");
    } finally {
      setSettingAlias(false);
    }
  };

  // Extend Chugli session by additional minutes (Admin)
  const handleExtendChugli = async (groupId: string, additionalMinutes: number) => {
    if (!currentUser) return;
    try {
      setExtendingSession(true);
      setBannerError(null);
      const updatedGroup = await extendChugliSession(groupId, currentUser.id, additionalMinutes);
      setGroups((prev) =>
        prev.map((g) => (g.id === updatedGroup.id ? updatedGroup : g))
      );
      if (activeGroup?.id === updatedGroup.id) {
        setActiveGroup(updatedGroup);
      }
      setShowWarningModal(false);
      setBannerSuccess(`Session extended by +${additionalMinutes} mins!`);
      setTimeout(() => setBannerSuccess(null), 4000);
    } catch (err: any) {
      setBannerError(err.message || "Failed to extend Chugli session.");
    } finally {
      setExtendingSession(false);
    }
  };

  // End and permanently delete Chugli session (Admin)
  const handleEndChugli = async (groupId: string) => {
    if (!currentUser) return;
    try {
      setExtendingSession(true);
      setBannerError(null);
      await endChugliSession(groupId, currentUser.id);
      setGroups((prev) => prev.filter((g) => g.id !== groupId));
      if (activeGroup?.id === groupId) {
        setActiveGroup(null);
      }
      setShowWarningModal(false);
      setBannerSuccess("Chugli session ended and deleted.");
      setTimeout(() => setBannerSuccess(null), 4000);
    } catch (err: any) {
      setBannerError(err.message || "Failed to end session.");
    } finally {
      setExtendingSession(false);
    }
  };

  // Handle Respond to Invitation (Accept or Decline)
  const handleRespondInvitation = async (
    invitation: GroupInvitationInfo,
    response: "accept" | "decline"
  ) => {
    if (!currentUser) return;

    // Optimistically remove from pending invitations
    setPendingInvitations((prev) => prev.filter((i) => i.id !== invitation.id));

    try {
      setBannerError(null);
      const joinedGroup = await respondToGroupInvitation(
        invitation.id,
        currentUser.id,
        response
      );

      if (response === "accept") {
        setGroups((prev) => {
          const index = prev.findIndex((g) => g.id === joinedGroup.id);
          if (index >= 0) {
            const updated = [...prev];
            updated[index] = joinedGroup;
            return updated;
          }
          return [joinedGroup, ...prev];
        });
        setActiveGroup(joinedGroup);
        setBannerSuccess(`You joined #${joinedGroup.name}!`);
        setTimeout(() => setBannerSuccess(null), 4000);
      } else {
        setBannerSuccess(`Declined invitation to join "${invitation.groupName}".`);
        setTimeout(() => setBannerSuccess(null), 3000);
      }
    } catch (err: any) {
      setBannerError(err.message || "Failed to respond to invitation.");
      // Rollback on error
      setPendingInvitations((prev) => [invitation, ...prev]);
    }
  };

  if (!currentUser) return null;

  const otherUsers = registeredUsers.filter((u) => u.id !== currentUser.id);

  // Filter users for Create Group
  const filteredUsersForCreate = otherUsers.filter((u) => {
    const q = userSearchQuery.toLowerCase().trim();
    if (!q) return true;
    return u.name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q);
  });

  // Filter users for Chugli Group
  const filteredUsersForChugli = otherUsers.filter((u) => {
    const q = chugliUserSearch.toLowerCase().trim();
    if (!q) return true;
    return u.name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q);
  });

  // Filter users for Invite to existing group (exclude existing members & pending invitees)
  const existingMemberIds = activeGroup ? activeGroup.members.map((m) => m.userId) : [];
  const pendingInviteUserIds = activeGroup?.pendingInvitations
    ? activeGroup.pendingInvitations.map((p) => p.userId)
    : [];
  const nonMembers = otherUsers.filter(
    (u) => !existingMemberIds.includes(u.id) && !pendingInviteUserIds.includes(u.id)
  );
  const filteredNonMembers = nonMembers.filter((u) => {
    const q = inviteSearchQuery.toLowerCase().trim();
    if (!q) return true;
    return u.name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q);
  });

  // Filtered groups
  const filteredGroups = groups.filter((g) => {
    const q = groupSearchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      g.name.toLowerCase().includes(q) ||
      (g.description && g.description.toLowerCase().includes(q))
    );
  });

  // Messages in active group
  const groupMessages = activeGroup
    ? messages.filter((m) => m.groupId === activeGroup.id)
    : [];

  // Active Group Chugli helpers
  const activeChugliTimer = activeGroup?.isChugli
    ? formatCountdown(activeGroup.expiresAt)
    : null;
  const myChugliMember = activeGroup?.members.find((m) => m.userId === currentUser.id);
  const myChugliAlias = myChugliMember?.anonymousAlias || "Anonymous";

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      {/* View 1: Active Group Chat Room */}
      {activeGroup ? (
        <View style={styles.flexContainer}>
          {/* Group Chat Header */}
          <View style={styles.groupHeader}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => setActiveGroup(null)}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={20} color="#0F172A" />
              <Text style={styles.backBtnText}>Groups</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.groupHeaderInfo}
              onPress={() => setShowMembersModal(true)}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.groupAvatarMini,
                  activeGroup.isChugli && styles.groupAvatarMiniChugli,
                ]}
              >
                <Text style={styles.groupAvatarMiniText}>
                  {activeGroup.isChugli ? "🤫" : activeGroup.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View>
                <View style={styles.groupTitleRow}>
                  <Text style={styles.groupHeaderTitle} numberOfLines={1}>
                    {activeGroup.name}
                  </Text>
                  {activeGroup.isChugli ? (
                    <View style={styles.chugliHeaderBadge}>
                      <Text style={styles.chugliHeaderBadgeText}>🤫 Chugli</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.groupHeaderSub}>
                  {activeGroup.isChugli
                    ? `🕵️ Anonymous room • ${activeGroup.members.length} members`
                    : `👥 ${activeGroup.members.length} members • Tap for details`}
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.inviteHeaderBtn}
              onPress={() => setShowInviteModal(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="add" size={16} color="#2563EB" />
              <Text style={styles.inviteHeaderBtnText}>Invite</Text>
            </TouchableOpacity>
          </View>

          {/* Chugli Live Banner (Active Countdown & Secret Alias) */}
          {activeGroup.isChugli ? (
            <View style={styles.chugliTopBanner}>
              <View style={styles.chugliBannerLeft}>
                <View style={styles.chugliPillBadge}>
                  <Text style={styles.chugliPillEmoji}>🤫</Text>
                  <Text style={styles.chugliPillText}>Chugli Group</Text>
                </View>
                <View
                  style={[
                    styles.countdownPill,
                    activeChugliTimer?.isWarning && styles.countdownPillWarning,
                  ]}
                >
                  <Ionicons
                    name={activeChugliTimer?.isWarning ? "alert-circle" : "time-outline"}
                    size={14}
                    color={activeChugliTimer?.isWarning ? "#DC2626" : "#7C3AED"}
                  />
                  <Text
                    style={[
                      styles.countdownText,
                      activeChugliTimer?.isWarning && styles.countdownTextWarning,
                    ]}
                  >
                    {activeChugliTimer?.isExpired
                      ? "Expired"
                      : `Ends in ${activeChugliTimer?.text}`}
                  </Text>
                </View>
              </View>

              <View style={styles.chugliBannerRight}>
                <TouchableOpacity
                  style={styles.aliasDisplayPill}
                  onPress={() => {
                    setTargetChugliGroup(activeGroup);
                    setTargetChugliInvite(null);
                    setMyAliasInput(myChugliAlias);
                    setShowAliasModal(true);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.aliasDisplayLabel}>You:</Text>
                  <Text style={styles.aliasDisplayText} numberOfLines={1}>
                    🕵️ {myChugliAlias}
                  </Text>
                </TouchableOpacity>

                {activeGroup.createdById === currentUser.id ? (
                  <View style={styles.adminActionGroup}>
                    <TouchableOpacity
                      style={styles.extendBannerBtn}
                      onPress={() => {
                        setWarningGroupInfo({
                          groupId: activeGroup.id,
                          groupName: activeGroup.name,
                          remainingMinutes: activeChugliTimer?.minutesLeft || 10,
                          expiresAt: activeGroup.expiresAt,
                        });
                        setShowWarningModal(true);
                      }}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="time" size={13} color="#FFFFFF" />
                      <Text style={styles.extendBannerBtnText}>Extend</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.endBannerBtn}
                      onPress={() => handleEndChugli(activeGroup.id)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="stop-circle-outline" size={13} color="#EF4444" />
                      <Text style={styles.endBannerBtnText}>End</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}

          {/* Group Topic/Description Banner */}
          {activeGroup.description ? (
            <View style={styles.topicBanner}>
              <Ionicons name="information-circle-outline" size={15} color="#2563EB" />
              <Text style={styles.topicBannerText} numberOfLines={1}>
                {activeGroup.description}
              </Text>
            </View>
          ) : null}

          {/* Success Banner */}
          {bannerSuccess ? (
            <View style={styles.successBanner}>
              <Ionicons name="checkmark-circle" size={16} color="#166534" />
              <Text style={styles.successBannerText}>{bannerSuccess}</Text>
            </View>
          ) : null}

          {/* Error Banner */}
          {bannerError ? (
            <ErrorBanner
              message={bannerError}
              onRetry={() => socketService.connect(currentUser)}
              onDismiss={() => setBannerError(null)}
            />
          ) : null}

          {/* Group Messages Stream */}
          <KeyboardAvoidingView
            style={styles.keyboardContainer}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
          >
            <FlatList
              ref={flatListRef}
              data={groupMessages}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <ChatBubble
                  message={item}
                  isMe={item.senderId === currentUser.id}
                  currentUserId={currentUser.id}
                  members={activeGroup.members}
                  users={registeredUsers}
                  isChugli={activeGroup.isChugli}
                  onDelete={handleDeleteMessage}
                  onEdit={handleEditMessage}
                />
              )}
              contentContainerStyle={[
                styles.listContent,
                groupMessages.length === 0 ? styles.emptyListContent : null,
              ]}
              ListEmptyComponent={
                <EmptyState
                  title={
                    activeGroup.isChugli
                      ? `Welcome to 🤫 #${activeGroup.name}`
                      : `Welcome to #${activeGroup.name}`
                  }
                  subtitle={
                    activeGroup.isChugli
                      ? `This is a secret temporary group. Real names are hidden and messages will self-destruct once the timer ends!`
                      : "This group chat is ready. Say hello or invite more teammates to join!"
                  }
                />
              }
              onContentSizeChange={() => {
                if (groupMessages.length > 0) {
                  flatListRef.current?.scrollToEnd({ animated: false });
                }
              }}
            />

            {/* Group Message Input */}
            <ChatInput
              onSend={handleSendGroupMessage}
              disabled={connectionStatus !== "connected"}
              placeholder={
                activeGroup.isChugli
                  ? `Chat secretly as 🕵️ ${myChugliAlias}...`
                  : `Message #${activeGroup.name}...`
              }
            />
          </KeyboardAvoidingView>
        </View>
      ) : (
        /* View 2: Groups Hub & Directory */
        <View style={styles.flexContainer}>
          {/* Top Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.appIconBadge}>
                <Ionicons name="people" size={20} color="#2563EB" />
              </View>
              <View>
                <Text style={styles.headerTitle}>Groups</Text>
                <Text style={styles.headerSubtitle}>
                  Chat & invite teammates
                </Text>
              </View>
            </View>

            {/* Top Bar Action Buttons: 🤫 Chugli and + New Group */}
            <View style={styles.headerActionBtns}>
              <TouchableOpacity
                style={styles.headerChugliBtn}
                onPress={handleOpenChugliModal}
                activeOpacity={0.8}
                accessibilityLabel="Open Chugli Modal"
              >
                <Text style={styles.headerChugliEmoji}>🤫</Text>
                <Text style={styles.headerChugliBtnText}>Chugli</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.headerCreateBtn}
                onPress={() => setShowCreateModal(true)}
                activeOpacity={0.8}
                accessibilityLabel="Create New Group"
              >
                <Ionicons name="add" size={16} color="#FFFFFF" />
                <Text style={styles.headerCreateBtnText}>New Group</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Search Groups */}
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={16} color="#94A3B8" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search my groups..."
              placeholderTextColor="#94A3B8"
              value={groupSearchQuery}
              onChangeText={setGroupSearchQuery}
            />
            {groupSearchQuery.length > 0 ? (
              <TouchableOpacity onPress={() => setGroupSearchQuery("")}>
                <Ionicons name="close-circle" size={16} color="#94A3B8" />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Success Banner */}
          {bannerSuccess ? (
            <View style={styles.successBanner}>
              <Ionicons name="checkmark-circle" size={16} color="#166534" />
              <Text style={styles.successBannerText}>{bannerSuccess}</Text>
            </View>
          ) : null}

          {/* Error Banner */}
          {bannerError ? (
            <ErrorBanner
              message={bannerError}
              onRetry={() => socketService.connect(currentUser)}
              onDismiss={() => setBannerError(null)}
            />
          ) : null}

          {/* SECTION: Pending Group Invitations Received */}
          {pendingInvitations.length > 0 ? (
            <View style={styles.invitationsSection}>
              <View style={styles.invitationsHeaderRow}>
                <View style={styles.invitationIconBadge}>
                  <Ionicons name="megaphone" size={14} color="#EA580C" />
                </View>
                <Text style={styles.invitationsHeaderTitle}>
                  Pending Group Invitations ({pendingInvitations.length})
                </Text>
              </View>

              {pendingInvitations.map((inv) => (
                <View
                  key={inv.id}
                  style={[
                    styles.invitationCard,
                    inv.isChugli && styles.invitationCardChugli,
                  ]}
                >
                  <View style={styles.invitationTopLine}>
                    <View style={styles.invitationTitleRow}>
                      <Text style={styles.invitationGroupName}>#{inv.groupName}</Text>
                      {inv.isChugli ? (
                        <View style={styles.chugliPillBadgeSmall}>
                          <Text style={styles.chugliPillBadgeSmallText}>🤫 Chugli</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.invitationTime}>
                      {new Date(inv.createdAt).toLocaleDateString()}
                    </Text>
                  </View>

                  <Text style={styles.invitationInviter}>
                    Invited by <Text style={styles.boldText}>{inv.senderName}</Text> (@{inv.senderUsername})
                  </Text>

                  {inv.groupDescription ? (
                    <Text style={styles.invitationDesc} numberOfLines={1}>
                      {inv.groupDescription}
                    </Text>
                  ) : null}

                  {inv.isChugli ? (
                    <Text style={styles.invitationChugliNotice}>
                      🤫 This is a secret temporary group. You will choose an anonymous alias before joining!
                    </Text>
                  ) : null}

                  <View style={styles.invitationActionsRow}>
                    <TouchableOpacity
                      style={styles.declineBtn}
                      onPress={() => handleInitiateRespondInvitation(inv, "decline")}
                    >
                      <Text style={styles.declineBtnText}>Decline</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.acceptBtn, inv.isChugli && styles.acceptBtnChugli]}
                      onPress={() => handleInitiateRespondInvitation(inv, "accept")}
                    >
                      <Ionicons
                        name={inv.isChugli ? "shield-checkmark" : "checkmark-circle"}
                        size={16}
                        color="#FFFFFF"
                      />
                      <Text style={styles.acceptBtnText}>
                        {inv.isChugli ? "Join Secretly" : "Accept & Join"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {/* Groups List */}
          {loadingGroups ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#2563EB" />
              <Text style={styles.loadingText}>Loading your groups...</Text>
            </View>
          ) : (
            <FlatList
              data={filteredGroups}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.groupsListContent}
              renderItem={({ item }) => {
                const onlineCount = item.members.filter((m) =>
                  onlineUserIds.includes(m.userId)
                ).length;
                const isChugli = Boolean(item.isChugli);
                const countdown = isChugli ? formatCountdown(item.expiresAt) : null;

                return (
                  <TouchableOpacity
                    style={[styles.groupCard, isChugli && styles.groupCardChugli]}
                    onPress={() => handleSelectGroup(item)}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.groupAvatar,
                        isChugli && styles.groupAvatarChugli,
                      ]}
                    >
                      <Text
                        style={[
                          styles.groupAvatarText,
                          isChugli && styles.groupAvatarTextChugli,
                        ]}
                      >
                        {isChugli ? "🤫" : item.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>

                    <View style={styles.groupInfo}>
                      <View style={styles.groupTopRow}>
                        <View style={styles.groupCardNameRow}>
                          <Text style={styles.groupName} numberOfLines={1}>
                            {item.name}
                          </Text>
                          {isChugli ? (
                            <View style={styles.chugliListBadge}>
                              <Text style={styles.chugliListBadgeText}>Chugli</Text>
                            </View>
                          ) : null}
                        </View>

                        {isChugli && countdown ? (
                          <View
                            style={[
                              styles.timerCardBadge,
                              countdown.isWarning && styles.timerCardBadgeWarning,
                            ]}
                          >
                            <Ionicons
                              name={countdown.isWarning ? "alert-circle" : "time-outline"}
                              size={11}
                              color={countdown.isWarning ? "#DC2626" : "#7C3AED"}
                            />
                            <Text
                              style={[
                                styles.timerCardBadgeText,
                                countdown.isWarning && styles.timerCardBadgeTextWarning,
                              ]}
                            >
                              {countdown.isExpired ? "Expired" : `${countdown.text}`}
                            </Text>
                          </View>
                        ) : (
                          <View style={styles.membersBadge}>
                            <Ionicons name="people" size={12} color="#2563EB" />
                            <Text style={styles.membersBadgeText}>
                              {item.members.length} members
                            </Text>
                          </View>
                        )}
                      </View>

                      {item.description ? (
                        <Text style={styles.groupDesc} numberOfLines={1}>
                          {item.description}
                        </Text>
                      ) : null}

                      <View style={styles.groupBottomRow}>
                        <Text style={styles.groupLastMsg} numberOfLines={1}>
                          {item.lastMessage || (isChugli ? "Secret chat • Tap to enter" : "No messages yet • Tap to chat")}
                        </Text>
                        <Text style={styles.onlineMembersText}>
                          🟢 {onlineCount} online
                        </Text>
                      </View>
                    </View>

                    <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="people-outline" size={48} color="#CBD5E1" />
                  <Text style={styles.emptyTitle}>No groups yet</Text>
                  <Text style={styles.emptySub}>
                    Create a group or start a secret Chugli session with your friends!
                  </Text>
                  <View style={styles.emptyBtnRow}>
                    <TouchableOpacity
                      style={styles.chugliHeaderBtn}
                      onPress={handleOpenChugliModal}
                    >
                      <Text style={styles.chugliHeaderEmoji}>🤫</Text>
                      <Text style={styles.chugliHeaderText}>Start Chugli</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.createEmptyBtn}
                      onPress={() => setShowCreateModal(true)}
                    >
                      <Ionicons name="add" size={16} color="#FFFFFF" />
                      <Text style={styles.createEmptyBtnText}>Create Group</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              }
            />
          )}
        </View>
      )}

      {/* MODAL 1: Create Group Chat & Send Invitations */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <SafeAreaView style={styles.modalSafeArea}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={() => setShowCreateModal(false)}
              style={styles.modalCloseBtn}
            >
              <Ionicons name="close" size={22} color="#0F172A" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Create Group</Text>
            <TouchableOpacity
              style={[
                styles.modalHeaderAction,
                (!newGroupName.trim() || creatingGroup) && styles.btnDisabled,
              ]}
              onPress={handleCreateGroupSubmit}
              disabled={!newGroupName.trim() || creatingGroup}
            >
              {creatingGroup ? (
                <ActivityIndicator size="small" color="#2563EB" />
              ) : (
                <Text style={styles.modalHeaderActionText}>Create & Invite</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.modalBody}
            keyboardShouldPersistTaps="handled"
          >
            {/* Group Name & Description Inputs */}
            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Group Name *</Text>
              <TextInput
                style={styles.formTextInput}
                placeholder="e.g. Design Squad, Tech Leads..."
                placeholderTextColor="#94A3B8"
                value={newGroupName}
                onChangeText={setNewGroupName}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Description (Optional)</Text>
              <TextInput
                style={styles.formTextInput}
                placeholder="What is this group for?"
                placeholderTextColor="#94A3B8"
                value={newGroupDescription}
                onChangeText={setNewGroupDescription}
              />
            </View>

            {/* Invite Users to Chat Section */}
            <View style={styles.inviteSection}>
              <View style={styles.inviteSectionHeader}>
                <View>
                  <Text style={styles.inviteSectionTitle}>Send Invitations to Users</Text>
                  <Text style={styles.inviteSectionSub}>
                    Invited users will receive an invitation to join this group
                  </Text>
                </View>
                <Text style={styles.selectedCountText}>
                  {selectedUserIds.length} selected
                </Text>
              </View>

              {/* User search */}
              <View style={styles.modalSearchBox}>
                <Ionicons name="search" size={15} color="#94A3B8" style={{ marginRight: 6 }} />
                <TextInput
                  style={styles.modalSearchInput}
                  placeholder="Search registered users to invite..."
                  placeholderTextColor="#94A3B8"
                  value={userSearchQuery}
                  onChangeText={setUserSearchQuery}
                />
              </View>

              {/* Selected User Chips */}
              {selectedUserIds.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipsScroll}
                >
                  {selectedUserIds.map((uid) => {
                    const u = registeredUsers.find((user) => user.id === uid);
                    if (!u) return null;
                    return (
                      <TouchableOpacity
                        key={uid}
                        style={styles.userChip}
                        onPress={() => toggleSelectUser(uid)}
                      >
                        <Text style={styles.userChipText}>{u.name.split(" ")[0]}</Text>
                        <Ionicons name="close-circle" size={14} color="#2563EB" />
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              ) : null}

              {/* Users Checklist */}
              <View style={styles.userChecklist}>
                {filteredUsersForCreate.map((u) => {
                  const isSelected = selectedUserIds.includes(u.id);
                  const isOnline = onlineUserIds.includes(u.id);

                  return (
                    <TouchableOpacity
                      key={u.id}
                      style={[styles.userCheckRow, isSelected && styles.userCheckRowSelected]}
                      onPress={() => toggleSelectUser(u.id)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.userCheckAvatar}>
                        <Text style={styles.userCheckAvatarText}>
                          {u.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>

                      <View style={styles.userCheckInfo}>
                        <View style={styles.userCheckNameRow}>
                          <Text style={styles.userCheckName}>{u.name}</Text>
                          <View
                            style={[
                              styles.userCheckStatusDot,
                              isOnline ? styles.dotOnline : styles.dotOffline,
                            ]}
                          />
                        </View>
                        <Text style={styles.userCheckUsername}>@{u.username}</Text>
                      </View>

                      <View
                        style={[
                          styles.checkboxCircle,
                          isSelected && styles.checkboxCircleSelected,
                        ]}
                      >
                        {isSelected ? (
                          <Ionicons name="checkmark-circle" size={20} color="#2563EB" />
                        ) : (
                          <View style={styles.checkboxEmpty} />
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* MODAL 2: Send Invitations to Active Group */}
      <Modal
        visible={showInviteModal}
        animationType="slide"
        onRequestClose={() => setShowInviteModal(false)}
      >
        <SafeAreaView style={styles.modalSafeArea}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={() => setShowInviteModal(false)}
              style={styles.modalCloseBtn}
            >
              <Ionicons name="close" size={22} color="#0F172A" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Invite to #{activeGroup?.name}</Text>
            <TouchableOpacity
              style={[
                styles.modalHeaderAction,
                (inviteUserIds.length === 0 || inviting) && styles.btnDisabled,
              ]}
              onPress={handleInviteSubmit}
              disabled={inviteUserIds.length === 0 || inviting}
            >
              {inviting ? (
                <ActivityIndicator size="small" color="#2563EB" />
              ) : (
                <Text style={styles.modalHeaderActionText}>
                  Send Invite ({inviteUserIds.length})
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.modalBody}>
            {/* Search */}
            <View style={styles.modalSearchBox}>
              <Ionicons name="search" size={15} color="#94A3B8" style={{ marginRight: 6 }} />
              <TextInput
                style={styles.modalSearchInput}
                placeholder="Search registered users..."
                placeholderTextColor="#94A3B8"
                value={inviteSearchQuery}
                onChangeText={setInviteSearchQuery}
              />
            </View>

            {filteredNonMembers.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="checkmark-circle" size={44} color="#22C55E" />
                <Text style={styles.emptyTitle}>All Users Already Invited</Text>
                <Text style={styles.emptySub}>
                  All registered contacts are already members or have pending invitations to this group!
                </Text>
              </View>
            ) : (
              <ScrollView style={{ flex: 1 }}>
                <View style={styles.userChecklist}>
                  {filteredNonMembers.map((u) => {
                    const isSelected = inviteUserIds.includes(u.id);
                    const isOnline = onlineUserIds.includes(u.id);

                    return (
                      <TouchableOpacity
                        key={u.id}
                        style={[
                          styles.userCheckRow,
                          isSelected && styles.userCheckRowSelected,
                        ]}
                        onPress={() => toggleInviteUser(u.id)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.userCheckAvatar}>
                          <Text style={styles.userCheckAvatarText}>
                            {u.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>

                        <View style={styles.userCheckInfo}>
                          <View style={styles.userCheckNameRow}>
                            <Text style={styles.userCheckName}>{u.name}</Text>
                            <View
                              style={[
                                styles.userCheckStatusDot,
                                isOnline ? styles.dotOnline : styles.dotOffline,
                              ]}
                            />
                          </View>
                          <Text style={styles.userCheckUsername}>@{u.username}</Text>
                        </View>

                        <View
                          style={[
                            styles.checkboxCircle,
                            isSelected && styles.checkboxCircleSelected,
                          ]}
                        >
                          {isSelected ? (
                            <Ionicons name="checkmark-circle" size={20} color="#2563EB" />
                          ) : (
                            <View style={styles.checkboxEmpty} />
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            )}
          </View>
        </SafeAreaView>
      </Modal>

      {/* MODAL 3: Group Members & Pending Invitations Sheet */}
      <Modal
        visible={showMembersModal}
        animationType="slide"
        onRequestClose={() => setShowMembersModal(false)}
      >
        <SafeAreaView style={styles.modalSafeArea}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={() => setShowMembersModal(false)}
              style={styles.modalCloseBtn}
            >
              <Ionicons name="close" size={22} color="#0F172A" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Group Details</Text>
            <TouchableOpacity
              onPress={() => {
                setShowMembersModal(false);
                setShowInviteModal(true);
              }}
            >
              <Text style={styles.modalHeaderActionText}>+ Invite Users</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>
            <View style={styles.groupHeroCard}>
              <View style={styles.groupAvatarLarge}>
                <Text style={styles.groupAvatarLargeText}>
                  {activeGroup?.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text style={styles.groupHeroTitle}>{activeGroup?.name}</Text>
              {activeGroup?.description ? (
                <Text style={styles.groupHeroDesc}>{activeGroup?.description}</Text>
              ) : null}
              <Text style={styles.groupHeroMeta}>
                Created {activeGroup?.createdAt ? new Date(activeGroup.createdAt).toLocaleDateString() : ""}
              </Text>
            </View>

            {/* Active Members */}
            <Text style={styles.membersListHeader}>
              Group Members ({activeGroup?.members.length || 0})
            </Text>

            <View style={styles.membersList}>
              {activeGroup?.members.map((m) => {
                const isOnline = onlineUserIds.includes(m.userId);
                const isMe = m.userId === currentUser.id;

                const displayName = activeGroup.isChugli
                  ? (m.anonymousAlias || "Secret Member")
                  : m.name;
                const displayUsername = activeGroup.isChugli
                  ? "@secret"
                  : `@${m.username}`;
                const initial = activeGroup.isChugli
                  ? (displayName || "S").charAt(0).toUpperCase()
                  : m.name.charAt(0).toUpperCase();

                return (
                  <View key={m.id} style={styles.memberRow}>
                    <View
                      style={[
                        styles.memberAvatar,
                        activeGroup.isChugli && { backgroundColor: "#8B5CF6" },
                      ]}
                    >
                      <Text style={styles.memberAvatarText}>{initial}</Text>
                    </View>

                    <View style={styles.memberInfo}>
                      <View style={styles.memberNameLine}>
                        <Text style={styles.memberName}>
                          {displayName} {isMe ? "(You)" : ""}
                        </Text>
                        <View
                          style={[
                            styles.userCheckStatusDot,
                            isOnline ? styles.dotOnline : styles.dotOffline,
                          ]}
                        />
                      </View>
                      <Text style={styles.memberUsername}>{displayUsername}</Text>
                    </View>

                    <View
                      style={[
                        styles.roleBadge,
                        m.role === "admin" && styles.roleBadgeAdmin,
                        activeGroup.isChugli && { backgroundColor: "#EDE9FE" },
                      ]}
                    >
                      <Text
                        style={[
                          styles.roleBadgeText,
                          m.role === "admin" && styles.roleBadgeAdminText,
                          activeGroup.isChugli && { color: "#7C3AED" },
                        ]}
                      >
                        {m.role}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Pending Invitations for this Group */}
            {activeGroup?.pendingInvitations && activeGroup.pendingInvitations.length > 0 ? (
              <View style={{ marginTop: 12 }}>
                <Text style={styles.membersListHeader}>
                  Pending Invitations ({activeGroup.pendingInvitations.length})
                </Text>
                <View style={styles.membersList}>
                  {activeGroup.pendingInvitations.map((p) => (
                    <View key={p.id} style={styles.memberRow}>
                      <View
                        style={[
                          styles.memberAvatar,
                          { backgroundColor: activeGroup.isChugli ? "#EDE9FE" : "#F3F4F6" },
                        ]}
                      >
                        <Text
                          style={[
                            styles.memberAvatarText,
                            { color: activeGroup.isChugli ? "#7C3AED" : "#64748B" },
                          ]}
                        >
                          {activeGroup.isChugli ? "🎭" : p.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.memberInfo}>
                        <Text style={styles.memberName}>
                          {activeGroup.isChugli ? "Invited Member" : p.name}
                        </Text>
                        <Text style={styles.memberUsername}>
                          {activeGroup.isChugli ? "@secret" : `@${p.username}`}
                        </Text>
                      </View>
                      <View style={styles.pendingBadge}>
                        <Text style={styles.pendingBadgeText}>Invited</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* MODAL 4: Create Chugli Group Chat */}
      <Modal
        visible={showChugliModal}
        animationType="slide"
        onRequestClose={() => setShowChugliModal(false)}
      >
        <SafeAreaView style={styles.modalSafeArea}>
          <View style={[styles.modalHeader, styles.modalHeaderChugli]}>
            <TouchableOpacity
              onPress={() => setShowChugliModal(false)}
              style={styles.modalCloseBtn}
            >
              <Ionicons name="close" size={22} color="#0F172A" />
            </TouchableOpacity>
            <View style={styles.modalHeaderTitleBox}>
              <Text style={styles.modalTitle}>🤫 Start a Chugli</Text>
              <Text style={styles.modalHeaderSub}>Secret Ephemeral Group</Text>
            </View>
            <TouchableOpacity
              style={[
                styles.modalHeaderAction,
                styles.modalHeaderActionChugli,
                (!chugliName.trim() || creatingChugli) && styles.btnDisabled,
              ]}
              onPress={handleCreateChugliSubmit}
              disabled={!chugliName.trim() || creatingChugli}
            >
              {creatingChugli ? (
                <ActivityIndicator size="small" color="#7C3AED" />
              ) : (
                <Text style={styles.modalHeaderActionTextChugli}>Start Session</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.modalBody}
            keyboardShouldPersistTaps="handled"
          >
            {/* Chugli Intro Banner */}
            <View style={styles.chugliIntroCard}>
              <View style={styles.chugliIntroIconBox}>
                <Text style={styles.chugliIntroEmoji}>🤫</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.chugliIntroTitle}>What is Chugli?</Text>
                <Text style={styles.chugliIntroBody}>
                  A temporary group with anonymous identities. When time runs out, the group and all messages self-destruct permanently unless extended by the admin.
                </Text>
              </View>
            </View>

            {/* Group Topic/Name */}
            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Chugli Topic or Group Name *</Text>
              <TextInput
                style={styles.formTextInput}
                placeholder="e.g. Late Night Whispers, Hot Takes, Confessions..."
                placeholderTextColor="#94A3B8"
                value={chugliName}
                onChangeText={setChugliName}
              />
            </View>

            {/* Session Timer Selector */}
            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Session Duration (Auto-Delete Timer) *</Text>
              <View style={styles.durationPresetRow}>
                <TouchableOpacity
                  style={[
                    styles.durationPresetBtn,
                    chugliDurationPreset === "1" && styles.durationPresetBtnActive,
                  ]}
                  onPress={() => setChugliDurationPreset("1")}
                >
                  <Text
                    style={[
                      styles.durationPresetText,
                      chugliDurationPreset === "1" && styles.durationPresetTextActive,
                    ]}
                  >
                    ⚡ 1 Min
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.durationPresetBtn,
                    chugliDurationPreset === "5" && styles.durationPresetBtnActive,
                  ]}
                  onPress={() => setChugliDurationPreset("5")}
                >
                  <Text
                    style={[
                      styles.durationPresetText,
                      chugliDurationPreset === "5" && styles.durationPresetTextActive,
                    ]}
                  >
                    ⚡ 5 Mins
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.durationPresetBtn,
                    chugliDurationPreset === "10" && styles.durationPresetBtnActive,
                  ]}
                  onPress={() => setChugliDurationPreset("10")}
                >
                  <Text
                    style={[
                      styles.durationPresetText,
                      chugliDurationPreset === "10" && styles.durationPresetTextActive,
                    ]}
                  >
                    10 Mins
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.durationPresetBtn,
                    chugliDurationPreset === "30" && styles.durationPresetBtnActive,
                  ]}
                  onPress={() => setChugliDurationPreset("30")}
                >
                  <Text
                    style={[
                      styles.durationPresetText,
                      chugliDurationPreset === "30" && styles.durationPresetTextActive,
                    ]}
                  >
                    30 Mins
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.durationPresetBtn,
                    chugliDurationPreset === "60" && styles.durationPresetBtnActive,
                  ]}
                  onPress={() => setChugliDurationPreset("60")}
                >
                  <Text
                    style={[
                      styles.durationPresetText,
                      chugliDurationPreset === "60" && styles.durationPresetTextActive,
                    ]}
                  >
                    1 Hour
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.durationPresetBtn,
                    chugliDurationPreset === "custom" && styles.durationPresetBtnActive,
                  ]}
                  onPress={() => setChugliDurationPreset("custom")}
                >
                  <Text
                    style={[
                      styles.durationPresetText,
                      chugliDurationPreset === "custom" && styles.durationPresetTextActive,
                    ]}
                  >
                    Custom
                  </Text>
                </TouchableOpacity>
              </View>

              {chugliDurationPreset === "custom" ? (
                <View style={styles.customDurationBox}>
                  <Text style={styles.customDurationLabel}>Minutes:</Text>
                  <TextInput
                    style={styles.customDurationInput}
                    keyboardType="number-pad"
                    placeholder="e.g. 15, 45, 120"
                    placeholderTextColor="#94A3B8"
                    value={chugliCustomDuration}
                    onChangeText={setChugliCustomDuration}
                  />
                  <Text style={styles.customDurationUnit}>minutes</Text>
                </View>
              ) : null}
            </View>

            {/* Secret Anonymous Identity */}
            <View style={styles.formGroup}>
              <View style={styles.aliasHeaderRow}>
                <Text style={styles.inputLabel}>Your Secret Alias in this Chugli *</Text>
                <TouchableOpacity
                  style={styles.randomizeBtn}
                  onPress={() => setChugliCreatorAlias(generateRandomAlias())}
                >
                  <Text style={styles.randomizeBtnText}>🎲 Randomize</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.aliasInputRow}>
                <View style={styles.aliasSpyBadge}>
                  <Text style={styles.aliasSpyBadgeEmoji}>🕵️</Text>
                </View>
                <TextInput
                  style={[styles.formTextInput, { flex: 1, fontWeight: "700" }]}
                  placeholder="Secret alias..."
                  placeholderTextColor="#94A3B8"
                  value={chugliCreatorAlias}
                  onChangeText={setChugliCreatorAlias}
                />
              </View>
              <Text style={styles.aliasHelperText}>
                Your real name and username will be concealed. You will appear as &quot;{chugliCreatorAlias || "Anonymous"}&quot;.
              </Text>
            </View>

            {/* Invite Members */}
            <View style={styles.inviteSection}>
              <View style={styles.inviteSectionHeader}>
                <View>
                  <Text style={styles.inviteSectionTitle}>Invite Secret Members</Text>
                  <Text style={styles.inviteSectionSub}>
                    Selected users will receive an invitation to join this Chugli room
                  </Text>
                </View>
                <Text style={styles.selectedCountText}>
                  {chugliSelectedUserIds.length} selected
                </Text>
              </View>

              {/* User search */}
              <View style={styles.modalSearchBox}>
                <Ionicons name="search" size={15} color="#94A3B8" style={{ marginRight: 6 }} />
                <TextInput
                  style={styles.modalSearchInput}
                  placeholder="Search registered users to invite..."
                  placeholderTextColor="#94A3B8"
                  value={chugliUserSearch}
                  onChangeText={setChugliUserSearch}
                />
              </View>

              {/* Selected User Chips */}
              {chugliSelectedUserIds.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipsScroll}
                >
                  {chugliSelectedUserIds.map((uid) => {
                    const u = registeredUsers.find((user) => user.id === uid);
                    if (!u) return null;
                    return (
                      <TouchableOpacity
                        key={uid}
                        style={styles.userChipChugli}
                        onPress={() => toggleChugliSelectUser(uid)}
                      >
                        <Text style={styles.userChipTextChugli}>{u.name.split(" ")[0]}</Text>
                        <Ionicons name="close-circle" size={14} color="#7C3AED" />
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              ) : null}

              {/* Users Checklist */}
              <View style={styles.userChecklist}>
                {filteredUsersForChugli.map((u) => {
                  const isSelected = chugliSelectedUserIds.includes(u.id);
                  const isOnline = onlineUserIds.includes(u.id);

                  return (
                    <TouchableOpacity
                      key={u.id}
                      style={[
                        styles.userCheckRow,
                        isSelected && styles.userCheckRowSelectedChugli,
                      ]}
                      onPress={() => toggleChugliSelectUser(u.id)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.userCheckAvatar}>
                        <Text style={styles.userCheckAvatarText}>
                          {u.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>

                      <View style={styles.userCheckInfo}>
                        <View style={styles.userCheckNameRow}>
                          <Text style={styles.userCheckName}>{u.name}</Text>
                          <View
                            style={[
                              styles.userCheckStatusDot,
                              isOnline ? styles.dotOnline : styles.dotOffline,
                            ]}
                          />
                        </View>
                        <Text style={styles.userCheckUsername}>@{u.username}</Text>
                      </View>

                      <View
                        style={[
                          styles.checkboxCircle,
                          isSelected && styles.checkboxCircleSelectedChugli,
                        ]}
                      >
                        {isSelected ? (
                          <Ionicons name="checkmark-circle" size={20} color="#7C3AED" />
                        ) : (
                          <View style={styles.checkboxEmpty} />
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* MODAL 5: Choose Secret Alias to Enter/Join Chugli */}
      <Modal
        visible={showAliasModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAliasModal(false)}
      >
        <View style={styles.modalOverlayCenter}>
          <View style={styles.aliasModalCard}>
            <View style={styles.aliasModalIconBadge}>
              <Text style={{ fontSize: 32 }}>🕵️</Text>
            </View>

            <Text style={styles.aliasModalTitle}>Secret Chugli Identity</Text>
            <Text style={styles.aliasModalSubtitle}>
              {targetChugliInvite
                ? `You've been invited to join 🤫 #${targetChugliInvite.groupName}! Choose your anonymous alias before entering.`
                : `Enter 🤫 #${targetChugliGroup?.name} anonymously! Choose your secret alias.`}
            </Text>

            <View style={styles.aliasInputWrapper}>
              <View style={styles.aliasHeaderRow}>
                <Text style={styles.aliasModalLabel}>Your Anonymous Name</Text>
                <TouchableOpacity
                  style={styles.randomizeBtn}
                  onPress={() => setMyAliasInput(generateRandomAlias())}
                >
                  <Text style={styles.randomizeBtnText}>🎲 Randomize</Text>
                </TouchableOpacity>
              </View>

              <TextInput
                style={styles.aliasModalInput}
                placeholder="e.g. MysteryFox, SilentGhost..."
                placeholderTextColor="#94A3B8"
                value={myAliasInput}
                onChangeText={setMyAliasInput}
              />
            </View>

            <View style={styles.aliasModalActions}>
              <TouchableOpacity
                style={styles.aliasCancelBtn}
                onPress={() => setShowAliasModal(false)}
              >
                <Text style={styles.aliasCancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.aliasConfirmBtn,
                  (!myAliasInput.trim() || settingAlias) && styles.btnDisabled,
                ]}
                onPress={handleConfirmAlias}
                disabled={!myAliasInput.trim() || settingAlias}
              >
                {settingAlias ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.aliasConfirmBtnText}>Join Anonymously</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL 6: Admin 10-Minute Warning & Extend Session */}
      <Modal
        visible={showWarningModal && Boolean(warningGroupInfo)}
        transparent
        animationType="fade"
        onRequestClose={() => setShowWarningModal(false)}
      >
        <View style={styles.modalOverlayCenter}>
          <View style={styles.warningModalCard}>
            <View style={styles.warningIconBadge}>
              <Text style={{ fontSize: 32 }}>⚠️</Text>
            </View>

            <Text style={styles.warningModalTitle}>Chugli Ending Soon!</Text>
            <Text style={styles.warningModalSubtitle}>
              The session for <Text style={styles.boldText}>&quot;{warningGroupInfo?.groupName}&quot;</Text> has only{" "}
              <Text style={styles.warningHighlightText}>
                {warningGroupInfo?.remainingMinutes || 10} minutes
              </Text>{" "}
              remaining before it self-destructs!
            </Text>

            <Text style={styles.extendSectionHeader}>Would you like to add more time?</Text>

            <View style={styles.quickExtendRow}>
              <TouchableOpacity
                style={styles.quickExtendBtn}
                onPress={() =>
                  warningGroupInfo && handleExtendChugli(warningGroupInfo.groupId, 10)
                }
                disabled={extendingSession}
              >
                <Text style={styles.quickExtendBtnText}>+10 Mins</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickExtendBtn}
                onPress={() =>
                  warningGroupInfo && handleExtendChugli(warningGroupInfo.groupId, 30)
                }
                disabled={extendingSession}
              >
                <Text style={styles.quickExtendBtnText}>+30 Mins</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickExtendBtn}
                onPress={() =>
                  warningGroupInfo && handleExtendChugli(warningGroupInfo.groupId, 60)
                }
                disabled={extendingSession}
              >
                <Text style={styles.quickExtendBtnText}>+1 Hour</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.warningModalFooter}>
              <TouchableOpacity
                style={styles.endSessionBtn}
                onPress={() =>
                  warningGroupInfo && handleEndChugli(warningGroupInfo.groupId)
                }
                disabled={extendingSession}
              >
                <Ionicons name="trash-outline" size={16} color="#DC2626" />
                <Text style={styles.endSessionBtnText}>End Session & Delete Now</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.dismissBtn}
                onPress={() => setShowWarningModal(false)}
              >
                <Text style={styles.dismissBtnText}>Dismiss (Let Expire)</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Right Slide-Out Hamburger Actions Drawer */}
      <Modal
        visible={showActionsDrawer}
        transparent={true}
        animationType="fade"
        onRequestClose={handleCloseActionsDrawer}
      >
        <View style={styles.drawerOverlay}>
          {/* Backdrop (tap to close) */}
          <TouchableOpacity
            style={styles.drawerBackdrop}
            activeOpacity={1}
            onPress={handleCloseActionsDrawer}
          />

          {/* Animated Drawer Panel from Right */}
          <Animated.View
            style={[
              styles.drawerPanel,
              { transform: [{ translateX: drawerSlideAnim }] },
            ]}
          >
            {/* Drawer Header */}
            <View style={styles.drawerHeader}>
              <View style={styles.drawerHeaderTitleRow}>
                <View style={styles.drawerHeaderIconBox}>
                  <Ionicons name="grid" size={17} color="#2563EB" />
                </View>
                <Text style={styles.drawerTitle}>Quick Actions</Text>
              </View>
              <TouchableOpacity
                onPress={handleCloseActionsDrawer}
                style={styles.drawerCloseBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={styles.drawerSubtitle}>
              Create a group or launch a multiplayer game
            </Text>

            {/* Menu Options List */}
            <ScrollView style={styles.drawerBody} bounces={false}>
              {/* Option 1: Create Group */}
              <TouchableOpacity
                style={styles.drawerCard}
                activeOpacity={0.8}
                onPress={() => {
                  handleCloseActionsDrawer();
                  setTimeout(() => setShowCreateModal(true), 200);
                }}
              >
                <View style={[styles.drawerCardIconBox, styles.drawerCardIconCreate]}>
                  <Ionicons name="add" size={22} color="#2563EB" />
                </View>
                <View style={styles.drawerCardInfo}>
                  <View style={styles.drawerCardTitleRow}>
                    <Text style={styles.drawerCardTitle}>Create Group</Text>
                    <View style={styles.drawerPillBlue}>
                      <Text style={styles.drawerPillBlueText}>Chat</Text>
                    </View>
                  </View>
                  <Text style={styles.drawerCardDesc}>
                    Start a permanent group with invitations & real-time chat
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
              </TouchableOpacity>

              {/* Option 2: 🤫 Chugli */}
              <TouchableOpacity
                style={[styles.drawerCard, styles.drawerCardChugli]}
                activeOpacity={0.8}
                onPress={() => {
                  handleCloseActionsDrawer();
                  setTimeout(() => handleOpenChugliModal(), 200);
                }}
              >
                <View style={[styles.drawerCardIconBox, styles.drawerCardIconChugli]}>
                  <Text style={styles.drawerCardEmoji}>🤫</Text>
                </View>
                <View style={styles.drawerCardInfo}>
                  <View style={styles.drawerCardTitleRow}>
                    <Text style={[styles.drawerCardTitle, { color: "#6D28D9" }]}>
                      Chugli
                    </Text>
                    <View style={styles.drawerPillPurple}>
                      <Text style={styles.drawerPillPurpleText}>Secret</Text>
                    </View>
                  </View>
                  <Text style={styles.drawerCardDesc}>
                    Temporary anonymous group with auto-delete session timer
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
              </TouchableOpacity>

            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  flexContainer: {
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
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  appIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#EFF6FF",
    justifyContent: "center",
    alignItems: "center",
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
    maxWidth: 180,
  },
  headerActionBtns: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerChugliBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#F5F3FF",
    borderWidth: 1,
    borderColor: "#DDD6FE",
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 20,
  },
  headerChugliEmoji: {
    fontSize: 14,
  },
  headerChugliBtnText: {
    color: "#7C3AED",
    fontSize: 12,
    fontWeight: "700",
  },
  headerCreateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#2563EB",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  headerCreateBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  createGroupBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#2563EB",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  createGroupBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    height: 42,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: "#0F172A",
  },
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  successBannerText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#166534",
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: "#64748B",
    fontWeight: "500",
  },
  groupsListContent: {
    padding: 16,
    gap: 10,
  },
  groupCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 12,
  },
  groupAvatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#EEF2FF",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#C7D2FE",
  },
  groupAvatarText: {
    color: "#4F46E5",
    fontSize: 18,
    fontWeight: "800",
  },
  groupInfo: {
    flex: 1,
    gap: 3,
  },
  groupTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  groupName: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
    maxWidth: 160,
  },
  membersBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  membersBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#2563EB",
  },
  groupDesc: {
    fontSize: 12,
    color: "#64748B",
  },
  groupBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  groupLastMsg: {
    fontSize: 12,
    color: "#475569",
    maxWidth: 160,
  },
  onlineMembersText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#166534",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
  },
  emptySub: {
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
    maxWidth: 280,
  },
  createEmptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#2563EB",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 8,
  },
  createEmptyBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },

  // Invitations Section
  invitationsSection: {
    backgroundColor: "#FFF7ED",
    borderWidth: 1,
    borderColor: "#FFEDD5",
    borderRadius: 14,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    gap: 10,
  },
  invitationsHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  invitationIconBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#FFEDD5",
    justifyContent: "center",
    alignItems: "center",
  },
  invitationsHeaderTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#9A3412",
  },
  invitationCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#FED7AA",
    gap: 6,
  },
  invitationTopLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  invitationGroupName: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
  },
  invitationTime: {
    fontSize: 10,
    color: "#94A3B8",
  },
  invitationInviter: {
    fontSize: 12,
    color: "#475569",
  },
  boldText: {
    fontWeight: "700",
    color: "#0F172A",
  },
  invitationDesc: {
    fontSize: 11,
    color: "#64748B",
  },
  invitationActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 4,
  },
  declineBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#F1F5F9",
  },
  declineBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
  },
  acceptBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#16A34A",
  },
  acceptBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  // Active Group Header Styles
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  backBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
  groupHeaderInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    marginHorizontal: 8,
  },
  groupAvatarMini: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "#EEF2FF",
    justifyContent: "center",
    alignItems: "center",
  },
  groupAvatarMiniText: {
    color: "#4F46E5",
    fontSize: 14,
    fontWeight: "800",
  },
  groupHeaderTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
  },
  groupHeaderSub: {
    fontSize: 11,
    color: "#64748B",
  },
  inviteHeaderBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  inviteHeaderBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#2563EB",
  },
  topicBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  topicBannerText: {
    fontSize: 12,
    color: "#334155",
    flex: 1,
  },
  keyboardContainer: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  listContent: {
    paddingVertical: 16,
  },
  emptyListContent: {
    flexGrow: 1,
    justifyContent: "center",
  },

  // Modal Styles
  modalSafeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  modalCloseBtn: {
    padding: 6,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
  },
  modalHeaderAction: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#EFF6FF",
  },
  modalHeaderActionText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2563EB",
  },
  btnDisabled: {
    opacity: 0.5,
  },
  modalBody: {
    flex: 1,
    padding: 16,
  },
  formGroup: {
    gap: 6,
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#334155",
  },
  formTextInput: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 14,
    color: "#0F172A",
  },
  inviteSection: {
    marginTop: 8,
    gap: 12,
  },
  inviteSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  inviteSectionTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
  },
  inviteSectionSub: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
  },
  selectedCountText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#2563EB",
  },
  modalSearchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 12,
    borderRadius: 10,
    height: 38,
  },
  modalSearchInput: {
    flex: 1,
    fontSize: 13,
    color: "#0F172A",
  },
  chipsScroll: {
    flexDirection: "row",
    gap: 6,
    paddingVertical: 4,
  },
  userChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  userChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#2563EB",
  },
  userChecklist: {
    gap: 8,
    marginTop: 8,
    paddingBottom: 24,
  },
  userCheckRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    padding: 10,
    gap: 12,
  },
  userCheckRowSelected: {
    borderColor: "#2563EB",
    backgroundColor: "#F0F7FF",
  },
  userCheckAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#2563EB",
    justifyContent: "center",
    alignItems: "center",
  },
  userCheckAvatarText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  userCheckInfo: {
    flex: 1,
    gap: 2,
  },
  userCheckNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  userCheckName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
  userCheckStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  dotOnline: {
    backgroundColor: "#22C55E",
  },
  dotOffline: {
    backgroundColor: "#94A3B8",
  },
  userCheckUsername: {
    fontSize: 12,
    color: "#64748B",
  },
  checkboxCircle: {
    width: 24,
    height: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxCircleSelected: {},
  checkboxEmpty: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: "#CBD5E1",
  },

  // Members Sheet
  groupHeroCard: {
    alignItems: "center",
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    gap: 6,
  },
  groupAvatarLarge: {
    width: 64,
    height: 64,
    borderRadius: 24,
    backgroundColor: "#EEF2FF",
    borderWidth: 2,
    borderColor: "#C7D2FE",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 6,
  },
  groupAvatarLargeText: {
    fontSize: 26,
    fontWeight: "800",
    color: "#4F46E5",
  },
  groupHeroTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0F172A",
  },
  groupHeroDesc: {
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
  },
  groupHeroMeta: {
    fontSize: 11,
    color: "#94A3B8",
  },
  membersListHeader: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
    marginTop: 16,
    marginBottom: 8,
  },
  membersList: {
    gap: 8,
    paddingBottom: 16,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    padding: 10,
    borderRadius: 12,
    gap: 12,
  },
  memberAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#2563EB",
    justifyContent: "center",
    alignItems: "center",
  },
  memberAvatarText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  memberInfo: {
    flex: 1,
  },
  memberNameLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  memberName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
  },
  memberUsername: {
    fontSize: 11,
    color: "#64748B",
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "#E2E8F0",
  },
  roleBadgeAdmin: {
    backgroundColor: "#FEF3C7",
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#475569",
  },
  roleBadgeAdminText: {
    color: "#92400E",
  },
  pendingBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "#FEF3C7",
  },
  pendingBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#D97706",
  },

  // Hamburger Menu Button
  hamburgerBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 2,
  },

  // Slide-out Drawer Styles (comes out from right side)
  drawerOverlay: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "flex-end",
    backgroundColor: "rgba(15, 23, 42, 0.45)",
  },
  drawerBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  drawerPanel: {
    width: "82%",
    maxWidth: 340,
    height: "100%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderBottomLeftRadius: 24,
    paddingTop: Platform.OS === "ios" ? 56 : 28,
    paddingHorizontal: 18,
    paddingBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 20,
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  drawerHeaderTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  drawerHeaderIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#EFF6FF",
    justifyContent: "center",
    alignItems: "center",
  },
  drawerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.3,
  },
  drawerCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
  },
  drawerSubtitle: {
    fontSize: 12,
    color: "#64748B",
    marginBottom: 20,
    lineHeight: 16,
  },
  drawerBody: {
    flex: 1,
  },
  drawerCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    gap: 12,
  },
  drawerCardChugli: {
    backgroundColor: "#FAF5FF",
    borderColor: "#DDD6FE",
  },
  drawerCardMystery: {
    backgroundColor: "#FFF1F2",
    borderColor: "#FECDD3",
  },
  drawerCardIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  drawerCardIconCreate: {
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  drawerCardIconChugli: {
    backgroundColor: "#EDE9FE",
    borderWidth: 1,
    borderColor: "#C4B5FD",
  },
  drawerCardIconMystery: {
    backgroundColor: "#FFE4E6",
    borderWidth: 1,
    borderColor: "#FDA4AF",
  },
  drawerCardEmoji: {
    fontSize: 22,
  },
  drawerCardInfo: {
    flex: 1,
    gap: 3,
  },
  drawerCardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  drawerCardTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
  },
  drawerCardDesc: {
    fontSize: 11,
    color: "#64748B",
    lineHeight: 15,
  },
  drawerPillBlue: {
    backgroundColor: "#DBEAFE",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  drawerPillBlueText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#1E40AF",
  },
  drawerPillPurple: {
    backgroundColor: "#EDE9FE",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  drawerPillPurpleText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#6D28D9",
  },
  drawerPillCrimson: {
    backgroundColor: "#FFE4E6",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  drawerPillCrimsonText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#9F1239",
  },

  // Chugli Header Actions
  headerRightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chugliHeaderBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#7C3AED",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    shadowColor: "#7C3AED",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  chugliHeaderEmoji: {
    fontSize: 13,
  },
  chugliHeaderText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  mysteryHeaderBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#881337",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E11D48",
    shadowColor: "#E11D48",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 3,
  },
  mysteryHeaderEmoji: {
    fontSize: 13,
  },
  mysteryHeaderText: {
    color: "#FFF1F2",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.2,
  },

  // Active Chugli Top Sticky Banner
  chugliTopBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FAF5FF",
    borderBottomWidth: 1.5,
    borderBottomColor: "#DDD6FE",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  chugliBannerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
  },
  chugliPillBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EDE9FE",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  chugliPillEmoji: {
    fontSize: 12,
  },
  chugliPillText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#6D28D9",
  },
  countdownPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#DDD6FE",
  },
  countdownPillWarning: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
  },
  countdownText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#6D28D9",
  },
  countdownTextWarning: {
    color: "#DC2626",
  },
  chugliBannerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  aliasDisplayPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#DDD6FE",
  },
  aliasDisplayLabel: {
    fontSize: 10,
    color: "#6B7280",
    fontWeight: "600",
  },
  aliasDisplayText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#4B5563",
    maxWidth: 100,
  },
  adminActionGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  extendBannerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#7C3AED",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
  },
  extendBannerBtnText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },
  endBannerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  endBannerBtnText: {
    color: "#DC2626",
    fontSize: 11,
    fontWeight: "800",
  },

  // Active Group Header additions
  groupTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  chugliHeaderBadge: {
    backgroundColor: "#EDE9FE",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  chugliHeaderBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#7C3AED",
  },
  groupAvatarMiniChugli: {
    backgroundColor: "#EDE9FE",
    borderColor: "#C4B5FD",
  },

  // Group Card Chugli Variations
  groupCardChugli: {
    borderColor: "#DDD6FE",
    backgroundColor: "#FAF5FF",
    borderWidth: 1.5,
  },
  groupAvatarChugli: {
    backgroundColor: "#EDE9FE",
    borderColor: "#A78BFA",
  },
  groupAvatarTextChugli: {
    color: "#7C3AED",
  },
  groupCardNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  chugliListBadge: {
    backgroundColor: "#EDE9FE",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  chugliListBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#7C3AED",
  },
  timerCardBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EDE9FE",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  timerCardBadgeWarning: {
    backgroundColor: "#FEE2E2",
  },
  timerCardBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#7C3AED",
  },
  timerCardBadgeTextWarning: {
    color: "#DC2626",
  },

  // Invitations Section Chugli styling
  invitationCardChugli: {
    borderColor: "#C4B5FD",
    backgroundColor: "#FAF5FF",
    borderWidth: 1.5,
  },
  invitationTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  chugliPillBadgeSmall: {
    backgroundColor: "#EDE9FE",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  chugliPillBadgeSmallText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#7C3AED",
  },
  invitationChugliNotice: {
    fontSize: 11,
    color: "#6D28D9",
    fontStyle: "italic",
    backgroundColor: "#EDE9FE",
    padding: 6,
    borderRadius: 6,
  },
  acceptBtnChugli: {
    backgroundColor: "#7C3AED",
  },
  emptyBtnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 8,
  },

  // Chugli Creation Modal Styles
  modalHeaderChugli: {
    borderBottomColor: "#DDD6FE",
    backgroundColor: "#FAF5FF",
  },
  modalHeaderTitleBox: {
    alignItems: "center",
  },
  modalHeaderSub: {
    fontSize: 11,
    color: "#7C3AED",
    fontWeight: "700",
  },
  modalHeaderActionChugli: {
    backgroundColor: "#7C3AED",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  modalHeaderActionTextChugli: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 12,
  },
  chugliIntroCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#F5F3FF",
    borderWidth: 1,
    borderColor: "#DDD6FE",
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  chugliIntroIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#EDE9FE",
    justifyContent: "center",
    alignItems: "center",
  },
  chugliIntroEmoji: {
    fontSize: 24,
  },
  chugliIntroTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#5B21B6",
    marginBottom: 2,
  },
  chugliIntroBody: {
    fontSize: 12,
    color: "#6D28D9",
    lineHeight: 17,
  },
  durationPresetRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 6,
  },
  durationPresetBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
  },
  durationPresetBtnActive: {
    borderColor: "#7C3AED",
    backgroundColor: "#F5F3FF",
    borderWidth: 1.5,
  },
  durationPresetText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
  },
  durationPresetTextActive: {
    color: "#7C3AED",
    fontWeight: "800",
  },
  customDurationBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    backgroundColor: "#F8FAFC",
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  customDurationLabel: {
    fontSize: 13,
    color: "#475569",
    fontWeight: "600",
  },
  customDurationInput: {
    width: 80,
    height: 38,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 8,
    paddingHorizontal: 10,
    backgroundColor: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
    color: "#0F172A",
  },
  customDurationUnit: {
    fontSize: 13,
    color: "#64748B",
  },
  aliasHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  randomizeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "#EDE9FE",
  },
  randomizeBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#7C3AED",
  },
  aliasInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  aliasSpyBadge: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  aliasSpyBadgeEmoji: {
    fontSize: 22,
  },
  aliasHelperText: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 4,
    fontStyle: "italic",
  },
  userChipChugli: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#EDE9FE",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  userChipTextChugli: {
    fontSize: 12,
    color: "#7C3AED",
    fontWeight: "700",
  },
  userCheckRowSelectedChugli: {
    backgroundColor: "#FAF5FF",
    borderColor: "#DDD6FE",
  },
  checkboxCircleSelectedChugli: {
    borderColor: "#7C3AED",
  },

  // Modal Overlay Centered (for Alias & Warning Modals)
  modalOverlayCenter: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  aliasModalCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 22,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  aliasModalIconBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#EDE9FE",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  aliasModalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 6,
    textAlign: "center",
  },
  aliasModalSubtitle: {
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 18,
  },
  aliasInputWrapper: {
    width: "100%",
    marginBottom: 20,
  },
  aliasModalLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
  },
  aliasModalInput: {
    width: "100%",
    height: 44,
    borderWidth: 1.5,
    borderColor: "#DDD6FE",
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
    marginTop: 6,
    backgroundColor: "#FAF5FF",
  },
  aliasModalActions: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },
  aliasCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
  },
  aliasCancelBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748B",
  },
  aliasConfirmBtn: {
    flex: 1.4,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#7C3AED",
    alignItems: "center",
  },
  aliasConfirmBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  // Warning Modal Styles
  warningModalCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 22,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
  },
  warningIconBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#FEF3C7",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  warningModalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#B45309",
    marginBottom: 6,
    textAlign: "center",
  },
  warningModalSubtitle: {
    fontSize: 13,
    color: "#4B5563",
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 16,
  },
  warningHighlightText: {
    color: "#DC2626",
    fontWeight: "800",
  },
  extendSectionHeader: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 10,
  },
  quickExtendRow: {
    flexDirection: "row",
    gap: 8,
    width: "100%",
    marginBottom: 18,
  },
  quickExtendBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#7C3AED",
    alignItems: "center",
  },
  quickExtendBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  warningModalFooter: {
    width: "100%",
    gap: 8,
  },
  endSessionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: "#FEE2E2",
    width: "100%",
  },
  endSessionBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#DC2626",
  },
  dismissBtn: {
    paddingVertical: 10,
    alignItems: "center",
    width: "100%",
  },
  dismissBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
  },
});
