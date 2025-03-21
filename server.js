// server.js - Enhanced with your existing packages
const express = require('express');
const cors = require('cors');
const youtubeDl = require('youtube-dl-exec');
const ytdl = require('ytdl-core');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const cheerio = require('cheerio');
const fbDownloader = require('fb-downloader');
const tikTokScraper = require('tiktok-scraper');
const pinterestScraper = require('pinterest-scraper');
const SoundCloud = require('soundcloud-downloader').default;

// For ES module imports like node-fetch
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

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
  res.send('Multi-Platform Download API is running');
});

// =============== PLATFORM DETECTION ===============
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

// =============== INSTAGRAM SPECIFIC ENDPOINT ===============
app.get('/api/instagram', async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`Processing Instagram URL: ${url}`);

    // First, try using youtube-dl (which works well for Instagram)
    try {
      const info = await youtubeDl(url, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        addHeader: ['referer:instagram.com', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.82 Safari/537.36']
      });

      if (info && info.formats && info.formats.length > 0) {
        // Transform formats to our API structure
        const formats = info.formats.map((format, index) => {
          const isVideo = format.vcodec !== 'none';
          return {
            itag: `ig_${index}`,
            quality: format.format_note || format.height ? `${format.height}p` : 'Standard',
            mimeType: isVideo ? 'video/mp4' : 'image/jpeg',
            url: format.url,
            hasAudio: isVideo,
            hasVideo: isVideo,
            contentLength: format.filesize || 0,
            container: format.ext || (isVideo ? 'mp4' : 'jpeg')
          };
        });

        // Return video info
        res.json({
          title: info.title || 'Instagram Media',
          thumbnails: info.thumbnails ? info.thumbnails.map(t => ({ url: t.url, width: t.width, height: t.height })) : [],
          formats: formats,
          platform: 'instagram',
          mediaType: formats[0].hasVideo ? 'video' : 'image',
          directUrl: `/api/direct?url=${encodeURIComponent(formats[0].url)}`
        });
        return;
      }
    } catch (ytdlErr) {
      console.error('Youtube-dl for Instagram failed:', ytdlErr);
    }

    // Fallback: Fetch the Instagram page and parse it manually
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36';
    const response = await fetch(url, {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Instagram page: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract metadata from JSON
    let jsonData = null;
    $('script[type="application/ld+json"]').each((i, el) => {
      try {
        const data = JSON.parse($(el).html());
        if (data && (data.video || data.image)) {
          jsonData = data;
        }
      } catch (e) {
        // Ignore parsing errors
      }
    });

    // Look for shared data (window._sharedData)
    if (!jsonData) {
      const sharedDataMatch = html.match(/<script type="text\/javascript">window\._sharedData = (.+);<\/script>/);
      if (sharedDataMatch && sharedDataMatch[1]) {
        try {
          const sharedData = JSON.parse(sharedDataMatch[1]);
          const mediaData = sharedData.entry_data?.PostPage?.[0]?.graphql?.shortcode_media;
          
          if (mediaData) {
            if (mediaData.is_video) {
              jsonData = {
                video: mediaData.video_url,
                image: mediaData.display_url,
                description: mediaData.edge_media_to_caption?.edges[0]?.node?.text || 'Instagram Video'
              };
            } else {
              jsonData = {
                image: mediaData.display_url,
                description: mediaData.edge_media_to_caption?.edges[0]?.node?.text || 'Instagram Image'
              };
            }
          }
        } catch (e) {
          console.error('Error parsing shared data:', e);
        }
      }
    }

    // Extract relevant data
    if (jsonData) {
      const isVideo = !!jsonData.video;
      const mediaUrl = isVideo ? jsonData.video : jsonData.image;
      const thumbnailUrl = jsonData.image || jsonData.thumbnailUrl;
      const title = jsonData.description || jsonData.name || 'Instagram Media';

      const formats = [{
        itag: 'ig_1',
        quality: 'Standard',
        mimeType: isVideo ? 'video/mp4' : 'image/jpeg',
        url: mediaUrl,
        hasAudio: isVideo,
        hasVideo: isVideo,
        contentLength: 0,
        container: isVideo ? 'mp4' : 'jpeg'
      }];

      res.json({
        title: title,
        thumbnails: [{ url: thumbnailUrl, width: 640, height: 640 }],
        formats: formats,
        platform: 'instagram',
        mediaType: isVideo ? 'video' : 'image',
        directUrl: `/api/direct?url=${encodeURIComponent(mediaUrl)}`
      });
      return;
    }

    // Last resort: look for og:video or og:image
    const ogVideo = $('meta[property="og:video"]').attr('content') || $('meta[property="og:video:secure_url"]').attr('content');
    const ogImage = $('meta[property="og:image"]').attr('content') || $('meta[property="og:image:secure_url"]').attr('content');
    const ogTitle = $('meta[property="og:title"]').attr('content') || 'Instagram Media';

    if (ogVideo || ogImage) {
      const mediaUrl = ogVideo || ogImage;
      const isVideo = !!ogVideo;

      const formats = [{
        itag: 'ig_og',
        quality: 'Standard',
        mimeType: isVideo ? 'video/mp4' : 'image/jpeg',
        url: mediaUrl,
        hasAudio: isVideo,
        hasVideo: isVideo,
        contentLength: 0,
        container: isVideo ? 'mp4' : 'jpeg'
      }];

      res.json({
        title: ogTitle,
        thumbnails: [{ url: ogImage || mediaUrl, width: 640, height: 640 }],
        formats: formats,
        platform: 'instagram',
        mediaType: isVideo ? 'video' : 'image',
        directUrl: `/api/direct?url=${encodeURIComponent(mediaUrl)}`
      });
      return;
    }

    // If we got here, we couldn't find any media
    throw new Error('Could not extract media from Instagram URL');

  } catch (error) {
    console.error('Instagram error:', error);
    res.status(500).json({ error: 'Instagram processing failed', details: error.message });
  }
});

