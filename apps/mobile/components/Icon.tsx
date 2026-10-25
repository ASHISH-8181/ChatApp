import React from "react";
import { Platform, StyleSheet, Text, View, type ColorValue, type StyleProp, type ViewStyle } from "react-native";

export interface IconProps {
  name: string;
  size?: number;
  color?: ColorValue | string;
  style?: StyleProp<ViewStyle>;
}

// Crisp, standardized SVG paths (viewBox: 0 0 24 24)
const SVG_PATHS: Record<string, { d: string; fill?: boolean; strokeWidth?: number }> = {
  // Navigation Tabs
  chatbubbles: {
    d: "M4 4h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-4l-4 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm4 13h10l4 4v-4h1a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-1v7a4 4 0 0 1-4 4H8v1z",
    fill: true,
  },
  "chatbubbles-outline": {
    d: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 0 1-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z",
    fill: false,
    strokeWidth: 2,
  },
  megaphone: {
    d: "M11 5L6 9H2v6h4l5 4V5zm4.5 3c-.28 0-.53.11-.71.29a1.003 1.003 0 0 0 0 1.42C15.36 10.28 16 11.08 16 12s-.64 1.72-1.21 2.29a1.003 1.003 0 0 0 1.42 1.42C17.08 14.84 18 13.52 18 12s-.92-2.84-1.79-3.71c-.18-.18-.43-.29-.71-.29zM19 4a1 1 0 0 0-.71.29 1 1 0 0 0 0 1.42C20.14 7.56 21 9.69 21 12s-.86 4.44-2.71 6.29a1 1 0 0 0 1.42 1.42C22.25 17.17 23 14.67 23 12s-.75-5.17-3.29-7.71A1 1 0 0 0 19 4z",
    fill: true,
  },
  "megaphone-outline": {
    d: "M11 5.882V19.24a1.76 1.76 0 0 1-3.417.592l-2.147-6.15M18 13a3 3 0 1 0 0-6M5.436 13.683A4.001 4.001 0 0 1 7 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 0 1-1.564-.317z",
    fill: false,
    strokeWidth: 2,
  },
  person: {
    d: "M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z",
    fill: true,
  },
  "person-outline": {
    d: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM12 14a7 7 0 0 0-7 7h14a7 7 0 0 0-7-7z",
    fill: false,
    strokeWidth: 2,
  },
  "person-add": {
    d: "M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z",
    fill: true,
  },
  "person-add-outline": {
    d: "M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z",
    fill: false,
    strokeWidth: 2,
  },
  "lock-closed-outline": {
    d: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z",
    fill: false,
    strokeWidth: 2,
  },
  "logo-google": {
    d: "M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09zM12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23zM5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63zM12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z",
    fill: true,
  },
  time: {
    d: "M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z",
    fill: true,
  },
  "time-outline": {
    d: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
    fill: false,
    strokeWidth: 2,
  },

  // Games & Controller
  "game-controller": {
    d: "M21.5 8.1a4.6 4.6 0 0 0-3.6-2.6 22.2 22.2 0 0 0-11.8 0A4.6 4.6 0 0 0 2.5 8.1C1.2 11.3.8 15.7 2.2 18.4a3.3 3.3 0 0 0 3 1.6 4.9 4.9 0 0 0 3.3-1.4l1.8-1.8a2.1 2.1 0 0 1 1.5-.6h.4a2.1 2.1 0 0 1 1.5.6l1.8 1.8a4.9 4.9 0 0 0 3.3 1.4 3.3 3.3 0 0 0 3-1.6c1.4-2.7 1-7.1-.3-10.3zm-12.5 4.9H7.5v1.5a1 1 0 0 1-2 0V13H4a1 1 0 0 1 0-2h1.5V9.5a1 1 0 0 1 2 0V11H9a1 1 0 0 1 0 2zm7-2a1.5 1.5 0 1 1 1.5-1.5 1.5 1.5 0 0 1-1.5 1.5zm2.5 3.5a1.5 1.5 0 1 1 1.5-1.5 1.5 1.5 0 0 1-1.5 1.5z",
    fill: true,
  },
  "game-controller-outline": {
    d: "M21.58 8.16A4.54 4.54 0 0 0 18 5.61a22.2 22.2 0 0 0-12 0 4.54 4.54 0 0 0-3.58 2.55C1.19 11.35.8 15.7 2.22 18.42A3.28 3.28 0 0 0 5.21 20a4.89 4.89 0 0 0 3.32-1.44l1.8-1.8a2.1 2.1 0 0 1 1.5-.59h.34a2.1 2.1 0 0 1 1.5.59l1.8 1.8A4.89 4.89 0 0 0 18.79 20a3.28 3.28 0 0 0 3-1.58c1.42-2.72 1.03-7.07-.21-10.26zM8 12.5H6.5V14a.5.5 0 0 1-1 0v-1.5H4a.5.5 0 0 1 0-1h1.5V10a.5.5 0 0 1 1 0v1.5H8a.5.5 0 0 1 0 1zm8-1a1 1 0 1 1 1-1 1 1 0 0 1-1 1zm2.5 3a1 1 0 1 1 1-1 1 1 0 0 1-1 1z",
    fill: true,
  },
  dice: {
    d: "M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM7.5 9A1.5 1.5 0 1 1 9 7.5 1.5 1.5 0 0 1 7.5 9zm4.5 4.5a1.5 1.5 0 1 1 1.5-1.5 1.5 1.5 0 0 1-1.5 1.5zm4.5 4.5a1.5 1.5 0 1 1 1.5-1.5 1.5 1.5 0 0 1-1.5 1.5z",
    fill: true,
  },
  "dice-outline": {
    d: "M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM7.5 9A1.5 1.5 0 1 1 9 7.5 1.5 1.5 0 0 1 7.5 9zm4.5 4.5a1.5 1.5 0 1 1 1.5-1.5 1.5 1.5 0 0 1-1.5 1.5zm4.5 4.5a1.5 1.5 0 1 1 1.5-1.5 1.5 1.5 0 0 1-1.5 1.5z",
    fill: true,
  },
  trophy: {
    d: "M19 4h-2V3a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v1H5a3 3 0 0 0-3 3v1a5 5 0 0 0 4.5 4.97A6 6 0 0 0 11 16.92V19H8a1 1 0 0 0 0 2h8a1 1 0 0 0 0-2h-3v-2.08a6 6 0 0 0 4.5-3.95A5 5 0 0 0 22 8V7a3 3 0 0 0-3-3zM4 8V7a1 1 0 0 1 1-1h2v4.82A3 3 0 0 1 4 8zm16 0a3 3 0 0 1-3 2.82V6h2a1 1 0 0 1 1 1z",
    fill: true,
  },
  star: {
    d: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
    fill: true,
  },
  play: {
    d: "M5 3l14 9-14 9V3z",
    fill: true,
  },
  refresh: {
    d: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15",
    fill: false,
    strokeWidth: 2,
  },
  flame: {
    d: "M12 2c-1.5 2-3 4-3 7 0 2.5 1.5 4 3 4s3-1.5 3-4c0-3-1.5-5-3-7zm-4 9c0 4 2 8 4 8s4-4 4-8",
    fill: true,
  },
  "exit-outline": {
    d: "M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v1",
    fill: false,
    strokeWidth: 2,
  },
  exit: {
    d: "M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v1",
    fill: false,
    strokeWidth: 2,
  },
  "copy-outline": {
    d: "M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z",
    fill: false,
    strokeWidth: 2,
  },
  menu: {
    d: "M4 6h16M4 12h16M4 18h16",
    fill: false,
    strokeWidth: 2,
  },
  grid: {
    d: "M4 4h4v4H4V4zm12 0h4v4h-4V4zM4 16h4v4H4v-4zm12 0h4v4h-4v-4z",
    fill: false,
    strokeWidth: 2,
  },
  "hand-right": {
    d: "M14 5l7 7-7 7",
    fill: false,
    strokeWidth: 2,
  },

  // Security & Credentials
  "lock-closed": {
    d: "M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 5a3 3 0 0 1 6 0v3H9V7zm3 7a2 2 0 0 1 2 2c0 .74-.4 1.38-1 1.72V19a1 1 0 1 1-2 0v-1.28c-.6-.34-1-.98-1-1.72a2 2 0 0 1 2-2z",
    fill: true,
  },
  "shield-checkmark": {
    d: "M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z",
    fill: true,
  },
  "checkmark-circle": {
    d: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z",
    fill: true,
  },
  "alert-circle": {
    d: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z",
    fill: true,
  },

  // Actions & Navigation
  "save-outline": {
    d: "M8 7H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4",
    fill: false,
    strokeWidth: 2,
  },
  "log-out-outline": {
    d: "M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v1",
    fill: false,
    strokeWidth: 2,
  },
  "call-outline": {
    d: "M3 5a2 2 0 0 1 2-2h3.28a1 1 0 0 1 .948.684l1.498 4.493a1 1 0 0 1-.502 1.21l-2.257 1.13a11.042 11.042 0 0 0 5.516 5.516l1.13-2.257a1 1 0 0 1 1.21-.502l4.493 1.498a1 1 0 0 1 .684.949V19a2 2 0 0 1-2 2h-1C9.716 21 3 14.284 3 6V5z",
    fill: false,
    strokeWidth: 2,
  },
  at: {
    d: "M16 12a4 4 0 1 0-8 0 4 4 0 0 0 8 0zm0 0v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-9 9m4.5-1.206a8.959 8.959 0 0 1-4.5 1.207",
    fill: false,
    strokeWidth: 2,
  },
  add: {
    d: "M12 4v16m8-8H4",
    fill: false,
    strokeWidth: 2.5,
  },
  search: {
    d: "M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z",
    fill: false,
    strokeWidth: 2,
  },
  close: {
    d: "M6 18L18 6M6 6l12 12",
    fill: false,
    strokeWidth: 2,
  },
  "close-circle": {
    d: "M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
    fill: false,
    strokeWidth: 2,
  },
  "arrow-back": {
    d: "M10 19l-7-7m0 0l7-7m-7 7h18",
    fill: false,
    strokeWidth: 2,
  },
  "arrow-forward": {
    d: "M14 5l7 7-7 7m-18-7h18",
    fill: false,
    strokeWidth: 2,
  },
  "arrow-up": {
    d: "M5 10l7-7 7 7M12 3v18",
    fill: false,
    strokeWidth: 2,
  },
  "arrow-down": {
    d: "M19 14l-7 7-7-7M12 21V3",
    fill: false,
    strokeWidth: 2,
  },
  "chevron-forward": {
    d: "M9 5l7 7-7 7",
    fill: false,
    strokeWidth: 2,
  },
  send: {
    d: "M2.01 21L23 12 2.01 3 2 10l15 2-15 2z",
    fill: true,
  },
  "people-outline": {
    d: "M17 20h5v-2a3 3 0 0 0-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 0 1 5.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 0 1 9.288 0M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm6 3a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM7 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0z",
    fill: false,
    strokeWidth: 2,
  },
  people: {
    d: "M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z",
    fill: true,
  },
  "information-circle-outline": {
    d: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
    fill: false,
    strokeWidth: 2,
  },
  "code-slash": {
    d: "M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4",
    fill: false,
    strokeWidth: 2,
  },
  "color-palette": {
    d: "M7 21a4 4 0 0 1-4-4V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v12a4 4 0 0 1-4 4zm0 0h12a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 0 1 2.828 0l2.829 2.829a2 2 0 0 1 0 2.828l-8.486 8.485M7 17h.01",
    fill: false,
    strokeWidth: 2,
  },
  cafe: {
    d: "M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8zM6 1v3M10 1v3M14 1v3",
    fill: false,
    strokeWidth: 2,
  },
  "trash-outline": {
    d: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16",
    fill: false,
    strokeWidth: 2,
  },
  trash: {
    d: "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z",
    fill: true,
  },
  "ban-outline": {
    d: "M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636",
    fill: false,
    strokeWidth: 2,
  },
  ban: {
    d: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-2.05 0-3.93-.78-5.37-2.07L16.93 6.63C18.22 8.07 19 9.95 19 12c0 4.41-3.59 8-8 8zm-6.93-4.63C3.78 13.93 3 12.05 3 10c0-4.41 3.59-8 8-8 2.05 0 3.93.78 5.37 2.07L5.07 15.37z",
    fill: true,
  },
  "ellipsis-vertical": {
    d: "M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z",
    fill: true,
  },
  "shield-outline": {
    d: "M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 2.18l7 3.12v4.7c0 4.54-3.04 8.78-7 9.87-3.96-1.09-7-5.33-7-9.87V6.3l7-3.12z",
    fill: false,
    strokeWidth: 2,
  },
  "person-remove-outline": {
    d: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM12 14a7 7 0 0 0-7 7h14a7 7 0 0 0-7-7zm9-3h-6",
    fill: false,
    strokeWidth: 2,
  },

  // Media, Camera & Interaction Icons
  camera: {
    d: "M4 7h3l1.5-2h7L17 7h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zm8 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0-2a2 2 0 1 1 0-4 2 2 0 0 1 0 4z",
    fill: true,
  },
  "camera-outline": {
    d: "M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    fill: false,
    strokeWidth: 2,
  },
  happy: {
    d: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-3.5 7c.83 0 1.5.67 1.5 1.5S9.33 12 8.5 12 7 11.33 7 10.5 7.67 9 8.5 9zm7 0c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5-1.5-.67-1.5-1.5.67-1.5 1.5-1.5zm-3.5 9.5c-2.33 0-4.31-1.46-5.11-3.5h10.22c-.8 2.04-2.78 3.5-5.11 3.5z",
    fill: true,
  },
  "happy-outline": {
    d: "M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-3.5-13a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm7 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm-7.07 8.5a5.002 5.002 0 0 0 7.14 0",
    fill: false,
    strokeWidth: 2,
  },
  keypad: {
    d: "M4 5h4v4H4V5zm7 0h4v4h-4V5zm7 0h4v4h-4V5zM4 11h4v4H4v-4zm7 0h4v4h-4v-4zm7 0h4v4h-4v-4zM4 17h4v4H4v-4zm7 0h4v4h-4v-4zm7 0h4v4h-4v-4z",
    fill: true,
  },
  "keypad-outline": {
    d: "M4 5h4v4H4V5zm7 0h4v4h-4V5zm7 0h4v4h-4V5zM4 11h4v4H4v-4zm7 0h4v4h-4v-4zm7 0h4v4h-4v-4zM4 17h4v4H4v-4zm7 0h4v4h-4v-4zm7 0h4v4h-4v-4z",
    fill: false,
    strokeWidth: 1.8,
  },
  download: {
    d: "M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z",
    fill: true,
  },
  "download-outline": {
    d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4m4-5l5 5 5-5m-5 5V3",
    fill: false,
    strokeWidth: 2,
  },
  image: {
    d: "M4 5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H4zm16 12H4l5-6 3 3.5 3.5-4.5 4.5 7z",
    fill: true,
  },
  "image-outline": {
    d: "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z",
    fill: false,
    strokeWidth: 2,
  },
  sparkles: {
    d: "M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z",
    fill: true,
  },
  "sparkles-outline": {
    d: "M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z",
    fill: false,
    strokeWidth: 2,
  },
  flash: {
    d: "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
    fill: true,
  },
  "flash-outline": {
    d: "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
    fill: false,
    strokeWidth: 2,
  },
  heart: {
    d: "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z",
    fill: true,
  },
  "heart-outline": {
    d: "M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z",
    fill: false,
    strokeWidth: 2,
  },
};

