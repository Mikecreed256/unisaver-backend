// server.js - Enhanced with Puppeteer-based handlers for improved media extraction
const express = require('express');
const cors = require('cors');
const youtubeDl = require('youtube-dl-exec');  // Primary downloader for most platforms
const ytdl = require('ytdl-core');             // Backup for YouTube
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const cheerio = require('cheerio');
const fbDownloader = require('fb-downloader');
const tikTokScraper = require('tiktok-scraper');
const pinterestScraper = require('pinterest-scraper');
const SoundCloud = require('soundcloud-downloader').default;
const puppeteer = require('puppeteer');         // Added for enhanced scraping

// For ES module imports like node-fetch
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Initialize Express app
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

// Helper function to get the best format from a formats array
function getBestFormat(formats, preferAudio = false) {
  if (!formats || formats.length === 0) {
    return null;
  }

  if (preferAudio) {
    // Return audio-only format if available
    const audioFormat = formats.find(f => f.hasAudio && !f.hasVideo);
    if (audioFormat) {
      return audioFormat;
    }
  }

  // For video, prefer formats with both audio and video
  const completeFmt = formats.find(f => f.hasAudio && f.hasVideo);
  if (completeFmt) {
    return completeFmt;
  }

  // Otherwise, return the first format
  return formats[0];
}

// =============== ENHANCED TIKTOK EXTRACTION WITH PUPPETEER ===============
async function extractTikTokMedia(url) {
  console.log(`Extracting TikTok media from: ${url}`);

  let browser = null;

  try {
    // Strategy 1: Use Puppeteer to extract media (most reliable)
    browser = await puppeteer.launch({
      headless: 'new', // Use new headless mode
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
    });

    const page = await browser.newPage();

    // Set mobile device to handle TikTok better
    await page.emulate(puppeteer.devices['iPhone X']);

    // Intercept network requests to find media URLs
    let videoUrl = null;
    let audioUrl = null;
    let noWatermarkUrl = null;
    let thumbnailUrl = null;
    let title = 'TikTok Video';
    let author = null;

    await page.setRequestInterception(true);

    page.on('request', (request) => {
      request.continue();
    });

    page.on('response', async (response) => {
      const respUrl = response.url();

      // Look for API responses that contain video URLs
      if (respUrl.includes('api/item/detail') ||
          respUrl.includes('api/item') ||
          respUrl.includes('tiktok.com/play') ||
          respUrl.includes('tiktok.com/aweme/item') ||
          respUrl.includes('play.tiktokcdn.com') ||
          respUrl.includes('api/recommend/item')) {
        try {
          const contentType = response.headers()['content-type'];
          if (contentType && contentType.includes('application/json')) {
            const data = await response.json();

            // Navigate through different API response structures
            let itemData = data.itemInfo?.itemStruct ||
                data.aweme_detail ||
                data.aweme_list?.[0] ||
                data.item_list?.[0] ||
                data.items?.[0] ||
                data.sigi_response?.item_list?.[0];

            if (itemData) {
              // Extract video URLs
              if (itemData.video) {
                let videoData = itemData.video;

                // Extract no watermark URL
                if (videoData.playAddr || videoData.play_addr) {
                  let playAddrs = videoData.playAddr || videoData.play_addr;
                  if (Array.isArray(playAddrs.urlList)) {
                    noWatermarkUrl = playAddrs.urlList[0];
                  } else if (Array.isArray(playAddrs.url_list)) {
                    noWatermarkUrl = playAddrs.url_list[0];
                  } else if (playAddrs.url) {
                    noWatermarkUrl = playAddrs.url;
                  }
                }

                // Extract watermarked URL as fallback
                if (!videoUrl && (videoData.downloadAddr || videoData.download_addr)) {
                  let downloadAddrs = videoData.downloadAddr || videoData.download_addr;
                  if (Array.isArray(downloadAddrs.urlList)) {
                    videoUrl = downloadAddrs.urlList[0];
                  } else if (Array.isArray(downloadAddrs.url_list)) {
                    videoUrl = downloadAddrs.url_list[0];
                  } else if (downloadAddrs.url) {
                    videoUrl = downloadAddrs.url;
                  }
                }

                // Extract audio URL
                if (videoData.music || itemData.music) {
                  let musicData = videoData.music || itemData.music;
                  if (musicData.playUrl || musicData.play_url) {
                    let musicAddr = musicData.playUrl || musicData.play_url;
                    if (Array.isArray(musicAddr.urlList)) {
                      audioUrl = musicAddr.urlList[0];
                    } else if (Array.isArray(musicAddr.url_list)) {
                      audioUrl = musicAddr.url_list[0];
                    } else if (musicAddr.url) {
                      audioUrl = musicAddr.url;
                    }
                  }
                }
              }

              // Extract thumbnail
              if (itemData.cover || itemData.thumbnail_url) {
                let coverData = itemData.cover || {url_list: [itemData.thumbnail_url]};
                if (Array.isArray(coverData.urlList)) {
                  thumbnailUrl = coverData.urlList[0];
                } else if (Array.isArray(coverData.url_list)) {
                  thumbnailUrl = coverData.url_list[0];
                } else if (coverData.url) {
                  thumbnailUrl = coverData.url;
                }
              }

              // Extract title and author
              if (itemData.desc) {
                title = itemData.desc;
              }

              if (itemData.author || itemData.authorInfo) {
                let authorData = itemData.author || itemData.authorInfo;
                author = authorData.nickname || authorData.uniqueId || 'TikTok User';
              }
            }
          }
        } catch (e) {
          console.log('Error parsing TikTok API response:', e.message);
        }
      }

      // Look for video/audio files directly
      if (!videoUrl && !noWatermarkUrl &&
          (respUrl.includes('.mp4') || respUrl.includes('video/play') ||
              respUrl.includes('videocdn') || respUrl.includes('media.tiktok.com'))) {
        videoUrl = respUrl;
      }

      if (!audioUrl && (respUrl.includes('.mp3') || respUrl.includes('soundfile') ||
          respUrl.includes('audiocdn'))) {
        audioUrl = respUrl;
      }

      if (!thumbnailUrl && (respUrl.includes('.jpg') || respUrl.includes('.jpeg') ||
          respUrl.includes('.png') || respUrl.includes('thumbnail'))) {
        thumbnailUrl = respUrl;
      }
    });

    // Navigate to the URL and wait for content to load
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Wait a bit for videos to load
    await page.waitForTimeout(3000);

    // Try to click play button if present
    try {
      await page.evaluate(() => {
        const playButtons = Array.from(document.querySelectorAll('button[aria-label="Play"], .tiktok-play-button, .tt-video-play'));
        if (playButtons.length > 0) playButtons[0].click();
      });

      // Wait for video to start loading
      await page.waitForTimeout(2000);
    } catch (e) {
      console.log('No play button found or unable to click');
    }

    // Extract meta tags if we haven't found video yet
    if (!videoUrl && !noWatermarkUrl) {
      const metaTags = await page.evaluate(() => {
        const video = document.querySelector('video[src]');
        const videoSrc = video ? video.src : null;

        const ogVideo = document.querySelector('meta[property="og:video"]');
        const ogVideoUrl = document.querySelector('meta[property="og:video:url"]');
        const ogImage = document.querySelector('meta[property="og:image"]');
        const ogTitle = document.querySelector('meta[property="og:title"]');
        const ogDescription = document.querySelector('meta[property="og:description"]');

        return {
          videoSrc,
          ogVideo: ogVideo ? ogVideo.content : null,
          ogVideoUrl: ogVideoUrl ? ogVideoUrl.content : null,
          ogImage: ogImage ? ogImage.content : null,
          ogTitle: ogTitle ? ogTitle.content : null,
          ogDescription: ogDescription ? ogDescription.content : null
        };
      });

      if (metaTags.videoSrc) videoUrl = metaTags.videoSrc;
      if (!videoUrl && metaTags.ogVideo) videoUrl = metaTags.ogVideo;
      if (!videoUrl && metaTags.ogVideoUrl) videoUrl = metaTags.ogVideoUrl;
      if (!thumbnailUrl && metaTags.ogImage) thumbnailUrl = metaTags.ogImage;
      if (metaTags.ogTitle) title = metaTags.ogTitle;
      if (!title && metaTags.ogDescription) title = metaTags.ogDescription;
    }

    // Choose best video URL
    const bestVideoUrl = noWatermarkUrl || videoUrl;

    if (!bestVideoUrl) {
      throw new Error('No video URL found on TikTok page');
    }

    // Format the formats array
    const formats = [];

    // Add no watermark video if available
    if (noWatermarkUrl) {
      formats.push({
        itag: 'tt_nowm',
        quality: 'No Watermark',
        mimeType: 'video/mp4',
        url: noWatermarkUrl,
        hasAudio: true,
        hasVideo: true,
        contentLength: 0,
        container: 'mp4'
      });
    }

    // Add watermarked video if available and different
    if (videoUrl && videoUrl !== noWatermarkUrl) {
      formats.push({
        itag: 'tt_wm',
        quality: 'With Watermark',
        mimeType: 'video/mp4',
        url: videoUrl,
        hasAudio: true,
        hasVideo: true,
        contentLength: 0,
        container: 'mp4'
      });
    }

    // Add audio-only option if available
    if (audioUrl) {
      formats.push({
        itag: 'tt_audio',
        quality: 'Audio Only',
        mimeType: 'audio/mp3',
        url: audioUrl,
        hasAudio: true,
        hasVideo: false,
        contentLength: 0,
        container: 'mp3'
      });
    }

    // Return the video info
    return {
      title: title,
      thumbnails: thumbnailUrl ? [{ url: thumbnailUrl, width: 480, height: 480 }] : [],
      formats: formats,
      platform: 'tiktok',
      mediaType: 'video',
      uploader: author,
      directUrl: bestVideoUrl
    };

  } catch (puppeteerError) {
    console.error('TikTok Puppeteer extraction failed:', puppeteerError.message);

    // Strategy 2: Try tiktok-scraper
    try {
      console.log('Trying tiktok-scraper...');
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

        // Add audio-only option if music URL is available
        if (video.musicMeta && video.musicMeta.playUrl) {
          formats.push({
            itag: 'tt_audio',
            quality: 'Audio Only',
            mimeType: 'audio/mp3',
            url: video.musicMeta.playUrl,
            hasAudio: true,
            hasVideo: false,
            contentLength: 0,
            container: 'mp3'
          });
        }

        // Choose best URL
        const bestUrl = video.videoUrlNoWaterMark || video.videoUrl;

        return {
          title: video.text || 'TikTok Video',
          thumbnails: video.covers ? video.covers.map((url, i) => ({ url, width: 480, height: 480 })) : [],
          formats: formats,
          platform: 'tiktok',
          mediaType: 'video',
          uploader: video.authorMeta ? video.authorMeta.name : null,
          uploadDate: new Date(video.createTime * 1000).toISOString().split('T')[0],
          directUrl: bestUrl
        };
      }
    } catch (ttError) {
      console.error('tiktok-scraper error:', ttError.message);
    }

    // Strategy 3: Try youtube-dl
    try {
      console.log('Trying youtube-dl for TikTok...');
      const info = await youtubeDl(url, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        addHeader: [
          'referer:tiktok.com',
          'user-agent:Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1'
        ]
      });

      if (info.formats && info.formats.length > 0) {
        // Find best video and audio formats
        const videoFormats = info.formats.filter(f => f.vcodec !== 'none');
        const audioFormats = info.formats.filter(f => f.acodec !== 'none' && f.vcodec === 'none');

        // Sort by quality
        videoFormats.sort((a, b) => (b.height || 0) - (a.height || 0));
        audioFormats.sort((a, b) => (b.abr || 0) - (a.abr || 0));

        // Create formats array for our API
        const formats = [];

        // Add best video format
        if (videoFormats.length > 0) {
          formats.push({
            itag: `tt_video_${videoFormats[0].format_id}`,
            quality: videoFormats[0].format_note || `${videoFormats[0].height}p`,
            mimeType: 'video/mp4',
            url: videoFormats[0].url,
            hasAudio: videoFormats[0].acodec !== 'none',
            hasVideo: true,
            contentLength: videoFormats[0].filesize || 0,
            container: videoFormats[0].ext || 'mp4'
          });
        }

        // Add best audio-only format if available
        if (audioFormats.length > 0) {
          formats.push({
            itag: `tt_audio_${audioFormats[0].format_id}`,
            quality: 'Audio Only',
            mimeType: `audio/${audioFormats[0].ext || 'mp3'}`,
            url: audioFormats[0].url,
            hasAudio: true,
            hasVideo: false,
            contentLength: audioFormats[0].filesize || 0,
            container: audioFormats[0].ext || 'mp3'
          });
        }

        // Choose the best URL
        let bestUrl = formats[0].url;

        return {
          title: info.title || 'TikTok Video',
          thumbnails: info.thumbnails ? info.thumbnails.map(t => ({ url: t.url, width: t.width, height: t.height })) : [],
          formats: formats,
          platform: 'tiktok',
          mediaType: 'video',
          uploader: info.uploader || info.channel,
          uploadDate: info.upload_date,
          directUrl: bestUrl
        };
      }
    } catch (ytdlError) {
      console.error('youtube-dl for TikTok failed:', ytdlError.message);
    }

    // Re-throw the original error if all strategies fail
    throw puppeteerError;
  } finally {
    // Always close the browser
    if (browser) {
      await browser.close();
    }
  }
}

