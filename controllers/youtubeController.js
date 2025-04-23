// controllers/youtubeController.js
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const axios = require('axios');
const ytdl = require('ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const { ytdown } = require('nayan-videos-downloader');
const youtubeDl = require('youtube-dl-exec');

// Optional - Use ffmpeg installer if ffmpeg isn't already installed on your system
try {
    const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
    ffmpeg.setFfmpegPath(ffmpegInstaller.path);
} catch (error) {
    console.log('Using system ffmpeg installation');
}

// Create temp directory if it doesn't exist
const TEMP_DIR = path.join(__dirname, '..', 'temp');
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Rate limiter for YouTube API calls
const createRateLimiter = (maxCalls = 10, interval = 60000) => {
    const calls = [];
    
    return async (fn) => {
        const now = Date.now();
        // Remove calls outside the interval window
        while (calls.length > 0 && calls[0] < now - interval) {
            calls.shift();
        }
        
        if (calls.length >= maxCalls) {
            // Too many calls within the interval
            const oldestCall = calls[0];
            const waitTime = (oldestCall + interval) - now;
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        calls.push(now);
        return fn();
    };
};

const youtubeRateLimiter = createRateLimiter(5, 10000); // Max 5 calls per 10 seconds

/**
 * Enhanced YouTube video downloader with multiple fallback methods
 * @param {string} url - YouTube video URL
 * @returns {Promise<Object>} Download result with video URLs and metadata
 */
async function downloadYouTubeVideo(url) {
    console.log(`Downloading YouTube video: ${url}`);
    
    try {
        // Try method 1: ytdl-core (most reliable for YouTube)
        return await youtubeRateLimiter(async () => {
            try {
                console.log("Attempting method 1: ytdl-core");
                const videoInfo = await ytdl.getInfo(url);
                
                // Extract video formats
                const formats = videoInfo.formats.filter(format => format.hasVideo);
                
                // Find HD format (at least 720p)
                const hdFormat = formats.find(format => 
                    format.qualityLabel && 
                    parseInt(format.qualityLabel) >= 720 && 
                    format.hasAudio
                );
                
                // Find SD format (at least 360p)
                const sdFormat = formats.find(format => 
                    format.qualityLabel && 
                    parseInt(format.qualityLabel) >= 360 && 
                    format.hasAudio
                );
                
                // Fallback to any format with both audio and video
                const anyFormat = formats.find(format => format.hasAudio);
                
                // Select the best available format
                const highQualityFormat = hdFormat || sdFormat || anyFormat || formats[0];
                
                // Find low quality format (for slower connections)
                const lowQualityFormat = formats.find(format => 
                    format.qualityLabel && 
                    parseInt(format.qualityLabel) <= 360 && 
                    format.hasAudio
                ) || formats[formats.length - 1];
                
                // Get thumbnail URL (select the highest quality)
                const thumbnails = videoInfo.videoDetails.thumbnails;
                const bestThumbnail = thumbnails.length > 0 ? 
                    thumbnails[thumbnails.length - 1].url : 
                    `https://i.ytimg.com/vi/${videoInfo.videoDetails.videoId}/hqdefault.jpg`;
                
                console.log("Successfully extracted video using ytdl-core");
                
                return {
                    success: true,
                    title: videoInfo.videoDetails.title,
                    high: highQualityFormat ? highQualityFormat.url : null,
                    low: lowQualityFormat ? lowQualityFormat.url : null,
                    thumbnail: bestThumbnail,
                    videoId: videoInfo.videoDetails.videoId,
                    author: videoInfo.videoDetails.author.name,
                    length: videoInfo.videoDetails.lengthSeconds,
                    source: "ytdl-core"
                };
            } catch (ytdlError) {
                console.error("Method 1 failed:", ytdlError.message);
                throw ytdlError; // Let the next method handle it
            }
        });
    } catch (method1Error) {
        // Try method 2: nayan-videos-downloader (your original method)
        try {
            console.log("Attempting method 2: nayan-videos-downloader");
            const result = await ytdown(url);
            
            if (!result.success) {
                throw new Error(result.message || "Failed to download with nayan-videos-downloader");
            }
            
            return {
                success: true,
                title: result.data.title,
                high: result.data.high || result.data.url,
                low: result.data.low || result.data.url,
                thumbnail: result.data.thumb || `https://i.ytimg.com/vi/${url.split('v=')[1] || url.split('/').pop()}/maxresdefault.jpg`,
                source: "nayan-videos-downloader"
            };
        } catch (nayanError) {
            console.error("Method 2 failed:", nayanError.message);
            
            // Try method 3: youtube-dl-exec (most compatible with YouTube changes)
            try {
                console.log("Attempting method 3: youtube-dl-exec");
                
                // Extract video ID for thumbnail
                const videoId = url.includes('v=') ? 
                    url.split('v=')[1].split('&')[0] : 
                    url.split('/').pop().split('?')[0];
                
                // Get video info using youtube-dl
                const info = await youtubeDl(url, {
                    dumpSingleJson: true,
                    noCheckCertificates: true,
                    noWarnings: true,
                    preferFreeFormats: true,
                    addHeader: [
                        'referer:youtube.com',
                        'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
                    ]
                });
                
                // Find HD and SD formats
                const formats = info.formats.filter(f => f.vcodec !== 'none' && f.acodec !== 'none');
                
                // Sort by resolution/quality
                formats.sort((a, b) => {
                    const heightA = a.height || 0;
                    const heightB = b.height || 0;
                    return heightB - heightA; // Higher resolution first
                });
                
                const highFormat = formats.find(f => f.height >= 720) || formats[0];
                const lowFormat = formats.find(f => f.height <= 480) || formats[formats.length - 1];
                
                return {
                    success: true,
                    title: info.title,
                    high: highFormat ? highFormat.url : null,
                    low: lowFormat ? lowFormat.url : null,
                    thumbnail: info.thumbnail || `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
                    videoId: videoId,
                    author: info.uploader,
                    length: info.duration,
                    source: "youtube-dl-exec"
                };
            } catch (ytdlExecError) {
                console.error("Method 3 failed:", ytdlExecError.message);
                
                // Try method 4: Direct download with alternative URL format
                try {
                    console.log("Attempting method 4: Alternative format request");
                    
                    // Extract video ID for alternative request
                    const videoId = url.includes('v=') ? 
                        url.split('v=')[1].split('&')[0] : 
                        url.split('/').pop().split('?')[0];
                    
                    if (!videoId) {
                        throw new Error("Could not extract video ID");
                    }
                    
                    // Try direct API approach (might not always work due to YouTube changes)
                    const apiEndpoint = `https://www.youtube.com/get_video_info?video_id=${videoId}&html5=1`;
                    
                    const response = await axios.get(apiEndpoint, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
                            'Referer': 'https://www.youtube.com/watch?v=' + videoId
                        }
                    });
                    
                    // Fallback response that simply indicates the video exists
                    // but provides limited download links
                    return {
                        success: true,
                        title: `YouTube Video ${videoId}`,
                        high: `https://www.youtube.com/watch?v=${videoId}`,
                        low: `https://www.youtube.com/watch?v=${videoId}`,
                        thumbnail: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
                        videoId: videoId,
                        source: "fallback",
                        needsExternal: true // Flag indicating this needs external handling
                    };
                } catch (alternativeError) {
                    console.error("All methods failed:", alternativeError.message);
                    throw new Error(`Failed to download YouTube video: ${alternativeError.message}`);
                }
            }
        }
    }
}

