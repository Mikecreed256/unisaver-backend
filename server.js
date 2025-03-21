// server.js - Complete solution with all platform support
const express = require('express');
const cors = require('cors');
const youtubeDl = require('youtube-dl-exec');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
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

// Improved Pinterest handler
app.get('/api/pinterest', async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`Processing Pinterest URL: ${url}`);

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

    // Extract title
    let title = 'Pinterest Image';
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].replace(' | Pinterest', '').trim();
    }

    // Method 1: Find image URLs directly in the HTML
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

    // Method 2: Extract from JSON data
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

    // Method 3: Look for specialized Pinterest schema data
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

    // Method 4: Extract from og:image meta tags
    if (imageUrls.length === 0) {
      const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
      if (ogImageMatch && ogImageMatch[1]) {
        imageUrls.push(ogImageMatch[1]);
      }
    }

    // Fallback for when no images are found
    if (imageUrls.length === 0) {
      return res.status(404).json({
        error: 'No images found on this Pinterest page',
        details: 'Try opening the pin in a browser and copying the image URL directly'
      });
    }

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

      // Determine image format
      let format = 'jpg';
      if (url.toLowerCase().endsWith('.png')) format = 'png';
      else if (url.toLowerCase().endsWith('.gif')) format = 'gif';
      else if (url.toLowerCase().endsWith('.webp')) format = 'webp';

      return {
        itag: `pin_${index}`,
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
    const directDownloadUrl = `/api/direct?url=${encodeURIComponent(imageUrls[0])}`;

    // Return the image info
    res.json({
      title: title,
      thumbnails: [{ url: imageUrls[0], width: 480, height: 480 }],
      formats: formats,
      platform: 'pinterest',
      mediaType: 'image',
      directUrl: directDownloadUrl
    });

  } catch (error) {
    console.error('Pinterest error:', error);
    res.status(500).json({ error: 'Pinterest processing failed', details: error.message });
  }
});

// Facebook-specific endpoint for better video extraction
app.get('/api/facebook', async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`Processing Facebook URL: ${url}`);

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
      const response = await fetch(`http://localhost:${PORT}/api/pinterest?url=${encodeURIComponent(url)}`);
      const data = await response.json();
      return res.json(data);
    }
    else if (platform === 'facebook') {
      // Use dedicated Facebook endpoint
      const response = await fetch(`http://localhost:${PORT}/api/facebook?url=${encodeURIComponent(url)}`);
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

// YouTube info endpoint (kept for compatibility)
app.get('/api/youtube', async (req, res) => {
  try {
    const url = req.query.url;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`Processing YouTube URL: ${url}`);

    // Forward to universal endpoint
    const response = await fetch(`http://localhost:${PORT}/api/info?url=${encodeURIComponent(url)}`);
    const data = await response.json();
    res.json(data);

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
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

// Direct download endpoint for handling URLs directly
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

// Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Temporary directory: ${TEMP_DIR}`);
});
