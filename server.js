// server.js - Enhanced with specialized downloaders
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const NodeCache = require('memory-cache');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const puppeteer = require('puppeteer-core');

// Alternative downloaders for specific platforms
const { download: snapsaveDownload } = require('@bochilteam/scraper-snapsave');
const { facebook } = require('@mrnima/facebook-downloader');
const fbDownloader = require('@xaviabot/fb-downloader');
const { downloadTikTok } = require('shaon-media-downloader');
const { tikTokVideoDownloader } = require('nayan-videos-downloader');
const mediaDownloader = require('videos-downloader');
const { ytmp4, ytmp3 } = require('ytdownloader.js');
const ytFinder = require('yt-finder-nextgen');
const { ytDl } = require('tube-dl-custom-action');
const { getDownload: btchDownload } = require('btch-downloader');
const { download: imranDlMedia } = require('imran-dlmedia');
const { pinterest: rahadPinterest } = require('rahad-all-downloader');
const { twitter: xScrapper } = require('x-scrapper');

// Initialize cache with 1 hour TTL
const mediaCache = new NodeCache(3600000); // 1 hour in milliseconds

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
async function retryOperation(operation, retries = 3, delay = 1000, backoff = 2) {
  let lastError;
  
  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (error) {
      console.log(`Attempt ${i + 1} failed: ${error.message}`);
      lastError = error;
      
      // Wait before next retry with exponential backoff
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= backoff; // Exponential backoff
      }
    }
  }
  
  throw lastError;
}

