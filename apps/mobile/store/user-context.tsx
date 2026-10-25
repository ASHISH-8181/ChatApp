import React, { createContext, useContext, useState, useEffect } from "react";
import type { ChatUser } from "@chatapp/shared";
import { getServerUrl, setServerUrl } from "@/services/api";
import { getStoredItem, setStoredItem, removeStoredItem } from "@/services/storage";
import { mobileCache } from "@/services/cache";

interface UserContextValue {
  currentUser: ChatUser | null;
  registeredUsers: ChatUser[];
  serverUrl: string;
  setCurrentUser: (user: ChatUser | null) => void;
  setRegisteredUsers: (users: ChatUser[]) => void;
  clearUser: () => void;
  updateServerUrl: (url: string) => void;
}

const UserContext = createContext<UserContextValue | undefined>(undefined);

const STORAGE_KEY = "chatapp_current_user";

function loadSavedUserSync(): ChatUser | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const data = window.localStorage.getItem(STORAGE_KEY);
      if (data) return JSON.parse(data);
    }
  } catch {}
  return null;
}

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUserState] = useState<ChatUser | null>(loadSavedUserSync);
  const [registeredUsers, setRegisteredUsers] = useState<ChatUser[]>([]);
  const [serverUrl, setUrlState] = useState<string>(getServerUrl());

  // Load persisted user on native startup and preload cache
  useEffect(() => {
    getStoredItem(STORAGE_KEY).then((data) => {
      if (data) {
        try {
          const user = JSON.parse(data) as ChatUser;
          setCurrentUserState(user);
          mobileCache.preloadCache(user.id).catch(() => {});
        } catch {}
      }
    });
  }, []);

  const setCurrentUser = (user: ChatUser | null) => {
    setCurrentUserState(user);
    if (user) {
      setStoredItem(STORAGE_KEY, JSON.stringify(user)).catch(() => {});
      mobileCache.preloadCache(user.id).catch(() => {});
    } else {
      removeStoredItem(STORAGE_KEY).catch(() => {});
    }
  };

  const clearUser = () => {
    setCurrentUser(null);
  };

  const updateServerUrl = (url: string) => {
    setServerUrl(url);
    setUrlState(getServerUrl());
  };

  return (
    <UserContext.Provider
      value={{
        currentUser,
        registeredUsers,
        serverUrl,
        setCurrentUser,
        setRegisteredUsers,
        clearUser,
        updateServerUrl,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser(): UserContextValue {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}
