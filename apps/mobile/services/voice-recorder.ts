import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";

export interface VoiceRecordResult {
  uri: string;
  base64?: string;
  durationSeconds: number;
}

export type VoiceRecorderState = "idle" | "recording" | "paused" | "stopped";

class VoiceRecorderService {
  private nativeRecorder: any = null;
  private webMediaRecorder: any = null;
  private webAudioChunks: Blob[] = [];
  private state: VoiceRecorderState = "idle";
  private durationSeconds = 0;
  private timerInterval: any = null;
  private onTickCallback?: (seconds: number) => void;

  getState(): VoiceRecorderState {
    return this.state;
  }

  getDuration(): number {
    return this.durationSeconds;
  }

  async startRecording(onTick?: (seconds: number) => void): Promise<boolean> {
    try {
      this.onTickCallback = onTick;
      this.durationSeconds = 0;

      if (Platform.OS === "web") {
        if (!navigator?.mediaDevices?.getUserMedia) {
          throw new Error("Microphone access is not supported in this browser.");
        }
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.webAudioChunks = [];
        const mediaRecorder = new (window as any).MediaRecorder(stream);
        this.webMediaRecorder = mediaRecorder;

        mediaRecorder.ondataavailable = (e: any) => {
          if (e.data && e.data.size > 0) {
            this.webAudioChunks.push(e.data);
          }
        };

        mediaRecorder.start(100);
        this.state = "recording";
        this.startTimer();
        return true;
      } else {
        // Native (Android / iOS) via expo-audio
        const { requestRecordingPermissionsAsync, RecordingPresets, AudioRecorder } = await import("expo-audio");
        const permission = await requestRecordingPermissionsAsync();
        if (!permission.granted) {
          throw new Error("Microphone permission was not granted.");
        }

        const recorder = new AudioRecorder(RecordingPresets.HIGH_QUALITY);
        this.nativeRecorder = recorder;
        await recorder.prepareToRecordAsync();
        recorder.record();

        this.state = "recording";
        this.startTimer();
        return true;
      }
    } catch (err) {
      console.error("[VoiceRecorder] Failed to start recording:", err);
      this.cleanup();
      throw err;
    }
  }

  pauseRecording(): void {
    if (this.state !== "recording") return;

    try {
      if (Platform.OS === "web") {
        if (this.webMediaRecorder && this.webMediaRecorder.state === "recording") {
          this.webMediaRecorder.pause();
        }
      } else {
        if (this.nativeRecorder) {
          this.nativeRecorder.pause();
        }
      }
      this.state = "paused";
      this.stopTimer();
    } catch (err) {
      console.warn("[VoiceRecorder] Failed to pause:", err);
    }
  }

  resumeRecording(): void {
    if (this.state !== "paused") return;

    try {
      if (Platform.OS === "web") {
        if (this.webMediaRecorder && this.webMediaRecorder.state === "paused") {
          this.webMediaRecorder.resume();
        }
      } else {
        if (this.nativeRecorder) {
          this.nativeRecorder.record();
        }
      }
      this.state = "recording";
      this.startTimer();
    } catch (err) {
      console.warn("[VoiceRecorder] Failed to resume:", err);
    }
  }

  async stopRecording(): Promise<VoiceRecordResult> {
    this.stopTimer();
    const recordedDuration = Math.max(1, this.durationSeconds);

    try {
      if (Platform.OS === "web") {
        return new Promise((resolve, reject) => {
          if (!this.webMediaRecorder) {
            return reject(new Error("No active recording found."));
          }

          this.webMediaRecorder.onstop = async () => {
            try {
              const audioBlob = new Blob(this.webAudioChunks, { type: "audio/webm" });
              const webUri = URL.createObjectURL(audioBlob);

              // Convert to base64
              const reader = new FileReader();
              reader.onloadend = () => {
                const base64String = reader.result as string;
                this.cleanup();
                resolve({
                  uri: webUri,
                  base64: base64String,
                  durationSeconds: recordedDuration,
                });
              };
              reader.onerror = () => {
                this.cleanup();
                resolve({
                  uri: webUri,
                  durationSeconds: recordedDuration,
                });
              };
              reader.readAsDataURL(audioBlob);
            } catch (convErr) {
              this.cleanup();
              reject(convErr);
            }
          };

          this.webMediaRecorder.stop();
          // Stop audio tracks
          if (this.webMediaRecorder.stream) {
            this.webMediaRecorder.stream.getTracks().forEach((t: any) => t.stop());
          }
        });
      } else {
        // Native
        if (!this.nativeRecorder) {
          throw new Error("No active native recorder found.");
        }

        await this.nativeRecorder.stop();
        const fileUri = this.nativeRecorder.uri;
        let base64 = "";

        if (fileUri) {
          try {
            base64 = await FileSystem.readAsStringAsync(fileUri, {
              encoding: FileSystem.EncodingType.Base64,
            });
            if (base64) {
              base64 = `data:audio/mp4;base64,${base64}`;
            }
          } catch (readErr) {
            console.warn("[VoiceRecorder] Failed to read native recording as base64:", readErr);
          }
        }

        this.cleanup();
        return {
          uri: fileUri || "",
          base64: base64 || undefined,
          durationSeconds: recordedDuration,
        };
      }
    } catch (err) {
      this.cleanup();
      console.error("[VoiceRecorder] Failed to stop recording:", err);
      throw err;
    }
  }

  cancelRecording(): void {
    try {
      this.stopTimer();
      if (Platform.OS === "web") {
        if (this.webMediaRecorder) {
          try {
            if (this.webMediaRecorder.state !== "inactive") {
              this.webMediaRecorder.stop();
            }
            if (this.webMediaRecorder.stream) {
              this.webMediaRecorder.stream.getTracks().forEach((t: any) => t.stop());
            }
          } catch {}
        }
      } else {
        if (this.nativeRecorder) {
          try {
            this.nativeRecorder.stop();
          } catch {}
        }
      }
    } finally {
      this.cleanup();
    }
  }

  private startTimer(): void {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      this.durationSeconds += 1;
      this.onTickCallback?.(this.durationSeconds);
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  private cleanup(): void {
    this.stopTimer();
    this.state = "idle";
    this.durationSeconds = 0;
    this.nativeRecorder = null;
    this.webMediaRecorder = null;
    this.webAudioChunks = [];
  }
}

export const voiceRecorderService = new VoiceRecorderService();
