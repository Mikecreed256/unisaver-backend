// server.js - Comprehensive solution with enhanced platform support
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const youtubeDl = require('youtube-dl-exec');
const ytdl = require('ytdl-core');
const tiktokScraper = require('tiktok-scraper');
const fbDownloader = require('fb-downloader');
const instagramUrlDirect = require('instagram-url-direct');
const { TwitterScraper } = require('@yimura/scraper');
const { Stream } = require('stream');
const { promisify } = require('util');
const pipeline = promisify(Stream.pipeline);
const urlParser = require('url');
const axios = require('axios');
const redditFetch = require('reddit-fetch');

// For node-fetch (ESM module)
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

// Configure axios
axios.defaults.timeout = 30000;
axios.defaults.headers.common['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36';

// Increase timeout for external requests
http.globalAgent.maxSockets = 25;
https.globalAgent.maxSockets = 25;
http.globalAgent.keepAlive = true;
https.globalAgent.keepAlive = true;

// Collection of User Agents for bypassing restrictions
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.45 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Safari/605.1.15',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36'
];

// Routes
app.get('/', (req, res) => {
  res.send('Media Downloader API is running');
});

// HELPER FUNCTIONS

// Get random User Agent
function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
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

// Helper: Get webpage content with retry mechanism
async function getWebpageContent(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const userAgent = getRandomUserAgent();
      const response = await axios.get(url, {
        headers: {
          'User-Agent': userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
        },
        timeout: 10000
      });
      
      return response.data;
    } catch (error) {
      console.error(`Attempt ${i+1} failed for ${url}:`, error.message);
      if (i === retries - 1) throw error;
    }
  }
}

// Helper: Extract title from HTML
function extractTitleFromHtml(html) {
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
  return titleMatch ? titleMatch[1].trim() : null;
}

// Helper: Extract meta tags from HTML
function extractMetaTags(html) {
  const metaTags = {};
  
  // OG tags
  const ogTitleMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]*)"[^>]*>/i);
  const ogImageMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]*)"[^>]*>/i);
  const ogVideoMatch = html.match(/<meta[^>]*property="og:video"[^>]*content="([^"]*)"[^>]*>/i);
  const ogVideoUrlMatch = html.match(/<meta[^>]*property="og:video:url"[^>]*content="([^"]*)"[^>]*>/i);
  const ogDescriptionMatch = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]*)"[^>]*>/i);
  
  if (ogTitleMatch) metaTags.ogTitle = ogTitleMatch[1];
  if (ogImageMatch) metaTags.ogImage = ogImageMatch[1];
  if (ogVideoMatch) metaTags.ogVideo = ogVideoMatch[1];
  if (ogVideoUrlMatch) metaTags.ogVideoUrl = ogVideoUrlMatch[1];
  if (ogDescriptionMatch) metaTags.ogDescription = ogDescriptionMatch[1];
  
  // Twitter tags
  const twitterImageMatch = html.match(/<meta[^>]*name="twitter:image"[^>]*content="([^"]*)"[^>]*>/i);
  const twitterTitleMatch = html.match(/<meta[^>]*name="twitter:title"[^>]*content="([^"]*)"[^>]*>/i);
  
  if (twitterImageMatch) metaTags.twitterImage = twitterImageMatch[1];
  if (twitterTitleMatch) metaTags.twitterTitle = twitterTitleMatch[1];
  
  return metaTags;
}

// PLATFORM-SPECIFIC HANDLERS

// Get YouTube video info using ytdl-core
async function getYouTubeInfo(url) {
  try {
    const info = await ytdl.getInfo(url);
    
    // Transform formats to match our API structure
    const formats = info.formats.map(format => {
      // Determine if format has video/audio
      const hasVideo = format.hasVideo;
      const hasAudio = format.hasAudio;
      
      // Create quality label
      let qualityLabel = format.qualityLabel || 'Unknown';
      if (!qualityLabel && format.height) {
        qualityLabel = `${format.height}p`;
      }
      
      return {
        itag: format.itag,
        quality: qualityLabel,
        mimeType: format.mimeType || 'unknown',
        url: format.url,
        hasAudio: hasAudio,
        hasVideo: hasVideo,
        contentLength: parseInt(format.contentLength) || 0,
        audioBitrate: format.audioBitrate || null,
        container: format.container || null
      };
    });
    
    return {
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
      uploadDate: info.videoDetails.publishDate,
      description: info.videoDetails.description
    };
  } catch (error) {
    console.error('YouTube info error:', error);
    
    // Fallback to youtube-dl
    try {
      console.log('Falling back to youtube-dl for YouTube...');
      const info = await youtubeDl(url, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        preferFreeFormats: true,
        addHeader: ['referer:youtube.com', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36']
      });
      
      // Transform formats
      const formats = info.formats.map(format => ({
        itag: `ytdl_${format.format_id}`,
        quality: format.format_note || format.format,
        mimeType: format.ext ? `video/${format.ext}` : 'video/mp4',
        url: format.url,
        hasAudio: format.acodec !== 'none',
        hasVideo: format.vcodec !== 'none',
        contentLength: format.filesize || 0,
        container: format.ext || 'mp4'
      }));
      
      return {
        title: info.title,
        thumbnails: info.thumbnails ? info.thumbnails.map(t => ({ 
          url: t.url,
          width: t.width || 0,
          height: t.height || 0
        })) : [{url: info.thumbnail, width: 0, height: 0}],
        duration: info.duration,
        formats: formats,
        platform: 'youtube',
        mediaType: 'video',
        uploader: info.uploader,
        uploadDate: info.upload_date,
        description: info.description
      };
    } catch (ytdlError) {
      console.error('YouTube youtube-dl fallback error:', ytdlError);
      throw new Error(`Failed to get YouTube info: ${error.message}`);
    }
  }
}

