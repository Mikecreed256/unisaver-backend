// server.js - Enhanced solution with improved platform support
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
const { HttpsProxyAgent } = require('https-proxy-agent');
const NodeCache = require('node-cache');
const instagramGetUrl = require('instagram-url-direct');
const retry = require('async-retry');
const pTimeout = require('p-timeout');

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

// Enhanced YouTube handler with multiple fallbacks
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

    // Try multiple strategies to get YouTube info
    let videoInfo = null;
    let error = null;

    // Strategy 1: Use youtube-dl-exec with custom user agent rotation
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36 Edg/91.0.864.59',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Safari/605.1.15',
    ];

    // Try each user agent until one works
    for (const userAgent of userAgents) {
      try {
        videoInfo = await youtubeDl(url, {
          dumpSingleJson: true,
          noCheckCertificates: true,
          noWarnings: true,
          preferFreeFormats: true,
          addHeader: [
            'referer:https://www.youtube.com',
            `user-agent:${userAgent}`
          ],
          // Additional options to improve success rate
          geoBypass: true,
          socketTimeout: 30,
          extractor: 'youtube',
          // Add extra info that might help with extraction
          youtubeSkipDashManifest: false,
          includeAds: false
        });
        
        if (videoInfo) break; // If we got info, break the loop
      } catch (ytdlError) {
        console.log(`YouTube-dl attempt failed with user agent ${userAgent}: ${ytdlError.message}`);
        error = ytdlError;
        // Continue to try next user agent
      }
    }

    // Strategy 2: If youtube-dl fails, try ytdl-core directly
    if (!videoInfo) {
      try {
        console.log('Falling back to ytdl-core for YouTube...');
        const ytdlInfo = await ytdl.getInfo(url);
        
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
        console.error('ytdl-core fallback failed:', ytdlCoreError);
        // Continue to next strategy
      }
    }

    // Strategy 3: HTML scraping fallback for some basic info
    if (!videoInfo) {
      try {
        console.log('Falling back to HTML scraping for YouTube...');
        const response = await fetchWithRetry(url, {
          headers: {
            'User-Agent': getRandomUserAgent(),
            'Accept': 'text/html',
            'Accept-Language': 'en-US,en;q=0.9',
          }
        });
        
        if (response) {
          const html = await response.text();
          const $ = cheerio.load(html);
          
          // Extract title
          const title = $('meta[property="og:title"]').attr('content') || 
                       $('title').text().replace(' - YouTube', '') ||
                       'YouTube Video';
                       
          // Extract thumbnail
          const thumbnail = $('meta[property="og:image"]').attr('content') ||
                          $('link[rel="image_src"]').attr('href');
                          
          // Create a simple response with at least some info
          videoInfo = {
            title: title,
            thumbnails: thumbnail ? [{ url: thumbnail, width: 480, height: 360 }] : [],
            formats: [{
              itag: 'best',
              quality: 'Best available',
              mimeType: 'video/mp4',
              url: url, // We'll just use the original URL
              hasAudio: true,
              hasVideo: true,
              contentLength: 0,
              container: 'mp4'
            }],
            platform: 'youtube',
            mediaType: 'video',
            uploader: null,
            uploadDate: null,
            description: $('meta[property="og:description"]').attr('content') || null
          };
        }
      } catch (scrapingError) {
        console.error('HTML scraping fallback failed:', scrapingError);
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

    // Cache the result
    mediaCache.set(cacheKey, videoInfo);

    // Return the video info
    res.json(videoInfo);

  } catch (error) {
    console.error('YouTube error:', error);
    res.status(500).json({ error: 'YouTube processing failed', details: error.message });
  }
});

