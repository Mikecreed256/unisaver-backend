// server.js - Complete solution with all platform support using yt-dlp and cookie support for Instagram
const express = require('express');
const cors = require('cors');
// Use youtube-dl-exec with yt-dlp as the binary for more modern extraction
const youtubeDl = require('youtube-dl-exec');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

// For Instagram extraction with cookie support
const instagramDirect = require('instagram-url-direct');

const app = express();
const PORT = process.env.PORT || 5000;

// Create a temporary directory for downloads
const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR);
}

// Middleware
app.use(cors());
app.use(express.json());

// Increase timeout for external requests
http.globalAgent.maxSockets = 25;
https.globalAgent.maxSockets = 25;
http.globalAgent.keepAlive = true;
https.globalAgent.keepAlive = true;

// Routes
app.get('/', (req, res) => {
  res.send('Download API is running');
});

// Enhanced platform detection
function detectPlatform(url) {
  const lowerUrl = url.toLowerCase();

  // Social Media Platforms
  if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) {
    return 'youtube';
  } else if (lowerUrl.includes('facebook.com') || lowerUrl.includes('fb.com') || lowerUrl.includes('fb.watch')) {
    return 'facebook';
  } else if (lowerUrl.includes('instagram.com')) {
    return 'instagram';
  } else if (lowerUrl.includes('tiktok.com')) {
    return 'tiktok';
  } else if (lowerUrl.includes('twitter.com') || lowerUrl.includes('x.com')) {
    return 'twitter';
  } else if (lowerUrl.includes('threads.net')) {
    return 'threads';
  } else if (lowerUrl.includes('pinterest.com')) {
    return 'pinterest';
  }
  // Music Platforms
  else if (lowerUrl.includes('spotify.com')) {
    return 'spotify';
  } else if (lowerUrl.includes('soundcloud.com')) {
    return 'soundcloud';
  } else if (lowerUrl.includes('bandcamp.com')) {
    return 'bandcamp';
  } else if (lowerUrl.includes('deezer.com')) {
    return 'deezer';
  } else if (lowerUrl.includes('music.apple.com')) {
    return 'apple-music';
  } else if (lowerUrl.includes('music.amazon.com')) {
    return 'amazon-music';
  } else if (lowerUrl.includes('mixcloud.com')) {
    return 'mixcloud';
  } else if (lowerUrl.includes('audiomack.com')) {
    return 'audiomack';
  }
  // Video Platforms
  else if (lowerUrl.includes('vimeo.com')) {
    return 'vimeo';
  } else if (lowerUrl.includes('dailymotion.com')) {
    return 'dailymotion';
  } else if (lowerUrl.includes('twitch.tv')) {
    return 'twitch';
  } else if (lowerUrl.includes('reddit.com')) {
    return 'reddit';
  } else if (lowerUrl.includes('linkedin.com')) {
    return 'linkedin';
  } else if (lowerUrl.includes('tumblr.com')) {
    return 'tumblr';
  } else if (lowerUrl.includes('vk.com')) {
    return 'vk';
  } else if (lowerUrl.includes('bilibili.com')) {
    return 'bilibili';
  } else if (lowerUrl.includes('snapchat.com')) {
    return 'snapchat';
  } else {
    return 'generic';
  }
}

// Get media type based on platform
function getMediaType(platform) {
  if (
    ['spotify', 'soundcloud', 'bandcamp', 'deezer', 'apple-music', 'amazon-music', 'mixcloud', 'audiomack'].includes(platform)
  ) {
    return 'audio';
  } else {
    return 'video';
  }
}

