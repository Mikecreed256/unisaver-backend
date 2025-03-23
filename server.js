// server.js - Enhanced Media Downloader with improved platform support
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const axios = require('axios');
const ytdl = require('ytdl-core');
const { pipeline } = require('stream/promises');
const { TwitterApi } = require('twitter-api-v2');
const { IgApiClient } = require('instagram-private-api');
const TikTokScraper = require('tiktok-scraper');

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
axios.defaults.headers.common['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36';

// Increase timeout for external requests
http.globalAgent.maxSockets = 25;
https.globalAgent.maxSockets = 25;
http.globalAgent.keepAlive = true;
https.globalAgent.keepAlive = true;

// API tokens
const TWITTER_BEARER_TOKEN = process.env.TWITTER_BEARER_TOKEN || '';
const INSTAGRAM_USERNAME = process.env.INSTAGRAM_USERNAME || '';
const INSTAGRAM_PASSWORD = process.env.INSTAGRAM_PASSWORD || '';

// Routes
app.get('/', (req, res) => {
  res.send('Media Downloader API is running');
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

// Get video info from YouTube
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
    
    // Sort formats by quality and content length
    formats.sort((a, b) => (b.contentLength || 0) - (a.contentLength || 0));
    
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
    throw new Error(`Failed to get YouTube info: ${error.message}`);
  }
}

// Get TikTok video info
async function getTikTokInfo(url) {
  try {
    const videoData = await TikTokScraper.getVideoMeta(url);
    
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
    throw new Error(`Failed to get TikTok info: ${error.message}`);
  }
}

// Get Twitter media info
async function getTwitterInfo(url) {
  try {
    // Extract tweet ID from URL
    const tweetIdMatch = url.match(/twitter\.com\/[^\/]+\/status\/(\d+)/);
    if (!tweetIdMatch) {
      throw new Error('Invalid Twitter URL');
    }
    
    const tweetId = tweetIdMatch[1];
    let tweetData;
    
    // Try with API if bearer token is available
    if (TWITTER_BEARER_TOKEN) {
      const twitterClient = new TwitterApi(TWITTER_BEARER_TOKEN);
      const readOnlyClient = twitterClient.readOnly;
      
      tweetData = await readOnlyClient.v2.get(`tweets/${tweetId}`, {
        expansions: ['attachments.media_keys', 'author_id'],
        'media.fields': ['url', 'preview_image_url', 'variants', 'type', 'duration_ms'],
        'user.fields': ['name', 'username']
      });
    } else {
      // Fallback - scrape from web (less reliable)
      const response = await axios.get(`https://cdn.syndication.twimg.com/tweet?id=${tweetId}`);
      tweetData = response.data;
    }
    
    if (!tweetData) {
      throw new Error('Could not fetch tweet data');
    }
    
    // Extract media info
    const formats = [];
    let mediaType = 'text';
    let thumbnailUrl = '';
    
    // Process media - handle API or scraped data
    if (tweetData.includes && tweetData.includes.media) {
      // API response format
      for (const media of tweetData.includes.media) {
        if (media.type === 'photo') {
          mediaType = 'image';
          thumbnailUrl = media.url;
          
          formats.push({
            itag: 'twitter_photo',
            quality: 'Original',
            mimeType: 'image/jpeg',
            url: media.url,
            hasAudio: false,
            hasVideo: false,
            contentLength: 0,
            container: 'jpeg'
          });
        } else if (media.type === 'video' || media.type === 'animated_gif') {
          mediaType = 'video';
          thumbnailUrl = media.preview_image_url;
          
          // Sort variants by bitrate
          const sortedVariants = [...media.variants]
            .filter(v => v.content_type === 'video/mp4')
            .sort((a, b) => (b.bit_rate || 0) - (a.bit_rate || 0));
          
          sortedVariants.forEach((variant, index) => {
            formats.push({
              itag: `twitter_video_${index}`,
              quality: variant.bit_rate ? `${Math.floor(variant.bit_rate / 1000)} kbps` : `Quality ${index + 1}`,
              mimeType: variant.content_type,
              url: variant.url,
              hasAudio: true,
              hasVideo: true,
              contentLength: 0,
              container: 'mp4'
            });
          });
        }
      }
    } else if (tweetData.entities && tweetData.entities.media) {
      // Scraped data format
      for (const media of tweetData.entities.media) {
        if (media.type === 'photo') {
          mediaType = 'image';
          thumbnailUrl = media.media_url_https;
          
          formats.push({
            itag: 'twitter_photo',
            quality: 'Original',
            mimeType: 'image/jpeg',
            url: media.media_url_https,
            hasAudio: false,
            hasVideo: false,
            contentLength: 0,
            container: 'jpeg'
          });
        } else if (media.type === 'video' || media.type === 'animated_gif') {
          mediaType = 'video';
          thumbnailUrl = media.media_url_https;
          
          if (media.video_info && media.video_info.variants) {
            // Sort variants by bitrate
            const sortedVariants = [...media.video_info.variants]
              .filter(v => v.content_type === 'video/mp4')
              .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
            
            sortedVariants.forEach((variant, index) => {
              formats.push({
                itag: `twitter_video_${index}`,
                quality: variant.bitrate ? `${Math.floor(variant.bitrate / 1000)} kbps` : `Quality ${index + 1}`,
                mimeType: variant.content_type,
                url: variant.url,
                hasAudio: true,
                hasVideo: true,
                contentLength: 0,
                container: 'mp4'
              });
            });
          }
        }
      }
    }
    
    // Get tweet author and text
    let authorName = 'Twitter User';
    let tweetText = '';
    
    if (tweetData.data && tweetData.includes && tweetData.includes.users) {
      // API response
      const user = tweetData.includes.users.find(u => u.id === tweetData.data.author_id);
      if (user) {
        authorName = user.name;
      }
      tweetText = tweetData.data.text;
    } else {
      // Scraped data
      authorName = tweetData.user?.name || 'Twitter User';
      tweetText = tweetData.text || '';
    }
    
    return {
      title: `Tweet by ${authorName}`,
      thumbnails: thumbnailUrl ? [{ url: thumbnailUrl, width: 0, height: 0 }] : [],
      formats: formats,
      platform: 'twitter',
      mediaType: mediaType,
      uploader: authorName,
      uploadDate: null,
      description: tweetText
    };
  } catch (error) {
    console.error('Twitter info error:', error);
    throw new Error(`Failed to get Twitter info: ${error.message}`);
  }
}

// Get Instagram media info
async function getInstagramInfo(url) {
  try {
    // Extract shortcode from URL
    const shortcodeMatch = url.match(/instagram\.com\/(?:p|reel|tv)\/([^\/]+)/);
    if (!shortcodeMatch) {
      throw new Error('Invalid Instagram URL');
    }
    
    const shortcode = shortcodeMatch[1];
    
    // Try with API if credentials are available
    if (INSTAGRAM_USERNAME && INSTAGRAM_PASSWORD) {
      const ig = new IgApiClient();
      ig.state.generateDevice(INSTAGRAM_USERNAME);
      await ig.account.login(INSTAGRAM_USERNAME, INSTAGRAM_PASSWORD);
      
      const mediaInfo = await ig.media.info(shortcode);
      const media = mediaInfo.items[0];
      
      const formats = [];
      let mediaType = 'image';
      let thumbnailUrl = '';
      
      if (media.media_type === 1) {
        // Image
        mediaType = 'image';
        thumbnailUrl = media.image_versions2.candidates[0].url;
        
        // Sort by resolution
        const sortedImages = [...media.image_versions2.candidates]
          .sort((a, b) => (b.width * b.height) - (a.width * a.height));
        
        sortedImages.forEach((img, index) => {
          formats.push({
            itag: `instagram_img_${index}`,
            quality: `${img.width}x${img.height}`,
            mimeType: 'image/jpeg',
            url: img.url,
            hasAudio: false,
            hasVideo: false,
            contentLength: 0,
            container: 'jpeg'
          });
        });
      } else if (media.media_type === 2) {
        // Video
        mediaType = 'video';
        thumbnailUrl = media.image_versions2.candidates[0].url;
        
        // Sort by resolution
        const sortedVideos = [...media.video_versions]
          .sort((a, b) => (b.width * b.height) - (a.width * a.height));
        
        sortedVideos.forEach((video, index) => {
          formats.push({
            itag: `instagram_vid_${index}`,
            quality: `${video.width}x${video.height}`,
            mimeType: 'video/mp4',
            url: video.url,
            hasAudio: true,
            hasVideo: true,
            contentLength: 0,
            container: 'mp4'
          });
        });
      } else if (media.media_type === 8 && media.carousel_media) {
        // Carousel/Slideshow
        mediaType = 'carousel';
        thumbnailUrl = media.carousel_media[0].image_versions2.candidates[0].url;
        
        media.carousel_media.forEach((item, carouselIndex) => {
          if (item.media_type === 1) {
            // Image in carousel
            const sortedImages = [...item.image_versions2.candidates]
              .sort((a, b) => (b.width * b.height) - (a.width * a.height));
            
            sortedImages.forEach((img, index) => {
              formats.push({
                itag: `instagram_carousel_img_${carouselIndex}_${index}`,
                quality: `Slide ${carouselIndex + 1} - ${img.width}x${img.height}`,
                mimeType: 'image/jpeg',
                url: img.url,
                hasAudio: false,
                hasVideo: false,
                contentLength: 0,
                container: 'jpeg'
              });
            });
          } else if (item.media_type === 2 && item.video_versions) {
            // Video in carousel
            const sortedVideos = [...item.video_versions]
              .sort((a, b) => (b.width * b.height) - (a.width * a.height));
            
            sortedVideos.forEach((video, index) => {
              formats.push({
                itag: `instagram_carousel_vid_${carouselIndex}_${index}`,
                quality: `Slide ${carouselIndex + 1} - ${video.width}x${video.height}`,
                mimeType: 'video/mp4',
                url: video.url,
                hasAudio: true,
                hasVideo: true,
                contentLength: 0,
                container: 'mp4'
              });
            });
          }
        });
      }
      
      return {
        title: media.caption?.text || `Instagram post by ${media.user.username}`,
        thumbnails: thumbnailUrl ? [{ url: thumbnailUrl, width: 0, height: 0 }] : [],
        formats: formats,
        platform: 'instagram',
        mediaType: mediaType,
        uploader: media.user.username,
        uploadDate: new Date(media.taken_at * 1000).toISOString().split('T')[0],
        description: media.caption?.text || ''
      };
    } else {
      // Fallback - scrape from web
      const response = await axios.get(`https://www.instagram.com/p/${shortcode}/?__a=1`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Cookie': 'ig_did=8675309; csrftoken=1234567890',
        }
      });
      
      const data = response.data;
      
      // Extract media info from scraped data
      if (!data || !data.graphql || !data.graphql.shortcode_media) {
        throw new Error('Could not extract Instagram media info');
      }
      
      const media = data.graphql.shortcode_media;
      const formats = [];
      let mediaType = 'image';
      
      if (media.is_video) {
        mediaType = 'video';
        
        formats.push({
          itag: 'instagram_video',
          quality: 'Best',
          mimeType: 'video/mp4',
          url: media.video_url,
          hasAudio: true,
          hasVideo: true,
          contentLength: 0,
          container: 'mp4'
        });
      } else if (media.edge_sidecar_to_children) {
        // Carousel/Slideshow
        mediaType = 'carousel';
        
        media.edge_sidecar_to_children.edges.forEach((edge, index) => {
          const node = edge.node;
          
          if (node.is_video) {
            formats.push({
              itag: `instagram_carousel_video_${index}`,
              quality: `Slide ${index + 1}`,
              mimeType: 'video/mp4',
              url: node.video_url,
              hasAudio: true,
              hasVideo: true,
              contentLength: 0,
              container: 'mp4'
            });
          } else {
            formats.push({
              itag: `instagram_carousel_image_${index}`,
              quality: `Slide ${index + 1}`,
              mimeType: 'image/jpeg',
              url: node.display_url,
              hasAudio: false,
              hasVideo: false,
              contentLength: 0,
              container: 'jpeg'
            });
          }
        });
      } else {
        // Single image
        formats.push({
          itag: 'instagram_image',
          quality: 'Best',
          mimeType: 'image/jpeg',
          url: media.display_url,
          hasAudio: false,
          hasVideo: false,
          contentLength: 0,
          container: 'jpeg'
        });
      }
      
      return {
        title: media.edge_media_to_caption?.edges[0]?.node?.text || `Instagram post by ${media.owner.username}`,
        thumbnails: [{ url: media.display_url, width: 0, height: 0 }],
        formats: formats,
        platform: 'instagram',
        mediaType: mediaType,
        uploader: media.owner.username,
        uploadDate: new Date(media.taken_at_timestamp * 1000).toISOString().split('T')[0],
        description: media.edge_media_to_caption?.edges[0]?.node?.text || ''
      };
    }
  } catch (error) {
    console.error('Instagram info error:', error);
    throw new Error(`Failed to get Instagram info: ${error.message}`);
  }
}

