// server.js - Simplified version for Render deployment
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const fsExtra = require('fs-extra');
const path = require('path');
const http = require('http');
const https = require('https');
const axios = require('axios');
const { exec } = require('child_process');
const randomUseragent = require('random-useragent');

// Optional dependencies - try to require but provide fallbacks if not available
let HttpsProxyAgent, HttpProxyAgent, ytdl, youtubeDl;

try {
  HttpsProxyAgent = require('https-proxy-agent').HttpsProxyAgent;
} catch (e) {
  console.warn('https-proxy-agent not available');
  HttpsProxyAgent = class DummyAgent {
    constructor() {}
  };
}

try {
  HttpProxyAgent = require('http-proxy-agent').HttpProxyAgent;
} catch (e) {
  console.warn('http-proxy-agent not available');
  HttpProxyAgent = class DummyAgent {
    constructor() {}
  };
}

try {
  ytdl = require('ytdl-core');
} catch (e) {
  console.warn('ytdl-core not available, YouTube downloads may be limited');
  ytdl = {
    getInfo: () => Promise.reject(new Error('ytdl-core not available')),
    downloadFromInfo: () => { throw new Error('ytdl-core not available'); }
  };
}

try {
  youtubeDl = require('youtube-dl-exec');
} catch (e) {
  console.warn('youtube-dl-exec not available, some downloads may be limited');
  youtubeDl = () => Promise.reject(new Error('youtube-dl-exec not available'));
}

const app = express();
const PORT = process.env.PORT || 5000;

// Create necessary directories
const TEMP_DIR = path.join(__dirname, 'temp');
const CACHE_DIR = path.join(__dirname, 'cache');
fsExtra.ensureDirSync(TEMP_DIR);
fsExtra.ensureDirSync(CACHE_DIR);

// Clean the temp directory on startup
fsExtra.emptyDirSync(TEMP_DIR);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Increase timeouts
app.use((req, res, next) => {
  res.setTimeout(300000); // 5 minutes
  next();
});
http.globalAgent.maxSockets = 25;
https.globalAgent.maxSockets = 25;
http.globalAgent.keepAlive = true;
https.globalAgent.keepAlive = true;

// Free proxy list - update these as needed
const PROXY_LIST = [
  // Add your proxies here if needed
  // "http://username:password@ip:port"
];

// Function to get a random proxy
function getRandomProxy() {
  if (PROXY_LIST.length === 0) return null;
  return PROXY_LIST[Math.floor(Math.random() * PROXY_LIST.length)];
}

