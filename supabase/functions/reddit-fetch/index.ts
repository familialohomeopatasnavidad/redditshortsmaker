const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

// Quality score: longer stories with real narrative content rank higher
function qualityScore(text: string, upvotes: number): number {
  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  // Ideal range: 40-200 words for short-form video
  let lengthScore = 0;
  if (wordCount >= 40 && wordCount <= 200) lengthScore = 1;
  else if (wordCount >= 25 && wordCount < 40) lengthScore = 0.6;
  else if (wordCount > 200 && wordCount <= 350) lengthScore = 0.7;
  else lengthScore = 0.3;

  // Narrative indicators: first person, past tense, emotional words
  const narrativePatterns = /\b(I |my |me |we |our |was |had |felt |thought |realized|remember|happened|decided|told|asked|said)\b/gi;
  const narrativeMatches = (text.match(narrativePatterns) || []).length;
  const narrativeScore = Math.min(narrativeMatches / 5, 1);

  // Sentence structure: prefer multi-sentence stories
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const structureScore = Math.min(sentences.length / 4, 1);

  // Upvote boost (log scale)
  const upvoteScore = Math.min(Math.log10(Math.max(upvotes, 1) + 1) / 4, 1);

  return (lengthScore * 0.3) + (narrativeScore * 0.3) + (structureScore * 0.2) + (upvoteScore * 0.2);
}

// Filter out low-quality / non-story content
function isGoodStory(text: string): boolean {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 25) return false;
  if (words.length > 500) return false;

  // Skip lists, Q&As, meta posts
  const listLines = (text.match(/^\s*[-•*]\s/gm) || []).length;
  if (listLines > 5) return false;

  // Skip very short sentences only (clickbait)
  const avgWordPerSentence = words.length / Math.max((text.match(/[.!?]/g) || []).length, 1);
  if (avgWordPerSentence < 4) return false;

  return true;
}

function isUsableComment(comment: any): boolean {
  const body = typeof comment?.body === "string" ? cleanText(comment.body) : "";
  const author = String(comment?.author || "").toLowerCase();

  if (!body || body === "[removed]" || body === "[deleted]") return false;
  if (body.split(/\s+/).filter(Boolean).length < 25) return false;
  if (author.includes("automoderator") || author.includes("bot")) return false;
  if (/i am a bot|this action was performed automatically|please read this message/i.test(body)) return false;
  if (!isGoodStory(body)) return false;

  return true;
}

async function fetchTopComments(subreddit: string, limit: number): Promise<any[]> {
  const fetchLimit = Math.min(Math.max(limit * 4, limit), 100);
  const url = `https://arctic-shift.photon-reddit.com/api/comments/search?subreddit=${encodeURIComponent(subreddit)}&limit=${fetchLimit}`;
  console.log("Trying comment fallback:", url);

  const resp = await fetch(url, {
    headers: { "User-Agent": "reddit-shorts-maker/1.0" },
  });

  if (!resp.ok) {
    throw new Error(`Comment fallback: ${resp.status}`);
  }

  const data = await resp.json();
  const raw = (data?.data || [])
    .filter((comment: any) => isUsableComment(comment))
    .map((comment: any) => ({
      id: `comment-${comment.id}`,
      title: comment.link_title || `Top response from r/${comment.subreddit || subreddit}`,
      selftext: cleanText(comment.body),
      score: comment.score || 0,
      subreddit: comment.subreddit || subreddit,
      author: comment.author || "anonymous",
      url: comment.permalink ? `https://reddit.com${comment.permalink}` : `https://reddit.com/r/${subreddit}`,
      num_comments: 0,
      created_utc: comment.created_utc || Math.floor(Date.now() / 1000),
    }));

  // Rank by quality score instead of just upvotes
  return raw
    .map((p: any) => ({ ...p, _quality: qualityScore(p.selftext, p.score) }))
    .sort((a: any, b: any) => b._quality - a._quality)
    .slice(0, limit)
    .map(({ _quality, ...rest }: any) => rest);
}

