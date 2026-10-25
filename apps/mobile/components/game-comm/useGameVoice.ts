import { useEffect, useRef, useState, useCallback } from "react";
import { Platform } from "react-native";
import {
  createAudioPlayer,
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
  RecordingPresets,
  useAudioRecorder,
} from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import { Room, RoomEvent, Track } from "livekit-client";
import { socketService } from "@/services/socket";
import { getServerUrl } from "@/services/api";

interface UseGameVoiceProps {
  gameType: "chess" | "ludo" | "mm";
  roomId: string;
  userId?: string;
  userName?: string;
  enabled?: boolean;
}

interface QueuedAudio {
  base64Audio: string;
  mimeType?: string;
}

export function useGameVoice({
  gameType,
  roomId,
  userId,
  userName = "Player",
  enabled = true,
}: UseGameVoiceProps) {
  const [isMuted, setIsMuted] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakingUserIds, setSpeakingUserIds] = useState<Record<string, boolean>>({});
  const [micError, setMicError] = useState<string | null>(null);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [isLiveKitConnected, setIsLiveKitConnected] = useState(false);

  // LiveKit Room Ref
  const livekitRoomRef = useRef<Room | null>(null);

  // Fallback WebSocket Web refs
  const mediaStreamRef = useRef<any>(null);
  const mediaRecorderRef = useRef<any>(null);

  // Fallback WebSocket Native recorder
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const isLoopRunningRef = useRef<boolean>(false);
  const isMutedRef = useRef<boolean>(true);
  const isSpeakerMutedRef = useRef<boolean>(false);
  const recordNativeChunkRef = useRef<() => Promise<void>>(async () => {});

  // Fallback FIFO Audio Playback Queue
  const audioQueueRef = useRef<QueuedAudio[]>([]);
  const isPlayingQueueRef = useRef<boolean>(false);
  const currentPlayingPlayerRef = useRef<any>(null);
  const processAudioQueueRef = useRef<() => Promise<void>>(async () => {});

  // Speaking debounce timeouts
  const speakingTimeoutRef = useRef<Record<string, any>>({});
  const mySpeakingTimeoutRef = useRef<any>(null);

  // Synchronize refs with state
  useEffect(() => {
    isMutedRef.current = isMuted;
    if (livekitRoomRef.current?.localParticipant) {
      livekitRoomRef.current.localParticipant.setMicrophoneEnabled(!isMuted).catch(() => {});
    }
  }, [isMuted]);

  useEffect(() => {
    isSpeakerMutedRef.current = isSpeakerMuted;
    if (livekitRoomRef.current) {
      livekitRoomRef.current.remoteParticipants.forEach((p) => {
        p.trackPublications.forEach((pub) => {
          if (pub.track && pub.kind === "audio") {
            (pub.track as any).setEnabled?.(!isSpeakerMuted);
          }
        });
      });
    }
  }, [isSpeakerMuted]);

  // Configure audio session for loudspeaker output
  const configureAudioMode = useCallback(async () => {
    if (Platform.OS !== "web") {
      try {
        await setAudioModeAsync({
          playsInSilentMode: true,
          shouldRouteThroughEarpiece: false,
          shouldPlayInBackground: true,
          interruptionMode: "duckOthers",
          allowsRecording: true,
        });
      } catch (e) {
        console.warn("[LiveVoice] Audio session init warning:", e);
      }
    }
  }, []);

  useEffect(() => {
    configureAudioMode();
  }, [configureAudioMode]);

  // ----------------------------------------------------
  // 1. LIVEKIT WEBRTC VOICE CONNECTION
  // ----------------------------------------------------
  useEffect(() => {
    if (!enabled || !roomId || !userId) return;

    let isCancelled = false;
    let roomInstance: Room | null = null;

    async function initLiveKit() {
      try {
        const livekitRoomName = `${gameType}_${roomId}`;
        const serverUrl = getServerUrl();
        const tokenRes = await fetch(
          `${serverUrl}/api/livekit/token?room=${encodeURIComponent(
            livekitRoomName
          )}&username=${encodeURIComponent(userName)}&userId=${encodeURIComponent(userId || "")}`
        );

        if (!tokenRes.ok) {
          throw new Error(`Token request failed with status ${tokenRes.status}`);
        }

        const data = await tokenRes.json();
        if (!data.token || !data.url || data.url.includes("your-project.livekit.cloud")) {
          // LiveKit not yet configured with production URL, fall back to WebSocket
          console.log("[LiveVoice] LiveKit credentials not configured in backend .env; using optimized WebSocket stream.");
          return;
        }

        if (isCancelled) return;

        roomInstance = new Room({
          adaptiveStream: true,
          dynacast: true,
          audioCaptureDefaults: {
            autoGainControl: true,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });

        // Event: Active speakers changed
        roomInstance.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
          const map: Record<string, boolean> = {};
          let iAmSpeaking = false;
          speakers.forEach((s) => {
            if (s.identity === userId) {
              iAmSpeaking = true;
            } else {
              map[s.identity] = true;
            }
          });
          setIsSpeaking(iAmSpeaking);
          setSpeakingUserIds(map);
        });

        // Event: Track subscribed (remote audio automatically plays)
        roomInstance.on(RoomEvent.TrackSubscribed, (track: any) => {
          if (track.kind === Track.Kind.Audio) {
            track.attach();
            if (isSpeakerMutedRef.current && track.setEnabled) {
              track.setEnabled(false);
            }
          }
        });

        roomInstance.on(RoomEvent.Disconnected, () => {
          setIsLiveKitConnected(false);
        });

        console.log(`[LiveKit] Connecting to room ${livekitRoomName}...`);
        await roomInstance.connect(data.url, data.token);

        if (isCancelled) {
          roomInstance.disconnect();
          return;
        }

        livekitRoomRef.current = roomInstance;
        setIsLiveKitConnected(true);
        console.log(`[LiveKit] Connected to room ${livekitRoomName} successfully!`);

        // Enable mic if currently unmuted
        if (!isMutedRef.current) {
          await roomInstance.localParticipant.setMicrophoneEnabled(true);
        }
      } catch (err: any) {
        console.warn("[LiveVoice] LiveKit connection note:", err?.message || err);
        setIsLiveKitConnected(false);
      }
    }

    initLiveKit();

    return () => {
      isCancelled = true;
      if (roomInstance) {
        roomInstance.disconnect();
      }
      livekitRoomRef.current = null;
      setIsLiveKitConnected(false);
    };
  }, [enabled, gameType, roomId, userId, userName]);

  // Clean up speaking status after inactivity for fallback
  const markUserSpeaking = useCallback((speakerId: string) => {
    setSpeakingUserIds((prev) => ({ ...prev, [speakerId]: true }));
    if (speakingTimeoutRef.current[speakerId]) {
      clearTimeout(speakingTimeoutRef.current[speakerId]);
    }
    speakingTimeoutRef.current[speakerId] = setTimeout(() => {
      setSpeakingUserIds((prev) => {
        const copy = { ...prev };
        delete copy[speakerId];
        return copy;
      });
    }, 1500);
  }, []);

  // ----------------------------------------------------
  // 2. FALLBACK SEQUENTIAL AUDIO PLAYBACK
  // ----------------------------------------------------
  const processAudioQueue = useCallback(async () => {
    if (isLiveKitConnected) return; // LiveKit handles playback natively
    if (isPlayingQueueRef.current) return;
    if (isSpeakerMutedRef.current) {
      audioQueueRef.current = [];
      return;
    }
    if (audioQueueRef.current.length === 0) {
      isPlayingQueueRef.current = false;
      return;
    }

    const nextItem = audioQueueRef.current.shift();
    if (!nextItem || !nextItem.base64Audio) {
      processAudioQueueRef.current();
      return;
    }

    isPlayingQueueRef.current = true;

    // Web Playback
    if (Platform.OS === "web") {
      if (typeof window === "undefined") {
        isPlayingQueueRef.current = false;
        return;
      }
      try {
        const type = nextItem.mimeType || "audio/webm;codecs=opus";
        const audio = new window.Audio(`data:${type};base64,${nextItem.base64Audio}`);
        audio.volume = 1.0;
        audio.onended = () => {
          isPlayingQueueRef.current = false;
          processAudioQueueRef.current();
        };
        audio.onerror = () => {
          isPlayingQueueRef.current = false;
          processAudioQueueRef.current();
        };
        audio.play().catch(() => {
          isPlayingQueueRef.current = false;
          processAudioQueueRef.current();
        });
      } catch {
        isPlayingQueueRef.current = false;
        processAudioQueueRef.current();
      }
      return;
    }

    // Native Mobile (Android & iOS via expo-audio & expo-file-system)
    try {
      const cacheDir = FileSystem.cacheDirectory || FileSystem.documentDirectory || "";
      const ext = nextItem.mimeType && nextItem.mimeType.includes("webm") ? "webm" : "m4a";
      const randomSuffix = Math.random().toString(36).substring(7);
      const tempAudioPath = `${cacheDir}live_chunk_${Date.now()}_${randomSuffix}.${ext}`;

      await FileSystem.writeAsStringAsync(tempAudioPath, nextItem.base64Audio, {
        encoding: "base64",
      });

      const player = createAudioPlayer({ uri: tempAudioPath });
      player.volume = 1.0;
      currentPlayingPlayerRef.current = player;

      let hasFinished = false;
      const onFinish = () => {
        if (hasFinished) return;
        hasFinished = true;

        try { sub.remove(); } catch {}
        try { player.remove(); } catch {}
        FileSystem.deleteAsync(tempAudioPath, { idempotent: true }).catch(() => {});
        currentPlayingPlayerRef.current = null;
        isPlayingQueueRef.current = false;

        processAudioQueueRef.current();
      };

      const sub = player.addListener("playbackStatusUpdate", (status: any) => {
        if (status?.error) {
          onFinish();
        } else if (status?.didJustFinish) {
          onFinish();
        }
      });

      setTimeout(() => {
        if (!hasFinished) {
          onFinish();
        }
      }, 2500);

      player.play();
    } catch {
      isPlayingQueueRef.current = false;
      processAudioQueueRef.current();
    }
  }, [isLiveKitConnected]);

  useEffect(() => {
    processAudioQueueRef.current = processAudioQueue;
  }, [processAudioQueue]);

  // Enqueue incoming voice chunk from server
  const handleIncomingAudio = useCallback((base64Audio: string, mimeType?: string) => {
    if (isLiveKitConnected) return; // Ignore fallback when LiveKit is active
    if (!base64Audio || isSpeakerMutedRef.current) return;
    audioQueueRef.current.push({ base64Audio, mimeType });
    processAudioQueueRef.current();
  }, [isLiveKitConnected]);

  // Listen for incoming voice chunks & status from server (fallback)
  useEffect(() => {
    if (!enabled || !roomId || isLiveKitConnected) return;

    const unsubChunk = socketService.subscribeToGameVoiceChunk((chunk) => {
      if (chunk.roomId !== roomId || chunk.senderId === userId) return;
      markUserSpeaking(chunk.senderId);
      handleIncomingAudio(chunk.audioChunk, chunk.mimeType);
    });

    const unsubStatus = socketService.subscribeToGameVoiceStatus((status) => {
      if (status.roomId !== roomId || status.userId === userId) return;
      if (status.isSpeaking) {
        markUserSpeaking(status.userId);
      } else {
        setSpeakingUserIds((prev) => {
          const copy = { ...prev };
          delete copy[status.userId];
          return copy;
        });
      }
    });

    return () => {
      unsubChunk();
      unsubStatus();
    };
  }, [enabled, roomId, userId, markUserSpeaking, handleIncomingAudio, isLiveKitConnected]);

  // Continuous Native recording cycle (fallback 750ms live slices)
  const recordNativeChunk = useCallback(async () => {
    if (isLiveKitConnected) return; // LiveKit handles mic transmission
    if (isMutedRef.current || !isLoopRunningRef.current) return;

    try {
      await recorder.prepareToRecordAsync();
      recorder.record();

      await new Promise((resolve) => setTimeout(resolve, 750));

      if (!isLoopRunningRef.current || isMutedRef.current) {
        try {
          await recorder.stop();
        } catch {}
        return;
      }

      await recorder.stop();
      const rawUri = recorder.uri;

      if (rawUri && userId) {
        const fileUri = rawUri.startsWith("file://") ? rawUri : `file://${rawUri}`;
        const base64 = await FileSystem.readAsStringAsync(fileUri, {
          encoding: "base64",
        });

        FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});

        if (base64 && base64.length > 100) {
          setIsSpeaking(true);
          if (mySpeakingTimeoutRef.current) clearTimeout(mySpeakingTimeoutRef.current);
          mySpeakingTimeoutRef.current = setTimeout(() => {
            setIsSpeaking(false);
          }, 1200);

          socketService.sendGameVoiceChunk({
            gameType,
            roomId,
            senderId: userId,
            senderName: userName,
            audioChunk: base64,
            mimeType: "audio/m4a",
          });
        }
      }
    } catch (err: any) {
      console.warn("[LiveVoice] Record slice error:", err?.message || err);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await new Promise((resolve) => setTimeout(resolve, 60));

    if (isLoopRunningRef.current && !isMutedRef.current) {
      recordNativeChunkRef.current();
    }
  }, [gameType, recorder, roomId, userId, userName, isLiveKitConnected]);

  useEffect(() => {
    recordNativeChunkRef.current = recordNativeChunk;
  }, [recordNativeChunk]);

  // Web recording setup (fallback)
  const startWebRecording = useCallback(async () => {
    if (isLiveKitConnected) return;
    try {
      setMicError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      const options = { mimeType: "audio/webm;codecs=opus" };
      let webRecorder: any;
      try {
        webRecorder = new (window as any).MediaRecorder(stream, options);
      } catch {
        webRecorder = new (window as any).MediaRecorder(stream);
      }

      webRecorder.ondataavailable = async (e: any) => {
        if (e.data && e.data.size > 80 && userId && !isMutedRef.current) {
          const reader = new FileReader();
          reader.onloadend = () => {
            const result = reader.result as string;
            const base64 = result.split(",")[1];
            if (base64) {
              setIsSpeaking(true);
              if (mySpeakingTimeoutRef.current) clearTimeout(mySpeakingTimeoutRef.current);
              mySpeakingTimeoutRef.current = setTimeout(() => {
                setIsSpeaking(false);
              }, 1200);

              socketService.sendGameVoiceChunk({
                gameType,
                roomId,
                senderId: userId,
                senderName: userName,
                audioChunk: base64,
                mimeType: options.mimeType || "audio/webm",
              });
            }
          };
          reader.readAsDataURL(e.data);
        }
      };

      webRecorder.start(750);
      mediaRecorderRef.current = webRecorder;
    } catch {
      setMicError("Microphone permission denied.");
      setIsMuted(true);
      isMutedRef.current = true;
    }
  }, [gameType, roomId, userId, userName, isLiveKitConnected]);

  const stopWebRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
      mediaRecorderRef.current = null;
    }
    if (mediaStreamRef.current) {
      try {
        mediaStreamRef.current.getTracks().forEach((t: any) => t.stop());
      } catch {}
      mediaStreamRef.current = null;
    }
  }, []);

  // Request mic permission on native mobile
  const checkPermissions = useCallback(async () => {
    if (Platform.OS === "web") return true;
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        setMicError("Microphone permission denied.");
        return false;
      }
      setMicError(null);
      return true;
    } catch {
      setMicError("Failed to request microphone permission.");
      return false;
    }
  }, []);

  // Toggle Microphone
  const toggleMic = useCallback(async () => {
    if (isMuted) {
      // Unmuting
      const hasPerm = await checkPermissions();
      if (!hasPerm) return;

      setIsMuted(false);
      isMutedRef.current = false;

      // 1. LiveKit Mode
      if (livekitRoomRef.current?.localParticipant) {
        try {
          await livekitRoomRef.current.localParticipant.setMicrophoneEnabled(true);
        } catch (e) {
          console.warn("[LiveVoice] Error unmuting LiveKit mic:", e);
        }
      }

      // 2. Fallback Mode
      if (!isLiveKitConnected) {
        if (userId) {
          socketService.sendGameVoiceStatus({
            gameType,
            roomId,
            userId,
            isSpeaking: false,
            isMuted: false,
          });
        }

        if (Platform.OS === "web") {
          startWebRecording();
        } else {
          isLoopRunningRef.current = true;
          recordNativeChunkRef.current();
        }
      }
    } else {
      // Muting
      setIsMuted(true);
      isMutedRef.current = true;
      setIsSpeaking(false);

      // 1. LiveKit Mode
      if (livekitRoomRef.current?.localParticipant) {
        try {
          await livekitRoomRef.current.localParticipant.setMicrophoneEnabled(false);
        } catch (e) {
          console.warn("[LiveVoice] Error muting LiveKit mic:", e);
        }
      }

      // 2. Fallback Mode
      if (!isLiveKitConnected) {
        if (userId) {
          socketService.sendGameVoiceStatus({
            gameType,
            roomId,
            userId,
            isSpeaking: false,
            isMuted: true,
          });
        }

        if (Platform.OS === "web") {
          stopWebRecording();
        } else {
          isLoopRunningRef.current = false;
        }
      }
    }
  }, [
    isMuted,
    checkPermissions,
    isLiveKitConnected,
    userId,
    gameType,
    roomId,
    startWebRecording,
    stopWebRecording,
  ]);

  // Toggle Loudspeaker / Output Audio
  const toggleSpeaker = useCallback(() => {
    setIsSpeakerMuted((prev) => {
      const next = !prev;
      isSpeakerMutedRef.current = next;

      if (next) {
        // Mute speaker
        audioQueueRef.current = [];
        if (currentPlayingPlayerRef.current) {
          try {
            currentPlayingPlayerRef.current.pause();
          } catch {}
        }
        if (livekitRoomRef.current) {
          livekitRoomRef.current.remoteParticipants.forEach((p) => {
            p.trackPublications.forEach((pub) => {
              if (pub.track && pub.kind === "audio") {
                (pub.track as any).setEnabled?.(false);
              }
            });
          });
        }
      } else {
        // Unmute speaker
        if (livekitRoomRef.current) {
          livekitRoomRef.current.remoteParticipants.forEach((p) => {
            p.trackPublications.forEach((pub) => {
              if (pub.track && pub.kind === "audio") {
                (pub.track as any).setEnabled?.(true);
              }
            });
          });
        }
      }

      return next;
    });
  }, []);

  // Cleanup on unmount or room leave
  useEffect(() => {
    return () => {
      isLoopRunningRef.current = false;
      audioQueueRef.current = [];
      isPlayingQueueRef.current = false;
      if (currentPlayingPlayerRef.current) {
        try {
          currentPlayingPlayerRef.current.remove();
        } catch {}
        currentPlayingPlayerRef.current = null;
      }
      if (Platform.OS === "web") {
        stopWebRecording();
      }
      if (livekitRoomRef.current) {
        livekitRoomRef.current.disconnect();
        livekitRoomRef.current = null;
      }
    };
  }, [stopWebRecording]);

  return {
    isMuted,
    isSpeaking,
    speakingUserIds,
    toggleMic,
    micError,
    isSpeakerMuted,
    toggleSpeaker,
    isLiveKitConnected,
  };
}