// Get TikTok video info using tiktok-scraper
async function getTikTokInfo(url) {
  try {
    const videoData = await tiktokScraper.getVideoMeta(url);
    
    if (!videoData || !videoData.collector || !videoData.collector[0]) {
      throw new Error('Could not fetch TikTok video data');
    }
    
    const video = videoData.collector[0];
    
    // Create formats array
    const formats = [];
    
    // No watermark version (if available)
    if (video.videoUrlNoWaterMark) {
      formats.push({
        itag: 'tiktok_nowm',
        quality: 'HD (No Watermark)',
        mimeType: 'video/mp4',
        url: video.videoUrlNoWaterMark,
        hasAudio: true,
        hasVideo: true,
        contentLength: 0,
        container: 'mp4'
      });
    }
    
    // Standard version
    if (video.videoUrl) {
      formats.push({
        itag: 'tiktok_wm',
        quality: 'HD (With Watermark)',
        mimeType: 'video/mp4',
        url: video.videoUrl,
        hasAudio: true,
        hasVideo: true,
        contentLength: 0,
        container: 'mp4'
      });
    }
    
    // Audio only
    if (video.musicUrl) {
      formats.push({
        itag: 'tiktok_audio',
        quality: 'Audio Only',
        mimeType: 'audio/mp3',
        url: video.musicUrl,
        hasAudio: true,
        hasVideo: false,
        contentLength: 0,
        container: 'mp3'
      });
    }
    
    return {
      title: video.text || `TikTok by ${video.authorMeta.name}`,
      thumbnails: [{ url: video.covers.default, width: 0, height: 0 }],
      duration: video.videoMeta.duration,
      formats: formats,
      platform: 'tiktok',
      mediaType: 'video',
      uploader: video.authorMeta.name,
      uploadDate: null,
      description: video.text
    };
  } catch (error) {
    console.error('TikTok info error:', error);
    
    // Fallback to youtube-dl
    try {
      console.log('Falling back to youtube-dl for TikTok...');
      const info = await youtubeDl(url, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        preferFreeFormats: true,
        addHeader: ['referer:tiktok.com', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36']
      });
      
      // Transform formats
      const formats = info.formats.map(format => ({
        itag: `tiktok_ytdl_${format.format_id}`,
        quality: format.format_note || format.format,
        mimeType: format.ext ? `video/${format.ext}` : 'video/mp4',
        url: format.url,
        hasAudio: format.acodec !== 'none',
        hasVideo: format.vcodec !== 'none',
        contentLength: format.filesize || 0,
        container: format.ext || 'mp4'
      }));
      
      return {
        title: info.title || 'TikTok Video',
        thumbnails: [{ url: info.thumbnail || '', width: 0, height: 0 }],
        duration: info.duration || 0,
        formats: formats,
        platform: 'tiktok',
        mediaType: 'video',
        uploader: info.uploader || 'TikTok User',
        uploadDate: info.upload_date || null,
        description: info.description || ''
      };
    } catch (ytdlError) {
      console.error('TikTok youtube-dl fallback error:', ytdlError);
      throw new Error(`Failed to get TikTok info: ${error.message}`);
    }
  }
}