// Enhanced Twitter/X handler
app.get('/api/twitter', async (req, res) => {
  try {
    const url = req.query.url;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Check cache first
    const cacheKey = `twitter:${url}`;
    const cachedData = mediaCache.get(cacheKey);
    if (cachedData) {
      console.log(`Serving Twitter data from cache for ${url}`);
      return res.json(cachedData);
    }

    console.log(`Processing Twitter/X URL: ${url}`);

    // Try to extract video/image directly from HTML first
    const response = await fetchWithRetry(url, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      }
    });

    if (!response) {
      throw new Error('Failed to fetch Twitter page');
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Try to extract the title (tweet text)
    let title = 'Twitter Post';
    const metaTitle = $('meta[property="og:title"]').attr('content');
    if (metaTitle) {
      title = metaTitle;
    }

    // Try to extract images first
    const images = [];
    $('meta[property="og:image"]').each((i, elem) => {
      const imageUrl = $(elem).attr('content');
      if (imageUrl && !imageUrl.includes('twitter_card_large')) {
        images.push(imageUrl);
      }
    });

    // Try to extract videos
    let videoUrl = $('meta[property="og:video:url"]').attr('content');
    const videoSecureUrl = $('meta[property="og:video:secure_url"]').attr('content');
    const twitterPlayerUrl = $('meta[name="twitter:player:stream"]').attr('content');
    
    // Use the first available video URL
    if (!videoUrl) {
      videoUrl = videoSecureUrl || twitterPlayerUrl;
    }

    // If we found a video, create video formats
    if (videoUrl) {
      // Create a direct playable URL
      const directUrl = `/api/direct?url=${encodeURIComponent(videoUrl)}`;
      
      // Generate thumbnail from video if no images found
      if (images.length === 0) {
        const videoThumbnail = $('meta[property="twitter:image"]').attr('content');
        if (videoThumbnail) {
          images.push(videoThumbnail);
        }
      }
      
      const result = {
        title: title,
        thumbnails: images.map(img => ({ url: img, width: 480, height: 480 })),
        formats: [{
          itag: 'twitter_video',
          quality: 'Original',
          mimeType: 'video/mp4',
          url: videoUrl,
          hasAudio: true,
          hasVideo: true,
          contentLength: 0,
          container: 'mp4'
        }],
        platform: 'twitter',
        mediaType: 'video',
        directUrl: directUrl
      };
      
      // Cache the result
      mediaCache.set(cacheKey, result);
      
      return res.json(result);
    }
    
    // If we found images but no video
    if (images.length > 0) {
      const imageFormats = images.map((img, index) => ({
        itag: `twitter_img_${index}`,
        quality: 'Original',
        mimeType: 'image/jpeg',
        url: img,
        hasAudio: false,
        hasVideo: false,
        contentLength: 0,
        container: 'jpeg'
      }));
      
      const directUrl = `/api/direct?url=${encodeURIComponent(images[0])}`;
      
      const result = {
        title: title,
        thumbnails: images.map(img => ({ url: img, width: 480, height: 480 })),
        formats: imageFormats,
        platform: 'twitter',
        mediaType: 'image',
        directUrl: directUrl
      };
      
      // Cache the result
      mediaCache.set(cacheKey, result);
      
      return res.json(result);
    }

    // Fallback: Try youtube-dl as a last resort
    try {
      console.log('Falling back to youtube-dl for Twitter...');
      const info = await youtubeDl(url, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        preferFreeFormats: true,
        addHeader: [
          'referer:https://twitter.com',
          `user-agent:${getRandomUserAgent()}`
        ]
      });

      if (info.formats && info.formats.length > 0) {
        // Transform formats to match our API structure
        const formats = info.formats
          .filter(format => format !== null)
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
              container: format.ext || null
            };
          });

        const result = {
          title: info.title || title,
          thumbnails: info.thumbnails ? info.thumbnails.map(t => ({ url: t.url, width: t.width, height: t.height })) : [],
          formats: formats,
          platform: 'twitter',
          mediaType: 'video',
          uploader: info.uploader || null,
          uploadDate: info.upload_date || null,
          description: info.description || null
        };
        
        // Cache the result
        mediaCache.set(cacheKey, result);
        
        return res.json(result);
      }
    } catch (ytdlError) {
      console.error('youtube-dl fallback for Twitter failed:', ytdlError);
    }

    // If all extraction methods failed
    return res.status(404).json({
      error: 'No media found in this Twitter post',
      details: 'The tweet might not contain media or it might be private'
    });

  } catch (error) {
    console.error('Twitter error:', error);
    res.status(500).json({ error: 'Twitter processing failed', details: error.message });
  }
});

