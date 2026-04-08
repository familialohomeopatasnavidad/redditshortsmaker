import { supabase } from "@/integrations/supabase/client";

export interface RedditPost {
  id: string;
  title: string;
  selftext: string;
  score: number;
  subreddit: string;
  author: string;
  url: string;
  num_comments: number;
  created_utc: number;
  wordCount: number;
  estimatedDuration: number;
}

const WORDS_PER_MINUTE = 150;
const MAX_WORDS = 130; // ~52 seconds at 150wpm, leaves room for hook + CTA

export async function fetchRedditPosts(
  subreddit: string,
  count: number,
  excludeIds: string[] = []
): Promise<RedditPost[]> {
  const { data, error } = await supabase.functions.invoke("reddit-fetch", {
    body: { subreddit, limit: 50, time: "day" },
  });

  if (error) throw new Error(`Reddit fetch failed: ${error.message}`);
  if (!data?.posts) throw new Error("No posts returned");

  const filtered = (data.posts as any[])
    .filter((p) => !excludeIds.includes(p.id))
    .filter((p) => p.score >= 500)
    .map((p) => {
      const words = p.selftext.split(/\s+/).filter(Boolean);
      return {
        ...p,
        wordCount: words.length,
        estimatedDuration: (words.length / WORDS_PER_MINUTE) * 60,
      };
    })
    .filter((p) => p.wordCount >= 20 && p.wordCount <= MAX_WORDS * 1.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, count);

  return filtered;
}

export function formatScript(post: RedditPost): string {
  const hook = `From r/${post.subreddit}: ${post.title}`;
  let body = post.selftext;

  // Truncate at sentence boundary if too long
  const words = body.split(/\s+/);
  if (words.length > MAX_WORDS) {
    const truncated = words.slice(0, MAX_WORDS).join(" ");
    const lastSentenceEnd = Math.max(
      truncated.lastIndexOf("."),
      truncated.lastIndexOf("!"),
      truncated.lastIndexOf("?")
    );
    if (lastSentenceEnd > truncated.length * 0.5) {
      body = truncated.slice(0, lastSentenceEnd + 1);
    } else {
      body = truncated + "...";
    }
  }

  const cta = "Follow for more Reddit stories.";
  return `${hook}\n\n${body}\n\n${cta}`;
}
