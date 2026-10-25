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
  FriendRequestInfo,
  FriendStatusResponse,
  CheckAvailabilityResponse,
} from "@chatapp/shared";
import { prisma } from "../../db/prisma.js";
import { config } from "../../config/index.js";
import { uploadService } from "../upload/upload.service.js";
import { serverCache } from "../../utils/cache.js";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const [salt, key] = storedHash.split(":");
    if (!salt || !key) return false;
    const keyBuffer = Buffer.from(key, "hex");
    const derivedKey = crypto.scryptSync(password, salt, 64);
    return crypto.timingSafeEqual(keyBuffer, derivedKey);
  } catch {
    return false;
  }
}

export class MessagesService {
  private userAvatars = new Map<string, string>();
  private avatarStoragePath = path.resolve(process.cwd(), "user_avatars.json");

  constructor() {
    this.loadAvatars();
  }

  private loadAvatars() {
    try {
      if (fs.existsSync(this.avatarStoragePath)) {
        const raw = fs.readFileSync(this.avatarStoragePath, "utf-8");
        const parsed = JSON.parse(raw);
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === "string") {
            this.userAvatars.set(k, v);
          }
        }
      }
    } catch (e) {
      console.warn("[MessagesService] Failed to load user_avatars.json:", e);
    }
  }

  private saveAvatars() {
    try {
      const obj: Record<string, string> = {};
      for (const [k, v] of this.userAvatars.entries()) {
        obj[k] = v;
      }
      fs.writeFileSync(this.avatarStoragePath, JSON.stringify(obj, null, 2), "utf-8");
    } catch (e) {
      console.warn("[MessagesService] Failed to save user_avatars.json:", e);
    }
  }

  public formatUser(u: any): ChatUser {
    return {
      id: u.id,
      name: u.name,
      username: u.username,
      phoneNumber: u.phoneNumber,
      email: u.email || null,
      clerkId: u.clerkId || null,
      createdAt:
        u.createdAt instanceof Date
          ? u.createdAt.toISOString()
          : u.createdAt
          ? new Date(u.createdAt).toISOString()
          : new Date().toISOString(),
      avatarUrl: this.userAvatars.get(u.id) || null,
    };
  }

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

    let cacheKey: string;
    const tags: string[] = [];

    if (options?.groupId) {
      cacheKey = `msg:group:${options.groupId}:${options.currentUserId || "all"}:${limit}`;
      tags.push(`group:${options.groupId}`);
      if (options.currentUserId) tags.push(`user:${options.currentUserId}`);
    } else if (options?.recipientId && options?.currentUserId) {
      const pair = [options.currentUserId, options.recipientId].sort().join(":");
      cacheKey = `msg:pair:${pair}:${options.currentUserId}:${limit}`;
      tags.push(`user:${options.currentUserId}`, `user:${options.recipientId}`, `pair:${pair}`);
    } else if (options?.currentUserId) {
      cacheKey = `msg:user:${options.currentUserId}:${limit}`;
      tags.push(`user:${options.currentUserId}`);
    } else {
      cacheKey = `msg:global:${limit}`;
      tags.push("msg:global");
    }

    return serverCache.getOrSet(
      cacheKey,
      async () => {
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
            imageUrl: record.isViewOnce && record.isViewed ? undefined : (record.imageUrl || undefined),
            imagePublicId: record.isViewOnce && record.isViewed ? undefined : (record.imagePublicId || undefined),
            isViewOnce: Boolean(record.isViewOnce),
            isViewed: Boolean(record.isViewed),
            viewedAt: record.viewedAt ? record.viewedAt.toISOString() : undefined,
            viewedByUserId: record.viewedByUserId || undefined,
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
      },
      60_000,
      tags
    );
  }

  async saveMessage(payload: SendMessagePayload): Promise<ChatMessage> {
    const rawText = payload.text?.trim();
    const imageUrl = payload.imageUrl?.trim() || null;
    const imagePublicId = payload.imagePublicId?.trim() || null;
    const isViewOnce = Boolean(payload.isViewOnce);

    const text = rawText || (imageUrl ? (isViewOnce ? "Photo (View once)" : "Photo") : "");
    const senderId = payload.senderId?.trim();
    const senderName = payload.senderName?.trim();
    const senderUsername = payload.senderUsername?.trim();
    const recipientId = payload.recipientId?.trim() || null;
    const groupId = payload.groupId?.trim() || null;

    if (!text && !imageUrl) {
      throw new Error("Message text or photo is required.");
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

    // 1-on-1 personal chat friendship restriction:
    // If not friends, sender is allowed to send at most 1 message
    if (recipientId) {
      const isFriend = await this.areUsersFriends(senderId, recipientId);
      if (!isFriend) {
        const sentCount = await prisma.message.count({
          where: { senderId, recipientId },
        });
        if (sentCount >= 1) {
          throw new Error("You cannot send messages as they are not your friend.");
        }
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
        imageUrl,
        imagePublicId,
        isViewOnce,
        isViewed: false,
        viewedAt: null,
        viewedByUserId: null,
      },
      include: {
        sender: {
          select: { name: true, username: true },
        },
        reads: true,
      },
    });

    if (groupId) {
      serverCache.invalidateTag(`group:${groupId}`);
    }
    if (recipientId) {
      serverCache.invalidateTag(`user:${senderId}`);
      serverCache.invalidateTag(`user:${recipientId}`);
      const pair = [senderId, recipientId].sort().join(":");
      serverCache.invalidateTag(`pair:${pair}`);
    }
    serverCache.invalidateTag("msg:global");

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
      imageUrl: saved.imageUrl || undefined,
      imagePublicId: saved.imagePublicId || undefined,
      isViewOnce: saved.isViewOnce,
      isViewed: saved.isViewed,
      viewedAt: saved.viewedAt ? saved.viewedAt.toISOString() : undefined,
      viewedByUserId: saved.viewedByUserId || undefined,
    };
  }

  /**
   * Open and view a view-once photo
   * Destroys the image from Cloudinary permanently and prevents re-viewing!
   */
  async openViewOnceMessage(messageId: string, userId: string): Promise<{
    messageId: string;
    imageUrl: string;
    isViewOnce: boolean;
    isViewed: boolean;
    viewedAt: string;
    recipientId?: string;
    groupId?: string;
  }> {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new Error("Message not found.");
    }

    if (!message.isViewOnce) {
      throw new Error("This is not a view-once message.");
    }

    if (message.isViewed) {
      throw new Error("This photo has already expired and cannot be viewed again.");
    }

    const currentImageUrl = message.imageUrl;
    const currentPublicId = message.imagePublicId;

    if (!currentImageUrl) {
      throw new Error("Photo is no longer available.");
    }

    const viewedAt = new Date();

    // Mark as viewed in DB immediately so no one can re-open it
    await prisma.message.update({
      where: { id: messageId },
      data: {
        isViewed: true,
        viewedAt,
        viewedByUserId: userId,
        imageUrl: null, // Wipe URL in DB so subsequent fetches return null
      },
    });

    // Invalidate caches so other clients no longer receive the destroyed photo URL
    if (message.groupId) {
      serverCache.invalidateTag(`group:${message.groupId}`);
    }
    if (message.recipientId) {
      serverCache.invalidateTag(`user:${userId}`);
      serverCache.invalidateTag(`user:${message.recipientId}`);
      serverCache.invalidateTag(`user:${message.senderId}`);
      const pair = [message.senderId, message.recipientId].sort().join(":");
      serverCache.invalidateTag(`pair:${pair}`);
    }
    serverCache.invalidateTag("msg:global");

    // Permanently destroy photo from Cloudinary (with short grace buffer for the current viewing session)
    if (currentPublicId) {
      setTimeout(async () => {
        try {
          await uploadService.deleteImage(currentPublicId);
          console.log(`[Cloudinary] View-once photo ${currentPublicId} permanently destroyed!`);
        } catch (err: any) {
          console.error(`[Cloudinary] Error destroying view-once photo:`, err?.message || err);
        }
      }, 30000); // 30s session viewing grace window
    }

    return {
      messageId: message.id,
      imageUrl: currentImageUrl,
      isViewOnce: true,
      isViewed: true,
      viewedAt: viewedAt.toISOString(),
      recipientId: message.recipientId || undefined,
      groupId: message.groupId || undefined,
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
      select: { id: true, senderId: true, recipientId: true, groupId: true },
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

      // Invalidate relevant message caches so fresh read status is reflected
      serverCache.invalidateTag(`user:${userId}`);
      for (const tm of targetMessages) {
        serverCache.invalidateTag(`user:${tm.senderId}`);
        if (tm.recipientId) {
          const pair = [tm.senderId, tm.recipientId].sort().join(":");
          serverCache.invalidateTag(`pair:${pair}`);
        }
        if (tm.groupId) {
          serverCache.invalidateTag(`group:${tm.groupId}`);
        }
      }
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
    const email = payload.email?.trim().toLowerCase() || null;
    const password = payload.password?.trim();
    const clerkId = payload.clerkId?.trim() || null;

    if (!name || name.length < 2) {
      throw new Error("Name must be at least 2 characters.");
    }
    if (!username || username.length < 3) {
      throw new Error("Username must be at least 3 characters.");
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      throw new Error("Username can only contain letters, numbers, and underscores.");
    }
    // Strict 10-digit Indian phone number requirement with +91 static prefix starting with 6, 7, 8, 9
    const rawPhoneDigits = payload.phoneNumber?.replace(/[^0-9]/g, "") || "";
    const last10Phone = rawPhoneDigits.slice(-10);
    if (last10Phone.length !== 10) {
      throw new Error("Phone number must be exactly 10 digits.");
    }
    if (!/^[6-9]/.test(last10Phone)) {
      throw new Error("Mobile number must start with 6, 7, 8, or 9 after +91. Other numbers are not allowed.");
    }
    const formattedPhone = "+91" + last10Phone;

    // Verify phone number using Veriphone API
    const veriphoneCheck = await this.verifyPhoneNumberWithVeriphone(formattedPhone);
    if (!veriphoneCheck.isValid) {
      throw new Error("Phone number is not valid in India according to Veriphone verification.");
    }

    if (password && password.length < 4) {
      throw new Error("Password must be at least 4 characters.");
    }

    const existingByUsername = await prisma.user.findUnique({
      where: { username },
    });
    if (existingByUsername) {
      throw new Error(`Username "@${username}" is already taken. Please choose another.`);
    }

    const existingByPhone = await prisma.user.findFirst({
      where: {
        OR: [
          { phoneNumber: formattedPhone },
          { phoneNumber: last10Phone },
        ],
      },
    });
    if (existingByPhone) {
      throw new Error(`Phone number "${formattedPhone}" is already registered.`);
    }

    if (email) {
      const existingByEmail = await prisma.user.findUnique({
        where: { email },
      });
      if (existingByEmail) {
        throw new Error(`Email "${email}" is already registered to another account.`);
      }
    }

    if (clerkId) {
      const existingByClerk = await prisma.user.findUnique({
        where: { clerkId },
      });
      if (existingByClerk) {
        throw new Error("A profile is already linked to this Clerk account.");
      }
    }

    const hashedPassword = password ? hashPassword(password) : null;

    const user = await prisma.user.create({
      data: {
        name,
        username,
        phoneNumber: formattedPhone,
        email,
        password: hashedPassword,
        clerkId,
      },
    });

    if (payload.avatarUrl) {
      this.userAvatars.set(user.id, payload.avatarUrl);
      this.saveAvatars();
    }

    serverCache.invalidateTag("users");

    return this.formatUser(user);
  }

  async loginUser(identifier: string, password?: string): Promise<ChatUser> {
    const raw = identifier.trim();
    const cleanId = raw.toLowerCase().replace(/^@/, "");
    if (!cleanId) {
      throw new Error("Please enter your username, phone number, or email.");
    }

    const rawDigits = raw.replace(/[^0-9]/g, "");
    const last10Digits = rawDigits.length >= 10 ? rawDigits.slice(-10) : "";
    const plus91 = last10Digits ? "+91" + last10Digits : "";

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: cleanId },
          { phoneNumber: raw },
          ...(plus91 ? [{ phoneNumber: plus91 }] : []),
          ...(last10Digits ? [{ phoneNumber: last10Digits }] : []),
          { email: cleanId },
        ],
      },
    });

    if (!user) {
      throw new Error(`No user found matching "${raw}".`);
    }

    if (user.password) {
      if (!password) {
        throw new Error("Password is required to sign in.");
      }
      const isValid = verifyPassword(password, user.password);
      if (!isValid) {
        throw new Error("Incorrect password. Please try again.");
      }
    }

    return this.formatUser(user);
  }

  async getUserByClerkId(clerkId: string, email?: string): Promise<ChatUser | null> {
    const cleanClerkId = clerkId?.trim();
    const cleanEmail = email?.trim().toLowerCase();

    // 1. Try finding by clerkId first
    if (cleanClerkId) {
      const user = await prisma.user.findUnique({
        where: { clerkId: cleanClerkId },
      });
      if (user) {
        if (cleanEmail && !user.email) {
          const updated = await prisma.user.update({
            where: { id: user.id },
            data: { email: cleanEmail },
          });
          return this.formatUser(updated);
        }
        return this.formatUser(user);
      }
    }

    // 2. If not found by clerkId, try finding by email
    if (cleanEmail) {
      const user = await prisma.user.findUnique({
        where: { email: cleanEmail },
      });
      if (user) {
        // Auto-link clerkId if not set or changed
        if (cleanClerkId && user.clerkId !== cleanClerkId) {
          const updated = await prisma.user.update({
            where: { id: user.id },
            data: { clerkId: cleanClerkId },
          });
          return this.formatUser(updated);
        }
        return this.formatUser(user);
      }
    }

    return null;
  }

  async verifyPhoneNumberWithVeriphone(phoneNumber: string): Promise<{
    isValid: boolean;
    carrier?: string;
    country?: string;
    reason?: string;
  }> {
    const rawDigits = phoneNumber.replace(/[^0-9]/g, "");
    const last10 = rawDigits.slice(-10);
    const fullNumber = "+91" + last10;

    // Strict rule: Indian mobile numbers must start with 6, 7, 8, or 9
    if (last10.length !== 10 || !/^[6-9]/.test(last10)) {
      return {
        isValid: false,
        country: "India",
        reason: "Mobile number must start with 6, 7, 8, or 9 after +91",
      };
    }

    try {
      const apiKey = config.veriphoneApiKey || "AD445244531A4D7FB4C9D09609D7B87B";
      const baseUrl = config.veriphoneUrl || "https://api.veriphone.io/v2/verify";
      const url = `${baseUrl}?key=${encodeURIComponent(apiKey)}&phone=${encodeURIComponent(fullNumber)}`;

      const res = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(6000),
      });

      if (res.ok) {
        const data = (await res.json()) as any;
        if (data && data.status === "success") {
          return {
            isValid: Boolean(data.phone_valid),
            carrier: data.carrier || undefined,
            country: data.country || undefined,
            reason: data.reason || undefined,
          };
        }
      }
    } catch (err) {
      console.warn("[MessagesService] Veriphone API request failed, using Indian mobile rule fallback:", err);
    }

    // Fallback rule for Indian 10-digit mobile numbers: starts with 6, 7, 8, or 9
    const isIndianMobile = /^[6-9]\d{9}$/.test(last10);
    return {
      isValid: isIndianMobile,
      country: "India",
    };
  }

  async checkAvailability(username?: string, phoneNumber?: string): Promise<CheckAvailabilityResponse> {
    let usernameAvailable = true;
    let phoneAvailable = true;
    let phoneValid: boolean | undefined = undefined;
    let phoneMessage: string | undefined = undefined;
    let phoneCarrier: string | undefined = undefined;

    if (username) {
      const cleanUsername = username.trim().toLowerCase().replace(/^@/, "");
      const existing = await prisma.user.findUnique({ where: { username: cleanUsername } });
      usernameAvailable = !existing;
    }

    if (phoneNumber) {
      const rawDigits = phoneNumber.replace(/[^0-9]/g, "");
      const last10 = rawDigits.slice(-10);

      if (last10.length !== 10) {
        phoneValid = false;
        phoneAvailable = true;
        phoneMessage = "Phone number must be exactly 10 digits";
      } else if (!/^[6-9]/.test(last10)) {
        phoneValid = false;
        phoneAvailable = true;
        phoneMessage = "Mobile number must start with 6, 7, 8, or 9 after +91. Other numbers are not allowed.";
      } else {
        const formattedPhone = "+91" + last10;

        const existing = await prisma.user.findFirst({
          where: {
            OR: [
              { phoneNumber: formattedPhone },
              { phoneNumber: last10 },
            ],
          },
        });
        phoneAvailable = !existing;

        const verifyResult = await this.verifyPhoneNumberWithVeriphone(formattedPhone);
        phoneValid = verifyResult.isValid;
        phoneCarrier = verifyResult.carrier;

        if (!verifyResult.isValid) {
          phoneMessage = "Phone number is not valid in India according to Veriphone verification";
        } else if (!phoneAvailable) {
          phoneMessage = "This phone number is already registered";
        } else {
          phoneMessage = verifyResult.carrier
            ? `Valid (${verifyResult.carrier})`
            : "Valid Indian mobile number";
        }
      }
    }

    return {
      usernameAvailable,
      phoneAvailable,
      phoneValid,
      phoneMessage,
      phoneCarrier,
    };
  }

  async getAllUsers(query?: string): Promise<ChatUser[]> {
    const clean = query?.trim().toLowerCase().replace(/^@/, "");
    const cacheKey = `users:all:${clean || ""}`;

    return serverCache.getOrSet(
      cacheKey,
      async () => {
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

        return users.map((u) => this.formatUser(u));
      },
      60_000,
      ["users"]
    );
  }

  async updateUserName(userId: string, newName: string): Promise<ChatUser> {
    return this.updateUserProfile(userId, { name: newName });
  }

  async updateUserProfile(
    userId: string,
    data: { name?: string; avatarUrl?: string | null }
  ): Promise<ChatUser> {
    let updatedUser = await prisma.user.findUnique({
      where: { id: userId },
    });
    if (!updatedUser) {
      throw new Error("User not found");
    }

    if (data.name !== undefined) {
      const cleanName = data.name.trim();
      if (!cleanName || cleanName.length < 2) {
        throw new Error("Name must be at least 2 characters.");
      }
      updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { name: cleanName },
      });
    }

    if (data.avatarUrl !== undefined) {
      if (data.avatarUrl) {
        this.userAvatars.set(userId, data.avatarUrl);
      } else {
        this.userAvatars.delete(userId);
      }
      this.saveAvatars();
    }

    serverCache.invalidateTag("users");

    return this.formatUser(updatedUser);
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

    serverCache.invalidateTag("groups");
    for (const uid of inviteUserIds) {
      serverCache.invalidateTag(`invitations:${uid}`);
    }

    return { group: groupResult, invitations: createdInvitations };
  }

  async getGroups(userId?: string): Promise<GroupChat[]> {
    const cacheKey = `groups:${userId || "all"}`;
    const tags = ["groups"];
    if (userId) tags.push(`groups:${userId}`);

    return serverCache.getOrSet(
      cacheKey,
      async () => {
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
      },
      60_000,
      tags
    );
  }

  async getUserInvitations(userId: string): Promise<GroupInvitationInfo[]> {
    const cacheKey = `invitations:${userId}`;
    return serverCache.getOrSet(
      cacheKey,
      async () => {
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
      },
      60_000,
      [`invitations:${userId}`]
    );
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

    serverCache.invalidateTag("groups");
    serverCache.invalidateTag(`group:${groupId}`);
    for (const uid of memberUserIds) {
      serverCache.invalidateTag(`invitations:${uid}`);
    }

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

    serverCache.invalidateTag("groups");
    serverCache.invalidateTag(`invitations:${userId}`);
    serverCache.invalidateTag(`group:${inv.groupId}`);

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

    serverCache.invalidateTag("groups");
    serverCache.invalidateTag(`group:${groupId}`);

    return this.formatGroup(updated);
  }

  async endChugliGroup(groupId: string, userId: string): Promise<{ id: string; name: string }> {
    return this.deleteGroup(groupId, userId);
  }

  async deleteGroup(groupId: string, userId: string): Promise<{ id: string; name: string }> {
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: true,
      },
    });

    if (!group) {
      throw new Error("Group not found.");
    }

    const isAdmin =
      group.createdById === userId ||
      group.members.some((m) => m.userId === userId && m.role === "admin");

    if (!isAdmin) {
      throw new Error("Only a group admin can delete this group.");
    }

    await prisma.group.delete({ where: { id: groupId } });

    serverCache.invalidateTag("groups");
    serverCache.invalidateTag(`group:${groupId}`);

    return { id: group.id, name: group.name };
  }

  async leaveGroup(groupId: string, userId: string): Promise<{
    group: GroupChat | null;
    isDeleted: boolean;
    groupId: string;
    groupName: string;
    userId: string;
    userName: string;
  }> {
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, username: true } },
          },
        },
      },
    });

    if (!group) {
      throw new Error("Group not found.");
    }

    const member = group.members.find((m) => m.userId === userId);
    if (!member) {
      throw new Error("You are not a member of this group.");
    }

    const userName = member.user?.name || "Member";

    // Delete the group membership
    await prisma.groupMember.delete({
      where: { groupId_userId: { groupId, userId } },
    });

    const remainingMembers = group.members.filter((m) => m.userId !== userId);

    if (remainingMembers.length === 0) {
      // Last member exited: delete group completely
      await prisma.group.delete({ where: { id: groupId } });

      serverCache.invalidateTag("groups");
      serverCache.invalidateTag(`group:${groupId}`);
      serverCache.invalidateTag(`groups:${userId}`);

      return {
        group: null,
        isDeleted: true,
        groupId: group.id,
        groupName: group.name,
        userId,
        userName,
      };
    }

    // If leaving member was admin/creator, ensure at least one admin remains
    const hasOtherAdmin = remainingMembers.some((m) => m.role === "admin");
    if (!hasOtherAdmin && remainingMembers.length > 0) {
      const nextAdmin = remainingMembers[0];
      await prisma.groupMember.update({
        where: { groupId_userId: { groupId, userId: nextAdmin.userId } },
        data: { role: "admin" },
      });
      if (group.createdById === userId) {
        await prisma.group.update({
          where: { id: groupId },
          data: { createdById: nextAdmin.userId },
        });
      }
    }

    // Create notice message in the group
    try {
      await prisma.message.create({
        data: {
          groupId,
          senderId: userId,
          senderName: group.isChugli ? "Secret Member" : userName,
          senderUsername: group.isChugli ? "secret" : member.user.username,
          text: group.isChugli ? "🕵️ A secret member left the chat" : `🚪 ${userName} left the group`,
        },
      });
    } catch (msgErr) {
      console.warn("Could not post group leave notice:", msgErr);
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

    serverCache.invalidateTag("groups");
    serverCache.invalidateTag(`groups:${userId}`);
    serverCache.invalidateTag(`group:${groupId}`);
    serverCache.invalidateTag(`user:${userId}`);

    return {
      group: this.formatGroup(updated),
      isDeleted: false,
      groupId: group.id,
      groupName: group.name,
      userId,
      userName,
    };
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

    serverCache.invalidateTag("groups");
    serverCache.invalidateTag(`group:${groupId}`);

    return this.formatGroup(updated);
  }

  async checkChugliStatus(io?: any): Promise<void> {
    try {
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
    } catch {
      // Gracefully ignore transient database wake-up / network hiccups in background timer
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

    if (updated.groupId) {
      serverCache.invalidateTag(`group:${updated.groupId}`);
    }
    if (updated.recipientId) {
      serverCache.invalidateTag(`user:${userId}`);
      serverCache.invalidateTag(`user:${updated.recipientId}`);
      const pair = [userId, updated.recipientId].sort().join(":");
      serverCache.invalidateTag(`pair:${pair}`);
    }
    serverCache.invalidateTag("msg:global");

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

    if (msg.groupId) {
      serverCache.invalidateTag(`group:${msg.groupId}`);
    }
    if (msg.recipientId) {
      serverCache.invalidateTag(`user:${userId}`);
      serverCache.invalidateTag(`user:${msg.recipientId}`);
      const pair = [userId, msg.recipientId].sort().join(":");
      serverCache.invalidateTag(`pair:${pair}`);
    }
    serverCache.invalidateTag("msg:global");

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

  // --- Clear Chat History (Delete all messages for user) ---
  async clearChat(params: {
    currentUserId: string;
    recipientId?: string;
    groupId?: string;
  }): Promise<{ clearedCount: number }> {
    const { currentUserId, recipientId, groupId } = params;

    let where: any = undefined;
    if (groupId) {
      where = { groupId };
    } else if (recipientId) {
      where = {
        OR: [
          { senderId: currentUserId, recipientId },
          { senderId: recipientId, recipientId: currentUserId },
        ],
      };
    } else {
      throw new Error("recipientId or groupId is required to clear chat.");
    }

    const messages = await prisma.message.findMany({
      where,
      select: { id: true, deletedForUserIds: true },
    });

    const toUpdate = messages.filter(
      (m) => !m.deletedForUserIds.includes(currentUserId)
    );

    await Promise.all(
      toUpdate.map((m) =>
        prisma.message.update({
          where: { id: m.id },
          data: {
            deletedForUserIds: {
              push: currentUserId,
            },
          },
        })
      )
    );

    if (groupId) {
      serverCache.invalidateTag(`group:${groupId}`);
    }
    if (recipientId) {
      serverCache.invalidateTag(`user:${currentUserId}`);
      serverCache.invalidateTag(`user:${recipientId}`);
      const pair = [currentUserId, recipientId].sort().join(":");
      serverCache.invalidateTag(`pair:${pair}`);
    }
    serverCache.invalidateTag("msg:global");

    return { clearedCount: toUpdate.length };
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

    serverCache.invalidateTag(`blocked:${blockerId}`);
    serverCache.invalidateTag(`user:${blockerId}`);
    serverCache.invalidateTag(`user:${targetUserId}`);
  }

  async unblockUser(blockerId: string, targetUserId: string): Promise<void> {
    await prisma.blockedUser.deleteMany({
      where: {
        blockerId,
        blockedUserId: targetUserId,
      },
    });

    serverCache.invalidateTag(`blocked:${blockerId}`);
    serverCache.invalidateTag(`user:${blockerId}`);
    serverCache.invalidateTag(`user:${targetUserId}`);
  }

  async getBlockedUserIds(blockerId: string): Promise<string[]> {
    return serverCache.getOrSet(
      `blockedIds:${blockerId}`,
      async () => {
        const list = await prisma.blockedUser.findMany({
          where: { blockerId },
          select: { blockedUserId: true },
        });
        return list.map((b) => b.blockedUserId);
      },
      60_000,
      [`blocked:${blockerId}`]
    );
  }

  async getBlockedUsers(blockerId: string): Promise<ChatUser[]> {
    return serverCache.getOrSet(
      `blockedUsers:${blockerId}`,
      async () => {
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
      },
      60_000,
      [`blocked:${blockerId}`]
    );
  }

  // --- Favorite Users (Single Favorite Person Rule) ---
  async addFavoriteUser(userId: string, favoriteUserId: string): Promise<void> {
    if (userId === favoriteUserId) {
      throw new Error("You cannot favorite yourself.");
    }
    // Enforce single favorite person: clear any previous favorite for this user
    await prisma.favoriteUser.deleteMany({
      where: { userId },
    });
    await prisma.favoriteUser.create({
      data: {
        userId,
        favoriteUserId,
      },
    });
    serverCache.invalidateTag(`favorites:${userId}`);
  }

  async removeFavoriteUser(userId: string, favoriteUserId?: string): Promise<void> {
    if (favoriteUserId) {
      await prisma.favoriteUser.deleteMany({
        where: {
          userId,
          favoriteUserId,
        },
      });
    } else {
      await prisma.favoriteUser.deleteMany({
        where: { userId },
      });
    }
    serverCache.invalidateTag(`favorites:${userId}`);
  }

  async toggleFavoriteUser(
    userId: string,
    favoriteUserId: string
  ): Promise<{ isFavorite: boolean; favoriteUserIds: string[] }> {
    if (userId === favoriteUserId) {
      throw new Error("You cannot favorite yourself.");
    }
    const existing = await prisma.favoriteUser.findFirst({
      where: { userId },
    });
    let result: { isFavorite: boolean; favoriteUserIds: string[] };
    if (existing && existing.favoriteUserId === favoriteUserId) {
      await prisma.favoriteUser.delete({
        where: { id: existing.id },
      });
      result = { isFavorite: false, favoriteUserIds: [] };
    } else {
      await prisma.favoriteUser.deleteMany({
        where: { userId },
      });
      await prisma.favoriteUser.create({
        data: { userId, favoriteUserId },
      });
      result = { isFavorite: true, favoriteUserIds: [favoriteUserId] };
    }
    serverCache.invalidateTag(`favorites:${userId}`);
    return result;
  }

  async getFavoriteUserIds(userId: string): Promise<string[]> {
    return serverCache.getOrSet(
      `favorites:${userId}`,
      async () => {
        const list = await prisma.favoriteUser.findMany({
          where: { userId },
          select: { favoriteUserId: true },
        });
        return list.map((f) => f.favoriteUserId);
      },
      60_000,
      [`favorites:${userId}`]
    );
  }

  async getUsersWhoFavorited(favoriteUserId: string): Promise<string[]> {
    const list = await prisma.favoriteUser.findMany({
      where: { favoriteUserId },
      select: { userId: true },
    });
    return list.map((f) => f.userId);
  }

  // ==========================================
  // FRIENDSHIP & FRIEND REQUEST METHODS
  // ==========================================

  async areUsersFriends(userAId: string, userBId: string): Promise<boolean> {
    const friendRecord = await prisma.friendRequest.findFirst({
      where: {
        OR: [
          { senderId: userAId, receiverId: userBId, status: "accepted" },
          { senderId: userBId, receiverId: userAId, status: "accepted" },
        ],
      },
    });
    return Boolean(friendRecord);
  }

  async getFriendshipStatus(userAId: string, userBId: string): Promise<FriendStatusResponse> {
    const record = await prisma.friendRequest.findFirst({
      where: {
        OR: [
          { senderId: userAId, receiverId: userBId },
          { senderId: userBId, receiverId: userAId },
        ],
      },
      orderBy: { updatedAt: "desc" },
    });

    if (!record) {
      return { status: "none", isFriend: false };
    }

    if (record.status === "accepted") {
      return { status: "friends", requestId: record.id, isFriend: true };
    }

    if (record.status === "pending") {
      if (record.senderId === userAId) {
        return { status: "pending_sent", requestId: record.id, isFriend: false };
      } else {
        return { status: "pending_received", requestId: record.id, isFriend: false };
      }
    }

    return { status: "none", requestId: record.id, isFriend: false };
  }

  async sendFriendRequest(senderId: string, targetUsername: string): Promise<FriendRequestInfo> {
    const cleanUsername = targetUsername.trim().replace(/^@/, "").toLowerCase();
    if (!cleanUsername) {
      throw new Error("Username is required.");
    }

    const sender = await prisma.user.findUnique({
      where: { id: senderId },
    });
    if (!sender) {
      throw new Error("Sender not found.");
    }

    const targetUser = await prisma.user.findFirst({
      where: { username: { equals: cleanUsername, mode: "insensitive" } },
    });
    if (!targetUser) {
      throw new Error(`User with username "@${cleanUsername}" not found.`);
    }

    if (targetUser.id === senderId) {
      throw new Error("You cannot send a friend request to yourself.");
    }

    // Check existing request
    const existing = await prisma.friendRequest.findFirst({
      where: {
        OR: [
          { senderId, receiverId: targetUser.id },
          { senderId: targetUser.id, receiverId: senderId },
        ],
      },
    });

    if (existing) {
      if (existing.status === "accepted") {
        throw new Error(`You are already friends with @${targetUser.username}.`);
      }
      if (existing.status === "pending") {
        if (existing.senderId === senderId) {
          throw new Error("Friend request is already pending.");
        } else {
          // The other user already sent a request to this user! Auto-accept it!
          const updated = await prisma.friendRequest.update({
            where: { id: existing.id },
            data: { status: "accepted" },
            include: {
              sender: { select: { id: true, name: true, username: true, phoneNumber: true } },
              receiver: { select: { id: true, name: true, username: true, phoneNumber: true } },
            },
          });
          serverCache.invalidateTag(`friends:${senderId}`);
          serverCache.invalidateTag(`friends:${targetUser.id}`);

          return {
            id: updated.id,
            senderId: updated.senderId,
            receiverId: updated.receiverId,
            status: "accepted",
            createdAt: updated.createdAt.toISOString(),
            updatedAt: updated.updatedAt.toISOString(),
            sender: updated.sender,
            receiver: updated.receiver,
          };
        }
      }
      // If declined previously, re-open as pending
      const updated = await prisma.friendRequest.update({
        where: { id: existing.id },
        data: {
          senderId,
          receiverId: targetUser.id,
          status: "pending",
        },
        include: {
          sender: { select: { id: true, name: true, username: true, phoneNumber: true } },
          receiver: { select: { id: true, name: true, username: true, phoneNumber: true } },
        },
      });

      serverCache.invalidateTag(`friends:${senderId}`);
      serverCache.invalidateTag(`friends:${targetUser.id}`);

      return {
        id: updated.id,
        senderId: updated.senderId,
        receiverId: updated.receiverId,
        status: "pending",
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
        sender: updated.sender ? this.formatUser(updated.sender) : undefined,
        receiver: updated.receiver ? this.formatUser(updated.receiver) : undefined,
      };
    }

    const created = await prisma.friendRequest.create({
      data: {
        senderId,
        receiverId: targetUser.id,
        status: "pending",
      },
      include: {
        sender: { select: { id: true, name: true, username: true, phoneNumber: true } },
        receiver: { select: { id: true, name: true, username: true, phoneNumber: true } },
      },
    });

    serverCache.invalidateTag(`friends:${senderId}`);
    serverCache.invalidateTag(`friends:${targetUser.id}`);

    return {
      id: created.id,
      senderId: created.senderId,
      receiverId: created.receiverId,
      status: "pending",
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
      sender: created.sender ? this.formatUser(created.sender) : undefined,
      receiver: created.receiver ? this.formatUser(created.receiver) : undefined,
    };
  }

  async respondFriendRequest(
    requestId: string,
    userId: string,
    action: "accept" | "declined"
  ): Promise<FriendRequestInfo> {
    const request = await prisma.friendRequest.findUnique({
      where: { id: requestId },
      include: {
        sender: { select: { id: true, name: true, username: true, phoneNumber: true } },
        receiver: { select: { id: true, name: true, username: true, phoneNumber: true } },
      },
    });

    if (!request) {
      throw new Error("Friend request not found.");
    }
    if (request.receiverId !== userId) {
      throw new Error("You are not authorized to respond to this friend request.");
    }

    const newStatus = action === "accept" ? "accepted" : "declined";
    const updated = await prisma.friendRequest.update({
      where: { id: requestId },
      data: { status: newStatus },
      include: {
        sender: { select: { id: true, name: true, username: true, phoneNumber: true } },
        receiver: { select: { id: true, name: true, username: true, phoneNumber: true } },
      },
    });

    serverCache.invalidateTag(`friends:${userId}`);
    serverCache.invalidateTag(`friends:${request.senderId}`);

    return {
      id: updated.id,
      senderId: updated.senderId,
      receiverId: updated.receiverId,
      status: updated.status as "accepted" | "declined",
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      sender: updated.sender ? this.formatUser(updated.sender) : undefined,
      receiver: updated.receiver ? this.formatUser(updated.receiver) : undefined,
    };
  }

  async getUserFriends(userId: string): Promise<{
    friends: ChatUser[];
    friendIds: string[];
    incomingRequests: FriendRequestInfo[];
    outgoingRequests: FriendRequestInfo[];
  }> {
    const cacheKey = `friends:${userId}`;
    return serverCache.getOrSet(
      cacheKey,
      async () => {
        const allRequests = await prisma.friendRequest.findMany({
          where: {
            OR: [{ senderId: userId }, { receiverId: userId }],
          },
          include: {
            sender: { select: { id: true, name: true, username: true, phoneNumber: true } },
            receiver: { select: { id: true, name: true, username: true, phoneNumber: true } },
          },
          orderBy: { updatedAt: "desc" },
        });

        const friends: ChatUser[] = [];
        const friendIds: string[] = [];
        const incomingRequests: FriendRequestInfo[] = [];
        const outgoingRequests: FriendRequestInfo[] = [];

        for (const req of allRequests) {
          if (req.status === "accepted") {
            const friendUser = req.senderId === userId ? req.receiver : req.sender;
            if (friendUser && !friendIds.includes(friendUser.id)) {
              friends.push(this.formatUser(friendUser));
              friendIds.push(friendUser.id);
            }
          } else if (req.status === "pending") {
            const formatted: FriendRequestInfo = {
              id: req.id,
              senderId: req.senderId,
              receiverId: req.receiverId,
              status: "pending",
              createdAt: req.createdAt.toISOString(),
              updatedAt: req.updatedAt.toISOString(),
              sender: req.sender ? this.formatUser(req.sender) : undefined,
              receiver: req.receiver ? this.formatUser(req.receiver) : undefined,
            };
            if (req.receiverId === userId) {
              incomingRequests.push(formatted);
            } else {
              outgoingRequests.push(formatted);
            }
          } else if (req.status === "declined" && req.senderId === userId) {
            // Declined request: shown in the sender's sent requests list with status declined
            const formatted: FriendRequestInfo = {
              id: req.id,
              senderId: req.senderId,
              receiverId: req.receiverId,
              status: "declined",
              createdAt: req.createdAt.toISOString(),
              updatedAt: req.updatedAt.toISOString(),
              sender: req.sender ? this.formatUser(req.sender) : undefined,
              receiver: req.receiver ? this.formatUser(req.receiver) : undefined,
            };
            outgoingRequests.push(formatted);
          }
        }

        return { friends, friendIds, incomingRequests, outgoingRequests };
      },
      60_000,
      [`friends:${userId}`]
    );
  }

  /**
   * Unfriend a user: Removes the friendship record and any favorite association,
   * cleanly transitioning the other user back to 'non-friend' state.
   */
  async unfriendUser(userAId: string, userBId: string): Promise<{ success: boolean; targetUserId: string }> {
    // Delete any existing friendRequest records between both users
    await prisma.friendRequest.deleteMany({
      where: {
        OR: [
          { senderId: userAId, receiverId: userBId },
          { senderId: userBId, receiverId: userAId },
        ],
      },
    });

    // Also clear from favorites if either user favorited the other
    await prisma.favoriteUser.deleteMany({
      where: {
        OR: [
          { userId: userAId, favoriteUserId: userBId },
          { userId: userBId, favoriteUserId: userAId },
        ],
      },
    });

    // Invalidate friends and favorites cache for both users
    serverCache.invalidateTag(`friends:${userAId}`);
    serverCache.invalidateTag(`friends:${userBId}`);
    serverCache.invalidateTag(`favorites:${userAId}`);
    serverCache.invalidateTag(`favorites:${userBId}`);

    // Also remove any custom nicknames between both users
    const mapA = this.userContactAliases.get(userAId);
    if (mapA) mapA.delete(userBId);
    const mapB = this.userContactAliases.get(userBId);
    if (mapB) mapB.delete(userAId);

    return { success: true, targetUserId: userBId };
  }

  // ==========================================
  // PRIVATE CONTACT ALIASES / CUSTOM NICKNAMES
  // ==========================================
  private userContactAliases = new Map<string, Map<string, string>>();

  async getContactAliases(userId: string): Promise<Record<string, string>> {
    const map = this.userContactAliases.get(userId);
    if (!map) return {};
    const obj: Record<string, string> = {};
    for (const [targetId, alias] of map.entries()) {
      obj[targetId] = alias;
    }
    return obj;
  }

  async setContactAlias(
    userId: string,
    targetUserId: string,
    customName: string
  ): Promise<{ success: boolean; customName: string }> {
    // Only friends can be renamed
    const isFriend = await this.areUsersFriends(userId, targetUserId);
    if (!isFriend) {
      throw new Error("You can only rename your friends.");
    }

    const clean = (customName || "").trim();
    let userMap = this.userContactAliases.get(userId);
    if (!userMap) {
      userMap = new Map();
      this.userContactAliases.set(userId, userMap);
    }

    if (!clean) {
      userMap.delete(targetUserId);
      return { success: true, customName: "" };
    }

    userMap.set(targetUserId, clean);
    return { success: true, customName: clean };
  }

  async deleteContactAlias(userId: string, targetUserId: string): Promise<{ success: boolean }> {
    const userMap = this.userContactAliases.get(userId);
    if (userMap) {
      userMap.delete(targetUserId);
    }
    return { success: true };
  }

  // ==========================================
  // LIVE MESSAGE TRANSLATION (English -> Hindi)
  // ==========================================
  private translationCache = new Map<string, string>();

  async translateText(
    text: string,
    targetLang = "hi"
  ): Promise<{ original: string; translated: string; targetLang: string }> {
    const clean = (text || "").trim();
    if (!clean) {
      return { original: "", translated: "", targetLang };
    }

    const cacheKey = `${targetLang}:${clean}`;
    if (this.translationCache.has(cacheKey)) {
      return { original: clean, translated: this.translationCache.get(cacheKey)!, targetLang };
    }

    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(clean)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = (await res.json()) as any;
        if (Array.isArray(data) && Array.isArray(data[0])) {
          const translated = data[0].map((item: any) => item[0]).join("").trim();
          // If translation succeeded and produced target Hindi script (or translated text != clean)
          if (translated) {
            const hasHindi = /[\u0900-\u097F]/.test(translated);
            if (hasHindi && translated.toLowerCase() !== clean.toLowerCase()) {
              this.translationCache.set(cacheKey, translated);
              return { original: clean, translated, targetLang };
            }
          }
        }
      }
    } catch (err: any) {
      console.warn("[Translation] Primary Google Translate failed, trying fallback:", err.message);
    }

    // Hinglish / Romanized Hindi Fallback: Google Input Tools (e.g. "Sb sahi" -> "सब सही")
    if (targetLang === "hi") {
      try {
        const itUrl = `https://inputtools.google.com/request?text=${encodeURIComponent(clean)}&itc=hi-t-i0-und&num=1&cp=0&cs=1&ie=utf-8&oe=utf-8&app=demopage`;
        const itRes = await fetch(itUrl);
        if (itRes.ok) {
          const itData = (await itRes.json()) as any;
          if (itData[0] === "SUCCESS" && itData[1]?.[0]?.[1]?.[0]) {
            const transliterated = itData[1][0][1][0].trim();
            if (/[\u0900-\u097F]/.test(transliterated)) {
              this.translationCache.set(cacheKey, transliterated);
              return { original: clean, translated: transliterated, targetLang };
            }
          }
        }
      } catch (itErr: any) {
        console.warn("[Translation] Hinglish transliteration failed:", itErr.message);
      }
    }

    // Fallback: MyMemory Translate API
    try {
      const fbUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(clean)}&langpair=en|${encodeURIComponent(targetLang)}`;
      const fbRes = await fetch(fbUrl);
      if (fbRes.ok) {
        const fbData = (await fbRes.json()) as any;
        const translated = fbData?.responseData?.translatedText;
        if (translated) {
          this.translationCache.set(cacheKey, translated);
          return { original: clean, translated, targetLang };
        }
      }
    } catch (fbErr: any) {
      console.warn("[Translation] Fallback translation failed:", fbErr.message);
    }

    return { original: clean, translated: clean, targetLang };
  }
}


export const messagesService = new MessagesService();
