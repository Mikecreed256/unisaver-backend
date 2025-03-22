// server.js - Simplified with reliable dependencies
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const NodeCache = require('node-cache');
const { createHash } = require('crypto');
const puppeteer = require('puppeteer-core');
const rateLimit = require('express-rate-limit');

// Initialize cache with 1 hour TTL
const mediaCache = new NodeCache({ stdTTL: 3600 });

const app = express();
const PORT = process.env.PORT || 10000;

// Create a temporary directory for downloads
const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR);
}

// Clean temp directory on startup
fs.readdir(TEMP_DIR, (err, files) => {
  if (err) {
    console.error('Error reading temp directory:', err);
    return;
  }
  
  for (const file of files) {
    fs.unlink(path.join(TEMP_DIR, file), err => {
      if (err) console.error(`Error deleting ${file}:`, err);
    });
  }
});

// Set up rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again after 15 minutes'
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(limiter);

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

// Utility: Get a random user agent
function getRandomUserAgent() {
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/94.0.4606.76 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
  ];
  
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

// Utility: Retry mechanism
async function retryOperation(operation, retries = 3, delay = 1000) {
  let lastError;
  
  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (error) {
      console.log(`Attempt ${i + 1} failed: ${error.message}`);
      lastError = error;
      
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
      }
    }
  }
  
  throw lastError;
}

// Utility: Create a cache key
function createCacheKey(url) {
  return createHash('md5').update(url).digest('hex');
}

// TikTok handler with puppeteer
app.get('/api/tiktok', async (req, res) => {
  try {
    const url = req.query.url;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Check cache first
    const cacheKey = createCacheKey(`tiktok:${url}`);
    const cachedData = mediaCache.get(cacheKey);
    if (cachedData) {
      console.log(`Serving TikTok data from cache for ${url}`);
      return res.json(cachedData);
    }

    console.log(`Processing TikTok URL: ${url}`);
    
    // Extract video ID
    let videoId = '';
    const idMatch = url.match(/video\/(\d+)/);
    if (idMatch && idMatch[1]) {
      videoId = idMatch[1];
    }
    
    // Try puppeteer for browser-based extraction
    try {
      console.log('Using puppeteer for TikTok...');
      
      // Use puppeteer-core with different executable paths for different environments
      let executablePath;
      
      if (process.platform === 'linux') {
        // Common paths on Linux/Render
        const possiblePaths = [
          '/usr/bin/chromium-browser',
          '/usr/bin/chromium',
          '/opt/google/chrome/chrome',
          '/usr/bin/google-chrome'
        ];
        
        for (const path of possiblePaths) {
          if (fs.existsSync(path)) {
            executablePath = path;
            break;
          }
        }
      } else if (process.platform === 'win32') {
        executablePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
      } else if (process.platform === 'darwin') {
        executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      }
      
      const browser = await puppeteer.launch({
        headless: 'new',
        executablePath: executablePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu'
        ]
      });
      
      try {
        const page = await browser.newPage();
        
        // Set user agent to mobile
        await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1');
        
        // Navigate to TikTok page
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        // Wait for video element to load (if possible)
        await page.waitForSelector('video', { timeout: 10000 }).catch(() => console.log('Video element not found'));
        
        // Extract video source
        const videoData = await page.evaluate(() => {
          // Try to find video source
          const videoElem = document.querySelector('video');
          const videoSrc = videoElem ? videoElem.src : null;
          
          // Extract title and thumbnail
          const titleElem = document.querySelector('h1, .tiktok-title, .video-title');
          const title = titleElem ? titleElem.innerText : '';
          
          // Look for thumbnail in meta tags
          const ogImage = document.querySelector('meta[property="og:image"]');
          const thumbnail = ogImage ? ogImage.getAttribute('content') : '';
          
          return { 
            videoSrc, 
            title, 
            thumbnail,
            // Also look for metadata in script tags
            metaJson: Array.from(document.querySelectorAll('script[type="application/json"]'))
              .map(script => script.textContent)
              .join('\n')
          };
        });
        
        // If direct video source found
        if (videoData.videoSrc) {
          const result = {
            title: videoData.title || `TikTok Video ${videoId}`,
            thumbnails: videoData.thumbnail ? [{ url: videoData.thumbnail, width: 480, height: 480 }] : [],
            formats: [{
              itag: 'tt_direct',
              quality: 'Original',
              mimeType: 'video/mp4',
              url: videoData.videoSrc,
              hasAudio: true,
              hasVideo: true,
              contentLength: 0,
              container: 'mp4'
            }],
            platform: 'tiktok',
            mediaType: 'video',
            directUrl: `/api/direct?url=${encodeURIComponent(videoData.videoSrc)}`
          };
          
          // Cache the result
          mediaCache.set(cacheKey, result);
          
          return res.json(result);
        }
        
        // Try to extract from metadata if video source not found directly
        if (videoData.metaJson) {
          // Look for video URLs in the metadata
          const metaMatches = videoData.metaJson.match(/"playAddr":"([^"]+)"/g);
          
          if (metaMatches && metaMatches.length > 0) {
            // Extract URLs and clean them
            const videoUrls = metaMatches.map(match => {
              const urlMatch = match.match(/"playAddr":"([^"]+)"/);
              return urlMatch[1].replace(/\\u002F/g, '/');
            });
            
            if (videoUrls.length > 0) {
              const result = {
                title: videoData.title || `TikTok Video ${videoId}`,
                thumbnails: videoData.thumbnail ? [{ url: videoData.thumbnail, width: 480, height: 480 }] : [],
                formats: [{
                  itag: 'tt_meta',
                  quality: 'Original',
                  mimeType: 'video/mp4',
                  url: videoUrls[0],
                  hasAudio: true,
                  hasVideo: true,
                  contentLength: 0,
                  container: 'mp4'
                }],
                platform: 'tiktok',
                mediaType: 'video',
                directUrl: `/api/direct?url=${encodeURIComponent(videoUrls[0])}`
              };
              
              // Cache the result
              mediaCache.set(cacheKey, result);
              
              return res.json(result);
            }
          }
        }
      } finally {
        await browser.close();
      }
    } catch (puppeteerErr) {
      console.error('Puppeteer approach failed:', puppeteerErr);
    }
    
    // Try direct API approach as fallback
    try {
      console.log('Trying direct API approach for TikTok...');
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5'
        }
      });
      
      if (response.status === 200 && response.data) {
        const html = response.data;
        const $ = cheerio.load(html);
        
        // Look for video in meta tags
        const ogVideoUrl = $('meta[property="og:video"]').attr('content');
        const ogVideoSecureUrl = $('meta[property="og:video:secure_url"]').attr('content');
        const videoUrl = ogVideoSecureUrl || ogVideoUrl;
        
        // Get thumbnail
        const ogImageUrl = $('meta[property="og:image"]').attr('content');
        
        // Get title
        const ogTitle = $('meta[property="og:title"]').attr('content');
        const title = ogTitle || $('title').text() || `TikTok Video ${videoId}`;
        
        if (videoUrl) {
          const result = {
            title: title,
            thumbnails: ogImageUrl ? [{ url: ogImageUrl, width: 480, height: 480 }] : [],
            formats: [{
              itag: 'tt_api',
              quality: 'Original',
              mimeType: 'video/mp4',
              url: videoUrl,
              hasAudio: true,
              hasVideo: true,
              contentLength: 0,
              container: 'mp4'
            }],
            platform: 'tiktok',
            mediaType: 'video',
            directUrl: `/api/direct?url=${encodeURIComponent(videoUrl)}`
          };
          
          // Cache the result
          mediaCache.set(cacheKey, result);
          
          return res.json(result);
        }
        
        // Look for playAddr in script tags
        const scriptContents = [];
        $('script').each(function() {
          scriptContents.push($(this).html());
        });
        
        const combined = scriptContents.join('\n');
        const videoMatches = combined.match(/"playAddr":"([^"]+)"/g);
        
        if (videoMatches && videoMatches.length > 0) {
          // Extract URLs and clean them
          const extractedUrls = videoMatches.map(match => {
            const urlMatch = match.match(/"playAddr":"([^"]+)"/);
            return urlMatch[1].replace(/\\u002F/g, '/');
          });
          
          if (extractedUrls.length > 0) {
            const result = {
              title: title,
              thumbnails: ogImageUrl ? [{ url: ogImageUrl, width: 480, height: 480 }] : [],
              formats: [{
                itag: 'tt_script',
                quality: 'Original',
                mimeType: 'video/mp4',
                url: extractedUrls[0],
                hasAudio: true,
                hasVideo: true,
                contentLength: 0,
                container: 'mp4'
              }],
              platform: 'tiktok',
              mediaType: 'video',
              directUrl: `/api/direct?url=${encodeURIComponent(extractedUrls[0])}`
            };
            
            // Cache the result
            mediaCache.set(cacheKey, result);
            
            return res.json(result);
          }
        }
      }
    } catch (directErr) {
      console.error('Direct API approach failed:', directErr);
    }

    // If all methods fail, return error
    return res.status(404).json({
      error: 'No videos found in this TikTok',
      details: 'All extraction methods failed. This might be a private video or require login.'
    });

  } catch (error) {
    console.error('TikTok error:', error);
    res.status(500).json({ error: 'TikTok processing failed', details: error.message });
  }
});

