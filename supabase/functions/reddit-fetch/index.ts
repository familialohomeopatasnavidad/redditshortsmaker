const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const REDDIT_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { subreddit = "AskReddit", limit = 25, time = "day" } = await req.json();

    const url = `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/top.json?t=${time}&limit=${limit}`;
    
    const response = await fetch(url, {
      headers: { "User-Agent": REDDIT_USER_AGENT },
    });

    if (!response.ok) {
      const text = await response.text();
      return new Response(JSON.stringify({ error: `Reddit returned ${response.status}`, details: text }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const posts = (data?.data?.children || [])
      .map((child: any) => child.data)
      .filter((post: any) => {
        if (!post.selftext || post.selftext.trim() === "") return false;
        if (post.over_18) return false;
        if (post.is_video) return false;
        return true;
      })
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

    return new Response(JSON.stringify({ posts }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function cleanText(text: string): string {
  let cleaned = text;
  // Remove edit sections
  cleaned = cleaned.replace(/\n*edit\s*\d*\s*:.*/gi, "");
  cleaned = cleaned.replace(/\n*update\s*\d*\s*:.*/gi, "");
  // Remove markdown links
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  // Remove URLs
  cleaned = cleaned.replace(/https?:\/\/\S+/g, "");
  // Remove reddit usernames
  cleaned = cleaned.replace(/\/?u\/\w+/g, "");
  cleaned = cleaned.replace(/\/?r\/\w+/g, "");
  // Remove markdown formatting
  cleaned = cleaned.replace(/[*_~`#>]/g, "");
  // Collapse whitespace
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  cleaned = cleaned.trim();
  return cleaned;
}
