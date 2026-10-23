import { prisma } from "../../db/prisma.js";
import type {
  ChatMessage,
  ChatUser,
  CreateGroupPayload,
  GroupChat,
  GroupInvitationInfo,
  GroupMemberInfo,
  InviteGroupMembersPayload,
  ReadReceipt,
  RegisterUserPayload,
  RespondInvitationPayload,
  SendMessagePayload,
} from "@chatapp/shared";

export class MessagesService {
  private formatGroup(g: any, pendingInvs?: any[]): GroupChat {
    const isChugli = Boolean(g.isChugli);

    const members: GroupMemberInfo[] = (g.members || []).map((m: any) => {
      const alias = m.anonymousAlias || (isChugli ? "Secret Member" : undefined);
      return {
        id: m.id,
        userId: m.userId,
        name: isChugli ? (alias || "Secret Member") : (m.user?.name || m.name || "Member"),
        username: isChugli ? "secret" : (m.user?.username || m.username || "user"),
        role: m.role as "admin" | "member",
        anonymousAlias: alias,
        joinedAt: m.joinedAt instanceof Date ? m.joinedAt.toISOString() : new Date(m.joinedAt).toISOString(),
      };
    });

    const invitations = pendingInvs || g.invitations || [];
    const pendingInvitations = invitations.map((p: any) => ({
      id: p.id,
      userId: p.invitedUser?.id || p.userId,
      name: isChugli ? "Invited Member" : (p.invitedUser?.name || p.name || "User"),
      username: isChugli ? "secret" : (p.invitedUser?.username || p.username || "user"),
    }));

    return {
      id: g.id,
      name: g.name,
      description: g.description || undefined,
      createdById: g.createdById,
      isChugli,
      durationMinutes: g.durationMinutes || undefined,
      expiresAt: g.expiresAt
        ? g.expiresAt instanceof Date
          ? g.expiresAt.toISOString()
          : new Date(g.expiresAt).toISOString()
        : undefined,
      createdAt:
        g.createdAt instanceof Date
          ? g.createdAt.toISOString()
          : new Date(g.createdAt).toISOString(),
      members,
      pendingInvitations,
      lastMessage: g.messages?.[0]?.text || undefined,
      lastMessageAt: g.messages?.[0]?.createdAt
        ? g.messages[0].createdAt instanceof Date
          ? g.messages[0].createdAt.toISOString()
          : new Date(g.messages[0].createdAt).toISOString()
        : undefined,
    };
  }

