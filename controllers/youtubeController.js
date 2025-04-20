// controllers/youtubeController.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { ytdown } = require("nayan-videos-downloader");
const ytdl = require('ytdl-core');

// Create temp directory if it doesn't exist
const TEMP_DIR = path.join(__dirname, '../temp');
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * Download YouTube video with improved media handling
 * @param {string} url - YouTube video URL
 * @returns {Promise<Object>} - Video data
 */
async function downloadYouTubeVideo(url) {
    try {
        console.log(`Processing YouTube URL: ${url}`);
        
        // Normalize mobile URL to desktop
        if (url.includes('m.youtube.com')) {
            url = url.replace(/m\.youtube\.com/, 'www.youtube.com');
            console.log(`Converted to desktop URL: ${url}`);
        }
        
        // Extract video ID for thumbnail and other fallbacks
        const videoId = extractVideoId(url);
        
        // First, try to get title and metadata using ytdl-core for reliability
        let videoInfo = null;
        let videoTitle = 'YouTube Video';
        let videoThumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
        
        try {
            videoInfo = await ytdl.getInfo(url);
            videoTitle = videoInfo.videoDetails.title || 'YouTube Video';
            
            // Get high quality thumbnail
            if (videoInfo.videoDetails.thumbnails && videoInfo.videoDetails.thumbnails.length > 0) {
                // Sort thumbnails by resolution (highest first)
                const thumbnails = [...videoInfo.videoDetails.thumbnails];
                thumbnails.sort((a, b) => (b.width * b.height) - (a.width * a.height));
                videoThumbnail = thumbnails[0].url;
            }
            
            console.log(`Successfully retrieved video title: "${videoTitle}"`);
        } catch (infoError) {
            console.warn(`Could not get video info with ytdl-core: ${infoError.message}`);
            // Continue with default title and thumbnail
        }
        
        // Now try with ytdown for the actual video URLs
        try {
            console.log("Using ytdown to get download links");
            const result = await ytdown(url);
            
            if (result && result.status === true && result.media) {
                console.log(`ytdown result: ${JSON.stringify(result.media, null, 2)}`);
                
                // Check if URLs are valid and playable
                const highUrl = result.media.high || '';
                const lowUrl = result.media.low || result.media.high || '';
                
                // Verify URLs are valid using a HEAD request
                let validHighUrl = highUrl;
                let validLowUrl = lowUrl;
                
                if (highUrl) {
                    validHighUrl = await verifyUrl(highUrl) ? highUrl : '';
                }
                
                if (lowUrl) {
                    validLowUrl = await verifyUrl(lowUrl) ? lowUrl : '';
                }
                
                // If ytdown URLs are valid, use them
                if (validHighUrl || validLowUrl) {
                    return {
                        title: videoTitle, // Use the title from ytdl-core for reliability
                        high: validHighUrl,
                        low: validLowUrl || validHighUrl,
                        thumbnail: videoThumbnail,
                        source: 'nayan-videos-downloader'
                    };
                } else {
                    console.warn("ytdown returned URLs that failed validation");
                    throw new Error("Invalid media URLs");
                }
            } else {
                console.warn("Invalid response from ytdown:", result);
                throw new Error(result?.msg || "Failed to process YouTube URL");
            }
        } catch (ytdownError) {
            console.error(`ytdown error: ${ytdownError.message}`);
            
            // If we have videoInfo from ytdl-core, use that as fallback
            if (videoInfo) {
                console.log("Falling back to ytdl-core for download URLs");
                
                // Filter for formats with both video and audio
                let formats = videoInfo.formats.filter(format => 
                    format.hasVideo && format.hasAudio
                );
                
                // If no complete formats, use any available formats
                if (formats.length === 0) {
                    formats = videoInfo.formats;
                }
                
                // Sort by quality (highest first)
                formats.sort((a, b) => {
                    const qualityA = a.height || 0;
                    const qualityB = b.height || 0;
                    return qualityB - qualityA;
                });
                
                // Get high and low quality options
                const highQuality = formats.length > 0 ? formats[0] : null;
                const lowQuality = formats.length > 1 ? 
                    formats[Math.min(formats.length - 1, 3)] : // Use the 4th format or last if less than 4
                    highQuality;
                
                if (highQuality) {
                    return {
                        title: videoTitle,
                        high: highQuality.url,
                        low: lowQuality ? lowQuality.url : highQuality.url,
                        thumbnail: videoThumbnail,
                        source: 'ytdl-core'
                    };
                }
            }
            
            // Last resort: Download to a local file
            try {
                console.log("Trying to download to local file");
                const tempFilePath = path.join(TEMP_DIR, `youtube-${Date.now()}.mp4`);
                
                // Download the file using ytdl-core
                await new Promise((resolve, reject) => {
                    const videoStream = ytdl(url, { quality: 'highest' });
                    const fileStream = fs.createWriteStream(tempFilePath);
                    
                    videoStream.pipe(fileStream);
                    
                    fileStream.on('finish', () => {
                        console.log(`File download complete: ${tempFilePath}`);
                        resolve();
                    });
                    
                    fileStream.on('error', (err) => {
                        console.error(`File write error: ${err.message}`);
                        reject(err);
                    });
                    
                    videoStream.on('error', (err) => {
                        console.error(`Video stream error: ${err.message}`);
                        reject(err);
                    });
                });
                
                // Check if file exists and is valid
                if (fs.existsSync(tempFilePath) && fs.statSync(tempFilePath).size > 10000) {
                    const videoUrl = `/api/stream-file?path=${encodeURIComponent(tempFilePath)}`;
                    
                    return {
                        title: videoTitle,
                        high: videoUrl,
                        low: videoUrl,
                        thumbnail: videoThumbnail,
                        localFilePath: tempFilePath,
                        source: 'ytdl-core-file'
                    };
                } else {
                    throw new Error("Downloaded file is too small or invalid");
                }
            } catch (fileError) {
                console.error(`File download failed: ${fileError.message}`);
            }
            
            // Absolute last resort: Return embed links
            return {
                title: videoTitle,
                high: `https://www.youtube.com/watch?v=${videoId}`,
                low: `https://www.youtube.com/watch?v=${videoId}`,
                thumbnail: videoThumbnail,
                embed_url: `https://www.youtube.com/embed/${videoId}`,
                youtube_fallback: true,
                source: 'redirect'
            };
        }
    } catch (error) {
        console.error(`YouTube download failed: ${error.message}`);
        
        // Fallback to embed link
        const videoId = extractVideoId(url);
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
 * Verify URL is accessible
 * @param {string} url - URL to verify
 * @returns {Promise<boolean>} - Whether URL is valid
 */
async function verifyUrl(url) {
    try {
        const response = await axios.head(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 5000, // 5 second timeout
            validateStatus: status => status < 400 // Accept any status < 400
        });
        
        return response.status < 400;
    } catch (error) {
        console.warn(`URL verification failed for ${url}: ${error.message}`);
        return false;
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
        
        // For music, always download to a local file for better playback
        try {
            console.log("Downloading YouTube music to local file");
            
            // First get video info for title
            let videoTitle = 'YouTube Music';
            let videoThumbnail = '';
            
            try {
                const videoInfo = await ytdl.getInfo(url);
                videoTitle = videoInfo.videoDetails.title || 'YouTube Music';
                
                // Get thumbnail
                if (videoInfo.videoDetails.thumbnails && videoInfo.videoDetails.thumbnails.length > 0) {
                    videoThumbnail = videoInfo.videoDetails.thumbnails[0].url;
                }
            } catch (infoError) {
                console.warn(`Could not get music info: ${infoError.message}`);
                // Continue with default title
            }
            
            const tempFilePath = path.join(TEMP_DIR, `ytmusic-${Date.now()}.mp3`);
            
            // Download audio using ytdl-core
            await new Promise((resolve, reject) => {
                const audioStream = ytdl(url, { 
                    quality: 'highestaudio',
                    filter: 'audioonly'
                });
                
                const fileStream = fs.createWriteStream(tempFilePath);
                
                audioStream.pipe(fileStream);
                
                fileStream.on('finish', () => {
                    console.log(`Audio download complete: ${tempFilePath}`);
                    resolve();
                });
                
                fileStream.on('error', reject);
                audioStream.on('error', reject);
            });
            
            // Check if file exists and is valid
            if (fs.existsSync(tempFilePath) && fs.statSync(tempFilePath).size > 10000) {
                const audioUrl = `/api/stream-file?path=${encodeURIComponent(tempFilePath)}`;
                
                return {
                    title: videoTitle,
                    high: audioUrl,
                    low: audioUrl,
                    thumbnail: videoThumbnail || `https://i.ytimg.com/vi/${extractVideoId(url)}/hqdefault.jpg`,
                    localFilePath: tempFilePath,
                    isAudio: true,
                    source: 'ytdl-core-audio-file'
                };
            } else {
                throw new Error("Downloaded audio file is too small or invalid");
            }
        } catch (fileError) {
            console.error(`Audio file download failed: ${fileError.message}`);
            
            // Try ytdown as fallback
            try {
                console.log("Falling back to ytdown for audio");
                const result = await ytdown(url);
                
                if (result && result.status === true && result.media) {
                    // Check if URLs are valid
                    const highUrl = result.media.high || '';
                    const lowUrl = result.media.low || result.media.high || '';
                    
                    // Verify URLs
                    let validHighUrl = highUrl;
                    let validLowUrl = lowUrl;
                    
                    if (highUrl) {
                        validHighUrl = await verifyUrl(highUrl) ? highUrl : '';
                    }
                    
                    if (lowUrl) {
                        validLowUrl = await verifyUrl(lowUrl) ? lowUrl : '';
                    }
                    
                    if (validHighUrl || validLowUrl) {
                        return {
                            title: result.media.title || 'YouTube Music',
                            high: validHighUrl,
                            low: validLowUrl || validHighUrl,
                            thumbnail: result.media.thumbnail || `https://i.ytimg.com/vi/${extractVideoId(url)}/hqdefault.jpg`,
                            isAudio: true,
                            source: 'nayan-videos-downloader-audio'
                        };
                    } else {
                        throw new Error("Invalid audio URLs");
                    }
                } else {
                    throw new Error(result?.msg || "Failed to process YouTube audio URL");
                }
            } catch (ytdownError) {
                console.error(`ytdown audio error: ${ytdownError.message}`);
                
                // Last resort: Fall back to regular video download but marked as audio
                const videoData = await downloadYouTubeVideo(url);
                videoData.isAudio = true;
                return videoData;
            }
        }
    } catch (error) {
        console.error(`YouTube music download failed: ${error.message}`);
        
        // Absolute last resort: Return direct YouTube link but marked as audio
        const videoId = extractVideoId(url);
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
}

module.exports = { downloadYouTubeVideo, downloadYouTubeMusic };
