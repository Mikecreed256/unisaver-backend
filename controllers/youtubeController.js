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
 * Process YouTube URL using nayan-videos-downloader ytdown
 * @param {string} url - YouTube video URL
 * @returns {Promise<Object>} - Processed video data
 */
async function processYouTubeUrl(url) {
    try {
        console.log(`Processing YouTube URL: ${url}`);
        
        // Extract video ID for thumbnail fallback
        const videoId = extractVideoId(url);
        
        // Call ytdown function from nayan-videos-downloader
        const result = await ytdown(url);
        
        if (!result || result.status !== true || !result.media) {
            console.warn("Invalid response from ytdown:", result);
            throw new Error(result?.msg || "Failed to process YouTube URL");
        }
        
        console.log(`Successfully processed: ${result.media.title}`);
        
        return {
            title: result.media.title || 'YouTube Video',
            high: result.media.high || '',
            low: result.media.low || result.media.high || '',
            thumbnail: result.media.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            source: 'nayan-videos-downloader'
        };
    } catch (error) {
        console.error(`Error processing YouTube URL: ${error.message}`);
        throw error;
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
 * Download YouTube video
 * @param {string} url - YouTube video URL
 * @returns {Promise<Object>} - Video data
 */
async function downloadYouTubeVideo(url) {
    try {
        // Normalize mobile URL to desktop
        if (url.includes('m.youtube.com')) {
            url = url.replace(/m\.youtube\.com/, 'www.youtube.com');
            console.log(`Converted to desktop URL: ${url}`);
        }
        
        // Process the URL
        const videoData = await processYouTubeUrl(url);
        
        return videoData;
    } catch (error) {
        console.error(`YouTube download failed: ${error.message}`);
        
        // Fallback to embed link
        const videoId = extractVideoId(url);
        return {
            title: 'YouTube Video (Watch Online)',
            high: `https://www.youtube.com/watch?v=${videoId}`,
            low: `https://www.youtube.com/watch?v=${videoId}`,
            thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            embed_url: `https://www.youtube.com/embed/${videoId}`,
            youtube_fallback: true,
            source: 'redirect'
        };
    }
}

/**
 * Download YouTube music audio
 * @param {string} url - YouTube music URL
 * @returns {Promise<Object>} - Audio data
 */
async function downloadYouTubeMusic(url) {
    try {
        // Convert youtube music URL to regular youtube if needed
        if (url.includes('music.youtube.com')) {
            const videoId = extractVideoId(url);
            if (videoId) {
                url = `https://www.youtube.com/watch?v=${videoId}`;
                console.log(`Converted to regular YouTube URL: ${url}`);
            }
        }
        
        // Process with ytdown
        const audioData = await processYouTubeUrl(url);
        
        // Mark as audio
        audioData.isAudio = true;
        
        // Try to download audio to local file for better streaming
        try {
            const audioUrl = audioData.high || audioData.low;
            if (!audioUrl) {
                throw new Error("No audio URL available");
            }
            
            const tempFilePath = path.join(TEMP_DIR, `ytmusic-${Date.now()}.mp3`);
            console.log(`Downloading audio to ${tempFilePath}`);
            
            const response = await axios({
                method: 'get',
                url: audioUrl,
                responseType: 'stream',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            const writer = fs.createWriteStream(tempFilePath);
            response.data.pipe(writer);
            
            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });
            
            console.log(`Audio download complete: ${tempFilePath}`);
            const audioStreamUrl = `/api/stream-file?path=${encodeURIComponent(tempFilePath)}`;
            
            audioData.high = audioStreamUrl;
            audioData.low = audioStreamUrl;
            audioData.localFilePath = tempFilePath;
            audioData.source = 'nayan-videos-downloader-audio-file';
        } catch (downloadError) {
            console.warn(`Could not download to local file: ${downloadError.message}`);
            // Continue with direct URLs
        }
        
        return audioData;
    } catch (error) {
        console.error(`YouTube music download failed: ${error.message}`);
        
        // Fallback to regular video download but marked as audio
        const videoData = await downloadYouTubeVideo(url);
        videoData.isAudio = true;
        return videoData;
    }
}

module.exports = { downloadYouTubeVideo, downloadYouTubeMusic };
