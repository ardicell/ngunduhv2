export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/download") {
      const targetUrl = url.searchParams.get("url");
      if (!targetUrl) return new Response("URL required", { status: 400 });

      try {
        const result = await extractMedia(targetUrl);
        return new Response(JSON.stringify(result), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }
    }

    // Serve all other requests (HTML, CSS, JS, etc.) from /public
    return env.ASSETS.fetch(request);
  }
};

async function extractMedia(url) {
  const hostname = new URL(url).hostname;

  // YouTube
  if (hostname.includes("youtube.com") || hostname.includes("youtu.be")) {
    const videoId = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/)[1];
    const apiUrl = `https://yt.lemnoslife.com/noKey/videos?part=contentDetails&id=${videoId}`;
    const response = await fetch(apiUrl);
    const data = await response.json();

    if (!data.items || data.items.length === 0) throw new Error("Video tidak ditemukan");

    const videoDetails = data.items[0];
    const duration = videoDetails.contentDetails.duration;

    return {
      title: "YouTube Video",
      type: "video",
      sources: [
        {
          quality: "HD",
          url: `https://www.youtube.com/watch?v=${videoId}`,
          download: `https://youtubepi.herokuapp.com/dl?id=${videoId}`
        }
      ],
      thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
      meta: {
        duration,
        platform: "YouTube"
      }
    };
  }

  // Instagram
  if (hostname.includes("instagram.com")) {
    const shortcode = url.split("/p/")[1].split("/")[0];
    const apiUrl = `https://www.instagram.com/p/${shortcode}/?__a=1`;
    const response = await fetch(apiUrl);
    const data = await response.json();

    const media = data.graphql.shortcode_media;
    const isVideo = media.is_video;
    const mediaUrl = isVideo ? media.video_url : media.display_url;

    return {
      title: media.owner.username,
      type: isVideo ? "video" : "image",
      sources: [
        {
          quality: "Original",
          url: mediaUrl,
          download: mediaUrl
        }
      ],
      thumbnail: media.display_url,
      meta: {
        likes: media.edge_media_preview_like.count,
        comments: media.edge_media_to_comment.count,
        platform: "Instagram"
      }
    };
  }

  // Twitter
  if (hostname.includes("twitter.com") || hostname.includes("x.com")) {
    const statusId = url.split("/status/")[1].split("?")[0];
    const apiUrl = `https://cdn.syndication.twimg.com/tweet-result?id=${statusId}`;
    const response = await fetch(apiUrl);
    const data = await response.json();

    const media = data.mediaDetails?.[0];
    if (!media) throw new Error("Media tidak ditemukan");

    const mediaUrl = media.type === "video"
      ? media.video_info.variants[0].url
      : media.media_url_https;

    return {
      title: data.user.name,
      type: media.type,
      sources: [
        {
          quality: "HD",
          url: mediaUrl,
          download: mediaUrl
        }
      ],
      thumbnail: media.media_url_https,
      meta: {
        retweets: data.conversation_count,
        likes: data.favorite_count,
        platform: "Twitter"
      }
    };
  }

  // Facebook
  if (hostname.includes("facebook.com")) {
    const response = await fetch(url);
    const html = await response.text();
    const videoMatch = html.match(/"browser_native_hd_url":"([^"]+)"/) ||
                       html.match(/"browser_native_sd_url":"([^"]+)"/);

    if (!videoMatch) throw new Error("Video tidak ditemukan");

    const videoUrl = JSON.parse(`"${videoMatch[1]}"`);
    const thumbMatch = html.match(/"preferred_thumbnail":{"image":{"uri":"([^"]+)"/);
    const thumbnail = thumbMatch ? JSON.parse(`"${thumbMatch[1]}"`) : "";
    const titleMatch = html.match(/"name":"([^"]+)"/);
    const title = titleMatch ? JSON.parse(`"${titleMatch[1]}"`) : "Facebook Video";

    return {
      title,
      type: "video",
      sources: [
        {
          quality: "HD",
          url: videoUrl,
          download: videoUrl
        }
      ],
      thumbnail,
      meta: {
        platform: "Facebook"
      }
    };
  }

  // TikTok
  if (hostname.includes("tiktok.com")) {
    const videoId = url.match(/video\/(\d+)/)?.[1] || url.match(/@[^/]+\/video\/(\d+)/)?.[1];
    if (!videoId) throw new Error("ID video TikTok tidak ditemukan");

    const apiUrl = `https://api.tiktokv.com/aweme/v1/feed/?aweme_id=${videoId}`;
    const response = await fetch(apiUrl);
    const data = await response.json();

    const videoData = data.aweme_list?.[0];
    if (!videoData) throw new Error("Video TikTok tidak ditemukan");

    const videoUrl = videoData.video.play_addr.url_list[0];
    const musicUrl = videoData.music.play_url.url_list[0];

    return {
      title: videoData.desc,
      type: "video",
      sources: [
        {
          quality: "Video HD",
          url: videoUrl,
          download: videoUrl
        },
        {
          quality: "Audio",
          url: musicUrl,
          download: musicUrl
        }
      ],
      thumbnail: videoData.video.cover.url_list[0],
      meta: {
        likes: videoData.statistics.digg_count,
        comments: videoData.statistics.comment_count,
        platform: "TikTok"
      }
    };
  }

  throw new Error("Platform tidak didukung");
}