// --------------------
// INSTAGRAM ENDPOINT
// --------------------
// This endpoint uses instagram-url-direct and supports an optional "cookie" query parameter.
app.get('/api/instagram', async (req, res) => {
  try {
    const { url, cookie } = req.query;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    console.log(`Processing Instagram URL: ${url}`);
    
    // Prepare headers; include cookie if provided
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    };
    if (cookie) {
      headers['Cookie'] = cookie;
    }
    
    // Use instagram-url-direct library to extract media URLs.
    const result = await instagramDirect(url, { headers });
    
    // Assume result has properties: type (video/image), media (array of media URLs), title, and optionally thumbnail.
    const formats = (result.media || []).map((m, index) => ({
      itag: `ig_${index}`,
      quality: 'Standard',
      mimeType: result.type === 'video' ? 'video/mp4' : 'image/jpeg',
      url: m,
      hasAudio: result.type === 'video',
      hasVideo: result.type === 'video',
      container: result.type === 'video' ? 'mp4' : 'jpg',
      contentLength: 0,
    }));
    
    res.json({
      title: result.title || 'Instagram Media',
      thumbnails: result.thumbnail ? [{ url: result.thumbnail, width: 480, height: 480 }] : [],
      formats,
      platform: 'instagram',
      mediaType: result.type,
      directUrl: formats[0] ? `/api/direct?url=${encodeURIComponent(formats[0].url)}` : '',
    });
  } catch (error) {
    console.error('Instagram error:', error);
    res.status(500).json({ error: 'Instagram processing failed', details: error.message });
  }
});

