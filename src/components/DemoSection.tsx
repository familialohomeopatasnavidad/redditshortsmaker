import { useState, useRef, useEffect, forwardRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Download, RotateCcw, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const SUBREDDITS = ["AskReddit", "AmItheAsshole", "tifu", "confession", "offmychest"];

const MOCK_STORIES: Record<string, { title: string; body: string; score: number; id: string }> = {
  AskReddit: { title: "What's the most unhinged thing you've seen a coworker do?", body: "So I worked at this office where Gary from accounting...", score: 14200, id: "abc123" },
  AmItheAsshole: { title: "AITA for refusing to share my lottery winnings with my family?", body: "I (28F) won $50,000 on a scratch ticket last month...", score: 8900, id: "def456" },
  tifu: { title: "TIFU by accidentally sending my boss a meme meant for my girlfriend", body: "This happened about 2 hours ago and I'm still shaking...", score: 22100, id: "ghi789" },
  confession: { title: "I've been pretending to be bad at cooking so my partner keeps making dinner", body: "I know this sounds terrible but hear me out...", score: 5400, id: "jkl012" },
  offmychest: { title: "I finally stood up to my toxic friend group and it felt amazing", body: "For 6 years I've been the doormat of my friend circle...", score: 11300, id: "mno345" },
};

const STAGES = [
  { label: "Fetching top post from r/", duration: 1200 },
  { label: "Cleaning and formatting script...", duration: 800 },
  { label: "Generating voiceover with edge-tts...", duration: 2000 },
  { label: "Transcribing audio for word timestamps...", duration: 1500 },
  { label: "Selecting random Minecraft parkour clip...", duration: 600 },
  { label: "Burning MrBeast-style captions...", duration: 2200 },
  { label: "Mixing background lofi music at 12%...", duration: 700 },
  { label: "Assembling final 1080×1920 MP4...", duration: 1800 },
  { label: "Generating thumbnail...", duration: 500 },
];

const DemoSection = forwardRef<HTMLDivElement>((_, ref) => {
  const [subreddit, setSubreddit] = useState("AskReddit");
  const [count, setCount] = useState(1);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [currentStage, setCurrentStage] = useState(-1);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const runDemo = async () => {
    setRunning(true);
    setDone(false);
    setLogs([]);
    setCurrentStage(0);

    const story = MOCK_STORIES[subreddit];
    const allLogs: string[] = [];

    const addLog = (msg: string) => {
      allLogs.push(msg);
      setLogs([...allLogs]);
    };

    addLog(`[START] Generating ${count} video(s) from r/${subreddit}`);
    addLog(`───────────────────────────────────`);

    for (let v = 0; v < count; v++) {
      if (count > 1) addLog(`\n▸ Video ${v + 1}/${count}`);

      for (let i = 0; i < STAGES.length; i++) {
        setCurrentStage(i);
        const stage = STAGES[i];
        const label = i === 0 ? stage.label + subreddit + "..." : stage.label;
        addLog(`  ⏳ ${label}`);
        await new Promise((r) => setTimeout(r, stage.duration));
        if (i === 0) {
          addLog(`  ✓ Found: "${story.title}" (⬆${story.score.toLocaleString()})`);
        } else {
          addLog(`  ✓ Done`);
        }
      }

      addLog(`  📦 Saved: output/${subreddit.toLowerCase()}_${story.id}.mp4`);
    }

    addLog(`\n───────────────────────────────────`);
    addLog(`[COMPLETE] ${count} video(s) ready for download`);
    setRunning(false);
    setDone(true);
    setCurrentStage(-1);
  };

  const reset = () => {
    setDone(false);
    setLogs([]);
    setCurrentStage(-1);
  };

  return (
    <section ref={ref} className="py-24 px-4">
      <div className="max-w-4xl mx-auto">
        <motion.h2
          className="font-heading text-3xl sm:text-4xl font-bold text-center mb-4"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          Try it now
        </motion.h2>
        <motion.p
          className="text-muted-foreground text-center mb-12 max-w-md mx-auto"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
        >
          This is a simulated demo — run the Docker image for real generation.
        </motion.p>

        <motion.div
          className="rounded-2xl border border-border glow-border overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.15 }}
        >
          {/* Controls */}
          <div className="p-6 border-b border-border bg-card/50 flex flex-col sm:flex-row items-start sm:items-end gap-4">
            <div className="flex-1 w-full sm:w-auto">
              <label className="block text-xs text-muted-foreground font-medium mb-1.5 uppercase tracking-wider">Subreddit</label>
              <select
                value={subreddit}
                onChange={(e) => setSubreddit(e.target.value)}
                disabled={running}
                className="w-full h-10 rounded-lg border border-input bg-secondary px-3 text-sm text-foreground focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                {SUBREDDITS.map((s) => (
                  <option key={s} value={s}>r/{s}</option>
                ))}
              </select>
            </div>
            <div className="w-full sm:w-28">
              <label className="block text-xs text-muted-foreground font-medium mb-1.5 uppercase tracking-wider">Videos</label>
              <input
                type="number"
                min={1}
                max={5}
                value={count}
                onChange={(e) => setCount(Math.max(1, Math.min(5, Number(e.target.value))))}
                disabled={running}
                className="w-full h-10 rounded-lg border border-input bg-secondary px-3 text-sm text-foreground focus:ring-2 focus:ring-ring disabled:opacity-50"
              />
            </div>
            <div className="flex gap-2">
              {!done ? (
                <Button onClick={runDemo} disabled={running} className="h-10 px-6 rounded-xl font-semibold">
                  {running ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-1.5" /> Generating...</>
                  ) : (
                    <><Play className="w-4 h-4 mr-1.5" /> Generate</>
                  )}
                </Button>
              ) : (
                <Button onClick={reset} variant="outline" className="h-10 px-6 rounded-xl font-semibold">
                  <RotateCcw className="w-4 h-4 mr-1.5" /> Reset
                </Button>
              )}
            </div>
          </div>

          {/* Terminal */}
          <div ref={logRef} className="terminal-bg p-5 font-mono text-xs leading-6 h-72 overflow-y-auto">
            <AnimatePresence>
              {logs.length === 0 && !running && (
                <motion.div
                  className="text-muted-foreground h-full flex items-center justify-center"
                  exit={{ opacity: 0 }}
                >
                  Click Generate to start the pipeline →
                </motion.div>
              )}
            </AnimatePresence>
            {logs.map((line, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.15 }}
                className={
                  line.includes("✓") ? "text-emerald-400" :
                  line.includes("⏳") ? "text-muted-foreground" :
                  line.includes("[COMPLETE]") ? "text-primary font-bold" :
                  line.includes("[START]") ? "text-foreground font-semibold" :
                  line.includes("📦") ? "text-accent" :
                  "text-muted-foreground"
                }
              >
                {line}
              </motion.div>
            ))}
            {running && (
              <motion.span
                className="inline-block w-2 h-4 bg-primary ml-1"
                animate={{ opacity: [1, 0] }}
                transition={{ repeat: Infinity, duration: 0.7 }}
              />
            )}
          </div>

          {/* Downloads */}
          <AnimatePresence>
            {done && (
              <motion.div
                className="border-t border-border bg-card/30 p-6"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                transition={{ duration: 0.4 }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <span className="font-heading font-semibold">{count} video{count > 1 ? "s" : ""} ready</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Array.from({ length: count }).map((_, i) => {
                    const story = MOCK_STORIES[subreddit];
                    return (
                      <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50 border border-border">
                        {/* Fake thumbnail */}
                        <div className="w-14 h-24 rounded-lg bg-gradient-to-b from-emerald-900/60 to-emerald-950/80 flex items-center justify-center flex-shrink-0 relative overflow-hidden">
                          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiBmaWxsPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMDMpIi8+PC9zdmc+')] opacity-50" />
                          <span className="text-[8px] text-emerald-300 font-bold z-10">9:16</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{story.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">r/{subreddit} · ⬆{story.score.toLocaleString()}</p>
                        </div>
                        <Button size="sm" variant="ghost" className="shrink-0 text-primary hover:text-primary">
                          <Download className="w-4 h-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </section>
  );
});

DemoSection.displayName = "DemoSection";
export default DemoSection;
