import { useState, useRef, useCallback, useEffect } from "react";
import { Play, Loader2, Download, Square, Trash2, Film } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchRedditPosts, formatScript, type RedditPost } from "@/lib/reddit";
import { synthesizeSpeech, getAvailableVoices, type TTSVoice } from "@/lib/tts";
import { assembleVideo } from "@/lib/video-assembler";
import { getBackgroundClips, getMusicTracks, getRandomItem, type StoredFile } from "@/lib/media-store";

interface GeneratedVideo {
  id: string;
  post: RedditPost;
  blob: Blob;
  url: string;
}

const SUBREDDITS = [
  "AskReddit",
  "AmItheAsshole",
  "tifu",
  "confession",
  "offmychest",
  "TrueOffMyChest",
  "NoSleep",
  "relationship_advice",
  "pettyrevenge",
  "MaliciousCompliance",
];

export default function Generator() {
  const [subreddit, setSubreddit] = useState("AskReddit");
  const [voices, setVoices] = useState<TTSVoice[]>([]);
  const [voice, setVoice] = useState("en-US-GuyNeural");
  const [bgClips, setBgClips] = useState<StoredFile[]>([]);
  const [selectedBg, setSelectedBg] = useState<string>("random");
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [videos, setVideos] = useState<GeneratedVideo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getAvailableVoices().then((v) => {
      setVoices(v);
      if (v.length > 0 && !v.find((x) => x.id === voice)) {
        setVoice(v[0].id);
      }
    });
    getBackgroundClips().then((clips) => {
      setBgClips(clips);
    });
  }, []);

  const addLog = useCallback((msg: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
    setTimeout(() => {
      logRef.current?.scrollTo(0, logRef.current.scrollHeight);
    }, 50);
  }, []);

  const generate = async () => {
    setRunning(true);
    setError(null);
    setLogs([]);
    abortRef.current = false;

    try {
      // Refresh clips list
      const clips = await getBackgroundClips();
      setBgClips(clips);
      const musicTracks = await getMusicTracks();

      if (clips.length === 0) {
        throw new Error("No background clips uploaded. Go to the Media tab and add video clips first.");
      }

      addLog(`Starting generation for r/${subreddit}`);
      addLog(`Found ${clips.length} background clip(s), ${musicTracks.length} music track(s)`);

      addLog("Fetching top posts from Reddit...");
      const usedIds = videos.map((v) => v.post.id);
      const posts = await fetchRedditPosts(subreddit, 1, usedIds);

      const post = posts[0];
      addLog(`✓ Found: "${post.title}" (⬆${post.score.toLocaleString()}, ${post.wordCount} words)`);

      if (abortRef.current) return;

      addLog("Formatting script...");
      const script = formatScript(post);
      addLog(`✓ Script: ${script.split(/\s+/).length} words`);

      if (abortRef.current) return;

      const selectedVoice = voices.find((v) => v.id === voice);
      addLog(`Generating voiceover (${selectedVoice?.name || voice})...`);
      const ttsResult = await synthesizeSpeech(script, voice);
      addLog(`✓ Audio: ${(ttsResult.durationMs / 1000).toFixed(1)}s, ${ttsResult.wordBoundaries.length} word boundaries, ${(ttsResult.audioBlob.size / 1024).toFixed(0)} KB`);

      if (abortRef.current) return;

      // Pick background clip
      const bgClip = selectedBg === "random"
        ? getRandomItem(clips)
        : clips.find((c) => c.name === selectedBg) || getRandomItem(clips);
      addLog(`Using background: ${bgClip.name}`);

      const musicTrack = musicTracks.length > 0 ? getRandomItem(musicTracks) : null;
      if (musicTrack) addLog(`Using music: ${musicTrack.name}`);

      addLog("Assembling video with FFmpeg (this may take a few minutes)...");
      const videoBlob = await assembleVideo({
        audioBlob: ttsResult.audioBlob,
        wordBoundaries: ttsResult.wordBoundaries,
        durationMs: ttsResult.durationMs,
        backgroundClip: bgClip,
        musicTrack: musicTrack,
        onProgress: (stage, percent) => {
          addLog(`  ${stage}${percent !== undefined ? ` (${percent}%)` : ""}`);
        },
        onLog: (msg) => {
          if (msg.includes("Error") || msg.includes("error")) {
            addLog(`  [ffmpeg] ${msg}`);
          }
        },
      });

      const videoUrl = URL.createObjectURL(videoBlob);
      setVideos((prev) => [{ id: post.id, post, blob: videoBlob, url: videoUrl }, ...prev]);
      addLog(`✓ Video ready! ${(videoBlob.size / 1024 / 1024).toFixed(1)} MB`);
    } catch (err: any) {
      const msg = err?.message || String(err);
      setError(msg);
      addLog(`✗ Error: ${msg}`);
    } finally {
      setRunning(false);
    }
  };

  const stop = () => {
    abortRef.current = true;
    addLog("Stopping...");
  };

  const downloadVideo = (video: GeneratedVideo) => {
    const a = document.createElement("a");
    a.href = video.url;
    a.download = `${video.post.subreddit.toLowerCase()}_${video.post.id}.mp4`;
    a.click();
  };

  const removeVideo = (id: string) => {
    setVideos((prev) => {
      const video = prev.find((v) => v.id === id);
      if (video) URL.revokeObjectURL(video.url);
      return prev.filter((v) => v.id !== id);
    });
  };

  // Group voices by locale for better UX
  const groupedVoices = voices.reduce<Record<string, TTSVoice[]>>((acc, v) => {
    const locale = v.locale || "en-US";
    if (!acc[locale]) acc[locale] = [];
    acc[locale].push(v);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-muted-foreground font-medium mb-1 uppercase tracking-wider">Subreddit</label>
          <select
            value={subreddit}
            onChange={(e) => setSubreddit(e.target.value)}
            disabled={running}
            className="w-full h-9 rounded-lg border border-input bg-secondary px-3 text-sm text-foreground disabled:opacity-50"
          >
            {SUBREDDITS.map((s) => (
              <option key={s} value={s}>r/{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground font-medium mb-1 uppercase tracking-wider">Voice</label>
          <select
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
            disabled={running}
            className="w-full h-9 rounded-lg border border-input bg-secondary px-3 text-sm text-foreground disabled:opacity-50"
          >
            {voices.length === 0 && <option value="">Loading voices...</option>}
            {Object.entries(groupedVoices).map(([locale, localeVoices]) => (
              <optgroup key={locale} label={locale}>
                {localeVoices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.gender})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground font-medium mb-1 uppercase tracking-wider">
            <Film className="w-3 h-3 inline mr-1" />Background Clip
          </label>
          <select
            value={selectedBg}
            onChange={(e) => setSelectedBg(e.target.value)}
            disabled={running}
            className="w-full h-9 rounded-lg border border-input bg-secondary px-3 text-sm text-foreground disabled:opacity-50"
          >
            <option value="random">🎲 Random</option>
            {bgClips.map((clip) => (
              <option key={clip.name} value={clip.name}>{clip.name}</option>
            ))}
          </select>
          {bgClips.length === 0 && (
            <p className="text-xs text-amber-400 mt-1">No clips uploaded — go to Media tab first</p>
          )}
        </div>
        <div className="flex items-end">
          {running ? (
            <Button onClick={stop} variant="destructive" className="h-9 px-5 w-full sm:w-auto">
              <Square className="w-3.5 h-3.5 mr-1.5" /> Stop
            </Button>
          ) : (
            <Button onClick={generate} className="h-9 px-5 w-full sm:w-auto">
              <Play className="w-3.5 h-3.5 mr-1.5" /> Generate
            </Button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Progress log */}
      <div
        ref={logRef}
        className="terminal-bg rounded-xl border border-border p-4 font-mono text-xs leading-6 h-52 overflow-y-auto"
      >
        {logs.length === 0 ? (
          <span className="text-muted-foreground">Ready. Click Generate to create a video.</span>
        ) : (
          logs.map((line, i) => (
            <div
              key={i}
              className={
                line.includes("✓") ? "text-emerald-400" :
                line.includes("✗") ? "text-destructive" :
                line.includes("Error") ? "text-destructive" :
                "text-muted-foreground"
              }
            >
              {line}
            </div>
          ))
        )}
        {running && (
          <span className="inline-flex items-center gap-1 text-primary">
            <Loader2 className="w-3 h-3 animate-spin" /> Processing...
          </span>
        )}
      </div>

      {/* Generated videos */}
      {videos.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-3">Generated Videos ({videos.length})</h3>
          <div className="space-y-3">
            {videos.map((video) => (
              <div key={video.id} className="flex gap-3 p-3 rounded-xl bg-secondary/30 border border-border">
                <div className="w-20 h-36 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                  <video
                    src={video.url}
                    className="w-full h-full object-cover"
                    muted
                    playsInline
                    onMouseEnter={(e) => (e.target as HTMLVideoElement).play()}
                    onMouseLeave={(e) => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-tight mb-1 line-clamp-2">{video.post.title}</p>
                  <p className="text-xs text-muted-foreground">
                    r/{video.post.subreddit} · ⬆{video.post.score.toLocaleString()} · {(video.blob.size / 1024 / 1024).toFixed(1)} MB
                  </p>
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" className="h-7 text-xs" onClick={() => downloadVideo(video)}>
                      <Download className="w-3 h-3 mr-1" /> Download MP4
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => removeVideo(video.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