// =============== YOUTUBE SPECIFIC ENDPOINT ===============
app.get('/api/youtube', async (req, res) => {
  try {
    const url = req.query.url;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`Processing YouTube URL: ${url}`);

    // First try with ytdl-core
    try {
      const info = await ytdl.getInfo(url);
      
      if (info && info.formats && info.formats.length > 0) {
        // Transform to match our API structure
        const formats = info.formats.map((format, index) => {
          // Check if it has video
          const hasVideo = format.hasVideo || (format.qualityLabel !== null);
          
          // Determine quality
          let quality = format.qualityLabel || 'Unknown';
          if (!hasVideo && format.audioBitrate) {
            quality = `${format.audioBitrate}kbps Audio`;
          }
          
          return {
            itag: format.itag.toString(),
            quality: quality,
            mimeType: format.mimeType || 'unknown',
            url: format.url,
            hasAudio: format.hasAudio,
            hasVideo: hasVideo,
            contentLength: parseInt(format.contentLength) || 0,
            container: format.container || 'mp4'
          };
        });

        // Get video details
        const videoDetails = info.videoDetails;
        
        res.json({
          title: videoDetails.title || 'YouTube Video',
          thumbnails: videoDetails.thumbnails ? videoDetails.thumbnails.map(t => ({ 
            url: t.url, 
            width: t.width, 
            height: t.height 
          })) : [],
          duration: parseInt(videoDetails.lengthSeconds) || 0,
          formats: formats,
          platform: 'youtube',
          mediaType: 'video',
          uploader: videoDetails.author ? videoDetails.author.name : null,
          uploadDate: videoDetails.publishDate,
          description: videoDetails.description || null
        });
        return;
      }
    } catch (ytdlError) {
      console.error('ytdl-core error:', ytdlError);
      console.log('Falling back to youtube-dl for YouTube...');
    }

    // Fallback to youtube-dl if ytdl-core fails
    const info = await youtubeDl(url, {
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true,
      addHeader: ['referer:youtube.com', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.82 Safari/537.36']
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
      title: info.title || 'YouTube Video',
      thumbnails: info.thumbnails ? info.thumbnails.map(t => ({ url: t.url, width: t.width, height: t.height })) : [],
      duration: info.duration,
      formats: formats,
      platform: 'youtube',
      mediaType: 'video',
      uploader: info.uploader || info.channel || null,
      uploadDate: info.upload_date || null,
      description: info.description || null
    });

  } catch (error) {
    console.error('YouTube error:', error);
    res.status(500).json({ error: 'YouTube processing failed', details: error.message });
  }
});