// =============== ENHANCED INSTAGRAM EXTRACTION WITH PUPPETEER ===============
async function extractInstagramMedia(url) {
  console.log(`Extracting Instagram media from: ${url}`);

  let browser = null;

  try {
    // Strategy 1: Use Puppeteer to extract media (most reliable)
    browser = await puppeteer.launch({
      headless: 'new', // Use new headless mode
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
    });

    const page = await browser.newPage();

    // Set a realistic user agent
    await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1');

    // Intercept network requests to find media URLs
    let videoUrl = null;
    let imageUrl = null;
    let thumbnailUrl = null;
    let title = 'Instagram Media';

    await page.setRequestInterception(true);

    page.on('request', (request) => {
      request.continue();
    });

    page.on('response', async (response) => {
      const respUrl = response.url();

      // Look for video/image files directly
      if (!videoUrl && (respUrl.includes('.mp4') || respUrl.includes('video_url') ||
          respUrl.includes('instagramVideos'))) {
        videoUrl = respUrl;
      }

      if (!imageUrl && (respUrl.includes('.jpg') || respUrl.includes('.jpeg') ||
          respUrl.includes('.png') || respUrl.includes('cdninstagram'))) {
        // Filter out small profile pictures and icons
        if (!respUrl.includes('profile_pic') && !respUrl.includes('icon') &&
            !respUrl.includes('avatar')) {
          imageUrl = respUrl;
        }
      }

      // Look for API responses that might contain media URLs
      if (respUrl.includes('api/v1') || respUrl.includes('graphql') ||
          respUrl.includes('instagram.com/p/') || respUrl.includes('instagram.com/reel/')) {
        try {
          const contentType = response.headers()['content-type'];
          if (contentType && contentType.includes('application/json')) {
            const data = await response.json();

            // Navigate through different API response structures
            let mediaData = data.items?.[0] ||
                data.graphql?.shortcode_media ||
                data.data?.shortcode_media;

            if (mediaData) {
              // Extract video URL
              if (mediaData.video_url) {
                videoUrl = mediaData.video_url;
              } else if (mediaData.video_versions) {
                const videos = mediaData.video_versions;
                if (videos.length > 0) {
                  // Get the highest quality video
                  videos.sort((a, b) => (b.width || 0) - (a.width || 0));
                  videoUrl = videos[0].url;
                }
              }

              // Extract image URL
              if (!imageUrl) {
                if (mediaData.display_url) {
                  imageUrl = mediaData.display_url;
                } else if (mediaData.image_versions2) {
                  const images = mediaData.image_versions2.candidates;
                  if (images && images.length > 0) {
                    // Get the highest quality image
                    images.sort((a, b) => (b.width || 0) - (a.width || 0));
                    imageUrl = images[0].url;
                  }
                }
              }

              // Extract title/caption
              if (mediaData.caption) {
                if (typeof mediaData.caption === 'string') {
                  title = mediaData.caption;
                } else if (mediaData.caption.text) {
                  title = mediaData.caption.text;
                }
              } else if (mediaData.edge_media_to_caption &&
                  mediaData.edge_media_to_caption.edges &&
                  mediaData.edge_media_to_caption.edges.length > 0) {
                title = mediaData.edge_media_to_caption.edges[0].node.text;
              }
            }
          }
        } catch (e) {
          console.log('Error parsing Instagram API response:', e.message);
        }
      }
    });

    // Navigate to the URL and wait for content to load
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Wait a bit for media to load
    await page.waitForTimeout(3000);

    // Try to play video if present
    try {
      await page.evaluate(() => {
        const video = document.querySelector('video');
        if (video) video.play();
      });

      // Wait for video to start loading
      await page.waitForTimeout(2000);
    } catch (e) {
      console.log('No video found or unable to play');
    }

    // Extract meta tags and elements if we haven't found media yet
    if (!videoUrl && !imageUrl) {
      const pageData = await page.evaluate(() => {
        // Check for video element
        const video = document.querySelector('video[src]');
        const videoSrc = video ? video.src : null;

        // Check for large images
        const images = Array.from(document.querySelectorAll('img'))
            .filter(img => img.width > 300 && !img.src.includes('profile_pic') &&
                !img.src.includes('avatar'))
            .map(img => ({
              src: img.src,
              width: img.width,
              height: img.height
            }))
            .sort((a, b) => (b.width * b.height) - (a.width * a.height));

        const largeImageSrc = images.length > 0 ? images[0].src : null;

        // Check meta tags
        const ogVideo = document.querySelector('meta[property="og:video"]');
        const ogVideoUrl = document.querySelector('meta[property="og:video:url"]');
        const ogVideoSecure = document.querySelector('meta[property="og:video:secure_url"]');
        const ogImage = document.querySelector('meta[property="og:image"]');
        const ogImageSecure = document.querySelector('meta[property="og:image:secure_url"]');
        const ogTitle = document.querySelector('meta[property="og:title"]');

        return {
          videoSrc,
          largeImageSrc,
          ogVideo: ogVideo ? ogVideo.content : null,
          ogVideoUrl: ogVideoUrl ? ogVideoUrl.content : null,
          ogVideoSecure: ogVideoSecure ? ogVideoSecure.content : null,
          ogImage: ogImage ? ogImage.content : null,
          ogImageSecure: ogImageSecure ? ogImageSecure.content : null,
          ogTitle: ogTitle ? ogTitle.content : null
        };
      });

      if (pageData.videoSrc) videoUrl = pageData.videoSrc;
      if (!videoUrl && pageData.ogVideo) videoUrl = pageData.ogVideo;
      if (!videoUrl && pageData.ogVideoUrl) videoUrl = pageData.ogVideoUrl;
      if (!videoUrl && pageData.ogVideoSecure) videoUrl = pageData.ogVideoSecure;

      if (!imageUrl && pageData.largeImageSrc) imageUrl = pageData.largeImageSrc;
      if (!imageUrl && pageData.ogImage) imageUrl = pageData.ogImage;
      if (!imageUrl && pageData.ogImageSecure) imageUrl = pageData.ogImageSecure;

      if (pageData.ogTitle) title = pageData.ogTitle.replace(' • Instagram', '').trim();
    }

    // Choose the best media URL
    const isVideo = !!videoUrl;
    const mediaUrl = isVideo ? videoUrl : imageUrl;
    thumbnailUrl = imageUrl || videoUrl;

    if (!mediaUrl) {
      throw new Error('No media found on Instagram page');
    }

    // Format the response in our API structure
    const formats = [];

    if (isVideo) {
      formats.push({
        itag: 'ig_video',
        quality: 'Original',
        mimeType: 'video/mp4',
        url: videoUrl,
        hasAudio: true,
        hasVideo: true,
        contentLength: 0,
        container: 'mp4'
      });
    }

    if (imageUrl) {
      formats.push({
        itag: 'ig_image',
        quality: 'Original',
        mimeType: 'image/jpeg',
        url: imageUrl,
        hasAudio: false,
        hasVideo: false,
        contentLength: 0,
        container: 'jpeg'
      });
    }

    return {
      title: title,
      thumbnails: thumbnailUrl ? [{ url: thumbnailUrl, width: 640, height: 640 }] : [],
      formats: formats,
      platform: 'instagram',
      mediaType: isVideo ? 'video' : 'image',
      directUrl: mediaUrl
    };

  } catch (puppeteerError) {
    console.error('Instagram Puppeteer extraction failed:', puppeteerError.message);

    // Strategy 2: Try youtube-dl
    try {
      console.log('Trying youtube-dl for Instagram...');
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

        // Choose the best format
        const bestFormat = formats[0];

        return {
          title: info.title || 'Instagram Media',
          thumbnails: info.thumbnails ? info.thumbnails.map(t => ({ url: t.url, width: t.width, height: t.height })) : [],
          formats: formats,
          platform: 'instagram',
          mediaType: formats[0].hasVideo ? 'video' : 'image',
          directUrl: bestFormat.url
        };
      } else if (info.url) {
        // Single URL case
        const isVideo = info.url.includes('.mp4');

        const formats = [{
          itag: 'ig_1',
          quality: 'Original',
          mimeType: isVideo ? 'video/mp4' : 'image/jpeg',
          url: info.url,
          hasAudio: isVideo,
          hasVideo: isVideo,
          contentLength: 0,
          container: isVideo ? 'mp4' : 'jpeg'
        }];

        return {
          title: info.title || 'Instagram Media',
          thumbnails: info.thumbnail ? [{ url: info.thumbnail, width: 640, height: 640 }] : [],
          formats: formats,
          platform: 'instagram',
          mediaType: isVideo ? 'video' : 'image',
          directUrl: info.url
        };
      }
    } catch (ytdlError) {
      console.error('youtube-dl for Instagram failed:', ytdlError.message);
    }

    // Strategy 3: Fetch the page and parse it manually
    try {
      console.log('Trying manual HTML extraction for Instagram...');
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

        return {
          title: title,
          thumbnails: [{ url: thumbnailUrl, width: 640, height: 640 }],
          formats: formats,
          platform: 'instagram',
          mediaType: isVideo ? 'video' : 'image',
          directUrl: mediaUrl
        };
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

        return {
          title: ogTitle,
          thumbnails: [{ url: ogImage || mediaUrl, width: 640, height: 640 }],
          formats: formats,
          platform: 'instagram',
          mediaType: isVideo ? 'video' : 'image',
          directUrl: mediaUrl
        };
      }
    } catch (htmlError) {
      console.error('Manual extraction failed:', htmlError.message);
    }

    // Re-throw the original error if all strategies fail
    throw puppeteerError;
  } finally {
    // Always close the browser
    if (browser) {
      await browser.close();
    }
  }
}