/**
 * Download YouTube video as MP3 audio
 * @param {string} url - YouTube video URL
 * @returns {Promise<Object>} Download result with audio URL and metadata
 */
async function downloadYouTubeMusic(url) {
    console.log(`Downloading YouTube music: ${url}`);
    
    try {
        // First get the video info
        const videoData = await downloadYouTubeVideo(url);
        
        // Already failed in video method
        if (!videoData.success) {
            throw new Error(videoData.message || "Failed to get video info");
        }
        
        // Determine output path
        const safeTitle = videoData.title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
        const outputPath = path.join(TEMP_DIR, `${safeTitle}_${Date.now()}.mp3`);
        
        // If we have a local file path, use it for audio extraction
        if (videoData.localFilePath) {
            try {
                await new Promise((resolve, reject) => {
                    ffmpeg(videoData.localFilePath)
                        .output(outputPath)
                        .noVideo()
                        .audioCodec('libmp3lame')
                        .audioBitrate(192)
                        .on('end', resolve)
                        .on('error', reject)
                        .run();
                });
                
                return {
                    success: true,
                    title: videoData.title,
                    high: outputPath,
                    low: outputPath,
                    thumbnail: videoData.thumbnail,
                    localFilePath: outputPath,
                    source: "ffmpeg-extraction"
                };
            } catch (ffmpegError) {
                console.error("Audio extraction failed:", ffmpegError);
                // Continue to other methods
            }
        }
        
        // Try method 1: Using ytdl-core with audio-only
        try {
            console.log("Attempting audio download with ytdl-core");
            
            // Get audio-only formats
            const videoInfo = await ytdl.getInfo(url);
            const audioFormats = videoInfo.formats
                .filter(format => format.hasAudio && !format.hasVideo)
                .sort((a, b) => b.audioBitrate - a.audioBitrate);
            
            const bestAudioFormat = audioFormats[0];
            
            if (bestAudioFormat) {
                // Download audio to temp file
                const audioStream = ytdl(url, { format: bestAudioFormat });
                const writer = fs.createWriteStream(outputPath);
                
                await new Promise((resolve, reject) => {
                    audioStream.pipe(writer);
                    writer.on('finish', resolve);
                    writer.on('error', reject);
                });
                
                return {
                    success: true,
                    title: videoData.title,
                    high: outputPath,
                    low: outputPath,
                    thumbnail: videoData.thumbnail,
                    localFilePath: outputPath,
                    source: "ytdl-core-audio"
                };
            }
        } catch (audioYtdlError) {
            console.error("Audio download with ytdl-core failed:", audioYtdlError.message);
        }
        
        // Method 2: Use youtube-dl-exec directly for audio
        try {
            console.log("Attempting audio download with youtube-dl-exec");
            
            await youtubeDl(url, {
                extractAudio: true,
                audioFormat: 'mp3',
                audioQuality: 0, // best
                output: outputPath,
                noCheckCertificates: true,
                noWarnings: true,
                addHeader: [
                    'referer:youtube.com',
                    'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
                ]
            });
            
            if (fs.existsSync(outputPath)) {
                return {
                    success: true,
                    title: videoData.title,
                    high: outputPath,
                    low: outputPath,
                    thumbnail: videoData.thumbnail,
                    localFilePath: outputPath,
                    source: "youtube-dl-exec-audio"
                };
            }
        } catch (ytdlExecAudioError) {
            console.error("Audio download with youtube-dl-exec failed:", ytdlExecAudioError.message);
        }
        
        // Fallback: Return original video URLs with a warning
        return {
            success: true,
            title: videoData.title,
            high: videoData.high,
            low: videoData.low,
            thumbnail: videoData.thumbnail,
            source: videoData.source,
            warning: "Could not extract audio-only version, returning video URL"
        };
    } catch (error) {
        console.error("YouTube music download failed:", error.message);
        throw error;
    }
}