// =============== FACEBOOK SPECIFIC ENDPOINT ===============
app.get('/api/facebook', async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`Processing Facebook URL: ${url}`);

    // Try using fb-downloader
    try {
      const result = await fbDownloader.download(url);
      
      if (result && result.success) {
        const videoData = result.download;
        
        // Create formats array
        const formats = [];
        
        if (videoData.sd) {
          formats.push({
            itag: 'fb_sd',
            quality: 'SD',
            mimeType: 'video/mp4',
            url: videoData.sd,
            hasAudio: true,
            hasVideo: true,
            contentLength: 0,
            container: 'mp4'
          });
        }
        
        if (videoData.hd) {
          formats.push({
            itag: 'fb_hd',
            quality: 'HD',
            mimeType: 'video/mp4',
            url: videoData.hd,
            hasAudio: true,
            hasVideo: true,
            contentLength: 0,
            container: 'mp4'
          });
        }
        
        // Check if we got any formats
        if (formats.length > 0) {
          // Get direct URL for the highest quality video
          const directUrl = `/api/direct?url=${encodeURIComponent(formats[0].url)}`;
          
          res.json({
            title: result.title || 'Facebook Video',
            thumbnails: result.thumbnail ? [{ url: result.thumbnail, width: 480, height: 360 }] : [],
            formats: formats,
            platform: 'facebook',
            mediaType: 'video',
            directUrl: directUrl
          });
          return;
        }
      }
    } catch (fbError) {
      console.error('fb-downloader error:', fbError);
      console.log('Falling back to HTML extraction...');
    }

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
      const $ = cheerio.load(html);
      const ogVideo = $('meta[property="og:video:url"]').attr('content');
      if (ogVideo) {
        results.push({
          quality: 'og:video',
          url: ogVideo
        });
      }

      // Method 5: Look for og:video:secure_url content
      const ogVideoSecure = $('meta[property="og:video:secure_url"]').attr('content');
      if (ogVideoSecure) {
        results.push({
          quality: 'og:video:secure',
          url: ogVideoSecure
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
        const response = await fetch(url, {
          headers: {
            'User-Agent': userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
          },
          timeout: 10000 // 10 second timeout
        });

        if (!response.ok) {
          continue; // Try next user agent
        }

        html = await response.text();
        const $ = cheerio.load(html);

        // Extract title
        title = $('title').text().replace(' | Facebook', '').trim();

        // Extract thumbnail
        thumbnail = $('meta[property="og:image"]').attr('content');

        // Extract video URLs
        videoUrls = extractVideoUrls(html);

        if (videoUrls.length > 0) {
          break; // We found videos, stop trying different user agents
        }
      } catch (agentError) {
        console.error(`Error with user agent ${userAgent}:`, agentError);
        continue; // Try next user agent
      }
    }

    // If no videos found through direct extraction, try youtube-dl as fallback
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

// =============== TIKTOK SPECIFIC ENDPOINT ===============
app.get('/api/tiktok', async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`Processing TikTok URL: ${url}`);

    // Try using tiktok-scraper
    try {
      const videoData = await tikTokScraper.getVideoMeta(url);
      
      if (videoData && videoData.collector && videoData.collector.length > 0) {
        const video = videoData.collector[0];
        
        // Create formats array
        const formats = [];
        
        // No watermark version (if available)
        if (video.videoUrlNoWaterMark) {
          formats.push({
            itag: 'tt_nowm',
            quality: 'No Watermark',
            mimeType: 'video/mp4',
            url: video.videoUrlNoWaterMark,
            hasAudio: true,
            hasVideo: true,
            contentLength: 0,
            container: 'mp4'
          });
        }
        
        // With watermark version
        if (video.videoUrl) {
          formats.push({
            itag: 'tt_wm',
            quality: 'With Watermark',
            mimeType: 'video/mp4',
            url: video.videoUrl,
            hasAudio: true,
            hasVideo: true,
            contentLength: 0,
            container: 'mp4'
          });
        }
        
        // Check if we got any formats
        if (formats.length > 0) {
          // Get direct URL for the best quality video (no watermark preferred)
          const directUrl = `/api/direct?url=${encodeURIComponent(formats[0].url)}`;
          
          res.json({
            title: video.text || 'TikTok Video',
            thumbnails: video.covers ? video.covers.map((url, i) => ({ url, width: 480, height: 480 })) : [],
            formats: formats,
            platform: 'tiktok',
            mediaType: 'video',
            directUrl: directUrl,
            uploader: video.authorMeta ? video.authorMeta.name : null,
            uploadDate: new Date(video.createTime * 1000).toISOString().split('T')[0]
          });
          return;
        }
      }
    } catch (ttError) {
      console.error('tiktok-scraper error:', ttError);
      console.log('Falling back to youtube-dl...');
    }

    // Fallback to youtube-dl
    const info = await youtubeDl(url, {
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true,
      addHeader: ['referer:tiktok.com', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.82 Safari/537.36']
    });

    if (info.formats && info.formats.length > 0) {
      // Transform formats to match our API structure
      const formats = info.formats.map((format, index) => {
        return {
          itag: `tt_${index}`,
          quality: format.format_note || format.height ? `${format.height}p` : 'Standard',
          mimeType: 'video/mp4',
          url: format.url,
          hasAudio: format.acodec !== 'none',
          hasVideo: format.vcodec !== 'none',
          contentLength: format.filesize || 0,
          container: format.ext || 'mp4'
        };
      });

      // Return the video info
      res.json({
        title: info.title || 'TikTok Video',
        thumbnails: info.thumbnails ? info.thumbnails.map(t => ({ url: t.url, width: t.width, height: t.height })) : [],
        formats: formats,
        platform: 'tiktok',
        mediaType: 'video',
        directUrl: `/api/direct?url=${encodeURIComponent(formats[0].url)}`,
        uploader: info.uploader || info.channel,
        uploadDate: info.upload_date
      });
    } else {
      throw new Error('No video formats found for TikTok URL');
    }

  } catch (error) {
    console.error('TikTok error:', error);
    res.status(500).json({ error: 'TikTok processing failed', details: error.message });
  }
});

