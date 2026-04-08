import { useState } from "react";
import { Clapperboard, FolderOpen, Settings2 } from "lucide-react";
import Generator from "@/components/Generator";
import MediaManager from "@/components/MediaManager";

const TABS = [
  { id: "generate", label: "Generate", icon: Clapperboard },
  { id: "media", label: "Media", icon: FolderOpen },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function Index() {
  const [tab, setTab] = useState<TabId>("generate");

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border px-4 sm:px-6">
        <div className="max-w-3xl mx-auto flex items-center justify-between h-14">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center">
              <Clapperboard className="w-4 h-4 text-primary" />
            </div>
            <h1 className="font-heading text-base font-semibold tracking-tight">Reddit Shorts</h1>
          </div>
          <span className="text-xs text-muted-foreground hidden sm:block">
            Reddit → TTS → Captions → Video
          </span>
        </div>
      </header>

      {/* Tab bar */}
      <div className="border-b border-border px-4 sm:px-6">
        <div className="max-w-3xl mx-auto flex gap-0">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        {tab === "generate" && <Generator />}
        {tab === "media" && <MediaManager />}
      </main>
    </div>
  );
}
