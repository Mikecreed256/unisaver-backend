// controllers/youtubeController.js
const fs = require('fs');
const path = require('path');
const { ytdown } = require('nayan-videos-downloader');
const fetch = require('node-fetch');

// Create temp directory if it doesn't exist
const TEMP_DIR = path.join(__dirname, '../temp');
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * Get direct playable YouTube links using various methods
 * This function focuses on direct playable links instead of downloading
 * @param {string} url - YouTube video URL
 * @returns {Promise<Object>} - Video data
 */
async function downloadYouTubeVideo(url) {
    try {
        console.log(`Processing YouTube URL: ${url}`);
        
        // Check if this is just a homepage URL
        if (url === 'https://www.youtube.com/' || 
            url === 'https://m.youtube.com/' || 
            url === 'https://youtube.com/' ||
            url === 'https://youtu.be/') {
            console.log("This is a YouTube homepage URL, not a specific video URL");
            return {
                success: false,
                error: "Please provide a specific YouTube video URL, not the homepage",
                homepage: true
            };
        }
        
        // Extract video ID
        let videoId = extractVideoId(url);
        
        // Normalize mobile URL to desktop
        if (url.includes('m.youtube.com')) {
            url = url.replace(/m\.youtube\.com/, 'www.youtube.com');
            console.log(`Converted to desktop URL: ${url}`);
        }
        
        if (!videoId) {
            console.log("No valid YouTube video ID found in URL");
            return {
                success: false,
                error: "No valid YouTube video ID found in URL. Please provide a direct video URL.",
            };
        }

        // Thumbnail will always be available even if other methods fail
        const thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
        
        // APPROACH 1: Try to get YouTube player data directly from the embed page
        try {
            console.log("Getting video data from YouTube embed page...");
            const embedData = await getYouTubeEmbedData(videoId);
            
            if (embedData.title && (embedData.hlsManifestUrl || embedData.dashManifestUrl)) {
                console.log("Successfully extracted video data from embed page");
                
                return {
                    title: embedData.title,
                    high: embedData.hlsManifestUrl || embedData.dashManifestUrl,
                    low: embedData.dashManifestUrl || embedData.hlsManifestUrl,
                    thumbnail: thumbnail,
                    embed_url: `https://www.youtube.com/embed/${videoId}`,
                    source: 'youtube-embed',
                    // Important: This is a special HLS/DASH manifest, not a direct MP4
                    is_stream_manifest: true
                };
            }
        } catch (embedError) {
            console.error(`Embed page data extraction error: ${embedError.message}`);
        }
        
        // APPROACH 2: Try ytdown even though the service might be off
        try {
            console.log("Trying ytdown method even though service might be down...");
            const result = await ytdown(url);
            
            // Check status to see if service is available
            if (result && result.status === false) {
                console.warn(`ytdown service is offline: ${result.msg}`);
                throw new Error(result.msg || "nayan-videos-downloader service is offline");
            }
            
            // Check if response is valid
            if (result && result.status === true) {
                if (result.data) {
                    console.log("Processing ytdown data response format");
                    
                    // Return the data directly without any further processing
                    return {
                        title: result.data.title || 'YouTube Video',
                        high: result.data.video_hd || result.data.video || '',
                        low: result.data.video || '',
                        thumbnail: result.data.thumb || thumbnail,
                        source: 'nayan-videos-downloader'
                    };
                } 
                else if (result.media) {
                    console.log("Processing ytdown media response format");
                    
                    return {
                        title: result.media.title || 'YouTube Video',
                        high: result.media.high || '',
                        low: result.media.low || result.media.high || '',
                        thumbnail: result.media.thumbnail || thumbnail,
                        source: 'nayan-videos-downloader'
                    };
                }
            }
            
            throw new Error("Unexpected or invalid response from ytdown");
        } catch (ytdownError) {
            console.error(`ytdown error: ${ytdownError.message}`);
            // Fall through to final approach
        }
        
        // APPROACH 3: Return embed link which is always playable in a webview
        console.log("All methods failed, returning embed URL");
        
        return {
            title: 'YouTube Video',
            // Note: Using url_only to indicate this is NOT a direct media file
            // but rather a page URL that should be opened in a WebView
            url_only: true,
            high: `https://www.youtube.com/embed/${videoId}?autoplay=1`,
            low: `https://www.youtube.com/watch?v=${videoId}`,
            thumbnail: thumbnail,
            embed_url: `https://www.youtube.com/embed/${videoId}`,
            youtube_fallback: true,
            source: 'embed-only'
        };
    } catch (error) {
        console.error(`YouTube processing failed: ${error.message}`);
        
        // Final fallback to simple embed link
        const videoId = extractVideoId(url);
        if (videoId) {
            return {
                title: 'YouTube Video',
                url_only: true,
                high: `https://www.youtube.com/embed/${videoId}?autoplay=1`,
                low: `https://www.youtube.com/watch?v=${videoId}`,
                thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                embed_url: `https://www.youtube.com/embed/${videoId}`,
                youtube_fallback: true,
                source: 'embed-only'
            };
        } else {
            return {
                success: false,
                error: "Invalid YouTube URL or cannot extract video ID",
            };
        }
    }
}