// =============== PINTEREST HANDLER ===============
app.get('/api/pinterest', async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`Processing Pinterest URL: ${url}`);

    // Try using pinterest-scraper
    try {
      const pinData = await pinterestScraper.scrape(url);
      
      if (pinData && pinData.url) {
        // Determine if it's an image or video
        const isVideo = pinData.url.includes('.mp4') || pinData.type === 'video';
        
        const formats = [{
          itag: 'pin_1',
          quality: 'Original',
          mimeType: isVideo ? 'video/mp4' : 'image/jpeg',
          url: pinData.url,
          hasAudio: isVideo,
          hasVideo: isVideo,
          contentLength: 0,
          container: isVideo ? 'mp4' : 'jpeg'
        }];
        
        res.json({
          title: pinData.title || 'Pinterest Media',
          thumbnails: [{ url: pinData.thumbnail || pinData.url, width: 480, height: 480 }],
          formats: formats,
          platform: 'pinterest',
          mediaType: isVideo ? 'video' : 'image',
          directUrl: `/api/direct?url=${encodeURIComponent(pinData.url)}`
        });
        return;
      }
    } catch (pinError) {
      console.error('pinterest-scraper error:', pinError);
      console.log('Falling back to manual extraction...');
    }

    // User agent for Pinterest requests
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36';

    // First, get the actual page to find image data
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
    const $ = cheerio.load(html);

    // Extract title
    let title = 'Pinterest Image';
    const ogTitle = $('meta[property="og:title"]').attr('content');
    if (ogTitle) {
      title = ogTitle.replace(' | Pinterest', '').trim();
    }

    // Method 1: Find image URLs directly in the HTML using Cheerio
    let imageUrls = [];

    // Look for meta tags first
    const ogImage = $('meta[property="og:image"]').attr('content');
    const ogVideo = $('meta[property="og:video"]').attr('content') || $('meta[property="og:video:url"]').attr('content');
    
    if (ogVideo) {
      imageUrls.push(ogVideo);
    } else if (ogImage) {
      imageUrls.push(ogImage);
    }

    // If nothing found yet, try regex on the raw HTML
    if (imageUrls.length === 0) {
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
    }

    // Method 2: Extract from JSON data
    if (imageUrls.length === 0) {
      $('script').each((i, el) => {
        const content = $(el).html();
        if (content && content.includes('"image_url"')) {
          try {
            // Look for a JSON structure with image_url
            const jsonMatch = content.match(/\{[^{}]*"image_url"\s*:\s*"([^"]+)"[^{}]*\}/);
            if (jsonMatch && jsonMatch[1]) {
              imageUrls.push(jsonMatch[1]);
            }
          } catch (e) {
            // Ignore parsing errors
          }
        }
      });
    }

    // Fallback for when no images are found
    if (imageUrls.length === 0) {
      // Try youtube-dl as last resort
      try {
        const info = await youtubeDl(url, {
          dumpSingleJson: true,
          noCheckCertificates: true,
          noWarnings: true,
          addHeader: ['referer:pinterest.com', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.82 Safari/537.36']
        });

        if (info.formats && info.formats.length > 0) {
          imageUrls = info.formats.map(f => f.url);
          if (info.title) title = info.title;
        } else if (info.url) {
          imageUrls = [info.url];
          if (info.title) title = info.title;
        }
      } catch (ytdlError) {
        console.error('youtube-dl fallback error:', ytdlError);
      }
      
      if (imageUrls.length === 0) {
        return res.status(404).json({
          error: 'No images found on this Pinterest page',
          details: 'Try opening the pin in a browser and copying the image URL directly'
        });
      }
    }

    // Remove duplicates and filter out invalid URLs
    imageUrls = [...new Set(imageUrls)].filter(url =>
      url && url.startsWith('http')
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

      // Check if it's a video
      const isVideo = url.toLowerCase().endsWith('.mp4') || url.toLowerCase().includes('video');

      // Determine format
      let format = 'jpg';
      if (url.toLowerCase().endsWith('.png')) format = 'png';
      else if (url.toLowerCase().endsWith('.gif')) format = 'gif';
      else if (url.toLowerCase().endsWith('.webp')) format = 'webp';
      else if (url.toLowerCase().endsWith('.mp4')) format = 'mp4';

      return {
        itag: `pin_${index}`,
        quality: quality,
        mimeType: isVideo ? `video/${format}` : `image/${format}`,
        url: url,
        hasAudio: isVideo,
        hasVideo: isVideo,
        contentLength: 0,
        container: format
      };
    });

    // Create a direct download URL for the best image
    const directDownloadUrl = `/api/direct?url=${encodeURIComponent(imageUrls[0])}`;

    // Return the image info
    res.json({
      title: title,
      thumbnails: [{ url: imageUrls[0], width: 480, height: 480 }],
      formats: formats,
      platform: 'pinterest',
      mediaType: formats[0].hasVideo ? 'video' : 'image',
      directUrl: directDownloadUrl
    });

  } catch (error) {
    console.error('Pinterest error:', error);
    res.status(500).json({ error: 'Pinterest processing failed', details: error.message });
  }
});