// Enhanced Instagram handler
app.get('/api/instagram', async (req, res) => {
  try {
    const url = req.query.url;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Check cache first
    const cacheKey = `instagram:${url}`;
    const cachedData = mediaCache.get(cacheKey);
    if (cachedData) {
      console.log(`Serving Instagram data from cache for ${url}`);
      return res.json(cachedData);
    }

    console.log(`Processing Instagram URL: ${url}`);

    // Method 1: Use instagram-url-direct
    try {
      const igResult = await instagramGetUrl(url);
      
      if (igResult && (igResult.url_list.length > 0 || igResult.carousel_media.length > 0)) {
        // Handle single media or carousel
        let mediaUrls = [];
        
        // Single image/video
        if (igResult.url_list && igResult.url_list.length > 0) {
          mediaUrls = igResult.url_list;
        }
        
        // Carousel/multiple images
        if (igResult.carousel_media && igResult.carousel_media.length > 0) {
          igResult.carousel_media.forEach(item => {
            if (item.url) mediaUrls.push(item.url);
          });
        }
        
        if (mediaUrls.length > 0) {
          // Determine if it's video(s) or image(s)
          const isVideo = mediaUrls.some(url => url.includes('.mp4'));
          const mediaType = isVideo ? 'video' : 'image';
          
          // Create formats for each media URL
          const formats = mediaUrls.map((url, index) => {
            const isVideoUrl = url.includes('.mp4');
            return {
              itag: `ig_${index}`,
              quality: 'Original',
              mimeType: isVideoUrl ? 'video/mp4' : 'image/jpeg',
              url: url,
              hasAudio: isVideoUrl,
              hasVideo: isVideoUrl,
              contentLength: 0,
              container: isVideoUrl ? 'mp4' : 'jpeg'
            };
          });
          
          // Get a thumbnail - use the first image or a video thumbnail
          let thumbnail = mediaUrls[0];
          if (isVideo && igResult.thumbnail_url) {
            thumbnail = igResult.thumbnail_url;
          }
          
          const result = {
            title: 'Instagram ' + (isVideo ? 'Video' : 'Photo'),
            thumbnails: [{ url: thumbnail, width: 480, height: 480 }],
            formats: formats,
            platform: 'instagram',
            mediaType: mediaType,
            directUrl: `/api/direct?url=${encodeURIComponent(mediaUrls[0])}`
          };
          
          // Cache the result
          mediaCache.set(cacheKey, result);
          
          return res.json(result);
        }
      }
    } catch (igError) {
      console.error('Instagram-url-direct failed:', igError);
      // Continue to fallback methods
    }

    // Method 2: Try HTML scraping
    try {
      const response = await fetchWithRetry(url, {
        headers: {
          'User-Agent': getRandomUserAgent(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        }
      });

      if (response) {
        const html = await response.text();
        const $ = cheerio.load(html);
        
        // Look for JSON data in the page
        const scriptTags = $('script[type="application/ld+json"]');
        let mediaData = null;
        
        scriptTags.each((i, script) => {
          try {
            const jsonData = JSON.parse($(script).html());
            if (jsonData && (jsonData.video || jsonData.image)) {
              mediaData = jsonData;
              return false; // Break the loop
            }
          } catch (e) {
            // Ignore parse errors, try next script
          }
        });
        
        if (mediaData) {
          let mediaUrl = null;
          let isVideo = false;
          
          if (mediaData.video) {
            mediaUrl = mediaData.video.contentUrl || mediaData.video.url;
            isVideo = true;
          } else if (mediaData.image) {
            mediaUrl = Array.isArray(mediaData.image) ? mediaData.image[0] : mediaData.image;
          }
          
          if (mediaUrl) {
            const format = {
              itag: 'ig_html',
              quality: 'Original',
              mimeType: isVideo ? 'video/mp4' : 'image/jpeg',
              url: mediaUrl,
              hasAudio: isVideo,
              hasVideo: isVideo,
              contentLength: 0,
              container: isVideo ? 'mp4' : 'jpeg'
            };
            
            // Get thumbnail
            let thumbnail = mediaUrl;
            if (isVideo && mediaData.video.thumbnailUrl) {
              thumbnail = mediaData.video.thumbnailUrl;
            }
            
            const result = {
              title: mediaData.name || 'Instagram ' + (isVideo ? 'Video' : 'Photo'),
              thumbnails: [{ url: thumbnail, width: 480, height: 480 }],
              formats: [format],
              platform: 'instagram',
              mediaType: isVideo ? 'video' : 'image',
              directUrl: `/api/direct?url=${encodeURIComponent(mediaUrl)}`
            };
            
            // Cache the result
            mediaCache.set(cacheKey, result);
            
            return res.json(result);
          }
        }
        
        // Try to extract from meta tags if JSON approach failed
        const ogImage = $('meta[property="og:image"]').attr('content');
        const ogVideo = $('meta[property="og:video"]').attr('content');
        
        if (ogVideo) {
          const result = {
            title: $('meta[property="og:title"]').attr('content') || 'Instagram Video',
            thumbnails: ogImage ? [{ url: ogImage, width: 480, height: 480 }] : [],
            formats: [{
              itag: 'ig_meta_video',
              quality: 'Original',
              mimeType: 'video/mp4',
              url: ogVideo,
              hasAudio: true,
              hasVideo: true,
              contentLength: 0,
              container: 'mp4'
            }],
            platform: 'instagram',
            mediaType: 'video',
            directUrl: `/api/direct?url=${encodeURIComponent(ogVideo)}`
          };
          
          // Cache the result
          mediaCache.set(cacheKey, result);
          
          return res.json(result);
        } else if (ogImage) {
          const result = {
            title: $('meta[property="og:title"]').attr('content') || 'Instagram Photo',
            thumbnails: [{ url: ogImage, width: 480, height: 480 }],
            formats: [{
              itag: 'ig_meta_image',
              quality: 'Original',
              mimeType: 'image/jpeg',
              url: ogImage,
              hasAudio: false,
              hasVideo: false,
              contentLength: 0,
              container: 'jpeg'
            }],
            platform: 'instagram',
            mediaType: 'image',
            directUrl: `/api/direct?url=${encodeURIComponent(ogImage)}`
          };
          
          // Cache the result
          mediaCache.set(cacheKey, result);
          
          return res.json(result);
        }
      }
    } catch (scrapingError) {
      console.error('Instagram HTML scraping failed:', scrapingError);
    }

    // Method 3: Fallback to youtube-dl
    try {
      console.log('Falling back to youtube-dl for Instagram...');
      const info = await youtubeDl(url, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        preferFreeFormats: true,
        addHeader: [
          'referer:https://www.instagram.com',
          `user-agent:${getRandomUserAgent()}`
        ]
      });

      if (info && info.formats && info.formats.length > 0) {
        // Transform formats
        const formats = info.formats.map(format => {
          const isVideo = format.vcodec !== 'none';
          
          return {
            itag: format.format_id,
            quality: format.format_note || 'Original',
            mimeType: isVideo ? 'video/mp4' : 'image/jpeg',
            url: format.url,
            hasAudio: isVideo && format.acodec !== 'none',
            hasVideo: isVideo,
            contentLength: format.filesize || 0,
            container: format.ext || (isVideo ? 'mp4' : 'jpeg')
          };
        });
        
        const result = {
          title: info.title || 'Instagram Media',
          thumbnails: info.thumbnails ? info.thumbnails.map(t => ({ url: t.url, width: t.width, height: t.height })) : [],
          formats: formats,
          platform: 'instagram',
          mediaType: formats.some(f => f.hasVideo) ? 'video' : 'image',
          directUrl: `/api/direct?url=${encodeURIComponent(formats[0].url)}`
        };
        
        // Cache the result
        mediaCache.set(cacheKey, result);
        
        return res.json(result);
      }
    } catch (ytdlError) {
      console.error('youtube-dl fallback for Instagram failed:', ytdlError);
    }

    // If all methods fail
    return res.status(404).json({
      error: 'Could not extract media from Instagram URL',
      details: 'The post might be private or deleted'
    });

  } catch (error) {
    console.error('Instagram error:', error);
    res.status(500).json({ error: 'Instagram processing failed', details: error.message });
  }
});

