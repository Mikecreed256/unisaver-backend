// server.js - Fixed version with working YouTube, Pinterest and Facebook
const express = require('express');
const cors = require('cors');
const youtubeDl = require('youtube-dl-exec');
const ytdl = require('ytdl-core');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const UserAgent = require('user-agents');
const NodeCache = require('node-cache');
const retry = require('async-retry');
const pTimeout = require('p-timeout');
const { HttpsProxyAgent } = require('https-proxy-agent');

// Initialize cache with 1 hour TTL
const mediaCache = new NodeCache({ stdTTL: 3600 });

const app = express();
const PORT = process.env.PORT || 10000;

// Create a temporary directory for downloads
const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR);
}

// Clean temp directory on startup (keep it from filling up on restarts)
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

// Utility: Get a random user agent
function getRandomUserAgent() {
  const userAgent = new UserAgent();
  return userAgent.toString();
}

// Utility: Retry mechanism for fetching with exponential backoff
async function fetchWithRetry(url, options = {}, retries = 3) {
  return retry(async (bail, attempt) => {
    console.log(`Attempt ${attempt} to fetch ${url}`);
    
    // Add a random user agent if not specified
    if (!options.headers) {
      options.headers = {
        'User-Agent': getRandomUserAgent(),
      };
    } else if (!options.headers['User-Agent']) {
      options.headers['User-Agent'] = getRandomUserAgent();
    }
    
    try {
      // Add timeout to prevent hanging requests
      const response = await pTimeout(
        fetch(url, options),
        30000, // 30 second timeout
        `Request to ${url} timed out`
      );
      
      if (!response.ok) {
        // Don't retry on 404s
        if (response.status === 404) {
          bail(new Error(`URL not found: ${response.status}`));
          return null;
        }
        
        // For other errors, throw to trigger retry
        throw new Error(`Request failed with status ${response.status}`);
      }
      
      return response;
    } catch (error) {
      if (error.message.includes('timed out')) {
        // Timeout errors should be retried
        throw error;
      }
      
      // Check if it's a rate limit error (429)
      if (error.message.includes('429')) {
        console.log(`Rate limited, waiting before retry...`);
        await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
        throw error; // Retry
      }
      
      // Rethrow other errors
      throw error;
    }
  }, {
    retries: retries,
    factor: 2,
    minTimeout: 1000,
    maxTimeout: 15000,
    onRetry: (error, attempt) => {
      console.log(`Retry ${attempt} after error: ${error.message}`);
    }
  });
}