// Get quality options for a YouTube video
async function getVideoQualities(url) {
    try {
        const videoInfo = await ytdl.getInfo(url);
        const formats = videoInfo.formats
            .filter(format => format.hasVideo)
            .map(format => ({
                itag: format.itag,
                quality: format.qualityLabel,
                hasAudio: format.hasAudio,
                mimeType: format.mimeType,
                container: format.container,
                codecs: format.codecs,
                url: format.url
            }));
            
        return {
            success: true,
            title: videoInfo.videoDetails.title,
            thumbnail: videoInfo.videoDetails.thumbnails[videoInfo.videoDetails.thumbnails.length - 1].url,
            formats: formats
        };
    } catch (error) {
        console.error("Failed to get video qualities:", error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

// Schedule cleanup of temp directory
function scheduleCleanup(maxAge = 24 * 60 * 60 * 1000) { // 24 hours
    setInterval(() => {
        try {
            const files = fs.readdirSync(TEMP_DIR);
            const now = Date.now();
            
            for (const file of files) {
                const filePath = path.join(TEMP_DIR, file);
                const stats = fs.statSync(filePath);
                
                // Delete files older than maxAge
                if (now - stats.mtime.getTime() > maxAge) {
                    fs.unlinkSync(filePath);
                    console.log(`Deleted old temp file: ${file}`);
                }
            }
        } catch (error) {
            console.error("Error during temp file cleanup:", error);
        }
    }, 60 * 60 * 1000); // Run every hour
}

// Initialize the module
scheduleCleanup();

module.exports = {
    downloadYouTubeVideo,
    downloadYouTubeMusic,
    getVideoQualities
};