// Fallback Unicode glyphs
const GLYPH_FALLBACKS: Record<string, string> = {
  chatbubbles: "💬",
  "chatbubbles-outline": "💬",
  megaphone: "📢",
  "megaphone-outline": "📢",
  person: "👤",
  "person-outline": "👤",
  "lock-closed": "🔒",
  "shield-checkmark": "🛡️",
  "checkmark-circle": "✓",
  "alert-circle": "⚠",
  "save-outline": "💾",
  "log-out-outline": "↩",
  "call-outline": "📞",
  at: "@",
  add: "+",
  search: "🔍",
  close: "✕",
  "close-circle": "✕",
  "arrow-back": "‹",
  "arrow-forward": "›",
  "arrow-up": "↑",
  "arrow-down": "↓",
  "chevron-forward": "›",
  send: "➤",
  "people-outline": "👥",
  people: "👥",
  "information-circle-outline": "ℹ",
  "code-slash": "</>",
  "color-palette": "🎨",
  cafe: "☕",
  "trash-outline": "🗑️",
  trash: "🗑️",
  "ban-outline": "🚫",
  ban: "🚫",
  "ellipsis-vertical": "⋮",
  "shield-outline": "🛡️",
  "person-remove-outline": "👤✕",
  "game-controller": "🎮",
  "game-controller-outline": "🎮",
  dice: "🎲",
  "dice-outline": "🎲",
  trophy: "🏆",
  "trophy-outline": "🏆",
  star: "⭐",
  play: "▶",
  refresh: "🔄",
  flame: "🔥",
  "flame-outline": "🔥",
  "copy-outline": "📋",
  copy: "📋",
  exit: "🚪",
  "exit-outline": "🚪",
  menu: "☰",
  grid: "▦",
  "hand-right": "👉",
  camera: "📷",
  "camera-outline": "📷",
  happy: "😊",
  "happy-outline": "😊",
  keypad: "⌨️",
  "keypad-outline": "⌨️",
  download: "⬇️",
  "download-outline": "⬇️",
  image: "🖼️",
  "image-outline": "🖼️",
  images: "🖼️",
  "images-outline": "🖼️",
  sparkles: "✨",
  "sparkles-outline": "✨",
  flash: "⚡",
  "flash-outline": "⚡",
  heart: "❤️",
  "heart-outline": "🤍",
};