/**
 * Extract video data directly from YouTube embed page (more reliable than scraping)
 * @param {string} videoId - YouTube video ID
 * @returns {Promise<Object>} - Video data including manifest URLs
 */
async function getYouTubeEmbedData(videoId) {
    const embedUrl = `https://www.youtube.com/embed/${videoId}`;
    
    // Use multiple user agents to avoid detection
    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    ];
    
    const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
    
    try {
        const response = await fetch(embedUrl, {
            headers: {
                'User-Agent': userAgent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1',
                'Cache-Control': 'max-age=0'
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to fetch embed page: ${response.status}`);
        }
        
        const html = await response.text();
        
        // Extract player response JSON
        const playerResponseMatch = html.match(/ytInitialPlayerResponse\s*=\s*({.*?});/s);
        if (!playerResponseMatch || !playerResponseMatch[1]) {
            throw new Error('Could not find player response data in embed page');
        }
        
        // Parse the player response
        const playerResponse = JSON.parse(playerResponseMatch[1]);
        
        // Extract video title
        const title = playerResponse.videoDetails?.title || 'YouTube Video';
        
        // Extract streaming URLs
        let hlsManifestUrl = null;
        let dashManifestUrl = null;
        
        if (playerResponse.streamingData) {
            // HLS manifest (works well in mobile apps)
            hlsManifestUrl = playerResponse.streamingData.hlsManifestUrl || null;
            
            // DASH manifest (better quality options but requires a DASH player)
            dashManifestUrl = playerResponse.streamingData.dashManifestUrl || null;
        }
        
        if (!hlsManifestUrl && !dashManifestUrl) {
            throw new Error('No streaming URLs found in player response');
        }
        
        return {
            title,
            hlsManifestUrl,
            dashManifestUrl
        };
    } catch (error) {
        console.error(`Error extracting data from embed page: ${error.message}`);
        throw error;
    }
}

/**
 * Download YouTube music with focus on WebView playback
 * @param {string} url - YouTube music URL
 * @returns {Promise<Object>} - Audio data
 */
async function downloadYouTubeMusic(url) {
    try {
        console.log(`Processing YouTube Music URL: ${url}`);
        
        // Check if this is just a homepage URL
        if (url === 'https://www.youtube.com/' || 
            url === 'https://m.youtube.com/' || 
            url === 'https://youtube.com/' ||
            url === 'https://youtu.be/' ||
            url === 'https://music.youtube.com/') {
            console.log("This is a YouTube homepage URL, not a specific video URL");
            return {
                success: false,
                error: "Please provide a specific YouTube video URL, not the homepage",
                homepage: true
            };
        }
        
        // Extract video ID first (before URL conversion)
        let videoId = extractVideoId(url);
        
        // Convert youtube music URL to regular youtube if needed
        if (url.includes('music.youtube.com')) {
            if (videoId) {
                url = `https://www.youtube.com/watch?v=${videoId}`;
                console.log(`Converted to regular YouTube URL: ${url}`);
            }
        }
        
        // Handle youtu.be short URLs as well
        if (url.includes('youtu.be/') && !videoId) {
            const shortUrlMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
            if (shortUrlMatch && shortUrlMatch[1]) {
                videoId = shortUrlMatch[1];
                url = `https://www.youtube.com/watch?v=${videoId}`;
                console.log(`Converted short URL to full URL: ${url}`);
            }
        }
        
        // Check if we have a valid video ID - return early if no ID
        if (!videoId) {
            console.log("No valid YouTube video ID found in URL");
            return {
                success: false,
                error: "No valid YouTube video ID found in URL. Please provide a direct video URL.",
            };
        }
        
        // Thumbnail will be consistent regardless of download method
        const thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
        
        // APPROACH 1: Try to get YouTube player data directly
        try {
            console.log("Getting video data from YouTube embed page...");
            const embedData = await getYouTubeEmbedData(videoId);
            
            if (embedData.title && (embedData.hlsManifestUrl || embedData.dashManifestUrl)) {
                console.log("Successfully extracted audio data from embed page");
                
                return {
                    title: embedData.title,
                    high: embedData.hlsManifestUrl || embedData.dashManifestUrl,
                    low: embedData.dashManifestUrl || embedData.hlsManifestUrl,
                    thumbnail: thumbnail,
                    embed_url: `https://www.youtube.com/embed/${videoId}`,
                    isAudio: true,
                    source: 'youtube-embed',
                    // This is a special HLS/DASH manifest, not a direct MP3
                    is_stream_manifest: true
                };
            }
        } catch (embedError) {
            console.error(`Embed page data extraction error: ${embedError.message}`);
        }
        
        // APPROACH 2: Try ytdown even though the service might be off
        try {
            console.log("Trying ytdown method for music...");
            const result = await ytdown(url);
            
            // Check status to see if service is available
            if (result && result.status === false) {
                console.warn(`ytdown service is offline: ${result.msg}`);
                throw new Error(result.msg || "nayan-videos-downloader service is offline");
            }
            
            // Check if response is valid
            if (result && result.status === true) {
                if (result.data) {
                    console.log("Processing ytdown data response format for music");
                    
                    return {
                        title: result.data.title || 'YouTube Music',
                        high: result.data.audio || result.data.video || '',
                        low: result.data.audio || result.data.video || '',
                        thumbnail: result.data.thumb || thumbnail,
                        isAudio: true,
                        source: 'nayan-videos-downloader'
                    };
                } 
                else if (result.media) {
                    console.log("Processing ytdown media response format for music");
                    
                    return {
                        title: result.media.title || 'YouTube Music',
                        high: result.media.audio || result.media.high || '',
                        low: result.media.audio || result.media.low || result.media.high || '',
                        thumbnail: result.media.thumbnail || thumbnail,
                        isAudio: true,
                        source: 'nayan-videos-downloader'
                    };
                }
            }
            
            throw new Error("Unexpected or invalid response from ytdown");
        } catch (ytdownError) {
            console.error(`ytdown music error: ${ytdownError.message}`);
        }
        
        // APPROACH 3: Return embed link which is always playable in a webview
        console.log("All methods failed, returning music embed URL");
        
        return {
            title: 'YouTube Music',
            url_only: true,  // Mark that this is a page URL, not a direct media file
            high: `https://www.youtube.com/embed/${videoId}?autoplay=1`,
            low: `https://www.youtube.com/watch?v=${videoId}`,
            thumbnail: thumbnail,
            embed_url: `https://www.youtube.com/embed/${videoId}`,
            youtube_fallback: true,
            isAudio: true,
            source: 'embed-only'
        };
    } catch (error) {
        console.error(`YouTube music download failed: ${error.message}`);
        
        // Fallback to direct YouTube link if we have a video ID
        const videoId = extractVideoId(url);
        if (videoId) {
            return {
                title: 'YouTube Music',
                url_only: true,
                high: `https://www.youtube.com/embed/${videoId}?autoplay=1`,
                low: `https://www.youtube.com/watch?v=${videoId}`,
                thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                embed_url: `https://www.youtube.com/embed/${videoId}`,
                youtube_fallback: true,
                isAudio: true,
                source: 'embed-only'
            };
        } else {
            return {
                success: false,
                error: "Invalid YouTube URL or cannot extract video ID",
                isAudio: true
            };
        }
    }
}