  async getRecentMessages(options?: {
    recipientId?: string;
    currentUserId?: string;
    groupId?: string;
    limit?: number;
  }): Promise<ChatMessage[]> {
    const limit = options?.limit || 100;

    let where: any = undefined;
    let chugliGroup: { isChugli: boolean; members: { userId: string; anonymousAlias: string | null }[] } | null = null;

    if (options?.groupId) {
      where = { groupId: options.groupId };
      const g = await prisma.group.findUnique({
        where: { id: options.groupId },
        select: {
          isChugli: true,
          members: { select: { userId: true, anonymousAlias: true } },
        },
      });
      if (g?.isChugli) {
        chugliGroup = g;
      }
    } else if (options?.recipientId && options?.currentUserId) {
      where = {
        OR: [
          { senderId: options.currentUserId, recipientId: options.recipientId },
          { senderId: options.recipientId, recipientId: options.currentUserId },
        ],
      };
    } else {
      where = { recipientId: null, groupId: null };
    }

    const records = await prisma.message.findMany({
      where,
      take: limit,
      orderBy: { createdAt: "asc" },
      include: {
        sender: {
          select: { name: true, username: true },
        },
        reads: {
          select: {
            userId: true,
            userName: true,
            readAt: true,
            user: {
              select: {
                name: true,
                username: true,
                phoneNumber: true,
              },
            },
          },
        },
      },
    });

    const aliasMap = new Map<string, string>();
    if (chugliGroup) {
      for (const m of chugliGroup.members) {
        if (m.anonymousAlias) {
          aliasMap.set(m.userId, m.anonymousAlias);
        }
      }
    }

    // Check users who have blocked currentUserId so we hide their read receipts from the blocked user
    let blockerUserIds = new Set<string>();
    if (options?.currentUserId) {
      const blockedRecords = await prisma.blockedUser.findMany({
        where: { blockedUserId: options.currentUserId },
        select: { blockerId: true },
      });
      blockerUserIds = new Set(blockedRecords.map((b) => b.blockerId));
    }

    const filteredRecords = options?.currentUserId
      ? records.filter((r) => !r.deletedForUserIds?.includes(options.currentUserId!))
      : records;

    return filteredRecords.map((record) => {
      const isChugli = Boolean(chugliGroup);
      const senderAlias = aliasMap.get(record.senderId);

      const senderName = isChugli
        ? (senderAlias || record.senderName || "Secret Member")
        : (record.senderName || record.sender.name);
      const senderUsername = isChugli ? "secret" : (record.senderUsername || record.sender.username);

      return {
        id: record.id,
        senderId: record.senderId,
        senderName,
        senderUsername,
        recipientId: record.recipientId || undefined,
        groupId: record.groupId || undefined,
        text: record.text,
        createdAt: record.createdAt.toISOString(),
        isDeletedForEveryone: record.isDeletedForEveryone,
        deletedByUserId: record.deletedByUserId || undefined,
        deletedByUsername: record.deletedByUsername || undefined,
        deletedForUserIds: record.deletedForUserIds || [],
        isEdited: Boolean(record.isEdited),
        editedAt: record.editedAt ? record.editedAt.toISOString() : undefined,
        reads: record.reads
          .filter((r) => !blockerUserIds.has(r.userId))
          .map((r) => {
            const readerAlias = aliasMap.get(r.userId);
            return {
              userId: r.userId,
              userName: isChugli
                ? (readerAlias || r.userName || "Secret Reader")
                : (r.user?.name || r.userName),
              username: isChugli ? "secret" : (r.user?.username || undefined),
              phoneNumber: isChugli ? undefined : (r.user?.phoneNumber || undefined),
              readAt: r.readAt.toISOString(),
            };
          }),
      };
    });
  }


  async saveMessage(payload: SendMessagePayload): Promise<ChatMessage> {
    const text = payload.text?.trim();
    const senderId = payload.senderId?.trim();
    const senderName = payload.senderName?.trim();
    const senderUsername = payload.senderUsername?.trim();
    const recipientId = payload.recipientId?.trim() || null;
    const groupId = payload.groupId?.trim() || null;

    if (!text) {
      throw new Error("Message text cannot be empty.");
    }
    if (!senderId) {
      throw new Error("Sender ID is required.");
    }

    const sender = await prisma.user.findUnique({
      where: { id: senderId },
    });

    let resolvedName = senderName || sender?.name || "Anonymous";
    let resolvedUsername: string | null = senderUsername || sender?.username || "user";

    if (groupId) {
      const group = await prisma.group.findUnique({
        where: { id: groupId },
        include: {
          members: {
            where: { userId: senderId },
          },
        },
      });

      if (group?.isChugli) {
        const member = group.members[0];
        resolvedName = member?.anonymousAlias || "Secret Member";
        resolvedUsername = "secret";
      }
    }

    const saved = await prisma.message.create({
      data: {
        text,
        senderId,
        senderName: resolvedName,
        senderUsername: resolvedUsername,
        recipientId,
        groupId,
      },
      include: {
        sender: {
          select: { name: true, username: true },
        },
        reads: true,
      },
    });

    return {
      id: saved.id,
      senderId: saved.senderId,
      senderName: saved.senderName || saved.sender.name,
      senderUsername: saved.senderUsername || saved.sender.username,
      recipientId: saved.recipientId || undefined,
      groupId: saved.groupId || undefined,
      text: saved.text,
      createdAt: saved.createdAt.toISOString(),
      reads: [],
    };
  }

