// controllers/youtubeController.js
const fs = require('fs');
const path = require('path');
const { ytdown } = require('nayan-videos-downloader');
const fetch = require('node-fetch');
const HttpsProxyAgent = require('https-proxy-agent');

// Create temp directory if it doesn't exist
const TEMP_DIR = path.join(__dirname, '../temp');
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Cache configuration
const videoCache = new Map();
const CACHE_TTL = 3600000; // 1 hour

// Proxy servers configuration (add your actual proxies if available)
const PROXY_SERVERS = [
    null, // Direct connection (no proxy)
    // Add actual proxy URLs if you have them
    // "https://proxy1.example.com",
    // "https://proxy2.example.com"
];

// User agents rotation
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/123.0'
];

// Player response patterns
const PLAYER_RESPONSE_PATTERNS = [
    /ytInitialPlayerResponse\s*=\s*({.*?});/s,
    /playerResponse\s*=\s*({.*?});/s,
    /"PLAYER_CONFIG":({.*?}),"PLAYER/,
    /ytPlayerConfig\s*=\s*({.*?});/s
];

/**
 * Fetch with exponential backoff for handling rate limits
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @param {number} maxRetries - Maximum number of retries
 * @returns {Promise<Response>} - Fetch response
 */
async function fetchWithBackoff(url, options, maxRetries = 3) {
    let retries = 0;
    
    while (retries < maxRetries) {
        try {
            const response = await fetch(url, options);
            
            // If not rate limited or final retry, return response
            if (response.status !== 429 || retries === maxRetries - 1) {
                return response;
            }
            
            // Calculate delay with exponential backoff and jitter
            const delay = Math.pow(2, retries) * 1000 + Math.random() * 1000;
            console.log(`Rate limited (429). Retrying in ${delay}ms (retry ${retries + 1}/${maxRetries})`);
            
            await new Promise(resolve => setTimeout(resolve, delay));
            retries++;
        } catch (error) {
            console.error(`Fetch error (retry ${retries}): ${error.message}`);
            
            if (retries === maxRetries - 1) {
                throw error;
            }
            
            retries++;
            // Simple delay for network errors
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    throw new Error(`Failed after ${maxRetries} retries`);
}

/**
 * Attempt to fetch using multiple proxies
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>} - Fetch response
 */
async function fetchWithProxies(url, options = {}) {
    // Try each proxy in sequence
    for (const proxy of PROXY_SERVERS) {
        try {
            const fetchOptions = { ...options };
            
            // Add proxy agent if proxy is specified
            if (proxy) {
                console.log(`Trying with proxy: ${proxy}`);
                fetchOptions.agent = new HttpsProxyAgent(proxy);
            } else {
                console.log('Trying direct connection (no proxy)');
            }
            
            const response = await fetchWithBackoff(url, fetchOptions, 2);
            
            if (response.ok) {
                return response;
            } else {
                console.warn(`Proxy ${proxy || 'direct'} returned status: ${response.status}`);
            }
        } catch (error) {
            console.warn(`Proxy ${proxy || 'direct'} failed: ${error.message}`);
        }
    }
    
    throw new Error('All proxy attempts failed');
}

/**
 * Get cached data or fetch fresh data
 * @param {string} videoId - YouTube video ID
 * @param {Function} fetchFn - Function to fetch fresh data
 * @returns {Promise<Object>} - Video data
 */
async function getCachedOrFetch(videoId, fetchFn) {
    const cacheKey = `yt_${videoId}`;
    const cached = videoCache.get(cacheKey);
    
    // Return from cache if valid
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
        console.log(`Using cached data for video ${videoId}`);
        return cached.data;
    }
    
    // Fetch fresh data
    try {
        console.log(`Fetching fresh data for video ${videoId}`);
        const data = await fetchFn();
        
        // Store in cache
        videoCache.set(cacheKey, {
            timestamp: Date.now(),
            data
        });
        
        return data;
    } catch (error) {
        // If we have stale cache, return it with a warning
        if (cached) {
            console.warn(`Using stale cache for ${videoId} due to fetch error: ${error.message}`);
            return cached.data;
        }
        
        throw error;
    }
}

/**
 * Classify YouTube errors for better user feedback
 * @param {string} errorMessage - Error message
 * @returns {Object} - Classified error
 */
function classifyYouTubeError(errorMessage) {
    if (!errorMessage) {
        return {
            type: "UNKNOWN_ERROR",
            userMessage: "An unknown error occurred."
        };
    }
    
    if (errorMessage.includes("content isn't available") || errorMessage.includes("This video isn't available anymore")) {
        return {
            type: "VIDEO_UNAVAILABLE",
            userMessage: "This video appears to be unavailable, private, or deleted."
        };
    } else if (errorMessage.includes("429") || errorMessage.includes("Too many requests")) {
        return {
            type: "RATE_LIMITED",
            userMessage: "Too many requests to YouTube. Please try again later."
        };
    } else if (errorMessage.includes("403") || errorMessage.includes("Forbidden")) {
        return {
            type: "ACCESS_DENIED",
            userMessage: "Access denied. This video may be region-restricted or requires login."
        };
    } else if (errorMessage.includes("Internet") || errorMessage.includes("network") || 
               errorMessage.includes("timeout") || errorMessage.includes("ETIMEDOUT")) {
        return {
            type: "NETWORK_ERROR",
            userMessage: "Network error. Please check your internet connection."
        };
    } else if (errorMessage.includes("parse") || errorMessage.includes("JSON")) {
        return {
            type: "PARSE_ERROR",
            userMessage: "Error processing video data."
        };
    }
    
    return {
        type: "GENERAL_ERROR",
        userMessage: "Failed to process this YouTube video."
    };
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
        
        // Extract video ID and normalize URL
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
        
        // Create a function for fetching data to use with caching
        const fetchVideoData = async () => {
            // APPROACH 1: Try to get YouTube player data directly from the embed page
            try {
                console.log("Getting video data from YouTube embed page...");
                const embedData = await getYouTubeEmbedData(videoId);
                
                if (embedData.title && (embedData.hlsManifestUrl || embedData.dashManifestUrl)) {
                    console.log("Successfully extracted video data from embed page");
                    
                    return {
                        success: true,
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
                // Fall through to next approach
            }
            
            // APPROACH 2: Try ytdown even though the service might be down
            try {
                console.log("Trying ytdown method...");
                const result = await ytdown(url);
                
                // Check status to see if service is available
                if (result && result.status === false) {
                    console.warn(`ytdown service is offline: ${result.msg || "Unknown error"}`);
                    throw new Error(result.msg || "nayan-videos-downloader service is offline");
                }
                
                // Check if response is valid
                if (result && result.status === true) {
                    if (result.data) {
                        console.log("Processing ytdown data response format");
                        
                        // Return the data directly without any further processing
                        return {
                            success: true,
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
                            success: true,
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
            
            // APPROACH 3: Try direct download from alternative sources
            try {
                console.log("Attempting alternative video sources");
                // This would be where you'd add more alternative extraction methods
                // For now, just throw an error to move to fallback
                throw new Error("No alternative sources available");
            } catch (altError) {
                console.error(`Alternative sources error: ${altError.message}`);
            }
            
            // APPROACH 4: Return embed link which is always playable in a webview
            console.log("All methods failed, returning embed URL");
            
            return {
                success: true,
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
        };
        
        // Use caching to avoid repeated requests
        try {
            return await getCachedOrFetch(videoId, fetchVideoData);
        } catch (error) {
            console.error(`YouTube processing failed: ${error.message}`);
            
            // Final fallback to simple embed link
            const errorInfo = classifyYouTubeError(error.message);
            
            // Special response for unavailable videos
            if (errorInfo.type === "VIDEO_UNAVAILABLE") {
                return {
                    success: false,
                    error: errorInfo.userMessage,
                    errorType: errorInfo.type,
                    embed_url: `https://www.youtube.com/embed/${videoId}`,
                    thumbnail: thumbnail
                };
            }
            
            return {
                success: true,
                title: 'YouTube Video',
                url_only: true,
                high: `https://www.youtube.com/embed/${videoId}?autoplay=1`,
                low: `https://www.youtube.com/watch?v=${videoId}`,
                thumbnail: thumbnail,
                embed_url: `https://www.youtube.com/embed/${videoId}`,
                youtube_fallback: true,
                source: 'embed-only',
                error_info: errorInfo
            };
        }
    } catch (error) {
        console.error(`Uncaught YouTube error: ${error.message}`);
        
        // Final fallback with error info
        const errorInfo = classifyYouTubeError(error.message);
        const videoId = extractVideoId(url);
        
        if (videoId) {
            return {
                success: false,
                error: errorInfo.userMessage,
                errorType: errorInfo.type,
                url_only: true,
                embed_url: `https://www.youtube.com/embed/${videoId}`,
                thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
            };
        } else {
            return {
                success: false,
                error: "Invalid YouTube URL or cannot extract video ID",
                errorType: "INVALID_URL"
            };
        }
    }
}

/**
 * Extract video data directly from YouTube embed page (more robust implementation)
 * @param {string} videoId - YouTube video ID
 * @returns {Promise<Object>} - Video data including manifest URLs
 */
async function getYouTubeEmbedData(videoId) {
    const embedUrl = `https://www.youtube.com/embed/${videoId}`;
    
    // Rotate user agents to avoid detection
    const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    
    try {
        // Use proxy rotation for better reliability
        const response = await fetchWithProxies(embedUrl, {
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
        
        // Try multiple patterns to extract player response JSON
        let playerResponse = null;
        
        for (const pattern of PLAYER_RESPONSE_PATTERNS) {
            const match = html.match(pattern);
            if (match && match[1]) {
                try {
                    playerResponse = JSON.parse(match[1]);
                    console.log(`Successfully extracted player data using pattern: ${pattern}`);
                    break;
                } catch (parseError) {
                    console.warn(`Failed to parse using pattern: ${pattern}`);
                }
            }
        }
        
        if (!playerResponse) {
            throw new Error('Could not find player response data in embed page');
        }
        
        // Extract video title
        const title = playerResponse.videoDetails?.title || 
                      playerResponse.title || 
                      playerResponse.player?.args?.title || 
                      'YouTube Video';
        
        // Extract streaming URLs
        let hlsManifestUrl = null;
        let dashManifestUrl = null;
        
        // Different possible structures to check
        if (playerResponse.streamingData) {
            // Standard structure
            hlsManifestUrl = playerResponse.streamingData.hlsManifestUrl || null;
            dashManifestUrl = playerResponse.streamingData.dashManifestUrl || null;
        } else if (playerResponse.player && playerResponse.player.args) {
            // Alternative structure
            const playerArgs = playerResponse.player.args;
            hlsManifestUrl = playerArgs.hlsvp || playerArgs.hls_manifest || null;
            dashManifestUrl = playerArgs.dashmpd || null;
        } else if (playerResponse.args) {
            // Yet another structure
            hlsManifestUrl = playerResponse.args.hlsvp || playerResponse.args.hls_manifest || null;
            dashManifestUrl = playerResponse.args.dashmpd || null;
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
        
        // Create a function for fetching data to use with caching
        const fetchMusicData = async () => {
            // APPROACH 1: Try to get YouTube player data directly
            try {
                console.log("Getting video data from YouTube embed page...");
                const embedData = await getYouTubeEmbedData(videoId);
                
                if (embedData.title && (embedData.hlsManifestUrl || embedData.dashManifestUrl)) {
                    console.log("Successfully extracted audio data from embed page");
                    
                    return {
                        success: true,
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
                            success: true,
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
                            success: true,
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
            
            // APPROACH 3: Try alternative audio extraction
            try {
                console.log("Attempting alternative audio sources");
                // Add alternative methods here if available
                throw new Error("No alternative sources available");
            } catch (altError) {
                console.error(`Alternative sources error: ${altError.message}`);
            }
            
            // APPROACH 4: Return embed link which is always playable in a webview
            console.log("All methods failed, returning music embed URL");
            
            return {
                success: true,
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
        };
        
        // Use caching to avoid repeated requests
        try {
            return await getCachedOrFetch(videoId, fetchMusicData);
        } catch (error) {
            console.error(`YouTube music processing failed: ${error.message}`);
            
            // Get classified error
            const errorInfo = classifyYouTubeError(error.message);
            
            // Special response for unavailable videos
            if (errorInfo.type === "VIDEO_UNAVAILABLE") {
                return {
                    success: false,
                    error: errorInfo.userMessage,
                    errorType: errorInfo.type,
                    isAudio: true,
                    embed_url: `https://www.youtube.com/embed/${videoId}`,
                    thumbnail: thumbnail
                };
            }
            
            // Fallback to direct YouTube link if we have a video ID
            return {
                success: true,
                title: 'YouTube Music',
                url_only: true,
                high: `https://www.youtube.com/embed/${videoId}?autoplay=1`,
                low: `https://www.youtube.com/watch?v=${videoId}`,
                thumbnail: thumbnail,
                embed_url: `https://www.youtube.com/embed/${videoId}`,
                youtube_fallback: true,
                isAudio: true,
                source: 'embed-only',
                error_info: errorInfo
            };
        }
    } catch (error) {
        console.error(`Uncaught YouTube music error: ${error.message}`);
        
        // Final fallback with error info
        const errorInfo = classifyYouTubeError(error.message);
        const videoId = extractVideoId(url);
        
        if (videoId) {
            return {
                success: false,
                error: errorInfo.userMessage,
                errorType: errorInfo.type,
                url_only: true,
                embed_url: `https://www.youtube.com/embed/${videoId}`,
                thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                isAudio: true
            };
        } else {
            return {
                success: false,
                error: "Invalid YouTube URL or cannot extract video ID",
                errorType: "INVALID_URL",
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
    
    // Handle standard YouTube URLs with various query parameters
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
    
    // Match YouTube URL with video ID directly in path (no query)
    const directPathMatch = url.match(/youtube\.com\/([a-zA-Z0-9_-]{11})(\?|$)/i);
    if (directPathMatch && directPathMatch[1]) {
        return directPathMatch[1];
    }
    
    return '';
}

/**
 * Validate if a URL is a valid YouTube URL
 * @param {string} url - URL to validate
 * @returns {boolean} - True if valid YouTube URL
 */
function isValidYouTubeUrl(url) {
    if (!url) return false;
    
    // Check if URL contains YouTube domains
    const isYouTubeDomain = url.includes('youtube.com') || 
                           url.includes('youtu.be') || 
                           url.includes('music.youtube.com');
    
    // Must be a YouTube domain and have a video ID
    return isYouTubeDomain && extractVideoId(url) !== '';
}

/**
 * Get video info without downloading (for quick status check)
 * @param {string} url - YouTube URL
 * @returns {Promise<Object>} - Video info
 */
async function getYouTubeVideoInfo(url) {
    try {
        const videoId = extractVideoId(url);
        
        if (!videoId) {
            return {
                success: false,
                error: "Invalid YouTube URL or cannot extract video ID"
            };
        }
        
        // Try to get basic info from embed page first
        try {
            const embedData = await getYouTubeEmbedData(videoId);
            
            return {
                success: true,
                title: embedData.title,
                videoId: videoId,
                thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                available: true
            };
        } catch (embedError) {
            // Check if video is unavailable
            if (embedError.message.includes("content isn't available")) {
                return {
                    success: false,
                    error: "This video appears to be unavailable, private, or deleted.",
                    videoId: videoId,
                    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                    available: false
                };
            }
            
            // For other errors, return limited info
            return {
                success: true,
                title: 'YouTube Video',
                videoId: videoId,
                thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                available: true,
                note: "Only basic info available"
            };
        }
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Clear expired items from cache
 */
function clearExpiredCache() {
    const now = Date.now();
    
    for (const [key, value] of videoCache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
            videoCache.delete(key);
        }
    }
}

// Run cache cleanup every hour
setInterval(clearExpiredCache, 3600000);

module.exports = { 
    downloadYouTubeVideo,
    downloadYouTubeMusic,
    getYouTubeVideoInfo,
    isValidYouTubeUrl,
    extractVideoId
};