// --------------------
// PINTEREST ENDPOINT (supports images and videos)
// --------------------
app.get('/api/pinterest', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    console.log(`Processing Pinterest URL: ${url}`);
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36';
    const response = await fetch(url, {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    });
    if (!response.ok) throw new Error(`Failed to fetch Pinterest page: ${response.status} ${response.statusText}`);
    const html = await response.text();
    let title = 'Pinterest Media';
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1]) title = titleMatch[1].replace(' | Pinterest', '').trim();
    
    // Attempt to detect Pinterest videos
    let videoUrls = [];
    // Method A: og:video meta tag
    const ogVideoMatch = html.match(/<meta property="og:video" content="([^"]+)"/i);
    if (ogVideoMatch && ogVideoMatch[1]) videoUrls.push(ogVideoMatch[1]);
    // Method B: <video> tags
    const videoTagRegex = /<video[^>]+src="([^"]+)"[^>]*>/g;
    let videoMatch;
    while ((videoMatch = videoTagRegex.exec(html)) !== null) {
      if (videoMatch[1]) videoUrls.push(videoMatch[1]);
    }
    // Method C: Parse JSON for video information (e.g., video_list)
    const videoJsonMatches = html.match(/\{"videos".+?}\}/gs);
    if (videoJsonMatches) {
      videoJsonMatches.forEach(jsonString => {
        try {
          const parsed = JSON.parse(jsonString);
          if (parsed && parsed.videos) {
            Object.values(parsed.videos).forEach(variant => {
              if (variant.url) videoUrls.push(variant.url);
            });
          }
        } catch (err) { /* ignore parse errors */ }
      });
    }
    videoUrls = [...new Set(videoUrls)].filter(v => v.startsWith('http'));
    
    if (videoUrls.length > 0) {
      const videoFormats = videoUrls.map((vUrl, i) => {
        let quality = 'Standard';
        if (vUrl.includes('V_720P')) quality = '720P';
        if (vUrl.includes('V_1080P')) quality = '1080P';
        return {
          itag: `pin_vid_${i}`,
          quality,
          mimeType: 'video/mp4',
          url: vUrl,
          hasAudio: true,
          hasVideo: true,
          contentLength: 0,
          container: 'mp4',
        };
      });
      const directVideoUrl = `/api/direct?url=${encodeURIComponent(videoUrls[0])}`;
      return res.json({
        title,
        thumbnails: [],
        formats: videoFormats,
        platform: 'pinterest',
        mediaType: 'video',
        directUrl: directVideoUrl,
      });
    }
    
    // Fallback: Use yt-dlp via youtube-dl-exec (binary set to yt-dlp)
    try {
      console.log('No direct video found; trying yt-dlp fallback for Pinterest.');
      const info = await youtubeDl(url, {
        dumpSingleJson: true,
        binary: 'yt-dlp',
        noCheckCertificates: true,
        noWarnings: true,
        preferFreeFormats: true,
        addHeader: [
          'referer:' + new URL(url).origin,
          'user-agent:' + userAgent,
        ],
      });
      if (info && info.formats && info.formats.length > 0) {
        const ydFormats = info.formats.map((format, index) => {
          const isVideo = format.vcodec !== 'none';
          const isAudio = format.acodec !== 'none';
          let qualityLabel = format.format_note || 'Unknown';
          if (format.height) {
            qualityLabel = `${format.height}p`;
            if (format.fps) qualityLabel += ` ${format.fps}fps`;
          }
          let mimeType = 'application/octet-stream';
          if (format.ext) {
            mimeType = isVideo ? `video/${format.ext}` : `audio/${format.ext}`;
          }
          return {
            itag: format.format_id || `ydl_${index}`,
            quality: qualityLabel,
            mimeType,
            url: format.url,
            hasAudio: isAudio,
            hasVideo: isVideo,
            contentLength: format.filesize || format.filesize_approx || 0,
            container: format.ext || null,
          };
        });
        return res.json({
          title: info.title || title,
          thumbnails: info.thumbnails ? info.thumbnails.map(t => ({ url: t.url, width: t.width, height: t.height })) : [],
          formats: ydFormats,
          platform: 'pinterest',
          mediaType: 'video',
        });
      }
    } catch (ydError) {
      console.error('yt-dlp fallback error for Pinterest:', ydError);
    }
    
    // If video extraction fails, try images as fallback
    let imageUrls = [];
    const originalImages = html.match(/https:\/\/i\.pinimg\.com\/originals\/[a-zA-Z0-9\/\._-]+\.(?:jpg|jpeg|png|gif)/gi);
    if (originalImages && originalImages.length > 0) imageUrls = [...new Set(originalImages)];
    if (imageUrls.length === 0) {
      const sizedImages = html.match(/https:\/\/i\.pinimg\.com\/[0-9]+x(?:\/[a-zA-Z0-9\/\._-]+\.(?:jpg|jpeg|png|gif))/gi);
      if (sizedImages && sizedImages.length > 0) imageUrls = [...new Set(sizedImages)];
    }
    if (imageUrls.length === 0) {
      const jsonMatch = html.match(/\{"resourceResponses":\[.*?\].*?\}/g);
      if (jsonMatch && jsonMatch.length > 0) {
        try {
          const data = JSON.parse(jsonMatch[0]);
          if (data.resourceResponses && data.resourceResponses.length > 0) {
            const resources = data.resourceResponses[0].response?.data;
            if (resources) {
              if (resources.pin) {
                const pin = resources.pin;
                if (pin.title) title = pin.title;
                if (pin.images && pin.images.orig) imageUrls.push(pin.images.orig.url);
                if (pin.images) {
                  Object.values(pin.images).forEach(img => {
                    if (img && img.url) imageUrls.push(img.url);
                  });
                }
              }
              if (resources.board?.pins) {
                resources.board.pins.forEach(pin => {
                  if (pin.images && pin.images.orig) imageUrls.push(pin.images.orig.url);
                });
              }
            }
          }
        } catch (jsonError) {
          console.error('Error parsing Pinterest JSON data:', jsonError);
        }
      }
    }
    if (imageUrls.length === 0) {
      const schemaMatch = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
      if (schemaMatch && schemaMatch[1]) {
        try {
          const schemaData = JSON.parse(schemaMatch[1]);
          if (schemaData.image) {
            imageUrls = Array.isArray(schemaData.image) ? schemaData.image : [schemaData.image];
          }
          if (schemaData.name) title = schemaData.name;
        } catch (schemaError) {
          console.error('Error parsing Pinterest schema data:', schemaError);
        }
      }
    }
    if (imageUrls.length === 0) {
      const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
      if (ogImageMatch && ogImageMatch[1]) imageUrls.push(ogImageMatch[1]);
    }
    if (imageUrls.length === 0) {
      return res.status(404).json({
        error: 'No media found on this Pinterest page',
        details: 'Make sure this is a valid public pin link.',
      });
    }
    imageUrls = [...new Set(imageUrls)].filter(url => url && url.startsWith('http') && /\.(jpg|jpeg|png|gif|webp)/i.test(url));
    imageUrls.sort((a, b) => {
      if (a.includes('/originals/') && !b.includes('/originals/')) return -1;
      if (!a.includes('/originals/') && b.includes('/originals/')) return 1;
      const sizesA = a.match(/\/([0-9]+)x\//);
      const sizesB = b.match(/\/([0-9]+)x\//);
      if (sizesA && sizesB) return parseInt(sizesB[1]) - parseInt(sizesA[1]);
      return b.length - a.length;
    });
    const formats = imageUrls.map((imgUrl, index) => {
      let quality = 'Standard';
      if (imgUrl.includes('/originals/')) quality = 'Original';
      else {
        const sizeMatch = imgUrl.match(/\/([0-9]+)x\//);
        if (sizeMatch && sizeMatch[1]) quality = `${sizeMatch[1]}px`;
      }
      let formatExt = 'jpg';
      const lowerImgUrl = imgUrl.toLowerCase();
      if (lowerImgUrl.endsWith('.png')) formatExt = 'png';
      else if (lowerImgUrl.endsWith('.gif')) formatExt = 'gif';
      else if (lowerImgUrl.endsWith('.webp')) formatExt = 'webp';
      return {
        itag: `pin_img_${index}`,
        quality,
        mimeType: `image/${formatExt}`,
        url: imgUrl,
        hasAudio: false,
        hasVideo: false,
        contentLength: 0,
        container: formatExt,
      };
    });
    const directDownloadUrl = `/api/direct?url=${encodeURIComponent(imageUrls[0])}`;
    res.json({
      title,
      thumbnails: [{ url: imageUrls[0], width: 480, height: 480 }],
      formats,
      platform: 'pinterest',
      mediaType: 'image',
      directUrl: directDownloadUrl,
    });
  } catch (error) {
    console.error('Pinterest error:', error);
    res.status(500).json({ error: 'Pinterest processing failed', details: error.message });
  }
});

