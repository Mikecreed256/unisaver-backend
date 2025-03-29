// server.js - Enhanced version for Render deployment
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const fsExtra = require('fs-extra');
const path = require('path');
const http = require('http');
const https = require('https');
const axios = require('axios');
const cheerio = require('cheerio');
const { exec } = require('child_process');
const randomUseragent = require('random-useragent');
const HttpsProxyAgent = require('https-proxy-agent');
const HttpProxyAgent = require('http-proxy-agent');

// Import specialized libraries
const ytdl = require('ytdl-core');
const youtubeDl = require('youtube-dl-exec');
const instagramUrlDirect = require('instagram-url-direct');
const tiktokScraper = require('tiktok-scraper-without-watermark');
const videoUrlLink = require('video-url-link');
let playDl;

// Dynamic import for ESM modules
(async () => {
  try {
    playDl = await import('play-dl');
    console.log('play-dl loaded successfully');
  } catch (err) {
    console.error('Failed to load play-dl:', err.message);
  }
})();

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
// These proxies help bypass restrictions on some platforms
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
      
      if (proxy) {
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

// YouTube download using ytdl-core (more reliable on Render)
async function handleYouTube(url, res) {
  try {
    console.log('Handling YouTube URL with ytdl-core:', url);
    
    // First try with ytdl-core
    try {
      const info = await ytdl.getInfo(url);
      
      // Format the response in our standard format
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
      console.log('ytdl-core failed, trying play-dl:', ytdlError.message);
      
      // If ytdl-core fails, try play-dl
      if (playDl) {
        const info = await playDl.video_info(url);
        const formats = await playDl.stream_from_info(info);
        
        const formattedFormats = Object.values(formats.format).map((format, index) => {
          return {
            itag: `play_${index}`,
            quality: format.qualityLabel || 'Unknown',
            mimeType: format.mimeType || 'video/mp4',
            url: format.url,
            hasAudio: format.hasAudio,
            hasVideo: format.hasVideo,
            contentLength: parseInt(format.contentLength || '0'),
            container: 'mp4'
          };
        });
        
        return res.json({
          title: info.video_details.title,
          thumbnails: [{ 
            url: info.video_details.thumbnails[0].url, 
            width: 480, 
            height: 360 
          }],
          duration: info.video_details.durationInSec,
          formats: formattedFormats,
          platform: 'youtube',
          mediaType: 'video',
          uploader: info.video_details.channel.name,
          uploadDate: null,
          description: info.video_details.description
        });
      }
      
      // If both fail, try youtube-dl-exec as last resort
      console.log('Trying youtube-dl-exec as last resort');
      const info = await youtubeDl(url, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        preferFreeFormats: true,
        youtubeSkipDashManifest: true,
        addHeader: ['referer:youtube.com', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.82 Safari/537.36']
      });

      // Transform formats to match our API structure
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
    }
  } catch (error) {
    console.error('YouTube processing error:', error);
    return res.status(500).json({ 
      error: 'YouTube processing failed', 
      details: error.message,
      solution: 'YouTube downloading might be restricted on Render. Try using the direct download option or downloading through another platform.'
    });
  }
}

// Instagram download handler
async function handleInstagram(url, res) {
  try {
    console.log('Processing Instagram URL:', url);
    
    // Extract Instagram post ID
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    
    // First method: Use instagram-url-direct
    try {
      const result = await instagramUrlDirect(url);
      
      if (result.url_list.length > 0) {
        const mediaUrls = result.url_list;
        
        // Create format objects for each URL
        const formats = mediaUrls.map((mediaUrl, index) => {
          const isVideo = mediaUrl.includes('.mp4');
          
          return {
            itag: `ig_${index}`,
            quality: isVideo ? 'HD' : 'Original',
            mimeType: isVideo ? 'video/mp4' : 'image/jpeg',
            url: mediaUrl,
            hasAudio: isVideo,
            hasVideo: isVideo,
            contentLength: 0,
            container: isVideo ? 'mp4' : 'jpeg'
          };
        });
        
        // Return the media info
        return res.json({
          title: `Instagram ${formats[0].hasVideo ? 'Video' : 'Image'}`,
          thumbnails: [{ url: formats[0].url, width: 640, height: 640 }],
          formats: formats,
          platform: 'instagram',
          mediaType: formats[0].hasVideo ? 'video' : 'image',
          directUrl: `/api/direct?url=${encodeURIComponent(formats[0].url)}`
        });
      }
    } catch (igError) {
      console.log('instagram-url-direct failed:', igError.message);
    }
    
    // Fallback: Try to fetch the page and extract media URLs
    try {
      const headers = getRandomHeaders(url);
      const response = await axios.get(url, { headers });
      const html = response.data;
      
      // Extract JSON data
      const jsonMatch = html.match(/<script type="application\/json"[^>]*>(.*?)<\/script>/s);
      if (jsonMatch && jsonMatch[1]) {
        const data = JSON.parse(jsonMatch[1]);
        
        // Look for media in different possible locations in the JSON
        let mediaData = null;
        if (data.entry_data && data.entry_data.PostPage) {
          mediaData = data.entry_data.PostPage[0].graphql.shortcode_media;
        } else if (data.items && data.items.length > 0) {
          mediaData = data.items[0];
        } else {
          // Search through the entire object for media_urls or video_url
          const findMedia = (obj) => {
            if (!obj || typeof obj !== 'object') return null;
            
            if (obj.video_url || obj.display_url || (obj.carousel_media && obj.carousel_media.length > 0)) {
              return obj;
            }
            
            for (const key in obj) {
              const result = findMedia(obj[key]);
              if (result) return result;
            }
            
            return null;
          };
          
          mediaData = findMedia(data);
        }
        
        if (mediaData) {
          const formats = [];
          
          // Handle video
          if (mediaData.video_url) {
            formats.push({
              itag: 'ig_video',
              quality: 'HD',
              mimeType: 'video/mp4',
              url: mediaData.video_url,
              hasAudio: true,
              hasVideo: true,
              contentLength: 0,
              container: 'mp4'
            });
          }
          
          // Handle image
          if (mediaData.display_url) {
            formats.push({
              itag: 'ig_image',
              quality: 'Original',
              mimeType: 'image/jpeg',
              url: mediaData.display_url,
              hasAudio: false,
              hasVideo: false,
              contentLength: 0,
              container: 'jpeg'
            });
          }
          
          // Handle carousel
          if (mediaData.carousel_media && mediaData.carousel_media.length > 0) {
            mediaData.carousel_media.forEach((item, index) => {
              if (item.video_url) {
                formats.push({
                  itag: `ig_carousel_video_${index}`,
                  quality: 'HD',
                  mimeType: 'video/mp4',
                  url: item.video_url,
                  hasAudio: true,
                  hasVideo: true,
                  contentLength: 0,
                  container: 'mp4'
                });
              } else if (item.display_url) {
                formats.push({
                  itag: `ig_carousel_image_${index}`,
                  quality: 'Original',
                  mimeType: 'image/jpeg',
                  url: item.display_url,
                  hasAudio: false,
                  hasVideo: false,
                  contentLength: 0,
                  container: 'jpeg'
                });
              }
            });
          }
          
          if (formats.length > 0) {
            // Return the media info
            return res.json({
              title: mediaData.caption ? mediaData.caption.text : 'Instagram Post',
              thumbnails: [{ url: formats[0].url, width: 640, height: 640 }],
              formats: formats,
              platform: 'instagram',
              mediaType: formats[0].hasVideo ? 'video' : 'image',
              directUrl: `/api/direct?url=${encodeURIComponent(formats[0].url)}`
            });
          }
        }
      }
    } catch (fallbackError) {
      console.log('Instagram fallback failed:', fallbackError.message);
    }
    
    // Last resort: Use youtube-dl
    try {
      const info = await youtubeDl(url, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        addHeader: ['referer:instagram.com', 'user-agent:Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1']
      });
      
      // Transform formats
      const formats = [];
      
      if (info.formats && info.formats.length > 0) {
        info.formats.forEach((format, index) => {
          formats.push({
            itag: `ig_ytdl_${index}`,
            quality: format.format_note || 'Standard',
            mimeType: `video/${format.ext || 'mp4'}`,
            url: format.url,
            hasAudio: format.acodec !== 'none',
            hasVideo: format.vcodec !== 'none',
            contentLength: format.filesize || 0,
            container: format.ext || 'mp4'
          });
        });
      } else if (info.url) {
        // Single URL
        formats.push({
          itag: 'ig_ytdl_single',
          quality: 'Standard',
          mimeType: info.ext ? `video/${info.ext}` : 'video/mp4',
          url: info.url,
          hasAudio: true,
          hasVideo: true,
          contentLength: info.filesize || 0,
          container: info.ext || 'mp4'
        });
      }
      
      if (formats.length > 0) {
        return res.json({
          title: info.title || 'Instagram Post',
          thumbnails: info.thumbnails ? info.thumbnails.map(t => ({ url: t.url, width: t.width || 640, height: t.height || 640 })) : [],
          formats: formats,
          platform: 'instagram',
          mediaType: 'video',
          directUrl: `/api/direct?url=${encodeURIComponent(formats[0].url)}`
        });
      }
    } catch (ytdlError) {
      console.log('YouTube-dl Instagram fallback failed:', ytdlError.message);
    }
    
    return res.status(404).json({
      error: 'Failed to extract Instagram media',
      details: 'The post might be private or Instagram has changed their API'
    });
  } catch (error) {
    console.error('Instagram processing error:', error);
    return res.status(500).json({ 
      error: 'Instagram processing failed', 
      details: error.message 
    });
  }
}