// Get Twitter media info using Yimura Twitter Scraper
async function getTwitterInfo(url) {
  try {
    // Extract tweet ID from URL
    const tweetIdMatch = url.match(/twitter\.com\/[^\/]+\/status\/(\d+)/) || 
                       url.match(/x\.com\/[^\/]+\/status\/(\d+)/);
    if (!tweetIdMatch) {
      throw new Error('Invalid Twitter URL');
    }
    
    const tweetId = tweetIdMatch[1];
    
    // Initialize Twitter scraper
    const twitterScraper = new TwitterScraper();
    const tweet = await twitterScraper.getTweet(tweetId);
    
    if (!tweet) {
      throw new Error('Could not fetch tweet data');
    }
    
    // Extract media info
    const formats = [];
    let mediaType = 'text';
    let thumbnailUrl = '';
    
    // Process media
    if (tweet.media && tweet.media.photos && tweet.media.photos.length > 0) {
      mediaType = 'image';
      
      // Process photos
      tweet.media.photos.forEach((photo, index) => {
        thumbnailUrl = thumbnailUrl || photo;
        
        formats.push({
          itag: `twitter_photo_${index}`,
          quality: 'Original',
          mimeType: 'image/jpeg',
          url: photo,
          hasAudio: false,
          hasVideo: false,
          contentLength: 0,
          container: 'jpeg'
        });
      });
    }
    
    if (tweet.media && tweet.media.videos && tweet.media.videos.length > 0) {
      mediaType = 'video';
      
      // Process videos
      tweet.media.videos.forEach((video, videoIndex) => {
        thumbnailUrl = thumbnailUrl || video.thumbnail;
        
        if (video.variants && video.variants.length > 0) {
          // Sort variants by bitrate
          const sortedVariants = [...video.variants]
            .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
          
          sortedVariants.forEach((variant, index) => {
            formats.push({
              itag: `twitter_video_${videoIndex}_${index}`,
              quality: variant.bitrate ? `${Math.floor(variant.bitrate / 1000)} kbps` : `Quality ${index + 1}`,
              mimeType: variant.type || 'video/mp4',
              url: variant.src,
              hasAudio: true,
              hasVideo: true,
              contentLength: 0,
              container: 'mp4'
            });
          });
        } else if (video.src) {
          // Direct video URL
          formats.push({
            itag: `twitter_video_${videoIndex}`,
            quality: 'Standard',
            mimeType: 'video/mp4',
            url: video.src,
            hasAudio: true,
            hasVideo: true,
            contentLength: 0,
            container: 'mp4'
          });
        }
      });
    }
    
    // If no media found via scraper, try using youtube-dl as fallback
    if (formats.length === 0) {
      try {
        const info = await youtubeDl(url, {
          dumpSingleJson: true,
          noCheckCertificates: true,
          noWarnings: true,
          preferFreeFormats: true,
          addHeader: ['referer:twitter.com', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36']
        });
        
        if (info.formats && info.formats.length > 0) {
          mediaType = 'video';
          thumbnailUrl = info.thumbnail || '';
          
          // Extract formats
          info.formats.forEach((format, index) => {
            if (format.url) {
              formats.push({
                itag: `twitter_ytdl_${index}`,
                quality: format.format_note || `Quality ${index + 1}`,
                mimeType: format.ext ? `video/${format.ext}` : 'video/mp4',
                url: format.url,
                hasAudio: format.acodec !== 'none',
                hasVideo: format.vcodec !== 'none',
                contentLength: format.filesize || 0,
                container: format.ext || 'mp4'
              });
            }
          });
        }
      } catch (ytdlError) {
        console.error('Twitter youtube-dl fallback error:', ytdlError);
      }
    }
    
    return {
      title: `Tweet by ${tweet.author.name}`,
      thumbnails: thumbnailUrl ? [{ url: thumbnailUrl, width: 0, height: 0 }] : [],
      formats: formats,
      platform: 'twitter',
      mediaType: mediaType,
      uploader: tweet.author.name,
      uploadDate: null,
      description: tweet.text
    };
  } catch (error) {
    console.error('Twitter info error:', error);
    
    // Try youtube-dl as ultimate fallback
    try {
      console.log('Trying youtube-dl as fallback for Twitter...');
      const info = await youtubeDl(url, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        preferFreeFormats: true,
        addHeader: ['referer:twitter.com', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36']
      });
      
      // Transform formats
      const formats = info.formats.map(format => ({
        itag: `twitter_ytdl_${format.format_id}`,
        quality: format.format_note || format.format,
        mimeType: format.ext ? `video/${format.ext}` : 'video/mp4',
        url: format.url,
        hasAudio: format.acodec !== 'none',
        hasVideo: format.vcodec !== 'none',
        contentLength: format.filesize || 0,
        container: format.ext || 'mp4'
      }));
      
      return {
        title: info.title || 'Twitter Video',
        thumbnails: info.thumbnail ? [{ url: info.thumbnail, width: 0, height: 0 }] : [],
        formats: formats,
        platform: 'twitter',
        mediaType: 'video',
        uploader: info.uploader || 'Twitter User',
        uploadDate: null,
        description: info.description || ''
      };
    } catch (ytdlError) {
      console.error('Twitter youtube-dl ultimate fallback error:', ytdlError);
      throw new Error(`Failed to get Twitter info: ${error.message}`);
    }
  }
}

// Get Instagram media info using instagram-url-direct
async function getInstagramInfo(url) {
  try {
    const igData = await instagramUrlDirect(url);
    
    if (!igData || !igData.url_list || igData.url_list.length === 0) {
      throw new Error('Could not extract Instagram media URLs');
    }
    
    // Determine media type based on first URL
    const firstUrl = igData.url_list[0];
    let mediaType = 'image';
    
    if (firstUrl.includes('.mp4') || 
        firstUrl.includes('video_url') || 
        firstUrl.includes('/video/')) {
      mediaType = 'video';
    }
    
    // Create formats array
    const formats = igData.url_list.map((url, index) => {
      const isVideo = url.includes('.mp4') || 
                    url.includes('video_url') || 
                    url.includes('/video/');
      
      return {
        itag: `instagram_${isVideo ? 'video' : 'image'}_${index}`,
        quality: `Quality ${index + 1}`,
        mimeType: isVideo ? 'video/mp4' : 'image/jpeg',
        url: url,
        hasAudio: isVideo,
        hasVideo: isVideo,
        contentLength: 0,
        container: isVideo ? 'mp4' : 'jpeg'
      };
    });
    
    // Extract some metadata from the URL and response
    const postIdMatch = url.match(/\/p\/([^\/]+)/) || 
                      url.match(/\/reel\/([^\/]+)/);
    const postId = postIdMatch ? postIdMatch[1] : '';
    
    return {
      title: `Instagram post ${postId}`,
      thumbnails: igData.thumbnail_url ? [{ url: igData.thumbnail_url, width: 0, height: 0 }] : [],
      formats: formats,
      platform: 'instagram',
      mediaType: mediaType,
      uploader: null,
      uploadDate: null,
      description: ''
    };
  } catch (error) {
    console.error('Instagram info error:', error);
    
    // Try youtube-dl as fallback
    try {
      console.log('Trying youtube-dl as fallback for Instagram...');
      const info = await youtubeDl(url, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        preferFreeFormats: true,
        addHeader: ['referer:instagram.com', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36']
      });
      
      // Transform formats
      const formats = info.formats.map(format => ({
        itag: `ig_ytdl_${format.format_id}`,
        quality: format.format_note || format.format,
        mimeType: format.ext ? `video/${format.ext}` : 'video/mp4',
        url: format.url,
        hasAudio: format.acodec !== 'none',
        hasVideo: format.vcodec !== 'none',
        contentLength: format.filesize || 0,
        container: format.ext || 'mp4'
      }));
      
      return {
        title: info.title || 'Instagram Media',
        thumbnails: info.thumbnail ? [{ url: info.thumbnail, width: 0, height: 0 }] : [],
        formats: formats,
        platform: 'instagram',
        mediaType: 'video',
        uploader: info.uploader || 'Instagram User',
        uploadDate: null,
        description: info.description || ''
      };
    } catch (ytdlError) {
      console.error('Instagram youtube-dl fallback error:', ytdlError);
      throw new Error(`Failed to get Instagram info: ${error.message}`);
    }
  }
}

// Get Facebook video info using fb-downloader
async function getFacebookVideoInfo(url) {
  try {
    const result = await fbDownloader(url);
    
    if (!result || !result.download) {
      throw new Error('Could not extract Facebook video URLs');
    }
    
    // Create formats array
    const formats = [];
    
    // HD version
    if (result.download.hd) {
      formats.push({
        itag: 'fb_hd',
        quality: 'HD',
        mimeType: 'video/mp4',
        url: result.download.hd,
        hasAudio: true,
        hasVideo: true,
        contentLength: 0,
        container: 'mp4'
      });
    }
    
    // SD version
    if (result.download.sd) {
      formats.push({
        itag: 'fb_sd',
        quality: 'SD',
        mimeType: 'video/mp4',
        url: result.download.sd,
        hasAudio: true,
        hasVideo: true,
        contentLength: 0,
        container: 'mp4'
      });
    }
    
    return {
      title: result.title || 'Facebook Video',
      thumbnails: [{ url: result.thumbnail || '', width: 0, height: 0 }],
      formats: formats,
      platform: 'facebook',
      mediaType: 'video',
      uploader: null,
      uploadDate: null,
      description: result.title || ''
    };
  } catch (error) {
    console.error('Facebook info error:', error);
    
    // Fallback to direct webpage scraping
    try {
      console.log('Trying direct scraping for Facebook...');
      let html = '';
      
      // Try different user agents
      for (const userAgent of USER_AGENTS) {
        try {
          const response = await axios.get(url, {
            headers: {
              'User-Agent': userAgent,
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.5',
              'Cache-Control': 'no-cache',
              'Pragma': 'no-cache',
            },
            timeout: 10000
          });
          
          html = response.data;
          break;
        } catch (reqError) {
          console.error(`Error with user agent ${userAgent}:`, reqError.message);
        }
      }
      
      if (!html) {
        throw new Error('Could not fetch Facebook page');
      }
      
      // Extract title
      let title = 'Facebook Video';
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        title = titleMatch[1].replace(' | Facebook', '').trim();
      }
      
      // Extract thumbnail
      let thumbnail = '';
      const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
      if (ogImageMatch && ogImageMatch[1]) {
        thumbnail = ogImageMatch[1];
      }
      
      // Extract video URLs
      const videoUrls = [];
      
      // HD URL
      const hdMatch = html.match(/"hd_src":"([^"]+)"/);
      if (hdMatch && hdMatch[1]) {
        videoUrls.push({
          quality: 'HD',
          url: hdMatch[1].replace(/\\/g, '')
        });
      }
      
      // SD URL
      const sdMatch = html.match(/"sd_src":"([^"]+)"/);
      if (sdMatch && sdMatch[1]) {
        videoUrls.push({
          quality: 'SD',
          url: sdMatch[1].replace(/\\/g, '')
        });
      }
      
      // OG Video
      const ogVideoMatch = html.match(/<meta property="og:video:url" content="([^"]+)"/i);
      if (ogVideoMatch && ogVideoMatch[1]) {
        videoUrls.push({
          quality: 'OG Video',
          url: ogVideoMatch[1]
        });
      }
      
      if (videoUrls.length === 0) {
        throw new Error('No video URLs found in Facebook page');
      }
      
      // Create formats array
      const formats = videoUrls.map((video, index) => ({
        itag: `fb_scrape_${index}`,
        quality: video.quality,
        mimeType: 'video/mp4',
        url: video.url,
        hasAudio: true,
        hasVideo: true,
        contentLength: 0,
        container: 'mp4'
      }));
      
      return {
        title: title,
        thumbnails: thumbnail ? [{ url: thumbnail, width: 0, height: 0 }] : [],
        formats: formats,
        platform: 'facebook',
        mediaType: 'video',
        uploader: null,
        uploadDate: null,
        description: title
      };
    } catch (scrapeError) {
      console.error('Facebook direct scraping fallback error:', scrapeError);
      
      // Try youtube-dl as final fallback
      try {
        console.log('Trying youtube-dl as fallback for Facebook...');
        const info = await youtubeDl(url, {
          dumpSingleJson: true,
          noCheckCertificates: true,
          noWarnings: true,
          preferFreeFormats: true,
          addHeader: ['referer:facebook.com', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36']
        });
        
        // Transform formats
        const formats = info.formats.map(format => ({
          itag: `fb_ytdl_${format.format_id}`,
          quality: format.format_note || format.format,
          mimeType: format.ext ? `video/${format.ext}` : 'video/mp4',
          url: format.url,
          hasAudio: format.acodec !== 'none',
          hasVideo: format.vcodec !== 'none',
          contentLength: format.filesize || 0,
          container: format.ext || 'mp4'
        }));
        
        return {
          title: info.title || 'Facebook Video',
          thumbnails: info.thumbnail ? [{ url: info.thumbnail, width: 0, height: 0 }] : [],
          formats: formats,
          platform: 'facebook',
          mediaType: 'video',
          uploader: info.uploader || 'Facebook User',
          uploadDate: null,
          description: info.description || ''
        };
      } catch (ytdlError) {
        console.error('Facebook youtube-dl fallback error:', ytdlError);
        throw new Error(`Failed to get Facebook info: ${error.message}`);
      }
    }
  }
}