// --------------------
// FACEBOOK ENDPOINT
// --------------------
app.get('/api/facebook', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    console.log(`Processing Facebook URL: ${url}`);
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Safari/605.1.15',
    ];
    function extractVideoUrls(html) {
      const results = [];
      const hdMatch = html.match(/"hd_src":"([^"]+)"/);
      const sdMatch = html.match(/"sd_src":"([^"]+)"/);
      if (hdMatch && hdMatch[1]) results.push({ quality: 'HD', url: hdMatch[1].replace(/\\/g, '') });
      if (sdMatch && sdMatch[1]) results.push({ quality: 'SD', url: sdMatch[1].replace(/\\/g, '') });
      const videoTagMatches = html.match(/<video[^>]*src="([^"]+)"[^>]*>/g);
      if (videoTagMatches) {
        for (const videoTag of videoTagMatches) {
          const srcMatch = videoTag.match(/src="([^"]+)"/);
          if (srcMatch && srcMatch[1]) results.push({ quality: 'Video Tag', url: srcMatch[1] });
        }
      }
      const qualityLabelMatches = html.match(/FBQualityLabel="([^"]+)"[^>]*src="([^"]+)"/g);
      if (qualityLabelMatches) {
        for (const match of qualityLabelMatches) {
          const labelMatch = match.match(/FBQualityLabel="([^"]+)"/);
          const srcMatch = match.match(/src="([^"]+)"/);
          if (labelMatch && labelMatch[1] && srcMatch && srcMatch[1]) {
            results.push({ quality: labelMatch[1], url: srcMatch[1] });
          }
        }
      }
      const ogVideoMatch = html.match(/<meta property="og:video:url" content="([^"]+)"/i);
      if (ogVideoMatch && ogVideoMatch[1]) results.push({ quality: 'og:video', url: ogVideoMatch[1] });
      const ogVideoSecureMatch = html.match(/<meta property="og:video:secure_url" content="([^"]+)"/i);
      if (ogVideoSecureMatch && ogVideoSecureMatch[1]) results.push({ quality: 'og:video:secure', url: ogVideoSecureMatch[1] });
      return results;
    }
    let videoUrls = [];
    let html = '';
    let title = 'Facebook Video';
    let thumbnail = '';
    for (const userAgent of userAgents) {
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': userAgent,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache',
          },
          timeout: 10000,
        });
        if (!response.ok) continue;
        html = await response.text();
        const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
        if (titleMatch && titleMatch[1]) title = titleMatch[1].replace(' | Facebook', '').trim();
        const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
        if (ogImageMatch && ogImageMatch[1]) thumbnail = ogImageMatch[1];
        videoUrls = extractVideoUrls(html);
        if (videoUrls.length > 0) break;
      } catch (agentError) {
        console.error(`Error with user agent ${userAgent}:`, agentError);
        continue;
      }
    }
    if (videoUrls.length === 0) {
      console.log('No videos found via direct extraction; trying yt-dlp fallback for Facebook.');
      try {
        const info = await youtubeDl(url, {
          dumpSingleJson: true,
          binary: 'yt-dlp',
          noCheckCertificates: true,
          noWarnings: true,
          addHeader: [
            'referer:facebook.com',
            'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.82 Safari/537.36',
          ],
        });
        if (info.formats && info.formats.length > 0) {
          info.formats.forEach(format => {
            if (format.url) {
              let quality = format.format_note || (format.height ? `${format.height}p` : 'Unknown');
              videoUrls.push({ quality, url: format.url });
            }
          });
          if (info.title) title = info.title;
          if (info.thumbnail) thumbnail = info.thumbnail;
        }
      } catch (ytdlError) {
        console.error('yt-dlp fallback error for Facebook:', ytdlError);
      }
    }
    if (videoUrls.length === 0) {
      return res.status(404).json({
        error: 'No videos found on this Facebook page',
        details: 'This might be a private video or require login',
      });
    }
    const uniqueUrls = [];
    const seen = new Set();
    for (const video of videoUrls) {
      if (!seen.has(video.url)) {
        seen.add(video.url);
        uniqueUrls.push(video);
      }
    }
    const formats = uniqueUrls.map((video, index) => ({
      itag: `fb_${index}`,
      quality: video.quality,
      mimeType: 'video/mp4',
      url: video.url,
      hasAudio: true,
      hasVideo: true,
      contentLength: 0,
      container: 'mp4',
    }));
    let directUrl = '';
    if (formats.length > 0) {
      const hdFormat = formats.find(f => f.quality === 'HD' || f.quality.includes('720'));
      directUrl = `/api/direct?url=${encodeURIComponent(hdFormat ? hdFormat.url : formats[0].url)}`;
    }
    res.json({
      title,
      thumbnails: thumbnail ? [{ url: thumbnail, width: 480, height: 360 }] : [],
      formats,
      platform: 'facebook',
      mediaType: 'video',
      directUrl,
    });
  } catch (error) {
    console.error('Facebook error:', error);
    res.status(500).json({ error: 'Facebook processing failed', details: error.message });
  }
});