// YouTube Info Extraction - FIXED VERSION
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
    
    // Direct video ID extraction
    let videoId = '';
    
    // Extract video ID from URL
    if (url.includes('youtu.be/')) {
      videoId = url.split('youtu.be/')[1].split('?')[0];
    } else if (url.includes('v=')) {
      videoId = url.split('v=')[1].split('&')[0];
    }
    
    if (!videoId) {
      throw new Error('Could not extract YouTube video ID from URL');
    }
    
    // --------- APPROACH 1: Use youtube-dl with WORKING options ---------
    let videoInfo = null;
    let error = null;
    
    try {
      videoInfo = await youtubeDl(url, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        preferFreeFormats: true,
        addHeader: [
          'referer:https://www.youtube.com',
          `user-agent:Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148`
        ],
        // REMOVED problematic extractor option and using only valid options
        geoBypass: true,
        socketTimeout: '30',
        youtubeSkipDashManifest: true
      });
    } catch (ytdlError) {
      console.error('YouTube-dl standard approach failed:', ytdlError.message);
      error = ytdlError;
    }

    // --------- APPROACH 2: Use ytdl-core with special mobile URL ---------
    if (!videoInfo) {
      try {
        console.log('Trying ytdl-core with mobile URL format...');
        // Use a different URL format that sometimes bypasses restrictions
        const mobileUrl = `https://m.youtube.com/watch?v=${videoId}`;
        
        // Set environment variable to disable update check (fixes one error)
        process.env.YTDL_NO_UPDATE = 'true';
        
        const ytdlInfo = await ytdl.getInfo(mobileUrl, {
          requestOptions: {
            headers: {
              'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'en-us'
            }
          }
        });
        
        // Convert ytdl-core format to our standard format
        videoInfo = {
          title: ytdlInfo.videoDetails.title,
          thumbnails: ytdlInfo.videoDetails.thumbnails.map(t => ({
            url: t.url,
            width: t.width,
            height: t.height
          })),
          duration: parseInt(ytdlInfo.videoDetails.lengthSeconds),
          formats: ytdlInfo.formats.map(format => {
            const isVideo = format.hasVideo;
            const isAudio = format.hasAudio;
            let qualityLabel = format.qualityLabel || 'Unknown';
            
            // Determine mimetype
            let mimeType = format.mimeType?.split(';')[0] || 'unknown';
            
            return {
              itag: format.itag.toString(),
              quality: qualityLabel,
              mimeType: mimeType,
              url: format.url,
              hasAudio: isAudio,
              hasVideo: isVideo,
              contentLength: parseInt(format.contentLength) || 0,
              container: format.container || null
            };
          }),
          uploader: ytdlInfo.videoDetails.author?.name || null,
          uploadDate: null,
          description: ytdlInfo.videoDetails.description || null
        };
      } catch (ytdlCoreError) {
        console.error('ytdl-core approach failed:', ytdlCoreError.message);
        // Continue to next approach
      }
    }

    // --------- APPROACH 3: Direct YouTube Embed Page Scraping ---------
    if (!videoInfo) {
      try {
        console.log('Trying direct YouTube embed page scraping...');
        
        // YouTube embed pages often work when regular pages are geo-restricted
        const embedUrl = `https://www.youtube.com/embed/${videoId}`;
        
        const response = await fetchWithRetry(embedUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
          }
        });
        
        if (response) {
          const html = await response.text();
          
          // Find player response data
          const playerResponseMatch = html.match(/\"player_response\":\"([^\"]+)\"/);
          if (playerResponseMatch && playerResponseMatch[1]) {
            const playerResponseJson = JSON.parse(
              playerResponseMatch[1]
                .replace(/\\x([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
                .replace(/\\u([0-9A-F]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
                .replace(/\\/g, '')
            );
            
            if (playerResponseJson && playerResponseJson.streamingData && playerResponseJson.videoDetails) {
              const videoDetails = playerResponseJson.videoDetails;
              const streamingData = playerResponseJson.streamingData;
              
              // Extract formats from streaming data
              const formats = [];
              
              // Process formats
              if (streamingData.formats) {
                streamingData.formats.forEach(format => {
                  formats.push({
                    itag: format.itag.toString(),
                    quality: format.qualityLabel || 'Standard',
                    mimeType: format.mimeType?.split(';')[0] || 'video/mp4',
                    url: format.url,
                    hasAudio: true,
                    hasVideo: true,
                    contentLength: parseInt(format.contentLength) || 0,
                    container: 'mp4'
                  });
                });
              }
              
              // Process adaptive formats
              if (streamingData.adaptiveFormats) {
                streamingData.adaptiveFormats.forEach(format => {
                  // Check if it's a video or audio stream
                  const isVideo = format.mimeType?.includes('video/');
                  const isAudio = format.mimeType?.includes('audio/');
                  
                  formats.push({
                    itag: format.itag.toString(),
                    quality: format.qualityLabel || (isAudio ? 'Audio' : 'Unknown'),
                    mimeType: format.mimeType?.split(';')[0] || 'unknown',
                    url: format.url,
                    hasAudio: isAudio,
                    hasVideo: isVideo,
                    contentLength: parseInt(format.contentLength) || 0,
                    container: format.mimeType?.includes('mp4') ? 'mp4' : 'webm'
                  });
                });
              }
              
              // Get thumbnails
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
              
              videoInfo = {
                title: videoDetails.title,
                thumbnails: thumbnails,
                duration: parseInt(videoDetails.lengthSeconds),
                formats: formats,
                uploader: videoDetails.author,
                description: videoDetails.shortDescription
              };
            }
          }
        }
      } catch (embedError) {
        console.error('YouTube embed page approach failed:', embedError.message);
      }
    }

    // --------- APPROACH 4: Extract from iframe player (last resort) ---------
    if (!videoInfo) {
      try {
        console.log('Trying YouTube iframe player data extraction...');
        
        const playerUrl = `https://www.youtube.com/iframe_api`;
        const response = await fetchWithRetry(playerUrl, {
          headers: {
            'User-Agent': getRandomUserAgent(),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          }
        });
        
        if (response) {
          // For this approach, we'll at least extract metadata and provide a direct link
          const result = {
            title: `YouTube Video - ${videoId}`,
            thumbnails: [
              { 
                url: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`, 
                width: 1280, 
                height: 720 
              },
              { 
                url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, 
                width: 480, 
                height: 360 
              }
            ],
            formats: [{
              itag: 'direct',
              quality: 'Best available',
              mimeType: 'video/mp4',
              url: `https://www.youtube.com/watch?v=${videoId}`,
              hasAudio: true,
              hasVideo: true,
              contentLength: 0,
              container: 'mp4'
            }],
            platform: 'youtube',
            mediaType: 'video',
            directUrl: `/api/direct?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`
          };
          
          videoInfo = result;
        }
      } catch (iframeError) {
        console.error('YouTube iframe approach failed:', iframeError.message);
      }
    }

    // If all strategies failed, return a user-friendly error
    if (!videoInfo) {
      return res.status(404).json({
        error: 'Could not extract YouTube video information',
        details: 'The video might be private, age-restricted, or removed',
        originalError: error ? error.message : 'Multiple extraction methods failed'
      });
    }

    // Add platform info if not present
    videoInfo.platform = 'youtube';
    videoInfo.mediaType = 'video';
    
    // Add direct URL if not present
    if (!videoInfo.directUrl && videoInfo.formats && videoInfo.formats.length > 0) {
      // Find a good format (prefer formats with both audio and video)
      const bestFormat = videoInfo.formats.find(f => f.hasAudio && f.hasVideo) || videoInfo.formats[0];
      videoInfo.directUrl = `/api/direct?url=${encodeURIComponent(bestFormat.url)}`;
    }

    // Cache the result
    mediaCache.set(cacheKey, videoInfo);

    // Return the video info
    res.json(videoInfo);

  } catch (error) {
    console.error('YouTube error:', error);
    res.status(500).json({ error: 'YouTube processing failed', details: error.message });
  }
});

// Enhanced Pinterest handler with better video support
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

    // Use multiple user agents to increase success rate
    const userAgents = [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1', // Mobile often works better
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36'
    ];

    let html = '';
    let statusCode = 0;
    
    // Try different user agents until we get a good response
    for (const agent of userAgents) {
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': agent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Upgrade-Insecure-Requests': '1'
          },
          redirect: 'follow'
        });
        
        statusCode = response.status;
        if (response.ok) {
          html = await response.text();
          if (html.length > 1000) { // Make sure we got a proper response
            break;
          }
        }
      } catch (fetchError) {
        console.error(`Pinterest fetch failed with agent ${agent}:`, fetchError.message);
        // Continue with next agent
      }
    }

    if (!html || html.length < 1000) {
      throw new Error(`Failed to fetch Pinterest page. Status code: ${statusCode}`);
    }

    // Extract title
    let title = 'Pinterest Content';
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].replace(' | Pinterest', '').trim();
    }

    // --------- Pinterest VIDEO extraction (primary focus) ---------
    let videoUrls = [];
    
    // Method 1: Look for v.pinimg.com video URLs directly
    const videoMatch = html.match(/https:\/\/v\.pinimg\.com\/[a-zA-Z0-9\/\._-]+\.mp4/gi);
    if (videoMatch && videoMatch.length > 0) {
      videoUrls = [...new Set(videoMatch)]; // Remove duplicates
    }
    
    // Method 2: Look for video_list in JSON data
    if (videoUrls.length === 0) {
      const videoListMatch = html.match(/\"video_list\":\s*(\{[^\}]+\})/g);
      if (videoListMatch && videoListMatch.length > 0) {
        for (const match of videoListMatch) {
          try {
            // Clean up the JSON string
            const jsonStr = match.replace('"video_list":', '')
                                .replace(/\\"/g, '"')
                                .replace(/\\'/g, "'")
                                .replace(/\\\\/g, "\\");
            
            const videoData = JSON.parse(jsonStr);
            
            // Different video qualities
            for (const [key, value] of Object.entries(videoData)) {
              if (value && value.url) {
                videoUrls.push(value.url);
              }
            }
          } catch (e) {
            console.error('Error parsing Pinterest video JSON:', e);
          }
        }
      }
    }
    
    // Method 3: Extract from structured JSON data (more reliable)
    if (videoUrls.length === 0) {
      const jsonScripts = html.match(/<script[^>]*type="application\/json"[^>]*>\s*(.*?)\s*<\/script>/gs);
      if (jsonScripts && jsonScripts.length > 0) {
        for (const script of jsonScripts) {
          try {
            // Extract JSON content
            const jsonContent = script.match(/<script[^>]*>\s*(.*?)\s*<\/script>/s)[1];
            const data = JSON.parse(jsonContent);
            
            // Navigate through common Pinterest data structures to find videos
            if (data && data.resourceResponses) {
              for (const resource of data.resourceResponses) {
                if (resource && resource.response && resource.response.data) {
                  const resourceData = resource.response.data;
                  
                  // Check for pin data with videos
                  if (resourceData.videos) {
                    if (resourceData.videos.video_list) {
                      Object.values(resourceData.videos.video_list).forEach(video => {
                        if (video && video.url) {
                          videoUrls.push(video.url);
                        }
                      });
                    }
                  }
                  
                  // Check pin array for videos
                  if (resourceData.pin) {
                    if (resourceData.pin.videos && resourceData.pin.videos.video_list) {
                      Object.values(resourceData.pin.videos.video_list).forEach(video => {
                        if (video && video.url) {
                          videoUrls.push(video.url);
                        }
                      });
                    }
                  }
                  
                  // Check story format
                  if (resourceData.story_pin_data) {
                    const blocks = resourceData.story_pin_data.pages?.flatMap(page => page.blocks) || [];
                    blocks.forEach(block => {
                      if (block && block.video && block.video.video_list) {
                        Object.values(block.video.video_list).forEach(video => {
                          if (video && video.url) {
                            videoUrls.push(video.url);
                          }
                        });
                      }
                    });
                  }
                }
              }
            }
          } catch (e) {
            console.error('Error parsing Pinterest JSON script:', e);
            // Continue with next script
          }
        }
      }
    }
    
    // Method 4: Look for og:video meta tags
    if (videoUrls.length === 0) {
      const ogVideoMatch = html.match(/<meta[^>]*property="og:video"[^>]*content="([^"]+)"[^>]*>/i);
      if (ogVideoMatch && ogVideoMatch[1]) {
        videoUrls.push(ogVideoMatch[1]);
      }
      
      const ogVideoSecureMatch = html.match(/<meta[^>]*property="og:video:secure_url"[^>]*content="([^"]+)"[^>]*>/i);
      if (ogVideoSecureMatch && ogVideoSecureMatch[1]) {
        videoUrls.push(ogVideoSecureMatch[1]);
      }
    }

    // --------- If we found videos ---------
    if (videoUrls.length > 0) {
      // Remove duplicates and clean URLs
      const filteredVideoUrls = [...new Set(videoUrls)].filter(url => 
        url && 
        url.startsWith('http') && 
        (url.endsWith('.mp4') || url.includes('.mp4?') || url.includes('video'))
      );
      
      if (filteredVideoUrls.length > 0) {
        // Look for thumbnail images
        let thumbnailUrl = '';
        
        // Try to get thumbnail
        const ogImageMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"[^>]*>/i);
        if (ogImageMatch && ogImageMatch[1]) {
          thumbnailUrl = ogImageMatch[1];
        }
        
        // If no OG image, look for regular image
        if (!thumbnailUrl) {
          const imgMatch = html.match(/https:\/\/i\.pinimg\.com\/[a-zA-Z0-9\/\._-]+\.(?:jpg|jpeg|png)/gi);
          if (imgMatch && imgMatch.length > 0) {
            thumbnailUrl = imgMatch[0];
          }
        }
        
        // Create format objects for each video quality
        const formats = filteredVideoUrls.map((url, index) => {
          // Try to determine quality from URL
          let quality = 'Standard';
          if (url.includes('720p') || url.includes('720P')) {
            quality = '720p';
          } else if (url.includes('480p') || url.includes('480P')) {
            quality = '480p';
          } else if (url.includes('240p') || url.includes('240P')) {
            quality = '240p';
          } else if (index === 0) {
            quality = 'High Quality';
          }
          
          return {
            itag: `pin_vid_${index}`,
            quality: quality,
            mimeType: 'video/mp4',
            url: url,
            hasAudio: true,
            hasVideo: true,
            contentLength: 0,
            container: 'mp4'
          };
        });
        
        // Sort formats by quality (best first)
        formats.sort((a, b) => {
          const qualityOrder = {
            'High Quality': 4,
            '720p': 3,
            '480p': 2,
            '240p': 1,
            'Standard': 0
          };
          
          return (qualityOrder[b.quality] || 0) - (qualityOrder[a.quality] || 0);
        });
        
        // Create direct download URL
        const directDownloadUrl = `/api/direct?url=${encodeURIComponent(filteredVideoUrls[0])}`;
        
        const result = {
          title: title,
          thumbnails: thumbnailUrl ? [{ url: thumbnailUrl, width: 480, height: 480 }] : [],
          formats: formats,
          platform: 'pinterest',
          mediaType: 'video',
          directUrl: directDownloadUrl
        };
        
        // Cache the result
        mediaCache.set(cacheKey, result);
        
        return res.json(result);
      }
    }

    // --------- Fallback to image extraction ---------
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
    
    // Try to extract from og:image meta tags if nothing found
    if (imageUrls.length === 0) {
      const ogImageMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"[^>]*>/i);
      if (ogImageMatch && ogImageMatch[1]) {
        imageUrls.push(ogImageMatch[1]);
      }
    }

    // Fallback for when no images are found
    if (imageUrls.length === 0) {
      return res.status(404).json({
        error: 'No media found on this Pinterest page',
        details: 'This might be a private pin or require login'
      });
    }

    // Remove duplicates and filter out invalid URLs
    const filteredImageUrls = [...new Set(imageUrls)].filter(url =>
      url && url.startsWith('http')
    );

    // Sort by quality (prioritize originals and larger sizes)
    filteredImageUrls.sort((a, b) => {
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
    const formats = filteredImageUrls.map((url, index) => {
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
        itag: `pin_img_${index}`,
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
    const directDownloadUrl = `/api/direct?url=${encodeURIComponent(filteredImageUrls[0])}`;

    const result = {
      title: title,
      thumbnails: [{ url: filteredImageUrls[0], width: 480, height: 480 }],
      formats: formats,
      platform: 'pinterest',
      mediaType: 'image',
      directUrl: directDownloadUrl
    };
    
    // Cache the result
    mediaCache.set(cacheKey, result);

    // Return the media info
    res.json(result);

  } catch (error) {
    console.error('Pinterest error:', error);
    res.status(500).json({ error: 'Pinterest processing failed', details: error.message });
  }
});

// Enhanced Facebook handler
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

    // Create mobile URL version (often works better for extraction)
    let mobileUrl = url;
    if (!url.includes('m.facebook.com') && url.includes('facebook.com')) {
      mobileUrl = url.replace('www.facebook.com', 'm.facebook.com')
                    .replace('facebook.com', 'm.facebook.com');
    }

    // Try multiple user agents for better success rate
    const userAgents = [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1', // Mobile often works better
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Safari/605.1.15'
    ];

    // Function to extract video URLs from HTML (enhanced version)
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

      // Method 6: New Facebook video player pattern
      const playableUrlMatches = html.match(/playable_url":"([^"]+)"/g);
      if (playableUrlMatches) {
        for (const match of playableUrlMatches) {
          const urlMatch = match.match(/playable_url":"([^"]+)"/);
          if (urlMatch && urlMatch[1]) {
            const decodedUrl = urlMatch[1]
              .replace(/\\u[\da-f]{4}/gi, (match) => {
                return String.fromCharCode(parseInt(match.replace(/\\u/g, ''), 16));
              })
              .replace(/\\\//g, '/');
            
            results.push({
              quality: 'Standard',
              url: decodedUrl
            });
          }
        }
      }

      // Method 7: HD playable URL pattern
      const playableHdUrlMatches = html.match(/playable_url_quality_hd":"([^"]+)"/g);
      if (playableHdUrlMatches) {
        for (const match of playableHdUrlMatches) {
          const urlMatch = match.match(/playable_url_quality_hd":"([^"]+)"/);
          if (urlMatch && urlMatch[1]) {
            const decodedUrl = urlMatch[1]
              .replace(/\\u[\da-f]{4}/gi, (match) => {
                return String.fromCharCode(parseInt(match.replace(/\\u/g, ''), 16));
              })
              .replace(/\\\//g, '/');
            
            results.push({
              quality: 'HD',
              url: decodedUrl
            });
          }
        }
      }
      
      // Method 8: Video Data in script tags
      const scriptTags = html.match(/<script[^>]*>[\s\S]*?<\/script>/g) || [];
      for (const scriptTag of scriptTags) {
        // Look for videoData object
        if (scriptTag.includes('videoData') || scriptTag.includes('video_data')) {
          // Extract URLs from various patterns
          const urlMatches = scriptTag.match(/"url":"([^"]+)"/g);
          if (urlMatches) {
            for (const match of urlMatches) {
              const urlMatch = match.match(/"url":"([^"]+)"/);
              if (urlMatch && urlMatch[1] && urlMatch[1].includes('fbcdn.net')) {
                const decodedUrl = urlMatch[1]
                  .replace(/\\u[\da-f]{4}/gi, (match) => {
                    return String.fromCharCode(parseInt(match.replace(/\\u/g, ''), 16));
                  })
                  .replace(/\\\//g, '/');
                
                results.push({
                  quality: 'Script URL',
                  url: decodedUrl
                });
              }
            }
          }
        }
      }

      return results;
    }

    // Try different user agents to bypass restrictions
    let videoUrls = [];
    let html = '';
    let title = 'Facebook Video';
    let thumbnail = '';
    let statusCode = 0;

    for (const userAgent of userAgents) {
      try {
        const response = await fetch(mobileUrl, {
          headers: {
            'User-Agent': userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
          },
          redirect: 'follow',
          timeout: 15000 // 15 second timeout
        });

        statusCode = response.status;
        if (!response.ok) {
          continue; // Try next user agent
        }

        html = await response.text();
        if (html.length < 1000) {
          continue; // Too small, might be an error page
        }

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
          console.log(`Found ${videoUrls.length} video URLs with user agent: ${userAgent}`);
          break; // We found videos, stop trying different user agents
        }
      } catch (agentError) {
        console.error(`Error with user agent ${userAgent}:`, agentError.message);
        continue; // Try next user agent
      }
    }

    // If no videos found, try youtube-dl as fallback
    if (videoUrls.length === 0) {
      console.log('No videos found through direct extraction, trying youtube-dl...');

      try {
        const info = await youtubeDl(url, {
          dumpSingleJson: true,
          noCheckCertificates: true,
          noWarnings: true,
          addHeader: [
            'referer:facebook.com', 
            `user-agent:Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1`
          ],
          geoBypass: true,
          socketTimeout: '30',
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
        details: `Failed to extract video. Status code: ${statusCode}. This might be a private video or require login.`
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

    // Prioritize HD quality URLs
    uniqueUrls.sort((a, b) => {
      // HD should come first
      if (a.quality.includes('HD') && !b.quality.includes('HD')) return -1;
      if (!a.quality.includes('HD') && b.quality.includes('HD')) return 1;
      
      // Handle numeric resolutions (e.g. 720p, 1080p)
      const aRes = a.quality.match(/(\d+)p/);
      const bRes = b.quality.match(/(\d+)p/);
      
      if (aRes && bRes) {
        return parseInt(bRes[1]) - parseInt(aRes[1]); // Higher resolution first
      }
      
      return 0;
    });

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
      directUrl = `/api/direct?url=${encodeURIComponent(formats[0].url)}`;
    }

    const result = {
      title: title,
      thumbnails: thumbnail ? [{ url: thumbnail, width: 480, height: 360 }] : [],
      formats: formats,
      platform: 'facebook',
      mediaType: 'video',
      directUrl: directUrl
    };
    
    // Cache the result
    mediaCache.set(cacheKey, result);

    // Return the video info
    res.json(result);

  } catch (error) {
    console.error('Facebook error:', error);
    res.status(500).json({ error: 'Facebook processing failed', details: error.message });
  }
});

// Download endpoint that properly uses youtube-dl
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

    // Platform-specific handling
    const platform = detectPlatform(url);
    
    // For YouTube, try direct approach first
    if (platform === 'youtube') {
      // Get video ID
      let videoId = '';
      if (url.includes('youtu.be/')) {
        videoId = url.split('youtu.be/')[1].split('?')[0];
      } else if (url.includes('v=')) {
        videoId = url.split('v=')[1].split('&')[0];
      }
      
      if (videoId) {
        try {
          // Get video info first to extract the best format
          const ytResponse = await fetch(`http://localhost:${PORT}/api/youtube?url=${encodeURIComponent(url)}`);
          
          if (ytResponse.ok) {
            const videoInfo = await ytResponse.json();
            
            if (videoInfo.formats && videoInfo.formats.length > 0) {
              // Get the best format with both audio and video
              let targetFormat = videoInfo.formats[0];
              
              if (itag && itag !== 'best') {
                targetFormat = videoInfo.formats.find(f => f.itag === itag) || targetFormat;
              } else {
                // Find a format with both audio and video
                targetFormat = videoInfo.formats.find(f => f.hasAudio && f.hasVideo) || targetFormat;
              }
              
              // Direct download from the URL
              const videoResponse = await fetch(targetFormat.url, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                }
              });
              
              if (videoResponse.ok) {
                const fileStream = fs.createWriteStream(tempFilePath);
                await new Promise((resolve, reject) => {
                  videoResponse.body.pipe(fileStream);
                  videoResponse.body.on('error', reject);
                  fileStream.on('finish', resolve);
                });
                
                // Check if file was created successfully
                if (fs.existsSync(tempFilePath) && fs.statSync(tempFilePath).size > 0) {
                  // Success! Continue to file serving
                } else {
                  throw new Error('Downloaded file is empty or not created');
                }
              } else {
                throw new Error(`Failed to download video: ${videoResponse.status}`);
              }
            } else {
              throw new Error('No formats found for this YouTube video');
            }
          } else {
            throw new Error(`Failed to get YouTube info: ${ytResponse.status}`);
          }
        } catch (youtubeError) {
          console.error('YouTube direct download failed:', youtubeError.message);
          // Continue to fallback methods
        }
      }
    }
    
    // If file doesn't exist yet, try yt-dlp with valid options
    if (!fs.existsSync(tempFilePath) || fs.statSync(tempFilePath).size === 0) {
      try {
        // Basic download options (non-problematic)
        const options = {
          output: tempFilePath,
          noCheckCertificates: true,
          noWarnings: true,
          addHeader: [
            'referer:' + new URL(url).origin, 
            `user-agent:Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1`
          ]
        };
        
        // Add format if specified
        if (itag && itag !== 'best') {
          options.format = itag;
        }
        
        // Run youtube-dl/yt-dlp
        await youtubeDl(url, options);
        
        // Verify the file
        if (!fs.existsSync(tempFilePath) || fs.statSync(tempFilePath).size === 0) {
          throw new Error('Download failed - file not created or empty');
        }
      } catch (ytdlErr) {
        console.error('youtube-dl download error:', ytdlErr.message);
        
        // For very troublesome sites, try a direct fetch approach
        if (!fs.existsSync(tempFilePath) || fs.statSync(tempFilePath).size === 0) {
          console.log('Attempting direct download as fallback...');
          
          // For YouTube, Facebook and Pinterest, get the video info first
          if (['youtube', 'facebook', 'pinterest'].includes(platform)) {
            try {
              const infoResponse = await fetch(`http://localhost:${PORT}/api/${platform}?url=${encodeURIComponent(url)}`);
              
              if (infoResponse.ok) {
                const info = await infoResponse.json();
                
                if (info.formats && info.formats.length > 0) {
                  // Get the best format
                  let directUrl = info.formats[0].url;
                  
                  if (itag && itag !== 'best') {
                    const targetFormat = info.formats.find(f => f.itag === itag);
                    if (targetFormat) {
                      directUrl = targetFormat.url;
                    }
                  }
                  
                  // Direct download
                  const downloadResponse = await fetch(directUrl, {
                    headers: {
                      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.82 Safari/537.36',
                      'Referer': new URL(url).origin
                    }
                  });
                  
                  if (downloadResponse.ok) {
                    const fileStream = fs.createWriteStream(tempFilePath);
                    await new Promise((resolve, reject) => {
                      downloadResponse.body.pipe(fileStream);
                      downloadResponse.body.on('error', reject);
                      fileStream.on('finish', resolve);
                    });
                  } else {
                    throw new Error(`Direct download failed with status: ${downloadResponse.status}`);
                  }
                }
              }
            } catch (infoError) {
              console.error(`${platform} info approach failed:`, infoError.message);
              
              // Last resort direct download of the original URL
              const finalDownloadResponse = await fetch(url, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.82 Safari/537.36',
                  'Referer': new URL(url).origin
                }
              });
              
              if (finalDownloadResponse.ok) {
                const fileStream = fs.createWriteStream(tempFilePath);
                await new Promise((resolve, reject) => {
                  finalDownloadResponse.body.pipe(fileStream);
                  finalDownloadResponse.body.on('error', reject);
                  fileStream.on('finish', resolve);
                });
              } else {
                throw new Error(`Final direct download failed with status: ${finalDownloadResponse.status}`);
              }
            }
          } else {
            // For other platforms, try direct download of the URL
            const downloadResponse = await fetch(url, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.82 Safari/537.36',
                'Referer': new URL(url).origin
              }
            });
            
            if (downloadResponse.ok) {
              const fileStream = fs.createWriteStream(tempFilePath);
              await new Promise((resolve, reject) => {
                downloadResponse.body.pipe(fileStream);
                downloadResponse.body.on('error', reject);
                fileStream.on('finish', resolve);
              });
            } else {
              throw new Error(`Direct download failed with status: ${downloadResponse.status}`);
            }
          }
        }
      }
    }

    // Check if file exists and has content
    if (!fs.existsSync(tempFilePath) || fs.statSync(tempFilePath).size === 0) {
      throw new Error('Download failed - file not created or empty after all attempts');
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
    res.status(500).json({ error: 'Download failed', details: error.message });
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
    switch (platform) {
      case 'youtube':
        const ytResponse = await fetch(`http://localhost:${PORT}/api/youtube?url=${encodeURIComponent(url)}`);
        const ytData = await ytResponse.json();
        return res.json(ytData);
        
      case 'twitter':
        const twResponse = await fetch(`http://localhost:${PORT}/api/twitter?url=${encodeURIComponent(url)}`);
        const twData = await twResponse.json();
        return res.json(twData);
        
      case 'facebook':
        const fbResponse = await fetch(`http://localhost:${PORT}/api/facebook?url=${encodeURIComponent(url)}`);
        const fbData = await fbResponse.json();
        return res.json(fbData);
        
      case 'instagram':
        const igResponse = await fetch(`http://localhost:${PORT}/api/instagram?url=${encodeURIComponent(url)}`);
        const igData = await igResponse.json();
        return res.json(igData);
        
      case 'pinterest':
        const pinResponse = await fetch(`http://localhost:${PORT}/api/pinterest?url=${encodeURIComponent(url)}`);
        const pinData = await pinResponse.json();
        return res.json(pinData);
        
      case 'tiktok':
        const ttResponse = await fetch(`http://localhost:${PORT}/api/tiktok?url=${encodeURIComponent(url)}`);
        const ttData = await ttResponse.json();
        return res.json(ttData);
        
      case 'spotify':
        const spResponse = await fetch(`http://localhost:${PORT}/api/spotify?url=${encodeURIComponent(url)}`);
        const spData = await spResponse.json();
        return res.json(spData);
        
      case 'soundcloud':
        const scResponse = await fetch(`http://localhost:${PORT}/api/soundcloud?url=${encodeURIComponent(url)}`);
        const scData = await scResponse.json();
        return res.json(scData);
    }

    // For other platforms, use youtube-dl with working options
    try {
      const info = await youtubeDl(url, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        addHeader: [
          'referer:' + new URL(url).origin, 
          `user-agent:${getRandomUserAgent()}`
        ],
        geoBypass: true,
        socketTimeout: '30'
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
      const result = {
        title: info.title || `${platform}_media_${Date.now()}`,
        thumbnails: info.thumbnails ? info.thumbnails.map(t => ({ url: t.url, width: t.width, height: t.height })) : [],
        duration: info.duration,
        formats: formats,
        platform: platform,
        mediaType: mediaType,
        uploader: info.uploader || info.channel || null,
        uploadDate: info.upload_date || null,
        description: info.description || null
      };
      
      // Determine best direct URL
      let bestFormat = formats.find(f => f.hasAudio && f.hasVideo) || formats[0];
      if (bestFormat) {
        result.directUrl = `/api/direct?url=${encodeURIComponent(bestFormat.url)}`;
      }
      
      return res.json(result);
    } catch (ytdlError) {
      console.error('youtube-dl error:', ytdlError.message);

      // Fallback - just return some basic info
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
        note: 'Limited information available. This URL may require authentication or is not directly accessible.'
      });
    }

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
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

    // Try to fetch the content
    try {
      const response = await fetch(url, {
        headers,
        redirect: 'follow'
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
  console.log(`Server accessible at http://localhost:${PORT} and http://192.168.1.136:${PORT}`);
  console.log(`Temporary directory: ${TEMP_DIR}`);
});