// =============== SOUNDCLOUD SPECIFIC ENDPOINT ===============
app.get('/api/soundcloud', async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`Processing SoundCloud URL: ${url}`);

    // Initialize SoundCloud downloader with client ID
    const scdl = new SoundCloud();
    
    // Get info
    const info = await scdl.getInfo(url);
    
    if (info) {
      // Get download URL
      const downloadUrl = await scdl.download(url);
      
      // Format response
      const formats = [{
        itag: 'sc_mp3',
        quality: 'Original',
        mimeType: 'audio/mpeg',
        url: downloadUrl,
        hasAudio: true,
        hasVideo: false,
        contentLength: 0,
        container: 'mp3'
      }];
      
      res.json({
        title: info.title || 'SoundCloud Track',
        thumbnails: info.artwork_url ? [{ url: info.artwork_url, width: 480, height: 480 }] : [],
        duration: Math.floor(info.duration / 1000), // Convert ms to seconds
        formats: formats,
        platform: 'soundcloud',
        mediaType: 'audio',
        uploader: info.user?.username || null,
        description: info.description || null,
        directUrl: `/api/direct?url=${encodeURIComponent(downloadUrl)}`
      });
      
    } else {
      throw new Error('Could not get SoundCloud track information');
    }

  } catch (scError) {
    console.error('SoundCloud error:', scError);
    
    // Fallback to youtube-dl if SoundCloud downloader fails
    try {
      console.log('Falling back to youtube-dl for SoundCloud...');
      
      const info = await youtubeDl(req.query.url, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        addHeader: ['referer:soundcloud.com', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.82 Safari/537.36']
      });

      if (info.formats && info.formats.length > 0) {
        // Transform formats to match our API structure
        const formats = info.formats.map((format, index) => {
          return {
            itag: `sc_${index}`,
            quality: format.format_note || format.abr ? `${format.abr}kbps` : 'Standard',
            mimeType: `audio/${format.ext || 'mp3'}`,
            url: format.url,
            hasAudio: true,
            hasVideo: false,
            contentLength: format.filesize || 0,
            container: format.ext || 'mp3'
          };
        });

        // Return audio info
        res.json({
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
        });
      } else {
        throw new Error('No audio formats found for SoundCloud URL');
      }
    } catch (ytdlError) {
      console.error('youtube-dl fallback error:', ytdlError);
      res.status(500).json({ error: 'SoundCloud processing failed', details: scError.message });
    }
  }
});