  async markMessagesAsRead(
    messageIds: string[],
    userId: string,
    userName: string
  ): Promise<ReadReceipt> {
    if (!messageIds || messageIds.length === 0 || !userId) {
      return { userId, userName, readAt: new Date().toISOString() };
    }

    const now = new Date();

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, username: true, phoneNumber: true },
    });

    let finalName = user?.name || userName;
    let finalUsername: string | undefined = user?.username;
    let isChugliMsg = false;

    // Mask with anonymous alias if in a Chugli group
    const firstMsg = await prisma.message.findUnique({
      where: { id: messageIds[0] },
      select: { groupId: true },
    });
    if (firstMsg?.groupId) {
      const group = await prisma.group.findUnique({
        where: { id: firstMsg.groupId },
        include: { members: { where: { userId } } },
      });
      if (group?.isChugli) {
        isChugliMsg = true;
        finalName = group.members[0]?.anonymousAlias || "Secret Reader";
        finalUsername = "secret";
      }
    }

    // Check users who are blocked by this reader; do not save read receipts for messages sent by blocked users
    const blockedRecords = await prisma.blockedUser.findMany({
      where: { blockerId: userId },
      select: { blockedUserId: true },
    });
    const blockedUserSet = new Set(blockedRecords.map((b) => b.blockedUserId));

    const targetMessages = await prisma.message.findMany({
      where: { id: { in: messageIds } },
      select: { id: true, senderId: true },
    });

    const allowedMsgIds = targetMessages
      .filter((m) => !blockedUserSet.has(m.senderId))
      .map((m) => m.id);

    if (allowedMsgIds.length > 0) {
      await Promise.all(
        allowedMsgIds.map((msgId) =>
          prisma.messageRead.upsert({
            where: {
              messageId_userId: {
                messageId: msgId,
                userId,
              },
            },
            update: {
              userName: finalName,
              readAt: now,
            },
            create: {
              messageId: msgId,
              userId,
              userName: finalName,
              readAt: now,
            },
          })
        )
      );
    }

    return {
      userId,
      userName: finalName,
      username: finalUsername,
      phoneNumber: isChugliMsg ? undefined : user?.phoneNumber,
      readAt: now.toISOString(),
    };
  }

  async registerUser(payload: RegisterUserPayload): Promise<ChatUser> {
    const name = payload.name?.trim();
    const username = payload.username?.trim().toLowerCase().replace(/^@/, "");
    const phoneNumber = payload.phoneNumber?.trim();

    if (!name || name.length < 2) {
      throw new Error("Name must be at least 2 characters.");
    }
    if (!username || username.length < 3) {
      throw new Error("Username must be at least 3 characters.");
    }
    if (!phoneNumber || phoneNumber.length < 7) {
      throw new Error("Please enter a valid phone number (at least 7 digits).");
    }

    const existingByUsername = await prisma.user.findUnique({
      where: { username },
    });
    if (existingByUsername) {
      throw new Error(`Username "@${username}" is already taken. Please choose another.`);
    }

    const existingByPhone = await prisma.user.findUnique({
      where: { phoneNumber },
    });
    if (existingByPhone) {
      throw new Error(`Phone number "${phoneNumber}" is already registered.`);
    }

    const user = await prisma.user.create({
      data: {
        name,
        username,
        phoneNumber,
      },
    });

    return {
      id: user.id,
      name: user.name,
      username: user.username,
      phoneNumber: user.phoneNumber,
      createdAt: user.createdAt.toISOString(),
    };
  }

  async loginUser(identifier: string): Promise<ChatUser> {
    const cleanId = identifier.trim().toLowerCase().replace(/^@/, "");
    if (!cleanId) {
      throw new Error("Please enter your username or phone number.");
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: cleanId },
          { phoneNumber: identifier.trim() },
        ],
      },
    });

    if (!user) {
      throw new Error(`No user found matching "${identifier}".`);
    }

    return {
      id: user.id,
      name: user.name,
      username: user.username,
      phoneNumber: user.phoneNumber,
      createdAt: user.createdAt.toISOString(),
    };
  }

  async getAllUsers(query?: string): Promise<ChatUser[]> {
    const clean = query?.trim().toLowerCase().replace(/^@/, "");

    const where = clean
      ? {
          OR: [
            { username: { contains: clean, mode: "insensitive" as const } },
            { name: { contains: clean, mode: "insensitive" as const } },
            { phoneNumber: { contains: clean } },
          ],
        }
      : undefined;

    const users = await prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return users.map((u) => ({
      id: u.id,
      name: u.name,
      username: u.username,
      phoneNumber: u.phoneNumber,
      createdAt: u.createdAt.toISOString(),
    }));
  }

  async updateUserName(userId: string, newName: string): Promise<ChatUser> {
    const cleanName = newName?.trim();
    if (!cleanName || cleanName.length < 2) {
      throw new Error("Name must be at least 2 characters.");
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { name: cleanName },
    });

    return {
      id: updated.id,
      name: updated.name,
      username: updated.username,
      phoneNumber: updated.phoneNumber,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  // --- Group Chats & Invitation Operations ---

  async createGroup(payload: CreateGroupPayload): Promise<{ group: GroupChat; invitations: GroupInvitationInfo[] }> {
    const name = payload.name?.trim();
    if (!name || name.length < 2) {
      throw new Error("Group name must be at least 2 characters.");
    }

    const createdById = payload.createdById;
    const inviteUserIds = payload.inviteUserIds?.filter((id) => id !== createdById) || [];

    const isChugli = Boolean(payload.isChugli);
    const durationMinutes = isChugli
      ? payload.durationMinutes && payload.durationMinutes > 0
        ? payload.durationMinutes
        : 30
      : null;
    const expiresAt = durationMinutes
      ? new Date(Date.now() + durationMinutes * 60 * 1000)
      : null;
    const creatorAlias = payload.creatorAlias?.trim() || (isChugli ? "Secret Admin" : null);

    // Create group with creator as admin
    const group = await prisma.group.create({
      data: {
        name,
        description: payload.description?.trim() || null,
        createdById,
        isChugli,
        durationMinutes,
        expiresAt,
        members: {
          create: [{ userId: createdById, role: "admin", anonymousAlias: creatorAlias }],
        },
      },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, username: true } },
          },
        },
      },
    });

    // Send invitations to invited users
    const createdInvitations: GroupInvitationInfo[] = [];
    if (inviteUserIds.length > 0) {
      const creator = await prisma.user.findUnique({ where: { id: createdById } });
      const senderName = creator?.name || "Group Admin";
      const senderUsername = creator?.username || "admin";

      for (const invitedUserId of inviteUserIds) {
        const inv = await prisma.groupInvitation.create({
          data: {
            groupId: group.id,
            invitedUserId,
            senderId: createdById,
            status: "pending",
          },
        });

        createdInvitations.push({
          id: inv.id,
          groupId: group.id,
          groupName: group.name,
          groupDescription: group.description || undefined,
          senderId: createdById,
          senderName: isChugli ? (creatorAlias || "Chugli Host") : senderName,
          senderUsername: isChugli ? "secret" : senderUsername,
          isChugli,
          status: "pending",
          createdAt: inv.createdAt.toISOString(),
        });
      }
    }

    const pendingInvs = await prisma.groupInvitation.findMany({
      where: { groupId: group.id, status: "pending" },
      include: { invitedUser: { select: { id: true, name: true, username: true } } },
    });

    const groupResult = this.formatGroup(group, pendingInvs);
    return { group: groupResult, invitations: createdInvitations };
  }

  async getGroups(userId?: string): Promise<GroupChat[]> {
    const where = userId
      ? {
          OR: [
            { members: { some: { userId } } },
            { createdById: userId },
          ],
        }
      : undefined;

    const groups = await prisma.group.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, username: true } },
          },
        },
        invitations: {
          where: { status: "pending" },
          include: {
            invitedUser: { select: { id: true, name: true, username: true } },
          },
        },
        messages: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: { text: true, createdAt: true },
        },
      },
    });

    return groups.map((g) => this.formatGroup(g));
  }

  async getUserInvitations(userId: string): Promise<GroupInvitationInfo[]> {
    const invitations = await prisma.groupInvitation.findMany({
      where: {
        invitedUserId: userId,
        status: "pending",
      },
      include: {
        group: { select: { id: true, name: true, description: true, isChugli: true } },
        sender: { select: { id: true, name: true, username: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return invitations.map((inv) => ({
      id: inv.id,
      groupId: inv.group.id,
      groupName: inv.group.name,
      groupDescription: inv.group.description || undefined,
      senderId: inv.sender.id,
      senderName: inv.sender.name,
      senderUsername: inv.sender.username,
      isChugli: inv.group.isChugli,
      status: inv.status as "pending",
      createdAt: inv.createdAt.toISOString(),
    }));
  }

  async inviteMembersToGroup(payload: InviteGroupMembersPayload): Promise<{ group: GroupChat; invitations: GroupInvitationInfo[] }> {
    const { groupId, senderId, memberUserIds } = payload;
    if (!groupId || !memberUserIds || memberUserIds.length === 0) {
      throw new Error("Group ID and members to invite are required.");
    }

    const group = await prisma.group.findUniqueOrThrow({ where: { id: groupId } });
    const sender = await prisma.user.findUnique({ where: { id: senderId } });
    const senderName = sender?.name || "Member";
    const senderUsername = sender?.username || "user";

    const createdInvitations: GroupInvitationInfo[] = [];

    for (const userId of memberUserIds) {
      // Check if already a member
      const existingMember = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId } },
      });
      if (existingMember) continue;

      const inv = await prisma.groupInvitation.upsert({
        where: { groupId_invitedUserId: { groupId, invitedUserId: userId } },
        update: { status: "pending", senderId },
        create: {
          groupId,
          invitedUserId: userId,
          senderId,
          status: "pending",
        },
      });

      createdInvitations.push({
        id: inv.id,
        groupId: group.id,
        groupName: group.name,
        groupDescription: group.description || undefined,
        senderId,
        senderName,
        senderUsername,
        status: "pending",
        createdAt: inv.createdAt.toISOString(),
      });
    }

    const updated = await prisma.group.findUniqueOrThrow({
      where: { id: groupId },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, username: true } },
          },
        },
        invitations: {
          where: { status: "pending" },
          include: {
            invitedUser: { select: { id: true, name: true, username: true } },
          },
        },
      },
    });

    const groupResult = this.formatGroup(updated);
    return { group: groupResult, invitations: createdInvitations };
  }

  async respondToInvitation(payload: RespondInvitationPayload): Promise<GroupChat> {
    const { invitationId, userId, response } = payload;

    const inv = await prisma.groupInvitation.findUniqueOrThrow({
      where: { id: invitationId },
    });

    if (inv.invitedUserId !== userId) {
      throw new Error("You are not authorized to respond to this invitation.");
    }

    if (response === "accept") {
      await prisma.$transaction([
        prisma.groupInvitation.update({
          where: { id: invitationId },
          data: { status: "accepted" },
        }),
        prisma.groupMember.upsert({
          where: { groupId_userId: { groupId: inv.groupId, userId } },
          update: {
            ...(payload.anonymousAlias ? { anonymousAlias: payload.anonymousAlias } : {}),
          },
          create: {
            groupId: inv.groupId,
            userId,
            role: "member",
            anonymousAlias: payload.anonymousAlias || null,
          },
        }),
      ]);
    } else {
      await prisma.groupInvitation.update({
        where: { id: invitationId },
        data: { status: "declined" },
      });
    }

    const updated = await prisma.group.findUniqueOrThrow({
      where: { id: inv.groupId },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, username: true } },
          },
        },
        invitations: {
          where: { status: "pending" },
          include: {
            invitedUser: { select: { id: true, name: true, username: true } },
          },
        },
      },
    });

    return this.formatGroup(updated);
  }

  async extendChugliGroup(
    groupId: string,
    userId: string,
    additionalMinutes: number
  ): Promise<GroupChat> {
    const group = await prisma.group.findUniqueOrThrow({ where: { id: groupId } });
    if (group.createdById !== userId) {
      throw new Error("Only the Chugli group admin can extend the session.");
    }
    if (!group.isChugli) {
      throw new Error("This is not a temporary Chugli group.");
    }

    const currentExpiry = group.expiresAt ? group.expiresAt.getTime() : Date.now();
    const baseTime = Math.max(currentExpiry, Date.now());
    const newExpiresAt = new Date(baseTime + additionalMinutes * 60 * 1000);
    const newDuration = (group.durationMinutes || 0) + additionalMinutes;

    const updated = await prisma.group.update({
      where: { id: groupId },
      data: {
        expiresAt: newExpiresAt,
        durationMinutes: newDuration,
        warningSent: false, // Reset warning so admin receives notice 10 min before new end
      },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, username: true } },
          },
        },
        invitations: {
          where: { status: "pending" },
          include: {
            invitedUser: { select: { id: true, name: true, username: true } },
          },
        },
      },
    });

    return this.formatGroup(updated);
  }

  async endChugliGroup(groupId: string, userId: string): Promise<{ id: string; name: string }> {
    const group = await prisma.group.findUniqueOrThrow({ where: { id: groupId } });
    if (group.createdById !== userId) {
      throw new Error("Only the Chugli group admin can end the session.");
    }

    await prisma.group.delete({ where: { id: groupId } });
    return { id: group.id, name: group.name };
  }

  async setMemberAlias(groupId: string, userId: string, alias: string): Promise<GroupChat> {
    const cleanAlias = alias.trim();
    if (!cleanAlias) {
      throw new Error("Secret alias cannot be empty.");
    }

    await prisma.groupMember.update({
      where: { groupId_userId: { groupId, userId } },
      data: { anonymousAlias: cleanAlias },
    });

    const updated = await prisma.group.findUniqueOrThrow({
      where: { id: groupId },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, username: true } },
          },
        },
        invitations: {
          where: { status: "pending" },
          include: {
            invitedUser: { select: { id: true, name: true, username: true } },
          },
        },
      },
    });

    return this.formatGroup(updated);
  }

  async checkChugliStatus(io?: any): Promise<void> {
    const now = new Date();

    // 1. Expiry & Auto-Delete: Find Chugli groups where expiresAt <= now
    const expiredGroups = await prisma.group.findMany({
      where: {
        isChugli: true,
        expiresAt: {
          lte: now,
        },
      },
      select: {
        id: true,
        name: true,
      },
    });

    for (const g of expiredGroups) {
      console.log(`[Chugli Timer] 💥 Chugli group "${g.name}" (${g.id}) expired. Auto-deleting!`);
      if (io) {
        io.emit("chugli:expired", {
          groupId: g.id,
          groupName: g.name,
        });
      }
      try {
        await prisma.group.delete({ where: { id: g.id } });
      } catch (err: any) {
        console.error(`[Chugli Timer] Error deleting expired group ${g.id}:`, err.message);
      }
    }

    // 2. Early Warning Notification:
    // Only check groups that have not yet sent a warning and have not expired
    const pendingWarningGroups = await prisma.group.findMany({
      where: {
        isChugli: true,
        warningSent: false,
        expiresAt: {
          gt: now,
        },
      },
      select: {
        id: true,
        name: true,
        createdById: true,
        durationMinutes: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    for (const g of pendingWarningGroups) {
      if (!g.expiresAt) continue;
      const totalDurationMinutes = g.durationMinutes || 10;
      const remainingMs = g.expiresAt.getTime() - now.getTime();
      const remainingMinutes = Math.max(1, Math.round(remainingMs / (60 * 1000)));

      // Scaled warning threshold based on session duration:
      // - 1-2 min sessions: warn when <= 30 seconds remaining
      // - 3-10 min sessions: warn when <= 2 minutes remaining
      // - >10 min sessions: warn when <= 10 minutes remaining
      let shouldWarn = false;
      if (totalDurationMinutes <= 2) {
        shouldWarn = remainingMs <= 30 * 1000;
      } else if (totalDurationMinutes <= 10) {
        shouldWarn = remainingMs <= 2 * 60 * 1000;
      } else {
        shouldWarn = remainingMs <= 10 * 60 * 1000;
      }

      // Do not warn within the first 5 seconds of creation to prevent instantaneous trigger
      const ageMs = now.getTime() - g.createdAt.getTime();
      if (ageMs < 5000) {
        shouldWarn = false;
      }

      if (shouldWarn) {
        await prisma.group.update({
          where: { id: g.id },
          data: { warningSent: true },
        });

        console.log(`[Chugli Timer] ⚠️ Expiry warning sent for group "${g.name}" (${g.id}), ${remainingMinutes}m remaining`);
        if (io) {
          io.emit("chugli:warning", {
            groupId: g.id,
            groupName: g.name,
            expiresAt: g.expiresAt.toISOString(),
            remainingMinutes,
          });
        }
      }
    }
  }

  // --- Message Editing ---
  async editMessage(params: {
    messageId: string;
    userId: string;
    newText: string;
  }): Promise<{
    message: ChatMessage;
    recipientId?: string;
    groupId?: string;
  }> {
    const { messageId, userId } = params;
    const newText = (params.newText || "").trim();

    if (!newText) {
      throw new Error("Message text cannot be empty.");
    }

    const msg = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        sender: { select: { username: true, name: true } },
        reads: true,
      },
    });

    if (!msg) {
      throw new Error("Message not found.");
    }

    // Only sender can edit message
    if (msg.senderId !== userId) {
      throw new Error("You can only edit messages sent by you.");
    }

    // Cannot edit a deleted message
    if (msg.isDeletedForEveryone) {
      throw new Error("Cannot edit a deleted message.");
    }

    // 5-minute edit window check (5 * 60 * 1000 ms = 300,000 ms)
    const now = Date.now();
    const createdTime = new Date(msg.createdAt).getTime();
    const diffMs = now - createdTime;
    const FIVE_MINUTES_MS = 5 * 60 * 1000;
    if (diffMs > FIVE_MINUTES_MS) {
      throw new Error("Messages can only be edited within 5 minutes of sending.");
    }

    const updated = await prisma.message.update({
      where: { id: messageId },
      data: {
        text: newText,
        isEdited: true,
        editedAt: new Date(),
      },
      include: {
        sender: { select: { username: true, name: true } },
        reads: true,
      },
    });

    return {
      message: {
        id: updated.id,
        senderId: updated.senderId,
        senderName: updated.senderName || updated.sender.name,
        senderUsername: updated.senderUsername || updated.sender.username,
        recipientId: updated.recipientId || undefined,
        groupId: updated.groupId || undefined,
        text: updated.text,
        createdAt: updated.createdAt.toISOString(),
        isDeletedForEveryone: updated.isDeletedForEveryone,
        deletedByUserId: updated.deletedByUserId || undefined,
        deletedByUsername: updated.deletedByUsername || undefined,
        deletedForUserIds: updated.deletedForUserIds || [],
        isEdited: updated.isEdited,
        editedAt: updated.editedAt ? updated.editedAt.toISOString() : undefined,
        reads: [],
      },
      recipientId: updated.recipientId || undefined,
      groupId: updated.groupId || undefined,
    };
  }

  // --- Message Deletion ---
  async deleteMessage(params: {
    messageId: string;
    userId: string;
    deleteFor: "me" | "everyone";
  }): Promise<{
    messageId: string;
    deleteFor: "me" | "everyone";
    deletedByUserId?: string;
    deletedByUsername?: string;
    recipientId?: string;
    groupId?: string;
  }> {
    const { messageId, userId, deleteFor } = params;
    const msg = await prisma.message.findUnique({
      where: { id: messageId },
      include: { sender: { select: { username: true, name: true } } },
    });

    if (!msg) {
      throw new Error("Message not found.");
    }

    if (deleteFor === "everyone") {
      // Only the sender can delete for everyone
      if (msg.senderId !== userId) {
        throw new Error("You can only delete messages sent by you for everyone.");
      }

      const deleter = await prisma.user.findUnique({
        where: { id: userId },
        select: { username: true, name: true },
      });

      const deletedByUsername = deleter?.username || msg.sender.username || msg.sender.name || "user";

      await prisma.message.update({
        where: { id: messageId },
        data: {
          isDeletedForEveryone: true,
          deletedByUserId: userId,
          deletedByUsername,
        },
      });

      return {
        messageId,
        deleteFor: "everyone",
        deletedByUserId: userId,
        deletedByUsername,
        recipientId: msg.recipientId || undefined,
        groupId: msg.groupId || undefined,
      };
    } else {
      // Delete for me
      const existingDeletedFor = msg.deletedForUserIds || [];
      if (!existingDeletedFor.includes(userId)) {
        await prisma.message.update({
          where: { id: messageId },
          data: {
            deletedForUserIds: {
              push: userId,
            },
          },
        });
      }

      return {
        messageId,
        deleteFor: "me",
        deletedByUserId: userId,
        recipientId: msg.recipientId || undefined,
        groupId: msg.groupId || undefined,
      };
    }
  }

  // --- User Blocking ---
  async blockUser(blockerId: string, targetUserId: string): Promise<void> {
    if (blockerId === targetUserId) {
      throw new Error("You cannot block yourself.");
    }
    await prisma.blockedUser.upsert({
      where: {
        blockerId_blockedUserId: {
          blockerId,
          blockedUserId: targetUserId,
        },
      },
      create: {
        blockerId,
        blockedUserId: targetUserId,
      },
      update: {},
    });
  }

  async unblockUser(blockerId: string, targetUserId: string): Promise<void> {
    await prisma.blockedUser.deleteMany({
      where: {
        blockerId,
        blockedUserId: targetUserId,
      },
    });
  }

  async getBlockedUserIds(blockerId: string): Promise<string[]> {
    const list = await prisma.blockedUser.findMany({
      where: { blockerId },
      select: { blockedUserId: true },
    });
    return list.map((b) => b.blockedUserId);
  }

  async getBlockedUsers(blockerId: string): Promise<ChatUser[]> {
    const list = await prisma.blockedUser.findMany({
      where: { blockerId },
      include: {
        blockedUser: {
          select: {
            id: true,
            name: true,
            username: true,
            phoneNumber: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return list.map((b) => ({
      id: b.blockedUser.id,
      name: b.blockedUser.name,
      username: b.blockedUser.username,
      phoneNumber: b.blockedUser.phoneNumber,
      createdAt: b.blockedUser.createdAt.toISOString(),
    }));
  }
}


export const messagesService = new MessagesService();