// Get random headers to avoid blocking
function getRandomHeaders(url) {
  const userAgent = randomUseragent.getRandom();
  const referer = new URL(url).origin;
  
  return {
    'User-Agent': userAgent,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Referer': referer,
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'cross-site',
    'Upgrade-Insecure-Requests': '1',
    'Connection': 'keep-alive',
  };
}

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
  } else if (lowerUrl.includes('dailymotion.com') || lowerUrl.includes('dai.ly')) {
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
  } else if (lowerUrl.includes('youtube-nocookie.com')) {
    return 'youtube'; // Handle privacy-enhanced YT embeds
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

// Helper function to fetch with retries and proxy rotation
async function fetchWithRetry(url, options = {}, retries = 3) {
  let lastError;
  
  for (let i = 0; i < retries; i++) {
    try {
      // Try a different proxy on each retry
      const proxy = getRandomProxy();
      const fetchOptions = { ...options };
      
      if (proxy && HttpsProxyAgent && HttpProxyAgent) {
        const isHttps = url.startsWith('https');
        fetchOptions.agent = isHttps 
          ? new HttpsProxyAgent(proxy) 
          : new HttpProxyAgent(proxy);
      }
      
      // Add random headers if not specified
      if (!fetchOptions.headers) {
        fetchOptions.headers = getRandomHeaders(url);
      }
      
      const response = await axios(url, fetchOptions);
      return response;
    } catch (error) {
      console.log(`Fetch attempt ${i + 1} failed for ${url}:`, error.message);
      lastError = error;
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  throw lastError;
}

// Routes
app.get('/', (req, res) => {
  res.send('Download API is running');
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    tempDir: TEMP_DIR,
    cacheDir: CACHE_DIR,
    platform: process.platform,
    nodeVersion: process.version
  });
});

// YouTube download handler with fallbacks
async function handleYouTube(url, res) {
  try {
    console.log('Processing YouTube URL:', url);
    
    // Try with ytdl-core first if available
    if (typeof ytdl.getInfo === 'function') {
      try {
        const info = await ytdl.getInfo(url);
        
        // Format the response
        const formats = info.formats.map(format => {
          const isVideo = format.hasVideo;
          const isAudio = format.hasAudio;
          
          return {
            itag: format.itag.toString(),
            quality: format.qualityLabel || format.audioQuality || 'Unknown',
            mimeType: format.mimeType || 'unknown',
            url: format.url,
            hasAudio: isAudio,
            hasVideo: isVideo,
            contentLength: parseInt(format.contentLength || '0'),
            container: format.container || 'mp4'
          };
        });
        
        return res.json({
          title: info.videoDetails.title,
          thumbnails: info.videoDetails.thumbnails.map(t => ({ 
            url: t.url, 
            width: t.width, 
            height: t.height 
          })),
          duration: parseInt(info.videoDetails.lengthSeconds),
          formats: formats,
          platform: 'youtube',
          mediaType: 'video',
          uploader: info.videoDetails.author.name,
          uploadDate: null,
          description: info.videoDetails.description
        });
      } catch (ytdlError) {
        console.log('ytdl-core failed:', ytdlError.message);
      }
    }
    
    // If ytdl-core fails or isn't available, try youtube-dl-exec
    if (typeof youtubeDl === 'function') {
      try {
        const info = await youtubeDl(url, {
          dumpSingleJson: true,
          noCheckCertificates: true,
          noWarnings: true,
          preferFreeFormats: true,
          youtubeSkipDashManifest: true,
          addHeader: ['referer:youtube.com', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.82 Safari/537.36']
        });
        
        // Transform formats
        const ytdlFormats = info.formats.map(format => {
          const isVideo = format.vcodec !== 'none';
          const isAudio = format.acodec !== 'none';
          
          let qualityLabel = format.format_note || 'Unknown';
          if (format.height) {
            qualityLabel = `${format.height}p`;
            if (format.fps) qualityLabel += ` ${format.fps}fps`;
          }
          
          return {
            itag: format.format_id,
            quality: qualityLabel,
            mimeType: `video/${format.ext || 'mp4'}`,
            url: format.url,
            hasAudio: isAudio,
            hasVideo: isVideo,
            contentLength: format.filesize || 0,
            container: format.ext || 'mp4'
          };
        });
        
        return res.json({
          title: info.title,
          thumbnails: info.thumbnails ? info.thumbnails.map(t => ({ 
            url: t.url, 
            width: t.width || 480, 
            height: t.height || 360 
          })) : [],
          duration: info.duration,
          formats: ytdlFormats,
          platform: 'youtube',
          mediaType: 'video',
          uploader: info.uploader,
          uploadDate: info.upload_date,
          description: info.description
        });
      } catch (ytdlExecError) {
        console.log('youtube-dl-exec failed:', ytdlExecError.message);
      }
    }
    
    // If both methods fail, try a simpler direct approach by fetching the page
    try {
      const response = await axios.get(url, {
        headers: getRandomHeaders(url)
      });
      
      const html = response.data;
      
      // Try to extract metadata
      let title = 'YouTube Video';
      const titleMatch = html.match(/<title>(.*?)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        title = titleMatch[1].replace(' - YouTube', '').trim();
      }
      
      // Extract thumbnail
      let thumbnail = '';
      const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
      if (ogImageMatch && ogImageMatch[1]) {
        thumbnail = ogImageMatch[1];
      }
      
      return res.json({
        title: title,
        thumbnails: thumbnail ? [{ url: thumbnail, width: 480, height: 360 }] : [],
        message: "Direct video download links couldn't be extracted. YouTube downloads might be restricted on this server.",
        formats: [{
          itag: 'info_only',
          quality: 'Info Only',
          mimeType: 'video/mp4',
          url: url,
          hasAudio: true,
          hasVideo: true,
          contentLength: 0,
          container: 'mp4'
        }],
        platform: 'youtube',
        mediaType: 'video',
        error: 'YouTube extraction methods failed'
      });
    } catch (error) {
      console.error('All YouTube methods failed:', error);
    }
    
    return res.status(500).json({ 
      error: 'YouTube processing failed', 
      details: 'All extraction methods failed. YouTube downloads might be restricted on this server.',
      message: 'Try accessing the content directly on YouTube.'
    });
  } catch (error) {
    console.error('YouTube error:', error);
    return res.status(500).json({ 
      error: 'YouTube processing failed', 
      details: error.message
    });
  }
}

// Generic direct URL handler for all platforms
async function handleGenericMedia(url, platform, res) {
  try {
    console.log(`Processing ${platform} URL:`, url);
    
    // Try youtube-dl if available
    if (typeof youtubeDl === 'function') {
      try {
        const info = await youtubeDl(url, {
          dumpSingleJson: true,
          noCheckCertificates: true,
          noWarnings: true,
          preferFreeFormats: true,
          addHeader: ['referer:' + new URL(url).origin, 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.82 Safari/537.36']
        });
        
        // Transform formats
        const formats = info.formats
          .filter(format => format !== null)
          .map(format => {
            const isVideo = format.vcodec !== 'none';
            const isAudio = format.acodec !== 'none';
            
            let qualityLabel = format.format_note || format.quality || 'Unknown';
            if (format.height) {
              qualityLabel = `${format.height}p`;
              if (format.fps) qualityLabel += ` ${format.fps}fps`;
            }
            
            let mimeType = 'unknown';
            if (format.ext) {
              if (isVideo) {
                mimeType = `video/${format.ext}`;
              } else if (isAudio) {
                mimeType = `audio/${format.ext}`;
              }
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
        
        return res.json({
          title: info.title || `${platform}_media_${Date.now()}`,
          thumbnails: info.thumbnails ? info.thumbnails.map(t => ({ 
            url: t.url, 
            width: t.width, 
            height: t.height 
          })) : [],
          duration: info.duration,
          formats: formats,
          platform: platform,
          mediaType: getMediaType(platform),
          uploader: info.uploader || info.channel || null,
          uploadDate: info.upload_date || null,
          description: info.description || null
        });
      } catch (error) {
        console.log(`youtube-dl failed for ${platform}:`, error.message);
      }
    }
    
    // If youtube-dl fails, try direct page extraction
    try {
      const response = await axios.get(url, {
        headers: getRandomHeaders(url)
      });
      
      const html = response.data;
      
      // Try to extract metadata
      let title = `${platform.charAt(0).toUpperCase() + platform.slice(1)} Media`;
      const titleMatch = html.match(/<title>(.*?)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        title = titleMatch[1].trim();
      }
      
      // Extract thumbnail
      let thumbnail = '';
      const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
      if (ogImageMatch && ogImageMatch[1]) {
        thumbnail = ogImageMatch[1];
      }
      
      // Look for media URLs
      let mediaUrls = [];
      const mediaType = getMediaType(platform);
      
      if (mediaType === 'video') {
        // Look for video URLs
        const videoPatterns = [
          /<meta property="og:video" content="([^"]+)"/i,
          /<meta property="og:video:url" content="([^"]+)"/i,
          /<meta property="og:video:secure_url" content="([^"]+)"/i,
          /<video[^>]*src="([^"]+)"[^>]*>/gi,
          /source src="([^"]+)"/gi
        ];
        
        for (const pattern of videoPatterns) {
          const matches = html.match(pattern);
          if (matches) {
            for (const match of matches) {
              const urlMatch = match.match(/src="([^"]+)"|content="([^"]+)"/i);
              if (urlMatch) {
                const videoUrl = urlMatch[1] || urlMatch[2];
                if (videoUrl && !mediaUrls.includes(videoUrl)) {
                  mediaUrls.push(videoUrl);
                }
              }
            }
          }
        }
      } else if (mediaType === 'audio') {
        // Look for audio URLs
        const audioPatterns = [
          /<meta property="og:audio" content="([^"]+)"/i,
          /<meta property="og:audio:url" content="([^"]+)"/i,
          /<meta property="og:audio:secure_url" content="([^"]+)"/i,
          /<audio[^>]*src="([^"]+)"[^>]*>/gi,
          /source src="([^"]+)"/gi
        ];
        
        for (const pattern of audioPatterns) {
          const matches = html.match(pattern);
          if (matches) {
            for (const match of matches) {
              const urlMatch = match.match(/src="([^"]+)"|content="([^"]+)"/i);
              if (urlMatch) {
                const audioUrl = urlMatch[1] || urlMatch[2];
                if (audioUrl && !mediaUrls.includes(audioUrl)) {
                  mediaUrls.push(audioUrl);
                }
              }
            }
          }
        }
      }
      
      // Create formats
      const formats = [];
      
      if (mediaUrls.length > 0) {
        mediaUrls.forEach((mediaUrl, index) => {
          formats.push({
            itag: `${platform}_${index}`,
            quality: 'Standard',
            mimeType: mediaType === 'video' ? 'video/mp4' : 'audio/mp3',
            url: mediaUrl,
            hasAudio: true,
            hasVideo: mediaType === 'video',
            contentLength: 0,
            container: mediaType === 'video' ? 'mp4' : 'mp3'
          });
        });
      } else {
        // If no media found, at least provide info
        formats.push({
          itag: 'direct',
          quality: 'Unknown',
          mimeType: mediaType === 'video' ? 'video/mp4' : 'audio/mp3',
          url: url,
          hasAudio: true,
          hasVideo: mediaType === 'video',
          contentLength: 0,
          container: mediaType === 'video' ? 'mp4' : 'mp3'
        });
      }
      
      return res.json({
        title: title,
        thumbnails: thumbnail ? [{ url: thumbnail, width: 480, height: 360 }] : [],
        formats: formats,
        platform: platform,
        mediaType: mediaType,
        message: mediaUrls.length === 0 ? "Direct media URLs couldn't be extracted. Try using the direct URL." : null,
        directUrl: formats[0].url !== url ? `/api/direct?url=${encodeURIComponent(formats[0].url)}` : null
      });
    } catch (error) {
      console.error('Direct extraction failed:', error);
    }
    
    // Fallback with minimal info if all else fails
    const fallbackThumbnail = `https://via.placeholder.com/480x360.png?text=${encodeURIComponent(platform)}`;
    
    return res.json({
      title: `Media from ${platform}`,
      thumbnails: [{ url: fallbackThumbnail, width: 480, height: 360 }],
      duration: 0,
      formats: [{
        itag: 'best',
        quality: 'Best available',
        mimeType: getMediaType(platform) === 'audio' ? 'audio/mp3' : 'video/mp4',
        url: url,
        hasAudio: true,
        hasVideo: getMediaType(platform) === 'video',
        contentLength: 0
      }],
      platform: platform,
      mediaType: getMediaType(platform),
      uploader: null,
      uploadDate: null,
      description: null,
      message: "This platform requires direct access. Try opening in the original app."
    });
  } catch (error) {
    console.error(`${platform} processing error:`, error);
    return res.status(500).json({ 
      error: `${platform} processing failed`, 
      details: error.message 
    });
  }
}