// =============== UNIVERSAL INFO ENDPOINT ===============
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
    if (platform === 'youtube') {
      const response = await fetch(`http://localhost:${PORT}/api/youtube?url=${encodeURIComponent(url)}`);
      const data = await response.json();
      return res.json(data);
    }
    else if (platform === 'instagram') {
      const response = await fetch(`http://localhost:${PORT}/api/instagram?url=${encodeURIComponent(url)}`);
      const data = await response.json();
      return res.json(data);
    }
    else if (platform === 'pinterest') {
      const response = await fetch(`http://localhost:${PORT}/api/pinterest?url=${encodeURIComponent(url)}`);
      const data = await response.json();
      return res.json(data);
    }
    else if (platform === 'facebook') {
      const response = await fetch(`http://localhost:${PORT}/api/facebook?url=${encodeURIComponent(url)}`);
      const data = await response.json();
      return res.json(data);
    }
    else if (platform === 'tiktok') {
      const response = await fetch(`http://localhost:${PORT}/api/tiktok?url=${encodeURIComponent(url)}`);
      const data = await response.json();
      return res.json(data);
    }
    else if (platform === 'soundcloud') {
      const response = await fetch(`http://localhost:${PORT}/api/soundcloud?url=${encodeURIComponent(url)}`);
      const data = await response.json();
      return res.json(data);
    }

    // For other platforms, use youtube-dl
    try {
      // Use youtube-dl for all platforms since it supports most sites
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
      console.error('youtube-dl error:', ytdlError);

      // Fallback response for platforms youtube-dl can't handle
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

// =============== DOWNLOAD ENDPOINT ===============
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
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.82 Safari/537.36',
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
    res.status(500).json({ error: 'Download failed', details: error.message });
  }
});