// Pinterest handler with puppeteer
app.get('/api/pinterest', async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Check cache first
    const cacheKey = createCacheKey(`pinterest:${url}`);
    const cachedData = mediaCache.get(cacheKey);
    if (cachedData) {
      console.log(`Serving Pinterest data from cache for ${url}`);
      return res.json(cachedData);
    }

    console.log(`Processing Pinterest URL: ${url}`);
    
    // Extract pin ID
    let pinId = '';
    const pinMatch = url.match(/pin\/(\d+)/);
    if (pinMatch && pinMatch[1]) {
      pinId = pinMatch[1];
    }
    
    // Try puppeteer for browser-based extraction
    try {
      console.log('Using puppeteer for Pinterest...');
      
      // Use puppeteer-core with different executable paths for different environments
      let executablePath;
      
      if (process.platform === 'linux') {
        // Common paths on Linux/Render
        const possiblePaths = [
          '/usr/bin/chromium-browser',
          '/usr/bin/chromium',
          '/opt/google/chrome/chrome',
          '/usr/bin/google-chrome'
        ];
        
        for (const path of possiblePaths) {
          if (fs.existsSync(path)) {
            executablePath = path;
            break;
          }
        }
      } else if (process.platform === 'win32') {
        executablePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
      } else if (process.platform === 'darwin') {
        executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      }
      
      const browser = await puppeteer.launch({
        headless: 'new',
        executablePath: executablePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu'
        ]
      });
      
      try {
        const page = await browser.newPage();
        
        // Set user agent
        await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1');
        
        // Navigate to Pinterest page
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        // Extract media information
        const mediaData = await page.evaluate(() => {
          // Look for video first
          const videoElem = document.querySelector('video');
          if (videoElem && videoElem.src) {
            return {
              type: 'video',
              url: videoElem.src,
              thumbnail: document.querySelector('meta[property="og:image"]')?.getAttribute('content')
            };
          }
          
          // Look for main pin image
          const mainImage = document.querySelector('[data-test-id="pin-image"], img[srcset]');
          if (mainImage) {
            return {
              type: 'image',
              url: mainImage.src,
              thumbnail: mainImage.src
            };
          }
          
          // Fallback to og:image
          const ogImage = document.querySelector('meta[property="og:image"]');
          if (ogImage) {
            return {
              type: 'image',
              url: ogImage.getAttribute('content'),
              thumbnail: ogImage.getAttribute('content')
            };
          }
          
          // Look for video URL in script tags
          const scripts = document.querySelectorAll('script');
          for (const script of scripts) {
            const content = script.textContent;
            if (content && content.includes('v.pinimg.com')) {
              const match = content.match(/https:\/\/v\.pinimg\.com\/[a-zA-Z0-9\/\._-]+\.mp4/i);
              if (match) {
                return {
                  type: 'video',
                  url: match[0],
                  thumbnail: document.querySelector('meta[property="og:image"]')?.getAttribute('content')
                };
              }
            }
          }
          
          return null;
        });
        
        // Get title
        const title = await page.evaluate(() => {
          return document.querySelector('meta[property="og:title"]')?.getAttribute('content') || 
                 document.querySelector('h1')?.innerText || 
                 'Pinterest Media';
        });
        
        if (mediaData && mediaData.url) {
          const isVideo = mediaData.type === 'video';
          
          const result = {
            title: title,
            thumbnails: mediaData.thumbnail ? [{ url: mediaData.thumbnail, width: 480, height: 480 }] : [],
            formats: [{
              itag: isVideo ? 'pin_vid' : 'pin_img',
              quality: 'Original',
              mimeType: isVideo ? 'video/mp4' : 'image/jpeg',
              url: mediaData.url,
              hasAudio: isVideo,
              hasVideo: isVideo,
              contentLength: 0,
              container: isVideo ? 'mp4' : 'jpeg'
            }],
            platform: 'pinterest',
            mediaType: isVideo ? 'video' : 'image',
            directUrl: `/api/direct?url=${encodeURIComponent(mediaData.url)}`
          };
          
          // Cache the result
          mediaCache.set(cacheKey, result);
          
          return res.json(result);
        }
      } finally {
        await browser.close();
      }
    } catch (puppeteerErr) {
      console.error('Puppeteer approach failed:', puppeteerErr);
    }
    
    // Try direct API approach as fallback
    try {
      console.log('Trying direct API approach for Pinterest...');
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5'
        }
      });
      
      if (response.status === 200 && response.data) {
        const html = response.data;
        const $ = cheerio.load(html);
        
        // Look for video first
        let videoUrl = '';
        const ogVideo = $('meta[property="og:video"]').attr('content');
        const ogVideoSecure = $('meta[property="og:video:secure_url"]').attr('content');
        
        if (ogVideoSecure) {
          videoUrl = ogVideoSecure;
        } else if (ogVideo) {
          videoUrl = ogVideo;
        }
        
        // If no metadata video, try regexp for v.pinimg.com URLs
        if (!videoUrl) {
          const videoMatch = html.match(/https:\/\/v\.pinimg\.com\/[a-zA-Z0-9\/\._-]+\.mp4/gi);
          if (videoMatch && videoMatch.length > 0) {
            videoUrl = videoMatch[0];
          }
        }
        
        // Look for image if no video
        let imageUrl = '';
        if (!videoUrl) {
          const ogImage = $('meta[property="og:image"]').attr('content');
          const ogImageSecure = $('meta[property="og:image:secure_url"]').attr('content');
          
          if (ogImageSecure) {
            imageUrl = ogImageSecure;
          } else if (ogImage) {
            imageUrl = ogImage;
          }
        }
        
        // If no metadata image, try regexp for i.pinimg.com URLs
        if (!imageUrl) {
          const imageMatch = html.match(/https:\/\/i\.pinimg\.com\/originals\/[a-zA-Z0-9\/\._-]+\.(?:jpg|jpeg|png|gif)/gi);
          if (imageMatch && imageMatch.length > 0) {
            imageUrl = imageMatch[0];
          }
        }
        
        // Get title
        let title = 'Pinterest Media';
        const ogTitle = $('meta[property="og:title"]').attr('content');
        if (ogTitle) {
          title = ogTitle;
        }
        
        const mediaUrl = videoUrl || imageUrl;
        const isVideo = !!videoUrl;
        
        if (mediaUrl) {
          const result = {
            title: title,
            thumbnails: [{ url: imageUrl || videoUrl, width: 480, height: 480 }],
            formats: [{
              itag: isVideo ? 'pin_vid_api' : 'pin_img_api',
              quality: 'Original',
              mimeType: isVideo ? 'video/mp4' : 'image/jpeg',
              url: mediaUrl,
              hasAudio: isVideo,
              hasVideo: isVideo,
              contentLength: 0,
              container: isVideo ? 'mp4' : 'jpeg'
            }],
            platform: 'pinterest',
            mediaType: isVideo ? 'video' : 'image',
            directUrl: `/api/direct?url=${encodeURIComponent(mediaUrl)}`
          };
          
          // Cache the result
          mediaCache.set(cacheKey, result);
          
          return res.json(result);
        }
      }
    } catch (directErr) {
      console.error('Direct API approach failed:', directErr);
    }

    // If all methods fail, return error
    return res.status(404).json({
      error: 'No media found on this Pinterest page',
      details: 'All extraction methods failed. This might be a private pin or require login.'
    });

  } catch (error) {
    console.error('Pinterest error:', error);
    res.status(500).json({ error: 'Pinterest processing failed', details: error.message });
  }
});