// =============== ENHANCED PINTEREST EXTRACTION WITH PUPPETEER ===============
async function extractPinterestMedia(url) {
  console.log(`Extracting Pinterest media from: ${url}`);

  let browser = null;

  try {
    // Strategy 1: Use Puppeteer to extract media (most reliable)
    browser = await puppeteer.launch({
      headless: 'new', // Use new headless mode
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // Set a realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

    // Intercept network requests to find media URLs
    let videoUrl = null;
    let imageUrl = null;
    let title = 'Pinterest Media';

    await page.setRequestInterception(true);

    page.on('request', (request) => {
      request.continue();
    });

    page.on('response', async (response) => {
      const respUrl = response.url();

      // Look for video files
      if (respUrl.includes('.mp4') || respUrl.includes('/videos/')) {
        videoUrl = respUrl;
      }

      // Look for high-res images
      if ((respUrl.includes('.jpg') || respUrl.includes('.png')) &&
          (respUrl.includes('originals') || respUrl.includes('x/')) &&
          !respUrl.includes('avatar') && !respUrl.includes('profile')) {
        imageUrl = respUrl;
      }

      // Check API responses for media data
      if (respUrl.includes('api/v3') || respUrl.includes('resourceResponses')) {
        try {
          const contentType = response.headers()['content-type'];
          if (contentType && contentType.includes('application/json')) {
            const data = await response.json();
            if (data && data.resource_response && data.resource_response.data) {
              const pinData = data.resource_response.data;
              if (pinData.videos && pinData.videos.video_list) {
                const videoFormats = Object.values(pinData.videos.video_list);
                if (videoFormats.length > 0) {
                  // Sort by width to get highest quality
                  videoFormats.sort((a, b) => b.width - a.width);
                  videoUrl = videoFormats[0].url;
                }
              }
              if (!videoUrl && pinData.images) {
                // Find highest resolution image
                if (pinData.images.orig) {
                  imageUrl = pinData.images.orig.url;
                }
              }
              if (pinData.title) {
                title = pinData.title;
              } else if (pinData.grid_title) {
                title = pinData.grid_title;
              }
            }
          }
        } catch (e) {
          console.log('Error parsing API response:', e.message);
        }
      }
    });

    // Navigate to the URL and wait for content to load
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Extract information from the page if we haven't found it yet
    if (!videoUrl && !imageUrl) {
      // Extract meta tags
      const metaTags = await page.evaluate(() => {
        const ogImage = document.querySelector('meta[property="og:image"]');
        const ogVideo = document.querySelector('meta[property="og:video"]') ||
            document.querySelector('meta[property="og:video:url"]');
        const ogTitle = document.querySelector('meta[property="og:title"]');

        return {
          imageUrl: ogImage ? ogImage.content : null,
          videoUrl: ogVideo ? ogVideo.content : null,
          title: ogTitle ? ogTitle.content.replace(' | Pinterest', '') : null
        };
      });

      if (metaTags.videoUrl) videoUrl = metaTags.videoUrl;
      if (metaTags.imageUrl) imageUrl = metaTags.imageUrl;
      if (metaTags.title) title = metaTags.title;

      // Look for video or image elements
      if (!videoUrl) {
        videoUrl = await page.evaluate(() => {
          const videos = Array.from(document.querySelectorAll('video source'));
          return videos.length > 0 ? videos[0].src : null;
        });
      }

      if (!imageUrl) {
        imageUrl = await page.evaluate(() => {
          // Look for full-size images
          const images = Array.from(document.querySelectorAll('img[srcset]'))
              .filter(img => img.width > 300); // Filter out small images

          if (images.length > 0) {
            // Parse srcset to get largest image
            const srcset = images[0].srcset;
            const srcsetItems = srcset.split(',');
            const largestImage = srcsetItems[srcsetItems.length - 1].trim().split(' ')[0];
            return largestImage;
          }

          // Fallback to regular images
          const regularImages = Array.from(document.querySelectorAll('img'))
              .filter(img => img.width > 300 && !img.src.includes('avatar'));

          return regularImages.length > 0 ? regularImages[0].src : null;
        });
      }
    }

    // If we still don't have a media URL, do one last search in the HTML
    if (!videoUrl && !imageUrl) {
      const html = await page.content();
      const $ = cheerio.load(html);

      // Look for high-res originals first
      const originalImagesMatch = html.match(/https:\/\/i\.pinimg\.com\/originals\/[a-zA-Z0-9\/\._-]+\.(?:jpg|jpeg|png|gif)/gi);
      if (originalImagesMatch && originalImagesMatch.length > 0) {
        imageUrl = originalImagesMatch[0];
      }

      // If no originals, look for specific sizes (736x is common for Pinterest)
      if (!imageUrl) {
        const sizedImagesMatch = html.match(/https:\/\/i\.pinimg\.com\/[0-9]+x(?:\/[a-zA-Z0-9\/\._-]+\.(?:jpg|jpeg|png|gif))/gi);
        if (sizedImagesMatch && sizedImagesMatch.length > 0) {
          imageUrl = sizedImagesMatch[0];
        }
      }
    }

    // Format the result to match our API structure
    const isVideo = !!videoUrl;
    const mediaUrl = isVideo ? videoUrl : imageUrl;

    if (!mediaUrl) {
      throw new Error('No media found on this Pinterest pin');
    }

    const thumbnailUrl = imageUrl || mediaUrl;

    // Determine format from URL
    let format = 'jpg';
    if (mediaUrl.toLowerCase().endsWith('.png')) format = 'png';
    else if (mediaUrl.toLowerCase().endsWith('.gif')) format = 'gif';
    else if (mediaUrl.toLowerCase().endsWith('.webp')) format = 'webp';
    else if (mediaUrl.toLowerCase().endsWith('.mp4')) format = 'mp4';

    const result = {
      title: title || 'Pinterest Media',
      thumbnails: [{ url: thumbnailUrl, width: 480, height: 480 }],
      formats: [{
        itag: 'pin_1',
        quality: 'Original',
        mimeType: isVideo ? `video/${format}` : `image/${format}`,
        url: mediaUrl,
        hasAudio: isVideo,
        hasVideo: isVideo,
        contentLength: 0,
        container: format
      }],
      platform: 'pinterest',
      mediaType: isVideo ? 'video' : 'image',
      directUrl: mediaUrl
    };

    return result;

  } catch (puppeteerError) {
    console.error('Puppeteer extraction failed:', puppeteerError.message);

    // Strategy 2: Try youtube-dl as fallback
    try {
      console.log('Falling back to youtube-dl for Pinterest...');
      const info = await youtubeDl(url, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        addHeader: ['referer:pinterest.com', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.82 Safari/537.36']
      });

      if (info.formats && info.formats.length > 0) {
        return {
          title: info.title || 'Pinterest Media',
          thumbnails: info.thumbnails ? info.thumbnails.map(t => ({ url: t.url, width: t.width, height: t.height })) : [],
          formats: info.formats.map((format, index) => ({
            itag: `pin_${index}`,
            quality: format.format_note || format.height ? `${format.height}p` : 'Standard',
            mimeType: format.vcodec !== 'none' ? 'video/mp4' : 'image/jpeg',
            url: format.url,
            hasAudio: format.vcodec !== 'none',
            hasVideo: format.vcodec !== 'none',
            contentLength: format.filesize || 0,
            container: format.ext || (format.vcodec !== 'none' ? 'mp4' : 'jpeg')
          })),
          platform: 'pinterest',
          mediaType: info.formats[0].vcodec !== 'none' ? 'video' : 'image',
          directUrl: info.formats[0].url
        };
      } else if (info.url) {
        const isVideo = info.url.includes('.mp4');
        return {
          title: info.title || 'Pinterest Media',
          thumbnails: info.thumbnail ? [{ url: info.thumbnail, width: 480, height: 480 }] : [],
          formats: [{
            itag: 'pin_1',
            quality: 'Original',
            mimeType: isVideo ? 'video/mp4' : 'image/jpeg',
            url: info.url,
            hasAudio: isVideo,
            hasVideo: isVideo,
            contentLength: 0,
            container: isVideo ? 'mp4' : 'jpeg'
          }],
          platform: 'pinterest',
          mediaType: isVideo ? 'video' : 'image',
          directUrl: info.url
        };
      }
    } catch (ytdlError) {
      console.error('youtube-dl fallback for Pinterest failed:', ytdlError.message);
    }

    // Strategy 3: Try using pinterest-scraper
    try {
      console.log('Trying pinterest-scraper...');
      const pinData = await pinterestScraper.scrape(url);

      if (pinData && pinData.url) {
        // Determine if it's an image or video
        const isVideo = pinData.url.includes('.mp4') || pinData.type === 'video';

        return {
          title: pinData.title || 'Pinterest Media',
          thumbnails: [{ url: pinData.thumbnail || pinData.url, width: 480, height: 480 }],
          formats: [{
            itag: 'pin_1',
            quality: 'Original',
            mimeType: isVideo ? 'video/mp4' : 'image/jpeg',
            url: pinData.url,
            hasAudio: isVideo,
            hasVideo: isVideo,
            contentLength: 0,
            container: isVideo ? 'mp4' : 'jpeg'
          }],
          platform: 'pinterest',
          mediaType: isVideo ? 'video' : 'image',
          directUrl: pinData.url
        };
      }
    } catch (pinError) {
      console.error('pinterest-scraper error:', pinError.message);
    }

    // Re-throw the original error if all strategies fail
    throw puppeteerError;
  } finally {
    // Always close the browser
    if (browser) {
      try {
        await browser.close();
      } catch (closeErr) {
        console.error('Error closing browser:', closeErr);
      }
    }


// =============== ENHANCED FACEBOOK EXTRACTION WITH PUPPETEER ===============
async function extractFacebookVideo(url) {
  console.log(`Extracting Facebook video from: ${url}`);

  // Convert to mobile URL for better extraction
  const mobileUrl = url.replace('www.facebook.com', 'm.facebook.com')
      .replace('web.facebook.com', 'm.facebook.com')
      .replace('facebook.com', 'm.facebook.com');

  let browser = null;

  try {
    // Strategy 1: Use Puppeteer to extract video (most reliable)
    browser = await puppeteer.launch({
      headless: 'new', // Use new headless mode
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
    });

    const page = await browser.newPage();

    // Set mobile device to better handle Facebook
    await page.emulate(puppeteer.devices['iPhone X']);

    // Set cookies to avoid login prompts
    await page.setCookie({
      name: 'locale',
      value: 'en_US',
      domain: '.facebook.com',
      path: '/',
    });

    // Intercept network requests to find video URLs
    let videoUrls = [];
    let hdUrl = null;
    let sdUrl = null;
    let title = 'Facebook Video';
    let thumbnail = null;

    await page.setRequestInterception(true);

    page.on('request', (request) => {
      request.continue();
    });

    page.on('response', async (response) => {
      const respUrl = response.url();

      // Look for video files
      if (respUrl.includes('.mp4') && !respUrl.includes('bytestart=')) {
        videoUrls.push(respUrl);

        // Classify as HD or SD based on URL patterns
        if (respUrl.includes('hd_src') || respUrl.includes('720p') || respUrl.includes('1080p')) {
          hdUrl = respUrl;
        } else if (!sdUrl) {
          sdUrl = respUrl;
        }
      }

      // Check XHR responses for video data
      if (respUrl.includes('/api/graphql/') || respUrl.includes('/video_manifest/')) {
        try {
          const contentType = response.headers()['content-type'];
          if (contentType && contentType.includes('application/json')) {
            const text = await response.text();
            // Look for URLs in the response
            const urlMatches = text.match(/(https:\/\/[^"'\s]+\.mp4[^"'\s]*)/g);
            if (urlMatches && urlMatches.length > 0) {
              videoUrls = [...videoUrls, ...urlMatches];

              // Find highest quality URL
              for (const videoUrl of urlMatches) {
                if ((videoUrl.includes('hd_src') || videoUrl.includes('720p') || videoUrl.includes('1080p')) && !videoUrl.includes('bytestart=')) {
                  hdUrl = videoUrl;
                } else if (!sdUrl && !videoUrl.includes('bytestart=')) {
                  sdUrl = videoUrl;
                }
              }
            }
          }
        } catch (e) {
          console.log('Error parsing API response:', e.message);
        }
      }
    });

    // Navigate to the URL and wait for content to load
    await page.goto(mobileUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    // Wait a bit for videos to load
    await page.waitForTimeout(3000);

    // Click any play buttons if present
    try {
      await page.evaluate(() => {
        const playButtons = Array.from(document.querySelectorAll('button[aria-label="Play"], [data-testid="play"], i[aria-label="Play"]'));
        if (playButtons.length > 0) playButtons[0].click();
      });

      // Wait for video to start loading
      await page.waitForTimeout(2000);
    } catch (e) {
      console.log('No play button found or unable to click');
    }

    // Extract information from the page
    const pageData = await page.evaluate(() => {
      // Extract title
      let title = document.querySelector('.story_body_container > div, h3, h2, .fcg, .fcb, .accessible_elem, [data-testid="post_message"]');
      title = title ? title.textContent.trim() : 'Facebook Video';

      // Extract thumbnail
      const thumbnail = document.querySelector('video')?.poster ||
          document.querySelector('meta[property="og:image"]')?.content;

      return { title, thumbnail };
    });

    if (pageData.title) title = pageData.title;
    if (pageData.thumbnail) thumbnail = pageData.thumbnail;

    // If we still don't have videos, try extracting directly from HTML
    if (videoUrls.length === 0) {
      const html = await page.content();

      // Look for HD/SD src in JavaScript
      const hdMatch = html.match(/"hd_src":"([^"]+)"/);
      const sdMatch = html.match(/"sd_src":"([^"]+)"/);

      if (hdMatch && hdMatch[1]) {
        hdUrl = hdMatch[1].replace(/\\/g, '');
        videoUrls.push(hdUrl);
      }

      if (sdMatch && sdMatch[1]) {
        sdUrl = sdMatch[1].replace(/\\/g, '');
        videoUrls.push(sdUrl);
      }

      // Look for video tags
      const videoTagMatches = html.match(/<video[^>]*src="([^"]+)"[^>]*>/g);
      if (videoTagMatches) {
        for (const videoTag of videoTagMatches) {
          const srcMatch = videoTag.match(/src="([^"]+)"/);
          if (srcMatch && srcMatch[1]) {
            videoUrls.push(srcMatch[1]);
            if (!sdUrl) sdUrl = srcMatch[1];
          }
        }
      }

      // Extract meta tags for og:video
      const $ = cheerio.load(html);
      const ogVideo = $('meta[property="og:video:url"]').attr('content');
      const ogImage = $('meta[property="og:image"]').attr('content');

      if (ogVideo) {
        videoUrls.push(ogVideo);
        if (!sdUrl) sdUrl = ogVideo;
      }

      if (ogImage && !thumbnail) {
        thumbnail = ogImage;
      }
    }

    // Remove duplicates
    videoUrls = [...new Set(videoUrls)];

    // Filter out invalid URLs or segments
    videoUrls = videoUrls.filter(url =>
        url &&
        url.startsWith('http') &&
        !url.includes('bytestart=') &&
        url.includes('.mp4')
    );

    if (videoUrls.length === 0) {
      throw new Error('No video URLs found in Facebook page');
    }

    // Create formats array
    const formats = [];

    if (hdUrl) {
      formats.push({
        itag: 'fb_hd',
        quality: 'HD',
        mimeType: 'video/mp4',
        url: hdUrl,
        hasAudio: true,
        hasVideo: true,
        contentLength: 0,
        container: 'mp4'
      });
    }

    if (sdUrl && sdUrl !== hdUrl) {
      formats.push({
        itag: 'fb_sd',
        quality: 'SD',
        mimeType: 'video/mp4',
        url: sdUrl,
        hasAudio: true,
        hasVideo: true,
        contentLength: 0,
        container: 'mp4'
      });
    }

    // Add any remaining URLs as generic formats
    for (let i = 0; i < videoUrls.length; i++) {
      const url = videoUrls[i];
      if (url !== hdUrl && url !== sdUrl) {
        formats.push({
          itag: `fb_${i}`,
          quality: 'Unknown',
          mimeType: 'video/mp4',
          url: url,
          hasAudio: true,
          hasVideo: true,
          contentLength: 0,
          container: 'mp4'
        });
      }
    }

    return {
      title: title,
      thumbnails: thumbnail ? [{ url: thumbnail, width: 480, height: 360 }] : [],
      formats: formats,
      platform: 'facebook',
      mediaType: 'video'
    };

  } catch (puppeteerError) {
    console.error('Puppeteer extraction failed:', puppeteerError.message);

    // Strategy 2: Try youtube-dl as fallback
    try {
      console.log('Falling back to youtube-dl for Facebook...');
      const info = await youtubeDl(url, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        addHeader: ['referer:facebook.com', 'user-agent:Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1']
      });

      if (info.formats && info.formats.length > 0) {
        // Extract formats from youtube-dl
        const formats = info.formats.map((format, index) => {
          let quality = 'Unknown';
          if (format.format_note) quality = format.format_note;
          else if (format.height) quality = `${format.height}p`;

          return {
            itag: `fb_ytdl_${index}`,
            quality: quality,
            mimeType: 'video/mp4',
            url: format.url,
            hasAudio: format.acodec !== 'none',
            hasVideo: format.vcodec !== 'none',
            contentLength: format.filesize || 0,
            container: format.ext || 'mp4'
          };
        });

        return {
          title: info.title || 'Facebook Video',
          thumbnails: info.thumbnail ? [{ url: info.thumbnail, width: 480, height: 360 }] : [],
          formats: formats,
          platform: 'facebook',
          mediaType: 'video'
        };
      }
    } catch (ytdlError) {
      console.error('youtube-dl fallback for Facebook failed:', ytdlError.message);

      // Strategy 3: Try fbDownloader as final fallback
      try {
        console.log('Trying fb-downloader as final fallback...');
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

          if (formats.length > 0) {
            return {
              title: result.title || 'Facebook Video',
              thumbnails: result.thumbnail ? [{ url: result.thumbnail, width: 480, height: 360 }] : [],
              formats: formats,
              platform: 'facebook',
              mediaType: 'video'
            };
          }
        }
      } catch (fbError) {
        console.error('fb-downloader final fallback failed:', fbError.message);
      }
    }

    // Re-throw the original error if all strategies fail
    throw puppeteerError;
  } finally {
    // Always close the browser
    if (browser) {
      await browser.close();
    }
  }
}

// =============== YOUTUBE SPECIFIC ENDPOINT ===============
app.get('/api/youtube', async (req, res) => {
  try {
    const url = req.query.url;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`Processing YouTube URL: ${url}`);

    // MODIFIED: Prioritize youtube-dl-exec as requested by user
    try {
      // Use youtube-dl-exec first
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

      // Get best format for direct download
      const bestVideo = getBestFormat(formats);
      const bestAudio = getBestFormat(formats, true);

      // Add direct URLs
      const directUrl = `/api/direct?url=${encodeURIComponent(bestVideo.url)}`;
      const audioUrl = bestAudio && bestAudio.itag !== bestVideo.itag ?
          `/api/direct?url=${encodeURIComponent(bestAudio.url)}` : null;

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
        description: info.description || null,
        directUrl: directUrl,
        audioUrl: audioUrl
      });
      return;

    } catch (ytdlExecError) {
      console.error('youtube-dl-exec error:', ytdlExecError);
      console.log('Falling back to ytdl-core for YouTube...');
    }

    // Fallback to ytdl-core if youtube-dl-exec fails
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

      // Get best format for direct download
      const bestVideo = getBestFormat(formats);
      const bestAudio = getBestFormat(formats, true);

      // Add direct URLs
      const directUrl = `/api/direct?url=${encodeURIComponent(bestVideo.url)}`;
      const audioUrl = bestAudio && bestAudio.itag !== bestVideo.itag ?
          `/api/direct?url=${encodeURIComponent(bestAudio.url)}` : null;

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
        description: videoDetails.description || null,
        directUrl: directUrl,
        audioUrl: audioUrl
      });
      return;
    }

  } catch (error) {
    console.error('YouTube error:', error);
    res.status(500).json({ error: 'YouTube processing failed', details: error.message });
  }
});

