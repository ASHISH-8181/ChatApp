import React, { useEffect, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

interface FloatingEmojiBurstProps {
  emoji: string;
  onComplete: () => void;
}

interface Particle {
  id: number;
  offsetX: number;
  offsetY: number;
  size: number;
  anim: Animated.Value;
  fadeAnim: Animated.Value;
}

export function FloatingEmojiBurst({ emoji, onComplete }: FloatingEmojiBurstProps) {
  // Main center emoji animation values
  const [scaleAnim] = useState(() => new Animated.Value(0.1));
  const [floatAnim] = useState(() => new Animated.Value(0));
  const [opacityAnim] = useState(() => new Animated.Value(1));
  const [rotateAnim] = useState(() => new Animated.Value(0));

  // Secondary floating particles
  const [particles] = useState<Particle[]>(() =>
    Array.from({ length: 6 }).map((_, i) => ({
      id: i,
      offsetX: (Math.random() - 0.5) * 140,
      offsetY: (Math.random() - 0.5) * 100,
      size: 24 + Math.random() * 16,
      anim: new Animated.Value(0),
      fadeAnim: new Animated.Value(1),
    }))
  );

  useEffect(() => {
    // 1. Center emoji pop and float
    Animated.parallel([
      Animated.sequence([
        Animated.spring(scaleAnim, {
          toValue: 1.4,
          tension: 100,
          friction: 4,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1.1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(floatAnim, {
        toValue: -150,
        duration: 1600,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(900),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(rotateAnim, {
          toValue: -1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(rotateAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]),
      // Particle animations
      ...particles.map((p) =>
        Animated.parallel([
          Animated.timing(p.anim, {
            toValue: 1,
            duration: 1400 + Math.random() * 300,
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.delay(600),
            Animated.timing(p.fadeAnim, {
              toValue: 0,
              duration: 800,
              useNativeDriver: true,
            }),
          ]),
        ])
      ),
    ]).start(() => {
      onComplete();
    });
  }, [scaleAnim, floatAnim, opacityAnim, rotateAnim, particles, onComplete]);

  const spin = rotateAnim.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ["-12deg", "0deg", "12deg"],
  });

  return (
    <View style={styles.overlay} pointerEvents="none">
      {/* Floating particles around center */}
      {particles.map((p) => {
        const translateY = p.anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, p.offsetY - 120],
        });
        const translateX = p.anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, p.offsetX],
        });
        const scale = p.anim.interpolate({
          inputRange: [0, 0.4, 1],
          outputRange: [0.2, 1.2, 0.7],
        });

        return (
          <Animated.View
            key={p.id}
            style={[
              styles.particleWrap,
              {
                opacity: p.fadeAnim,
                transform: [{ translateX }, { translateY }, { scale }],
              },
            ]}
          >
            <Text style={{ fontSize: p.size }}>{emoji}</Text>
          </Animated.View>
        );
      })}

      {/* Main big center emoji */}
      <Animated.View
        style={[
          styles.mainEmojiWrap,
          {
            opacity: opacityAnim,
            transform: [{ translateY: floatAnim }, { scale: scaleAnim }, { rotate: spin }],
          },
        ]}
      >
        <Text style={styles.mainEmojiText}>{emoji}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 99999,
    justifyContent: "center",
    alignItems: "center",
  },
  mainEmojiWrap: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  mainEmojiText: {
    fontSize: 88,
    textAlign: "center",
  },
  particleWrap: {
    position: "absolute",
  },
});
