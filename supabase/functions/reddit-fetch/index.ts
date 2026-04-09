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

async function fetchFromReddit(subreddit: string, limit: number, time: string): Promise<any[]> {
  const errors: string[] = [];
  const now = Math.floor(Date.now() / 1000);
  const fetchLimit = Math.min(Math.max(limit * 4, limit), 100);

  const timeRanges: Record<string, number> = {
    hour: 3600, day: 86400, week: 604800, month: 2592000, year: 31536000,
  };
  const afterUnix = now - (timeRanges[time] || 86400);

  // Strategy 1: Arctic Shift — its API rejects some sort params, so fetch a larger batch
  // and rank/filter client-side.
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
        }))
        .sort((a: any, b: any) => b.score - a.score)
        .slice(0, limit);
      if (posts.length > 0) {
        console.log(`Arctic Shift returned ${posts.length} posts`);
        return posts;
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
        .sort((a: any, b: any) => b.score - a.score)
        .slice(0, limit);
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