// Get Threads media info (using basic scraping)
async function getThreadsInfo(url) {
  try {
    // Get the page HTML
    const html = await getWebpageContent(url);
    
    // Extract title
    let title = 'Threads Post';
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].replace(' | Threads', '').trim();
    }
    
    // Extract meta tags
    const metaTags = extractMetaTags(html);
    
    // Find media from Open Graph tags
    let mediaUrl = null;
    let mediaType = 'image';
    
    if (metaTags.ogVideo || metaTags.ogVideoUrl) {
      mediaType = 'video';
      mediaUrl = metaTags.ogVideo || metaTags.ogVideoUrl;
    } else if (metaTags.ogImage) {
      mediaUrl = metaTags.ogImage;
    }
    
    // Find additional media in page source
    const formats = [];
    
    if (mediaType === 'video' && mediaUrl) {
      formats.push({
        itag: 'threads_video_0',
        quality: 'Original',
        mimeType: 'video/mp4',
        url: mediaUrl,
        hasAudio: true,
        hasVideo: true,
        contentLength: 0,
        container: 'mp4'
      });
      
      // Look for other video URLs
      const videoUrlMatches = html.match(/"video_url":"([^"]+)"/g);
      if (videoUrlMatches) {
        const seen = new Set([mediaUrl]);
        
        for (let i = 0; i < videoUrlMatches.length; i++) {
          const match = videoUrlMatches[i].match(/"video_url":"([^"]+)"/);
          if (match && match[1]) {
            const url = match[1].replace(/\\/g, '');
            if (!seen.has(url)) {
              seen.add(url);
              formats.push({
                itag: `threads_video_${formats.length}`,
                quality: `Alternative ${formats.length}`,
                mimeType: 'video/mp4',
                url: url,
                hasAudio: true,
                hasVideo: true,
                contentLength: 0,
                container: 'mp4'
              });
            }
          }
        }
      }
    } else if (mediaUrl) {
      // Handle image
      formats.push({
        itag: 'threads_image_0',
        quality: 'Original',
        mimeType: 'image/jpeg',
        url: mediaUrl,
        hasAudio: false,
        hasVideo: false,
        contentLength: 0,
        container: 'jpeg'
      });
      
      // Look for other image URLs
      const imageUrlMatches = html.match(/"image_url":"([^"]+)"/g);
      if (imageUrlMatches) {
        const seen = new Set([mediaUrl]);
        
        for (let i = 0; i < imageUrlMatches.length; i++) {
          const match = imageUrlMatches[i].match(/"image_url":"([^"]+)"/);
          if (match && match[1]) {
            const url = match[1].replace(/\\/g, '');
            if (!seen.has(url) && url.includes('threads')) {
              seen.add(url);
              formats.push({
                itag: `threads_image_${formats.length}`,
                quality: `Alternative ${formats.length}`,
                mimeType: 'image/jpeg',
                url: url,
                hasAudio: false,
                hasVideo: false,
                contentLength: 0,
                container: 'jpeg'
              });
            }
          }
        }
      }
    }
    
    if (formats.length === 0) {
      // Try youtube-dl as fallback
      try {
        console.log('Trying youtube-dl as fallback for Threads...');
        const info = await youtubeDl(url, {
          dumpSingleJson: true,
          noCheckCertificates: true,
          noWarnings: true,
          preferFreeFormats: true,
          addHeader: ['referer:threads.net', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36']
        });
        
        // Check if youtube-dl found media
        if (info.formats && info.formats.length > 0) {
          mediaType = info.formats.some(f => f.vcodec !== 'none') ? 'video' : 'image';
          
          // Transform formats
          info.formats.forEach((format, index) => {
            formats.push({
              itag: `threads_ytdl_${index}`,
              quality: format.format_note || `Quality ${index + 1}`,
              mimeType: format.ext ? (mediaType === 'video' ? `video/${format.ext}` : `image/${format.ext}`) : 'video/mp4',
              url: format.url,
              hasAudio: format.acodec !== 'none',
              hasVideo: format.vcodec !== 'none',
              contentLength: format.filesize || 0,
              container: format.ext || 'mp4'
            });
          });
        } else if (info.url) {
          // If just a direct URL
          formats.push({
            itag: 'threads_ytdl_direct',
            quality: 'Original',
            mimeType: mediaType === 'video' ? 'video/mp4' : 'image/jpeg',
            url: info.url,
            hasAudio: mediaType === 'video',
            hasVideo: mediaType === 'video',
            contentLength: 0,
            container: mediaType === 'video' ? 'mp4' : 'jpeg'
          });
        }
        
        // Update title if available
        if (info.title) {
          title = info.title;
        }
      } catch (ytdlError) {
        console.error('Threads youtube-dl fallback error:', ytdlError);
      }
    }
    
    if (formats.length === 0) {
      throw new Error('No media found in this Threads post');
    }
    
    return {
      title: title,
      thumbnails: [{ url: formats[0].url, width: 0, height: 0 }],
      formats: formats,
      platform: 'threads',
      mediaType: mediaType,
      uploader: null,
      uploadDate: null,
      description: metaTags.ogDescription || title
    };
  } catch (error) {
    console.error('Threads error:', error);
    throw new Error(`Threads processing failed: ${error.message}`);
  }
}