// Enhanced Pinterest handler
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

    // User agent for Pinterest requests
    const userAgent = getRandomUserAgent();

    // First, get the actual page to find image data
    const response = await fetchWithRetry(url, {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      }
    });

    if (!response) {
      throw new Error('Failed to fetch Pinterest page');
    }

    const html = await response.text();

    // Extract title
    let title = 'Pinterest Image';
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].replace(' | Pinterest', '').trim();
    }

    // Method 1: Find image URLs directly in the HTML
    let imageUrls = [];
    let videoUrls = [];

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

    // Look for videos
    const videoMatch = html.match(/https:\/\/v\.pinimg\.com\/[a-zA-Z0-9\/\._-]+\.mp4/gi);
    if (videoMatch && videoMatch.length > 0) {
      videoUrls = [...new Set(videoMatch)]; // Remove duplicates
    }

    // Method 2: Extract from JSON data
    if (imageUrls.length === 0 && videoUrls.length === 0) {
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

                // Check for videos first
                if (pin.videos && pin.videos.video_list) {
                  Object.values(pin.videos.video_list).forEach(video => {
                    if (video && video.url) {
                      videoUrls.push(video.url);
                    }
                  });
                }

                // Get images if no videos found
                if (videoUrls.length === 0) {
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
              }

              // Extract from multiple pins in a board
              if (resources.board?.pins) {
                resources.board.pins.forEach(pin => {
                  if (pin.videos && pin.videos.video_list) {
                    Object.values(pin.videos.video_list).forEach(video => {
                      if (video && video.url) {
                        videoUrls.push(video.url);
                      }
                    });
                  } else if (pin.images && pin.images.orig) {
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
    if (imageUrls.length === 0 && videoUrls.length === 0) {
      const schemaMatch = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
      if (schemaMatch && schemaMatch[1]) {
        try {
          const schemaData = JSON.parse(schemaMatch[1]);
          // Check for video content first
          if (schemaData.video) {
            if (Array.isArray(schemaData.video)) {
              schemaData.video.forEach(v => {
                if (v.contentUrl) videoUrls.push(v.contentUrl);
              });
            } else if (schemaData.video.contentUrl) {
              videoUrls.push(schemaData.video.contentUrl);
            }
          }
          
          // If no videos, check for images
          if (videoUrls.length === 0 && schemaData.image) {
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

    // Method 4: Extract from og:image and og:video meta tags
    if (imageUrls.length === 0 && videoUrls.length === 0) {
      // Check for video first
      const ogVideoMatch = html.match(/<meta property="og:video:url" content="([^"]+)"/i);
      if (ogVideoMatch && ogVideoMatch[1]) {
        videoUrls.push(ogVideoMatch[1]);
      } else {
        // If no video, check for image
        const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
        if (ogImageMatch && ogImageMatch[1]) {
          imageUrls.push(ogImageMatch[1]);
        }
      }
    }

    // Determine if we have video content (prioritize video)
    const isVideo = videoUrls.length > 0;
    const mediaUrls = isVideo ? videoUrls : imageUrls;

    // Fallback for when no media are found
    if (mediaUrls.length === 0) {
      return res.status(404).json({
        error: 'No media found on this Pinterest page',
        details: 'Try opening the pin in a browser and copying the media URL directly'
      });
    }

    // Remove duplicates and filter out invalid URLs
    const filteredUrls = [...new Set(mediaUrls)].filter(url =>
      url && url.startsWith('http')
    );

    // For videos, prioritize higher resolution versions
    if (isVideo) {
      filteredUrls.sort((a, b) => {
        // Higher quality videos often have higher numbers in the URL
        const getResolution = (url) => {
          const match = url.match(/\/(\d+)x(\d+)\//);
          return match ? parseInt(match[1]) * parseInt(match[2]) : 0;
        };
        
        return getResolution(b) - getResolution(a); // Higher resolution first
      });
    } else {
      // For images, prioritize originals and larger sizes
      filteredUrls.sort((a, b) => {
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
    }

    // Create format objects for each media item
    const formats = filteredUrls.map((url, index) => {
      if (isVideo) {
        // Video quality detection
        let quality = 'Standard';
        const resMatch = url.match(/\/(\d+)x(\d+)\//);
        if (resMatch) {
          quality = `${resMatch[2]}p`; // Use height for video quality
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
      } else {
        // Image quality detection
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
      }
    });

    // Create a direct download URL for the best media
    const directDownloadUrl = `/api/direct?url=${encodeURIComponent(filteredUrls[0])}`;

    // Create the result object
    const result = {
      title: title,
      thumbnails: [{ url: isVideo ? imageUrls[0] || filteredUrls[0] : filteredUrls[0], width: 480, height: 480 }],
      formats: formats,
      platform: 'pinterest',
      mediaType: isVideo ? 'video' : 'image',
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

    // Try multiple user agents for better success rate
    const userAgents = [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1', // Mobile user agent often works better
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
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

      // Method 6: New Facebook video player pattern
      const fbPlayerMatch = html.match(/playable_url":"([^"]+)"/g);
      if (fbPlayerMatch) {
        for (const match of fbPlayerMatch) {
          const urlMatch = match.match(/playable_url":"([^"]+)"/);
          if (urlMatch && urlMatch[1]) {
            results.push({
              quality: 'Facebook Player',
              url: urlMatch[1].replace(/\\/g, '')
            });
          }
        }
      }

      // Method 7: Facebook HD pattern
      const fbHdMatch = html.match(/playable_url_quality_hd":"([^"]+)"/g);
      if (fbHdMatch) {
        for (const match of fbHdMatch) {
          const urlMatch = match.match(/playable_url_quality_hd":"([^"]+)"/);
          if (urlMatch && urlMatch[1]) {
            results.push({
              quality: 'HD Facebook Player',
              url: urlMatch[1].replace(/\\/g, '')
            });
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

    for (const userAgent of userAgents) {
      try {
        const response = await fetchWithRetry(url, {
          headers: {
            'User-Agent': userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
          },
          timeout: 15000 // 15 second timeout
        });

        if (!response) {
          continue; // Try next user agent
        }

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

        // Extract video URLs
        videoUrls = extractVideoUrls(html);

        if (videoUrls.length > 0) {
          console.log(`Found ${videoUrls.length} video URLs with user agent: ${userAgent}`);
          break; // We found videos, stop trying different user agents
        }
      } catch (agentError) {
        console.error(`Error with user agent ${userAgent}:`, agentError);
        continue; // Try next user agent
      }
    }

    // If no videos found through direct extraction, try facebook-downloader library (if available)
    if (videoUrls.length === 0) {
      try {
        // Import the fb-downloader dynamically
        const fbDownloader = require('fb-downloader');
        
        console.log('Trying fb-downloader library for Facebook video...');
        const fbResult = await fbDownloader(url);
        
        if (fbResult && fbResult.success && fbResult.download && fbResult.download.sd) {
          videoUrls.push({
            quality: 'SD',
            url: fbResult.download.sd
          });
          
          if (fbResult.download.hd) {
            videoUrls.push({
              quality: 'HD',
              url: fbResult.download.hd
            });
          }
          
          // Update title and thumbnail if available
          if (fbResult.title) title = fbResult.title;
          if (fbResult.thumbnail) thumbnail = fbResult.thumbnail;
        }
      } catch (fbError) {
        console.error('fb-downloader library failed:', fbError);
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
          addHeader: [
            'referer:facebook.com', 
            `user-agent:${getRandomUserAgent()}`
          ],
          geoBypass: true,
          socketTimeout: 30,
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
        console.error('youtube-dl fallback error:', ytdlError);
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

// Spotify handler
app.get('/api/spotify', async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`Processing Spotify URL: ${url}`);

    // Check cache first
    const cacheKey = `spotify:${url}`;
    const cachedData = mediaCache.get(cacheKey);
    if (cachedData) {
      console.log(`Serving Spotify data from cache for ${url}`);
      return res.json(cachedData);
    }

    // IMPORTANT NOTE: Spotify doesn't allow direct downloads
    // We will extract metadata and provide preview URLs if available

    const response = await fetchWithRetry(url, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      }
    });

    if (!response) {
      throw new Error('Failed to fetch Spotify page');
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract metadata from meta tags
    const title = $('meta[property="og:title"]').attr('content') || 'Spotify Track';
    const description = $('meta[property="og:description"]').attr('content') || '';
    const thumbnail = $('meta[property="og:image"]').attr('content') || '';
    const audioPreview = $('meta[property="og:audio"]').attr('content') || '';
    
    // Extract additional data from JSON-LD if available
    let artist = '';
    let album = '';
    let releaseDate = '';
    let duration = 0;
    
    const jsonLdScripts = $('script[type="application/ld+json"]');
    if (jsonLdScripts.length > 0) {
      try {
        const jsonData = JSON.parse(jsonLdScripts.first().html());
        if (jsonData) {
          if (jsonData.byArtist && jsonData.byArtist.name) {
            artist = jsonData.byArtist.name;
          }
          
          if (jsonData.inAlbum && jsonData.inAlbum.name) {
            album = jsonData.inAlbum.name;
          }
          
          if (jsonData.datePublished) {
            releaseDate = jsonData.datePublished;
          }
          
          if (jsonData.duration) {
            // Convert ISO duration to seconds if possible
            const match = jsonData.duration.match(/PT(\d+)M(\d+)S/);
            if (match) {
              duration = parseInt(match[1]) * 60 + parseInt(match[2]);
            }
          }
        }
      } catch (e) {
        console.error('Error parsing Spotify JSON-LD:', e);
      }
    }

    // Create a limited response with metadata
    // Note: Spotify doesn't allow direct downloads without authentication
    const formats = [];
    
    // Add preview URL if available
    if (audioPreview) {
      formats.push({
        itag: 'spotify_preview',
        quality: 'Preview',
        mimeType: 'audio/mp3',
        url: audioPreview,
        hasAudio: true,
        hasVideo: false,
        contentLength: 0,
        container: 'mp3',
        note: 'Preview only (30 seconds)'
      });
    }

    const result = {
      title: title,
      artist: artist,
      album: album,
      description: description,
      releaseDate: releaseDate,
      duration: duration,
      thumbnails: thumbnail ? [{ url: thumbnail, width: 480, height: 480 }] : [],
      formats: formats,
      platform: 'spotify',
      mediaType: 'audio',
      originalUrl: url,
      note: 'Spotify does not allow direct downloads. Only preview may be available.'
    };
    
    if (formats.length > 0) {
      result.directUrl = `/api/direct?url=${encodeURIComponent(formats[0].url)}`;
    }
    
    // Cache the result
    mediaCache.set(cacheKey, result);

    // Return info
    res.json(result);

  } catch (error) {
    console.error('Spotify error:', error);
    res.status(500).json({ error: 'Spotify processing failed', details: error.message });
  }
});

// SoundCloud handler
app.get('/api/soundcloud', async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Check cache first
    const cacheKey = `soundcloud:${url}`;
    const cachedData = mediaCache.get(cacheKey);
    if (cachedData) {
      console.log(`Serving SoundCloud data from cache for ${url}`);
      return res.json(cachedData);
    }

    console.log(`Processing SoundCloud URL: ${url}`);

    // Try youtube-dl first as it works well with SoundCloud
    try {
      const info = await youtubeDl(url, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        extractAudio: true,
        audioFormat: 'mp3',
        addHeader: [
          'referer:https://soundcloud.com',
          `user-agent:${getRandomUserAgent()}`
        ]
      });

      if (info && info.formats && info.formats.length > 0) {
        // Transform formats to our API format
        const formats = info.formats
          .filter(format => format !== null)
          .map(format => {
            return {
              itag: format.format_id,
              quality: format.format_note || format.quality || 'Standard',
              mimeType: format.ext ? `audio/${format.ext}` : 'audio/mp3',
              url: format.url,
              hasAudio: true,
              hasVideo: false,
              contentLength: format.filesize || format.filesize_approx || 0,
              container: format.ext || 'mp3'
            };
          });

        const result = {
          title: info.title || 'SoundCloud Track',
          thumbnails: info.thumbnails ? info.thumbnails.map(t => ({ url: t.url, width: t.width, height: t.height })) : [],
          duration: info.duration,
          formats: formats,
          platform: 'soundcloud',
          mediaType: 'audio',
          uploader: info.uploader || info.channel || null,
          uploadDate: info.upload_date || null,
          description: info.description || null,
          directUrl: `/api/direct?url=${encodeURIComponent(formats[0].url)}`
        };
        
        // Cache the result
        mediaCache.set(cacheKey, result);
        
        return res.json(result);
      }
    } catch (ytdlError) {
      console.error('youtube-dl failed for SoundCloud:', ytdlError);
      // Continue to fallback methods
    }

    // Fallback: Try HTML scraping
    try {
      const response = await fetchWithRetry(url, {
        headers: {
          'User-Agent': getRandomUserAgent(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        }
      });

      if (!response) {
        throw new Error('Failed to fetch SoundCloud page');
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Extract metadata
      const title = $('meta[property="og:title"]').attr('content') || 'SoundCloud Track';
      const description = $('meta[property="og:description"]').attr('content') || '';
      const thumbnail = $('meta[property="og:image"]').attr('content') || '';
      
      // Try to extract stream URL from page data
      let streamUrl = null;
      
      // Look for JSON data with track info
      const scripts = $('script');
      for (let i = 0; i < scripts.length; i++) {
        const script = $(scripts[i]).html();
        if (script && script.includes('window.__sc_hydration')) {
          try {
            const hydrationMatch = script.match(/window\.__sc_hydration\s*=\s*(\[.*?\]);/s);
            if (hydrationMatch && hydrationMatch[1]) {
              const hydrationData = JSON.parse(hydrationMatch[1]);
              
              // Find the track data
              const trackData = hydrationData.find(item => item.hydratable === 'track');
              if (trackData && trackData.data) {
                // Check for stream URL
                if (trackData.data.media && trackData.data.media.transcodings) {
                  for (const encoding of trackData.data.media.transcodings) {
                    if (encoding.url && encoding.format && encoding.format.protocol === 'progressive') {
                      streamUrl = encoding.url;
                      break;
                    }
                  }
                }
              }
            }
          } catch (e) {
            console.error('Error parsing SoundCloud hydration data:', e);
          }
        }
      }

      // Create formats based on what we found
      const formats = [];
      
      if (streamUrl) {
        formats.push({
          itag: 'sc_stream',
          quality: 'Standard',
          mimeType: 'audio/mp3',
          url: streamUrl,
          hasAudio: true,
          hasVideo: false,
          contentLength: 0,
          container: 'mp3'
        });
      }

      // If no stream URL found, provide at least metadata
      const result = {
        title: title,
        thumbnails: thumbnail ? [{ url: thumbnail, width: 480, height: 480 }] : [],
        formats: formats,
        platform: 'soundcloud',
        mediaType: 'audio',
        description: description
      };
      
      if (formats.length > 0) {
        result.directUrl = `/api/direct?url=${encodeURIComponent(formats[0].url)}`;
      } else {
        result.note = 'Direct download URL not found. SoundCloud may require authentication.';
      }
      
      // Cache the result
      mediaCache.set(cacheKey, result);
      
      return res.json(result);

    } catch (error) {
      throw new Error(`SoundCloud fallback failed: ${error.message}`);
    }

  } catch (error) {
    console.error('SoundCloud error:', error);
    res.status(500).json({ error: 'SoundCloud processing failed', details: error.message });
  }
});

// TikTok handler
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

    // Try youtube-dl first
    try {
      const info = await youtubeDl(url, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        preferFreeFormats: true,
        addHeader: [
          'referer:https://www.tiktok.com',
          `user-agent:${getRandomUserAgent()}`
        ]
      });

      if (info && info.formats && info.formats.length > 0) {
        // Transform formats
        const formats = info.formats
          .filter(format => format !== null)
          .map(format => {
            const isVideo = format.vcodec !== 'none';
            
            // Define quality label
            let qualityLabel = format.format_note || format.quality || 'Unknown';
            if (format.height) {
              qualityLabel = `${format.height}p`;
              if (format.fps) qualityLabel += ` ${format.fps}fps`;
            }

            return {
              itag: format.format_id,
              quality: qualityLabel,
              mimeType: isVideo ? 'video/mp4' : 'audio/mp4',
              url: format.url,
              hasAudio: format.acodec !== 'none',
              hasVideo: isVideo,
              contentLength: format.filesize || format.filesize_approx || 0,
              container: format.ext || 'mp4'
            };
          });

        const result = {
          title: info.title || 'TikTok Video',
          thumbnails: info.thumbnails ? info.thumbnails.map(t => ({ url: t.url, width: t.width, height: t.height })) : [],
          duration: info.duration,
          formats: formats,
          platform: 'tiktok',
          mediaType: 'video',
          uploader: info.uploader || info.channel || null,
          uploadDate: info.upload_date || null,
          description: info.description || null,
          directUrl: `/api/direct?url=${encodeURIComponent(formats[0].url)}`
        };
        
        // Cache the result
        mediaCache.set(cacheKey, result);
        
        return res.json(result);
      }
    } catch (ytdlError) {
      console.error('youtube-dl failed for TikTok:', ytdlError);
      // Continue to fallback methods
    }

    // Fallback: Try HTML scraping
    try {
      const response = await fetchWithRetry(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1', // Mobile user agent works better
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        }
      });

      if (!response) {
        throw new Error('Failed to fetch TikTok page');
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Extract metadata
      const title = $('meta[property="og:title"]').attr('content') || 'TikTok Video';
      const description = $('meta[property="og:description"]').attr('content') || '';
      const thumbnail = $('meta[property="og:image"]').attr('content') || '';
      
      // Try to extract video URL
      let videoUrl = $('meta[property="og:video:url"]').attr('content') ||
                   $('meta[property="og:video"]').attr('content') ||
                   $('meta[property="og:video:secure_url"]').attr('content');
                   
      if (!videoUrl) {
        // Look for videoData in the script tags
        const scripts = $('script');
        for (let i = 0; i < scripts.length; i++) {
          const script = $(scripts[i]).html();
          if (script && script.includes('videoData')) {
            try {
              // Extract URLs from various formats
              const videoDataMatch = script.match(/\"playAddr\":\"([^\"]+)\"/);
              if (videoDataMatch && videoDataMatch[1]) {
                videoUrl = videoDataMatch[1].replace(/\\u002F/g, '/');
              }
              
              if (!videoUrl) {
                const downloadAddrMatch = script.match(/\"downloadAddr\":\"([^\"]+)\"/);
                if (downloadAddrMatch && downloadAddrMatch[1]) {
                  videoUrl = downloadAddrMatch[1].replace(/\\u002F/g, '/');
                }
              }
            } catch (e) {
              console.error('Error parsing TikTok video data:', e);
            }
          }
        }
      }

      if (videoUrl) {
        const formats = [{
          itag: 'tt_video',
          quality: 'Original',
          mimeType: 'video/mp4',
          url: videoUrl,
          hasAudio: true,
          hasVideo: true,
          contentLength: 0,
          container: 'mp4'
        }];

        const result = {
          title: title,
          thumbnails: thumbnail ? [{ url: thumbnail, width: 480, height: 480 }] : [],
          formats: formats,
          platform: 'tiktok',
          mediaType: 'video',
          description: description,
          directUrl: `/api/direct?url=${encodeURIComponent(videoUrl)}`
        };
        
        // Cache the result
        mediaCache.set(cacheKey, result);
        
        return res.json(result);
      } else {
        throw new Error('No video URL found in TikTok page');
      }
    } catch (scrapingError) {
      console.error('TikTok HTML scraping failed:', scrapingError);
      throw new Error(`TikTok fallback methods failed: ${scrapingError.message}`);
    }

  } catch (error) {
    console.error('TikTok error:', error);
    res.status(500).json({ error: 'TikTok processing failed', details: error.message });
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

    // For other platforms, use youtube-dl
    try {
      // Use youtube-dl for all platforms since it supports most sites
      const info = await youtubeDl(url, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        preferFreeFormats: true,
        addHeader: ['referer:' + new URL(url).origin, `user-agent:${getRandomUserAgent()}`]
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
      let bestFormat = formats.find(f => f.quality.includes('720p')) || formats[0];
      if (bestFormat) {
        result.directUrl = `/api/direct?url=${encodeURIComponent(bestFormat.url)}`;
      }
      
      return res.json(result);
    } catch (ytdlError) {
      console.error('youtube-dl error:', ytdlError);

      // Fallback: Try HTML scraping for basic metadata
      try {
        const response = await fetchWithRetry(url, {
          headers: {
            'User-Agent': getRandomUserAgent(),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          }
        });

        if (response) {
          const html = await response.text();
          const $ = cheerio.load(html);
          
          // Extract basic metadata
          const title = $('meta[property="og:title"]').attr('content') || 
                      $('title').text() || 
                      `Media from ${platform}`;
                      
          const thumbnail = $('meta[property="og:image"]').attr('content') || 
                          $('meta[name="twitter:image"]').attr('content') ||
                          `https://via.placeholder.com/480x360.png?text=${encodeURIComponent(platform)}`;
                          
          const description = $('meta[property="og:description"]').attr('content') || 
                            $('meta[name="description"]').attr('content') || 
                            null;
          
          // Look for video or audio
          const mediaUrl = $('meta[property="og:video"]').attr('content') || 
                         $('meta[property="og:video:url"]').attr('content') || 
                         $('meta[property="og:audio"]').attr('content') || 
                         null;
          
          const formats = [];
          if (mediaUrl) {
            formats.push({
              itag: 'html_media',
              quality: 'Original',
              mimeType: mediaType === 'audio' ? 'audio/mp3' : 'video/mp4',
              url: mediaUrl,
              hasAudio: true,
              hasVideo: mediaType === 'video',
              contentLength: 0,
              container: mediaType === 'audio' ? 'mp3' : 'mp4'
            });
          } else {
            // Add original URL as fallback
            formats.push({
              itag: 'best',
              quality: 'Best available',
              mimeType: mediaType === 'audio' ? 'audio/mp3' : 'video/mp4',
              url: url,
              hasAudio: true,
              hasVideo: mediaType === 'video',
              contentLength: 0,
              container: mediaType === 'audio' ? 'mp3' : 'mp4'
            });
          }
          
          const result = {
            title: title,
            thumbnails: [{ url: thumbnail, width: 480, height: 360 }],
            formats: formats,
            platform: platform,
            mediaType: mediaType,
            description: description
          };
          
          if (formats.length > 0) {
            result.directUrl = `/api/direct?url=${encodeURIComponent(formats[0].url)}`;
          }
          
          return res.json(result);
        }
      } catch (scrapingError) {
        console.error('HTML scraping fallback failed:', scrapingError);
      }

      // Ultra fallback - just return some basic info
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

// Download endpoint with enhanced error handling and retry
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
      addHeader: [
        'referer:' + new URL(url).origin, 
        `user-agent:${getRandomUserAgent()}`
      ],
      retries: 3,
      socketTimeout: 30
    };

    // If format is specified, use it
    if (itag && itag !== 'best') {
      options.format = itag;
    }

    // Try downloading with retry mechanism
    try {
      await retry(async (bail) => {
        try {
          await youtubeDl(url, options);
          if (!fs.existsSync(tempFilePath)) {
            throw new Error('Download failed - file not created');
          }
          return true;
        } catch (err) {
          console.error('youtube-dl error (retrying):', err.message);
          throw err; // This will trigger a retry
        }
      }, {
        retries: 3,
        factor: 2,
        minTimeout: 2000,
        maxTimeout: 10000,
        onRetry: (error, attempt) => {
          console.log(`Download attempt ${attempt} failed: ${error.message}`);
        }
      });
    } catch (ytdlErr) {
      console.error('youtube-dl download error after retries:', ytdlErr);

      // For very troublesome sites, try a direct fetch approach
      if (!fs.existsSync(tempFilePath)) {
        console.log('Attempting direct download as fallback...');
        
        try {
          const downloadResponse = await fetchWithRetry(url, {
            headers: {
              'User-Agent': getRandomUserAgent(),
              'Referer': new URL(url).origin
            }
          });

          if (!downloadResponse) {
            throw new Error('Direct download failed');
          }

          const fileStream = fs.createWriteStream(tempFilePath);
          await new Promise((resolve, reject) => {
            downloadResponse.body.pipe(fileStream);
            downloadResponse.body.on('error', reject);
            fileStream.on('finish', resolve);
          });
          
          // Verify the file was created properly
          if (!fs.existsSync(tempFilePath) || fs.statSync(tempFilePath).size === 0) {
            throw new Error('Download failed - empty file created');
          }
        } catch (directErr) {
          throw new Error(`Direct download failed: ${directErr.message}`);
        }
      }
    }

    // Check if file exists and has size
    if (!fs.existsSync(tempFilePath) || fs.statSync(tempFilePath).size === 0) {
      throw new Error('Download failed - file not created or empty');
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

// Audio-only download endpoint with improved quality
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
      addHeader: [
        'referer:' + new URL(url).origin, 
        `user-agent:${getRandomUserAgent()}`
      ],
      retries: 3,
      socketTimeout: 30
    };

    // If format is specified, use it
    if (itag && itag !== 'best') {
      options.format = itag;
    } else {
      options.formatSort = 'bestaudio';
    }

    // Try downloading with retry mechanism
    try {
      await retry(async (bail) => {
        try {
          await youtubeDl(url, options);
          if (!fs.existsSync(tempFilePath)) {
            throw new Error('Download failed - file not created');
          }
          return true;
        } catch (err) {
          console.error('youtube-dl audio error (retrying):', err.message);
          throw err; // This will trigger a retry
        }
      }, {
        retries: 3,
        factor: 2,
        minTimeout: 2000,
        maxTimeout: 10000,
        onRetry: (error, attempt) => {
          console.log(`Audio download attempt ${attempt} failed: ${error.message}`);
        }
      });
    } catch (ytdlErr) {
      console.error('youtube-dl audio download error after retries:', ytdlErr);

      // For troublesome sites, try a more specific audio format
      if (!fs.existsSync(tempFilePath)) {
        console.log('Attempting audio download with alternate method...');
        options.format = 'bestaudio/best';
        try {
          await youtubeDl(url, options);
        } catch (altError) {
          console.error('Alternative audio extraction failed:', altError);
          throw new Error('Audio extraction failed after multiple attempts');
        }
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
      const headResponse = await fetchWithRetry(url, {
        method: 'HEAD',
        headers,
        redirect: 'follow'
      });

      if (headResponse) {
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

    // Try to fetch the content with retry mechanism
    try {
      const response = await fetchWithRetry(url, {
        headers,
        redirect: 'follow'
      });

      if (!response) {
        throw new Error('Failed to fetch content');
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
