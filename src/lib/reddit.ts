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
const MAX_WORDS = 130;

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

// Fetch directly from browser — Reddit allows browser requests (no CORS issue
// because .json endpoints return proper CORS headers for browser origins)
export async function fetchRedditPosts(
  subreddit: string,
  count: number,
  excludeIds: string[] = []
): Promise<RedditPost[]> {
  const url = `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/top.json?t=day&limit=50&raw_json=1`;

  const response = await fetch(url, {
    headers: {
      "Accept": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Reddit returned ${response.status}. Try again in a moment.`);
  }

  const data = await response.json();

  const filtered = (data?.data?.children || [])
    .map((child: any) => child.data)
    .filter((post: any) => {
      if (!post.selftext || post.selftext.trim() === "") return false;
      if (post.over_18) return false;
      if (post.is_video) return false;
      return true;
    })
    .filter((p: any) => !excludeIds.includes(p.id))
    .map((post: any) => {
      const cleaned = cleanText(post.selftext);
      const words = cleaned.split(/\s+/).filter(Boolean);
      return {
        id: post.id,
        title: post.title,
        selftext: cleaned,
        score: post.score,
        subreddit: post.subreddit,
        author: post.author,
        url: `https://reddit.com${post.permalink}`,
        num_comments: post.num_comments,
        created_utc: post.created_utc,
        wordCount: words.length,
        estimatedDuration: (words.length / WORDS_PER_MINUTE) * 60,
      };
    })
    .filter((p: RedditPost) => p.wordCount >= 20 && p.wordCount <= MAX_WORDS * 1.5)
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
