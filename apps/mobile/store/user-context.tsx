import React, { createContext, useContext, useState } from "react";
import type { ChatUser } from "@chatapp/shared";
import { getServerUrl, setServerUrl } from "@/services/api";

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

function loadSavedUser(): ChatUser | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const data = window.localStorage.getItem(STORAGE_KEY);
      if (data) return JSON.parse(data);
    }
  } catch {}
  return null;
}

function persistUser(user: ChatUser | null) {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      if (user) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }
  } catch {}
}

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUserState] = useState<ChatUser | null>(loadSavedUser);
  const [registeredUsers, setRegisteredUsers] = useState<ChatUser[]>([]);
  const [serverUrl, setUrlState] = useState<string>(getServerUrl());

  const setCurrentUser = (user: ChatUser | null) => {
    setCurrentUserState(user);
    persistUser(user);
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