// TikTok download handler
async function handleTikTok(url, res) {
  try {
    console.log('Processing TikTok URL:', url);
    
    // Try tiktok-scraper-without-watermark
    try {
      const result = await tiktokScraper.getVideoMeta(url);
      
      if (result.videoData) {
        const videoData = result.videoData;
        const formats = [];
        
        // No watermark video
        if (videoData.itemInfos && videoData.itemInfos.video.urls.length > 0) {
          formats.push({
            itag: 'tiktok_nowm',
            quality: 'No Watermark',
            mimeType: 'video/mp4',
            url: videoData.itemInfos.video.urls[0],
            hasAudio: true,
            hasVideo: true,
            contentLength: 0,
            container: 'mp4'
          });
        }
        
        // Original video
        if (videoData.downloadAddr) {
          formats.push({
            itag: 'tiktok_original',
            quality: 'Original',
            mimeType: 'video/mp4',
            url: videoData.downloadAddr,
            hasAudio: true,
            hasVideo: true,
            contentLength: 0,
            container: 'mp4'
          });
        }
        
        if (formats.length > 0) {
          return res.json({
            title: videoData.text || 'TikTok Video',
            thumbnails: videoData.covers ? videoData.covers.map(cover => ({ url: cover, width: 480, height: 854 })) : [],
            formats: formats,
            platform: 'tiktok',
            mediaType: 'video',
            uploader: videoData.authorId || null,
            directUrl: `/api/direct?url=${encodeURIComponent(formats[0].url)}`
          });
        }
      }
    } catch (tiktokError) {
      console.log('tiktok-scraper failed:', tiktokError.message);
    }
    
    // Fallback: Try fetching the page and extracting video URL
    try {
      const userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1';
      const response = await axios.get(url, {
        headers: {
          'User-Agent': userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Referer': 'https://www.tiktok.com/',
        }
      });
      
      const html = response.data;
      
      // Extract JSON data
      const jsonMatch = html.match(/<script id="SIGI_STATE" type="application\/json">(.*?)<\/script>/s);
      if (jsonMatch && jsonMatch[1]) {
        const data = JSON.parse(jsonMatch[1]);
        
        // Find video URL in the JSON data
        let videoUrl = null;
        let coverUrl = null;
        let videoTitle = 'TikTok Video';
        
        // Different ways to find the video URL in the JSON structure
        if (data.ItemModule) {
          const itemKey = Object.keys(data.ItemModule)[0];
          if (data.ItemModule[itemKey]) {
            const item = data.ItemModule[itemKey];
            videoUrl = item.video?.playAddr || item.video?.downloadAddr;
            coverUrl = item.video?.cover;
            videoTitle = item.desc || videoTitle;
          }
        }
        
        if (!videoUrl && data.videoData) {
          videoUrl = data.videoData.itemInfos?.video?.urls[0] || data.videoData.downloadAddr;
          coverUrl = data.videoData.covers?.[0];
          videoTitle = data.videoData.text || videoTitle;
        }
        
        if (videoUrl) {
          const formats = [{
            itag: 'tiktok_extracted',
            quality: 'Original',
            mimeType: 'video/mp4',
            url: videoUrl,
            hasAudio: true,
            hasVideo: true,
            contentLength: 0,
            container: 'mp4'
          }];
          
          return res.json({
            title: videoTitle,
            thumbnails: coverUrl ? [{ url: coverUrl, width: 480, height: 854 }] : [],
            formats: formats,
            platform: 'tiktok',
            mediaType: 'video',
            directUrl: `/api/direct?url=${encodeURIComponent(videoUrl)}`
          });
        }
      }
    } catch (fallbackError) {
      console.log('TikTok fallback failed:', fallbackError.message);
    }
    
    // Last resort: Use youtube-dl
    try {
      const info = await youtubeDl(url, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        addHeader: ['referer:tiktok.com', 'user-agent:Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1']
      });
      
      // Format response
      const formats = [];
      
      if (info.formats && info.formats.length > 0) {
        info.formats.forEach((format, index) => {
          formats.push({
            itag: `tiktok_ytdl_${index}`,
            quality: format.format_note || 'Standard',
            mimeType: `video/${format.ext || 'mp4'}`,
            url: format.url,
            hasAudio: format.acodec !== 'none',
            hasVideo: format.vcodec !== 'none',
            contentLength: format.filesize || 0,
            container: format.ext || 'mp4'
          });
        });
      } else if (info.url) {
        formats.push({
          itag: 'tiktok_ytdl_single',
          quality: 'Standard',
          mimeType: `video/${info.ext || 'mp4'}`,
          url: info.url,
          hasAudio: true,
          hasVideo: true,
          contentLength: info.filesize || 0,
          container: info.ext || 'mp4'
        });
      }
      
      if (formats.length > 0) {
        return res.json({
          title: info.title || 'TikTok Video',
          thumbnails: info.thumbnails ? info.thumbnails.map(t => ({ 
            url: t.url, 
            width: t.width || 480, 
            height: t.height || 854 
          })) : [],
          formats: formats,
          platform: 'tiktok',
          mediaType: 'video',
          directUrl: `/api/direct?url=${encodeURIComponent(formats[0].url)}`
        });
      }
    } catch (ytdlError) {
      console.log('YouTube-dl TikTok fallback failed:', ytdlError.message);
    }
    
    return res.status(404).json({
      error: 'Failed to extract TikTok video',
      details: 'The video might be private or TikTok has changed their API'
    });
  } catch (error) {
    console.error('TikTok processing error:', error);
    return res.status(500).json({ 
      error: 'TikTok processing failed', 
      details: error.message 
    });
  }
}

