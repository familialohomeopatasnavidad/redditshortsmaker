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

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&nbsp;/g, " ");
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<p>/gi, "\n")
    .replace(/<\/p>/gi, "")
    .replace(/<[^>]+>/g, "")
    .trim();
}

// Parse posts from Reddit RSS/Atom feed
function parseRssFeed(xml: string, subreddit: string): any[] {
  const posts: any[] = [];
  
  // Match each <entry> in the Atom feed
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;
  
  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1];
    
    const titleMatch = entry.match(/<title[^>]*>([\s\S]*?)<\/title>/);
    const linkMatch = entry.match(/<link[^>]*href="([^"]*)"[^>]*\/>/);
    const contentMatch = entry.match(/<content[^>]*>([\s\S]*?)<\/content>/);
    const idMatch = entry.match(/<id>([\s\S]*?)<\/id>/);
    const authorMatch = entry.match(/<name>([\s\S]*?)<\/name>/);
    
    if (!contentMatch) continue;
    
    const rawContent = decodeHtmlEntities(contentMatch[1]);
    const textContent = stripHtml(rawContent);
    const cleanedText = cleanText(textContent);
    
    // Skip posts with very little text (likely link posts or images)
    if (cleanedText.length < 50) continue;
    
    // Extract ID from the full URL
    const permalink = linkMatch ? linkMatch[1] : "";
    const idParts = permalink.match(/\/comments\/([a-z0-9]+)\//);
    const id = idParts ? idParts[1] : (idMatch ? idMatch[1].replace(/[^a-z0-9]/gi, "").slice(-8) : Math.random().toString(36).slice(2, 10));
    
    posts.push({
      id,
      title: titleMatch ? decodeHtmlEntities(titleMatch[1]) : "Untitled",
      selftext: cleanedText,
      score: 0,  // RSS doesn't include score
      subreddit: subreddit,
      author: authorMatch ? authorMatch[1].replace("/u/", "") : "anonymous",
      url: permalink || `https://reddit.com/r/${subreddit}`,
      num_comments: 0,
      created_utc: Date.now() / 1000,
    });
  }
  
  return posts;
}

// Try multiple approaches to get Reddit data
async function fetchFromReddit(subreddit: string, limit: number, time: string): Promise<{ posts: any[], source: string }> {
  const ua = "web:lovable-reddit-reader:v1.0 (by /u/lovable_app)";
  const errors: string[] = [];

  // Strategy 1: JSON endpoint with minimal headers
  for (const domain of ["www.reddit.com", "old.reddit.com"]) {
    try {
      const url = `https://${domain}/r/${encodeURIComponent(subreddit)}/top.json?t=${time}&limit=${limit}&raw_json=1`;
      const resp = await fetch(url, {
        headers: { "User-Agent": ua, "Accept": "application/json" },
      });
      if (resp.ok) {
        const data = await resp.json();
        const posts = (data?.data?.children || [])
          .map((child: any) => child.data)
          .filter((post: any) => post.selftext && post.selftext.trim() !== "" && !post.over_18 && !post.is_video)
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
        return { posts, source: domain };
      }
      errors.push(`${domain}: ${resp.status}`);
    } catch (e) {
      errors.push(`${domain}: ${String(e)}`);
    }
  }

  // Strategy 2: RSS/Atom feed (usually less restricted)
  try {
    const rssUrl = `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/top.rss?t=${time}&limit=${limit}`;
    const resp = await fetch(rssUrl, {
      headers: { "User-Agent": ua, "Accept": "application/atom+xml,application/xml,text/xml" },
    });
    if (resp.ok) {
      const xml = await resp.text();
      const posts = parseRssFeed(xml, subreddit);
      if (posts.length > 0) {
        return { posts, source: "rss" };
      }
      errors.push("RSS: parsed 0 posts");
    } else {
      errors.push(`RSS: ${resp.status}`);
    }
  } catch (e) {
    errors.push(`RSS: ${String(e)}`);
  }

  throw new Error(`All Reddit endpoints failed: ${errors.join("; ")}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { subreddit = "AskReddit", limit = 25, time = "day" } = await req.json();
    console.log(`Fetching r/${subreddit}, limit=${limit}, time=${time}`);

    const { posts, source } = await fetchFromReddit(subreddit, limit, time);
    console.log(`Got ${posts.length} posts from ${source}`);

    return new Response(JSON.stringify({ posts, source }), {
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
