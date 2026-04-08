const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Reddit blocks server-side requests, so this edge function acts as a 
// transparent CORS proxy that forwards the browser's request through
// multiple fallback strategies.

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0",
];

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

async function fetchFromReddit(subreddit: string, limit: number, time: string): Promise<any> {
  const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

  // Try multiple endpoints
  const urls = [
    `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/top.json?t=${time}&limit=${limit}&raw_json=1`,
    `https://old.reddit.com/r/${encodeURIComponent(subreddit)}/top.json?t=${time}&limit=${limit}&raw_json=1`,
  ];

  let lastError = "";
  for (const url of urls) {
    try {
      const resp = await fetch(url, {
        headers: {
          "User-Agent": ua,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
          "Accept-Encoding": "gzip, deflate, br",
          "Connection": "keep-alive",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
          "Sec-Fetch-User": "?1",
          "Upgrade-Insecure-Requests": "1",
        },
      });
      if (resp.ok) {
        return await resp.json();
      }
      lastError = `${url} returned ${resp.status}`;
    } catch (e) {
      lastError = `${url}: ${String(e)}`;
    }
  }

  throw new Error(`All Reddit endpoints failed. Last: ${lastError}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { subreddit = "AskReddit", limit = 25, time = "day" } = await req.json();

    const data = await fetchFromReddit(subreddit, limit, time);

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