// Twitter/X download handler
async function handleTwitter(url, res) {
  try {
    console.log('Processing Twitter/X URL:', url);
    
    // Try fetching Twitter page and extracting video
    try {
      const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36';
      const response = await axios.get(url, {
        headers: {
          'User-Agent': userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        }
      });
      
      const html = response.data;
      
      // Extract video URL from Twitter page
      const videoUrls = [];
      const imgUrls = [];
      
      // Look for video URLs
      const videoRegex = /(?:https?:\/\/video\.twimg\.com\/[^\s"']+)/g;
      const videoMatches = html.match(videoRegex);
      if (videoMatches) {
        videoMatches.forEach(url => {
          if (!url.includes('.m3u8')) { // Exclude HLS manifests
            videoUrls.push(url);
          }
        });
      }
      
      // Look for image URLs
      const imgRegex = /(?:https?:\/\/pbs\.twimg\.com\/media\/[^\s"']+)/g;
      const imgMatches = html.match(imgRegex);
      if (imgMatches) {
        imgMatches.forEach(url => {
          // Get highest quality by removing size params
          const baseUrl = url.split('?')[0];
          // Make sure it's not already in the list
          if (!imgUrls.includes(baseUrl)) {
            imgUrls.push(baseUrl);
          }
        });
      }
      
      // Create formats
      const formats = [];
      
      // Add videos
      videoUrls.forEach((videoUrl, index) => {
        formats.push({
          itag: `twitter_video_${index}`,
          quality: 'Original',
          mimeType: 'video/mp4',
          url: videoUrl,
          hasAudio: true,
          hasVideo: true,
          contentLength: 0,
          container: 'mp4'
        });
      });
      
      // Add images
      imgUrls.forEach((imgUrl, index) => {
        formats.push({
          itag: `twitter_img_${index}`,
          quality: 'Original',
          mimeType: 'image/jpeg',
          url: imgUrl + '?format=jpg&name=orig',
          hasAudio: false,
          hasVideo: false,
          contentLength: 0,
          container: 'jpeg'
        });
      });
      
      if (formats.length > 0) {
        // Extract tweet text for title
        let title = 'Twitter Post';
        const titleMatch = html.match(/<title>(.*?)<\/title>/i);
        if (titleMatch && titleMatch[1]) {
          title = titleMatch[1].replace(' / X', '').replace(' / Twitter', '');
        }
        
        return res.json({
          title: title,
          thumbnails: formats[0].hasVideo ? [] : [{ url: formats[0].url, width: 480, height: 480 }],
          formats: formats,
          platform: 'twitter',
          mediaType: formats[0].hasVideo ? 'video' : 'image',
          directUrl: `/api/direct?url=${encodeURIComponent(formats[0].url)}`
        });
      }
    } catch (twitterError) {
      console.log('Twitter direct approach failed:', twitterError.message);
    }
    
    // Fallback to youtube-dl
    try {
      const info = await youtubeDl(url, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        addHeader: ['referer:twitter.com', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.82 Safari/537.36']
      });
      
      const formats = [];
      
      if (info.formats && info.formats.length > 0) {
        info.formats.forEach((format, index) => {
          formats.push({
            itag: `twitter_ytdl_${index}`,
            quality: format.format_note || 'Standard',
            mimeType: `video/${format.ext || 'mp4'}`,
            url: format.url,
            hasAudio: format.acodec !== 'none',
            hasVideo: format.vcodec !== 'none',
            contentLength: format.filesize || 0,
            container: format.ext || 'mp4'
          });
        });
      } else if (info.url) {
        formats.push({
          itag: 'twitter_ytdl_single',
          quality: 'Standard',
          mimeType: `video/${info.ext || 'mp4'}`,
          url: info.url,
          hasAudio: true,
          hasVideo: true,
          contentLength: info.filesize || 0,
          container: info.ext || 'mp4'
        });
      }
      
      if (formats.length > 0) {
        return res.json({
          title: info.title || 'Twitter Post',
          thumbnails: info.thumbnails ? info.thumbnails.map(t => ({ 
            url: t.url, 
            width: t.width || 480, 
            height: t.height || 480 
          })) : [],
          formats: formats,
          platform: 'twitter',
          mediaType: 'video',
          directUrl: `/api/direct?url=${encodeURIComponent(formats[0].url)}`
        });
      }
    } catch (ytdlError) {
      console.log('YouTube-dl Twitter fallback failed:', ytdlError.message);
    }
    
    return res.status(404).json({
      error: 'Failed to extract Twitter media',
      details: 'The tweet might be private or Twitter has changed their API'
    });
  } catch (error) {
    console.error('Twitter processing error:', error);
    return res.status(500).json({ 
      error: 'Twitter processing failed', 
      details: error.message 
    });
  }
}

// Improved Pinterest handler with video support
async function handlePinterest(url, res) {
  try {
    console.log(`Processing Pinterest URL: ${url}`);

    // User agent for Pinterest requests
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36';

    // First, get the actual page to find media data
    let response;
    try {
      response = await axios.get(url, {
        headers: {
          'User-Agent': userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
        }
      });
    } catch (fetchError) {
      console.error('Error fetching Pinterest page:', fetchError.message);
      
      // Try with a different approach - mobile user agent
      response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        }
      });
    }

    const html = response.data;

    // Extract title
    let title = 'Pinterest Media';
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].replace(' | Pinterest', '').trim();
    }

    // First check if it's a video
    let videoUrls = [];
    let isVideo = false;

    // Method 1: Find video URLs directly in the HTML
    const videoRegexes = [
      /https:\/\/v\.pinimg\.com\/[a-zA-Z0-9\/\._-]+\.mp4/gi,
      /https:\/\/i\.pinimg\.com\/[a-zA-Z0-9\/\._-]+\.mp4/gi,
      /https:\/\/pinterest\.com\/video\/[a-zA-Z0-9\/\._-]+/gi,
      /content="(https:\/\/[^"]*\.mp4)/gi
    ];

    for (const regex of videoRegexes) {
      const matches = html.match(regex);
      if (matches && matches.length > 0) {
        videoUrls = [...videoUrls, ...matches];
        isVideo = true;
      }
    }

    // Method 2: Extract video from JSON data
    const jsonMatches = [
      html.match(/\{"resourceResponses":\[.*?\].*?\}/g),
      html.match(/\{\"options\":\{.*?\"videoUrl\":\"([^\"]+)\"/g),
      html.match(/\{\"pin\":\{.*?\}/g)
    ];

    for (const jsonMatch of jsonMatches) {
      if (jsonMatch && jsonMatch.length > 0) {
        try {
          for (const matchStr of jsonMatch) {
            const data = JSON.parse(matchStr);
            
            // Look for video URLs in resourceResponses
            if (data.resourceResponses) {
              for (const response of data.resourceResponses) {
                if (response.response?.data?.pin?.videos) {
                  const videos = response.response.data.pin.videos;
                  if (videos.video_list) {
                    Object.values(videos.video_list).forEach(video => {
                      if (video.url) {
                        videoUrls.push(video.url);
                        isVideo = true;
                      }
                    });
                  }
                }
              }
            }
            
            // Look for videoUrl in options
            if (data.options && data.options.videoUrl) {
              videoUrls.push(data.options.videoUrl);
              isVideo = true;
            }
            
            // Check pin data directly
            if (data.pin && data.pin.videos) {
              const videos = data.pin.videos;
              if (videos.video_list) {
                Object.values(videos.video_list).forEach(video => {
                  if (video.url) {
                    videoUrls.push(video.url);
                    isVideo = true;
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

    // Method 3: Look for video in meta tags
    const videoMetaMatch = html.match(/<meta property="og:video" content="([^"]+)"/i);
    if (videoMetaMatch && videoMetaMatch[1]) {
      videoUrls.push(videoMetaMatch[1]);
      isVideo = true;
    }

    const videoMetaSecureMatch = html.match(/<meta property="og:video:secure_url" content="([^"]+)"/i);
    if (videoMetaSecureMatch && videoMetaSecureMatch[1]) {
      videoUrls.push(videoMetaSecureMatch[1]);
      isVideo = true;
    }

    // If videos found, process them
    if (isVideo && videoUrls.length > 0) {
      // Remove duplicates and filter out invalid URLs
      videoUrls = [...new Set(videoUrls)].filter(url =>
        url && url.startsWith('http')
      );

      // Unescape special characters in URLs
      videoUrls = videoUrls.map(url => url.replace(/\\u002F/g, '/').replace(/\\/g, ''));

      // Create video formats
      const videoFormats = videoUrls.map((url, index) => {
        let quality = 'Standard';
        if (url.includes('hd') || url.includes('720')) {
          quality = 'HD';
        } else if (url.includes('sd') || url.includes('480')) {
          quality = 'SD';
        }

        return {
          itag: `pin_video_${index}`,
          quality: quality,
          mimeType: 'video/mp4',
          url: url,
          hasAudio: true,
          hasVideo: true,
          contentLength: 0,
          container: 'mp4'
        };
      });

      if (videoFormats.length > 0) {
        // Create a direct download URL for the best video
        const directDownloadUrl = `/api/direct?url=${encodeURIComponent(videoFormats[0].url)}`;

        // Return the video info
        return res.json({
          title: title,
          thumbnails: [], // Pinterest doesn't easily expose video thumbnails
          formats: videoFormats,
          platform: 'pinterest',
          mediaType: 'video',
          directUrl: directDownloadUrl
        });
      }
    }

    // If not a video or video extraction failed, try for images
    let imageUrls = [];

    // Method 1: Find image URLs directly in the HTML
    const originalImages = html.match(/https:\/\/i\.pinimg\.com\/originals\/[a-zA-Z0-9\/\._-]+\.(?:jpg|jpeg|png|gif)/gi);
    if (originalImages && originalImages.length > 0) {
      imageUrls = [...new Set(originalImages)]; // Remove duplicates
    }

    // If no originals, look for specific sizes (736x is common for Pinterest)
    if (imageUrls.length === 0) {
      const sizedImages = html.match(/https:\/\/i\.pinimg\.com\/[0-9]+x(?:\/[a-zA-Z0-9\/\._-]+\.(?:jpg|jpeg|png|gif))/gi);
      if (sizedImages && sizedImages.length > 0) {
        imageUrls = [...new Set(sizedImages)]; // Remove duplicates
      }
    }

    // Method 2: Extract from JSON data
    if (imageUrls.length === 0) {
      const jsonMatch = html.match(/\{"resourceResponses":\[.*?\].*?\}/g);
      if (jsonMatch && jsonMatch.length > 0) {
        try {
          const data = JSON.parse(jsonMatch[0]);
          if (data.resourceResponses && data.resourceResponses.length > 0) {
            const resources = data.resourceResponses[0].response?.data;

            if (resources) {
              // Try to extract from pin data
              if (resources.pin) {
                const pin = resources.pin;

                // Update title if available
                if (pin.title) {
                  title = pin.title;
                }

                // Get images
                if (pin.images && pin.images.orig) {
                  imageUrls.push(pin.images.orig.url);
                }

                // Get all available sizes
                if (pin.images) {
                  Object.values(pin.images).forEach(img => {
                    if (img && img.url) {
                      imageUrls.push(img.url);
                    }
                  });
                }
              }

              // Extract from multiple pins in a board
              if (resources.board?.pins) {
                resources.board.pins.forEach(pin => {
                  if (pin.images && pin.images.orig) {
                    imageUrls.push(pin.images.orig.url);
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

    // Method 3: Look for specialized Pinterest schema data
    if (imageUrls.length === 0) {
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

          // Update title if available
          if (schemaData.name) {
            title = schemaData.name;
          }
        } catch (schemaError) {
          console.error('Error parsing Pinterest schema data:', schemaError);
        }
      }
    }

    // Method 4: Extract from og:image meta tags
    if (imageUrls.length === 0) {
      const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
      if (ogImageMatch && ogImageMatch[1]) {
        imageUrls.push(ogImageMatch[1]);
      }
    }
    
    // Method 5: Try to use a Pinterest API if all else fails
    if (imageUrls.length === 0) {
      try {
        // Extract pin ID from URL
        const pinIdMatch = url.match(/pinterest\.com\/pin\/([0-9]+)/);
        if (pinIdMatch && pinIdMatch[1]) {
          const pinId = pinIdMatch[1];
          
          // Try to use Pinterest's internal API
          const apiUrl = `https://www.pinterest.com/resource/PinResource/get/?source_url=%2Fpin%2F${pinId}%2F&data={"options":{"id":"${pinId}"},"context":{}}`;
          
          const apiResponse = await axios.get(apiUrl, {
            headers: {
              'User-Agent': userAgent,
              'Accept': 'application/json',
              'X-Requested-With': 'XMLHttpRequest',
              'Referer': url
            }
          });
          
          if (apiResponse.data && apiResponse.data.resource_response && apiResponse.data.resource_response.data) {
            const pinData = apiResponse.data.resource_response.data;
            
            if (pinData.images && pinData.images.orig) {
              imageUrls.push(pinData.images.orig.url);
            }
            
            // Get all available sizes
            if (pinData.images) {
              Object.values(pinData.images).forEach(img => {
                if (img && img.url) {
                  imageUrls.push(img.url);
                }
              });
            }
            
            if (pinData.title) {
              title = pinData.title;
            }
          }
        }
      } catch (apiError) {
        console.error('Error using Pinterest API:', apiError.message);
      }
    }

    // Fallback for when no images or videos found - use youtube-dl as last resort
    if (imageUrls.length === 0 && videoUrls.length === 0) {
      try {
        const info = await youtubeDl(url, {
          dumpSingleJson: true,
          noCheckCertificates: true,
          noWarnings: true,
          addHeader: ['referer:pinterest.com', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.82 Safari/537.36']
        });
        
        // Look for video formats
        if (info.formats && info.formats.length > 0) {
          info.formats.forEach(format => {
            if (format.url) {
              if (format.ext === 'mp4' || format.ext === 'webm') {
                videoUrls.push(format.url);
                isVideo = true;
              } else {
                imageUrls.push(format.url);
              }
            }
          });
        } else if (info.url) {
          // Check if it's a video URL
          if (info.ext === 'mp4' || info.ext === 'webm' || info.url.includes('.mp4') || info.url.includes('.webm')) {
            videoUrls.push(info.url);
            isVideo = true;
          } else {
            imageUrls.push(info.url);
          }
        }
        
        if (info.title) {
          title = info.title;
        }
      } catch (ytdlError) {
        console.error('YouTube-dl Pinterest fallback failed:', ytdlError.message);
      }
    }
    
    // If we found videos but failed earlier, try again here
    if (videoUrls.length > 0) {
      // Remove duplicates and filter out invalid URLs
      videoUrls = [...new Set(videoUrls)].filter(url =>
        url && url.startsWith('http')
      );

      // Unescape special characters in URLs
      videoUrls = videoUrls.map(url => url.replace(/\\u002F/g, '/').replace(/\\/g, ''));

      // Create video formats
      const videoFormats = videoUrls.map((url, index) => {
        let quality = 'Standard';
        if (url.includes('hd') || url.includes('720')) {
          quality = 'HD';
        } else if (url.includes('sd') || url.includes('480')) {
          quality = 'SD';
        }

        return {
          itag: `pin_video_${index}`,
          quality: quality,
          mimeType: 'video/mp4',
          url: url,
          hasAudio: true,
          hasVideo: true,
          contentLength: 0,
          container: 'mp4'
        };
      });

      if (videoFormats.length > 0) {
        // Create a direct download URL for the best video
        const directDownloadUrl = `/api/direct?url=${encodeURIComponent(videoFormats[0].url)}`;

        // Return the video info
        return res.json({
          title: title,
          thumbnails: [], // Pinterest doesn't easily expose video thumbnails
          formats: videoFormats,
          platform: 'pinterest',
          mediaType: 'video',
          directUrl: directDownloadUrl
        });
      }
    }
    
    // If still no images or videos found, return error
    if (imageUrls.length === 0 && videoUrls.length === 0) {
      return res.status(404).json({
        error: 'No media found on this Pinterest page',
        details: 'Try opening the pin in a browser and copying the URL directly'
      });
    }

    // Process images if no videos were found
    if (imageUrls.length > 0) {
      // Remove duplicates and filter out invalid URLs
      imageUrls = [...new Set(imageUrls)].filter(url =>
        url && url.startsWith('http') &&
        /\.(jpg|jpeg|png|gif|webp)/i.test(url)
      );

      // Sort by quality (prioritize originals and larger sizes)
      imageUrls.sort((a, b) => {
        // Original images are preferred
        if (a.includes('/originals/') && !b.includes('/originals/')) return -1;
        if (!a.includes('/originals/') && b.includes('/originals/')) return 1;

        // Check for resolution indicators
        const sizesA = a.match(/\/([0-9]+)x\//);
        const sizesB = b.match(/\/([0-9]+)x\//);

        if (sizesA && sizesB) {
          return parseInt(sizesB[1]) - parseInt(sizesA[1]); // Higher resolution first
        }

        return b.length - a.length; // Longer URLs usually contain more metadata
      });

      // Create format objects for each image
      const formats = imageUrls.map((url, index) => {
        // Try to determine quality from URL
        let quality = 'Standard';

        if (url.includes('/originals/')) {
          quality = 'Original';
        } else {
          const sizeMatch = url.match(/\/([0-9]+)x\//);
          if (sizeMatch && sizeMatch[1]) {
            quality = `${sizeMatch[1]}px`;
          }
        }

        // Determine image format
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

      // Create a direct download URL for the best image
      const directDownloadUrl = `/api/direct?url=${encodeURIComponent(imageUrls[0])}`;

      // Return the image info
      return res.json({
        title: title,
        thumbnails: [{ url: imageUrls[0], width: 480, height: 480 }],
        formats: formats,
        platform: 'pinterest',
        mediaType: 'image',
        directUrl: directDownloadUrl
      });
    }
  } catch (error) {
    console.error('Pinterest error:', error);
    return res.status(500).json({ 
      error: 'Pinterest processing failed', 
      details: error.message 
    });
  }
}

// Facebook-specific endpoint for better video extraction
async function handleFacebook(url, res) {
  try {
    console.log(`Processing Facebook URL: ${url}`);

    // Prepare multiple user agents to try
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Safari/605.1.15'
    ];

    // Function to extract video URLs from HTML
    function extractVideoUrls(html) {
      const results = [];

      // Method 1: Find HD_SRC and SD_SRC in JavaScript
      const hdMatch = html.match(/"hd_src":"([^"]+)"/);
      const sdMatch = html.match(/"sd_src":"([^"]+)"/);

      if (hdMatch && hdMatch[1]) {
        results.push({
          quality: 'HD',
          url: hdMatch[1].replace(/\\/g, '')
        });
      }

      if (sdMatch && sdMatch[1]) {
        results.push({
          quality: 'SD',
          url: sdMatch[1].replace(/\\/g, '')
        });
      }

      // Method 2: Find video tags
      const videoTagMatches = html.match(/<video[^>]*src="([^"]+)"[^>]*>/g);
      if (videoTagMatches) {
        for (const videoTag of videoTagMatches) {
          const srcMatch = videoTag.match(/src="([^"]+)"/);
          if (srcMatch && srcMatch[1]) {
            results.push({
              quality: 'Video Tag',
              url: srcMatch[1]
            });
          }
        }
      }

      // Method 3: Look for FBQualityLabel
      const qualityLabelMatches = html.match(/FBQualityLabel="([^"]+)"[^>]*src="([^"]+)"/g);
      if (qualityLabelMatches) {
        for (const match of qualityLabelMatches) {
          const labelMatch = match.match(/FBQualityLabel="([^"]+)"/);
          const srcMatch = match.match(/src="([^"]+)"/);

          if (labelMatch && labelMatch[1] && srcMatch && srcMatch[1]) {
            results.push({
              quality: labelMatch[1],
              url: srcMatch[1]
            });
          }
        }
      }

      // Method 4: Look for og:video content
      const ogVideoMatch = html.match(/<meta property="og:video:url" content="([^"]+)"/i);
      if (ogVideoMatch && ogVideoMatch[1]) {
        results.push({
          quality: 'og:video',
          url: ogVideoMatch[1]
        });
      }

      // Method 5: Look for og:video:secure_url content
      const ogVideoSecureMatch = html.match(/<meta property="og:video:secure_url" content="([^"]+)"/i);
      if (ogVideoSecureMatch && ogVideoSecureMatch[1]) {
        results.push({
          quality: 'og:video:secure',
          url: ogVideoSecureMatch[1]
        });
      }

      // Method 6: Additional JSON-encoded video sources
      const jsonSourceMatch = html.match(/videoData"?:\s*\[\s*\{.*?"hd_src"?:"?([^"]+)"?/s);
      if (jsonSourceMatch && jsonSourceMatch[1]) {
        results.push({
          quality: 'HD (JSON)',
          url: jsonSourceMatch[1].replace(/\\/g, '')
        });
      }

      return results;
    }

    // Try different user agents to bypass restrictions
    let videoUrls = [];
    let html = '';
    let title = 'Facebook Video';
    let thumbnail = '';

    for (const userAgent of userAgents) {
      try {
        const response = await axios.get(url, {
          headers: {
            'User-Agent': userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
          },
          timeout: 15000, // 15 second timeout
          maxRedirects: 5
        });

        html = response.data;

        // Extract title
        const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
        if (titleMatch && titleMatch[1]) {
          title = titleMatch[1].replace(' | Facebook', '').trim();
        }

        // Extract thumbnail
        const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
        if (ogImageMatch && ogImageMatch[1]) {
          thumbnail = ogImageMatch[1];
        }

        // Extract video URLs
        videoUrls = extractVideoUrls(html);

        if (videoUrls.length > 0) {
          break; // We found videos, stop trying different user agents
        }
      } catch (agentError) {
        console.error(`Error with user agent ${userAgent}:`, agentError.message);
        continue; // Try next user agent
      }
    }

    // If no videos found through direct extraction, try Video URL Link
    if (videoUrls.length === 0) {
      try {
        const extractFbVideo = () => {
          return new Promise((resolve, reject) => {
            videoUrlLink.facebook.getInfo(url, {}, (error, info) => {
              if (error) {
                reject(error);
              } else {
                resolve(info);
              }
            });
          });
        };
        
        const fbInfo = await extractFbVideo();
        
        if (fbInfo && fbInfo.download && fbInfo.download.length > 0) {
          fbInfo.download.forEach((video, index) => {
            videoUrls.push({
              quality: video.quality || `Quality ${index + 1}`,
              url: video.url
            });
          });
          
          if (fbInfo.title) {
            title = fbInfo.title;
          }
          
          if (fbInfo.thumbnail) {
            thumbnail = fbInfo.thumbnail;
          }
        }
      } catch (videoLinkError) {
        console.error('video-url-link error:', videoLinkError.message);
      }
    }

    // If still no videos found, try youtube-dl as fallback
    if (videoUrls.length === 0) {
      console.log('No videos found through direct extraction, trying youtube-dl...');

      try {
        const info = await youtubeDl(url, {
          dumpSingleJson: true,
          noCheckCertificates: true,
          noWarnings: true,
          addHeader: ['referer:facebook.com', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.82 Safari/537.36']
        });

        if (info.formats && info.formats.length > 0) {
          // Extract formats from youtube-dl
          info.formats.forEach(format => {
            if (format.url) {
              let quality = 'Unknown';

              if (format.format_note) {
                quality = format.format_note;
              } else if (format.height) {
                quality = `${format.height}p`;
              }

              videoUrls.push({
                quality: quality,
                url: format.url
              });
            }
          });

          // Update title and thumbnail if available
          if (info.title) title = info.title;
          if (info.thumbnail) thumbnail = info.thumbnail;
        }
      } catch (ytdlError) {
        console.error('youtube-dl fallback error:', ytdlError.message);
      }
    }

    // If still no videos found, return error
    if (videoUrls.length === 0) {
      return res.status(404).json({
        error: 'No videos found on this Facebook page',
        details: 'This might be a private video or require login'
      });
    }

    // Remove duplicates
    const uniqueUrls = [];
    const seen = new Set();

    for (const video of videoUrls) {
      if (!seen.has(video.url)) {
        seen.add(video.url);
        uniqueUrls.push(video);
      }
    }

    // Create format objects for each video
    const formats = uniqueUrls.map((video, index) => {
      return {
        itag: `fb_${index}`,
        quality: video.quality,
        mimeType: 'video/mp4',
        url: video.url,
        hasAudio: true,
        hasVideo: true,
        contentLength: 0,
        container: 'mp4'
      };
    });

    // Get direct URL for the highest quality video
    let directUrl = '';
    if (formats.length > 0) {
      // Prefer HD quality if available
      const hdFormat = formats.find(f => f.quality === 'HD' || f.quality.includes('720'));
      directUrl = `/api/direct?url=${encodeURIComponent(hdFormat ? hdFormat.url : formats[0].url)}`;
    }

    // Return the video info
    return res.json({
      title: title,
      thumbnails: thumbnail ? [{ url: thumbnail, width: 480, height: 360 }] : [],
      formats: formats,
      platform: 'facebook',
      mediaType: 'video',
      directUrl: directUrl
    });
  } catch (error) {
    console.error('Facebook error:', error);
    return res.status(500).json({ 
      error: 'Facebook processing failed', 
      details: error.message 
    });
  }
}

// Spotify handler
async function handleSpotify(url, res) {
  try {
    console.log(`Processing Spotify URL: ${url}`);
    
    // Spotify doesn't allow direct downloads, so we need to use youtube-dl
    try {
      const info = await youtubeDl(url, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        addHeader: ['referer:spotify.com', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.82 Safari/537.36']
      });
      
      // Format response
      const formats = [];
      
      if (info.formats && info.formats.length > 0) {
        info.formats.forEach((format, index) => {
          formats.push({
            itag: `spotify_${index}`,
            quality: format.format_note || (format.abr ? `${format.abr}kbps` : 'Standard'),
            mimeType: `audio/${format.ext || 'mp3'}`,
            url: format.url,
            hasAudio: true,
            hasVideo: false,
            contentLength: format.filesize || 0,
            container: format.ext || 'mp3'
          });
        });
      } else if (info.url) {
        formats.push({
          itag: 'spotify_best',
          quality: 'Best',
          mimeType: `audio/${info.ext || 'mp3'}`,
          url: info.url,
          hasAudio: true,
          hasVideo: false,
          contentLength: info.filesize || 0,
          container: info.ext || 'mp3'
        });
      }
      
      if (formats.length > 0) {
        return res.json({
          title: info.title || 'Spotify Track',
          thumbnails: info.thumbnails ? info.thumbnails.map(t => ({ 
            url: t.url, 
            width: t.width || 300, 
            height: t.height || 300 
          })) : [],
          formats: formats,
          platform: 'spotify',
          mediaType: 'audio',
          uploader: info.uploader || info.artist || null,
          directUrl: `/api/direct?url=${encodeURIComponent(formats[0].url)}`
        });
      }
    } catch (error) {
      console.error('Spotify youtube-dl error:', error);
    }
    
    // Fallback to direct page scraping
    try {
      const response = await axios.get(url, {
        headers: getRandomHeaders(url)
      });
      
      const html = response.data;
      
      // Extract title and artist
      let title = 'Spotify Track';
      let artist = '';
      let thumbnailUrl = '';
      
      const titleMatch = html.match(/<title>(.*?)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        const titleParts = titleMatch[1].split(' - ');
        if (titleParts.length >= 2) {
          title = titleParts[0].trim();
          artist = titleParts[1].replace('Spotify', '').trim();
        } else {
          title = titleMatch[1].replace('Spotify', '').trim();
        }
      }
      
      // Extract thumbnail
      const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
      if (ogImageMatch && ogImageMatch[1]) {
        thumbnailUrl = ogImageMatch[1];
      }
      
      // Spotify doesn't allow direct downloads, so we'll provide information only
      return res.json({
        title: title,
        thumbnails: thumbnailUrl ? [{ url: thumbnailUrl, width: 300, height: 300 }] : [],
        formats: [{
          itag: 'spotify_info',
          quality: 'Preview',
          mimeType: 'audio/mp3',
          url: url,
          hasAudio: true,
          hasVideo: false,
          contentLength: 0,
          container: 'mp3'
        }],
        platform: 'spotify',
        mediaType: 'audio',
        uploader: artist,
        message: 'Spotify content requires premium access for full audio playback. Only previews may be available.',
        directUrl: null
      });
    } catch (error) {
      console.error('Spotify fallback error:', error);
      return res.status(500).json({ 
        error: 'Spotify processing failed', 
        details: error.message,
        message: 'Spotify content requires premium access for full audio playback'
      });
    }
  } catch (error) {
    console.error('Spotify error:', error);
    return res.status(500).json({ 
      error: 'Spotify processing failed', 
      details: error.message 
    });
  }
}

// SoundCloud handler
async function handleSoundCloud(url, res) {
  try {
    console.log(`Processing SoundCloud URL: ${url}`);
    
    // Use youtube-dl for SoundCloud
    try {
      const info = await youtubeDl(url, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        addHeader: ['referer:soundcloud.com', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.82 Safari/537.36']
      });
      
      // Format response
      const formats = [];
      
      if (info.formats && info.formats.length > 0) {
        info.formats.forEach((format, index) => {
          formats.push({
            itag: `sc_${index}`,
            quality: format.format_note || (format.abr ? `${format.abr}kbps` : 'Standard'),
            mimeType: `audio/${format.ext || 'mp3'}`,
            url: format.url,
            hasAudio: true,
            hasVideo: false,
            contentLength: format.filesize || 0,
            container: format.ext || 'mp3'
          });
        });
      } else if (info.url) {
        formats.push({
          itag: 'sc_best',
          quality: 'Best',
          mimeType: `audio/${info.ext || 'mp3'}`,
          url: info.url,
          hasAudio: true,
          hasVideo: false,
          contentLength: info.filesize || 0,
          container: info.ext || 'mp3'
        });
      }
      
      if (formats.length > 0) {
        return res.json({
          title: info.title || 'SoundCloud Track',
          thumbnails: info.thumbnails ? info.thumbnails.map(t => ({ 
            url: t.url, 
            width: t.width || 300, 
            height: t.height || 300 
          })) : [],
          formats: formats,
          platform: 'soundcloud',
          mediaType: 'audio',
          uploader: info.uploader || null,
          directUrl: `/api/direct?url=${encodeURIComponent(formats[0].url)}`
        });
      }
    } catch (error) {
      console.error('SoundCloud youtube-dl error:', error);
    }
    
    // Fallback to page scraping
    try {
      const response = await axios.get(url, {
        headers: getRandomHeaders(url)
      });
      
      const html = response.data;
      
      // Extract track data from JSON in page
      const jsonMatch = html.match(/<script>window\.__sc_hydration = (.*?);<\/script>/);
      if (jsonMatch && jsonMatch[1]) {
        const data = JSON.parse(jsonMatch[1]);
        
        let trackInfo = null;
        
        // Find track info in hydration data
        for (const item of data) {
          if (item.hydratable === 'sound') {
            trackInfo = item.data;
            break;
          }
        }
        
        if (trackInfo && trackInfo.media && trackInfo.media.transcodings) {
          const formats = [];
          
          // Extract available formats
          trackInfo.media.transcodings.forEach((format, index) => {
            if (format.url) {
              formats.push({
                itag: `sc_${index}`,
                quality: format.quality || 'Standard',
                mimeType: format.format.mime_type || 'audio/mpeg',
                url: format.url,
                hasAudio: true,
                hasVideo: false,
                contentLength: 0,
                container: format.format.protocol
              });
            }
          });
          
          if (formats.length > 0) {
            return res.json({
              title: trackInfo.title || 'SoundCloud Track',
              thumbnails: trackInfo.artwork_url ? [{ 
                url: trackInfo.artwork_url.replace('-large', '-t500x500'), 
                width: 500, 
                height: 500 
              }] : [],
              formats: formats,
              platform: 'soundcloud',
              mediaType: 'audio',
              uploader: trackInfo.user?.username || null,
              directUrl: `/api/direct?url=${encodeURIComponent(formats[0].url)}`
            });
          }
        }
      }
    } catch (error) {
      console.error('SoundCloud fallback error:', error);
    }
    
    return res.status(404).json({
      error: 'Could not extract SoundCloud audio',
      details: 'The track might be private or SoundCloud has changed their API'
    });
  } catch (error) {
    console.error('SoundCloud error:', error);
    return res.status(500).json({ 
      error: 'SoundCloud processing failed', 
      details: error.message 
    });
  }
}

// Vimeo handler
async function handleVimeo(url, res) {
  try {
    console.log(`Processing Vimeo URL: ${url}`);
    
    // Use youtube-dl for Vimeo
    try {
      const info = await youtubeDl(url, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        addHeader: ['referer:vimeo.com', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.82 Safari/537.36']
      });
      
      // Format response
      const formats = [];
      
      if (info.formats && info.formats.length > 0) {
        info.formats.forEach((format, index) => {
          const isVideo = format.vcodec !== 'none';
          const isAudio = format.acodec !== 'none';
          
          let qualityLabel = format.format_note || 'Unknown';
          if (format.height) {
            qualityLabel = `${format.height}p`;
            if (format.fps) qualityLabel += ` ${format.fps}fps`;
          }
          
          formats.push({
            itag: `vimeo_${index}`,
            quality: qualityLabel,
            mimeType: isVideo ? `video/${format.ext || 'mp4'}` : `audio/${format.ext || 'mp3'}`,
            url: format.url,
            hasAudio: isAudio,
            hasVideo: isVideo,
            contentLength: format.filesize || 0,
            container: format.ext
          });
        });
      }
      
      if (formats.length > 0) {
        return res.json({
          title: info.title || 'Vimeo Video',
          thumbnails: info.thumbnails ? info.thumbnails.map(t => ({ 
            url: t.url, 
            width: t.width || 640, 
            height: t.height || 360 
          })) : [],
          formats: formats,
          platform: 'vimeo',
          mediaType: 'video',
          uploader: info.uploader || null,
          uploadDate: info.upload_date || null,
          description: info.description || null,
          directUrl: `/api/direct?url=${encodeURIComponent(formats[0].url)}`
        });
      }
    } catch (error) {
      console.error('Vimeo youtube-dl error:', error);
    }
    
    // Fallback to page scraping
    try {
      const response = await axios.get(url, {
        headers: getRandomHeaders(url)
      });
      
      const html = response.data;
      
      // Extract Vimeo config JSON
      const configMatch = html.match(/var config = (.*?);/);
      if (configMatch && configMatch[1]) {
        const config = JSON.parse(configMatch[1]);
        
        if (config.video && config.request && config.request.files) {
          const formats = [];
          const files = config.request.files;
          
          // Process progressive (direct) files
          if (files.progressive) {
            files.progressive.forEach((format, index) => {
              formats.push({
                itag: `vimeo_prog_${index}`,
                quality: format.quality || 'Standard',
                mimeType: format.mime || 'video/mp4',
                url: format.url,
                hasAudio: true,
                hasVideo: true,
                contentLength: 0,
                container: 'mp4'
              });
            });
          }
          
          // Process HLS if available
          if (files.hls && files.hls.url) {
            formats.push({
              itag: 'vimeo_hls',
              quality: 'Adaptive',
              mimeType: 'application/x-mpegURL',
              url: files.hls.url,
              hasAudio: true,
              hasVideo: true,
              contentLength: 0,
              container: 'hls'
            });
          }
          
          if (formats.length > 0) {
            let title = config.video.title;
            let thumbnailUrl = '';
            
            if (config.video.thumbs) {
              const sizes = Object.keys(config.video.thumbs);
              if (sizes.length > 0) {
                // Get largest thumbnail
                const largestSize = Math.max(...sizes.map(s => parseInt(s)));
                thumbnailUrl = config.video.thumbs[largestSize];
              }
            }
            
            return res.json({
              title: title || 'Vimeo Video',
              thumbnails: thumbnailUrl ? [{ url: thumbnailUrl, width: 640, height: 360 }] : [],
              formats: formats,
              platform: 'vimeo',
              mediaType: 'video',
              uploader: config.video.owner?.name || null,
              directUrl: `/api/direct?url=${encodeURIComponent(formats[0].url)}`
            });
          }
        }
      }
    } catch (error) {
      console.error('Vimeo fallback error:', error);
    }
    
    return res.status(404).json({
      error: 'Could not extract Vimeo video',
      details: 'The video might be private or Vimeo has changed their API'
    });
  } catch (error) {
    console.error('Vimeo error:', error);
    return res.status(500).json({ 
      error: 'Vimeo processing failed', 
      details: error.message 
    });
  }
}

// Dailymotion handler
async function handleDailymotion(url, res) {
  try {
    console.log(`Processing Dailymotion URL: ${url}`);
    
    // Use youtube-dl for Dailymotion
    try {
      const info = await youtubeDl(url, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        addHeader: ['referer:dailymotion.com', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.82 Safari/537.36']
      });
      
      // Format response
      const formats = [];
      
      if (info.formats && info.formats.length > 0) {
        info.formats.forEach((format, index) => {
          const isVideo = format.vcodec !== 'none';
          const isAudio = format.acodec !== 'none';
          
          let qualityLabel = format.format_note || 'Unknown';
          if (format.height) {
            qualityLabel = `${format.height}p`;
            if (format.fps) qualityLabel += ` ${format.fps}fps`;
          }
          
          formats.push({
            itag: `dm_${index}`,
            quality: qualityLabel,
            mimeType: isVideo ? `video/${format.ext || 'mp4'}` : `audio/${format.ext || 'mp3'}`,
            url: format.url,
            hasAudio: isAudio,
            hasVideo: isVideo,
            contentLength: format.filesize || 0,
            container: format.ext
          });
        });
      }
      
      if (formats.length > 0) {
        return res.json({
          title: info.title || 'Dailymotion Video',
          thumbnails: info.thumbnails ? info.thumbnails.map(t => ({ 
            url: t.url, 
            width: t.width || 640, 
            height: t.height || 360 
          })) : [],
          formats: formats,
          platform: 'dailymotion',
          mediaType: 'video',
          uploader: info.uploader || null,
          directUrl: `/api/direct?url=${encodeURIComponent(formats[0].url)}`
        });
      }
    } catch (error) {
      console.error('Dailymotion youtube-dl error:', error);
    }
    
    // Fallback to page scraping
    try {
      const response = await axios.get(url, {
        headers: getRandomHeaders(url)
      });
      
      const html = response.data;
      
      // Extract Dailymotion metadata
      const metadataMatch = html.match(/"__PLAYER_CONFIG__":(.*?),"__PLAYER_REACT_PROPS__"/);
      if (metadataMatch && metadataMatch[1]) {
        const metadata = JSON.parse(metadataMatch[1]);
        
        if (metadata.metadata) {
          const videoData = metadata.metadata;
          const qualities = videoData.qualities;
          
          if (qualities) {
            const formats = [];
            
            // Process available qualities
            Object.keys(qualities).forEach(quality => {
              const urls = qualities[quality];
              if (urls && urls.length > 0) {
                formats.push({
                  itag: `dm_${quality}`,
                  quality: quality,
                  mimeType: 'video/mp4',
                  url: urls[0].url,
                  hasAudio: true,
                  hasVideo: true,
                  contentLength: 0,
                  container: 'mp4'
                });
              }
            });
            
            if (formats.length > 0) {
              return res.json({
                title: videoData.title || 'Dailymotion Video',
                thumbnails: videoData.posters ? Object.values(videoData.posters).map(url => ({ 
                  url: url, 
                  width: 640, 
                  height: 360 
                })) : [],
                formats: formats,
                platform: 'dailymotion',
                mediaType: 'video',
                uploader: videoData.owner_username || null,
                directUrl: `/api/direct?url=${encodeURIComponent(formats[0].url)}`
              });
            }
          }
        }
      }
    } catch (error) {
      console.error('Dailymotion fallback error:', error);
    }
    
    return res.status(404).json({
      error: 'Could not extract Dailymotion video',
      details: 'The video might be private or Dailymotion has changed their API'
    });
  } catch (error) {
    console.error('Dailymotion error:', error);
    return res.status(500).json({ 
      error: 'Dailymotion processing failed', 
      details: error.message 
    });
  }
}

// Twitch handler
async function handleTwitch(url, res) {
  try {
    console.log(`Processing Twitch URL: ${url}`);
    
    // Use youtube-dl for Twitch
    try {
      const info = await youtubeDl(url, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        addHeader: ['referer:twitch.tv', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.82 Safari/537.36']
      });
      
      // Format response
      const formats = [];
      
      if (info.formats && info.formats.length > 0) {
        info.formats.forEach((format, index) => {
          const isVideo = format.vcodec !== 'none';
          const isAudio = format.acodec !== 'none';
          
          let qualityLabel = format.format_note || 'Unknown';
          if (format.height) {
            qualityLabel = `${format.height}p`;
            if (format.fps) qualityLabel += ` ${format.fps}fps`;
          }
          
          formats.push({
            itag: `twitch_${index}`,
            quality: qualityLabel,
            mimeType: isVideo ? `video/${format.ext || 'mp4'}` : `audio/${format.ext || 'mp3'}`,
            url: format.url,
            hasAudio: isAudio,
            hasVideo: isVideo,
            contentLength: format.filesize || 0,
            container: format.ext
          });
        });
      }
      
      if (formats.length > 0) {
        return res.json({
          title: info.title || 'Twitch Video',
          thumbnails: info.thumbnails ? info.thumbnails.map(t => ({ 
            url: t.url, 
            width: t.width || 640, 
            height: t.height || 360 
          })) : [],
          formats: formats,
          platform: 'twitch',
          mediaType: 'video',
          uploader: info.uploader || null,
          directUrl: `/api/direct?url=${encodeURIComponent(formats[0].url)}`
        });
      }
    } catch (error) {
      console.error('Twitch youtube-dl error:', error);
      
      // For Twitch, if youtube-dl fails we need to inform the user about VOD limitations
      return res.status(404).json({
        error: 'Could not extract Twitch video',
        details: 'Twitch only allows downloading VODs (saved streams). Live streams cannot be downloaded directly.',
        message: 'This may be a live stream that is not yet available as a VOD, or the VOD has been deleted.'
      });
    }
    
    return res.status(404).json({
      error: 'Could not extract Twitch video',
      details: 'Twitch only allows downloading VODs (saved streams). Live streams cannot be downloaded directly.'
    });
  } catch (error) {
    console.error('Twitch error:', error);
    return res.status(500).json({ 
      error: 'Twitch processing failed', 
      details: error.message 
    });
  }
}

// Threads (Meta) handler
async function handleThreads(url, res) {
  try {
    console.log(`Processing Threads URL: ${url}`);
    
    // First try with youtube-dl as it might get updated to support Threads
    try {
      const info = await youtubeDl(url, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        addHeader: ['referer:threads.net', 'user-agent:Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1']
      });
      
      if (info.formats && info.formats.length > 0) {
        const formats = info.formats.map((format, index) => {
          const isVideo = format.vcodec !== 'none';
          
          return {
            itag: `threads_${index}`,
            quality: format.format_note || (format.height ? `${format.height}p` : 'Standard'),
            mimeType: isVideo ? `video/${format.ext || 'mp4'}` : `image/jpeg`,
            url: format.url,
            hasAudio: format.acodec !== 'none',
            hasVideo: isVideo,
            contentLength: format.filesize || 0,
            container: format.ext || 'mp4'
          };
        });
        
        return res.json({
          title: info.title || 'Threads Post',
          thumbnails: info.thumbnails ? info.thumbnails.map(t => ({ 
            url: t.url, 
            width: t.width || 640, 
            height: t.height || 640 
          })) : [],
          formats: formats,
          platform: 'threads',
          mediaType: formats[0].hasVideo ? 'video' : 'image',
          uploader: info.uploader || null,
          directUrl: `/api/direct?url=${encodeURIComponent(formats[0].url)}`
        });
      }
    } catch (ytdlError) {
      console.error('Threads youtube-dl error:', ytdlError);
    }
    
    // Direct extraction method since Threads is similar to Instagram
    // Get the page content first with a mobile user agent
    const mobileUserAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1';
    
    let response;
    try {
      response = await axios.get(url, {
        headers: {
          'User-Agent': mobileUserAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Referer': 'https://threads.net/'
        }
      });
    } catch (error) {
      console.error('Error fetching Threads page:', error);
      throw new Error('Failed to access Threads content');
    }
    
    const html = response.data;
    
    // Extract JSON data which contains the media URLs
    const formats = [];
    let title = 'Threads Post';
    let thumbnailUrl = '';
    let isVideo = false;
    let mediaUrl = '';
    let userName = '';
    
    // Method 1: Find media in embedded JSON
    const jsonDataRegexes = [
      /<script type="application\/json" data-sjs>(.*?)<\/script>/s,
      /window\.__additionalDataLoaded\('.*?',(.*?)\);<\/script>/s,
      /"media":\s*\{.*?"uri":\s*"([^"]+)"/s
    ];
    
    for (const regex of jsonDataRegexes) {
      const jsonMatch = html.match(regex);
      if (jsonMatch && jsonMatch[1]) {
        try {
          const data = JSON.parse(jsonMatch[1]);
          
          // Extract thread data - structure depends on how Threads formats their response
          let threadData = null;
          
          // Navigate through possible data structures
          if (data.require && Array.isArray(data.require)) {
            // Find thread data in require array
            for (const item of data.require) {
              if (Array.isArray(item) && item[0] && item[0].includes('ThreadItem')) {
                if (item[3] && item[3][0] && item[3][0].thread_items) {
                  threadData = item[3][0].thread_items[0];
                  break;
                }
              }
            }
          } else if (data.data && data.data.containing_thread) {
            threadData = data.data.containing_thread.thread_items[0];
          } else if (data.thread_items) {
            threadData = data.thread_items[0];
          }
          
          if (threadData) {
            // Extract post content
            if (threadData.post) {
              const post = threadData.post;
              
              // Get caption/text
              if (post.caption && post.caption.text) {
                title = post.caption.text.length > 100 
                  ? post.caption.text.slice(0, 97) + '...' 
                  : post.caption.text;
              }
              
              // Get username
              if (post.user && post.user.username) {
                userName = post.user.username;
                if (title === 'Threads Post') {
                  title = `@${userName}'s Threads Post`;
                }
              }
              
              // Get media
              if (post.carousel_media && post.carousel_media.length > 0) {
                // Handle carousel/multiple media
                post.carousel_media.forEach((media, index) => {
                  if (media.video_versions && media.video_versions.length > 0) {
                    // It's a video
                    isVideo = true;
                    media.video_versions.forEach((video, videoIndex) => {
                      formats.push({
                        itag: `threads_carousel_video_${index}_${videoIndex}`,
                        quality: `${video.height}p`,
                        mimeType: 'video/mp4',
                        url: video.url,
                        hasAudio: true,
                        hasVideo: true,
                        contentLength: 0,
                        container: 'mp4'
                      });
                    });
                    
                    // Use the first thumbnail as fallback
                    if (!thumbnailUrl && media.image_versions2 && 
                        media.image_versions2.candidates && 
                        media.image_versions2.candidates.length > 0) {
                      thumbnailUrl = media.image_versions2.candidates[0].url;
                    }
                  } else if (media.image_versions2 && 
                             media.image_versions2.candidates && 
                             media.image_versions2.candidates.length > 0) {
                    // It's an image
                    const images = media.image_versions2.candidates;
                    // Sort by width descending to get highest quality first
                    images.sort((a, b) => b.width - a.width);
                    
                    images.forEach((image, imageIndex) => {
                      formats.push({
                        itag: `threads_carousel_image_${index}_${imageIndex}`,
                        quality: `${image.width}x${image.height}`,
                        mimeType: 'image/jpeg',
                        url: image.url,
                        hasAudio: false,
                        hasVideo: false,
                        contentLength: 0,
                        container: 'jpeg'
                      });
                    });
                    
                    // Use the first image as thumbnail if we don't have one yet
                    if (!thumbnailUrl) {
                      thumbnailUrl = images[0].url;
                    }
                  }
                });
              } else if (post.video_versions && post.video_versions.length > 0) {
                // Single video
                isVideo = true;
                post.video_versions.forEach((video, videoIndex) => {
                  formats.push({
                    itag: `threads_video_${videoIndex}`,
                    quality: `${video.height}p`,
                    mimeType: 'video/mp4',
                    url: video.url,
                    hasAudio: true,
                    hasVideo: true,
                    contentLength: 0,
                    container: 'mp4'
                  });
                });
                
                // Use image as thumbnail
                if (post.image_versions2 && 
                    post.image_versions2.candidates && 
                    post.image_versions2.candidates.length > 0) {
                  thumbnailUrl = post.image_versions2.candidates[0].url;
                }
              } else if (post.image_versions2 && 
                         post.image_versions2.candidates && 
                         post.image_versions2.candidates.length > 0) {
                // Single image
                const images = post.image_versions2.candidates;
                // Sort by width descending
                images.sort((a, b) => b.width - a.width);
                
                images.forEach((image, imageIndex) => {
                  formats.push({
                    itag: `threads_image_${imageIndex}`,
                    quality: `${image.width}x${image.height}`,
                    mimeType: 'image/jpeg',
                    url: image.url,
                    hasAudio: false,
                    hasVideo: false,
                    contentLength: 0,
                    container: 'jpeg'
                  });
                });
                
                thumbnailUrl = images[0].url;
              }
            }
            
            if (formats.length > 0) {
              break; // Successfully extracted media, no need to try other regex patterns
            }
          }
        } catch (jsonError) {
          console.error('Error parsing Threads JSON data:', jsonError);
          // Continue to next regex pattern
        }
      }
    }
    
    // Method 2: If JSON extraction failed, try to find media URLs directly in the HTML
    if (formats.length === 0) {
      // Look for video URLs
      const videoUrlRegexes = [
        /property="og:video" content="([^"]+)"/i,
        /property="og:video:secure_url" content="([^"]+)"/i,
        /video src="([^"]+)"/i,
        /https:\/\/[^"']+\.cdninstagram\.com\/[^"']+\.mp4/g
      ];
      
      for (const regex of videoUrlRegexes) {
        const matches = html.match(regex);
        if (matches) {
          const videoUrls = Array.isArray(matches) && matches.length > 1 
            ? matches 
            : (matches[1] ? [matches[1]] : null);
          
          if (videoUrls) {
            isVideo = true;
            videoUrls.forEach((url, index) => {
              formats.push({
                itag: `threads_video_regex_${index}`,
                quality: 'Standard',
                mimeType: 'video/mp4',
                url: url,
                hasAudio: true,
                hasVideo: true,
                contentLength: 0,
                container: 'mp4'
              });
            });
            break;
          }
        }
      }
      
      // If no videos found, look for images
      if (formats.length === 0) {
        const imageUrlRegexes = [
          /property="og:image" content="([^"]+)"/i,
          /https:\/\/[^"']+\.cdninstagram\.com\/[^"']+\.jpg/g
        ];
        
        for (const regex of imageUrlRegexes) {
          const matches = html.match(regex);
          if (matches) {
            const imageUrls = Array.isArray(matches) && matches.length > 1 
              ? matches 
              : (matches[1] ? [matches[1]] : null);
            
            if (imageUrls) {
              imageUrls.forEach((url, index) => {
                formats.push({
                  itag: `threads_image_regex_${index}`,
                  quality: 'Standard',
                  mimeType: 'image/jpeg',
                  url: url,
                  hasAudio: false,
                  hasVideo: false,
                  contentLength: 0,
                  container: 'jpeg'
                });
              });
              
              // Use first image as thumbnail
              thumbnailUrl = imageUrls[0];
              break;
            }
          }
        }
      }
      
      // Try to extract title if we didn't get it from JSON
      if (title === 'Threads Post') {
        const titleRegexes = [
          /<meta property="og:title" content="([^"]+)"/i,
          /<title>([^<]+)<\/title>/i
        ];
        
        for (const regex of titleRegexes) {
          const match = html.match(regex);
          if (match && match[1]) {
            title = match[1].replace(' on Threads', '').trim();
            break;
          }
        }
      }
    }
    
    // If we found any media formats, return them
    if (formats.length > 0) {
      // Remove duplicates by URL
      const uniqueFormats = [];
      const seenUrls = new Set();
      
      for (const format of formats) {
        if (!seenUrls.has(format.url)) {
          seenUrls.add(format.url);
          uniqueFormats.push(format);
        }
      }
      
      return res.json({
        title: title,
        thumbnails: thumbnailUrl ? [{ url: thumbnailUrl, width: 640, height: 640 }] : [],
        formats: uniqueFormats,
        platform: 'threads',
        mediaType: isVideo ? 'video' : 'image',
        uploader: userName || null,
        directUrl: `/api/direct?url=${encodeURIComponent(uniqueFormats[0].url)}`
      });
    }
    
    // If all methods failed
    return res.status(404).json({
      error: 'Could not extract Threads media',
      details: 'The post might be text-only, private, or Threads has changed their API'
    });
  } catch (error) {
    console.error('Threads error:', error);
    return res.status(500).json({ 
      error: 'Threads processing failed', 
      details: error.message 
    });
  }
}

// Platform-specific handlers object
const platformHandlers = {
  'youtube': handleYouTube,
  'facebook': handleFacebook,
  'instagram': handleInstagram,
  'tiktok': handleTikTok,
  'twitter': handleTwitter,
  'threads': handleThreads,
  'pinterest': handlePinterest,
  'spotify': handleSpotify,
  'soundcloud': handleSoundCloud,
  'vimeo': handleVimeo,
  'dailymotion': handleDailymotion,
  'twitch': handleTwitch,
  // Other platforms can be handled by youtube-dl in the generic handler
};

// Universal info endpoint - automatically detects platform
app.get('/api/info', async (req, res) => {
  try {
    const url = req.query.url;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const platform = detectPlatform(url);
    console.log(`Processing ${platform} URL: ${url}`);

    // Use platform-specific handler if available
    if (platformHandlers[platform]) {
      return await platformHandlers[platform](url, res);
    }
    
    // For platforms without specific handlers, use youtube-dl
    try {
      // Use youtube-dl for all other platforms
      const info = await youtubeDl(url, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        preferFreeFormats: true,
        addHeader: ['referer:' + new URL(url).origin, 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.82 Safari/537.36']
      });

      // Transform formats to match our API structure
      const formats = info.formats
        .filter(format => format !== null) // Filter out null formats
        .map(format => {
          const isVideo = format.vcodec !== 'none';
          const isAudio = format.acodec !== 'none';

          // Define quality label
          let qualityLabel = format.format_note || format.quality || 'Unknown';
          if (format.height) {
            qualityLabel = `${format.height}p`;
            if (format.fps) qualityLabel += ` ${format.fps}fps`;
          }

          // Define content type based on format
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

      // Return video info and available formats
      return res.json({
        title: info.title || `${platform}_media_${Date.now()}`,
        thumbnails: info.thumbnails ? info.thumbnails.map(t => ({ url: t.url, width: t.width, height: t.height })) : [],
        duration: info.duration,
        formats: formats,
        platform: platform,
        mediaType: getMediaType(platform),
        uploader: info.uploader || info.channel || null,
        uploadDate: info.upload_date || null,
        description: info.description || null
      });
    } catch (ytdlError) {
      console.error('youtube-dl error:', ytdlError);

      // Fallback response for platforms youtube-dl can't handle
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
        description: null
      });
    }
  } catch (error) {
    console.error('Error in /api/info:', error);
    return res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Platform-specific endpoints (kept for backward compatibility)
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

app.get('/api/facebook', async (req, res) => {
  try {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    return await handleFacebook(url, res);
  } catch (error) {
    console.error('Error in /api/facebook:', error);
    return res.status(500).json({ error: 'Facebook processing failed', details: error.message });
  }
});

app.get('/api/instagram', async (req, res) => {
  try {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    return await handleInstagram(url, res);
  } catch (error) {
    console.error('Error in /api/instagram:', error);
    return res.status(500).json({ error: 'Instagram processing failed', details: error.message });
  }
});

app.get('/api/tiktok', async (req, res) => {
  try {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    return await handleTikTok(url, res);
  } catch (error) {
    console.error('Error in /api/tiktok:', error);
    return res.status(500).json({ error: 'TikTok processing failed', details: error.message });
  }
});

app.get('/api/twitter', async (req, res) => {
  try {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    return await handleTwitter(url, res);
  } catch (error) {
    console.error('Error in /api/twitter:', error);
    return res.status(500).json({ error: 'Twitter processing failed', details: error.message });
  }
});

app.get('/api/pinterest', async (req, res) => {
  try {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    return await handlePinterest(url, res);
  } catch (error) {
    console.error('Error in /api/pinterest:', error);
    return res.status(500).json({ error: 'Pinterest processing failed', details: error.message });
  }
});

// Enhanced download endpoint with retries and fallbacks
app.get('/api/download', async (req, res) => {
  try {
    const { url, itag } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`Processing download - URL: ${url}, format: ${itag || 'best'}`);

    // Generate a unique filename
    const uniqueId = Date.now();
    const tempFilePath = path.join(TEMP_DIR, `download-${uniqueId}.mp4`);

    // Download options
    const options = {
      output: tempFilePath,
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true,
      addHeader: ['referer:' + new URL(url).origin, 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.82 Safari/537.36']
    };

    // If format is specified, use it
    if (itag && itag !== 'best') {
      options.format = itag;
    }

    // Multiple download attempts
    let downloadSuccess = false;
    let errorMessages = [];

    // Try youtube-dl first
    try {
      await youtubeDl(url, options);
      downloadSuccess = fs.existsSync(tempFilePath);
    } catch (ytdlErr) {
      errorMessages.push(`youtube-dl download error: ${ytdlErr.message}`);
      console.error('youtube-dl download error:', ytdlErr);
    }

    // If youtube-dl fails and it's a YouTube URL, try ytdl-core
    if (!downloadSuccess && url.toLowerCase().includes('youtube.com') || url.toLowerCase().includes('youtu.be')) {
      try {
        console.log('Trying ytdl-core as fallback...');
        const ytStream = ytdl(url, { 
          quality: itag !== 'best' ? itag : 'highest',
          filter: itag === 'audio' ? 'audioonly' : 'audioandvideo'
        });
        
        const fileStream = fs.createWriteStream(tempFilePath);
        
        await new Promise((resolve, reject) => {
          ytStream.pipe(fileStream);
          ytStream.on('error', reject);
          fileStream.on('finish', resolve);
        });
        
        downloadSuccess = fs.existsSync(tempFilePath);
      } catch (ytdlCoreErr) {
        errorMessages.push(`ytdl-core download error: ${ytdlCoreErr.message}`);
        console.error('ytdl-core download error:', ytdlCoreErr);
      }
    }

    // If both fail, try direct fetch approach
    if (!downloadSuccess) {
      try {
        console.log('Attempting direct download as fallback...');
        
        // First check if the URL is valid and accessible
        const headRes = await axios.head(url, {
          headers: getRandomHeaders(url),
          maxRedirects: 5,
          validateStatus: status => status < 400
        });
        
        // If HEAD request is successful, proceed with GET request
        const response = await axios({
          method: 'get',
          url: url,
          responseType: 'stream',
          headers: getRandomHeaders(url),
          maxRedirects: 5
        });
        
        // Create file stream and pipe response to it
        const fileStream = fs.createWriteStream(tempFilePath);
        response.data.pipe(fileStream);
        
        await new Promise((resolve, reject) => {
          fileStream.on('finish', resolve);
          fileStream.on('error', reject);
          response.data.on('error', reject);
        });
        
        downloadSuccess = fs.existsSync(tempFilePath);
      } catch (directErr) {
        errorMessages.push(`Direct download error: ${directErr.message}`);
        console.error('Direct download error:', directErr);
      }
    }

    // Check if any download method succeeded
    if (!downloadSuccess || !fs.existsSync(tempFilePath)) {
      throw new Error(`All download methods failed: ${errorMessages.join(', ')}`);
    }

    // Get file info
    const stat = fs.statSync(tempFilePath);
    if (stat.size === 0) {
      fs.unlinkSync(tempFilePath);
      throw new Error('Download failed - empty file created');
    }

    // Determine content type based on file extension
    let contentType = 'application/octet-stream';
    if (tempFilePath.endsWith('.mp4')) contentType = 'video/mp4';
    else if (tempFilePath.endsWith('.mp3')) contentType = 'audio/mpeg';
    else if (tempFilePath.endsWith('.webm')) contentType = 'video/webm';

    // Set headers for download
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="download.${path.extname(tempFilePath).substring(1)}"`);

    // Stream the file and delete after sending
    const fileStream = fs.createReadStream(tempFilePath);
    fileStream.pipe(res);

    fileStream.on('end', () => {
      // Delete the temporary file
      fs.unlink(tempFilePath, (err) => {
        if (err) console.error('Error deleting temp file:', err);
      });
    });
  } catch (error) {
    console.error('Download error:', error);
    return res.status(500).json({ 
      error: 'Download failed', 
      details: error.message,
      solutions: [
        'Try a different format or quality',
        'Try the direct download option',
        'Some platforms restrict downloads, try accessing from a different location'
      ]
    });
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

    // Generate a unique filename
    const uniqueId = Date.now();
    const tempFilePath = path.join(TEMP_DIR, `audio-${uniqueId}.mp3`);

    // Download options specific for audio
    const options = {
      output: tempFilePath,
      extractAudio: true,
      audioFormat: 'mp3',
      audioQuality: 0, // Best quality
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true,
      addHeader: ['referer:' + new URL(url).origin, 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.82 Safari/537.36']
    };

    // If format is specified, use it
    if (itag && itag !== 'best') {
      options.format = itag;
    } else {
      options.formatSort = 'bestaudio';
    }

    // Multiple download attempts
    let downloadSuccess = false;
    let errorMessages = [];

    // Try youtube-dl first
    try {
      await youtubeDl(url, options);
      downloadSuccess = fs.existsSync(tempFilePath);
    } catch (ytdlErr) {
      errorMessages.push(`youtube-dl audio download error: ${ytdlErr.message}`);
      console.error('youtube-dl audio download error:', ytdlErr);
      
      // Try a more specific audio format
      try {
        options.format = 'bestaudio/best';
        await youtubeDl(url, options);
        downloadSuccess = fs.existsSync(tempFilePath);
      } catch (retryErr) {
        errorMessages.push(`youtube-dl retry error: ${retryErr.message}`);
      }
    }

    // If youtube-dl fails and it's a YouTube URL, try ytdl-core
    if (!downloadSuccess && (url.toLowerCase().includes('youtube.com') || url.toLowerCase().includes('youtu.be'))) {
      try {
        console.log('Trying ytdl-core as audio fallback...');
        
        // Create a temporary video file first
        const tempVideoPath = path.join(TEMP_DIR, `temp-video-${uniqueId}.mp4`);
        
        const ytStream = ytdl(url, { 
          quality: 'highestaudio',
          filter: 'audioonly'
        });
        
        const fileStream = fs.createWriteStream(tempVideoPath);
        
        await new Promise((resolve, reject) => {
          ytStream.pipe(fileStream);
          ytStream.on('error', reject);
          fileStream.on('finish', resolve);
        });
        
        // Convert to MP3 using ffmpeg if available
        if (fs.existsSync(tempVideoPath)) {
          // Check if ffmpeg is available
          try {
            await new Promise((resolve, reject) => {
              exec('ffmpeg -version', (error) => {
                if (error) {
                  reject(new Error('ffmpeg not available'));
                } else {
                  resolve();
                }
              });
            });
            
            // Convert to MP3
            await new Promise((resolve, reject) => {
              exec(`ffmpeg -i "${tempVideoPath}" -vn -ab 128k -ar 44100 -f mp3 "${tempFilePath}"`, (error) => {
                if (error) {
                  reject(error);
                } else {
                  resolve();
                }
              });
            });
            
            // Remove temporary video file
            fs.unlinkSync(tempVideoPath);
            
            downloadSuccess = fs.existsSync(tempFilePath);
          } catch (ffmpegErr) {
            console.error('ffmpeg error:', ffmpegErr.message);
            
            // If ffmpeg fails or is not available, just use the audio file as is
            fs.copyFileSync(tempVideoPath, tempFilePath);
            fs.unlinkSync(tempVideoPath);
            
            downloadSuccess = fs.existsSync(tempFilePath);
          }
        }
      } catch (ytdlCoreErr) {
        errorMessages.push(`ytdl-core audio download error: ${ytdlCoreErr.message}`);
        console.error('ytdl-core audio download error:', ytdlCoreErr);
      }
    }

    // If still no success, try direct URL
    if (!downloadSuccess) {
      try {
        console.log('Attempting direct audio download as fallback...');
        
        const response = await axios({
          method: 'get',
          url: url,
          responseType: 'stream',
          headers: getRandomHeaders(url)
        });
        
        const fileStream = fs.createWriteStream(tempFilePath);
        response.data.pipe(fileStream);
        
        await new Promise((resolve, reject) => {
          fileStream.on('finish', resolve);
          fileStream.on('error', reject);
        });
        
        downloadSuccess = fs.existsSync(tempFilePath);
      } catch (directErr) {
        errorMessages.push(`Direct audio download error: ${directErr.message}`);
        console.error('Direct audio download error:', directErr);
      }
    }

    // Check if any download method succeeded
    if (!downloadSuccess || !fs.existsSync(tempFilePath)) {
      throw new Error(`All audio download methods failed: ${errorMessages.join(', ')}`);
    }

    // Get file info
    const stat = fs.statSync(tempFilePath);
    if (stat.size === 0) {
      fs.unlinkSync(tempFilePath);
      throw new Error('Audio download failed - empty file created');
    }

    // Set headers for download
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', `attachment; filename="audio.mp3"`);

    // Stream the file and delete after sending
    const fileStream = fs.createReadStream(tempFilePath);
    fileStream.pipe(res);

    fileStream.on('end', () => {
      // Delete the temporary file
      fs.unlink(tempFilePath, (err) => {
        if (err) console.error('Error deleting temp audio file:', err);
      });
    });
  } catch (error) {
    console.error('Audio download error:', error);
    return res.status(500).json({ 
      error: 'Audio download failed', 
      details: error.message 
    });
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

    // Prepare headers with a rotation of user agents to avoid blocking
    const headers = getRandomHeaders(url);

    // Try to determine content type first with HEAD request
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
