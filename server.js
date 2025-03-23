// server.js - Complete solution with improved platform support
import express from 'express';
import cors from 'cors';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Only use youtube-dl as a fallback
import youtubeDl from 'youtube-dl-exec';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import https from 'https';
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';

// For Instagram
import instagramGetUrl from 'instagram-url-direct';
// For Facebook
const fbDownloader = require('fb-downloader');
// Import the specialized YouTube handler
import { extractYouTubeMedia } from './youtube-handler.js';

const app = express();
const PORT = process.env.PORT || 5000;

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create a temporary directory for downloads
const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR);
}

// Clean temp directory on startup
fs.readdir(TEMP_DIR, (err, files) => {
  if (err) return console.error('Error reading temp directory:', err);
  
  for (const file of files) {
    fs.unlink(path.join(TEMP_DIR, file), err => {
      if (err) console.error('Error deleting temp file:', err);
    });
  }
});

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

// Get a rotating user agent
function getRandomUserAgent() {
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/109.0',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1'
  ];
  
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

// Configure fetch timeouts
const fetchWithTimeout = async (url, options = {}) => {
  const { timeout = 30000, ...fetchOptions } = options;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
};

// Instagram-specific endpoint with improved handling
app.get('/api/instagram', async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`Processing Instagram URL: ${url}`);

    // Try using instagram-url-direct first
    try {
      const igResult = await instagramGetUrl(url);
      
      if (igResult && (igResult.url_list.length > 0 || igResult.url_video.length > 0)) {
        // Process results
        let mediaUrls = [];
        
        // Add video URLs
        if (igResult.url_video && igResult.url_video.length > 0) {
          mediaUrls = [...mediaUrls, ...igResult.url_video.map(url => ({
            url: url,
            type: 'video'
          }))];
        }
        
        // Add image URLs
        if (igResult.url_list && igResult.url_list.length > 0) {
          mediaUrls = [...mediaUrls, ...igResult.url_list.map(url => ({
            url: url,
            type: 'image'
          }))];
        }
        
        // Create format objects
        const formats = mediaUrls.map((media, index) => {
          const isVideo = media.type === 'video';
          
          return {
            itag: `ig_${index}`,
            quality: isVideo ? 'HD' : 'Original',
            mimeType: isVideo ? 'video/mp4' : 'image/jpeg',
            url: media.url,
            hasAudio: isVideo,
            hasVideo: isVideo,
            contentLength: 0,
            container: isVideo ? 'mp4' : 'jpg'
          };
        });
        
        // Determine primary media type (video or image)
        const hasVideo = formats.some(f => f.hasVideo);
        const mediaType = hasVideo ? 'video' : 'image';
        
        // Get best format for direct URL
        const bestFormat = formats.find(f => f.hasVideo === hasVideo) || formats[0];
        const directDownloadUrl = `/api/direct?url=${encodeURIComponent(bestFormat.url)}`;
        
        // Return the post info
        return res.json({
          title: 'Instagram Post',
          thumbnails: [{ 
            url: formats[0].url, 
            width: 640, 
            height: 640 
          }],
          formats: formats,
          platform: 'instagram',
          mediaType: mediaType,
          directUrl: directDownloadUrl
        });
      }
    } catch (igError) {
      console.error('Instagram-url-direct error:', igError);
    }
    
    // Try youtube-dl as a fallback
    try {
      console.log('Using youtube-dl fallback for Instagram');
      
      const info = await youtubeDl(url, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        addHeader: [
          'referer:instagram.com', 
          `user-agent:${getRandomUserAgent()}`
        ]
      });
      
      if (!info || !info.formats || info.formats.length === 0) {
        throw new Error('Could not extract video information');
      }
      
      // Transform formats to match our API structure
      const formats = info.formats.map(format => {
        const isVideo = format.vcodec !== 'none';
        const isAudio = format.acodec !== 'none';
        
        return {
          itag: format.format_id,
          quality: format.format_note || format.quality || 'Unknown',
          mimeType: isVideo ? 'video/mp4' : 'image/jpeg',
          url: format.url,
          hasAudio: isAudio,
          hasVideo: isVideo,
          contentLength: format.filesize || format.filesize_approx || 0,
          container: format.ext || null
        };
      });
      
      // Return the info
      return res.json({
        title: info.title || 'Instagram Media',
        thumbnails: info.thumbnails ? [info.thumbnails[0]] : [],
        formats: formats,
        platform: 'instagram',
        mediaType: info.formats.some(f => f.vcodec !== 'none') ? 'video' : 'image',
        directUrl: `/api/direct?url=${encodeURIComponent(formats[0].url)}`
      });
    } catch (ytdlError) {
      console.error('Instagram youtube-dl fallback error:', ytdlError);
      
      // Last resort fallback - direct link
      return res.json({
        title: 'Instagram Media',
        thumbnails: [{ url: 'https://via.placeholder.com/640x640.png?text=Instagram', width: 640, height: 640 }],
        formats: [{
          itag: 'direct',
          quality: 'Original',
          mimeType: 'unknown',
          url: url,
          hasAudio: true,
          hasVideo: true,
          contentLength: 0,
          container: 'unknown'
        }],
        platform: 'instagram',
        mediaType: 'unknown',
        directUrl: url
      });
    }
  } catch (error) {
    console.error('Instagram error:', error);
    res.status(500).json({ error: 'Instagram processing failed', details: error.message });
  }
});

