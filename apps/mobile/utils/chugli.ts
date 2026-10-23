const ADJECTIVES = [
  "Shadow",
  "Whispering",
  "Secret",
  "Mysterious",
  "Midnight",
  "Silent",
  "Masked",
  "Ghostly",
  "Velvet",
  "Cosmic",
  "Neon",
  "Phantom",
  "Clover",
  "Silver",
  "Hidden",
  "Crypto",
];

const NOUNS = [
  "Fox",
  "Tiger",
  "Falcon",
  "Owl",
  "Panda",
  "Raven",
  "Wolf",
  "Otter",
  "Viper",
  "Hawk",
  "Jaguar",
  "Sphinx",
  "Ninja",
  "Badger",
  "Specter",
  "Cheetah",
];

export function generateRandomAlias(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(10 + Math.random() * 89);
  return `${adj}${noun}${num}`;
}

export function formatCountdown(expiresAtStr?: string): {
  text: string;
  isExpired: boolean;
  minutesLeft: number;
  isWarning: boolean;
} {
  if (!expiresAtStr) {
    return { text: "No timer", isExpired: false, minutesLeft: Infinity, isWarning: false };
  }

  const expiresAt = new Date(expiresAtStr).getTime();
  const now = Date.now();
  const diffMs = expiresAt - now;

  if (diffMs <= 0) {
    return { text: "00:00 (Expired)", isExpired: true, minutesLeft: 0, isWarning: true };
  }

  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const minutesLeft = Math.ceil(diffMs / (60 * 1000));
  const isWarning = minutesLeft <= 10;

  const pad = (n: number) => n.toString().padStart(2, "0");

  let text = "";
  if (hours > 0) {
    text = `${hours}h ${pad(minutes)}m ${pad(seconds)}s`;
  } else {
    text = `${pad(minutes)}:${pad(seconds)}`;
  }

  return { text, isExpired: false, minutesLeft, isWarning };
}
