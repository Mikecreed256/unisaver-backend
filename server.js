// server.js - Complete solution with all platform support
const express = require('express');
const cors = require('cors');
const ytDlp = require('yt-dlp-exec');
const fbDownloader = require('fb-downloader');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

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
  // Music platforms
  if (['spotify', 'soundcloud', 'bandcamp', 'deezer', 'apple-music',
       'amazon-music', 'mixcloud', 'audiomack'].includes(platform)) {
    return 'audio';
  }
  // Video platforms
  else {
    return 'video';
  }
}

// Enhanced Pinterest handler (supports both images and video)
app.get('/api/pinterest', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    console.log(`Processing Pinterest URL: ${url}`);

    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36';
    const response = await fetch(url, {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      }
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch Pinterest page: ${response.status} ${response.statusText}`);
    }
    const html = await response.text();

    let title = 'Pinterest Media';
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].replace(' | Pinterest', '').trim();
    }

    // Attempt to extract image URLs
    let imageUrls = [];
    const originalImages = html.match(/https:\/\/i\.pinimg\.com\/originals\/[a-zA-Z0-9\/\._-]+\.(?:jpg|jpeg|png|gif)/gi);
    if (originalImages && originalImages.length > 0) {
      imageUrls = [...new Set(originalImages)];
    }
    if (imageUrls.length === 0) {
      const sizedImages = html.match(/https:\/\/i\.pinimg\.com\/[0-9]+x(?:\/[a-zA-Z0-9\/\._-]+\.(?:jpg|jpeg|png|gif))/gi);
      if (sizedImages && sizedImages.length > 0) {
        imageUrls = [...new Set(sizedImages)];
      }
    }
    // Also attempt JSON extraction for images
    if (imageUrls.length === 0) {
      const jsonMatch = html.match(/\{"resourceResponses":\[.*?\].*?\}/g);
      if (jsonMatch && jsonMatch.length > 0) {
        try {
          const data = JSON.parse(jsonMatch[0]);
          if (data.resourceResponses && data.resourceResponses.length > 0) {
            const resources = data.resourceResponses[0].response?.data;
            if (resources && resources.pin) {
              const pin = resources.pin;
              if (pin.title) title = pin.title;
              if (pin.images) {
                Object.values(pin.images).forEach(img => {
                  if (img && img.url) {
                    imageUrls.push(img.url);
                  }
                });
              }
            }
          }
        } catch (jsonError) {
          console.error('Error parsing Pinterest JSON data:', jsonError);
        }
      }
    }
    // Also try schema extraction for images/videos
    let videoUrl = null;
    const schemaMatch = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
    if (schemaMatch && schemaMatch[1]) {
      try {
        const schemaData = JSON.parse(schemaMatch[1]);
        if (schemaData.image) {
          if (Array.isArray(schemaData.image)) {
            imageUrls = imageUrls.concat(schemaData.image);
          } else {
            imageUrls.push(schemaData.image);
          }
        }
        if (schemaData.name) {
          title = schemaData.name;
        }
        // Check for video data in schema
        if (schemaData.video) {
          if (typeof schemaData.video === 'string') {
            videoUrl = schemaData.video;
          } else if (typeof schemaData.video === 'object' && schemaData.video.url) {
            videoUrl = schemaData.video.url;
          }
        }
      } catch (schemaError) {
        console.error('Error parsing Pinterest schema data:', schemaError);
      }
    }
    // Method: Look for og:image tag if no images found
    if (imageUrls.length === 0) {
      const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
      if (ogImageMatch && ogImageMatch[1]) {
        imageUrls.push(ogImageMatch[1]);
      }
    }
    // Additional extraction: look for video URL patterns
    const videoRegex = /"video_url"\s*:\s*"([^"]+\.(?:mp4|webm))"/i;
    const videoMatch = html.match(videoRegex);
    if (videoMatch && videoMatch[1]) {
      videoUrl = videoMatch[1].replace(/\\/g, '');
    }

    // If video is available, prioritize it over images
    if (videoUrl) {
      const format = {
        itag: 'pin_video',
        quality: 'Standard',
        mimeType: 'video/mp4',
        url: videoUrl,
        hasAudio: true,
        hasVideo: true,
        contentLength: 0,
        container: 'mp4'
      };
      const directDownloadUrl = `/api/direct?url=${encodeURIComponent(videoUrl)}`;
      return res.json({
        title: title,
        thumbnails: [{ url: imageUrls[0] || videoUrl, width: 480, height: 480 }],
        formats: [format],
        platform: 'pinterest',
        mediaType: 'video',
        directUrl: directDownloadUrl
      });
    }

    // If images exist, build format objects for images
    if (imageUrls.length === 0) {
      return res.status(404).json({
        error: 'No images or videos found on this Pinterest page',
        details: 'Try opening the pin in a browser and copying the media URL directly'
      });
    }
    imageUrls = [...new Set(imageUrls)].filter(url =>
      url && url.startsWith('http') &&
      /\.(jpg|jpeg|png|gif|webp)/i.test(url)
    );
    imageUrls.sort((a, b) => {
      if (a.includes('/originals/') && !b.includes('/originals/')) return -1;
      if (!a.includes('/originals/') && b.includes('/originals/')) return 1;
      const sizesA = a.match(/\/([0-9]+)x\//);
      const sizesB = b.match(/\/([0-9]+)x\//);
      if (sizesA && sizesB) {
        return parseInt(sizesB[1]) - parseInt(sizesA[1]);
      }
      return b.length - a.length;
    });
    const formats = imageUrls.map((url, index) => {
      let quality = url.includes('/originals/') ? 'Original' : 'Standard';
      const sizeMatch = url.match(/\/([0-9]+)x\//);
      if (sizeMatch && sizeMatch[1]) {
        quality = `${sizeMatch[1]}px`;
      }
      let format = 'jpg';
      if (url.toLowerCase().endsWith('.png')) format = 'png';
      else if (url.toLowerCase().endsWith('.gif')) format = 'gif';
      else if (url.toLowerCase().endsWith('.webp')) format = 'webp';
      return {
        itag: `pin_${index}`,
        quality: quality,
        mimeType: `image/${format}`,
        url: url,
        hasAudio: false,
        hasVideo: false,
        contentLength: 0,
        container: format
      };
    });
    const directDownloadUrl = `/api/direct?url=${encodeURIComponent(imageUrls[0])}`;
    res.json({
      title: title,
      thumbnails: [{ url: imageUrls[0], width: 480, height: 480 }],
      formats: formats,
      platform: 'pinterest',
      mediaType: 'image',
      directUrl: directDownloadUrl
    });

  } catch (error) {
    console.error('Pinterest error:', error);
    res.status(500).json({ error: 'Pinterest processing failed', details: error.message });
  }
});

// Facebook endpoint with fb-downloader and fallback to yt-dlp
app.get('/api/facebook', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    console.log(`Processing Facebook URL: ${url}`);
    let formats = [];
    let title = 'Facebook Video';
    let thumbnail = '';

    // Try fb-downloader first
    try {
      const fbData = await fbDownloader(url);
      if (fbData && (fbData.hd || fbData.sd)) {
        if (fbData.hd) {
          formats.push({
            itag: 'fb_hd',
            quality: 'HD',
            mimeType: 'video/mp4',
            url: fbData.hd,
            hasAudio: true,
            hasVideo: true,
            contentLength: 0,
            container: 'mp4'
          });
        }
        if (fbData.sd) {
          formats.push({
            itag: 'fb_sd',
            quality: 'SD',
            mimeType: 'video/mp4',
            url: fbData.sd,
            hasAudio: true,
            hasVideo: true,
            contentLength: 0,
            container: 'mp4'
          });
        }
        title = fbData.title || title;
        thumbnail = fbData.thumbnail || thumbnail;
      }
    } catch (fbError) {
      console.error('fb-downloader error:', fbError);
    }

    // Fallback: use yt-dlp if fb-downloader did not return results
    if (formats.length === 0) {
      try {
        const info = await ytDlp(url, {
          dumpSingleJson: true,
          noCheckCertificates: true,
          noWarnings: true,
          addHeader: ['referer:facebook.com', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64)']
        });
        if (info.formats && info.formats.length > 0) {
          info.formats.forEach(format => {
            if (format.url) {
              let quality = format.format_note || (format.height ? `${format.height}p` : 'Unknown');
              formats.push({
                itag: `fb_${format.format_id}`,
                quality: quality,
                mimeType: 'video/mp4',
                url: format.url,
                hasAudio: true,
                hasVideo: true,
                contentLength: 0,
                container: 'mp4'
              });
            }
          });
          if (info.title) title = info.title;
          if (info.thumbnail) thumbnail = info.thumbnail;
        }
      } catch (fallbackError) {
        console.error('yt-dlp fallback error:', fallbackError);
      }
    }
    if (formats.length === 0) {
      return res.status(404).json({
        error: 'No videos found on this Facebook page',
        details: 'This might be a private video or require login'
      });
    }
    const directUrl = `/api/direct?url=${encodeURIComponent(formats[0].url)}`;
    res.json({
      title: title,
      thumbnails: thumbnail ? [{ url: thumbnail, width: 480, height: 360 }] : [],
      formats: formats,
      platform: 'facebook',
      mediaType: 'video',
      directUrl: directUrl
    });
  } catch (error) {
    console.error('Facebook error:', error);
    res.status(500).json({ error: 'Facebook processing failed', details: error.message });
  }
});

// Universal info endpoint - automatically detects platform
app.get('/api/info', async (req, res) => {
  try {
    const url = req.query.url;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
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
    }
    try {
      const info = await ytDlp(url, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        preferFreeFormats: true,
        addHeader: ['referer:' + new URL(url).origin, 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64)']
      });
      const formats = (info.formats || [])
        .filter(format => format)
        .map(format => {
          const isVideo = format.vcodec !== 'none';
          const isAudio = format.acodec !== 'none';
          let qualityLabel = format.format_note || format.quality || 'Unknown';
          if (format.height) {
            qualityLabel = `${format.height}p` + (format.fps ? ` ${format.fps}fps` : '');
          }
          let mimeType = 'unknown';
          if (format.ext) {
            mimeType = isVideo ? `video/${format.ext}` : (isAudio ? `audio/${format.ext}` : 'unknown');
          }
          return {
            itag: format.format_id,
            quality: qualityLabel,
            mimeType: mimeType,
            url: format.url,
            hasAudio: isAudio,
            hasVideo: isVideo,
            contentLength: format.filesize || format.filesize_approx || 0,
            audioBitrate: format.abr || null,
            videoCodec: format.vcodec || null,
            audioCodec: format.acodec || null,
            container: format.ext || null
          };
        });
      res.json({
        title: info.title || `${platform}_media_${Date.now()}`,
        thumbnails: info.thumbnails ? info.thumbnails.map(t => ({ url: t.url, width: t.width, height: t.height })) : [],
        duration: info.duration,
        formats: formats,
        platform: platform,
        mediaType: mediaType,
        uploader: info.uploader || info.channel || null,
        uploadDate: info.upload_date || null,
        description: info.description || null
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
          url: url,
          hasAudio: true,
          hasVideo: mediaType === 'video',
          contentLength: 0
        }],
        platform: platform,
        mediaType: mediaType,
        uploader: null,
        uploadDate: null,
        description: null
      });
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// YouTube info endpoint (for compatibility)
app.get('/api/youtube', async (req, res) => {
  try {
    const url = req.query.url;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    console.log(`Processing YouTube URL: ${url}`);
    const response = await fetch(`http://localhost:${PORT}/api/info?url=${encodeURIComponent(url)}`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Download endpoint
app.get('/api/download', async (req, res) => {
  try {
    const { url, itag } = req.query;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    console.log(`Processing download - URL: ${url}, format: ${itag || 'best'}`);
    const uniqueId = Date.now();
    const tempFilePath = path.join(TEMP_DIR, `download-${uniqueId}.mp4`);
    const options = {
      output: tempFilePath,
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true,
      addHeader: ['referer:' + new URL(url).origin, 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64)']
    };
    if (itag && itag !== 'best') {
      options.format = itag;
    }
    try {
      await ytDlp(url, options);
    } catch (dlErr) {
      console.error('yt-dlp download error:', dlErr);
      if (!fs.existsSync(tempFilePath)) {
        console.log('Attempting direct download as fallback...');
        const downloadResponse = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Referer': new URL(url).origin
          }
        });
        if (!downloadResponse.ok) {
          throw new Error(`Direct download failed with status: ${downloadResponse.status}`);
        }
        const fileStream = fs.createWriteStream(tempFilePath);
        await new Promise((resolve, reject) => {
          downloadResponse.body.pipe(fileStream);
          downloadResponse.body.on('error', reject);
          fileStream.on('finish', resolve);
        });
      }
    }
    if (!fs.existsSync(tempFilePath)) {
      throw new Error('Download failed - file not created');
    }
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

// Audio-only download endpoint
app.get('/api/audio', async (req, res) => {
  try {
    const { url, itag } = req.query;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    console.log(`Processing audio download - URL: ${url}, format: ${itag || 'best audio'}`);
    const uniqueId = Date.now();
    const tempFilePath = path.join(TEMP_DIR, `audio-${uniqueId}.mp3`);
    const options = {
      output: tempFilePath,
      extractAudio: true,
      audioFormat: 'mp3',
      audioQuality: 0,
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true,
      addHeader: ['referer:' + new URL(url).origin, 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64)']
    };
    if (itag && itag !== 'best') {
      options.format = itag;
    } else {
      options.formatSort = 'bestaudio';
    }
    try {
      await ytDlp(url, options);
    } catch (audioErr) {
      console.error('yt-dlp audio download error:', audioErr);
      if (!fs.existsSync(tempFilePath)) {
        options.format = 'bestaudio/best';
        await ytDlp(url, options);
      }
    }
    if (!fs.existsSync(tempFilePath)) {
      throw new Error('Download failed - file not created');
    }
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

// Direct download endpoint for handling URLs directly
app.get('/api/direct', async (req, res) => {
  try {
    const { url, filename } = req.query;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    console.log(`Processing direct download: ${url}`);
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Safari/605.1.15',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36'
    ];
    const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
    const headers = {
      'User-Agent': randomUserAgent,
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.5',
      'Referer': new URL(url).origin,
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
    };
    let contentType = 'application/octet-stream';
    let contentLength = 0;
    try {
      const headResponse = await fetch(url, {
        method: 'HEAD',
        headers,
        redirect: 'follow'
      });
      if (headResponse.ok) {
        contentType = headResponse.headers.get('content-type') || 'application/octet-stream';
        contentLength = headResponse.headers.get('content-length') || 0;
      }
    } catch (headError) {
      console.log('HEAD request failed, continuing anyway:', headError.message);
    }
    let outputFilename = filename || 'download';
    if (!outputFilename.includes('.')) {
      if (contentType.includes('video')) {
        outputFilename += '.mp4';
      } else if (contentType.includes('audio')) {
        outputFilename += '.mp3';
      } else if (contentType.includes('image')) {
        if (contentType.includes('png')) {
          outputFilename += '.png';
        } else if (contentType.includes('gif')) {
          outputFilename += '.gif';
        } else if (contentType.includes('webp')) {
          outputFilename += '.webp';
        } else {
          outputFilename += '.jpg';
        }
      } else if (contentType.includes('pdf')) {
        outputFilename += '.pdf';
      } else {
        outputFilename += '.bin';
      }
    }
    try {
      const response = await fetch(url, {
        headers,
        redirect: 'follow'
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch content: ${response.status} ${response.statusText}`);
      }
      contentType = response.headers.get('content-type') || contentType;
      res.setHeader('Content-Type', contentType);
      if (contentLength > 0) {
        res.setHeader('Content-Length', contentLength);
      }
      res.setHeader('Content-Disposition', `attachment; filename="${outputFilename}"`);
      response.body.pipe(res);
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