// Get Pinterest info with direct scraping
async function getPinterestInfo(url) {
  try {
    // User agent for Pinterest requests
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36';

    // First, get the actual page to find image data
    const html = await getWebpageContent(url);

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

    // Look for video data in the page
    let videoUrls = [];
    const videoMatches = html.match(/"video_list":\s*\{([^\}]+)\}/g);
    
    if (videoMatches && videoMatches.length > 0) {
      for (const match of videoMatches) {
        const urlMatches = match.match(/"url":\s*"([^"]+)"/g);
        if (urlMatches) {
          for (const urlMatch of urlMatches) {
            const videoUrl = urlMatch.match(/"url":\s*"([^"]+)"/)[1];
            if (videoUrl) {
              videoUrls.push(videoUrl.replace(/\\/g, ''));
            }
          }
        }
      }
    }

    // Extract og:video if present
    const ogVideoMatch = html.match(/<meta property="og:video" content="([^"]+)"/i);
    if (ogVideoMatch && ogVideoMatch[1]) {
      videoUrls.push(ogVideoMatch[1]);
    }

    // Remove duplicates 
    videoUrls = [...new Set(videoUrls)];
    
    // Create format objects
    const formats = [];
    
    // Add video formats
    videoUrls.forEach((url, index) => {
      formats.push({
        itag: `pinterest_video_${index}`,
        quality: `Video Quality ${index + 1}`,
        mimeType: 'video/mp4',
        url: url,
        hasAudio: true,
        hasVideo: true,
        contentLength: 0,
        container: 'mp4'
      });
    });
    
    // Add image formats
    imageUrls.forEach((url, index) => {
      // Determine quality description
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
      
      formats.push({
        itag: `pinterest_img_${index}`,
        quality: quality,
        mimeType: `image/${format}`,
        url: url,
        hasAudio: false,
        hasVideo: false,
        contentLength: 0,
        container: format
      });
    });

    if (formats.length === 0) {
      // Try youtube-dl as a fallback
      try {
        console.log('Trying youtube-dl as fallback for Pinterest...');
        const info = await youtubeDl(url, {
          dumpSingleJson: true,
          noCheckCertificates: true,
          noWarnings: true,
          preferFreeFormats: true,
          addHeader: ['referer:pinterest.com', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36']
        });
        
        if (info.formats && info.formats.length > 0) {
          info.formats.forEach((format, index) => {
            formats.push({
              itag: `pinterest_ytdl_${index}`,
              quality: format.format_note || `Quality ${index + 1}`,
              mimeType: format.ext.includes('mp4') ? 'video/mp4' : `image/${format.ext}`,
              url: format.url,
              hasAudio: format.acodec !== 'none',
              hasVideo: format.vcodec !== 'none',
              contentLength: format.filesize || 0,
              container: format.ext
            });
          });
          
          // Update title if available
          if (info.title) {
            title = info.title;
          }
        } else if (info.url) {
          // If no formats but direct URL exists
          formats.push({
            itag: 'pinterest_ytdl_direct',
            quality: 'Original',
            mimeType: info.ext.includes('mp4') ? 'video/mp4' : `image/${info.ext}`,
            url: info.url,
            hasAudio: false,
            hasVideo: false,
            contentLength: 0,
            container: info.ext
          });
        }
      } catch (ytdlError) {
        console.error('Pinterest youtube-dl fallback error:', ytdlError);
      }
    }
    
    if (formats.length === 0) {
      throw new Error('No media found on this Pinterest page');
    }

    // Determine if this is a video or image
    const mediaType = videoUrls.length > 0 ? 'video' : 'image';
    
    // Return the media info
    return {
      title: title,
      thumbnails: formats.length > 0 ? [{ url: mediaType === 'video' ? imageUrls[0] || '' : formats[0].url, width: 0, height: 0 }] : [],
      formats: formats,
      platform: 'pinterest',
      mediaType: mediaType,
      uploader: null,
      uploadDate: null,
      description: title
    };
  } catch (error) {
    console.error('Pinterest error:', error);
    throw new Error(`Pinterest processing failed: ${error.message}`);
  }
}