// Pinterest improved endpoint that doesn't rely on external tools
app.get('/api/pinterest', async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`Processing Pinterest URL: ${url}`);

    // Use direct extraction - no external binaries required
    try {
      // User agent for Pinterest requests
      const userAgent = getRandomUserAgent();

      // First, get the actual page to find image data
      const response = await fetchWithTimeout(url, {
        headers: {
          'User-Agent': userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
        },
        timeout: 20000
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch Pinterest page: ${response.status} ${response.statusText}`);
      }

      const html = await response.text();

      // Extract title
      let title = 'Pinterest Image';
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        title = titleMatch[1].replace(' | Pinterest', '').trim();
      }

      // Find image URLs directly in the HTML
      let imageUrls = [];

      // Look for high-res originals first
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

      // Extract from JSON data
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

      // Look for specialized Pinterest schema data
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

      // Extract from og:image meta tags
      if (imageUrls.length === 0) {
        const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
        if (ogImageMatch && ogImageMatch[1]) {
          imageUrls.push(ogImageMatch[1]);
        }
      }
      
      // Look for videos too
      let videoUrls = [];
      
      // Look for video sources in the HTML
      const videoSources = html.match(/<source[^>]*src="([^"]+\.mp4[^"]*)"[^>]*>/gi);
      if (videoSources && videoSources.length > 0) {
        for (const sourceTag of videoSources) {
          const srcMatch = sourceTag.match(/src="([^"]+\.mp4[^"]*)"/i);
          if (srcMatch && srcMatch[1]) {
            videoUrls.push(srcMatch[1]);
          }
        }
      }
      
      // Look for video tags
      const videoTags = html.match(/<video[^>]*src="([^"]+\.mp4[^"]*)"[^>]*>/gi);
      if (videoTags && videoTags.length > 0) {
        for (const videoTag of videoTags) {
          const srcMatch = videoTag.match(/src="([^"]+\.mp4[^"]*)"/i);
          if (srcMatch && srcMatch[1]) {
            videoUrls.push(srcMatch[1]);
          }
        }
      }
      
      // Look for og:video
      const ogVideoMatch = html.match(/<meta property="og:video" content="([^"]+)"/i);
      if (ogVideoMatch && ogVideoMatch[1]) {
        videoUrls.push(ogVideoMatch[1]);
      }
      
      // Look for video URLs in the HTML content
      const contentVideoUrls = html.match(/https:\/\/v\.pinimg\.com\/[a-zA-Z0-9\/\._-]+\.mp4/gi);
      if (contentVideoUrls && contentVideoUrls.length > 0) {
        videoUrls = [...videoUrls, ...contentVideoUrls];
      }
      
      // Combined media URLs
      let mediaUrls = [];
      
      // Prioritize videos if found
      if (videoUrls.length > 0) {
        // Remove duplicates
        videoUrls = [...new Set(videoUrls)].filter(url =>
          url && url.startsWith('http')
        );
        
        mediaUrls = videoUrls.map(url => ({
          url: url,
          type: 'video'
        }));
      }
      
      // Add images if found
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
        
        const imageMedia = imageUrls.map(url => ({
          url: url,
          type: 'image'
        }));
        
        mediaUrls = [...mediaUrls, ...imageMedia];
      }

      // If no media found at all
      if (mediaUrls.length === 0) {
        throw new Error('No images or videos found on this Pinterest page');
      }

      // Create format objects for each media item
      const formats = mediaUrls.map((media, index) => {
        const isVideo = media.type === 'video';
        
        // Determine format from URL
        let format = 'jpg';
        const url = media.url.toLowerCase();
        
        if (url.endsWith('.png')) format = 'png';
        else if (url.endsWith('.gif')) format = 'gif';
        else if (url.endsWith('.webp')) format = 'webp';
        else if (url.endsWith('.mp4')) format = 'mp4';
        
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
        
        return {
          itag: `pin_${index}`,
          quality: quality,
          mimeType: isVideo ? `video/${format}` : `image/${format}`,
          url: media.url,
          hasAudio: isVideo,
          hasVideo: isVideo,
          contentLength: 0,
          container: format
        };
      });

      // Create a direct download URL for the best media
      const directDownloadUrl = `/api/direct?url=${encodeURIComponent(mediaUrls[0].url)}`;

      // Return the media info
      return res.json({
        title: title,
        thumbnails: [{ url: mediaUrls[0].url, width: 480, height: 480 }],
        formats: formats,
        platform: 'pinterest',
        mediaType: mediaUrls[0].type,
        directUrl: directDownloadUrl
      });
    } catch (error) {
      console.error('Pinterest extraction error:', error);
      
      // Last resort fallback
      res.json({
        title: 'Pinterest Media',
        thumbnails: [{ url: 'https://via.placeholder.com/480x480.png?text=Pinterest', width: 480, height: 480 }],
        formats: [{
          itag: 'direct',
          quality: 'Original',
          mimeType: 'unknown',
          url: url,
          hasAudio: false,
          hasVideo: false,
          contentLength: 0,
          container: 'unknown'
        }],
        platform: 'pinterest',
        mediaType: 'unknown',
        directUrl: url
      });
    }
  } catch (error) {
    console.error('Pinterest error:', error);
    res.status(500).json({ error: 'Pinterest processing failed', details: error.message });
  }
});

// Facebook-specific endpoint with better error handling
app.get('/api/facebook', async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`Processing Facebook URL: ${url}`);

    // Try using fb-downloader
    try {
      const fbData = await fbDownloader(url);
      
      if (fbData && (fbData.hd || fbData.sd)) {
        const formats = [];
        
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
        
        // Get direct URL for the highest quality video
        let directUrl = '';
        if (formats.length > 0) {
          // Prefer HD quality if available
          const hdFormat = formats.find(f => f.quality === 'HD');
          directUrl = `/api/direct?url=${encodeURIComponent(hdFormat ? hdFormat.url : formats[0].url)}`;
        }
        
        // Return the video info
        return res.json({
          title: fbData.title || 'Facebook Video',
          thumbnails: fbData.thumbnail ? [{ url: fbData.thumbnail, width: 480, height: 360 }] : [],
          formats: formats,
          platform: 'facebook',
          mediaType: 'video',
          directUrl: directUrl
        });
      }
    } catch (fbError) {
      console.error('Facebook-downloader error:', fbError);
    }
    
    // Try youtube-dl as fallback
    try {
      console.log('Using youtube-dl fallback for Facebook');
      
      const info = await youtubeDl(url, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        addHeader: [
          'referer:facebook.com', 
          `user-agent:${getRandomUserAgent()}`
        ]
      });
      
      if (!info || !info.formats || info.formats.length === 0) {
        throw new Error('Could not extract video information');
      }
      
      // Transform formats to match our API structure
      const formats = info.formats.map(format => {
        return {
          itag: format.format_id,
          quality: format.format_note || format.quality || 'Unknown',
          mimeType: 'video/mp4',
          url: format.url,
          hasAudio: format.acodec !== 'none',
          hasVideo: format.vcodec !== 'none',
          contentLength: format.filesize || format.filesize_approx || 0,
          container: format.ext || null
        };
      });
      
      // Return the info
      return res.json({
        title: info.title || 'Facebook Video',
        thumbnails: info.thumbnails ? [info.thumbnails[0]] : [],
        formats: formats,
        platform: 'facebook',
        mediaType: 'video',
        directUrl: `/api/direct?url=${encodeURIComponent(formats[0].url)}`
      });
    } catch (ytdlError) {
      console.error('Facebook youtube-dl fallback error:', ytdlError);
    }
    
    // Try manual extraction as a last resort
    try {
      // Function to extract video URLs from HTML
      async function extractVideoUrls(url) {
        const results = [];
        
        // Use different user agents to bypass restrictions
        const userAgents = [
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
          'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Safari/605.1.15'
        ];
        
        let html = '';
        let title = 'Facebook Video';
        let thumbnail = '';
        
        // Try different user agents
        for (const userAgent of userAgents) {
          try {
            const response = await fetchWithTimeout(url, {
              headers: {
                'User-Agent': userAgent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
              },
              timeout: 15000
            });
            
            if (!response.ok) continue;
            
            html = await response.text();
            
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
            
            if (results.length > 0) {
              break; // Stop trying user agents if we found videos
            }
          } catch (error) {
            console.error(`Error with user agent ${userAgent}:`, error);
            continue;
          }
        }
        
        return { results, title, thumbnail };
      }
      
      const { results: videoUrls, title, thumbnail } = await extractVideoUrls(url);
      
      if (videoUrls.length === 0) {
        throw new Error('No videos found on this Facebook page');
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
    } catch (manualError) {
      console.error('Facebook manual extraction error:', manualError);
    }
    
    // Last resort fallback - direct link
    res.json({
      title: 'Facebook Video',
      thumbnails: [{ url: 'https://via.placeholder.com/480x360.png?text=Facebook+Video', width: 480, height: 360 }],
      formats: [{
        itag: 'direct',
        quality: 'Original',
        mimeType: 'video/mp4',
        url: url,
        hasAudio: true,
        hasVideo: true,
        contentLength: 0,
        container: 'mp4'
      }],
      platform: 'facebook',
      mediaType: 'video',
      directUrl: url
    });
  } catch (error) {
    console.error('Facebook error:', error);
    res.status(500).json({ error: 'Facebook processing failed', details: error.message });
  }
});

// YouTube improved endpoint that uses specialized handler
app.get('/api/youtube', async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`Processing YouTube URL: ${url}`);

    // Use the specialized YouTube extractor
    try {
      // Extract video information
      const videoInfo = await extractYouTubeMedia(url);
      
      // Return the video info
      return res.json(videoInfo);
    } catch (extractionError) {
      console.error('YouTube extraction error:', extractionError);
      
      // Get video ID if possible
      let videoId = null;
      try {
        // Extract video ID from URL
        const patterns = [
          /(?:v=|\/embed\/|\/watch\?v=|\/watch\?.+&v=|youtu\.be\/|\/v\/|\/e\/|\/shorts\/)([^#&?\/\s]{11})/,
          /^[^#&?\/\s]{11}$/  // Direct video ID
        ];
        
        for (const pattern of patterns) {
          const match = url.match(pattern);
          if (match && match[1]) {
            videoId = match[1];
            break;
          }
        }
        
        // Try to extract from URL params
        if (!videoId) {
          const urlObj = new URL(url);
          videoId = urlObj.searchParams.get('v');
        }
      } catch (e) {
        // Not a valid URL or ID extraction failed
        videoId = 'unknown';
      }
      
      // Return basic information
      return res.json({
        title: `YouTube Video - ${videoId || 'unknown'}`,
        thumbnails: videoId ? [{ 
          url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, 
          width: 480, 
          height: 360 
        }] : [{ 
          url: 'https://via.placeholder.com/480x360.png?text=YouTube+Video', 
          width: 480, 
          height: 360 
        }],
        formats: [{
          itag: 'direct',
          quality: 'Original',
          mimeType: 'video/mp4',
          url: url,
          hasAudio: true,
          hasVideo: true,
          contentLength: 0,
          container: 'mp4'
        }],
        platform: 'youtube',
        mediaType: 'video',
        directUrl: url
      });
    }
  } catch (error) {
    console.error('YouTube error:', error);
    res.status(500).json({ error: 'YouTube processing failed', details: error.message });
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

    // Forward to platform-specific endpoints if available
    if (platform === 'pinterest') {
      // Use dedicated Pinterest endpoint
      const response = await fetchWithTimeout(`http://localhost:${PORT}/api/pinterest?url=${encodeURIComponent(url)}`);
      const data = await response.json();
      return res.json(data);
    }
    else if (platform === 'facebook') {
      // Use dedicated Facebook endpoint
      const response = await fetchWithTimeout(`http://localhost:${PORT}/api/facebook?url=${encodeURIComponent(url)}`);
      const data = await response.json();
      return res.json(data);
    }
    else if (platform === 'instagram') {
      // Use dedicated Instagram endpoint
      const response = await fetchWithTimeout(`http://localhost:${PORT}/api/instagram?url=${encodeURIComponent(url)}`);
      const data = await response.json();
      return res.json(data);
    }
    else if (platform === 'youtube') {
      // Use dedicated YouTube endpoint
      const response = await fetchWithTimeout(`http://localhost:${PORT}/api/youtube?url=${encodeURIComponent(url)}`);
      const data = await response.json();
      return res.json(data);
    }

    // For other platforms, use youtube-dl
    try {
      const info = await youtubeDl(url, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        preferFreeFormats: true,
        addHeader: [
          'referer:' + new URL(url).origin, 
          `user-agent:${getRandomUserAgent()}`
        ]
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
        mediaType: mediaType,
        uploader: info.uploader || info.channel || null,
        uploadDate: info.upload_date || null,
        description: info.description || null,
        directUrl: formats.length > 0 ? `/api/direct?url=${encodeURIComponent(formats[0].url)}` : null
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
        description: null,
        directUrl: url
      });
    }

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Download endpoint - improved with better handling for Pinterest and YouTube
app.get('/api/download', async (req, res) => {
  try {
    const { url, itag } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`Processing download - URL: ${url}, format: ${itag || 'best'}`);
    
    // Check if this is a Pinterest URL
    if (url.includes('pinterest.com')) {
      console.log('Pinterest URL detected, using direct download method');
      
      try {
        // Get Pinterest info first to extract the actual media URL
        const pinterestResponse = await fetchWithTimeout(`http://localhost:${PORT}/api/pinterest?url=${encodeURIComponent(url)}`);
        
        if (!pinterestResponse.ok) {
          throw new Error(`Failed to get Pinterest info: ${pinterestResponse.status}`);
        }
        
        const pinterestData = await pinterestResponse.json();
        
        // Get the best format URL
        if (!pinterestData.formats || pinterestData.formats.length === 0) {
          throw new Error('No media formats found in Pinterest response');
        }
        
        // Instead of redirecting to our own endpoint, let's redirect directly to the source file
        // This bypasses any potential issues with our download logic
        const directMediaUrl = pinterestData.formats[0].url;
        console.log(`Redirecting to Pinterest media URL: ${directMediaUrl}`);
        
        // Set the content disposition header to suggest a filename
        res.setHeader('Content-Disposition', `attachment; filename="pinterest_media${pinterestData.mediaType === 'video' ? '.mp4' : '.jpg'}"`);
        
        // Redirect to the actual media URL
        return res.redirect(directMediaUrl);
      } catch (pinterestError) {
        console.error('Pinterest direct download error:', pinterestError);
        // Use direct API as fallback
        return res.redirect(`/api/direct?url=${encodeURIComponent(url)}`);
      }
    }
    
    // For YouTube, use a simplified direct approach
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      console.log('YouTube URL detected, using direct approach');
      
      try {
        // Extract video ID from URL
        let videoId = null;
        const patterns = [
          /(?:v=|\/embed\/|\/watch\?v=|\/watch\?.+&v=|youtu\.be\/|\/v\/|\/e\/|\/shorts\/)([^#&?\/\s]{11})/,
          /^[^#&?\/\s]{11}$/  // Direct video ID
        ];
        
        for (const pattern of patterns) {
          const match = url.match(pattern);
          if (match && match[1]) {
            videoId = match[1];
            break;
          }
        }
        
        // If no video ID found, try URL parsing
        if (!videoId) {
          try {
            const urlObj = new URL(url);
            videoId = urlObj.searchParams.get('v');
          } catch (e) {
            // Not a valid URL or ID extraction failed
          }
        }
        
        if (!videoId) {
          throw new Error('Could not extract YouTube video ID');
        }
        
        // Instead of trying to download ourselves, redirect to a reliable third-party service
        // that can proxy YouTube videos without triggering bot detection.
        //
        // Create a format that will get converted to direct video URL through our direct download endpoint
        // You can replace this with any other reliable YouTube proxy/download service
        
        // First, try to get title for better filename
        let videoTitle = 'video';
        try {
          const infoResponse = await fetchWithTimeout(`http://localhost:${PORT}/api/youtube?url=${encodeURIComponent(url)}`);
          if (infoResponse.ok) {
            const videoInfo = await infoResponse.json();
            if (videoInfo && videoInfo.title) {
              videoTitle = videoInfo.title
                .replace(/[\/\\:*?"<>|]/g, '_') // Remove invalid filename chars
                .replace(/\s+/g, '_')           // Replace spaces with underscores
                .substring(0, 100);             // Limit length
            }
          }
        } catch (e) {
          console.log('Error getting video title:', e);
        }
        
        // Generate our proxy URL using the direct API
        const proxyServiceUrl = `https://api.vevioz.com/api/button/mp4/${videoId}`;
        
        // Redirect to the direct endpoint which will handle headers and downloading
        res.setHeader('Content-Disposition', `attachment; filename="${videoTitle}.mp4"`);
        return res.redirect(proxyServiceUrl);
        
      } catch (youtubeError) {
        console.error('YouTube download error:', youtubeError);
        
        // If everything fails, just redirect to the original URL
        return res.redirect(url);
      }
    }

    // For other platforms or if the specialized methods fail, use youtube-dl
    // Generate a unique filename
    const uniqueId = uuidv4();
    const tempFilePath = path.join(TEMP_DIR, `download-${uniqueId}.mp4`);

    // Download options
    const options = {
      output: tempFilePath,
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true,
      addHeader: [
        'referer:' + new URL(url).origin, 
        `user-agent:${getRandomUserAgent()}`
      ]
    };

    // If format is specified, use it
    if (itag && itag !== 'best') {
      options.format = itag;
    }

    // Download the file
    try {
      await youtubeDl(url, options);
    } catch (ytdlErr) {
      console.error('youtube-dl download error:', ytdlErr);

      // For very troublesome sites, try a direct fetch approach
      if (!fs.existsSync(tempFilePath)) {
        console.log('Attempting direct download as fallback...');
        
        const downloadResponse = await fetch(url, {
          headers: {
            'User-Agent': getRandomUserAgent(),
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

    // Check if file exists
    if (!fs.existsSync(tempFilePath)) {
      throw new Error('Download failed - file not created');
    }

    // Get file info
    const stat = fs.statSync(tempFilePath);

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
    
    // As a last resort, redirect to the direct endpoint
    if (url) {
      return res.redirect(`/api/direct?url=${encodeURIComponent(url)}`);
    } else {
      res.status(500).json({ error: 'Download failed', details: error.message });
    }
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
    const uniqueId = uuidv4();
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
      addHeader: [
        'referer:' + new URL(url).origin, 
        `user-agent:${getRandomUserAgent()}`
      ]
    };

    // If format is specified, use it
    if (itag && itag !== 'best') {
      options.format = itag;
    } else {
      options.formatSort = 'bestaudio';
    }

    // Download the file
    try {
      await youtubeDl(url, options);
    } catch (ytdlErr) {
      console.error('youtube-dl audio download error:', ytdlErr);

      // For troublesome sites, try a more specific audio format
      if (!fs.existsSync(tempFilePath)) {
        options.format = 'bestaudio/best';
        await youtubeDl(url, options);
      }
    }

    // Check if file exists
    if (!fs.existsSync(tempFilePath)) {
      throw new Error('Audio download failed - file not created');
    }

    // Get file info
    const stat = fs.statSync(tempFilePath);

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

    // Prepare headers with more browser-like headers
    const headers = {
      'User-Agent': getRandomUserAgent(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': url.includes('pinterest') ? 'https://www.pinterest.com/' : 'https://www.google.com/',
      'sec-ch-ua': '"Not/A)Brand";v="99", "Google Chrome";v="115", "Chromium";v="115"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-site': 'none',
      'sec-fetch-user': '?1',
      'upgrade-insecure-requests': '1',
      'priority': 'u=0, i'
    };

    // Instead of trying to stream the content through our server,
    // which can cause issues with certain content types and large files,
    // let's redirect directly to the source URL
    
    // First, check if the URL is accessible and get content type/disposition
    try {
      const headResponse = await fetchWithTimeout(url, {
        method: 'HEAD',
        headers,
        redirect: 'follow',
        timeout: 10000 // 10 second timeout
      });

      if (headResponse.ok) {
        // If it's accessible, redirect directly
        console.log('URL is directly accessible, redirecting...');
        
        // If we have a filename, suggest it via Content-Disposition
        if (filename) {
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        }
        
        // Redirect to the source URL
        return res.redirect(url);
      }
    } catch (headError) {
      console.log('HEAD request failed, falling back to proxy method:', headError.message);
      // Continue to proxy method
    }

    // If HEAD request fails or returns non-200, proxy the request through our server
    console.log('Using proxy method for direct download');
    
    // Determine filename if not provided
    let outputFilename = filename || 'download';

    // Try to fetch the content
    try {
      const response = await fetchWithTimeout(url, {
        headers,
        redirect: 'follow',
        timeout: 60000 // 60 second timeout for larger files
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch content: ${response.status} ${response.statusText}`);
      }

      // Get content type from response
      const contentType = response.headers.get('content-type') || 'application/octet-stream';
      
      // If no extension in filename, add it based on content type
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

      // Set response headers
      res.setHeader('Content-Type', contentType);
      
      // Set content length if available
      const contentLength = response.headers.get('content-length');
      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }
      
      // Set content disposition to force download with filename
      res.setHeader('Content-Disposition', `attachment; filename="${outputFilename}"`);

      // Pipe the response to the client
      response.body.pipe(res);
    } catch (fetchError) {
      throw new Error(`Failed to download: ${fetchError.message}`);
    }

  } catch (error) {
    console.error('Direct download error:', error);
    res.status(500).json({ 
      error: 'Direct download failed', 
      details: error.message,
      url: url // Return the original URL in case client wants to try directly
    });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Server accessible at http://localhost:${PORT}`);
  console.log(`Temporary directory: ${TEMP_DIR}`);
  console.log('Supported platforms: YouTube, Facebook, Instagram, TikTok, Twitter, Pinterest, and more');
});

// Clean up temp files on exit
process.on('exit', () => {
  try {
    const files = fs.readdirSync(TEMP_DIR);
    for (const file of files) {
      fs.unlinkSync(path.join(TEMP_DIR, file));
    }
  } catch (err) {
    console.error('Error cleaning up temp directory:', err);
  }
});