// YouTube handler with browser approach
app.get('/api/youtube', async (req, res) => {
  try {
    const url = req.query.url;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Check cache first
    const cacheKey = createCacheKey(`youtube:${url}`);
    const cachedData = mediaCache.get(cacheKey);
    if (cachedData) {
      console.log(`Serving YouTube data from cache for ${url}`);
      return res.json(cachedData);
    }

    console.log(`Processing YouTube URL: ${url}`);
    
    // Extract video ID
    let videoId = '';
    if (url.includes('youtu.be/')) {
      videoId = url.split('youtu.be/')[1].split('?')[0].split('&')[0];
    } else if (url.includes('v=')) {
      videoId = url.split('v=')[1].split('&')[0];
    }
    
    if (!videoId) {
      throw new Error('Could not extract YouTube video ID from URL');
    }
    
    // Puppeteer approach
    try {
      console.log('Using puppeteer for YouTube...');
      
      // Use puppeteer-core with different executable paths for different environments
      let executablePath;
      
      if (process.platform === 'linux') {
        // Common paths on Linux/Render
        const possiblePaths = [
          '/usr/bin/chromium-browser',
          '/usr/bin/chromium',
          '/opt/google/chrome/chrome',
          '/usr/bin/google-chrome'
        ];
        
        for (const path of possiblePaths) {
          if (fs.existsSync(path)) {
            executablePath = path;
            break;
          }
        }
      } else if (process.platform === 'win32') {
        executablePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
      } else if (process.platform === 'darwin') {
        executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      }
      
      const browser = await puppeteer.launch({
        headless: 'new',
        executablePath: executablePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu'
        ]
      });
      
      try {
        const page = await browser.newPage();
        
        // Set user agent to mobile (works better for bypassing restrictions)
        await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1');
        
        // Navigate to YouTube embed page (often works better than direct URL)
        await page.goto(`https://www.youtube.com/embed/${videoId}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        // Extract video information
        const videoData = await page.evaluate(() => {
          // Try to find player response in the page source
          const scriptElements = document.querySelectorAll('script');
          let playerResponse = null;
          
          for (const script of scriptElements) {
            const text = script.textContent;
            if (text && text.includes('var ytInitialPlayerResponse')) {
              const match = text.match(/var\s+ytInitialPlayerResponse\s*=\s*({.*?});/s);
              if (match && match[1]) {
                try {
                  playerResponse = JSON.parse(match[1]);
                  break;
                } catch (e) {
                  // Continue to next script
                }
              }
            }
          }
          
          if (!playerResponse) return null;
          
          // Extract video details
          const videoDetails = playerResponse.videoDetails;
          const streamingData = playerResponse.streamingData;
          
          if (!videoDetails || !streamingData) return null;
          
          // Get available formats
          const formats = [];
          
          if (streamingData.formats) {
            streamingData.formats.forEach(format => {
              formats.push({
                itag: format.itag,
                quality: format.qualityLabel,
                mimeType: format.mimeType,
                url: format.url,
                hasAudio: true,
                hasVideo: true
              });
            });
          }
          
          if (streamingData.adaptiveFormats) {
            streamingData.adaptiveFormats.forEach(format => {
              const isVideo = format.mimeType.includes('video/');
              const isAudio = format.mimeType.includes('audio/');
              
              formats.push({
                itag: format.itag,
                quality: format.qualityLabel || (isAudio ? 'Audio' : format.quality),
                mimeType: format.mimeType,
                url: format.url,
                hasAudio: isAudio,
                hasVideo: isVideo
              });
            });
          }
          
          // Extract thumbnails
          const thumbnails = [];
          if (videoDetails.thumbnail && videoDetails.thumbnail.thumbnails) {
            videoDetails.thumbnail.thumbnails.forEach(thumb => {
              thumbnails.push({
                url: thumb.url,
                width: thumb.width,
                height: thumb.height
              });
            });
          }
          
          return {
            title: videoDetails.title,
            description: videoDetails.shortDescription,
            author: videoDetails.author,
            thumbnails: thumbnails,
            formats: formats
          };
        });
        
        if (videoData && videoData.formats && videoData.formats.length > 0) {
          // Find a complete format with both audio and video
          const bestFormat = videoData.formats.find(format => format.hasAudio && format.hasVideo) || videoData.formats[0];
          
          const result = {
            title: videoData.title || `YouTube Video ${videoId}`,
            thumbnails: videoData.thumbnails || [{ url: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`, width: 1280, height: 720 }],
            formats: videoData.formats.map(format => {
              return {
                itag: format.itag || 'auto',
                quality: format.quality || 'Unknown',
                mimeType: format.mimeType || 'video/mp4',
                url: format.url,
                hasAudio: format.hasAudio !== false,
                hasVideo: format.hasVideo !== false,
                contentLength: 0,
                container: format.mimeType && format.mimeType.includes('mp4') ? 'mp4' : 'webm'
              };
            }),
            platform: 'youtube',
            mediaType: 'video',
            uploader: videoData.author,
            description: videoData.description,
            directUrl: `/api/direct?url=${encodeURIComponent(bestFormat.url)}`
          };
          
          // Cache the result
          mediaCache.set(cacheKey, result);
          
          return res.json(result);
        }
      } finally {
        await browser.close();
      }
    } catch (puppeteerErr) {
      console.error('Puppeteer approach failed:', puppeteerErr);
    }
    
    // Fallback to standard API (for metadata)
    try {
      console.log('Trying API approach for YouTube...');
      
      // Create a basic response with metadata but no download URL
      const result = {
        title: `YouTube Video ${videoId}`,
        thumbnails: [
          { url: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`, width: 1280, height: 720 },
          { url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, width: 480, height: 360 }
        ],
        formats: [{
          itag: 'ytembed',
          quality: 'Embed',
          mimeType: 'video/mp4',
          url: `https://www.youtube.com/watch?v=${videoId}`,
          hasAudio: true,
          hasVideo: true,
          contentLength: 0,
          container: 'mp4'
        }],
        platform: 'youtube',
        mediaType: 'video',
        note: 'This video requires direct viewing on YouTube. Click the link to view it there.'
      };
      
      // Cache the result
      mediaCache.set(cacheKey, result);
      
      return res.json(result);
    } catch (error) {
      console.error('API approach failed:', error);
      throw error;
    }

  } catch (error) {
    console.error('YouTube error:', error);
    res.status(500).json({ error: 'YouTube processing failed', details: error.message });
  }
});

