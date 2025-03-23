// youtube-handler.js - A specialized handler for YouTube that doesn't rely on yt-dlp
import fetch from 'node-fetch';

/**
 * Extract video ID from a YouTube URL
 * @param {string} url YouTube URL
 * @returns {string|null} Video ID or null if not found
 */
function extractVideoId(url) {
  const patterns = [
    /(?:v=|\/embed\/|\/watch\?v=|\/watch\?.+&v=|youtu\.be\/|\/v\/|\/e\/|\/shorts\/)([^#&?\/\s]{11})/,
    /^[^#&?\/\s]{11}$/  // Direct video ID
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  // Try to extract from URL params
  try {
    const urlObj = new URL(url);
    const videoId = urlObj.searchParams.get('v');
    if (videoId && videoId.length === 11) {
      return videoId;
    }
  } catch (e) {
    // Not a valid URL, continue
  }
  
  return null;
}

/**
 * Clean special characters from string
 * @param {string} str Input string
 * @returns {string} Cleaned string
 */
function cleanString(str) {
  if (!str) return '';
  return str.replace(/\\u0026/g, '&')
            .replace(/\\"/g, '"')
            .replace(/\\\//g, '/')
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '\r')
            .replace(/\\t/g, '\t')
            .replace(/\\\\/g, '\\');
}

/**
 * Extract YouTube formats from player response
 * @param {Object} playerResponse YouTube player response
 * @returns {Array} Formats array
 */
function extractFormatsFromPlayerResponse(playerResponse) {
  const formats = [];
  
  // Function to process a format
  const processFormat = (format) => {
    if (!format.url && format.signatureCipher) {
      // We can't handle signature cipher formats without additional code
      return null;
    }
    
    const mimeType = format.mimeType || 'unknown';
    const isVideo = mimeType.includes('video');
    const isAudio = mimeType.includes('audio');
    
    // Skip formats without URLs
    if (!format.url) return null;
    
    // Create a format object compatible with our API
    return {
      itag: format.itag.toString(),
      quality: format.qualityLabel || format.quality || 'Unknown',
      mimeType: mimeType,
      url: format.url,
      hasAudio: Boolean(format.audioQuality || mimeType.includes('audio')),
      hasVideo: Boolean(format.qualityLabel || mimeType.includes('video')),
      contentLength: parseInt(format.contentLength) || 0,
      audioBitrate: format.audioBitrate || null,
      videoCodec: format.codecs ? format.codecs.split(', ')[0] : null,
      audioCodec: format.codecs ? format.codecs.split(', ').slice(1).join(', ') : null,
      container: mimeType.split(';')[0].split('/')[1] || null
    };
  };
  
  // Process streaming formats
  if (playerResponse.streamingData) {
    // Process adaptive formats (usually better quality, separated audio/video)
    if (playerResponse.streamingData.adaptiveFormats) {
      for (const format of playerResponse.streamingData.adaptiveFormats) {
        const processedFormat = processFormat(format);
        if (processedFormat) formats.push(processedFormat);
      }
    }
    
    // Process regular formats (combined audio/video)
    if (playerResponse.streamingData.formats) {
      for (const format of playerResponse.streamingData.formats) {
        const processedFormat = processFormat(format);
        if (processedFormat) formats.push(processedFormat);
      }
    }
  }
  
  return formats;
}

/**
 * Extract YouTube media data
 * @param {string} url YouTube URL
 * @returns {Promise<Object>} Media data
 */
export async function extractYouTubeMedia(url) {
  try {
    console.log(`Extracting YouTube media from: ${url}`);
    
    // Extract video ID
    const videoId = extractVideoId(url);
    if (!videoId) {
      throw new Error('Could not extract YouTube video ID');
    }
    
    console.log(`YouTube video ID: ${videoId}`);
    
    // First try with YouTube webapp approach
    try {
      const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36';
      
      // First, get the watch page
      const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
        headers: {
          'User-Agent': userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch YouTube page: ${response.status} ${response.statusText}`);
      }
      
      const html = await response.text();
      
      // Find the player response data
      const playerResponseRegex = /ytInitialPlayerResponse\s*=\s*({.+?});/;
      const playerResponseMatch = html.match(playerResponseRegex);
      
      if (!playerResponseMatch || !playerResponseMatch[1]) {
        throw new Error('Could not find player response data');
      }
      
      // Parse the player response
      const playerResponse = JSON.parse(playerResponseMatch[1]);
      
      // Extract video details
      const videoDetails = playerResponse.videoDetails || {};
      const title = videoDetails.title || 'YouTube Video';
      const description = videoDetails.shortDescription || '';
      const channelName = videoDetails.author || '';
      const lengthSeconds = parseInt(videoDetails.lengthSeconds) || 0;
      
      // Get thumbnails
      const thumbnails = [];
      if (videoDetails.thumbnail && videoDetails.thumbnail.thumbnails) {
        for (const thumbnail of videoDetails.thumbnail.thumbnails) {
          thumbnails.push({
            url: thumbnail.url,
            width: thumbnail.width,
            height: thumbnail.height
          });
        }
      }
      
      // Sort thumbnails by resolution (highest first)
      thumbnails.sort((a, b) => (b.width || 0) - (a.width || 0));
      
      // Extract formats
      const formats = extractFormatsFromPlayerResponse(playerResponse);
      
      // If no formats found, throw error
      if (formats.length === 0) {
        throw new Error('No formats found');
      }
      
      // Create direct URL for the best format
      let bestFormat = null;
      
      // First try to find a format with both audio and video
      for (const format of formats) {
        if (format.hasAudio && format.hasVideo) {
          bestFormat = format;
          break;
        }
      }
      
      // If no combined format found, take the first format
      if (!bestFormat) {
        bestFormat = formats[0];
      }
      
      // Create direct download URL
      const directUrl = `/api/direct?url=${encodeURIComponent(bestFormat.url)}&filename=${encodeURIComponent(title + '.mp4')}`;
      
      // Return video info
      return {
        title: title,
        description: description,
        thumbnails: thumbnails,
        duration: lengthSeconds,
        formats: formats,
        platform: 'youtube',
        mediaType: 'video',
        uploader: channelName,
        uploadDate: null, // Not easily available
        directUrl: directUrl
      };
    } catch (error) {
      console.log('YouTube webapp extraction failed:', error);
      
      // Fallback to m.youtube.com mobile site which might have different restrictions
      const mobileResponse = await fetch(`https://m.youtube.com/watch?v=${videoId}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5'
        }
      });
      
      if (!mobileResponse.ok) {
        throw new Error(`Failed to fetch YouTube mobile page: ${mobileResponse.status} ${mobileResponse.statusText}`);
      }
      
      const mobileHtml = await mobileResponse.text();
      
      // Look for player response in mobile site
      const mobilePlayerResponseRegex = /ytInitialPlayerResponse\s*=\s*({.+?});/;
      const mobilePlayerResponseMatch = mobileHtml.match(mobilePlayerResponseRegex);
      
      if (!mobilePlayerResponseMatch || !mobilePlayerResponseMatch[1]) {
        throw new Error('Could not find player response data in mobile site');
      }
      
      // Parse the player response
      const mobilePlayerResponse = JSON.parse(mobilePlayerResponseMatch[1]);
      
      // Extract video details
      const videoDetails = mobilePlayerResponse.videoDetails || {};
      const title = videoDetails.title || 'YouTube Video';
      const description = videoDetails.shortDescription || '';
      const channelName = videoDetails.author || '';
      const lengthSeconds = parseInt(videoDetails.lengthSeconds) || 0;
      
      // Get thumbnails
      const thumbnails = [];
      if (videoDetails.thumbnail && videoDetails.thumbnail.thumbnails) {
        for (const thumbnail of videoDetails.thumbnail.thumbnails) {
          thumbnails.push({
            url: thumbnail.url,
            width: thumbnail.width,
            height: thumbnail.height
          });
        }
      }
      
      // Sort thumbnails by resolution (highest first)
      thumbnails.sort((a, b) => (b.width || 0) - (a.width || 0));
      
      // Extract formats
      const formats = extractFormatsFromPlayerResponse(mobilePlayerResponse);
      
      // If no formats found, revert to a basic implementation
      if (formats.length === 0) {
        // Create basic format with limited info
        const basicFormat = {
          itag: 'basic',
          quality: 'Unknown',
          mimeType: 'video/mp4',
          url: `https://youtube.com/watch?v=${videoId}`,
          hasAudio: true,
          hasVideo: true,
          contentLength: 0,
          container: 'mp4'
        };
        
        return {
          title: title || `YouTube Video - ${videoId}`,
          description: description || '',
          thumbnails: thumbnails.length > 0 ? thumbnails : [{ 
            url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, 
            width: 480, 
            height: 360 
          }],
          duration: lengthSeconds || 0,
          formats: [basicFormat],
          platform: 'youtube',
          mediaType: 'video',
          uploader: channelName || '',
          uploadDate: null,
          directUrl: `/api/direct?url=${encodeURIComponent(basicFormat.url)}&filename=${encodeURIComponent((title || 'YouTube-Video') + '.mp4')}`
        };
      }
      
      // Create direct URL for the best format
      let bestFormat = null;
      
      // First try to find a format with both audio and video
      for (const format of formats) {
        if (format.hasAudio && format.hasVideo) {
          bestFormat = format;
          break;
        }
      }
      
      // If no combined format found, take the first format
      if (!bestFormat) {
        bestFormat = formats[0];
      }
      
      // Create direct download URL
      const directUrl = `/api/direct?url=${encodeURIComponent(bestFormat.url)}&filename=${encodeURIComponent(title + '.mp4')}`;
      
      // Return video info
      return {
        title: title,
        description: description,
        thumbnails: thumbnails,
        duration: lengthSeconds,
        formats: formats,
        platform: 'youtube',
        mediaType: 'video',
        uploader: channelName,
        uploadDate: null, // Not easily available
        directUrl: directUrl
      };
    }
  } catch (error) {
    console.error('YouTube extraction error:', error);
    
    // Create a fallback response
    const videoId = extractVideoId(url) || 'unknown';
    
    return {
      title: `YouTube Video - ${videoId}`,
      thumbnails: [{ 
        url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, 
        width: 480, 
        height: 360 
      }],
      formats: [{
        itag: 'fallback',
        quality: 'Unknown',
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
    };
  }
}

/**
 * Enhanced YouTube download function with anti-blocking measures
 * @param {string} videoUrl The YouTube URL
 * @param {string} outputPath The path to save the file
 * @param {string} itag Optional format ID
 * @returns {Promise<boolean>} Success status
 */
export async function downloadYouTubeVideo(videoUrl, outputPath, itag = null) {
  try {
    console.log(`Enhanced YouTube download for: ${videoUrl}`);
    
    // First, get the video info using our specialized handler
    const videoInfo = await extractYouTubeMedia(videoUrl);
    
    if (!videoInfo || !videoInfo.formats || videoInfo.formats.length === 0) {
      throw new Error('Could not extract video formats');
    }
    
    // Find the appropriate format
    let format = null;
    
    if (itag) {
      // Try to find the requested format
      format = videoInfo.formats.find(f => f.itag === itag);
    }
    
    if (!format) {
      // Find a format with both audio and video
      format = videoInfo.formats.find(f => f.hasAudio && f.hasVideo);
      
      // If still no format, use the first one
      if (!format && videoInfo.formats.length > 0) {
        format = videoInfo.formats[0];
      }
    }
    
    if (!format || !format.url) {
      throw new Error('No suitable download format found');
    }
    
    // Use a more browser-like approach for the request
    const formatUrl = format.url;
    console.log(`Using YouTube format URL: ${formatUrl.substring(0, 100)}...`);
    
    // Use different user agents for each request to avoid pattern detection
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Safari/605.1.15',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/109.0',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1'
    ];
    
    // Random delay to avoid pattern detection (0-2 seconds)
    const delayMs = Math.floor(Math.random() * 2000);
    await new Promise(resolve => setTimeout(resolve, delayMs));
    
    // Random user agent
    const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
    
    // Additional headers to make the request look more like a browser
    const headers = {
      'User-Agent': userAgent,
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Range': 'bytes=0-',
      'Referer': 'https://www.youtube.com/',
      'Origin': 'https://www.youtube.com',
      'Connection': 'keep-alive',
      'Sec-Fetch-Dest': 'video',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'cross-site',
      'Pragma': 'no-cache',
      'Cache-Control': 'no-cache'
    };
    
    // Some YouTube URLs might have special characters that need to be preserved
    const formattedUrl = formatUrl;
    
    // Make the request
    const response = await fetch(formattedUrl, { headers });
    
    if (!response.ok) {
      throw new Error(`Video fetch failed with status: ${response.status} ${response.statusText}`);
    }
    
    // Stream to file
    const fileStream = fs.createWriteStream(outputPath);
    
    await new Promise((resolve, reject) => {
      response.body.pipe(fileStream);
      response.body.on('error', reject);
      fileStream.on('finish', resolve);
    });
    
    // Verify file exists and has content
    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
      throw new Error('Downloaded file is empty');
    }
    
    console.log(`YouTube download successful: ${outputPath}`);
    return true;
  } catch (error) {
    console.error('Enhanced YouTube download failed:', error);
    return false;
  }
}