// =============== AUDIO-ONLY DOWNLOAD ENDPOINT ===============
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
      throw new Error('Download failed - file not created');
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

// =============== DIRECT DOWNLOAD ENDPOINT ===============
app.get('/api/direct', async (req, res) => {
  try {
    const { url, filename } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`Processing direct download: ${url}`);

    // Prepare headers with a rotation of user agents to avoid blocking
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

// =============== BATCH DOWNLOAD ENDPOINT ===============
app.post('/api/batch-download', async (req, res) => {
  try {
    const { urls } = req.body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: 'URLs array is required' });
    }

    console.log(`Processing batch download - ${urls.length} URLs`);

    // Create response object to track progress
    const batchResponse = {
      id: Date.now().toString(),
      total: urls.length,
      completed: 0,
      failed: 0,
      results: []
    };

    // Send initial response to client
    res.json(batchResponse);

    // Process each URL in sequence
    for (const url of urls) {
      try {
        const platform = detectPlatform(url);
        
        // Get information about the media
        let infoUrl = `http://localhost:${PORT}/api/info?url=${encodeURIComponent(url)}`;
        const infoResponse = await fetch(infoUrl);
        
        if (!infoResponse.ok) {
          throw new Error(`Failed to get info: ${infoResponse.statusText}`);
        }
        
        const info = await infoResponse.json();
        
        // Choose best format
        let bestFormat = null;
        
        if (info.formats && info.formats.length > 0) {
          // Choose HD video if available
          if (info.mediaType === 'video') {
            bestFormat = info.formats.find(f => 
              f.quality && (f.quality.includes('720p') || f.quality.includes('HD'))
            );
          }
          
          // If no HD, choose any format with both audio and video
          if (!bestFormat) {
            bestFormat = info.formats.find(f => f.hasAudio && f.hasVideo);
          }
          
          // If still nothing, take first format
          if (!bestFormat) {
            bestFormat = info.formats[0];
          }
        }
        
        // Generate unique ID for download
        const downloadId = `${platform}_${Date.now()}`;
        
        // Add to results
        batchResponse.results.push({
          url: url,
          id: downloadId,
          platform: platform,
          title: info.title || 'Unknown',
          mediaType: info.mediaType || 'video',
          thumbnail: info.thumbnails && info.thumbnails.length > 0 ? info.thumbnails[0].url : null,
          format: bestFormat ? bestFormat.quality : 'best',
          status: 'completed'
        });
        
        batchResponse.completed++;
        
      } catch (error) {
        console.error(`Error processing URL ${url}:`, error);
        
        batchResponse.results.push({
          url: url,
          status: 'failed',
          error: error.message
        });
        
        batchResponse.failed++;
      }
    }

    console.log(`Batch download completed - ${batchResponse.completed} succeeded, ${batchResponse.failed} failed`);

  } catch (error) {
    console.error('Batch download error:', error);
    // Don't send error response here since we already sent the initial response
  }
});

// =============== MOCK DATA FOR TESTING ===============
app.get('/api/mock-videos', (req, res) => {
  const mockData = [
    { id: 1, name: "Video 1", source: "YouTube", url: "https://youtube.com/video1" },
    { id: 2, name: "Video 2", source: "Vimeo", url: "https://vimeo.com/video2" },
    { id: 3, name: "Video 3", source: "Dailymotion", url: "https://dailymotion.com/video3" }
  ];

  res.status(200).json({
    success: true,
    data: mockData
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Enhanced multi-platform server running on port ${PORT}`);
  console.log(`Server accessible at http://localhost:${PORT}`);
  console.log(`Temporary directory: ${TEMP_DIR}`);
});