// Universal info endpoint - detect platform and route accordingly
app.get('/api/info', async (req, res) => {
  try {
    const url = req.query.url;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    
    const platform = detectPlatform(url);
    console.log(`Detected platform: ${platform} for URL: ${url}`);
    
    // Handle YouTube specially
    if (platform === 'youtube') {
      return await handleYouTube(url, res);
    }
    
    // Handle all other platforms with the generic handler
    return await handleGenericMedia(url, platform, res);
  } catch (error) {
    console.error('Error in /api/info:', error);
    return res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Platform-specific endpoints for backward compatibility
app.get('/api/youtube', async (req, res) => {
  try {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    return await handleYouTube(url, res);
  } catch (error) {
    console.error('Error in /api/youtube:', error);
    return res.status(500).json({ error: 'YouTube processing failed', details: error.message });
  }
});

// Direct download endpoint
app.get('/api/direct', async (req, res) => {
  try {
    const { url, filename } = req.query;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    
    console.log(`Processing direct download: ${url}`);
    
    // Prepare headers
    const headers = getRandomHeaders(url);
    
    // Try to determine content type with HEAD request
    let contentType = 'application/octet-stream';
    let contentLength = 0;
    
    try {
      const headResponse = await axios.head(url, {
        headers,
        maxRedirects: 5,
        validateStatus: status => status < 400
      });
      
      if (headResponse.headers['content-type']) {
        contentType = headResponse.headers['content-type'];
      }
      
      if (headResponse.headers['content-length']) {
        contentLength = parseInt(headResponse.headers['content-length']);
      }
    } catch (headError) {
      console.log('HEAD request failed, continuing anyway:', headError.message);
    }
    
    // Determine filename if not provided
    let outputFilename = filename || 'download';
    
    // Add extension based on content type if not present
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
      // If the content is a reasonable size, we'll stream through the server
      if (contentLength < 100 * 1024 * 1024 || contentLength === 0) { // Less than 100MB or unknown size
        const response = await axios({
          method: 'get',
          url: url,
          responseType: 'stream',
          headers: headers,
          maxRedirects: 5
        });
        
        // Update content type if it's available from the actual response
        if (response.headers['content-type']) {
          contentType = response.headers['content-type'];
        }
        
        // Set response headers
        res.setHeader('Content-Type', contentType);
        if (response.headers['content-length']) {
          res.setHeader('Content-Length', response.headers['content-length']);
        }
        res.setHeader('Content-Disposition', `attachment; filename="${outputFilename}"`);
        
        // Pipe the response to the client
        response.data.pipe(res);
      } else {
        // For very large files, redirect the client directly to the source URL
        console.log(`Large file detected (${contentLength} bytes), redirecting client directly to source`);
        res.redirect(url);
      }
    } catch (fetchError) {
      throw new Error(`Failed to download: ${fetchError.message}`);
    }
  } catch (error) {
    console.error('Direct download error:', error);
    return res.status(500).json({ 
      error: 'Direct download failed', 
      details: error.message 
    });
  }
});

// Audio-only download endpoint (simplified version)
app.get('/api/audio', async (req, res) => {
  try {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    
    console.log(`Processing audio-only request for: ${url}`);
    
    // For audio-only, we'll use the direct API but set audio format in the response
    return res.redirect(`/api/direct?url=${encodeURIComponent(url)}&filename=audio.mp3`);
  } catch (error) {
    console.error('Audio download error:', error);
    return res.status(500).json({ 
      error: 'Audio download failed', 
      details: error.message 
    });
  }
});

// Download endpoint (simplified version that uses direct endpoint)
app.get('/api/download', async (req, res) => {
  try {
    const { url, itag } = req.query;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    
    console.log(`Processing download request for: ${url}, format: ${itag || 'best'}`);
    
    // For simplified version, we'll redirect to the direct API
    return res.redirect(`/api/direct?url=${encodeURIComponent(url)}`);
  } catch (error) {
    console.error('Download error:', error);
    return res.status(500).json({ 
      error: 'Download failed', 
      details: error.message 
    });
  }
});

// Platform specific endpoints for backward compatibility
['facebook', 'instagram', 'tiktok', 'twitter', 'threads', 'pinterest', 
 'spotify', 'soundcloud', 'vimeo', 'dailymotion', 'twitch'].forEach(platform => {
  app.get(`/api/${platform}`, async (req, res) => {
    try {
      const url = req.query.url;
      if (!url) return res.status(400).json({ error: 'URL is required' });
      return await handleGenericMedia(url, platform, res);
    } catch (error) {
      console.error(`Error in /api/${platform}:`, error);
      return res.status(500).json({ error: `${platform} processing failed`, details: error.message });
    }
  });
});

// Cleanup task for temp directory
setInterval(() => {
  try {
    const cutoffTime = Date.now() - (60 * 60 * 1000); // 1 hour ago
    
    fs.readdir(TEMP_DIR, (err, files) => {
      if (err) {
        console.error('Error reading temp directory:', err);
        return;
      }
      
      files.forEach(file => {
        const filePath = path.join(TEMP_DIR, file);
        fs.stat(filePath, (statErr, stats) => {
          if (statErr) {
            console.error(`Error getting stats for ${filePath}:`, statErr);
            return;
          }
          
          // Delete files older than cutoff time
          if (stats.mtimeMs < cutoffTime) {
            fs.unlink(filePath, (unlinkErr) => {
              if (unlinkErr) {
                console.error(`Error deleting old temp file ${filePath}:`, unlinkErr);
              } else {
                console.log(`Deleted old temp file: ${filePath}`);
              }
            });
          }
        });
      });
    });
  } catch (error) {
    console.error('Error in cleanup task:', error);
  }
}, 30 * 60 * 1000); // Run every 30 minutes

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Server accessible at http://localhost:${PORT}`);
  console.log(`Temporary directory: ${TEMP_DIR}`);
  console.log(`Cache directory: ${CACHE_DIR}`);
  
  // Check for required external tools
  try {
    exec('ffmpeg -version', (error) => {
      if (error) {
        console.warn('Warning: ffmpeg is not installed. Some audio conversions may not work.');
      } else {
        console.log('ffmpeg is available for media conversions.');
      }
    });
  } catch (error) {
    console.warn('Warning: ffmpeg check failed.');
  }
});
