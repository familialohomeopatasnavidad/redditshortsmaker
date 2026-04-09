import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";
import type { StoredFile } from "./media-store";
import { generateASS } from "./subtitles";
import type { WordBoundary } from "./tts";

let ffmpeg: FFmpeg | null = null;

export type ProgressCallback = (stage: string, percent?: number) => void;

async function getFFmpeg(onLog?: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpeg && ffmpeg.loaded) return ffmpeg;

  ffmpeg = new FFmpeg();
  
  if (onLog) {
    ffmpeg.on("log", ({ message }) => {
      onLog(message);
    });
  }

  // Load from CDN
  const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
  });

  return ffmpeg;
}

export async function assembleVideo(opts: {
  audioBlob: Blob;
  wordBoundaries: WordBoundary[];
  durationMs: number;
  backgroundClip: StoredFile;
  musicTrack: StoredFile | null;
  onProgress: ProgressCallback;
  onLog?: (msg: string) => void;
}): Promise<Blob> {
  const { audioBlob, wordBoundaries, durationMs, backgroundClip, musicTrack, onProgress, onLog } = opts;

  onProgress("Loading FFmpeg engine...");
  const ff = await getFFmpeg(onLog);

  const durationSec = Math.ceil(durationMs / 1000) + 1;

  // Write background video
  onProgress("Preparing background clip...");
  const bgData = new Uint8Array(backgroundClip.data);
  await ff.writeFile("bg.mp4", bgData);

  // Write voiceover audio
  onProgress("Preparing voiceover audio...");
  const audioData = new Uint8Array(await audioBlob.arrayBuffer());
  await ff.writeFile("voice.mp3", audioData);

  // Write subtitles
  onProgress("Generating captions...");
  const assContent = generateASS(wordBoundaries, 3);
  const encoder = new TextEncoder();
  await ff.writeFile("subs.ass", encoder.encode(assContent));

  // Write music if provided
  if (musicTrack) {
    onProgress("Preparing background music...");
    const musicData = new Uint8Array(musicTrack.data);
    await ff.writeFile("music.mp3", musicData);
  }

  // Single-pass: loop bg, scale, mix audio — all in one ffmpeg call
  onProgress("Encoding video (single-pass)...", 10);
 
  if (musicTrack) {
    const fadeStart = Math.max(0, durationSec - 2);
    await ff.exec([
      "-stream_loop", "-1",
      "-i", "bg.mp4",
      "-i", "voice.mp3",
      "-i", "music.mp3",
      "-t", String(durationSec),
      "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=24",
      "-filter_complex",
      `[2:a]volume=0.12,afade=t=out:st=${fadeStart}:d=2[music];[1:a][music]amix=inputs=2:duration=first[aout]`,
      "-map", "0:v",
      "-map", "[aout]",
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-tune", "fastdecode",
      "-crf", "28",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "96k",
      "-movflags", "+faststart",
      "-shortest",
      "-y", "final.mp4",
    ]);
  } else {
    await ff.exec([
      "-stream_loop", "-1",
      "-i", "bg.mp4",
      "-i", "voice.mp3",
      "-t", String(durationSec),
      "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=24",
      "-map", "0:v",
      "-map", "1:a",
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-tune", "fastdecode",
      "-crf", "28",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "96k",
      "-movflags", "+faststart",
      "-shortest",
      "-y", "final.mp4",
    ]);
  }

  onProgress("Reading output...", 90);
  const outputData = await ff.readFile("final.mp4");
  const outputBlob = new Blob([new Uint8Array(outputData as Uint8Array)], { type: "video/mp4" });

  // Cleanup
  try {
    await ff.deleteFile("bg.mp4");
    await ff.deleteFile("voice.mp3");
    await ff.deleteFile("subs.ass");
    await ff.deleteFile("final.mp4");
    if (musicTrack) await ff.deleteFile("music.mp3");
  } catch {}

  onProgress("Done!", 100);
  return outputBlob;
}
