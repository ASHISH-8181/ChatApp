import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@/components/Icon";
import { Fonts, Colors } from "@/constants/theme";

interface VoiceNoteBubbleProps {
  audioUrl: string;
  durationLabel?: string;
  isMe: boolean;
}

export function VoiceNoteBubble({ audioUrl, durationLabel, isMe }: VoiceNoteBubbleProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 1.5 | 2>(1);
  const [isLoading, setIsLoading] = useState(true);

  // Web Audio element ref
  const webAudioRef = useRef<HTMLAudioElement | null>(null);
  // Native player ref
  const nativePlayerRef = useRef<any>(null);

  useEffect(() => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const audio = new Audio(audioUrl);
      webAudioRef.current = audio;

      audio.onloadedmetadata = () => {
        setIsLoading(false);
        if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
          setDuration(Math.round(audio.duration));
        }
      };

      audio.onerror = () => {
        setIsLoading(false);
      };

      audio.ondurationchange = () => {
        if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
          setDuration(Math.round(audio.duration));
        }
      };

      audio.ontimeupdate = () => {
        if (audio.currentTime && isFinite(audio.currentTime)) {
          setCurrentTime(Math.round(audio.currentTime));
        }
      };

      audio.onended = () => {
        setIsPlaying(false);
        setCurrentTime(0);
      };

      audio.onplay = () => setIsPlaying(true);
      audio.onpause = () => setIsPlaying(false);

      return () => {
        audio.pause();
        audio.src = "";
        webAudioRef.current = null;
      };
    } else {
      // Native (Android/iOS) via expo-audio
      let isMounted = true;
      (async () => {
        try {
          const { AudioPlayer } = await import("expo-audio");
          const player = new AudioPlayer(audioUrl, 500, false, 0);
          if (!isMounted) {
            player.remove();
            return;
          }
          nativePlayerRef.current = player;
          setIsLoading(false);
          player.addListener("playbackStatusUpdate", (status: any) => {
            if (!isMounted) return;
            if (status.duration && !isNaN(status.duration)) {
              setDuration(Math.round(status.duration));
            }
            if (status.currentTime !== undefined) {
              setCurrentTime(Math.round(status.currentTime));
            }
            if (status.playing !== undefined) {
              setIsPlaying(status.playing);
            }
          });
        } catch (err) {
          console.warn("[VoiceNoteBubble] Failed to load native player:", err);
        }
      })();

      return () => {
        isMounted = false;
        if (nativePlayerRef.current) {
          try {
            nativePlayerRef.current.pause();
            nativePlayerRef.current.remove();
          } catch {}
          nativePlayerRef.current = null;
        }
      };
    }
  }, [audioUrl]);

  const togglePlayPause = async () => {
    if (Platform.OS === "web") {
      const audio = webAudioRef.current;
      if (!audio) return;
      try {
        if (isPlaying) {
          audio.pause();
        } else {
          audio.playbackRate = playbackSpeed;
          await audio.play();
        }
      } catch (err) {
        console.warn("[VoiceNoteBubble] Web play error:", err);
      }
    } else {
      const player = nativePlayerRef.current;
      if (!player) return;
      try {
        if (isPlaying) {
          player.pause();
        } else {
          player.setPlaybackRate(playbackSpeed);
          player.play();
        }
      } catch (err) {
        console.warn("[VoiceNoteBubble] Native play error:", err);
      }
    }
  };

  const cycleSpeed = () => {
    const nextSpeed: 1 | 1.5 | 2 = playbackSpeed === 1 ? 1.5 : playbackSpeed === 1.5 ? 2 : 1;
    setPlaybackSpeed(nextSpeed);

    if (Platform.OS === "web" && webAudioRef.current) {
      webAudioRef.current.playbackRate = nextSpeed;
    } else if (nativePlayerRef.current) {
      try {
        nativePlayerRef.current.setPlaybackRate(nextSpeed);
      } catch {}
    }
  };

  const formatSec = (sec: number) => {
    if (!sec || isNaN(sec) || !isFinite(sec) || sec < 0) return "0:00";
    const total = Math.floor(sec);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const progressPercent =
    duration > 0 && isFinite(duration) && isFinite(currentTime)
      ? Math.min(100, Math.max(0, Math.round((currentTime / duration) * 100)))
      : 0;

  // Waveform bars representation
  const waveformHeights = [8, 14, 22, 12, 18, 24, 10, 16, 20, 14, 26, 18, 12, 20, 16, 22, 10, 14];

  return (
    <View style={styles.container}>
      {/* Play/Pause Circle Button */}
      <Pressable
        style={[styles.playBtn, isMe ? styles.playBtnMe : styles.playBtnOther]}
        onPress={togglePlayPause}
        hitSlop={6}
        accessibilityLabel={isPlaying ? "Pause voice note" : "Play voice note"}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={isMe ? "#FFFFFF" : Colors.primary} />
        ) : (
          <Ionicons
            name={isPlaying ? "pause" : "play"}
            size={18}
            color={isMe ? "#FFFFFF" : Colors.primary}
            style={isPlaying ? undefined : { marginLeft: 2 }}
          />
        )}
      </Pressable>

      {/* Waveform & Timeline */}
      <View style={styles.contentCol}>
        <View style={styles.waveformRow}>
          {waveformHeights.map((h, idx) => {
            const barProgress = (idx / waveformHeights.length) * 100;
            const isFilled = isPlaying ? barProgress <= progressPercent : currentTime > 0 && barProgress <= progressPercent;
            return (
              <View
                key={idx}
                style={[
                  styles.waveformBar,
                  { height: h },
                  isMe
                    ? isFilled
                      ? styles.barFilledMe
                      : styles.barEmptyMe
                    : isFilled
                    ? styles.barFilledOther
                    : styles.barEmptyOther,
                ]}
              />
            );
          })}
        </View>

        {/* Duration / Progress Text */}
        <View style={styles.metaRow}>
          <Text style={[styles.timeText, isMe ? styles.timeTextMe : styles.timeTextOther]}>
            {isPlaying || currentTime > 0
              ? formatSec(currentTime)
              : duration > 0
              ? formatSec(duration)
              : durationLabel || "0:05"}
          </Text>

          {/* Speed Toggle Badge */}
          <Pressable
            style={[styles.speedBadge, isMe ? styles.speedBadgeMe : styles.speedBadgeOther]}
            onPress={cycleSpeed}
            hitSlop={4}
            accessibilityLabel={`Playback speed ${playbackSpeed}x`}
          >
            <Text style={[styles.speedText, isMe ? styles.speedTextMe : styles.speedTextOther]}>
              {playbackSpeed}x
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 2,
    minWidth: 200,
    maxWidth: 260,
    gap: 10,
  },
  playBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  playBtnMe: {
    backgroundColor: "rgba(255, 255, 255, 0.25)",
  },
  playBtnOther: {
    backgroundColor: "rgba(59, 130, 246, 0.15)",
  },
  contentCol: {
    flex: 1,
    gap: 4,
  },
  waveformRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2.5,
    height: 28,
  },
  waveformBar: {
    width: 3,
    borderRadius: 1.5,
  },
  barFilledMe: {
    backgroundColor: "#FFFFFF",
  },
  barEmptyMe: {
    backgroundColor: "rgba(255, 255, 255, 0.35)",
  },
  barFilledOther: {
    backgroundColor: Colors.primary,
  },
  barEmptyOther: {
    backgroundColor: "#CBD5E1",
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  timeText: {
    fontSize: 11,
    fontFamily: Fonts.medium,
  },
  timeTextMe: {
    color: "#E0E7FF",
  },
  timeTextOther: {
    color: "#64748B",
  },
  speedBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  speedBadgeMe: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
  },
  speedBadgeOther: {
    backgroundColor: "rgba(59, 130, 246, 0.1)",
  },
  speedText: {
    fontSize: 10,
    fontFamily: Fonts.bold,
  },
  speedTextMe: {
    color: "#FFFFFF",
  },
  speedTextOther: {
    color: Colors.primary,
  },
});