async function fetchFromReddit(subreddit: string, limit: number, time: string): Promise<any[]> {
  const errors: string[] = [];
  const now = Math.floor(Date.now() / 1000);
  const fetchLimit = Math.min(Math.max(limit * 4, limit), 100);

  const timeRanges: Record<string, number> = {
    hour: 3600, day: 86400, week: 604800, month: 2592000, year: 31536000,
  };
  const afterUnix = now - (timeRanges[time] || 86400);

  // Strategy 1: Arctic Shift (posts) — fetch large batch, quality-rank client-side
  try {
    const url = `https://arctic-shift.photon-reddit.com/api/posts/search?subreddit=${encodeURIComponent(subreddit)}&limit=${fetchLimit}`;
    console.log("Trying Arctic Shift:", url);
    const resp = await fetch(url, {
      headers: { "User-Agent": "reddit-shorts-maker/1.0" },
    });
    if (resp.ok) {
      const data = await resp.json();
      const posts = (data?.data || [])
        .filter((post: any) =>
          post.selftext &&
          post.selftext.trim() !== "" &&
          post.selftext !== "[removed]" &&
          post.selftext !== "[deleted]" &&
          !post.over_18 &&
          // client-side time filter using afterUnix
          (post.created_utc ? post.created_utc >= afterUnix : true)
        )
        .map((post: any) => ({
          id: post.id,
          title: post.title,
          selftext: cleanText(post.selftext),
          score: post.score || 0,
          subreddit: post.subreddit || subreddit,
          author: post.author || "anonymous",
          url: `https://reddit.com/r/${post.subreddit || subreddit}/comments/${post.id}`,
          num_comments: post.num_comments || 0,
          created_utc: post.created_utc || now,
        }));

      // Quality-rank instead of pure score sort
      const ranked = posts
        .filter((p: any) => isGoodStory(p.selftext))
        .map((p: any) => ({ ...p, _quality: qualityScore(p.selftext, p.score) }))
        .sort((a: any, b: any) => b._quality - a._quality)
        .slice(0, limit)
        .map(({ _quality, ...rest }: any) => rest);

      if (ranked.length > 0) {
        console.log(`Arctic Shift returned ${ranked.length} quality posts`);
        return ranked;
      }
      errors.push(`Arctic Shift: 0 text posts`);
    } else {
      const body = await resp.text();
      console.log("Arctic Shift error body:", body.slice(0, 300));
      errors.push(`Arctic Shift: ${resp.status}`);
    }
  } catch (e) {
    errors.push(`Arctic Shift: ${String(e)}`);
  }

  // Strategy 2: PullPush
  try {
    const url = `https://api.pullpush.io/reddit/search/submission/?subreddit=${encodeURIComponent(subreddit)}&after=${afterUnix}&sort=score&sort_type=desc&size=${fetchLimit}`;
    console.log("Trying PullPush:", url);
    const resp = await fetch(url, {
      headers: { "User-Agent": "reddit-shorts-maker/1.0" },
    });
    if (resp.ok) {
      const data = await resp.json();
      const posts = (data?.data || [])
        .filter((post: any) =>
          post.selftext &&
          post.selftext.trim() !== "" &&
          post.selftext !== "[removed]" &&
          post.selftext !== "[deleted]" &&
          !post.over_18
        )
        .map((post: any) => ({
          id: post.id,
          title: post.title,
          selftext: cleanText(post.selftext),
          score: post.score || 0,
          subreddit: post.subreddit || subreddit,
          author: post.author || "anonymous",
          url: post.full_link || `https://reddit.com/r/${subreddit}/comments/${post.id}`,
          num_comments: post.num_comments || 0,
          created_utc: post.created_utc || now,
        }))
        .filter((p: any) => isGoodStory(p.selftext))
        .map((p: any) => ({ ...p, _quality: qualityScore(p.selftext, p.score) }))
        .sort((a: any, b: any) => b._quality - a._quality)
        .slice(0, limit)
        .map(({ _quality, ...rest }: any) => rest);
      if (posts.length > 0) {
        console.log(`PullPush returned ${posts.length} posts`);
        return posts;
      }
      errors.push("PullPush: 0 text posts");
    } else {
      errors.push(`PullPush: ${resp.status}`);
    }
  } catch (e) {
    errors.push(`PullPush: ${String(e)}`);
  }

  // Strategy 3: Direct Reddit JSON
  try {
    const url = `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/top.json?t=${time}&limit=${limit}&raw_json=1`;
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
        "Accept": "application/json",
      },
    });
    if (resp.ok) {
      const data = await resp.json();
      const posts = (data?.data?.children || [])
        .map((child: any) => child.data)
        .filter((post: any) =>
          post.selftext &&
          post.selftext.trim() !== "" &&
          post.selftext !== "[removed]" &&
          post.selftext !== "[deleted]" &&
          !post.over_18 &&
          !post.is_video
        )
        .map((post: any) => ({
          id: post.id,
          title: post.title,
          selftext: cleanText(post.selftext),
          score: post.score,
          subreddit: post.subreddit,
          author: post.author,
          url: `https://reddit.com${post.permalink}`,
          num_comments: post.num_comments,
          created_utc: post.created_utc,
        }));
      if (posts.length > 0) return posts;
      errors.push("Reddit JSON: 0 text posts");
    } else {
      errors.push(`Reddit JSON: ${resp.status}`);
    }
  } catch (e) {
    errors.push(`Reddit JSON: ${String(e)}`);
  }

  // Strategy 4: RSS fallback via rss2json (no CORS, no auth needed)
  try {
    const rssUrl = `https://www.reddit.com/r/${subreddit}/top.rss?t=${time}`;
    const url = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}&count=${limit}`;
    console.log("Trying RSS fallback:", url);
    const resp = await fetch(url);
    if (resp.ok) {
      const data = await resp.json();
      const posts = (data?.items || [])
        .filter((item: any) => item.description && item.description.length > 100)
        .map((item: any) => ({
          id: item.guid?.split("/").pop() || String(Math.random()),
          title: item.title,
          selftext: cleanText(item.description.replace(/<[^>]+>/g, "")),
          score: 0,
          subreddit,
          author: item.author || "anonymous",
          url: item.link,
          num_comments: 0,
          created_utc: Math.floor(new Date(item.pubDate).getTime() / 1000),
        }));
      if (posts.length > 0) {
        console.log(`RSS fallback returned ${posts.length} posts`);
        return posts;
      }
      errors.push("RSS: 0 text posts");
    } else {
      errors.push(`RSS: ${resp.status}`);
    }
  } catch (e) {
    errors.push(`RSS: ${String(e)}`);
  }

  // Strategy 5: comment fallback for question-driven subreddits like AskReddit
  try {
    const comments = await fetchTopComments(subreddit, limit);
    if (comments.length > 0) {
      console.log(`Comment fallback returned ${comments.length} items`);
      return comments;
    }
    errors.push("Comments: 0 usable items");
  } catch (e) {
    errors.push(`Comments: ${String(e)}`);
  }

  throw new Error(`All Reddit sources failed: ${errors.join("; ")}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { subreddit = "AskReddit", limit = 25, time = "day" } = await req.json();
    console.log(`Fetching r/${subreddit}, limit=${limit}, time=${time}`);

    const posts = await fetchFromReddit(subreddit, limit, time);

    return new Response(JSON.stringify({ posts }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("reddit-fetch error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
