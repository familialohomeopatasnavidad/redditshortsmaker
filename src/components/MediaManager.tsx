import { useState, useCallback } from "react";
import { Upload, X, Film, Music, HardDrive } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  saveBackgroundClip,
  saveMusicTrack,
  getBackgroundClips,
  getMusicTracks,
  removeBackgroundClip,
  removeMusicTrack,
  type StoredFile,
} from "@/lib/media-store";
import { useEffect } from "react";

export default function MediaManager() {
  const [bgClips, setBgClips] = useState<StoredFile[]>([]);
  const [musicTracks, setMusicTracks] = useState<StoredFile[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [clips, tracks] = await Promise.all([getBackgroundClips(), getMusicTracks()]);
    setBgClips(clips);
    setMusicTracks(tracks);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      await saveBackgroundClip(file);
    }
    await refresh();
    e.target.value = "";
  };

  const handleMusicUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      await saveMusicTrack(file);
    }
    await refresh();
    e.target.value = "";
  };

  const removeBg = async (name: string) => {
    await removeBackgroundClip(name);
    await refresh();
  };

  const removeMusic = async (name: string) => {
    await removeMusicTrack(name);
    await refresh();
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  if (loading) {
    return <div className="text-muted-foreground text-sm p-4">Loading media library...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Background Clips */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Film className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">Background Clips</span>
            <span className="text-xs text-muted-foreground">({bgClips.length})</span>
          </div>
          <label>
            <input type="file" accept="video/*" multiple onChange={handleBgUpload} className="hidden" />
            <Button size="sm" variant="outline" className="h-7 text-xs cursor-pointer" asChild>
              <span><Upload className="w-3 h-3 mr-1" /> Add Clips</span>
            </Button>
          </label>
        </div>
        {bgClips.length === 0 ? (
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl p-6 cursor-pointer hover:border-primary/50 transition-colors">
            <input type="file" accept="video/*" multiple onChange={handleBgUpload} className="hidden" />
            <Film className="w-8 h-8 text-muted-foreground mb-2" />
            <span className="text-sm text-muted-foreground">Drop Minecraft parkour clips here</span>
            <span className="text-xs text-muted-foreground mt-1">MP4, WebM, MOV</span>
          </label>
        ) : (
          <div className="space-y-1.5">
            {bgClips.map((clip) => (
              <div key={clip.name} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/30 text-sm">
                <Film className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span className="truncate flex-1">{clip.name}</span>
                <span className="text-xs text-muted-foreground">{formatSize(clip.data.byteLength)}</span>
                <button onClick={() => removeBg(clip.name)} className="text-muted-foreground hover:text-destructive">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Music Tracks */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Music className="w-4 h-4 text-accent" />
            <span className="text-sm font-medium">Music Tracks</span>
            <span className="text-xs text-muted-foreground">({musicTracks.length})</span>
          </div>
          <label>
            <input type="file" accept="audio/*" multiple onChange={handleMusicUpload} className="hidden" />
            <Button size="sm" variant="outline" className="h-7 text-xs cursor-pointer" asChild>
              <span><Upload className="w-3 h-3 mr-1" /> Add Music</span>
            </Button>
          </label>
        </div>
        {musicTracks.length === 0 ? (
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl p-6 cursor-pointer hover:border-accent/50 transition-colors">
            <input type="file" accept="audio/*" multiple onChange={handleMusicUpload} className="hidden" />
            <Music className="w-8 h-8 text-muted-foreground mb-2" />
            <span className="text-sm text-muted-foreground">Drop lofi / chill music tracks here</span>
            <span className="text-xs text-muted-foreground mt-1">MP3, WAV, M4A</span>
          </label>
        ) : (
          <div className="space-y-1.5">
            {musicTracks.map((track) => (
              <div key={track.name} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/30 text-sm">
                <Music className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span className="truncate flex-1">{track.name}</span>
                <span className="text-xs text-muted-foreground">{formatSize(track.data.byteLength)}</span>
                <button onClick={() => removeMusic(track.name)} className="text-muted-foreground hover:text-destructive">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Storage info */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t border-border">
        <HardDrive className="w-3.5 h-3.5" />
        <span>
          Files stored in your browser (IndexedDB). They persist across sessions.
        </span>
      </div>
    </div>
  );
}