// Facebook handler
app.get('/api/facebook', async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Check cache first
    const cacheKey = createCacheKey(`facebook:${url}`);
    const cachedData = mediaCache.get(cacheKey);
    if (cachedData) {
      console.log(`Serving Facebook data from cache for ${url}`);
      return res.json(cachedData);
    }

    console.log(`Processing Facebook URL: ${url}`);
    
    // Create mobile URL version (often works better for extraction)
    let mobileUrl = url;
    if (!url.includes('m.facebook.com') && url.includes('facebook.com')) {
      mobileUrl = url.replace('www.facebook.com', 'm.facebook.com')
                    .replace('facebook.com', 'm.facebook.com');
    }
    
    // Try puppeteer for browser-based extraction
    try {
      console.log('Using puppeteer for Facebook...');
      
      // Use puppeteer-core with different executable paths for different environments
      let executablePath;
      
      if (process.platform === 'linux') {
        // Common paths on Linux/Render
        const possiblePaths = [
          '/usr/bin/chromium-browser',
          '/usr/bin/chromium',
          '/opt/google/chrome/chrome',
          '/usr/bin/google-chrome'
        ];
        
        for (const path of possiblePaths) {
          if (fs.existsSync(path)) {
            executablePath = path;
            break;
          }
        }
      } else if (process.platform === 'win32') {
        executablePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
      } else if (process.platform === 'darwin') {
        executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      }
      
      const browser = await puppeteer.launch({
        headless: 'new',
        executablePath: executablePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu'
        ]
      });
      
      try {
        const page = await browser.newPage();
        
        // Set user agent to mobile (works better for Facebook)
        await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1');
        
        // Navigate to Facebook page
        await page.goto(mobileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        // Extract video information
        const videoData = await page.evaluate(() => {
          // Try to find video source
          const videoElem = document.querySelector('video');
          if (videoElem && videoElem.src) {
            return {
              url: videoElem.src,
              thumbnail: document.querySelector('meta[property="og:image"]')?.getAttribute('content')
            };
          }
          
          // Look for meta tags
          const ogVideo = document.querySelector('meta[property="og:video"]')?.getAttribute('content');
          const ogVideoUrl = document.querySelector('meta[property="og:video:url"]')?.getAttribute('content');
          const ogVideoSecureUrl = document.querySelector('meta[property="og:video:secure_url"]')?.getAttribute('content');
          
          const videoUrl = ogVideoSecureUrl || ogVideoUrl || ogVideo;
          if (videoUrl) {
            return {
              url: videoUrl,
              thumbnail: document.querySelector('meta[property="og:image"]')?.getAttribute('content')
            };
          }
          
          // Look for video URLs in script tags
          const scripts = document.querySelectorAll('script');
          for (const script of scripts) {
            const content = script.textContent;
            if (content && (content.includes('playable_url') || content.includes('video_url'))) {
              const playableUrlMatch = content.match(/"playable_url":"([^"]+)"/);
              if (playableUrlMatch && playableUrlMatch[1]) {
                return {
                  url: playableUrlMatch[1].replace(/\\/g, ''),
                  thumbnail: document.querySelector('meta[property="og:image"]')?.getAttribute('content')
                };
              }
              
              const hdUrlMatch = content.match(/"playable_url_quality_hd":"([^"]+)"/);
              if (hdUrlMatch && hdUrlMatch[1]) {
                return {
                  url: hdUrlMatch[1].replace(/\\/g, ''),
                  thumbnail: document.querySelector('meta[property="og:image"]')?.getAttribute('content'),
                  quality: 'HD'
                };
              }
              
              const videoUrlMatch = content.match(/"video_url":"([^"]+)"/);
              if (videoUrlMatch && videoUrlMatch[1]) {
                return {
                  url: videoUrlMatch[1].replace(/\\/g, ''),
                  thumbnail: document.querySelector('meta[property="og:image"]')?.getAttribute('content')
                };
              }
            }
          }
          
          return null;
        });
        
        // Get title
        const title = await page.evaluate(() => {
          return document.querySelector('meta[property="og:title"]')?.getAttribute('content') || 
                 document.querySelector('title')?.innerText || 
                 'Facebook Video';
        });
        
        if (videoData && videoData.url) {
          const result = {
            title: title,
            thumbnails: videoData.thumbnail ? [{ url: videoData.thumbnail, width: 480, height: 360 }] : [],
            formats: [{
              itag: videoData.quality === 'HD' ? 'fb_hd' : 'fb_sd',
              quality: videoData.quality || 'Standard',
              mimeType: 'video/mp4',
              url: videoData.url,
              hasAudio: true,
              hasVideo: true,
              contentLength: 0,
              container: 'mp4'
            }],
            platform: 'facebook',
            mediaType: 'video',
            directUrl: `/api/direct?url=${encodeURIComponent(videoData.url)}`
          };
          
          // Cache the result
          mediaCache.set(cacheKey, result);
          
          return res.json(result);
        }
      } finally {
        await browser.close();
      }
    } catch (puppeteerErr) {
      console.error('Puppeteer approach failed:', puppeteerErr);
    }
    
    // Try direct approach
    try {
      console.log('Trying direct approach for Facebook...');
      
      const response = await axios.get(mobileUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5'
        }
      });
      
      if (response.status === 200 && response.data) {
        const html = response.data;
        const $ = cheerio.load(html);
        
        // Look for video in meta tags
        const ogVideoUrl = $('meta[property="og:video"]').attr('content');
        const ogVideoSecureUrl = $('meta[property="og:video:secure_url"]').attr('content');
        const videoUrl = ogVideoSecureUrl || ogVideoUrl;
        
        // Get thumbnail
        const ogImageUrl = $('meta[property="og:image"]').attr('content');
        
        // Get title
        const ogTitle = $('meta[property="og:title"]').attr('content');
        const title = ogTitle || $('title').text() || 'Facebook Video';
        
        if (videoUrl) {
          const result = {
            title: title,
            thumbnails: ogImageUrl ? [{ url: ogImageUrl, width: 480, height: 360 }] : [],
            formats: [{
              itag: 'fb_og',
              quality: 'Original',
              mimeType: 'video/mp4',
              url: videoUrl,
              hasAudio: true,
              hasVideo: true,
              contentLength: 0,
              container: 'mp4'
            }],
            platform: 'facebook',
            mediaType: 'video',
            directUrl: `/api/direct?url=${encodeURIComponent(videoUrl)}`
          };
          
          // Cache the result
          mediaCache.set(cacheKey, result);
          
          return res.json(result);
        }
        
        // Look for playable_url in script tags
        const hdUrlMatch = html.match(/"playable_url_quality_hd":"([^"]+)"/);
        const sdUrlMatch = html.match(/"playable_url":"([^"]+)"/);
        
        if (hdUrlMatch && hdUrlMatch[1]) {
          const hdUrl = hdUrlMatch[1].replace(/\\/g, '');
          
          const result = {
            title: title,
            thumbnails: ogImageUrl ? [{ url: ogImageUrl, width: 480, height: 360 }] : [],
            formats: [{
              itag: 'fb_hd_direct',
              quality: 'HD',
              mimeType: 'video/mp4',
              url: hdUrl,
              hasAudio: true,
              hasVideo: true,
              contentLength: 0,
              container: 'mp4'
            }],
            platform: 'facebook',
            mediaType: 'video',
            directUrl: `/api/direct?url=${encodeURIComponent(hdUrl)}`
          };
          
          // Add SD format if available
          if (sdUrlMatch && sdUrlMatch[1]) {
            const sdUrl = sdUrlMatch[1].replace(/\\/g, '');
            
            result.formats.push({
              itag: 'fb_sd_direct',
              quality: 'SD',
              mimeType: 'video/mp4',
              url: sdUrl,
              hasAudio: true,
              hasVideo: true,
              contentLength: 0,
              container: 'mp4'
            });
          }
          
          // Cache the result
          mediaCache.set(cacheKey, result);
          
          return res.json(result);
        } else if (sdUrlMatch && sdUrlMatch[1]) {
          const sdUrl = sdUrlMatch[1].replace(/\\/g, '');
          
          const result = {
            title: title,
            thumbnails: ogImageUrl ? [{ url: ogImageUrl, width: 480, height: 360 }] : [],
            formats: [{
              itag: 'fb_sd_direct',
              quality: 'SD',
              mimeType: 'video/mp4',
              url: sdUrl,
              hasAudio: true,
              hasVideo: true,
              contentLength: 0,
              container: 'mp4'
            }],
            platform: 'facebook',
            mediaType: 'video',
            directUrl: `/api/direct?url=${encodeURIComponent(sdUrl)}`
          };
          
          // Cache the result
          mediaCache.set(cacheKey, result);
          
          return res.json(result);
        }
      }
    } catch (directErr) {
      console.error('Direct approach failed:', directErr);
    }
    
    // If all methods fail, return error
    return res.status(404).json({
      error: 'No videos found on this Facebook page',
      details: 'All extraction methods failed. This might be a private video or require login.'
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

    // Forward to platform-specific endpoints
    switch (platform) {
      case 'youtube':
        try {
          const ytResponse = await axios.get(`http://localhost:${PORT}/api/youtube?url=${encodeURIComponent(url)}`);
          return res.json(ytResponse.data);
        } catch (error) {
          console.error('Error forwarding to YouTube API:', error);
          break;
        }
        
      case 'facebook':
        try {
          const fbResponse = await axios.get(`http://localhost:${PORT}/api/facebook?url=${encodeURIComponent(url)}`);
          return res.json(fbResponse.data);
        } catch (error) {
          console.error('Error forwarding to Facebook API:', error);
          break;
        }
        
      case 'tiktok':
        try {
          const ttResponse = await axios.get(`http://localhost:${PORT}/api/tiktok?url=${encodeURIComponent(url)}`);
          return res.json(ttResponse.data);
        } catch (error) {
          console.error('Error forwarding to TikTok API:', error);
          break;
        }
        
      case 'pinterest':
        try {
          const pinResponse = await axios.get(`http://localhost:${PORT}/api/pinterest?url=${encodeURIComponent(url)}`);
          return res.json(pinResponse.data);
        } catch (error) {
          console.error('Error forwarding to Pinterest API:', error);
          break;
        }
    }

    // Generic handling for other platforms
    try {
      // Try puppeteer for generic URL
      console.log('Using puppeteer for generic URL...');
      
      // Use puppeteer-core with different executable paths for different environments
      let executablePath;
      
      if (process.platform === 'linux') {
        // Common paths on Linux/Render
        const possiblePaths = [
          '/usr/bin/chromium-browser',
          '/usr/bin/chromium',
          '/opt/google/chrome/chrome',
          '/usr/bin/google-chrome'
        ];
        
        for (const path of possiblePaths) {
          if (fs.existsSync(path)) {
            executablePath = path;
            break;
          }
        }
      } else if (process.platform === 'win32') {
        executablePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
      } else if (process.platform === 'darwin') {
        executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      }
      
      const browser = await puppeteer.launch({
        headless: 'new',
        executablePath: executablePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu'
        ]
      });
      
      try {
        const page = await browser.newPage();
        
        // Set user agent
        await page.setUserAgent(getRandomUserAgent());
        
        // Navigate to URL
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        // Extract metadata
        const metaData = await page.evaluate(() => {
          // Get title
          const title = document.querySelector('meta[property="og:title"]')?.getAttribute('content') || 
                       document.querySelector('title')?.innerText || 
                       'Media Content';
          
          // Get description
          const description = document.querySelector('meta[property="og:description"]')?.getAttribute('content') || 
                             document.querySelector('meta[name="description"]')?.getAttribute('content');
          
          // Get thumbnail
          const thumbnail = document.querySelector('meta[property="og:image"]')?.getAttribute('content') ||
                           document.querySelector('meta[property="og:image:url"]')?.getAttribute('content');
          
          // Try to find video
          const videoElem = document.querySelector('video');
          const videoUrl = videoElem?.src || 
                          document.querySelector('meta[property="og:video"]')?.getAttribute('content') ||
                          document.querySelector('meta[property="og:video:url"]')?.getAttribute('content');
          
          // Try to find audio
          const audioElem = document.querySelector('audio');
          const audioUrl = audioElem?.src || 
                          document.querySelector('meta[property="og:audio"]')?.getAttribute('content') ||
                          document.querySelector('meta[property="og:audio:url"]')?.getAttribute('content');
          
          return {
            title,
            description,
            thumbnail,
            videoUrl,
            audioUrl
          };
        });
        
        // Create a response based on what we found
        const mediaUrl = metaData.videoUrl || metaData.audioUrl || url;
        const isVideo = !!metaData.videoUrl;
        const isAudio = !!metaData.audioUrl;
        
        const result = {
          title: metaData.title || `Media from ${platform}`,
          description: metaData.description,
          thumbnails: metaData.thumbnail ? [{ url: metaData.thumbnail, width: 480, height: 360 }] : [],
          formats: [{
            itag: 'generic',
            quality: 'Original',
            mimeType: isVideo ? 'video/mp4' : (isAudio ? 'audio/mp3' : 'application/octet-stream'),
            url: mediaUrl,
            hasAudio: isAudio || isVideo,
            hasVideo: isVideo,
            contentLength: 0,
            container: isVideo ? 'mp4' : (isAudio ? 'mp3' : null)
          }],
          platform: platform,
          mediaType: mediaType,
          directUrl: `/api/direct?url=${encodeURIComponent(mediaUrl)}`
        };
        
        return res.json(result);
      } finally {
        await browser.close();
      }
    } catch (genericError) {
      console.error('Generic approach failed:', genericError);
    }

    // Final fallback - just return basic info
    const fallbackThumbnail = `https://via.placeholder.com/480x360.png?text=${encodeURIComponent(platform)}`;

    return res.json({
      title: `Media from ${platform}`,
      thumbnails: [{ url: fallbackThumbnail, width: 480, height: 360 }],
      formats: [{
        itag: 'best',
        quality: 'Best available',
        mimeType: mediaType === 'audio' ? 'audio/mp3' : 'video/mp4',
        url: url,
        hasAudio: true,
        hasVideo: mediaType === 'video',
        contentLength: 0,
        container: mediaType === 'audio' ? 'mp3' : 'mp4'
      }],
      platform: platform,
      mediaType: mediaType,
      note: 'Limited information available. Try downloading directly.'
    });

  } catch (error) {
    console.error('Info error:', error);
    res.status(500).json({ error: 'Info retrieval failed', details: error.message });
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

    // Generate a unique filename
    const uniqueId = Date.now();
    const tempFilePath = path.join(TEMP_DIR, `download-${uniqueId}.mp4`);
    
    // Determine platform
    const platform = detectPlatform(url);
    
    // Platform-specific download handling
    let downloadSuccess = false;
    
    // For YouTube, Pinterest, TikTok, and Facebook, get info first
    if (['youtube', 'pinterest', 'tiktok', 'facebook'].includes(platform)) {
      try {
        // Get info first to get the right format URL
        const infoResponse = await axios.get(`http://localhost:${PORT}/api/${platform}?url=${encodeURIComponent(url)}`);
        const info = infoResponse.data;
        
        if (info.formats && info.formats.length > 0) {
          // Find requested format or default to best
          let targetFormat = info.formats[0];
          if (itag) {
            const requestedFormat = info.formats.find(f => f.itag === itag);
            if (requestedFormat) {
              targetFormat = requestedFormat;
            }
          }
          
          // Download the file
          const mediaResponse = await axios({
            method: 'get',
            url: targetFormat.url,
            responseType: 'stream',
            headers: {
              'User-Agent': getRandomUserAgent()
            }
          });
          
          if (mediaResponse.status === 200) {
            const fileStream = fs.createWriteStream(tempFilePath);
            mediaResponse.data.pipe(fileStream);
            
            await new Promise((resolve, reject) => {
              fileStream.on('finish', resolve);
              fileStream.on('error', reject);
            });
            
            downloadSuccess = true;
          }
        }
      } catch (error) {
        console.error(`${platform}-specific download failed:`, error.message);
      }
    }
    
    // Generic fallback if platform-specific approach failed
    if (!downloadSuccess) {
      try {
        console.log('Trying generic download approach...');
        
        // Try direct axios download
        try {
          const response = await axios({
            method: 'get',
            url: url,
            responseType: 'stream',
            headers: {
              'User-Agent': getRandomUserAgent(),
              'Referer': new URL(url).origin
            }
          });
          
          if (response.status === 200) {
            const fileStream = fs.createWriteStream(tempFilePath);
            response.data.pipe(fileStream);
            
            await new Promise((resolve, reject) => {
              fileStream.on('finish', resolve);
              fileStream.on('error', reject);
            });
            
            downloadSuccess = true;
          }
        } catch (axiosError) {
          console.error('Direct axios download failed:', axiosError.message);
          
          // Try with puppeteer as a last resort
          try {
            console.log('Trying puppeteer for download...');
            
            // Use puppeteer-core with different executable paths for different environments
            let executablePath;
            
            if (process.platform === 'linux') {
              // Common paths on Linux/Render
              const possiblePaths = [
                '/usr/bin/chromium-browser',
                '/usr/bin/chromium',
                '/opt/google/chrome/chrome',
                '/usr/bin/google-chrome'
              ];
              
              for (const path of possiblePaths) {
                if (fs.existsSync(path)) {
                  executablePath = path;
                  break;
                }
              }
            } else if (process.platform === 'win32') {
              executablePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
            } else if (process.platform === 'darwin') {
              executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
            }
            
            const browser = await puppeteer.launch({
              headless: 'new',
              executablePath: executablePath,
              args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu'
              ]
            });
            
            try {
              const page = await browser.newPage();
              
              // Set user agent
              await page.setUserAgent(getRandomUserAgent());
              
              // Enable request interception
              await page.setRequestInterception(true);
              
              // Only allow the main resource and media
              page.on('request', (request) => {
                const resourceType = request.resourceType();
                if (resourceType === 'document' || resourceType === 'media') {
                  request.continue();
                } else {
                  request.abort();
                }
              });
              
              // Create a buffer to collect the data
              let contentBuffer = Buffer.from([]);
              
              // Listen for response
              page.on('response', async (response) => {
                const url = response.url();
                const resourceType = response.request().resourceType();
                
                // Check if this is media content
                if (resourceType === 'media' || 
                    resourceType === 'document' && url === request.url) {
                  try {
                    const buffer = await response.buffer();
                    contentBuffer = Buffer.concat([contentBuffer, buffer]);
                  } catch (err) {
                    console.error('Error buffering response:', err.message);
                  }
                }
              });
              
              // Navigate to URL
              await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
              
              // If we have a buffer, write it to the file
              if (contentBuffer.length > 0) {
                fs.writeFileSync(tempFilePath, contentBuffer);
                downloadSuccess = true;
              }
            } finally {
              await browser.close();
            }
          } catch (puppeteerError) {
            console.error('Puppeteer download approach failed:', puppeteerError.message);
          }
        }
      } catch (genericError) {
        console.error('Generic download approach failed:', genericError.message);
      }
    }

    // Check if file exists and has content
    if (!downloadSuccess || !fs.existsSync(tempFilePath) || fs.statSync(tempFilePath).size === 0) {
      throw new Error('Download failed after all attempts');
    }

    // Get file info
    const stat = fs.statSync(tempFilePath);

    // Determine content type based on file extension and platform
    let contentType = 'application/octet-stream';
    let extension = 'mp4';
    
    // For images from Pinterest
    if (platform === 'pinterest' && (url.includes('.jpg') || url.includes('.jpeg') || url.includes('.png'))) {
      if (url.includes('.png')) {
        contentType = 'image/png';
        extension = 'png';
      } else {
        contentType = 'image/jpeg';
        extension = 'jpg';
      }
    } else if (url.includes('.mp3')) {
      contentType = 'audio/mpeg';
      extension = 'mp3';
    } else {
      contentType = 'video/mp4';
      extension = 'mp4';
    }

    // Set headers for download
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="download.${extension}"`);

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
    res.status(500).json({ error: 'Download failed', details: error.message });
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

    // Prepare headers with random user agent
    const userAgent = getRandomUserAgent();

    // Try to get content info first
    let contentType = 'application/octet-stream';
    let contentLength = 0;

    try {
      const headResponse = await axios({
        method: 'HEAD',
        url: url,
        headers: {
          'User-Agent': userAgent,
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.5',
          'Referer': new URL(url).origin
        }
      });

      if (headResponse.status === 200) {
        contentType = headResponse.headers['content-type'] || 'application/octet-stream';
        contentLength = headResponse.headers['content-length'] || 0;
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

    // Try to fetch the content
    let retries = 0;
    const maxRetries = 3;
    
    while (retries < maxRetries) {
      try {
        const response = await axios({
          method: 'get',
          url: url,
          responseType: 'stream',
          headers: {
            'User-Agent': getRandomUserAgent(),
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.5',
            'Referer': new URL(url).origin
          }
        });
        
        // Update content type if available from the actual response
        contentType = response.headers['content-type'] || contentType;
        
        // Set response headers
        res.setHeader('Content-Type', contentType);
        if (contentLength > 0) {
          res.setHeader('Content-Length', contentLength);
        }
        res.setHeader('Content-Disposition', `attachment; filename="${outputFilename}"`);
        
        // Pipe the response to the client
        response.data.pipe(res);
        
        return; // Success, exit the function
      } catch (fetchError) {
        console.error(`Direct fetch attempt ${retries + 1} failed:`, fetchError.message);
        retries++;
        
        if (retries < maxRetries) {
          // Wait before retry with increasing delay
          await new Promise(resolve => setTimeout(resolve, 1000 * retries));
        }
      }
    }
    
    throw new Error(`Failed to fetch content after ${maxRetries} attempts`);

  } catch (error) {
    console.error('Direct download error:', error);
    res.status(500).json({ error: 'Direct download failed', details: error.message });
  }
});

// Clean up temp folder periodically
const cleanupInterval = 3600000; // 1 hour
setInterval(() => {
  console.log('Running scheduled temp directory cleanup');
  fs.readdir(TEMP_DIR, (err, files) => {
    if (err) {
      console.error('Error reading temp directory for cleanup:', err);
      return;
    }
    
    const now = Date.now();
    files.forEach(file => {
      const filePath = path.join(TEMP_DIR, file);
      fs.stat(filePath, (err, stats) => {
        if (err) {
          console.error(`Error getting stats for ${file}:`, err);
          return;
        }
        
        // Delete files older than 2 hours
        if (now - stats.mtimeMs > 7200000) {
          fs.unlink(filePath, err => {
            if (err) console.error(`Error deleting old temp file ${file}:`, err);
            else console.log(`Cleaned up old temp file: ${file}`);
          });
        }
      });
    });
  });
}, cleanupInterval);

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Server accessible at http://localhost:${PORT}`);
  console.log(`Temporary directory: ${TEMP_DIR}`);
});
