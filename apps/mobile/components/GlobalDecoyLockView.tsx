import React from "react";
import { useDecoyLock } from "@/store/decoy-lock-context";
import { useUser } from "@/store/user-context";
import { DecoyLockScreen } from "@/components/DecoyLockScreen";
import { DecoyLockSetupModal } from "@/components/DecoyLockSetupModal";

export function GlobalDecoyLockView() {
  const { isLocked, isInitialized } = useDecoyLock();
  const { currentUser } = useUser();

  return (
    <>
      {/* Decoy full screen overlay when locked */}
      {isInitialized && isLocked && Boolean(currentUser) && <DecoyLockScreen />}

      {/* Decoy Setup & Lock trigger modal */}
      <DecoyLockSetupModal />
    </>
  );
}