/**
 * Extract video ID from YouTube URL with improved pattern matching
 * @param {string} url - YouTube URL
 * @returns {string} - Video ID
 */
function extractVideoId(url) {
    if (!url) return '';
    
    // Handle standard YouTube URLs
    const standardMatch = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
    if (standardMatch && standardMatch[1]) {
        return standardMatch[1];
    }
    
    // Handle YouTube Music URLs
    const musicMatch = url.match(/music\.youtube\.com\/watch\?(?:.*&)?v=([a-zA-Z0-9_-]{11})/i);
    if (musicMatch && musicMatch[1]) {
        return musicMatch[1];
    }
    
    // Handle YouTube Shorts URLs
    const shortsMatch = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/i);
    if (shortsMatch && shortsMatch[1]) {
        return shortsMatch[1];
    }
    
    // Handle youtu.be short URLs
    const shortUrlMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/i);
    if (shortUrlMatch && shortUrlMatch[1]) {
        return shortUrlMatch[1];
    }
    
    // Match just the v parameter (might occur anywhere in the URL)
    const vParamMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})(&|$)/i);
    if (vParamMatch && vParamMatch[1]) {
        return vParamMatch[1];
    }
    
    return '';
}

module.exports = { downloadYouTubeVideo, downloadYouTubeMusic };