// --------------------
// UNIVERSAL INFO ENDPOINT
// --------------------
app.get('/api/info', async (req, res) => {
  try {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    const platform = detectPlatform(url);
    const mediaType = getMediaType(platform);
    console.log(`Processing ${platform} URL: ${url}`);
    if (platform === 'pinterest') {
      const response = await fetch(`http://localhost:${PORT}/api/pinterest?url=${encodeURIComponent(url)}`);
      const data = await response.json();
      return res.json(data);
    } else if (platform === 'facebook') {
      const response = await fetch(`http://localhost:${PORT}/api/facebook?url=${encodeURIComponent(url)}`);
      const data = await response.json();
      return res.json(data);
    } else if (platform === 'instagram') {
      const response = await fetch(`http://localhost:${PORT}/api/instagram?url=${encodeURIComponent(url)}${req.query.cookie ? '&cookie=' + encodeURIComponent(req.query.cookie) : ''}`);
      const data = await response.json();
      return res.json(data);
    }
    try {
      const info = await youtubeDl(url, {
        dumpSingleJson: true,
        binary: 'yt-dlp',
        noCheckCertificates: true,
        noWarnings: true,
        preferFreeFormats: true,
        addHeader: [
          'referer:' + new URL(url).origin,
          'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.82 Safari/537.36',
        ],
      });
      const formats = info.formats
        .filter(format => format !== null)
        .map(format => {
          const isVideo = format.vcodec !== 'none';
          const isAudio = format.acodec !== 'none';
          let qualityLabel = format.format_note || 'Unknown';
          if (format.height) {
            qualityLabel = `${format.height}p`;
            if (format.fps) qualityLabel += ` ${format.fps}fps`;
          }
          let mimeType = 'unknown';
          if (format.ext) {
            mimeType = isVideo ? `video/${format.ext}` : `audio/${format.ext}`;
          }
          return {
            itag: format.format_id,
            quality: qualityLabel,
            mimeType,
            url: format.url,
            hasAudio: isAudio,
            hasVideo: isVideo,
            contentLength: format.filesize || format.filesize_approx || 0,
            audioBitrate: format.abr || null,
            videoCodec: format.vcodec || null,
            audioCodec: format.acodec || null,
            container: format.ext || null,
          };
        });
      res.json({
        title: info.title || `${platform}_media_${Date.now()}`,
        thumbnails: info.thumbnails ? info.thumbnails.map(t => ({ url: t.url, width: t.width, height: t.height })) : [],
        duration: info.duration,
        formats,
        platform,
        mediaType,
        uploader: info.uploader || info.channel || null,
        uploadDate: info.upload_date || null,
        description: info.description || null,
      });
    } catch (ytdlError) {
      console.error('yt-dlp error:', ytdlError);
      const fallbackThumbnail = `https://via.placeholder.com/480x360.png?text=${encodeURIComponent(platform)}`;
      res.json({
        title: `Media from ${platform}`,
        thumbnails: [{ url: fallbackThumbnail, width: 480, height: 360 }],
        duration: 0,
        formats: [{
          itag: 'best',
          quality: 'Best available',
          mimeType: mediaType === 'audio' ? 'audio/mp3' : 'video/mp4',
          url,
          hasAudio: true,
          hasVideo: mediaType === 'video',
          contentLength: 0,
        }],
        platform,
        mediaType,
        uploader: null,
        uploadDate: null,
        description: null,
      });
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// --------------------
// YOUTUBE INFO ENDPOINT (for compatibility)
// --------------------
app.get('/api/youtube', async (req, res) => {
  try {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    console.log(`Processing YouTube URL: ${url}`);
    const response = await fetch(`http://localhost:${PORT}/api/info?url=${encodeURIComponent(url)}`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// --------------------
// DOWNLOAD ENDPOINT
// --------------------
app.get('/api/download', async (req, res) => {
  try {
    const { url, itag } = req.query;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    console.log(`Processing download - URL: ${url}, format: ${itag || 'best'}`);
    const uniqueId = Date.now();
    const tempFilePath = path.join(TEMP_DIR, `download-${uniqueId}.mp4`);
    const options = {
      output: tempFilePath,
      binary: 'yt-dlp',
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true,
      addHeader: [
        'referer:' + new URL(url).origin,
        'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.82 Safari/537.36',
      ],
    };
    if (itag && itag !== 'best') options.format = itag;
    try {
      await youtubeDl(url, options);
    } catch (ytdlErr) {
      console.error('yt-dlp download error:', ytdlErr);
      if (!fs.existsSync(tempFilePath)) {
        console.log('Attempting direct download as fallback...');
        const downloadResponse = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            Referer: new URL(url).origin,
          },
        });
        if (!downloadResponse.ok) throw new Error(`Direct download failed with status: ${downloadResponse.status}`);
        const fileStream = fs.createWriteStream(tempFilePath);
        await new Promise((resolve, reject) => {
          downloadResponse.body.pipe(fileStream);
          downloadResponse.body.on('error', reject);
          fileStream.on('finish', resolve);
        });
      }
    }
    if (!fs.existsSync(tempFilePath)) throw new Error('Download failed - file not created');
    const stat = fs.statSync(tempFilePath);
    let contentType = 'application/octet-stream';
    if (tempFilePath.endsWith('.mp4')) contentType = 'video/mp4';
    else if (tempFilePath.endsWith('.mp3')) contentType = 'audio/mpeg';
    else if (tempFilePath.endsWith('.webm')) contentType = 'video/webm';
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="download.${path.extname(tempFilePath).substring(1)}"`);
    const fileStream = fs.createReadStream(tempFilePath);
    fileStream.pipe(res);
    fileStream.on('end', () => {
      fs.unlink(tempFilePath, (err) => {
        if (err) console.error('Error deleting temp file:', err);
      });
    });
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Download failed', details: error.message });
  }
});

// --------------------
// AUDIO-ONLY DOWNLOAD ENDPOINT
// --------------------
app.get('/api/audio', async (req, res) => {
  try {
    const { url, itag } = req.query;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    console.log(`Processing audio download - URL: ${url}, format: ${itag || 'best audio'}`);
    const uniqueId = Date.now();
    const tempFilePath = path.join(TEMP_DIR, `audio-${uniqueId}.mp3`);
    const options = {
      output: tempFilePath,
      binary: 'yt-dlp',
      extractAudio: true,
      audioFormat: 'mp3',
      audioQuality: 0,
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true,
      addHeader: [
        'referer:' + new URL(url).origin,
        'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      ],
    };
    if (itag && itag !== 'best') options.format = itag;
    else options.formatSort = 'bestaudio';
    try {
      await youtubeDl(url, options);
    } catch (ytdlErr) {
      console.error('yt-dlp audio download error:', ytdlErr);
      if (!fs.existsSync(tempFilePath)) {
        options.format = 'bestaudio/best';
        await youtubeDl(url, options);
      }
    }
    if (!fs.existsSync(tempFilePath)) throw new Error('Download failed - file not created');
    const stat = fs.statSync(tempFilePath);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', `attachment; filename="audio.mp3"`);
    const fileStream = fs.createReadStream(tempFilePath);
    fileStream.pipe(res);
    fileStream.on('end', () => {
      fs.unlink(tempFilePath, (err) => {
        if (err) console.error('Error deleting temp file:', err);
      });
    });
  } catch (error) {
    console.error('Audio download error:', error);
    res.status(500).json({ error: 'Audio download failed', details: error.message });
  }
});

// --------------------
// DIRECT DOWNLOAD ENDPOINT
// --------------------
app.get('/api/direct', async (req, res) => {
  try {
    const { url, filename } = req.query;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    console.log(`Processing direct download: ${url}`);
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Safari/605.1.15',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
    ];
    const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
    const headers = {
      'User-Agent': randomUserAgent,
      Accept: '*/*',
      'Accept-Language': 'en-US,en;q=0.5',
      Referer: new URL(url).origin,
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    };
    let contentType = 'application/octet-stream';
    let contentLength = 0;
    try {
      const headResponse = await fetch(url, { method: 'HEAD', headers, redirect: 'follow' });
      if (headResponse.ok) {
        contentType = headResponse.headers.get('content-type') || 'application/octet-stream';
        contentLength = headResponse.headers.get('content-length') || 0;
      }
    } catch (headError) {
      console.log('HEAD request failed:', headError.message);
    }
    let outputFilename = filename || 'download';
    if (!outputFilename.includes('.')) {
      if (contentType.includes('video')) outputFilename += '.mp4';
      else if (contentType.includes('audio')) outputFilename += '.mp3';
      else if (contentType.includes('image')) {
        if (contentType.includes('png')) outputFilename += '.png';
        else if (contentType.includes('gif')) outputFilename += '.gif';
        else if (contentType.includes('webp')) outputFilename += '.webp';
        else outputFilename += '.jpg';
      } else if (contentType.includes('pdf')) outputFilename += '.pdf';
      else outputFilename += '.bin';
    }
    try {
      const fetchResponse = await fetch(url, { headers, redirect: 'follow' });
      if (!fetchResponse.ok) throw new Error(`Failed to fetch content: ${fetchResponse.status} ${fetchResponse.statusText}`);
      contentType = fetchResponse.headers.get('content-type') || contentType;
      res.setHeader('Content-Type', contentType);
      if (contentLength > 0) res.setHeader('Content-Length', contentLength);
      res.setHeader('Content-Disposition', `attachment; filename="${outputFilename}"`);
      fetchResponse.body.pipe(res);
    } catch (fetchError) {
      throw new Error(`Failed to download: ${fetchError.message}`);
    }
  } catch (error) {
    console.error('Direct download error:', error);
    res.status(500).json({ error: 'Direct download failed', details: error.message });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Server accessible at http://localhost:${PORT}`);
  console.log(`Temporary directory: ${TEMP_DIR}`);
});
