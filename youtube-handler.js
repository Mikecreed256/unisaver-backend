// youtube-handler.js - A reliable handler for YouTube downloads
import fetch from 'node-fetch';
import fs from 'fs';

/**
 * Extract video ID from a YouTube URL
 * @param {string} url YouTube URL
 * @returns {string|null} Video ID or null if not found
 */
export function extractVideoId(url) {
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
 * Gets video information from YouTube (title, thumbnail, etc)
 * @param {string} videoId YouTube video ID
 * @returns {Promise<Object>} Video info
 */
export async function getVideoInfo(videoId) {
  try {
    // First try YouTube's oEmbed API which is reliable
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const oembedResponse = await fetch(oembedUrl);
    
    if (oembedResponse.ok) {
      const oembedData = await oembedResponse.json();
      return {
        title: oembedData.title || `YouTube Video - ${videoId}`,
        author: oembedData.author_name || 'YouTube',
        thumbnailUrl: oembedData.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
      };
    }
  } catch (oembedError) {
    console.error('YouTube oembed error:', oembedError);
  }
  
  // Fallback: get minimal info from page
  try {
    const pageUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const pageResponse = await fetch(pageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    if (pageResponse.ok) {
      const html = await pageResponse.text();
      
      // Extract title
      let title = `YouTube Video - ${videoId}`;
      const titleMatch = html.match(/<title>(.+?)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        title = titleMatch[1].replace(' - YouTube', '').trim();
      }
      
      // Extract author
      let author = 'YouTube';
      const authorMatch = html.match(/"ownerChannelName":"([^"]+)"/);
      if (authorMatch && authorMatch[1]) {
        author = authorMatch[1];
      }
      
      return {
        title,
        author,
        thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
      };
    }
  } catch (pageError) {
    console.error('YouTube page fetch error:', pageError);
  }
  
  // Last resort: return basic info
  return {
    title: `YouTube Video - ${videoId}`,
    author: 'YouTube',
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
  };
}

/**
 * Downloads a YouTube video reliably using Y2mate service
 * @param {string} videoId YouTube video ID
 * @param {object} res Express response object
 * @returns {Promise<boolean>} Success status
 */
export async function downloadVideo(videoId, res) {
  try {
    // Get video info for better filename
    const videoInfo = await getVideoInfo(videoId);
    const videoTitle = videoInfo.title
      .replace(/[\/\\:*?"<>|]/g, '_')
      .replace(/\s+/g, '_')
      .substring(0, 100);
    
    // Use Y2mate service to get direct download links
    // Step 1: First contact to get the k parameter
    const analyzeUrl = 'https://www.y2mate.com/mates/en691/analyze/ajax';
    const analyzeData = new URLSearchParams();
    analyzeData.append('k_query', `https://www.youtube.com/watch?v=${videoId}`);
    analyzeData.append('k_page', 'home');
    analyzeData.append('hl', 'en');
    analyzeData.append('q_auto', '0');
    
    const analyzeResponse = await fetch(analyzeUrl, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': 'https://www.y2mate.com',
        'Referer': 'https://www.y2mate.com/'
      },
      body: analyzeData
    });
    
    if (!analyzeResponse.ok) {
      throw new Error(`Y2mate analyze request failed: ${analyzeResponse.status}`);
    }
    
    const analyzeResult = await analyzeResponse.json();
    
    if (!analyzeResult.result) {
      throw new Error('No result in Y2mate response');
    }
    
    // Step 2: Extract the video formats and k values
    const kMatch = analyzeResult.result.match(/k__id\s*=\s*["']([^"']+)["']/);
    
    if (!kMatch || !kMatch[1]) {
      throw new Error('Could not extract k parameter from Y2mate response');
    }
    
    const kId = kMatch[1];
    
    // Step 3: Request the download link for MP4 720p or highest available
    const convertUrl = 'https://www.y2mate.com/mates/convert';
    const convertData = new URLSearchParams();
    convertData.append('type', 'youtube');
    convertData.append('_id', kId);
    convertData.append('v_id', videoId);
    convertData.append('ajax', '1');
    convertData.append('token', '');
    convertData.append('ftype', 'mp4');
    convertData.append('fquality', '720');
    
    const convertResponse = await fetch(convertUrl, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': 'https://www.y2mate.com',
        'Referer': 'https://www.y2mate.com/'
      },
      body: convertData
    });
    
    if (!convertResponse.ok) {
      throw new Error(`Y2mate convert request failed: ${convertResponse.status}`);
    }
    
    const convertResult = await convertResponse.json();
    
    if (!convertResult.result) {
      throw new Error('No result in Y2mate convert response');
    }
    
    // Extract the direct download URL from the result
    const downloadMatch = convertResult.result.match(/href="([^"]+)"/);
    
    if (!downloadMatch || !downloadMatch[1]) {
      throw new Error('Could not extract download URL from Y2mate response');
    }
    
    const downloadUrl = downloadMatch[1];
    
    // Now fetch the actual video and pipe it to the response
    console.log(`Downloading YouTube video from: ${downloadUrl}`);
    
    const videoResponse = await fetch(downloadUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Referer': 'https://www.y2mate.com/'
      }
    });
    
    if (!videoResponse.ok) {
      throw new Error(`Failed to download video: ${videoResponse.status}`);
    }
    
    // Set appropriate headers for the download
    res.setHeader('Content-Type', 'video/mp4');
    
    const contentLength = videoResponse.headers.get('content-length');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }
    
    res.setHeader('Content-Disposition', `attachment; filename="${videoTitle}.mp4"`);
    
    // Set cache control headers to prevent caching issues
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Stream the video directly to the client
    videoResponse.body.pipe(res);
    
    return true;
  } catch (error) {
    console.error('YouTube download error:', error);
    
    // Only send error if headers haven't been sent
    if (!res.headersSent) {
      res.status(500).json({
        error: 'YouTube download failed',
        message: error.message,
        videoId: videoId
      });
    }
    
    return false;
  }
}

/**
 * Get video info for API response
 * @param {string} url YouTube URL
 * @returns {Promise<Object>} Video info object
 */
export async function getYouTubeInfo(url) {
  try {
    const videoId = extractVideoId(url);
    
    if (!videoId) {
      throw new Error('Invalid YouTube URL');
    }
    
    const videoInfo = await getVideoInfo(videoId);
    
    return {
      title: videoInfo.title,
      thumbnails: [
        {
          url: videoInfo.thumbnailUrl,
          width: 480,
          height: 360
        }
      ],
      formats: [
        {
          itag: 'mp4-720p',
          quality: '720p',
          mimeType: 'video/mp4',
          url: url,
          hasAudio: true,
          hasVideo: true,
          contentLength: 0,
          container: 'mp4'
        }
      ],
      platform: 'youtube',
      mediaType: 'video',
      uploader: videoInfo.author,
      directUrl: `/api/download?url=${encodeURIComponent(url)}`
    };
  } catch (error) {
    console.error('YouTube info error:', error);
    
    // Return basic info
    return {
      title: 'YouTube Video',
      thumbnails: [
        {
          url: `https://i.ytimg.com/vi/${extractVideoId(url) || 'default'}/hqdefault.jpg`,
          width: 480,
          height: 360
        }
      ],
      formats: [
        {
          itag: 'direct',
          quality: 'Original',
          mimeType: 'video/mp4',
          url: url,
          hasAudio: true,
          hasVideo: true,
          contentLength: 0,
          container: 'mp4'
        }
      ],
      platform: 'youtube',
      mediaType: 'video',
      directUrl: `/api/download?url=${encodeURIComponent(url)}`
    };
  }
}
