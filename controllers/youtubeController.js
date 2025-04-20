// controllers/youtubeController.js
const { ytdown } = require("nayan-videos-downloader");

/**
 * Download YouTube video using nayan-videos-downloader only
 * @param {string} url - YouTube video URL
 * @returns {Promise<Object>} - Video data
 */
async function downloadYouTubeVideo(url) {
    try {
        console.log(`Processing YouTube URL: ${url}`);
        
        // Check if this is just a homepage URL (not a specific video)
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
        
        // Check if this is a search URL
        if (url.includes('/results') || url.includes('search_query=')) {
            console.log("This appears to be a YouTube search URL, not a direct video URL");
            return {
                success: false,
                error: "The provided URL is a YouTube search page, not a direct video URL. Please provide a direct video URL.",
                youtube_search: true
            };
        }
        
        // Extract video ID
        let videoId = extractVideoId(url);
        
        // Normalize mobile URL to desktop
        if (url.includes('m.youtube.com')) {
            url = url.replace(/m\.youtube\.com/, 'www.youtube.com');
            console.log(`Converted to desktop URL: ${url}`);
        }
        
        // Also handle youtu.be short URLs
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
        
        // Use ytdown from nayan-videos-downloader - ONLY STEP
        console.log("Using ytdown to get download links");
        const result = await ytdown(url);
        
        // Check if response is valid
        if (result && result.status === true) {
            // Handle data format (confirmed from logs)
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
            // Also handle media format (alternative response format)
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
            else {
                console.warn("Unexpected ytdown response structure:", result);
                throw new Error("Unexpected response structure from ytdown");
            }
        } else {
            // If ytdown status is false, return this directly to the client
            console.warn("Invalid response from ytdown:", result);
            return {
                success: false,
                error: result?.msg || "Failed to process YouTube URL",
                youtube_fallback: true,
                title: 'YouTube Video',
                high: `https://www.youtube.com/watch?v=${videoId}`,
                low: `https://www.youtube.com/watch?v=${videoId}`,
                thumbnail: thumbnail,
                embed_url: `https://www.youtube.com/embed/${videoId}`,
            };
        }
    } catch (error) {
        console.error(`YouTube download failed: ${error.message}`);
        
        // Simple fallback for any errors - just return a link to YouTube
        const videoId = extractVideoId(url) || '';
        return {
            success: false,
            error: error.message,
            youtube_fallback: true,
            title: 'YouTube Video',
            high: videoId ? `https://www.youtube.com/watch?v=${videoId}` : '',
            low: videoId ? `https://www.youtube.com/watch?v=${videoId}` : '',
            thumbnail: videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '',
            embed_url: videoId ? `https://www.youtube.com/embed/${videoId}` : '',
        };
    }
}

/**
 * Download YouTube music audio - only uses ytdown
 * @param {string} url - YouTube music URL
 * @returns {Promise<Object>} - Audio data
 */
async function downloadYouTubeMusic(url) {
    try {
        console.log(`Processing YouTube Music URL: ${url}`);
        
        // Check if this is just a homepage URL (not a specific video)
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
        
        // Check if this is a search URL
        if (url.includes('/results') || url.includes('search_query=')) {
            console.log("This appears to be a YouTube search URL, not a direct video URL");
            return {
                success: false,
                error: "The provided URL is a YouTube search page, not a direct video URL. Please provide a direct video URL.",
                youtube_search: true
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
        
        // Use ytdown from nayan-videos-downloader for music - ONLY STEP
        console.log("Using ytdown for YouTube Music");
        const result = await ytdown(url);
        
        // Check if response is valid
        if (result && result.status === true) {
            // Handle both response formats
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
            else {
                console.warn("Unexpected ytdown response structure for music:", result);
                throw new Error("Unexpected response structure from ytdown for music");
            }
        } else {
            // If ytdown status is false, return this directly to the client
            console.warn("Invalid response from ytdown for music:", result);
            return {
                success: false,
                error: result?.msg || "Failed to process YouTube Music URL",
                youtube_fallback: true,
                title: 'YouTube Music',
                high: `https://www.youtube.com/watch?v=${videoId}`,
                low: `https://www.youtube.com/watch?v=${videoId}`,
                thumbnail: thumbnail,
                embed_url: `https://www.youtube.com/embed/${videoId}`,
                isAudio: true,
            };
        }
    } catch (error) {
        console.error(`YouTube music download failed: ${error.message}`);
        
        // Simple fallback for any errors
        const videoId = extractVideoId(url) || '';
        return {
            success: false,
            error: error.message,
            youtube_fallback: true,
            title: 'YouTube Music',
            high: videoId ? `https://www.youtube.com/watch?v=${videoId}` : '',
            low: videoId ? `https://www.youtube.com/watch?v=${videoId}` : '',
            thumbnail: videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '',
            embed_url: videoId ? `https://www.youtube.com/embed/${videoId}` : '',
            isAudio: true,
        };
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
    
    return '';
}

module.exports = { downloadYouTubeVideo, downloadYouTubeMusic };