// Get Pinterest info
async function getPinterestInfo(url) {
  try {
    // User agent for Pinterest requests
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36';

    // First, get the actual page to find image data
    const response = await axios.get(url, {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
      }
    });

    const html = response.data;

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

// Get Facebook video URL from page
async function getFacebookVideoInfo(url) {
  try {
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

      // Method 2: Look for og:video content
      const ogVideoMatch = html.match(/<meta property="og:video:url" content="([^"]+)"/i);
      if (ogVideoMatch && ogVideoMatch[1]) {
        results.push({
          quality: 'og:video',
          url: ogVideoMatch[1]
        });
      }

      return results;
    }

    // Prepare multiple user agents to try
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1'
    ];

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
          timeout: 10000 // 10 second timeout
        });

        if (response.status !== 200) {
          continue; // Try next user agent
        }

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
        console.error(`Error with user agent ${userAgent}:`, agentError);
        continue; // Try next user agent
      }
    }

    // If no videos found, return error
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

    // Return the video info
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
  } catch (error) {
    console.error('Facebook error:', error);
    throw new Error(`Facebook processing failed: ${error.message}`);
  }
}

// Get Threads media info
async function getThreadsInfo(url) {
  try {
    // User agent
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36';
    
    // Get the page HTML
    const response = await axios.get(url, {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      }
    });
    
    const html = response.data;
    
    // Extract title
    let title = 'Threads Post';
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].replace(' | Threads', '').trim();
    }
    
    // Find media from Open Graph tags
    let mediaUrl = null;
    let mediaType = 'image';
    
    const ogVideoMatch = html.match(/<meta property="og:video" content="([^"]+)"/i);
    const ogVideoUrlMatch = html.match(/<meta property="og:video:url" content="([^"]+)"/i);
    const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
    
    if (ogVideoMatch || ogVideoUrlMatch) {
      mediaType = 'video';
      mediaUrl = (ogVideoMatch && ogVideoMatch[1]) || (ogVideoUrlMatch && ogVideoUrlMatch[1]);
    } else if (ogImageMatch) {
      mediaUrl = ogImageMatch[1];
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
      description: title
    };
  } catch (error) {
    console.error('Threads error:', error);
    throw new Error(`Threads processing failed: ${error.message}`);
  }
}

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
        default:
          // Fallback response for unsupported platforms
          const fallbackThumbnail = `https://via.placeholder.com/480x360.png?text=${encodeURIComponent(platform)}`;
          
          info = {
            title: `Media from ${platform}`,
            thumbnails: [{ url: fallbackThumbnail, width: 480, height: 360 }],
            duration: 0,
            formats: [{
              itag: 'direct',
              quality: 'Direct URL',
              mimeType: mediaType === 'audio' ? 'audio/mp3' : 'video/mp4',
              url: url,
              hasAudio: true,
              hasVideo: mediaType === 'video',
              contentLength: 0,
              container: mediaType === 'audio' ? 'mp3' : 'mp4'
            }],
            platform: platform,
            mediaType: mediaType,
            uploader: null,
            uploadDate: null,
            description: null
          };
      }
      
      res.json(info);
    } catch (error) {
      console.error(`${platform} error:`, error);
      res.status(500).json({ 
        error: `${platform} processing failed`, 
        details: error.message,
        platform: platform,
        mediaType: mediaType
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
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
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
        maxRedirects: 5
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
      // For other platforms, use the direct URL and convert
      try {
        // Get info from platform-specific endpoint
        let directUrl = url;
        let title = 'Audio';
        
        try {
          const infoResponse = await axios.get(`http://localhost:${PORT}/api/info?url=${encodeURIComponent(url)}`);
          if (infoResponse.data && infoResponse.data.formats && infoResponse.data.formats.length > 0) {
            // Find audio-only format if available
            const audioFormat = infoResponse.data.formats.find(f => f.hasAudio && !f.hasVideo);
            directUrl = audioFormat ? audioFormat.url : infoResponse.data.formats[0].url;
            title = infoResponse.data.title || 'Audio';
          }
        } catch (infoError) {
          console.error('Error getting info for audio extraction:', infoError);
          // Continue with direct URL if info fails
        }
        
        // Download the file
        const response = await axios({
          method: 'get',
          url: directUrl,
          responseType: 'stream',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36'
          }
        });
        
        // Save the file
        const fileStream = fs.createWriteStream(tempFilePath);
        await pipeline(response.data, fileStream);
      } catch (dlError) {
        console.error('Error downloading audio:', dlError);
        throw new Error(`Audio download failed: ${dlError.message}`);
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
    
    // For other platforms, get the direct URL and download
    try {
      // Try to get platform-specific URL
      let directUrl = url;
      let filename = 'download.mp4';
      let contentType = 'video/mp4';
      
      try {
        const infoResponse = await axios.get(`http://localhost:${PORT}/api/info?url=${encodeURIComponent(url)}`);
        if (infoResponse.data && infoResponse.data.formats && infoResponse.data.formats.length > 0) {
          // Use specified format if available
          if (itag) {
            const format = infoResponse.data.formats.find(f => f.itag === itag);
            if (format) {
              directUrl = format.url;
            }
          } else {
            // Otherwise use the first/best format
            directUrl = infoResponse.data.formats[0].url;
          }
          
          // Get title for filename
          if (infoResponse.data.title) {
            // Create a safe filename
            filename = infoResponse.data.title.replace(/[^\w\s]/gi, '') + '.mp4';
            
            // Check if it's audio
            if (infoResponse.data.mediaType === 'audio') {
              filename = filename.replace(/\.mp4$/, '.mp3');
              contentType = 'audio/mpeg';
            }
          }
        }
      } catch (infoError) {
        console.error('Error getting platform info:', infoError);
        // Continue with direct URL if info fails
      }
      
      // Redirect to direct download
      const redirectUrl = `/api/direct?url=${encodeURIComponent(directUrl)}&filename=${encodeURIComponent(filename)}`;
      return res.redirect(redirectUrl);
      
    } catch (error) {
      console.error('Download error:', error);
      res.status(500).json({ error: 'Download failed', details: error.message });
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Temporary directory: ${TEMP_DIR}`);
});