// Get Reddit media info
async function getRedditInfo(url) {
  try {
    // Check if it's a reddit post URL
    const redditMatch = url.match(/reddit\.com\/r\/([^\/]+)\/comments\/([^\/]+)/);
    if (!redditMatch) {
      throw new Error('Not a valid Reddit post URL');
    }
    
    // Extract subreddit and post ID
    const subreddit = redditMatch[1];
    const postId = redditMatch[2];
    
    // Try using reddit-fetch
    try {
      const data = await redditFetch({
        subreddit: subreddit,
        id: postId,
        sort: 'top'
      });
      
      if (!data || data.error) {
        throw new Error('Failed to fetch Reddit post');
      }
      
      // Check if post has media
      let mediaUrl = null;
      let mediaType = 'text';
      
      // Create formats array
      const formats = [];
      
      // Check for video
      if (data.media && data.media.reddit_video) {
        mediaUrl = data.media.reddit_video.fallback_url;
        mediaType = 'video';
        
        // Add video format
        formats.push({
          itag: 'reddit_video',
          quality: `${data.media.reddit_video.height}p`,
          mimeType: 'video/mp4',
          url: mediaUrl,
          hasAudio: false, // Reddit videos often don't have audio
          hasVideo: true,
          contentLength: 0,
          container: 'mp4'
        });
        
        // Try to find audio URL (Reddit stores audio separately)
        const audioUrl = mediaUrl.replace(/DASH_\d+\.mp4/, 'DASH_audio.mp4');
        
        // Add audio format
        formats.push({
          itag: 'reddit_audio',
          quality: 'Audio Only',
          mimeType: 'audio/mp4',
          url: audioUrl,
          hasAudio: true,
          hasVideo: false,
          contentLength: 0,
          container: 'mp4'
        });
      }
      // Check for image
      else if (data.url_overridden_by_dest) {
        mediaUrl = data.url_overridden_by_dest;
        
        // Determine type based on URL
        if (mediaUrl.match(/\.(jpg|jpeg|png|gif)(\?|$)/i)) {
          mediaType = 'image';
          
          // Get extension
          const match = mediaUrl.match(/\.(jpg|jpeg|png|gif)(\?|$)/i);
          const ext = match ? match[1].toLowerCase() : 'jpg';
          
          // Add image format
          formats.push({
            itag: 'reddit_image',
            quality: 'Original',
            mimeType: `image/${ext}`,
            url: mediaUrl,
            hasAudio: false,
            hasVideo: false,
            contentLength: 0,
            container: ext
          });
        }
        else if (mediaUrl.match(/\.(mp4|webm)(\?|$)/i)) {
          mediaType = 'video';
          
          // Get extension
          const match = mediaUrl.match(/\.(mp4|webm)(\?|$)/i);
          const ext = match ? match[1].toLowerCase() : 'mp4';
          
          // Add video format
          formats.push({
            itag: 'reddit_video',
            quality: 'Original',
            mimeType: `video/${ext}`,
            url: mediaUrl,
            hasAudio: true,
            hasVideo: true,
            contentLength: 0,
            container: ext
          });
        }
      }
      
      // If no media found but there's a thumbnail, use that
      if (formats.length === 0 && data.thumbnail && data.thumbnail.startsWith('http')) {
        mediaType = 'image';
        mediaUrl = data.thumbnail;
        
        formats.push({
          itag: 'reddit_thumbnail',
          quality: 'Thumbnail',
          mimeType: 'image/jpeg',
          url: mediaUrl,
          hasAudio: false,
          hasVideo: false,
          contentLength: 0,
          container: 'jpeg'
        });
      }
      
      // Return media info
      return {
        title: data.title || 'Reddit Post',
        thumbnails: data.thumbnail && data.thumbnail.startsWith('http') ? 
                  [{ url: data.thumbnail, width: 0, height: 0 }] : [],
        formats: formats,
        platform: 'reddit',
        mediaType: mediaType,
        uploader: data.author,
        uploadDate: new Date(data.created_utc * 1000).toISOString().split('T')[0],
        description: data.selftext || ''
      };
    } catch (redditError) {
      console.error('Reddit fetch error:', redditError);
      
      // Try youtube-dl as fallback
      try {
        console.log('Trying youtube-dl as fallback for Reddit...');
        const info = await youtubeDl(url, {
          dumpSingleJson: true,
          noCheckCertificates: true,
          noWarnings: true,
          preferFreeFormats: true,
          addHeader: ['referer:reddit.com', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36']
        });
        
        // Transform formats
        const formats = info.formats.map(format => ({
          itag: `reddit_ytdl_${format.format_id}`,
          quality: format.format_note || format.format,
          mimeType: format.ext ? (format.vcodec !== 'none' ? `video/${format.ext}` : `audio/${format.ext}`) : 'video/mp4',
          url: format.url,
          hasAudio: format.acodec !== 'none',
          hasVideo: format.vcodec !== 'none',
          contentLength: format.filesize || 0,
          container: format.ext || 'mp4'
        }));
        
        // Special handling for Reddit separate audio/video
        if (formats.length > 0) {
          // Find if there are separate audio and video formats
          const videoFormat = formats.find(f => f.hasVideo && !f.hasAudio);
          const audioFormat = formats.find(f => f.hasAudio && !f.hasVideo);
          
          // If we have both, add a note to indicate they need to be merged
          if (videoFormat && audioFormat) {
            videoFormat.quality += ' (No Audio)';
            audioFormat.quality += ' (Audio Only)';
          }
        }
        
        return {
          title: info.title || 'Reddit Media',
          thumbnails: info.thumbnail ? [{ url: info.thumbnail, width: 0, height: 0 }] : [],
          formats: formats,
          platform: 'reddit',
          mediaType: formats.some(f => f.hasVideo) ? 'video' : 'image',
          uploader: info.uploader || 'Reddit User',
          uploadDate: info.upload_date || null,
          description: info.description || ''
        };
      } catch (ytdlError) {
        console.error('Reddit youtube-dl fallback error:', ytdlError);
        throw new Error(`Failed to get Reddit info: ${redditError.message}`);
      }
    }
  } catch (error) {
    console.error('Reddit info error:', error);
    throw new Error(`Reddit processing failed: ${error.message}`);
  }
}

// Generic info endpoint using youtube-dl
async function getGenericInfo(url, platform) {
  try {
    console.log(`Using youtube-dl for ${platform} URL: ${url}`);
    const info = await youtubeDl(url, {
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true,
      addHeader: [
        `referer:${new URL(url).origin}`, 
        'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      ]
    });
    
    const mediaType = getMediaType(platform);
    
    // Transform formats
    const formats = info.formats.map(format => ({
      itag: `${platform}_${format.format_id}`,
      quality: format.format_note || format.format,
      mimeType: format.ext ? `${mediaType}/${format.ext}` : `${mediaType}/mp4`,
      url: format.url,
      hasAudio: format.acodec !== 'none',
      hasVideo: format.vcodec !== 'none',
      contentLength: format.filesize || 0,
      container: format.ext || 'mp4'
    }));
    
    return {
      title: info.title || `${platform} media`,
      thumbnails: info.thumbnail ? [{ url: info.thumbnail, width: 0, height: 0 }] : [],
      formats: formats,
      platform: platform,
      mediaType: mediaType,
      uploader: info.uploader || null,
      uploadDate: info.upload_date || null,
      description: info.description || ''
    };
  } catch (error) {
    console.error(`Generic youtube-dl error for ${platform}:`, error);
    
    // Scrape basic info at least
    try {
      const html = await getWebpageContent(url);
      const title = extractTitleFromHtml(html) || `${platform} Media`;
      const metaTags = extractMetaTags(html);
      
      return {
        title: title,
        thumbnails: metaTags.ogImage ? [{ url: metaTags.ogImage, width: 0, height: 0 }] : [],
        formats: [{
          itag: `${platform}_direct`,
          quality: 'Direct URL',
          mimeType: getMediaType(platform) === 'audio' ? 'audio/mp3' : 'video/mp4',
          url: url,
          hasAudio: true,
          hasVideo: getMediaType(platform) === 'video',
          contentLength: 0,
          container: getMediaType(platform) === 'audio' ? 'mp3' : 'mp4'
        }],
        platform: platform,
        mediaType: getMediaType(platform),
        uploader: null,
        uploadDate: null,
        description: metaTags.ogDescription || ''
      };
    } catch (scrapeError) {
      console.error(`Generic scrape error for ${platform}:`, scrapeError);
      throw error;
    }
  }
}

// API ENDPOINTS

// Youtube info endpoint
app.get('/api/youtube', async (req, res) => {
  try {
    const url = req.query.url;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`Processing YouTube URL: ${url}`);
    
    try {
      const info = await getYouTubeInfo(url);
      res.json(info);
    } catch (ytError) {
      console.error('YouTube error:', ytError);
      res.status(500).json({ error: 'YouTube processing failed', details: ytError.message });
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// TikTok info endpoint
app.get('/api/tiktok', async (req, res) => {
  try {
    const url = req.query.url;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`Processing TikTok URL: ${url}`);
    
    try {
      const info = await getTikTokInfo(url);
      res.json(info);
    } catch (ttError) {
      console.error('TikTok error:', ttError);
      res.status(500).json({ error: 'TikTok processing failed', details: ttError.message });
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Twitter info endpoint
app.get('/api/twitter', async (req, res) => {
  try {
    const url = req.query.url;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`Processing Twitter URL: ${url}`);
    
    try {
      const info = await getTwitterInfo(url);
      res.json(info);
    } catch (twitterError) {
      console.error('Twitter error:', twitterError);
      res.status(500).json({ error: 'Twitter processing failed', details: twitterError.message });
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Instagram info endpoint
app.get('/api/instagram', async (req, res) => {
  try {
    const url = req.query.url;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`Processing Instagram URL: ${url}`);
    
    try {
      const info = await getInstagramInfo(url);
      res.json(info);
    } catch (igError) {
      console.error('Instagram error:', igError);
      res.status(500).json({ error: 'Instagram processing failed', details: igError.message });
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Facebook info endpoint
app.get('/api/facebook', async (req, res) => {
  try {
    const url = req.query.url;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`Processing Facebook URL: ${url}`);
    
    try {
      const info = await getFacebookVideoInfo(url);
      res.json(info);
    } catch (fbError) {
      console.error('Facebook error:', fbError);
      res.status(500).json({ error: 'Facebook processing failed', details: fbError.message });
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Pinterest info endpoint
app.get('/api/pinterest', async (req, res) => {
  try {
    const url = req.query.url;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`Processing Pinterest URL: ${url}`);
    
    try {
      const info = await getPinterestInfo(url);
      res.json(info);
    } catch (pinterestError) {
      console.error('Pinterest error:', pinterestError);
      res.status(500).json({ error: 'Pinterest processing failed', details: pinterestError.message });
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Threads info endpoint
app.get('/api/threads', async (req, res) => {
  try {
    const url = req.query.url;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`Processing Threads URL: ${url}`);
    
    try {
      const info = await getThreadsInfo(url);
      res.json(info);
    } catch (threadsError) {
      console.error('Threads error:', threadsError);
      res.status(500).json({ error: 'Threads processing failed', details: threadsError.message });
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Reddit info endpoint
app.get('/api/reddit', async (req, res) => {
  try {
    const url = req.query.url;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`Processing Reddit URL: ${url}`);
    
    try {
      const info = await getRedditInfo(url);
      res.json(info);
    } catch (redditError) {
      console.error('Reddit error:', redditError);
      res.status(500).json({ error: 'Reddit processing failed', details: redditError.message });
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
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
    try {
      let info;
      
      switch(platform) {
        case 'youtube':
          info = await getYouTubeInfo(url);
          break;
        case 'tiktok':
          info = await getTikTokInfo(url);
          break;
        case 'twitter':
          info = await getTwitterInfo(url);
          break;
        case 'instagram':
          info = await getInstagramInfo(url);
          break;
        case 'facebook':
          info = await getFacebookVideoInfo(url);
          break;
        case 'pinterest':
          info = await getPinterestInfo(url);
          break;
        case 'threads':
          info = await getThreadsInfo(url);
          break;
        case 'reddit':
          info = await getRedditInfo(url);
          break;
        default:
          // Use generic youtube-dl approach for unsupported platforms
          info = await getGenericInfo(url, platform);
      }
      
      res.json(info);
    } catch (error) {
      console.error(`${platform} error:`, error);
      
      // Fallback response
      res.status(500).json({ 
        error: `${platform} processing failed`, 
        details: error.message,
        platform: platform,
        mediaType: mediaType,
        formats: [{
          itag: 'direct',
          quality: 'Direct URL',
          mimeType: mediaType === 'audio' ? 'audio/mp3' : 'video/mp4',
          url: url,
          hasAudio: true,
          hasVideo: mediaType === 'video',
          contentLength: 0,
          container: mediaType === 'audio' ? 'mp3' : 'mp4'
        }]
      });
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
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

    // Prepare headers with a user agent to avoid blocking
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
      const headResponse = await axios.head(url, {
        headers,
        maxRedirects: 5,
        timeout: 5000
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
    const response = await axios({
      method: 'get',
      url: url,
      headers: headers,
      responseType: 'stream',
      maxRedirects: 5
    });

    // Update content type if available from response
    contentType = response.headers['content-type'] || contentType;
    
    // Set response headers
    res.setHeader('Content-Type', contentType);
    if (contentLength > 0) {
      res.setHeader('Content-Length', contentLength);
    }
    res.setHeader('Content-Disposition', `attachment; filename="${outputFilename}"`);

    // Pipe the response to the client
    response.data.pipe(res);

  } catch (error) {
    console.error('Direct download error:', error);
    res.status(500).json({ error: 'Direct download failed', details: error.message });
  }
});

// YouTube download endpoint
app.get('/api/download/youtube', async (req, res) => {
  try {
    const { url, itag, filename } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`Processing YouTube download - URL: ${url}, format: ${itag || 'best'}`);

    // Generate a unique filename
    const uniqueId = Date.now();
    const tempFilePath = path.join(TEMP_DIR, `yt-${uniqueId}.mp4`);
    
    // Get info to find the right format
    const info = await ytdl.getInfo(url);
    
    // Determine which format to download
    let format;
    if (itag) {
      format = info.formats.find(f => f.itag === parseInt(itag));
    }
    
    // If no format specified or not found, get highest quality
    if (!format) {
      // Filter for formats with both audio and video
      const formats = info.formats.filter(f => f.hasAudio && f.hasVideo);
      
      // Sort by quality
      formats.sort((a, b) => {
        // If we have content length, sort by that (larger is better)
        if (a.contentLength && b.contentLength) {
          return parseInt(b.contentLength) - parseInt(a.contentLength);
        }
        // Otherwise try to compare by height
        return (b.height || 0) - (a.height || 0);
      });
      
      format = formats[0];
    }
    
    if (!format) {
      throw new Error('No suitable format found');
    }
    
    // Download to file
    const fileStream = fs.createWriteStream(tempFilePath);
    
    // Create ytdl stream
    const videoStream = ytdl.downloadFromInfo(info, { format });
    
    // Download using pipeline
    await pipeline(videoStream, fileStream);
    
    // Get file info
    const stat = fs.statSync(tempFilePath);
    
    // Determine output filename
    let outputFilename = filename || `${info.videoDetails.title.replace(/[^\w\s]/gi, '')}.mp4`;
    
    // Set headers for download
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${outputFilename}"`);
    
    // Stream the file and delete after sending
    const downloadStream = fs.createReadStream(tempFilePath);
    downloadStream.pipe(res);
    
    downloadStream.on('end', () => {
      // Delete the temporary file
      fs.unlink(tempFilePath, (err) => {
        if (err) console.error('Error deleting temp file:', err);
      });
    });
  } catch (error) {
    console.error('YouTube download error:', error);
    res.status(500).json({ error: 'YouTube download failed', details: error.message });
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
    const platform = detectPlatform(url);
    
    // Handle audio download based on platform
    if (platform === 'youtube') {
      // Get info to find the right format
      const info = await ytdl.getInfo(url);
      
      // Get only audio formats
      const audioFormats = info.formats
        .filter(format => format.hasAudio && !format.hasVideo)
        .sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0));
      
      let format;
      if (itag) {
        format = audioFormats.find(f => f.itag === parseInt(itag));
      }
      
      if (!format && audioFormats.length > 0) {
        format = audioFormats[0]; // Best audio quality
      }
      
      if (!format) {
        throw new Error('No suitable audio format found');
      }
      
      // Download to file
      const fileStream = fs.createWriteStream(tempFilePath);
      const audioStream = ytdl.downloadFromInfo(info, { format });
      
      await pipeline(audioStream, fileStream);
    } else {
      // For other platforms, use youtube-dl with audio extraction
      try {
        const options = {
          output: tempFilePath,
          extractAudio: true,
          audioFormat: 'mp3',
          audioQuality: 0, // Best quality
          noCheckCertificates: true,
          noWarnings: true,
          preferFreeFormats: true,
          addHeader: ['referer:' + new URL(url).origin, 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36']
        };
        
        if (itag && itag !== 'best') {
          options.format = itag;
        } else {
          options.formatSort = 'bestaudio';
        }
        
        await youtubeDl(url, options);
      } catch (ytdlErr) {
        console.error('youtube-dl audio download error:', ytdlErr);
        
        // Try to use platform-specific API if youtube-dl fails
        try {
          // Get info from platform-specific endpoint
          let directUrl = url;
          
          // Try to get platform info first
          try {
            let info;
            switch (platform) {
              case 'tiktok':
                info = await getTikTokInfo(url);
                break;
              case 'twitter':
                info = await getTwitterInfo(url);
                break;
              case 'instagram':
                info = await getInstagramInfo(url);
                break;
              case 'facebook':
                info = await getFacebookVideoInfo(url);
                break;
              default:
                info = null;
            }
            
            if (info && info.formats && info.formats.length > 0) {
              // Find audio-only format if available
              const audioFormat = info.formats.find(f => f.hasAudio && !f.hasVideo);
              if (audioFormat) {
                directUrl = audioFormat.url;
              } else {
                // Just use the first format with audio
                const formatWithAudio = info.formats.find(f => f.hasAudio);
                if (formatWithAudio) {
                  directUrl = formatWithAudio.url;
                }
              }
            }
          } catch (infoError) {
            console.error('Error getting platform info for audio:', infoError);
            // Continue with direct URL
          }
          
          // Download the file
          const response = await axios({
            method: 'get',
            url: directUrl,
            responseType: 'stream',
            headers: {
              'User-Agent': getRandomUserAgent()
            }
          });
          
          // Save to file
          const fileStream = fs.createWriteStream(tempFilePath);
          await pipeline(response.data, fileStream);
        } catch (dlError) {
          console.error('Error in platform-specific audio download:', dlError);
          throw new Error(`Audio download failed: ${dlError.message}`);
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

// Generic download endpoint
app.get('/api/download', async (req, res) => {
  try {
    const { url, itag } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`Processing download - URL: ${url}, format: ${itag || 'best'}`);
    
    const platform = detectPlatform(url);
    
    // Handle download based on platform
    if (platform === 'youtube') {
      // Redirect to YouTube-specific endpoint
      const redirectUrl = `/api/download/youtube?url=${encodeURIComponent(url)}${itag ? `&itag=${itag}` : ''}`;
      return res.redirect(redirectUrl);
    }
    
    // Generate a unique filename
    const uniqueId = Date.now();
    const tempFilePath = path.join(TEMP_DIR, `download-${uniqueId}.mp4`);
    
    // Download options
    const options = {
      output: tempFilePath,
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true,
      addHeader: ['referer:' + new URL(url).origin, 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36']
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

      // Try platform-specific methods
      try {
        // Get info from platform-specific endpoint
        let directUrl = url;
        let contentType = 'video/mp4';
        
        // Try to get platform info first
        try {
          let info;
          switch (platform) {
            case 'tiktok':
              info = await getTikTokInfo(url);
              break;
            case 'twitter':
              info = await getTwitterInfo(url);
              break;
            case 'instagram':
              info = await getInstagramInfo(url);
              break;
            case 'facebook':
              info = await getFacebookVideoInfo(url);
              break;
            case 'pinterest':
              info = await getPinterestInfo(url);
              break;
            case 'threads':
              info = await getThreadsInfo(url);
              break;
            case 'reddit':
              info = await getRedditInfo(url);
              break;
            default:
              info = null;
          }
          
          if (info && info.formats && info.formats.length > 0) {
            // Use specified format if available
            if (itag) {
              const format = info.formats.find(f => f.itag === itag);
              if (format) {
                directUrl = format.url;
                contentType = format.mimeType;
              }
            } else {
              // Otherwise use first format
              directUrl = info.formats[0].url;
              contentType = info.formats[0].mimeType;
            }
          }
        } catch (infoError) {
          console.error('Error getting platform info:', infoError);
          // Continue with direct URL
        }
        
        // Try direct download
        const response = await axios({
          method: 'get',
          url: directUrl,
          responseType: 'stream',
          headers: {
            'User-Agent': getRandomUserAgent(),
            'Referer': new URL(url).origin
          },
          maxRedirects: 5
        });
        
        // Save to file
        const fileStream = fs.createWriteStream(tempFilePath);
        await pipeline(response.data, fileStream);
      } catch (directError) {
        console.error('Direct download error:', directError);
        throw new Error(`Download failed: ${directError.message}`);
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

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Temporary directory: ${TEMP_DIR}`);
});
