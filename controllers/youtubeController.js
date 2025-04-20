// controllers/youtubeController.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { ytdown } = require("nayan-videos-downloader");

// Create temp directory if it doesn't exist
const TEMP_DIR = path.join(__dirname, '../temp');
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * Download YouTube video
 * @param {string} url - YouTube video URL
 * @returns {Promise<Object>} - Video data
 */
async function downloadYouTubeVideo(url) {
    try {
        console.log(`Processing YouTube URL: ${url}`);
        
        // Check if this is a search URL
        if (url.includes('/results') || url.includes('search_query=')) {
            console.log("This appears to be a YouTube search URL, not a direct video URL");
            return {
                success: false,
                error: "The provided URL is a YouTube search page, not a direct video URL. Please provide a direct video URL.",
                youtube_search: true
            };
        }
        
        // Normalize mobile URL to desktop
        if (url.includes('m.youtube.com')) {
            url = url.replace(/m\.youtube\.com/, 'www.youtube.com');
            console.log(`Converted to desktop URL: ${url}`);
        }
        
        // Extract video ID for thumbnail fallback
        const videoId = extractVideoId(url);
        
        // Check if we have a valid video ID
        if (!videoId) {
            console.log("No valid YouTube video ID found in URL");
            return {
                success: false,
                error: "No valid YouTube video ID found in URL. Please provide a direct video URL.",
            };
        }
        
        // Use ytdown from nayan-videos-downloader
        try {
            console.log("Using ytdown to get download links");
            const result = await ytdown(url);
            
            // Check if response is valid
            if (result && result.status === true) {
                // Handle data format (confirmed from your logs)
                if (result.data) {
                    console.log("Processing ytdown data response format");
                    
                    // Return the data directly without trying to download
                    return {
                        title: result.data.title || 'YouTube Video',
                        high: result.data.video_hd || result.data.video || '',
                        low: result.data.video || '',
                        thumbnail: result.data.thumb || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
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
                        thumbnail: result.media.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                        source: 'nayan-videos-downloader'
                    };
                } 
                else {
                    console.warn("Unexpected ytdown response structure:", result);
                    throw new Error("Unexpected response structure from ytdown");
                }
            } else {
                console.warn("Invalid response from ytdown:", result);
                throw new Error(result?.msg || "Failed to process YouTube URL");
            }
        } catch (ytdownError) {
            console.error(`ytdown error: ${ytdownError.message}`);
            
            // Fallback to direct YouTube links
            return {
                title: 'YouTube Video',
                high: `https://www.youtube.com/watch?v=${videoId}`,
                low: `https://www.youtube.com/watch?v=${videoId}`,
                thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                embed_url: `https://www.youtube.com/embed/${videoId}`,
                youtube_fallback: true,
                source: 'redirect'
            };
        }
    } catch (error) {
        console.error(`YouTube download failed: ${error.message}`);
        
        // Fallback to embed link if we have a video ID
        const videoId = extractVideoId(url);
        if (videoId) {
            return {
                title: 'YouTube Video',
                high: `https://www.youtube.com/watch?v=${videoId}`,
                low: `https://www.youtube.com/watch?v=${videoId}`,
                thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                embed_url: `https://www.youtube.com/embed/${videoId}`,
                youtube_fallback: true,
                source: 'redirect'
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
 * Extract video ID from YouTube URL
 * @param {string} url - YouTube URL
 * @returns {string} - Video ID
 */
function extractVideoId(url) {
    const videoIdMatch = url.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})(?:&|\/|$)/);
    return (videoIdMatch && videoIdMatch[1]) ? videoIdMatch[1] : '';
}

/**
 * Download YouTube music audio
 * @param {string} url - YouTube music URL
 * @returns {Promise<Object>} - Audio data
 */
async function downloadYouTubeMusic(url) {
    try {
        // Check if this is a search URL
        if (url.includes('/results') || url.includes('search_query=')) {
            console.log("This appears to be a YouTube search URL, not a direct video URL");
            return {
                success: false,
                error: "The provided URL is a YouTube search page, not a direct video URL. Please provide a direct video URL.",
                youtube_search: true
            };
        }
        
        // Convert youtube music URL to regular youtube if needed
        if (url.includes('music.youtube.com')) {
            const videoId = extractVideoId(url);
            if (videoId) {
                url = `https://www.youtube.com/watch?v=${videoId}`;
                console.log(`Converted to regular YouTube URL: ${url}`);
            }
        }
        
        // Check if we have a valid video ID
        const videoId = extractVideoId(url);
        if (!videoId) {
            console.log("No valid YouTube video ID found in URL");
            return {
                success: false,
                error: "No valid YouTube video ID found in URL. Please provide a direct video URL.",
            };
        }
        
        // Use ytdown from nayan-videos-downloader
        try {
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
                        thumbnail: result.data.thumb || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
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
                        thumbnail: result.media.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                        isAudio: true,
                        source: 'nayan-videos-downloader'
                    };
                } 
                else {
                    console.warn("Unexpected ytdown response structure for music:", result);
                    throw new Error("Unexpected response structure from ytdown for music");
                }
            } else {
                console.warn("Invalid response from ytdown for music:", result);
                throw new Error(result?.msg || "Failed to process YouTube Music URL");
            }
        } catch (ytdownError) {
            console.error(`ytdown music error: ${ytdownError.message}`);
            
            // Fallback to direct YouTube links for audio
            return {
                title: 'YouTube Music',
                high: `https://www.youtube.com/watch?v=${videoId}`,
                low: `https://www.youtube.com/watch?v=${videoId}`,
                thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                embed_url: `https://www.youtube.com/embed/${videoId}`,
                youtube_fallback: true,
                isAudio: true,
                source: 'redirect'
            };
        }
    } catch (error) {
        console.error(`YouTube music download failed: ${error.message}`);
        
        // Fallback to direct YouTube link if we have a video ID
        const videoId = extractVideoId(url);
        if (videoId) {
            return {
                title: 'YouTube Music',
                high: `https://www.youtube.com/watch?v=${videoId}`,
                low: `https://www.youtube.com/watch?v=${videoId}`,
                thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                embed_url: `https://www.youtube.com/embed/${videoId}`,
                youtube_fallback: true,
                isAudio: true,
                source: 'redirect'
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

module.exports = { downloadYouTubeVideo, downloadYouTubeMusic };
