import type {
  ChatMessage,
  ChatUser,
  GroupChat,
  GroupInvitationInfo,
  FriendRequestInfo,
} from "@chatapp/shared";
import { getStoredItem, setStoredItem, removeStoredItem } from "./storage";

/**
 * Mobile Persistent & In-Memory Cache Service
 * Provides instant (<1ms) loading for direct messages, groups, registered users,
 * friends, blocked users, and nicknames across restarts and tab transitions.
 */

class MobileCacheService {
  private memoryCache = new Map<string, any>();
  private writeDebounceTimers = new Map<string, any>();

  /**
   * Synchronous getter from in-memory cache
   */
  getSync<T>(key: string): T | null {
    if (this.memoryCache.has(key)) {
      return this.memoryCache.get(key) as T;
    }
    return null;
  }

  /**
   * Retrieve cached data. Checks in-memory cache first, then falls back to persistent storage.
   */
  async get<T>(key: string): Promise<T | null> {
    if (this.memoryCache.has(key)) {
      return this.memoryCache.get(key) as T;
    }

    try {
      const raw = await getStoredItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as T;
        this.memoryCache.set(key, parsed);
        return parsed;
      }
    } catch (e) {
      console.warn(`[CacheService] Failed reading cache key ${key}:`, e);
    }
    return null;
  }

  /**
   * Write data to in-memory cache immediately and save to persistent storage (debounced if needed).
   */
  async set<T>(key: string, value: T, debounceMs = 0): Promise<void> {
    this.memoryCache.set(key, value);

    if (debounceMs > 0) {
      if (this.writeDebounceTimers.has(key)) {
        clearTimeout(this.writeDebounceTimers.get(key));
      }

      this.writeDebounceTimers.set(
        key,
        setTimeout(() => {
          this.writeDebounceTimers.delete(key);
          setStoredItem(key, JSON.stringify(value)).catch((err) => {
            console.warn(`[CacheService] Failed writing persistent cache key ${key}:`, err);
          });
        }, debounceMs)
      );
      return;
    }

    try {
      await setStoredItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn(`[CacheService] Failed writing persistent cache key ${key}:`, e);
    }
  }

  /**
   * Remove cached data from both in-memory cache and persistent storage.
   */
  async remove(key: string): Promise<void> {
    this.memoryCache.delete(key);
    if (this.writeDebounceTimers.has(key)) {
      clearTimeout(this.writeDebounceTimers.get(key));
      this.writeDebounceTimers.delete(key);
    }
    try {
      await removeStoredItem(key);
    } catch {}
  }

  // ==========================================
  // CONVENIENCE HELPERS FOR TYPED DATA
  // ==========================================

  // --- Messages History ---
  getSyncMessages(userId: string): ChatMessage[] | null {
    return this.getSync<ChatMessage[]>(`cache_messages_${userId}`);
  }

  async getCachedMessages(userId: string): Promise<ChatMessage[] | null> {
    return this.get<ChatMessage[]>(`cache_messages_${userId}`);
  }

  async setCachedMessages(userId: string, messages: ChatMessage[]): Promise<void> {
    // Keep max 200 most recent messages in persistent cache to keep storage light and snappy
    const trimmed = messages.length > 200 ? messages.slice(-200) : messages;
    return this.set(`cache_messages_${userId}`, trimmed, 300);
  }

  // --- Registered Users ---
  getSyncUsers(): ChatUser[] | null {
    return this.getSync<ChatUser[]>("cache_all_users");
  }

  async getCachedUsers(): Promise<ChatUser[] | null> {
    return this.get<ChatUser[]>("cache_all_users");
  }

  async setCachedUsers(users: ChatUser[]): Promise<void> {
    return this.set("cache_all_users", users, 300);
  }

  // --- User Friends & Friend Requests ---
  async getCachedFriends(userId: string): Promise<{
    friends: ChatUser[];
    friendIds: string[];
    incomingRequests: FriendRequestInfo[];
    outgoingRequests: FriendRequestInfo[];
  } | null> {
    return this.get(`cache_friends_${userId}`);
  }

  async setCachedFriends(
    userId: string,
    data: {
      friends: ChatUser[];
      friendIds: string[];
      incomingRequests: FriendRequestInfo[];
      outgoingRequests: FriendRequestInfo[];
    }
  ): Promise<void> {
    return this.set(`cache_friends_${userId}`, data, 300);
  }

  // --- Blocked Users ---
  async getCachedBlocked(userId: string): Promise<{
    blockedUsers: ChatUser[];
    blockedUserIds: string[];
  } | null> {
    return this.get(`cache_blocked_${userId}`);
  }

  async setCachedBlocked(
    userId: string,
    data: { blockedUsers: ChatUser[]; blockedUserIds: string[] }
  ): Promise<void> {
    return this.set(`cache_blocked_${userId}`, data, 300);
  }

  // --- Favorite User IDs ---
  async getCachedFavorites(userId: string): Promise<string[] | null> {
    return this.get<string[]>(`cache_favorites_${userId}`);
  }

  async setCachedFavorites(userId: string, favoriteUserIds: string[]): Promise<void> {
    return this.set(`cache_favorites_${userId}`, favoriteUserIds, 300);
  }

  // --- Contact Nickname Aliases ---
  async getCachedAliases(userId: string): Promise<Record<string, string> | null> {
    return this.get<Record<string, string>>(`cache_aliases_${userId}`);
  }

  async setCachedAliases(userId: string, aliases: Record<string, string>): Promise<void> {
    return this.set(`cache_aliases_${userId}`, aliases, 300);
  }

  // --- Groups ---
  getSyncGroups(userId: string): GroupChat[] | null {
    return this.getSync<GroupChat[]>(`cache_groups_${userId}`);
  }

  async getCachedGroups(userId: string): Promise<GroupChat[] | null> {
    return this.get<GroupChat[]>(`cache_groups_${userId}`);
  }

  async setCachedGroups(userId: string, groups: GroupChat[]): Promise<void> {
    return this.set(`cache_groups_${userId}`, groups, 300);
  }

  // --- Group Invitations ---
  async getCachedInvitations(userId: string): Promise<GroupInvitationInfo[] | null> {
    return this.get<GroupInvitationInfo[]>(`cache_invitations_${userId}`);
  }

  async setCachedInvitations(
    userId: string,
    invitations: GroupInvitationInfo[]
  ): Promise<void> {
    return this.set(`cache_invitations_${userId}`, invitations, 300);
  }

  /**
   * Preload critical user data into memory at app start for 0ms synchronous renders.
   */
  async preloadCache(userId: string): Promise<void> {
    try {
      await Promise.all([
        this.getCachedMessages(userId),
        this.getCachedUsers(),
        this.getCachedFriends(userId),
        this.getCachedBlocked(userId),
        this.getCachedFavorites(userId),
        this.getCachedAliases(userId),
        this.getCachedGroups(userId),
        this.getCachedInvitations(userId),
      ]);
    } catch (e) {
      console.warn("[CacheService] preloadCache error:", e);
    }
  }
}

export const mobileCache = new MobileCacheService();
