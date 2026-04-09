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
const MAX_WORDS = 200;

function cleanText(text: string): string {
  let cleaned = text;
  cleaned = cleaned.replace(/\n*edit\s*\d*\s*:.*/gi, "");
  cleaned = cleaned.replace(/\n*update\s*\d*\s*:.*/gi, "");
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  cleaned = cleaned.replace(/https?:\/\/\S+/g, "");
  cleaned = cleaned.replace(/\/?u\/\w+/g, "");
  cleaned = cleaned.replace(/\/?r\/\w+/g, "");
  cleaned = cleaned.replace(/[*_~`#>]/g, "");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  return cleaned.trim();
}

// Fetch via edge function to bypass CORS / Reddit blocking
export async function fetchRedditPosts(
  subreddit: string,
  count: number,
  excludeIds: string[] = []
): Promise<RedditPost[]> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const response = await fetch(`${supabaseUrl}/functions/v1/reddit-fetch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": supabaseKey,
      "Authorization": `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify({ subreddit, limit: 50, time: "day" }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Reddit fetch failed (${response.status}): ${errBody}`);
  }

  const result = await response.json();
  if (result.error) {
    throw new Error(result.error);
  }

  const allPosts = result.posts || [];

  const filtered = allPosts
    .filter((p: any) => !excludeIds.includes(p.id))
    .filter((p: any) => p.selftext && p.selftext.trim().length > 0)
    .map((post: any) => {
      const cleaned = cleanText(post.selftext);
      const words = cleaned.split(/\s+/).filter(Boolean);
      return {
        id: post.id,
        title: post.title,
        selftext: cleaned,
        score: post.score || 0,
        subreddit: post.subreddit,
        author: post.author,
        url: post.url || `https://reddit.com/r/${post.subreddit}/comments/${post.id}`,
        num_comments: post.num_comments || 0,
        created_utc: post.created_utc,
        wordCount: words.length,
        estimatedDuration: (words.length / WORDS_PER_MINUTE) * 60,
      };
    })
    .filter((p: RedditPost) => p.wordCount >= 25 && p.wordCount <= MAX_WORDS * 1.5)
    .sort((a: RedditPost, b: RedditPost) => b.score - a.score)
    .slice(0, count);

  if (filtered.length === 0) {
    throw new Error("No suitable posts found. Try a different subreddit.");
  }

  return filtered;
}

export function formatScript(post: RedditPost): string {
  const hook = `From r/${post.subreddit}: ${post.title}`;
  let body = post.selftext;

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
