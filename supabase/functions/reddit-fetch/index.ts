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

// Use Reddit's public OAuth endpoint which is more reliable for server-side
async function getAccessToken(): Promise<string> {
  const resp = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      "Authorization": "Basic " + btoa("ZXhfcmVkZGl0X2FwcA:"),  // anonymous app-only
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "web:lovable-reddit-reader:v1.0 (by /u/lovable_app)",
    },
    body: "grant_type=https://oauth.reddit.com/grants/installed_client&device_id=DO_NOT_TRACK_THIS_DEVICE",
  });
  if (!resp.ok) {
    throw new Error(`OAuth token request failed: ${resp.status}`);
  }
  const data = await resp.json();
  return data.access_token;
}

async function fetchFromReddit(subreddit: string, limit: number, time: string): Promise<any> {
  // Strategy 1: Try OAuth API (most reliable)
  try {
    const token = await getAccessToken();
    const url = `https://oauth.reddit.com/r/${encodeURIComponent(subreddit)}/top?t=${time}&limit=${limit}&raw_json=1`;
    const resp = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "User-Agent": "web:lovable-reddit-reader:v1.0 (by /u/lovable_app)",
      },
    });
    if (resp.ok) {
      return await resp.json();
    }
    console.log("OAuth API returned", resp.status);
  } catch (e) {
    console.log("OAuth strategy failed:", e);
  }

  // Strategy 2: Try www.reddit.com .json
  const urls = [
    `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/top.json?t=${time}&limit=${limit}&raw_json=1`,
    `https://old.reddit.com/r/${encodeURIComponent(subreddit)}/top.json?t=${time}&limit=${limit}&raw_json=1`,
  ];

  let lastError = "";
  for (const url of urls) {
    try {
      const resp = await fetch(url, {
        headers: {
          "User-Agent": "web:lovable-reddit-reader:v1.0 (by /u/lovable_app)",
          "Accept": "application/json",
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
    console.error("reddit-fetch error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
