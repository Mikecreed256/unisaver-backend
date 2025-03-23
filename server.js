// server.js - Modernized solution with improved platform support
const express = require('express');
const cors = require('cors');
// Replace youtube-dl-exec with yt-dlp-exec (better maintained & more reliable)
const ytDlp = require('yt-dlp-exec');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { promisify } = require('util');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
// Add puppeteer for browser-based scraping (helps with Instagram, Pinterest, etc.)
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
// For generating unique file IDs
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 5000;

// Create a temporary directory for downloads
const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR);
}

// Make sure temp directory is emptied on startup
fs.readdir(TEMP_DIR, (err, files) => {
  if (err) return console.error('Error reading temp directory:', err);
  
  for (const file of files) {
    fs.unlink(path.join(TEMP_DIR, file), err => {
      if (err) console.error('Error deleting temp file:', err);
    });
  }
});

// Promisify fs operations
const unlinkAsync = promisify(fs.unlink);
const statAsync = promisify(fs.stat);

// Middleware
app.use(cors());
app.use(express.json());

// Increase timeout for external requests
http.globalAgent.maxSockets = 25;
https.globalAgent.maxSockets = 25;
http.globalAgent.keepAlive = true;
https.globalAgent.keepAlive = true;

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

// Instagram fallback function
async function instagramFallback(url, res) {
  try {
    // Try yt-dlp as a fallback
    console.log('Using yt-dlp fallback for Instagram');
    
    const info = await ytDlp(url, {
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true,
      addHeader: [
        'referer:instagram.com', 
        `user-agent:${getRandomUserAgent()}`
      ],
      cookies: 'instagram_cookies.txt' // Optional: create this file for persistent cookies
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
    res.json({
      title: info.title || 'Instagram Media',
      thumbnails: info.thumbnails ? [info.thumbnails[0]] : [],
      formats: formats,
      platform: 'instagram',
      mediaType: info.formats.some(f => f.vcodec !== 'none') ? 'video' : 'image',
      directUrl: `/api/direct?url=${encodeURIComponent(formats[0].url)}`
    });
  } catch (ytdlError) {
    console.error('Instagram yt-dlp fallback error:', ytdlError);
    
    // Last resort fallback - direct link
    res.json({
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
}

// Instagram-specific endpoint with improved handling
app.get('/api/instagram', async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`Processing Instagram URL: ${url}`);

    // First try with puppeteer - most reliable for Instagram
    try {
      const browser = await puppeteer.launch({ 
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
      });
      
      const page = await browser.newPage();
      
      // Setup stealth - use mobile user agent for better results with Instagram
      await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1');
      await page.setViewport({ width: 375, height: 812 }); // iPhone X dimensions
      
      // Set extra headers
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      });
      
      // Intercept requests to media files
      const mediaUrls = [];
      page.on('response', async (response) => {
        const url = response.url();
        
        // Look for media content responses
        if (response.status() === 200 && 
            (url.includes('.mp4') || url.includes('.jpg') || 
             url.includes('instagram.com/p/') || url.includes('instagram.com/reel/'))) {
          
          const contentType = response.headers()['content-type'] || '';
          
          if (contentType.includes('video') || 
              contentType.includes('image') || 
              url.endsWith('.mp4') || 
              url.endsWith('.jpg')) {
            mediaUrls.push({
              url: url,
              type: contentType.includes('video') || url.endsWith('.mp4') ? 'video' : 'image'
            });
          }
        }
      });
      
      // Navigate to Instagram
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      
      // Accept cookies if the dialog appears
      try {
        const cookieButton = await page.waitForSelector('[role="dialog"] button:nth-child(2)', { timeout: 5000 });
        if (cookieButton) {
          await cookieButton.click();
          await page.waitForTimeout(1000);
        }
      } catch (e) {
        // Cookie dialog didn't appear, continue
      }
      
      // Extract post data
      const postData = await page.evaluate(() => {
        let title = '';
        let description = '';
        
        // Try to get username
        const usernameElement = document.querySelector('a.x1i10hfl[href^="/"]');
        const username = usernameElement ? usernameElement.textContent : '';
        
        // Try to get description
        const textElements = Array.from(document.querySelectorAll('div._a9zs, div._a9zm'));
        description = textElements.length > 0 ? textElements[0].innerText : '';
        
        // Combine for title
        title = username ? `${username}'s Instagram Post` : 'Instagram Post';
        
        // Look for media elements directly in the DOM
        const mediaElements = [];
        
        // Videos
        document.querySelectorAll('video').forEach(video => {
          if (video.src) {
            mediaElements.push({
              url: video.src,
              type: 'video'
            });
          }
        });
        
        // Images
        document.querySelectorAll('img[sizes]:not([alt="Instagram"])').forEach(img => {
          if (img.src) {
            mediaElements.push({
              url: img.src,
              type: 'image'
            });
          }
        });
        
        return { 
          title, 
          description, 
          mediaElements 
        };
      });
      
      // Combine media found through network requests and DOM
      let allMedia = [...mediaUrls];
      
      if (postData.mediaElements && postData.mediaElements.length > 0) {
        allMedia = [...allMedia, ...postData.mediaElements];
      }
      
      // Remove duplicates
      const uniqueMedia = [];
      const urlSet = new Set();
      
      for (const media of allMedia) {
        if (!urlSet.has(media.url)) {
          urlSet.add(media.url);
          uniqueMedia.push(media);
        }
      }
      
      await browser.close();
      
      // If no media found, try fallback
      if (uniqueMedia.length === 0) {
        return await instagramFallback(url, res);
      }
      
      // Create format objects
      const formats = uniqueMedia.map((media, index) => {
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
      res.json({
        title: postData.title,
        description: postData.description,
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
      
    } catch (puppeteerError) {
      console.log('Puppeteer approach failed for Instagram, trying fallback:', puppeteerError.message);
      return await instagramFallback(url, res);
    }
  } catch (error) {
    console.error('Instagram error:', error);
    res.status(500).json({ error: 'Instagram processing failed', details: error.message });
  }
});

// Pinterest improved endpoint
app.get('/api/pinterest', async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`Processing Pinterest URL: ${url}`);

    // Use puppeteer for better Pinterest handling
    try {
      const browser = await puppeteer.launch({ 
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
      });
      
      const page = await browser.newPage();
      
      // Use stealth plugin to avoid detection
      await page.setUserAgent(getRandomUserAgent());
      
      // Navigate to Pinterest
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      
      // Accept cookies if dialog appears
      try {
        // Pinterest cookie consent button - adjust selector based on current Pinterest UI
        const cookieButton = await page.waitForSelector('[data-test-id="cookie-consent-button"], button.reject-cookies-button', { timeout: 5000 });
        if (cookieButton) {
          await cookieButton.click();
          await page.waitForTimeout(1000);
        }
      } catch (e) {
        // Cookie dialog didn't appear, continue
      }
      
      // Extract pin data
      const pinData = await page.evaluate(() => {
        // Function to extract largest image from srcset
        const getHighestResSrc = (srcset) => {
          if (!srcset) return null;
          
          const sources = srcset.split(',').map(src => {
            const [url, width] = src.trim().split(' ');
            return {
              url,
              width: width ? parseInt(width.replace('w', '')) : 0
            };
          });
          
          sources.sort((a, b) => b.width - a.width);
          return sources.length > 0 ? sources[0].url : null;
        };
        
        // Get title
        let title = document.querySelector('h1') ? document.querySelector('h1').innerText : '';
        if (!title) {
          title = document.title.replace(' | Pinterest', '').trim();
        }
        
        // Get description
        const description = document.querySelector('[data-test-id="pin-description"]') ? 
                           document.querySelector('[data-test-id="pin-description"]').innerText : '';
        
        // Get all images
        const images = [];
        
        // Look for Pinterest's main image - various selectors to try
        const mainImgSelectors = [
          'img[srcset][alt]:not([alt=""])',                   // Standard pins
          'div[data-test-id="pin-closeup-image"] img[srcset]', // Closeup view
          'div[data-test-id="pinrep-image"] img[srcset]',      // Pin representation
          'div[role="img"] img[srcset]',                       // Role-based selection
          'div[data-test-id="pin-CloseupMedia"] img[srcset]'   // Another closeup variant
        ];
        
        for (const selector of mainImgSelectors) {
          const imgElements = document.querySelectorAll(selector);
          
          for (const img of imgElements) {
            if (img.srcset) {
              const highResSrc = getHighestResSrc(img.srcset);
              if (highResSrc) {
                images.push({
                  url: highResSrc,
                  type: 'image'
                });
              } else if (img.src) {
                images.push({
                  url: img.src,
                  type: 'image'
                });
              }
            } else if (img.src) {
              images.push({
                url: img.src,
                type: 'image'
              });
            }
          }
          
          // If we found images with this selector, no need to try others
          if (images.length > 0) break;
        }
        
        // Look for videos
        const videos = [];
        const videoElements = document.querySelectorAll('video');
        
        for (const video of videoElements) {
          if (video.src) {
            videos.push({
              url: video.src,
              type: 'video'
            });
          }
        }
        
        // Find video in source elements
        const sourceElements = document.querySelectorAll('source');
        for (const source of sourceElements) {
          if (source.src && (source.src.includes('.mp4') || source.type?.includes('video'))) {
            videos.push({
              url: source.src,
              type: 'video'
            });
          }
        }
        
        // Also check for meta og:image and og:video
        const ogImage = document.querySelector('meta[property="og:image"]');
        const ogVideo = document.querySelector('meta[property="og:video"]');
        
        if (ogImage && ogImage.content) {
          images.push({
            url: ogImage.content,
            type: 'image'
          });
        }
        
        if (ogVideo && ogVideo.content) {
          videos.push({
            url: ogVideo.content,
            type: 'video'
          });
        }
        
        return {
          title,
          description,
          media: [...videos, ...images] // Prioritize videos
        };
      });
      
      await browser.close();
      
      // If no media found, try fallback
      if (!pinData.media || pinData.media.length === 0) {
        throw new Error('No media found in pin data');
      }
      
      // Remove duplicates
      const uniqueMedia = [];
      const urlSet = new Set();
      
      for (const media of pinData.media) {
        if (!urlSet.has(media.url)) {
          urlSet.add(media.url);
          uniqueMedia.push(media);
        }
      }
      
      // Create format objects
      const formats = uniqueMedia.map((media, index) => {
        const isVideo = media.type === 'video';
        
        // Determine format from URL
        let format = 'jpg';
        if (media.url.toLowerCase().endsWith('.png')) format = 'png';
        else if (media.url.toLowerCase().endsWith('.gif')) format = 'gif';
        else if (media.url.toLowerCase().endsWith('.webp')) format = 'webp';
        else if (media.url.toLowerCase().endsWith('.mp4')) format = 'mp4';
        
        // Try to determine quality from URL
        let quality = 'Standard';
        
        if (media.url.includes('/originals/')) {
          quality = 'Original';
        } else {
          const sizeMatch = media.url.match(/\/([0-9]+)x\//);
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
      const directDownloadUrl = `/api/direct?url=${encodeURIComponent(uniqueMedia[0].url)}`;
      
      // Return the pin info
      res.json({
        title: pinData.title || 'Pinterest Media',
        description: pinData.description,
        thumbnails: [{ url: uniqueMedia[0].url, width: 480, height: 480 }],
        formats: formats,
        platform: 'pinterest',
        mediaType: uniqueMedia[0].type,
        directUrl: directDownloadUrl
      });
      
    } catch (puppeteerError) {
      console.error('Pinterest puppeteer error:', puppeteerError);
      
      // Fallback to yt-dlp
      try {
        console.log('Using yt-dlp fallback for Pinterest');
        
        const info = await ytDlp(url, {
          dumpSingleJson: true,
          noCheckCertificates: true,
          noWarnings: true,
          addHeader: [
            'referer:pinterest.com', 
            `user-agent:${getRandomUserAgent()}`
          ]
        });
        
        if (!info || (!info.formats || info.formats.length === 0) && !info.url) {
          throw new Error('Could not extract media information');
        }
        
        // Transform formats to match our API structure
        let formats = [];
        if (info.formats && info.formats.length > 0) {
          formats = info.formats.map(format => {
            const isVideo = format.vcodec !== 'none';
            return {
              itag: format.format_id,
              quality: format.format_note || format.quality || 'Unknown',
              mimeType: isVideo ? 'video/mp4' : 'image/jpeg',
              url: format.url,
              hasAudio: format.acodec !== 'none',
              hasVideo: isVideo,
              contentLength: format.filesize || format.filesize_approx || 0,
              container: format.ext || null
            };
          });
        } else if (info.url) {
          // Single URL case
          const isVideo = info.ext === 'mp4';
          formats = [{
            itag: 'direct',
            quality: 'Original',
            mimeType: isVideo ? 'video/mp4' : 'image/jpeg',
            url: info.url,
            hasAudio: isVideo,
            hasVideo: isVideo,
            contentLength: info.filesize || 0,
            container: info.ext || null
          }];
        }
        
        // Return the info
        res.json({
          title: info.title || 'Pinterest Media',
          thumbnails: info.thumbnails ? [info.thumbnails[0]] : [{ url: formats[0].url, width: 480, height: 480 }],
          formats: formats,
          platform: 'pinterest',
          mediaType: formats[0].hasVideo ? 'video' : 'image',
          directUrl: `/api/direct?url=${encodeURIComponent(formats[0].url)}`
        });
      } catch (ytdlError) {
        console.error('Pinterest yt-dlp fallback error:', ytdlError);
        
        // Last resort fallback - direct link
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
    }
  } catch (error) {
    console.error('Pinterest error:', error);
    res.status(500).json({ error: 'Pinterest processing failed', details: error.message });
  }
});

// Facebook improved endpoint
app.get('/api/facebook', async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`Processing Facebook URL: ${url}`);

    // Try puppeteer approach first
    try {
      const browser = await puppeteer.launch({ 
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
      });
      
      const page = await browser.newPage();
      
      // Use stealth plugin to avoid detection
      await page.setUserAgent(getRandomUserAgent());
      
      // Set extra headers
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      });
      
      // Track media URLs
      const mediaUrls = [];
      page.on('response', async (response) => {
        const respUrl = response.url();
        
        // Look for video content responses
        if (response.status() === 200 && 
           (respUrl.includes('.mp4') || respUrl.includes('/video/') || 
            respUrl.includes('fbcdn.net') || respUrl.includes('fbsbx.com'))) {
          
          const contentType = response.headers()['content-type'] || '';
          
          if (contentType.includes('video') || 
              respUrl.endsWith('.mp4') || 
              respUrl.includes('/video-url/')) {
            mediaUrls.push({
              url: respUrl,
              quality: 'HD',
              type: 'video'
            });
          }
        }
      });
      
      // Navigate to Facebook
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      
      // Accept cookies if the dialog appears
      try {
        // Facebook cookie consent button
        const cookieButton = await page.waitForSelector('[data-testid="cookie-policy-manage-dialog-accept-button"], button[title="Allow all cookies"]', { timeout: 5000 });
        if (cookieButton) {
          await cookieButton.click();
          await page.waitForTimeout(1000);
        }
      } catch (e) {
        // Cookie dialog didn't appear, continue
      }
      
      // Extract video sources
      const fbData = await page.evaluate(() => {
        let title = '';
        let thumbnail = '';
        const videoUrls = [];
        
        // Get title
        const titleElement = document.querySelector('[data-testid="post_message"]');
        if (titleElement) {
          title = titleElement.textContent.trim();
        } else if (document.title) {
          title = document.title.replace(' | Facebook', '').trim();
        }
        
        // Get og:image for thumbnail
        const ogImage = document.querySelector('meta[property="og:image"]');
        if (ogImage) {
          thumbnail = ogImage.getAttribute('content');
        }
        
        // Direct video elements
        const videoElements = document.querySelectorAll('video');
        for (const video of videoElements) {
          if (video.src) {
            videoUrls.push({
              url: video.src,
              quality: 'Video Tag',
              type: 'video'
            });
          }
        }
        
        // Source elements
        const sourceElements = document.querySelectorAll('source');
        for (const source of sourceElements) {
          if (source.src) {
            videoUrls.push({
              url: source.src,
              quality: source.getAttribute('label') || 'Source Tag',
              type: 'video'
            });
          }
        }
        
        // Look for HD_SRC and SD_SRC in page source
        const pageSource = document.documentElement.outerHTML;
        
        // HD video source
        const hdMatch = pageSource.match(/"hd_src":"([^"]+)"/);
        if (hdMatch && hdMatch[1]) {
          videoUrls.push({
            url: hdMatch[1].replace(/\\/g, ''),
            quality: 'HD',
            type: 'video'
          });
        }
        
        // SD video source
        const sdMatch = pageSource.match(/"sd_src":"([^"]+)"/);
        if (sdMatch && sdMatch[1]) {
          videoUrls.push({
            url: sdMatch[1].replace(/\\/g, ''),
            quality: 'SD',
            type: 'video'
          });
        }
        
        // Look for FBQualityLabel
        const qualityLabels = pageSource.match(/FBQualityLabel="([^"]+)"[^>]*src="([^"]+)"/g);
        if (qualityLabels) {
          for (const match of qualityLabels) {
            const labelMatch = match.match(/FBQualityLabel="([^"]+)"/);
            const srcMatch = match.match(/src="([^"]+)"/);
            
            if (labelMatch && labelMatch[1] && srcMatch && srcMatch[1]) {
              videoUrls.push({
                url: srcMatch[1],
                quality: labelMatch[1],
                type: 'video'
              });
            }
          }
        }
        
        // og:video
        const ogVideo = document.querySelector('meta[property="og:video:url"]');
        if (ogVideo) {
          videoUrls.push({
            url: ogVideo.getAttribute('content'),
            quality: 'og:video',
            type: 'video'
          });
        }
        
        // og:video:secure_url
        const ogVideoSecure = document.querySelector('meta[property="og:video:secure_url"]');
        if (ogVideoSecure) {
          videoUrls.push({
            url: ogVideoSecure.getAttribute('content'),
            quality: 'og:video:secure',
            type: 'video'
          });
        }
        
        return {
          title,
          thumbnail,
          videoUrls
        };
      });
      
      await browser.close();
      
      // Combine all found video URLs
      let allVideoUrls = [...mediaUrls];
      
      if (fbData.videoUrls && fbData.videoUrls.length > 0) {
        allVideoUrls = [...allVideoUrls, ...fbData.videoUrls];
      }
      
      // If no videos found, try fallback
      if (allVideoUrls.length === 0) {
        throw new Error('No videos found in Facebook page');
      }
      
      // Remove duplicates
      const uniqueUrls = [];
      const seen = new Set();
      
      for (const video of allVideoUrls) {
        if (!seen.has(video.url)) {
          seen.add(video.url);
          uniqueUrls.push(video);
        }
      }
      
      // Create format objects
      const formats = uniqueUrls.map((video, index) => {
        return {
          itag: `fb_${index}`,
          quality: video.quality || 'Unknown',
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
      res.json({
        title: fbData.title || 'Facebook Video',
        thumbnails: fbData.thumbnail ? [{ url: fbData.thumbnail, width: 480, height: 360 }] : [],
        formats: formats,
        platform: 'facebook',
        mediaType: 'video',
        directUrl: directUrl
      });
      
    } catch (puppeteerError) {
      console.error('Facebook puppeteer error:', puppeteerError);
      
      // Fallback to yt-dlp
      try {
        console.log('Using yt-dlp fallback for Facebook');
        
        const info = await ytDlp(url, {
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
        res.json({
          title: info.title || 'Facebook Video',
          thumbnails: info.thumbnails ? [info.thumbnails[0]] : [],
          formats: formats,
          platform: 'facebook',
          mediaType: 'video',
          directUrl: `/api/direct?url=${encodeURIComponent(formats[0].url)}`
        });
      } catch (ytdlError) {
        console.error('Facebook yt-dlp fallback error:', ytdlError);
        
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
      }
    }
  } catch (error) {
    console.error('Facebook error:', error);
    res.status(500).json({ error: 'Facebook processing failed', details: error.message });
  }
});

// YouTube improved endpoint
app.get('/api/youtube', async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`Processing YouTube URL: ${url}`);

    // Using yt-dlp directly for YouTube - it's the most reliable
    try {
      const info = await ytDlp(url, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        addHeader: [
          'referer:youtube.com', 
          `user-agent:${getRandomUserAgent()}`
        ],
        // Added options for YouTube
        noPlaylist: true,       // Don't process playlists
        skipDownload: true,     // Just get info, don't download
        youtubeSkipDashManifest: true  // Skip DASH manifests
      });
      
      if (!info || !info.formats || info.formats.length === 0) {
        throw new Error('Could not extract video information');
      }
      
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
      
      // Return video info
      res.json({
        title: info.title || 'YouTube Video',
        thumbnails: info.thumbnails ? info.thumbnails.map(t => ({ url: t.url, width: t.width, height: t.height })) : [],
        duration: info.duration,
        formats: formats,
        platform: 'youtube',
        mediaType: 'video',
        uploader: info.uploader || info.channel || null,
        uploadDate: info.upload_date || null,
        description: info.description || null,
        directUrl: `/api/direct?url=${encodeURIComponent(formats[0].url)}`
      });
    } catch (ytdlError) {
      console.error('YouTube yt-dlp error:', ytdlError);
      
      // Fall back to puppeteer as a last resort
      try {
        console.log('Using puppeteer fallback for YouTube');
        
        const browser = await puppeteer.launch({ 
          headless: 'new',
          args: ['--no-sandbox', '--disable-setuid-sandbox'] 
        });
        
        const page = await browser.newPage();
        await page.setUserAgent(getRandomUserAgent());
        
        // Navigate to YouTube
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        
        // Accept cookies if needed
        try {
          const cookieButton = await page.waitForSelector('#content > div.body.style-scope.ytd-consent-bump-v2-lightbox > div.eom-buttons.style-scope.ytd-consent-bump-v2-lightbox > div:nth-child(1) > ytd-button-renderer:nth-child(2)', 
            { timeout: 5000 });
          if (cookieButton) {
            await cookieButton.click();
            await page.waitForTimeout(1000);
          }
        } catch (e) {
          // Cookie dialog didn't appear, continue
        }
        
        // Extract video data
        const videoData = await page.evaluate(() => {
          // Get title
          const title = document.querySelector('meta[property="og:title"]')?.content || 
                        document.querySelector('meta[name="title"]')?.content || 
                        document.title;
          
          // Get thumbnail
          const thumbnail = document.querySelector('meta[property="og:image"]')?.content;
          
          // Get description
          const description = document.querySelector('meta[property="og:description"]')?.content || 
                              document.querySelector('meta[name="description"]')?.content;
          
          // Get uploader
          const uploader = document.querySelector('span#owner-name a')?.textContent || 
                          document.querySelector('div#owner-container a')?.textContent;
          
          return {
            title,
            thumbnail,
            description,
            uploader
          };
        });
        
        await browser.close();
        
        // Return a limited response
        res.json({
          title: videoData.title || 'YouTube Video',
          thumbnails: videoData.thumbnail ? [{ url: videoData.thumbnail, width: 480, height: 360 }] : [],
          description: videoData.description,
          uploader: videoData.uploader,
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
      } catch (puppeteerError) {
        console.error('YouTube puppeteer fallback error:', puppeteerError);
        
        // Last resort fallback - just return the URL
        res.json({
          title: 'YouTube Video',
          thumbnails: [{ url: 'https://via.placeholder.com/480x360.png?text=YouTube+Video', width: 480, height: 360 }],
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

    // For other platforms, use yt-dlp
    try {
      const info = await ytDlp(url, {
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
      res.json({
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
      console.error('yt-dlp error:', ytdlError);

      // Fallback response for platforms yt-dlp can't handle
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
        description: null,
        directUrl: url
      });
    }

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Download endpoint - improved with better error handling
app.get('/api/download', async (req, res) => {
  try {
    const { url, itag } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`Processing download - URL: ${url}, format: ${itag || 'best'}`);

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
      await ytDlp(url, options);
    } catch (ytdlErr) {
      console.error('yt-dlp download error:', ytdlErr);

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
    const stat = await statAsync(tempFilePath);

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
      unlinkAsync(tempFilePath).catch(err => {
        console.error('Error deleting temp file:', err);
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
      await ytDlp(url, options);
    } catch (ytdlErr) {
      console.error('yt-dlp audio download error:', ytdlErr);

      // For troublesome sites, try a more specific audio format
      if (!fs.existsSync(tempFilePath)) {
        options.format = 'bestaudio/best';
        await ytDlp(url, options);
      }
    }

    // Check if file exists
    if (!fs.existsSync(tempFilePath)) {
      throw new Error('Audio download failed - file not created');
    }

    // Get file info
    const stat = await statAsync(tempFilePath);

    // Set headers for download
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', `attachment; filename="audio.mp3"`);

    // Stream the file and delete after sending
    const fileStream = fs.createReadStream(tempFilePath);
    fileStream.pipe(res);

    fileStream.on('end', () => {
      // Delete the temporary file
      unlinkAsync(tempFilePath).catch(err => {
        console.error('Error deleting temp file:', err);
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

    // Prepare headers with a random user agent
    const headers = {
      'User-Agent': getRandomUserAgent(),
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
      const headResponse = await fetchWithTimeout(url, {
        method: 'HEAD',
        headers,
        redirect: 'follow',
        timeout: 10000 // 10 second timeout
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

    // Try to fetch the content
    try {
      const response = await fetchWithTimeout(url, {
        headers,
        redirect: 'follow',
        timeout: 30000 // 30 second timeout
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch content: ${response.status} ${response.statusText}`);
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