function getSmartGlyph(name: string): string {
  if (GLYPH_FALLBACKS[name]) return GLYPH_FALLBACKS[name];
  const lower = name.toLowerCase();
  if (lower.includes("camera") || lower.includes("photo") || lower.includes("picture")) return "📷";
  if (lower.includes("happy") || lower.includes("smile") || lower.includes("emoji")) return "😊";
  if (lower.includes("keypad") || lower.includes("keyboard")) return "⌨️";
  if (lower.includes("download") || lower.includes("save")) return "⬇️";
  if (lower.includes("image")) return "🖼️";
  if (lower.includes("sparkle")) return "✨";
  if (lower.includes("flash") || lower.includes("lightning")) return "⚡";
  if (lower.includes("heart")) return "❤️";
  if (lower.includes("game") || lower.includes("controller")) return "🎮";
  if (lower.includes("dice")) return "🎲";
  if (lower.includes("trophy") || lower.includes("medal")) return "🏆";
  if (lower.includes("star")) return "⭐";
  if (lower.includes("play")) return "▶";
  if (lower.includes("exit") || lower.includes("leave")) return "🚪";
  if (lower.includes("flame") || lower.includes("fire")) return "🔥";
  if (lower.includes("user") || lower.includes("person")) return "👤";
  if (lower.includes("people") || lower.includes("group")) return "👥";
  if (lower.includes("chat") || lower.includes("message")) return "💬";
  if (lower.includes("back") || lower.includes("left")) return "‹";
  if (lower.includes("forward") || lower.includes("right") || lower.includes("chevron")) return "›";
  if (lower.includes("add") || lower.includes("plus")) return "+";
  if (lower.includes("lock")) return "🔒";
  if (lower.includes("time") || lower.includes("clock")) return "⏱️";
  if (lower.includes("check")) return "✓";
  if (lower.includes("close")) return "✕";
  return "✦";
}

export function Icon({ name, size = 20, color = "#0F172A", style }: IconProps) {
  const def = SVG_PATHS[name];

  if (Platform.OS === "web" && def) {
    const isFill = def.fill;
    return (
      <View style={[{ width: size, height: size }, styles.center, style]}>
        {React.createElement(
          "svg",
          {
            width: size,
            height: size,
            viewBox: "0 0 24 24",
            fill: isFill ? color : "none",
            stroke: isFill ? "none" : color,
            strokeWidth: isFill ? undefined : (def.strokeWidth || 2),
            strokeLinecap: "round",
            strokeLinejoin: "round",
            style: { display: "block" },
          },
          React.createElement("path", { d: def.d })
        )}
      </View>
    );
  }

  // Native & Fallback rendering
  const glyph = getSmartGlyph(name);
  return (
    <View style={[{ width: size, height: size }, styles.center, style]}>
      <Text style={{ fontSize: size * 0.85, color, textAlign: "center", lineHeight: size }}>
        {glyph}
      </Text>
    </View>
  );
}

// Export Ionicons alias for drop-in compatibility
export const Ionicons = Icon;

const styles = StyleSheet.create({
  center: {
    justifyContent: "center",
    alignItems: "center",
  },
});