// =============== PINTEREST SPECIFIC ENDPOINT ===============
app.get('/api/pinterest', async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`Processing Pinterest URL: ${url}`);

    // Use the enhanced Pinterest extractor with Puppeteer
    try {
      const mediaInfo = await extractPinterestMedia(url);
      // Add directUrl for API consistency
      mediaInfo.directUrl = `/api/direct?url=${encodeURIComponent(mediaInfo.formats[0].url)}`;
      res.json(mediaInfo);
      return;
    } catch (enhancedError) {
      console.error('Enhanced Pinterest extraction failed:', enhancedError);

      // Try using pinterest-scraper as fallback
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
      }

      // Fallback to manual extraction as a last resort
      try {
        const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36';
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

        // Extract from JSON data if still no images
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

        // If we still have no images, return error
        if (imageUrls.length === 0) {
          return res.status(404).json({
            error: 'No images found on this Pinterest page',
            details: 'Try opening the pin in a browser and copying the image URL directly'
          });
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
        return;
      } catch (manualError) {
        console.error('Manual extraction failed:', manualError);
        throw enhancedError; // Re-throw the original error
      }
    }
  } catch (error) {
    console.error('Pinterest error:', error);
    res.status(500).json({ error: 'Pinterest processing failed', details: error.message });
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

    // Use the enhanced Facebook video extractor with Puppeteer
    try {
      const videoInfo = await extractFacebookVideo(url);

      // Add directUrl to the response
      if (videoInfo.formats && videoInfo.formats.length > 0) {
        // Prefer HD quality if available
        const hdFormat = videoInfo.formats.find(f => f.quality === 'HD' || f.quality.includes('720'));
        videoInfo.directUrl = `/api/direct?url=${encodeURIComponent(hdFormat ? hdFormat.url : videoInfo.formats[0].url)}`;
      }

      res.json(videoInfo);
      return;
    } catch (enhancedError) {
      console.error('Enhanced Facebook extraction failed:', enhancedError);

      // Try using fb-downloader as fallback
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
      }

      // Try youtube-dl as another fallback
      try {
        const info = await youtubeDl(url, {
          dumpSingleJson: true,
          noCheckCertificates: true,
          noWarnings: true,
          addHeader: ['referer:facebook.com', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.82 Safari/537.36']
        });

        if (info.formats && info.formats.length > 0) {
          // Extract formats from youtube-dl
          const formats = info.formats.map((format, index) => {
            let quality = 'Unknown';

            if (format.format_note) {
              quality = format.format_note;
            } else if (format.height) {
              quality = `${format.height}p`;
            }

            return {
              itag: `fb_ytdl_${index}`,
              quality: quality,
              mimeType: 'video/mp4',
              url: format.url,
              hasAudio: format.acodec !== 'none',
              hasVideo: format.vcodec !== 'none',
              contentLength: format.filesize || 0,
              container: format.ext || 'mp4'
            };
          });

          // Get direct URL for the highest quality video
          const hdFormat = formats.find(f => f.quality === 'HD' || f.quality.includes('720'));
          const directUrl = `/api/direct?url=${encodeURIComponent(hdFormat ? hdFormat.url : formats[0].url)}`;

          // Return the video info
          res.json({
            title: info.title || 'Facebook Video',
            thumbnails: info.thumbnail ? [{ url: info.thumbnail, width: 480, height: 360 }] : [],
            formats: formats,
            platform: 'facebook',
            mediaType: 'video',
            directUrl: directUrl
          });
          return;
        }
      } catch (ytdlError) {
        console.error('youtube-dl error for Facebook:', ytdlError);
      }

      // If all fallbacks fail, re-throw the original error
      throw enhancedError;
    }
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

    // Use the enhanced TikTok extractor with Puppeteer and improved format selection
    try {
      const mediaInfo = await extractTikTokMedia(url);

      // Add properly formatted directUrl for the API
      if (mediaInfo.formats && mediaInfo.formats.length > 0) {
        // Find the best format depending on what the client might want
        const bestVideo = getBestFormat(mediaInfo.formats);
        const bestAudio = getBestFormat(mediaInfo.formats, true);

        // Prefer "no watermark" video if available
        const noWatermarkFormat = mediaInfo.formats.find(f => f.quality === 'No Watermark');

        const bestFormat = noWatermarkFormat || bestVideo;

        mediaInfo.directUrl = `/api/direct?url=${encodeURIComponent(bestFormat.url)}`;

        // Add audio direct URL if available
        if (bestAudio && bestAudio.itag !== bestFormat.itag) {
          mediaInfo.audioUrl = `/api/direct?url=${encodeURIComponent(bestAudio.url)}`;
        }
      }

      res.json(mediaInfo);
      return;
    } catch (enhancedError) {
      console.error('Enhanced TikTok extraction failed:', enhancedError);

      // Try using tiktok-scraper as first fallback
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

          // Audio-only option (if available)
          if (video.musicMeta && video.musicMeta.playUrl) {
            formats.push({
              itag: 'tt_audio',
              quality: 'Audio Only',
              mimeType: 'audio/mp3',
              url: video.musicMeta.playUrl,
              hasAudio: true,
              hasVideo: false,
              contentLength: 0,
              container: 'mp3'
            });
          }

          // Get best format for direct download
          const bestVideo = getBestFormat(formats);
          const bestAudio = getBestFormat(formats, true);

          // Choose the best URL (no watermark preferred)
          const directUrl = `/api/direct?url=${encodeURIComponent(bestVideo.url)}`;
          const audioUrl = bestAudio && bestAudio.itag !== bestVideo.itag ?
              `/api/direct?url=${encodeURIComponent(bestAudio.url)}` : null;

          res.json({
            title: video.text || 'TikTok Video',
            thumbnails: video.covers ? video.covers.map((url, i) => ({ url, width: 480, height: 480 })) : [],
            formats: formats,
            platform: 'tiktok',
            mediaType: 'video',
            directUrl: directUrl,
            audioUrl: audioUrl,
            uploader: video.authorMeta ? video.authorMeta.name : null,
            uploadDate: new Date(video.createTime * 1000).toISOString().split('T')[0]
          });
          return;
        }
      } catch (ttError) {
        console.error('tiktok-scraper error:', ttError);
      }

      // Try youtube-dl as final fallback
      try {
        console.log('Falling back to youtube-dl for TikTok...');

        const info = await youtubeDl(url, {
          dumpSingleJson: true,
          noCheckCertificates: true,
          noWarnings: true,
          addHeader: [
            'referer:tiktok.com',
            'user-agent:Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1'
          ]
        });

        if (info.formats && info.formats.length > 0) {
          // Find video and audio formats
          const videoFormats = info.formats.filter(f => f.vcodec !== 'none');
          const audioFormats = info.formats.filter(f => f.acodec !== 'none' && f.vcodec === 'none');

          // Sort by quality
          videoFormats.sort((a, b) => (b.height || 0) - (a.height || 0));
          audioFormats.sort((a, b) => (b.abr || 0) - (a.abr || 0));

          // Create formats array
          const formats = [];

          // Add highest quality video
          if (videoFormats.length > 0) {
            formats.push({
              itag: `tt_video_${videoFormats[0].format_id}`,
              quality: videoFormats[0].format_note || `${videoFormats[0].height}p`,
              mimeType: 'video/mp4',
              url: videoFormats[0].url,
              hasAudio: videoFormats[0].acodec !== 'none',
              hasVideo: true,
              contentLength: videoFormats[0].filesize || 0,
              container: videoFormats[0].ext || 'mp4'
            });
          }

          // Add audio-only format if available
          if (audioFormats.length > 0) {
            formats.push({
              itag: `tt_audio_${audioFormats[0].format_id}`,
              quality: 'Audio Only',
              mimeType: `audio/${audioFormats[0].ext || 'mp3'}`,
              url: audioFormats[0].url,
              hasAudio: true,
              hasVideo: false,
              contentLength: audioFormats[0].filesize || 0,
              container: audioFormats[0].ext || 'mp3'
            });
          }

          // Get best formats for direct links
          const bestVideo = getBestFormat(formats);
          const bestAudio = getBestFormat(formats, true);

          const directUrl = `/api/direct?url=${encodeURIComponent(bestVideo.url)}`;
          const audioUrl = bestAudio && bestAudio.itag !== bestVideo.itag ?
              `/api/direct?url=${encodeURIComponent(bestAudio.url)}` : null;

          res.json({
            title: info.title || 'TikTok Video',
            thumbnails: info.thumbnails ? info.thumbnails.map(t => ({ url: t.url, width: t.width, height: t.height })) : [],
            formats: formats,
            platform: 'tiktok',
            mediaType: 'video',
            directUrl: directUrl,
            audioUrl: audioUrl,
            uploader: info.uploader || info.channel,
            uploadDate: info.upload_date
          });
          return;
        }
      } catch (ytdlError) {
        console.error('youtube-dl error for TikTok:', ytdlError);
      }

      // If we get here, all extraction methods have failed
      throw new Error('Could not extract playable media from TikTok URL after trying all methods');
    }
  } catch (error) {
    console.error('TikTok error:', error);
    res.status(500).json({ error: 'TikTok processing failed', details: error.message });
  }
});