// TikTok handler with multiple library approach
app.get('/api/tiktok', async (req, res) => {
  try {
    const url = req.query.url;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Check cache first
    const cacheKey = `tiktok:${url}`;
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
    
    // Multi-library approach
    // Try different TikTok downloaders one by one
    let result = null;
    
    // Method 1: shaon-media-downloader
    try {
      console.log('Trying shaon-media-downloader for TikTok...');
      const downloadData = await downloadTikTok(url);
      
      if (downloadData && downloadData.video) {
        result = {
          title: downloadData.title || `TikTok Video ${videoId}`,
          thumbnails: downloadData.thumbnail ? [{ url: downloadData.thumbnail, width: 480, height: 480 }] : [],
          formats: [{
            itag: 'tt_hd',
            quality: 'HD',
            mimeType: 'video/mp4',
            url: downloadData.video,
            hasAudio: true,
            hasVideo: true,
            contentLength: 0,
            container: 'mp4'
          }],
          platform: 'tiktok',
          mediaType: 'video',
          directUrl: `/api/direct?url=${encodeURIComponent(downloadData.video)}`
        };
      }
    } catch (err) {
      console.error('shaon-media-downloader failed:', err.message);
    }
    
    // Method 2: nayan-videos-downloader
    if (!result) {
      try {
        console.log('Trying nayan-videos-downloader for TikTok...');
        const ttData = await tikTokVideoDownloader(url);
        
        if (ttData && ttData.links && ttData.links.length > 0) {
          const videoUrl = ttData.links[0].url;
          
          result = {
            title: ttData.title || `TikTok Video ${videoId}`,
            thumbnails: ttData.thumbnail ? [{ url: ttData.thumbnail, width: 480, height: 480 }] : [],
            formats: [{
              itag: 'tt_hd',
              quality: 'HD',
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
        }
      } catch (err) {
        console.error('nayan-videos-downloader failed:', err.message);
      }
    }
    
    // Method 3: videos-downloader
    if (!result) {
      try {
        console.log('Trying videos-downloader for TikTok...');
        const response = await mediaDownloader.tiktok(url);
        
        if (response && response.success && response.data && response.data.no_watermark) {
          const videoUrl = response.data.no_watermark;
          
          result = {
            title: response.data.title || `TikTok Video ${videoId}`,
            thumbnails: response.data.cover ? [{ url: response.data.cover, width: 480, height: 480 }] : [],
            formats: [{
              itag: 'tt_nw',
              quality: 'No Watermark',
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
        }
      } catch (err) {
        console.error('videos-downloader failed:', err.message);
      }
    }
    
    // Method 4: btch-downloader
    if (!result) {
      try {
        console.log('Trying btch-downloader for TikTok...');
        const btchResult = await btchDownload('tiktok', url);
        
        if (btchResult && btchResult.status === 'success' && btchResult.result) {
          const data = btchResult.result;
          const videoUrl = data.video;
          
          result = {
            title: data.title || data.desc || `TikTok Video ${videoId}`,
            thumbnails: data.thumbnail ? [{ url: data.thumbnail, width: 480, height: 480 }] : [],
            formats: [{
              itag: 'tt_btch',
              quality: 'High',
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
        }
      } catch (err) {
        console.error('btch-downloader failed:', err.message);
      }
    }
    
    // Method 5: SnapSave approach
    if (!result) {
      try {
        console.log('Trying SnapSave for TikTok...');
        const snapSaveResult = await snapsaveDownload(url);
        
        if (snapSaveResult && snapSaveResult.length > 0) {
          const videoUrl = snapSaveResult[0].url;
          
          result = {
            title: `TikTok Video ${videoId}`,
            thumbnails: [],
            formats: [{
              itag: 'tt_snap',
              quality: 'High',
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
        }
      } catch (err) {
        console.error('SnapSave approach failed:', err.message);
      }
    }
    
    // Method 6: Fallback to puppeteer for browser-based extraction
    if (!result) {
      try {
        console.log('Trying puppeteer for TikTok...');
        
        // Try to use puppeteer-core first with chromium
        let browser;
        try {
          browser = await puppeteer.launch({
            headless: 'new',
            args: [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-dev-shm-usage',
              '--disable-accelerated-2d-canvas',
              '--disable-gpu'
            ]
          });
        } catch (puppErr) {
          console.error('Error launching puppeteer:', puppErr.message);
          throw new Error('Failed to initialize browser');
        }
        
        try {
          const page = await browser.newPage();
          
          // Set user agent
          await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1');
          
          // Navigate to TikTok page
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          
          // Wait for video element to load
          await page.waitForSelector('video', { timeout: 10000 }).catch(() => console.log('Video element not found'));
          
          // Extract video source
          const videoSrc = await page.evaluate(() => {
            const videoElem = document.querySelector('video');
            return videoElem ? videoElem.src : null;
          });
          
          // Extract title and thumbnail
          const pageData = await page.evaluate(() => {
            const titleElem = document.querySelector('h1, .tiktok-title, .video-title');
            const title = titleElem ? titleElem.innerText : '';
            
            // Look for thumbnail in meta tags
            const ogImage = document.querySelector('meta[property="og:image"]');
            const thumbnail = ogImage ? ogImage.getAttribute('content') : '';
            
            return { title, thumbnail };
          });
          
          if (videoSrc) {
            result = {
              title: pageData.title || `TikTok Video ${videoId}`,
              thumbnails: pageData.thumbnail ? [{ url: pageData.thumbnail, width: 480, height: 480 }] : [],
              formats: [{
                itag: 'tt_pup',
                quality: 'Browser Extract',
                mimeType: 'video/mp4',
                url: videoSrc,
                hasAudio: true,
                hasVideo: true,
                contentLength: 0,
                container: 'mp4'
              }],
              platform: 'tiktok',
              mediaType: 'video',
              directUrl: `/api/direct?url=${encodeURIComponent(videoSrc)}`
            };
          }
        } finally {
          await browser.close();
        }
      } catch (puppeteerErr) {
        console.error('Puppeteer approach failed:', puppeteerErr.message);
      }
    }

    // If all methods fail, return error
    if (!result) {
      return res.status(404).json({
        error: 'No videos found in this TikTok',
        details: 'All extraction methods failed. This might be a private video or require login.'
      });
    }

    // Cache the result
    mediaCache.put(cacheKey, result);

    // Return the video info
    res.json(result);

  } catch (error) {
    console.error('TikTok error:', error);
    res.status(500).json({ error: 'TikTok processing failed', details: error.message });
  }
});

// Pinterest handler with improved video support
app.get('/api/pinterest', async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Check cache first
    const cacheKey = `pinterest:${url}`;
    const cachedData = mediaCache.get(cacheKey);
    if (cachedData) {
      console.log(`Serving Pinterest data from cache for ${url}`);
      return res.json(cachedData);
    }

    console.log(`Processing Pinterest URL: ${url}`);
    
    // Method 1: Try rahad-all-downloader
    try {
      console.log('Trying rahad-all-downloader for Pinterest...');
      const pinterestData = await rahadPinterest(url);
      
      if (pinterestData && pinterestData.status === 'success' && pinterestData.data) {
        const data = pinterestData.data;
        const mediaUrl = data.url || data.video_url || data.image_url;
        const isVideo = data.video_url || data.type === 'video';
        
        if (mediaUrl) {
          const result = {
            title: data.title || data.description || 'Pinterest Media',
            thumbnails: data.thumbnail ? [{ url: data.thumbnail, width: 480, height: 480 }] : [],
            formats: [{
              itag: isVideo ? 'pin_vid' : 'pin_img',
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
          mediaCache.put(cacheKey, result);
          
          return res.json(result);
        }
      }
    } catch (err) {
      console.error('rahad-all-downloader failed:', err.message);
    }
    
    // Method 2: Try imranDlMedia
    try {
      console.log('Trying imran-dlmedia for Pinterest...');
      const imranResult = await imranDlMedia('pinterest', url);
      
      if (imranResult && imranResult.success) {
        const mediaUrl = imranResult.url || imranResult.video || imranResult.image;
        const isVideo = imranResult.video || imranResult.type === 'video';
        
        if (mediaUrl) {
          const result = {
            title: imranResult.title || 'Pinterest Media',
            thumbnails: imranResult.thumbnail ? [{ url: imranResult.thumbnail, width: 480, height: 480 }] : [],
            formats: [{
              itag: isVideo ? 'pin_imran_vid' : 'pin_imran_img',
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
          mediaCache.put(cacheKey, result);
          
          return res.json(result);
        }
      }
    } catch (err) {
      console.error('imran-dlmedia failed:', err.message);
    }
    
    // Method 3: Try using Axios with different user agents
    try {
      console.log('Trying direct extraction for Pinterest...');
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        }
      });
      
      if (response.status === 200) {
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
              itag: isVideo ? 'pin_og_vid' : 'pin_og_img',
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
          mediaCache.put(cacheKey, result);
          
          return res.json(result);
        }
      }
    } catch (err) {
      console.error('Direct extraction failed:', err.message);
    }
    
    // Method 4: Try puppeteer for browser-based extraction
    try {
      console.log('Trying puppeteer for Pinterest...');
      
      const browser = await puppeteer.launch({
        headless: 'new',
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
              itag: isVideo ? 'pin_pup_vid' : 'pin_pup_img',
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
          mediaCache.put(cacheKey, result);
          
          return res.json(result);
        }
      } finally {
        await browser.close();
      }
    } catch (puppeteerErr) {
      console.error('Puppeteer approach failed:', puppeteerErr.message);
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

// Enhanced YouTube handler with anti-rate limiting
app.get('/api/youtube', async (req, res) => {
  try {
    const url = req.query.url;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Check cache first
    const cacheKey = `youtube:${url}`;
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
    
    // Multi-library approach
    let videoInfo = null;
    
    // Method 1: ytmp4 from ytdownloader.js
    try {
      console.log('Trying ytdownloader.js for YouTube...');
      const yt = await ytmp4(url);
      
      if (yt && yt.url) {
        videoInfo = {
          title: yt.title || `YouTube Video ${videoId}`,
          thumbnails: [{ url: yt.thumb || `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`, width: 1280, height: 720 }],
          formats: [{
            itag: 'mp4',
            quality: yt.quality || 'HD',
            mimeType: 'video/mp4',
            url: yt.url,
            hasAudio: true,
            hasVideo: true,
            contentLength: 0,
            container: 'mp4'
          }],
          platform: 'youtube',
          mediaType: 'video',
          directUrl: `/api/direct?url=${encodeURIComponent(yt.url)}`
        };
      }
    } catch (err) {
      console.error('ytdownloader.js failed:', err.message);
    }
    
    // Method 2: yt-finder-nextgen
    if (!videoInfo) {
      try {
        console.log('Trying yt-finder-nextgen for YouTube...');
        const ytInfo = await ytFinder(videoId);
        
        if (ytInfo && ytInfo.link) {
          videoInfo = {
            title: ytInfo.title || `YouTube Video ${videoId}`,
            thumbnails: [{ url: ytInfo.thumbnail || `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`, width: 1280, height: 720 }],
            formats: [{
              itag: 'finder',
              quality: ytInfo.quality || 'HD',
              mimeType: 'video/mp4',
              url: ytInfo.link,
              hasAudio: true,
              hasVideo: true,
              contentLength: 0,
              container: 'mp4'
            }],
            platform: 'youtube',
            mediaType: 'video',
            directUrl: `/api/direct?url=${encodeURIComponent(ytInfo.link)}`
          };
        }
      } catch (err) {
        console.error('yt-finder-nextgen failed:', err.message);
      }
    }
    
    // Method 3: tube-dl-custom-action
    if (!videoInfo) {
      try {
        console.log('Trying tube-dl-custom-action for YouTube...');
        const ytDlResult = await ytDl(url);
        
        if (ytDlResult && ytDlResult.videoInfo && ytDlResult.videoInfo.formats) {
          const formats = ytDlResult.videoInfo.formats
            .filter(format => format.mimeType && format.url)
            .map(format => {
              return {
                itag: format.itag || 'tube',
                quality: format.qualityLabel || 'Unknown',
                mimeType: format.mimeType,
                url: format.url,
                hasAudio: format.hasAudio !== false,
                hasVideo: format.hasVideo !== false,
                contentLength: format.contentLength || 0,
                container: format.container || 'mp4'
              };
            });
          
          if (formats.length > 0) {
            // Find a complete format with both audio and video
            const bestFormat = formats.find(f => f.hasAudio && f.hasVideo) || formats[0];
            
            videoInfo = {
              title: ytDlResult.videoInfo.title || `YouTube Video ${videoId}`,
              thumbnails: ytDlResult.videoInfo.thumbnails || [{ url: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`, width: 1280, height: 720 }],
              formats: formats,
              platform: 'youtube',
              mediaType: 'video',
              directUrl: `/api/direct?url=${encodeURIComponent(bestFormat.url)}`
            };
          }
        }
      } catch (err) {
        console.error('tube-dl-custom-action failed:', err.message);
      }
    }
    
    // Method 4: btch-downloader
    if (!videoInfo) {
      try {
        console.log('Trying btch-downloader for YouTube...');
        const btchResult = await btchDownload('youtube', url);
        
        if (btchResult && btchResult.status === 'success' && btchResult.result) {
          const data = btchResult.result;
          
          if (data.url || data.video) {
            const videoUrl = data.url || data.video;
            
            videoInfo = {
              title: data.title || `YouTube Video ${videoId}`,
              thumbnails: [{ url: data.thumbnail || `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`, width: 1280, height: 720 }],
              formats: [{
                itag: 'btch',
                quality: data.quality || 'HD',
                mimeType: 'video/mp4',
                url: videoUrl,
                hasAudio: true,
                hasVideo: true,
                contentLength: 0,
                container: 'mp4'
              }],
              platform: 'youtube',
              mediaType: 'video',
              directUrl: `/api/direct?url=${encodeURIComponent(videoUrl)}`
            };
          }
        }
      } catch (err) {
        console.error('btch-downloader failed:', err.message);
      }
    }
    
    // Method 5: Try puppeteer for browser-based extraction
    if (!videoInfo) {
      try {
        console.log('Trying puppeteer for YouTube...');
        
        const browser = await puppeteer.launch({
          headless: 'new',
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
            
            return {
              title: videoDetails.title,
              author: videoDetails.author,
              thumbnails: videoDetails.thumbnail?.thumbnails,
              formats: formats
            };
          });
          
          if (videoData && videoData.formats && videoData.formats.length > 0) {
            // Find a complete format with both audio and video
            const bestFormat = videoData.formats[0];
            
            videoInfo = {
              title: videoData.title || `YouTube Video ${videoId}`,
              thumbnails: videoData.thumbnails || [{ url: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`, width: 1280, height: 720 }],
              formats: videoData.formats.map(format => {
                return {
                  itag: format.itag || 'pup',
                  quality: format.quality || 'Unknown',
                  mimeType: format.mimeType || 'video/mp4',
                  url: format.url,
                  hasAudio: format.hasAudio !== false,
                  hasVideo: format.hasVideo !== false,
                  contentLength: 0,
                  container: 'mp4'
                };
              }),
              platform: 'youtube',
              mediaType: 'video',
              uploader: videoData.author,
              directUrl: `/api/direct?url=${encodeURIComponent(bestFormat.url)}`
            };
          }
        } finally {
          await browser.close();
        }
      } catch (puppeteerErr) {
        console.error('Puppeteer approach failed:', puppeteerErr.message);
      }
    }

    // If all methods fail, create a basic response with metadata but no download URL
    if (!videoInfo) {
      videoInfo = {
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
        error: 'Unable to extract direct download URL. Video might be rate-limited or geo-restricted.'
      };
    }

    // Cache the result
    mediaCache.put(cacheKey, videoInfo);

    // Return the video info
    res.json(videoInfo);

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
    const cacheKey = `facebook:${url}`;
    const cachedData = mediaCache.get(cacheKey);
    if (cachedData) {
      console.log(`Serving Facebook data from cache for ${url}`);
      return res.json(cachedData);
    }

    console.log(`Processing Facebook URL: ${url}`);
    
    // Multi-library approach
    let result = null;
    
    // Method 1: @mrnima/facebook-downloader
    try {
      console.log('Trying @mrnima/facebook-downloader...');
      const fbData = await facebook(url);
      
      if (fbData && fbData.url) {
        result = {
          title: fbData.title || 'Facebook Video',
          thumbnails: fbData.thumbnail ? [{ url: fbData.thumbnail, width: 480, height: 360 }] : [],
          formats: [{
            itag: 'fb_nima',
            quality: 'HD',
            mimeType: 'video/mp4',
            url: fbData.url,
            hasAudio: true,
            hasVideo: true,
            contentLength: 0,
            container: 'mp4'
          }],
          platform: 'facebook',
          mediaType: 'video',
          directUrl: `/api/direct?url=${encodeURIComponent(fbData.url)}`
        };
      }
    } catch (err) {
      console.error('@mrnima/facebook-downloader failed:', err.message);
    }
    
    // Method 2: @xaviabot/fb-downloader
    if (!result) {
      try {
        console.log('Trying @xaviabot/fb-downloader...');
        const xaviaResult = await fbDownloader(url);
        
        if (xaviaResult && xaviaResult.hd) {
          result = {
            title: xaviaResult.title || 'Facebook Video',
            thumbnails: xaviaResult.thumbnail ? [{ url: xaviaResult.thumbnail, width: 480, height: 360 }] : [],
            formats: [
              {
                itag: 'fb_xavia_hd',
                quality: 'HD',
                mimeType: 'video/mp4',
                url: xaviaResult.hd,
                hasAudio: true,
                hasVideo: true,
                contentLength: 0,
                container: 'mp4'
              }
            ],
            platform: 'facebook',
            mediaType: 'video',
            directUrl: `/api/direct?url=${encodeURIComponent(xaviaResult.hd)}`
          };
          
          // Add SD version if available
          if (xaviaResult.sd) {
            result.formats.push({
              itag: 'fb_xavia_sd',
              quality: 'SD',
              mimeType: 'video/mp4',
              url: xaviaResult.sd,
              hasAudio: true,
              hasVideo: true,
              contentLength: 0,
              container: 'mp4'
            });
          }
        }
      } catch (err) {
        console.error('@xaviabot/fb-downloader failed:', err.message);
      }
    }
    
    // Method 3: SnapSave approach
    if (!result) {
      try {
        console.log('Trying SnapSave for Facebook...');
        const snapSaveResult = await snapsaveDownload(url);
        
        if (snapSaveResult && snapSaveResult.length > 0) {
          const formats = snapSaveResult.map((item, index) => {
            return {
              itag: `fb_snap_${index}`,
              quality: item.quality || 'Unknown',
              mimeType: 'video/mp4',
              url: item.url,
              hasAudio: true,
              hasVideo: true,
              contentLength: 0,
              container: 'mp4'
            };
          });
          
          const bestFormat = formats[0];
          
          result = {
            title: 'Facebook Video',
            thumbnails: [],
            formats: formats,
            platform: 'facebook',
            mediaType: 'video',
            directUrl: `/api/direct?url=${encodeURIComponent(bestFormat.url)}`
          };
        }
      } catch (err) {
        console.error('SnapSave approach failed:', err.message);
      }
    }
    
    // Method 4: btch-downloader
    if (!result) {
      try {
        console.log('Trying btch-downloader for Facebook...');
        const btchResult = await btchDownload('facebook', url);
        
        if (btchResult && btchResult.status === 'success' && btchResult.result) {
          const data = btchResult.result;
          const videoUrl = data.hd || data.sd || data.url || data.video;
          
          if (videoUrl) {
            const formats = [];
            
            if (data.hd) {
              formats.push({
                itag: 'fb_btch_hd',
                quality: 'HD',
                mimeType: 'video/mp4',
                url: data.hd,
                hasAudio: true,
                hasVideo: true,
                contentLength: 0,
                container: 'mp4'
              });
            }
            
            if (data.sd) {
              formats.push({
                itag: 'fb_btch_sd',
                quality: 'SD',
                mimeType: 'video/mp4',
                url: data.sd,
                hasAudio: true,
                hasVideo: true,
                contentLength: 0,
                container: 'mp4'
              });
            }
            
            // If no specific quality, add the main URL
            if (formats.length === 0) {
              formats.push({
                itag: 'fb_btch',
                quality: 'Standard',
                mimeType: 'video/mp4',
                url: videoUrl,
                hasAudio: true,
                hasVideo: true,
                contentLength: 0,
                container: 'mp4'
              });
            }
            
            result = {
              title: data.title || 'Facebook Video',
              thumbnails: data.thumbnail ? [{ url: data.thumbnail, width: 480, height: 360 }] : [],
              formats: formats,
              platform: 'facebook',
              mediaType: 'video',
              directUrl: `/api/direct?url=${encodeURIComponent(formats[0].url)}`
            };
          }
        }
      } catch (err) {
        console.error('btch-downloader failed:', err.message);
      }
    }
    
    // Method 5: Try puppeteer for browser-based extraction
    if (!result) {
      try {
        console.log('Trying puppeteer for Facebook...');
        
        const browser = await puppeteer.launch({
          headless: 'new',
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
          const mobileUrl = url.replace('www.facebook.com', 'm.facebook.com');
          await page.goto(mobileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          
          // Extract video information
          const videoData = await page.evaluate(() => {
            // Look for video
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
            
            return null;
          });
          
          // Get title
          const title = await page.evaluate(() => {
            return document.querySelector('meta[property="og:title"]')?.getAttribute('content') || 
                   document.querySelector('title')?.innerText || 
                   'Facebook Video';
          });
          
          if (videoData && videoData.url) {
            result = {
              title: title,
              thumbnails: videoData.thumbnail ? [{ url: videoData.thumbnail, width: 480, height: 360 }] : [],
              formats: [{
                itag: 'fb_pup',
                quality: 'Browser Extract',
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
          }
        } finally {
          await browser.close();
        }
      } catch (puppeteerErr) {
        console.error('Puppeteer approach failed:', puppeteerErr.message);
      }
    }
    
    // If all methods fail, return error
    if (!result) {
      return res.status(404).json({
        error: 'No videos found on this Facebook page',
        details: 'All extraction methods failed. This might be a private video or require login.'
      });
    }
    
    // Cache the result
    mediaCache.put(cacheKey, result);
    
    // Return the video info
    res.json(result);

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
          const ytResponse = await fetch(`http://localhost:${PORT}/api/youtube?url=${encodeURIComponent(url)}`);
          const ytData = await ytResponse.json();
          return res.json(ytData);
        } catch (error) {
          console.error('Error forwarding to YouTube API:', error);
          break;
        }
        
      case 'facebook':
        try {
          const fbResponse = await fetch(`http://localhost:${PORT}/api/facebook?url=${encodeURIComponent(url)}`);
          const fbData = await fbResponse.json();
          return res.json(fbData);
        } catch (error) {
          console.error('Error forwarding to Facebook API:', error);
          break;
        }
        
      case 'tiktok':
        try {
          const ttResponse = await fetch(`http://localhost:${PORT}/api/tiktok?url=${encodeURIComponent(url)}`);
          const ttData = await ttResponse.json();
          return res.json(ttData);
        } catch (error) {
          console.error('Error forwarding to TikTok API:', error);
          break;
        }
        
      case 'pinterest':
        try {
          const pinResponse = await fetch(`http://localhost:${PORT}/api/pinterest?url=${encodeURIComponent(url)}`);
          const pinData = await pinResponse.json();
          return res.json(pinData);
        } catch (error) {
          console.error('Error forwarding to Pinterest API:', error);
          break;
        }
        
      case 'twitter':
        try {
          // Try X Scrapper
          const twitterData = await xScrapper(url);
          if (twitterData && twitterData.videos && twitterData.videos.length > 0) {
            const formats = twitterData.videos.map((video, index) => {
              return {
                itag: `tw_${index}`,
                quality: video.quality || 'Unknown',
                mimeType: 'video/mp4',
                url: video.url,
                hasAudio: true,
                hasVideo: true,
                contentLength: 0,
                container: 'mp4'
              };
            });
            
            const result = {
              title: twitterData.text || 'Twitter Post',
              thumbnails: twitterData.image ? [{ url: twitterData.image, width: 480, height: 480 }] : [],
              formats: formats,
              platform: 'twitter',
              mediaType: 'video',
              directUrl: `/api/direct?url=${encodeURIComponent(formats[0].url)}`
            };
            
            return res.json(result);
          } else if (twitterData && twitterData.image) {
            // If no video but has image
            const result = {
              title: twitterData.text || 'Twitter Post',
              thumbnails: [{ url: twitterData.image, width: 480, height: 480 }],
              formats: [{
                itag: 'tw_img',
                quality: 'Original',
                mimeType: 'image/jpeg',
                url: twitterData.image,
                hasAudio: false,
                hasVideo: false,
                contentLength: 0,
                container: 'jpeg'
              }],
              platform: 'twitter',
              mediaType: 'image',
              directUrl: `/api/direct?url=${encodeURIComponent(twitterData.image)}`
            };
            
            return res.json(result);
          }
        } catch (error) {
          console.error('Twitter API error:', error);
          break;
        }
    }

    // Generic handling for other platforms or when specific endpoints fail
    try {
      // Try btch-downloader
      console.log('Trying btch-downloader for generic URL...');
      const btchResult = await btchDownload('all', url);
      
      if (btchResult && btchResult.status === 'success' && btchResult.result) {
        const data = btchResult.result;
        const mediaUrl = data.url || data.video || data.audio;
        
        if (mediaUrl) {
          const formats = [{
            itag: 'generic',
            quality: data.quality || 'Standard',
            mimeType: mediaType === 'audio' ? 'audio/mp3' : 'video/mp4',
            url: mediaUrl,
            hasAudio: true,
            hasVideo: mediaType === 'video',
            contentLength: 0,
            container: mediaType === 'audio' ? 'mp3' : 'mp4'
          }];
          
          const result = {
            title: data.title || `Media from ${platform}`,
            thumbnails: data.thumbnail ? [{ url: data.thumbnail, width: 480, height: 360 }] : [],
            formats: formats,
            platform: platform,
            mediaType: mediaType,
            directUrl: `/api/direct?url=${encodeURIComponent(mediaUrl)}`
          };
          
          return res.json(result);
        }
      }
    } catch (btchError) {
      console.error('btch-downloader generic approach failed:', btchError.message);
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
    
    // For YouTube
    if (platform === 'youtube') {
      try {
        // Get info first to get the right format URL
        const ytResponse = await fetch(`http://localhost:${PORT}/api/youtube?url=${encodeURIComponent(url)}`);
        const ytData = await ytResponse.json();
        
        if (ytData.formats && ytData.formats.length > 0) {
          // Find requested format or default to best
          let targetFormat = ytData.formats[0];
          if (itag) {
            const requestedFormat = ytData.formats.find(f => f.itag === itag);
            if (requestedFormat) {
              targetFormat = requestedFormat;
            }
          }
          
          // Download the file
          const videoResponse = await fetch(targetFormat.url, {
            headers: {
              'User-Agent': getRandomUserAgent()
            }
          });
          
          if (videoResponse.ok) {
            const fileStream = fs.createWriteStream(tempFilePath);
            await new Promise((resolve, reject) => {
              videoResponse.body.pipe(fileStream);
              videoResponse.body.on('error', reject);
              fileStream.on('finish', resolve);
            });
            
            downloadSuccess = true;
          }
        }
      } catch (ytError) {
        console.error('YouTube-specific download failed:', ytError.message);
      }
    }
    // For TikTok
    else if (platform === 'tiktok') {
      try {
        // Get info first to get the right format URL
        const ttResponse = await fetch(`http://localhost:${PORT}/api/tiktok?url=${encodeURIComponent(url)}`);
        const ttData = await ttResponse.json();
        
        if (ttData.formats && ttData.formats.length > 0) {
          // Find requested format or default to best
          let targetFormat = ttData.formats[0];
          if (itag) {
            const requestedFormat = ttData.formats.find(f => f.itag === itag);
            if (requestedFormat) {
              targetFormat = requestedFormat;
            }
          }
          
          // Download the file
          const videoResponse = await fetch(targetFormat.url, {
            headers: {
              'User-Agent': getRandomUserAgent()
            }
          });
          
          if (videoResponse.ok) {
            const fileStream = fs.createWriteStream(tempFilePath);
            await new Promise((resolve, reject) => {
              videoResponse.body.pipe(fileStream);
              videoResponse.body.on('error', reject);
              fileStream.on('finish', resolve);
            });
            
            downloadSuccess = true;
          }
        }
      } catch (ttError) {
        console.error('TikTok-specific download failed:', ttError.message);
      }
    }
    // For Pinterest
    else if (platform === 'pinterest') {
      try {
        // Get info first to get the right format URL
        const pinResponse = await fetch(`http://localhost:${PORT}/api/pinterest?url=${encodeURIComponent(url)}`);
        const pinData = await pinResponse.json();
        
        if (pinData.formats && pinData.formats.length > 0) {
          // Find requested format or default to best
          let targetFormat = pinData.formats[0];
          if (itag) {
            const requestedFormat = pinData.formats.find(f => f.itag === itag);
            if (requestedFormat) {
              targetFormat = requestedFormat;
            }
          }
          
          // Download the file
          const mediaResponse = await fetch(targetFormat.url, {
            headers: {
              'User-Agent': getRandomUserAgent()
            }
          });
          
          if (mediaResponse.ok) {
            const fileStream = fs.createWriteStream(tempFilePath);
            await new Promise((resolve, reject) => {
              mediaResponse.body.pipe(fileStream);
              mediaResponse.body.on('error', reject);
              fileStream.on('finish', resolve);
            });
            
            downloadSuccess = true;
          }
        }
      } catch (pinError) {
        console.error('Pinterest-specific download failed:', pinError.message);
      }
    }
    // For Facebook
    else if (platform === 'facebook') {
      try {
        // Get info first to get the right format URL
        const fbResponse = await fetch(`http://localhost:${PORT}/api/facebook?url=${encodeURIComponent(url)}`);
        const fbData = await fbResponse.json();
        
        if (fbData.formats && fbData.formats.length > 0) {
          // Find requested format or default to best
          let targetFormat = fbData.formats[0];
          if (itag) {
            const requestedFormat = fbData.formats.find(f => f.itag === itag);
            if (requestedFormat) {
              targetFormat = requestedFormat;
            }
          }
          
          // Download the file
          const videoResponse = await fetch(targetFormat.url, {
            headers: {
              'User-Agent': getRandomUserAgent()
            }
          });
          
          if (videoResponse.ok) {
            const fileStream = fs.createWriteStream(tempFilePath);
            await new Promise((resolve, reject) => {
              videoResponse.body.pipe(fileStream);
              videoResponse.body.on('error', reject);
              fileStream.on('finish', resolve);
            });
            
            downloadSuccess = true;
          }
        }
      } catch (fbError) {
        console.error('Facebook-specific download failed:', fbError.message);
      }
    }
    
    // Generic fallback if platform-specific approach failed
    if (!downloadSuccess) {
      try {
        console.log('Trying generic download approach...');
        
        // Try direct fetch with different user agents
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const response = await fetch(url, {
              headers: {
                'User-Agent': getRandomUserAgent(),
                'Referer': new URL(url).origin
              }
            });
            
            if (response.ok) {
              const fileStream = fs.createWriteStream(tempFilePath);
              await new Promise((resolve, reject) => {
                response.body.pipe(fileStream);
                response.body.on('error', reject);
                fileStream.on('finish', resolve);
              });
              
              downloadSuccess = true;
              break;
            }
          } catch (err) {
            console.error(`Direct download attempt ${attempt + 1} failed:`, err.message);
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

    const headers = {
      'User-Agent': userAgent,
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.5',
      'Referer': new URL(url).origin,
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
    };

    // Try to determine content type first with HEAD request
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

    // Try to fetch with retries and different user agents
    let response = null;
    let retries = 0;
    const maxRetries = 3;
    
    while (!response && retries < maxRetries) {
      try {
        response = await fetch(url, {
          headers: {
            'User-Agent': getRandomUserAgent(),
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.5',
            'Referer': new URL(url).origin
          },
          redirect: 'follow'
        });
        
        if (!response.ok) {
          console.log(`Attempt ${retries + 1} failed with status: ${response.status}`);
          response = null;
          throw new Error(`Failed with status: ${response.status}`);
        }
      } catch (fetchError) {
        console.error(`Fetch attempt ${retries + 1} failed:`, fetchError.message);
        retries++;
        
        if (retries < maxRetries) {
          // Wait before retry with increasing delay
          await new Promise(resolve => setTimeout(resolve, 1000 * retries));
        }
      }
    }
    
    if (!response) {
      throw new Error(`Failed to fetch content after ${maxRetries} attempts`);
    }

    // Update content type if it's available from the actual response
    contentType = response.headers.get('content-type') || contentType;

    // Set response headers
    res.setHeader('Content-Type', contentType);
    if (contentLength > 0) {
      res.setHeader('Content-Length', contentLength);
    }
    res.setHeader('Content-Disposition', `attachment; filename="${outputFilename}"`);

    // Pipe the response to the client
    response.body.pipe(res);

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