// =============== INSTAGRAM SPECIFIC ENDPOINT ===============
app.get('/api/instagram', async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`Processing Instagram URL: ${url}`);

    // Use the enhanced Instagram extractor with Puppeteer
    try {
      const mediaInfo = await extractInstagramMedia(url);

      // Add properly formatted directUrl for the API
      if (mediaInfo.formats && mediaInfo.formats.length > 0) {
        const bestFormat = getBestFormat(mediaInfo.formats);
        mediaInfo.directUrl = `/api/direct?url=${encodeURIComponent(bestFormat.url)}`;
      }

      res.json(mediaInfo);
      return;
    } catch (enhancedError) {
      console.error('Enhanced Instagram extraction failed:', enhancedError);

      // Try using youtube-dl as fallback
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

          // Get best format for direct download
          const bestFormat = getBestFormat(formats);
          const directUrl = `/api/direct?url=${encodeURIComponent(bestFormat.url)}`;

          res.json({
            title: info.title || 'Instagram Media',
            thumbnails: info.thumbnails ? info.thumbnails.map(t => ({ url: t.url, width: t.width, height: t.height })) : [],
            formats: formats,
            platform: 'instagram',
            mediaType: formats[0].hasVideo ? 'video' : 'image',
            directUrl: directUrl
          });
          return;
        }
      } catch (ytdlErr) {
        console.error('Youtube-dl for Instagram failed:', ytdlErr);
      }

      // Fallback to manual HTML extraction
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
      throw new Error('Could not extract media from Instagram URL after trying all methods');
    }
  } catch (error) {
    console.error('Instagram error:', error);
    res.status(500).json({ error: 'Instagram processing failed', details: error.message });
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
      return;
    }
  } catch (scError) {
    console.error('SoundCloud error:', scError);
    console.log('Falling back to youtube-dl for SoundCloud...');
  }

  // Fallback to youtube-dl if SoundCloud downloader fails
  try {
    const info = await youtubeDl(url, {
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

      // Get best format
      const bestFormat = getBestFormat(formats);
      const directUrl = `/api/direct?url=${encodeURIComponent(bestFormat.url)}`;

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
        directUrl: directUrl
      });
      return;
    }

    throw new Error('No audio formats found for SoundCloud URL');
  } catch (ytdlError) {
    console.error('youtube-dl fallback error:', ytdlError);
    res.status(500).json({ error: 'SoundCloud processing failed', details: 'Failed to extract audio' });
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

      // Get best formats for direct links
      const bestVideo = getBestFormat(formats);
      const bestAudio = getBestFormat(formats, true);

      // Add direct URLs
      const directUrl = bestVideo ? `/api/direct?url=${encodeURIComponent(bestVideo.url)}` : null;
      const audioUrl = bestAudio && bestAudio !== bestVideo ?
          `/api/direct?url=${encodeURIComponent(bestAudio.url)}` : null;

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
        directUrl: directUrl,
        audioUrl: audioUrl
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
        description: null,
        directUrl: `/api/direct?url=${encodeURIComponent(url)}`
      });
    }

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// =============== DIRECT DOWNLOAD ENDPOINT WITH ADDITIONAL HEADERS ===============
app.get('/api/direct', async (req, res) => {
  try {
    const { url, filename } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`Processing direct download: ${url}`);

    // Determine the platform for custom headers
    const platform = detectPlatform(url);

    // Prepare headers with a rotation of user agents to avoid blocking
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Safari/605.1.15'
    ];

    const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];

    // Base headers for all platforms
    const headers = {
      'User-Agent': randomUserAgent,
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.5',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
    };

    // Add platform-specific headers to avoid referer restrictions
    switch (platform) {
      case 'tiktok':
        headers['Referer'] = 'https://www.tiktok.com/';
        break;
      case 'instagram':
        headers['Referer'] = 'https://www.instagram.com/';
        break;
      case 'facebook':
        headers['Referer'] = 'https://www.facebook.com/';
        break;
      case 'pinterest':
        headers['Referer'] = 'https://www.pinterest.com/';
        break;
      default:
        headers['Referer'] = new URL(url).origin;
        break;
    }

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
      // If direct download fails, try youtube-dl as fallback for stubborn platforms
      if (['tiktok', 'instagram', 'facebook'].includes(platform)) {
        console.log(`Direct download failed, trying youtube-dl for ${platform}...`);

        // Generate a unique filename
        const uniqueId = Date.now();
        const tempFilePath = path.join(TEMP_DIR, `download-${uniqueId}.mp4`);

        // Determine if we're requesting an audio-only file
        const isAudioOnly = url.includes('.mp3') || contentType.includes('audio');

        // Download options
        const options = {
          output: tempFilePath,
          noCheckCertificates: true,
          noWarnings: true,
          preferFreeFormats: true,
          addHeader: [`referer:${platform}.com`, `user-agent:${randomUserAgent}`]
        };

        // Configure for audio if needed
        if (isAudioOnly) {
          options.extractAudio = true;
          options.audioFormat = 'mp3';
          options.audioQuality = 0; // Best quality
        }

        try {
          await youtubeDl(url, options);

          // Check if file exists
          if (!fs.existsSync(tempFilePath)) {
            throw new Error('Download failed - file not created');
          }

          // Get file info
          const stat = fs.statSync(tempFilePath);

          // Determine content type based on file extension
          let dlContentType = 'application/octet-stream';
          if (tempFilePath.endsWith('.mp4')) dlContentType = 'video/mp4';
          else if (tempFilePath.endsWith('.mp3')) dlContentType = 'audio/mpeg';
          else if (tempFilePath.endsWith('.webm')) dlContentType = 'video/webm';

          // Set headers for download
          res.setHeader('Content-Length', stat.size);
          res.setHeader('Content-Type', dlContentType);
          res.setHeader('Content-Disposition', `attachment; filename="${path.basename(tempFilePath)}"`);

          // Stream the file and delete after sending
          const fileStream = fs.createReadStream(tempFilePath);
          fileStream.pipe(res);

          fileStream.on('end', () => {
            // Delete the temporary file
            fs.unlink(tempFilePath, (err) => {
              if (err) console.error('Error deleting temp file:', err);
            });
          });

          return;
        } catch (ytdlErr) {
          console.error('youtube-dl download fallback error:', ytdlErr);
          throw new Error(`Failed to download using all methods: ${fetchError.message}`);
        }
      } else {
        throw new Error(`Failed to download: ${fetchError.message}`);
      }
    }

  } catch (error) {
    console.error('Direct download error:', error);
    res.status(500).json({ error: 'Direct download failed', details: error.message });
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

    // Detect platform for special handling
    const platform = detectPlatform(url);

    // Generate a unique filename
    const uniqueId = Date.now();
    const tempFilePath = path.join(TEMP_DIR, `audio-${uniqueId}.mp3`);

    // For TikTok, check if we already have a direct audio URL
    if (platform === 'tiktok' && (url.includes('.mp3') || url.includes('music') || url.includes('sound'))) {
      // Try direct download first for TikTok audio
      try {
        const userAgents = [
          'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36'
        ];

        const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];

        const response = await fetch(url, {
          headers: {
            'User-Agent': randomUserAgent,
            'Referer': 'https://www.tiktok.com/',
            'Accept': '*/*'
          }
        });

        if (response.ok) {
          const fileStream = fs.createWriteStream(tempFilePath);
          await new Promise((resolve, reject) => {
            response.body.pipe(fileStream);
            response.body.on('error', reject);
            fileStream.on('finish', resolve);
          });

          // Get file info
          const stat = fs.statSync(tempFilePath);

          // Set headers for download
          res.setHeader('Content-Length', stat.size);
          res.setHeader('Content-Type', 'audio/mpeg');
          res.setHeader('Content-Disposition', `attachment; filename="tiktok_audio.mp3"`);

          // Stream the file and delete after sending
          const outputStream = fs.createReadStream(tempFilePath);
          outputStream.pipe(res);

          outputStream.on('end', () => {
            // Delete the temporary file
            fs.unlink(tempFilePath, (err) => {
              if (err) console.error('Error deleting temp file:', err);
            });
          });

          return;
        }
      } catch (directErr) {
        console.error('Direct TikTok audio download failed:', directErr);
        // Fall through to youtube-dl approach
      }
    }

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
        `referer:${platform}.com`,
        'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.82 Safari/537.36'
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
});}
