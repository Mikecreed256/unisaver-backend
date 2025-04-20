// controllers/youtubeController.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { ytdown } = require("nayan-videos-downloader");
const youtubeDl = require('youtube-dl-exec'); // Add this dependency

// Create temp directory if it doesn't exist
const TEMP_DIR = path.join(__dirname, '../temp');
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * Download YouTube video with enhanced reliability
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

        // Thumbnail will be consistent regardless of download method
        const thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
        
        // APPROACH 1: Try youtube-dl-exec first (most reliable)
        try {
            console.log("Attempting to download with youtube-dl-exec...");
            const result = await downloadWithYoutubeDl(url);
            console.log("youtube-dl-exec download successful!");
            
            return {
                title: result.title || 'YouTube Video',
                high: result.highQualityUrl || '',
                low: result.lowQualityUrl || '',
                thumbnail: thumbnail,
                source: 'youtube-dl'
            };
        } catch (ytdlError) {
            console.error(`youtube-dl-exec error: ${ytdlError.message}`);
            console.log("Falling back to other methods...");
            // Continue to next approach
        }
        
        // APPROACH 2: Try ytdown from nayan-videos-downloader
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
                console.warn("Invalid response from ytdown:", result);
                throw new Error(result?.msg || "Failed to process YouTube URL");
            }
        } catch (ytdownError) {
            console.error(`ytdown error: ${ytdownError.message}`);
            
            // APPROACH 3: Try direct download to file using youtube-dl-exec
            try {
                console.log("Attempting direct file download with youtube-dl-exec...");
                const fileResult = await downloadYouTubeToFile(url, videoId);
                console.log("Direct file download successful!");
                
                return {
                    title: fileResult.title || 'YouTube Video',
                    high: fileResult.fileUrl || '',
                    low: fileResult.fileUrl || '',
                    thumbnail: thumbnail,
                    source: 'youtube-dl-file',
                    localFilePath: fileResult.filePath
                };
            } catch (directError) {
                console.error(`Direct download error: ${directError.message}`);
                
                // APPROACH 4: Last resort fallback to direct YouTube links
                console.log("All download methods failed, falling back to YouTube direct links");
                return {
                    title: 'YouTube Video',
                    high: `https://www.youtube.com/watch?v=${videoId}`,
                    low: `https://www.youtube.com/watch?v=${videoId}`,
                    thumbnail: thumbnail,
                    embed_url: `https://www.youtube.com/embed/${videoId}`,
                    youtube_fallback: true,
                    source: 'redirect'
                };
            }
        }
    } catch (error) {
        console.error(`YouTube download failed: ${error.message}`);
        
        // Final fallback to embed link if we have a video ID
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
 * Download YouTube video using youtube-dl-exec
 * @param {string} url - YouTube URL
 * @returns {Promise<Object>} - Video URLs
 */
async function downloadWithYoutubeDl(url) {
    try {
        const info = await youtubeDl(url, {
            dumpSingleJson: true,
            noCheckCertificates: true,
            noWarnings: true,
            preferFreeFormats: true,
            addHeader: [
                'referer:youtube.com',
                'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            ],
        });

        if (!info || !info.formats || info.formats.length === 0) {
            throw new Error('No video formats found');
        }

        // Look for the best video formats
        // First try to find formats with both video and audio
        const videoFormats = info.formats.filter(f => 
            f.vcodec !== 'none' && f.acodec !== 'none'
        );

        // Find high quality (720p or better if available)
        const highQualityFormat = videoFormats.find(f => 
            (f.height >= 720 && f.height <= 1080)
        ) || videoFormats[0];
        
        // Find lower quality backup (480p or close)
        const lowQualityFormat = videoFormats.find(f => 
            (f.height <= 480 && f.height >= 360)
        ) || videoFormats[videoFormats.length - 1];

        return {
            title: info.title || 'YouTube Video',
            highQualityUrl: highQualityFormat.url,
            lowQualityUrl: lowQualityFormat.url,
        };
    } catch (error) {
        console.error(`youtube-dl json extraction error: ${error.message}`);
        throw error;
    }
}

/**
 * Download YouTube video directly to a file
 * @param {string} url - YouTube URL
 * @param {string} videoId - YouTube video ID
 * @returns {Promise<Object>} - File URL and path
 */
async function downloadYouTubeToFile(url, videoId) {
    const uniqueId = Date.now();
    const fileName = `youtube-${videoId}-${uniqueId}.mp4`;
    const filePath = path.join(TEMP_DIR, fileName);
    
    // Check if temp directory exists and is writable
    if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
    }
    
    try {
        // Test write access to the temp directory
        fs.accessSync(TEMP_DIR, fs.constants.W_OK);
    } catch (accessError) {
        console.error(`Temp directory is not writable: ${accessError.message}`);
        throw new Error('Temp directory is not writable');
    }

    try {
        // Define options for youtube-dl-exec
        const options = {
            output: filePath,
            format: 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best',
            mergeOutputFormat: 'mp4',
            noCheckCertificates: true,
            noWarnings: true,
            addHeader: [
                'referer:youtube.com',
                'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            ],
        };

        console.log(`Downloading YouTube video to file: ${filePath}`);
        console.log(`Using format: ${options.format}`);
        
        // Execute youtube-dl-exec to download the file
        await youtubeDl(url, options);
        
        // Check if download was successful
        if (!fs.existsSync(filePath)) {
            throw new Error('File download failed - output file not created');
        }
        
        const stats = fs.statSync(filePath);
        if (stats.size === 0) {
            throw new Error('Downloaded file is empty');
        }
        
        console.log(`Successfully downloaded YouTube video to file (${stats.size} bytes)`);
        
        // Create URL for streaming the file
        const fileUrl = `/api/stream-file?path=${encodeURIComponent(filePath)}`;
        
        return {
            title: 'YouTube Video',
            fileUrl: fileUrl,
            filePath: filePath
        };
    } catch (error) {
        console.error(`File download error: ${error.message}`);
        
        // Clean up any partial file
        if (fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath);
            } catch (cleanupError) {
                console.error(`Error cleaning up file: ${cleanupError.message}`);
            }
        }
        
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
 * Download YouTube music audio
 * @param {string} url - YouTube music URL
 * @returns {Promise<Object>} - Audio data
 */
async function downloadYouTubeMusic(url) {
    try {
        console.log(`Processing YouTube Music URL: ${url}`);
        
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
        
        // Thumbnail will be consistent regardless of download method
        const thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
        
        // APPROACH 1: Try youtube-dl-exec for audio
        try {
            console.log("Attempting to download audio with youtube-dl-exec...");
            const uniqueId = Date.now();
            const fileName = `youtube-music-${videoId}-${uniqueId}.mp3`;
            const filePath = path.join(TEMP_DIR, fileName);
            
            // Define options for youtube-dl-exec
            const options = {
                output: filePath,
                extractAudio: true,
                audioFormat: 'mp3',
                audioQuality: 0,  // Best quality
                noCheckCertificates: true,
                noWarnings: true,
                addHeader: [
                    'referer:youtube.com',
                    'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                ],
            };
            
            await youtubeDl(url, options);
            
            // Check if download was successful
            if (!fs.existsSync(filePath)) {
                throw new Error('Audio file download failed - output file not created');
            }
            
            const stats = fs.statSync(filePath);
            if (stats.size === 0) {
                throw new Error('Downloaded audio file is empty');
            }
            
            console.log(`Successfully downloaded YouTube audio to file (${stats.size} bytes)`);
            
            // Get title information
            const info = await youtubeDl(url, {
                dumpSingleJson: true,
                skipDownload: true,
                noCheckCertificates: true,
                noWarnings: true,
            });
            
            // Create URL for streaming the file
            const fileUrl = `/api/stream-file?path=${encodeURIComponent(filePath)}`;
            
            return {
                title: info.title || 'YouTube Music',
                high: fileUrl,
                low: fileUrl,
                thumbnail: thumbnail,
                source: 'youtube-dl-audio',
                localFilePath: filePath,
                isAudio: true
            };
        } catch (ytdlError) {
            console.error(`youtube-dl-exec audio error: ${ytdlError.message}`);
            console.log("Falling back to other methods...");
            // Continue to next approach
        }
        
        // APPROACH 2: Try ytdown from nayan-videos-downloader
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
                console.warn("Invalid response from ytdown for music:", result);
                throw new Error(result?.msg || "Failed to process YouTube Music URL");
            }
        } catch (ytdownError) {
            console.error(`ytdown music error: ${ytdownError.message}`);
            
            // Try youtube-dl-exec again but with better audio format selection
            try {
                console.log("Attempting to extract audio URL with youtube-dl-exec...");
                
                const info = await youtubeDl(url, {
                    dumpSingleJson: true,
                    noCheckCertificates: true,
                    noWarnings: true,
                });
                
                // Look for audio formats
                const audioFormats = info.formats.filter(f => 
                    f.acodec !== 'none' && 
                    (f.vcodec === 'none' || f.resolution === 'audio only')
                );
                
                if (audioFormats.length > 0) {
                    // Sort by audio quality
                    audioFormats.sort((a, b) => {
                        const bitrateA = a.abr || 0;
                        const bitrateB = b.abr || 0;
                        return bitrateB - bitrateA; // Higher bitrate first
                    });
                    
                    const bestAudioFormat = audioFormats[0];
                    
                    return {
                        title: info.title || 'YouTube Music',
                        high: bestAudioFormat.url,
                        low: bestAudioFormat.url,
                        thumbnail: thumbnail,
                        isAudio: true,
                        source: 'youtube-dl-direct-audio'
                    };
                } else {
                    // If no audio-only formats, use the video with audio
                    const videoWithAudio = info.formats.filter(f => 
                        f.acodec !== 'none'
                    )[0];
                    
                    if (videoWithAudio) {
                        return {
                            title: info.title || 'YouTube Music',
                            high: videoWithAudio.url,
                            low: videoWithAudio.url,
                            thumbnail: thumbnail,
                            isAudio: true,
                            source: 'youtube-dl-video-audio'
                        };
                    }
                    
                    throw new Error('No suitable audio format found');
                }
            } catch (directAudioError) {
                console.error(`Direct audio extraction error: ${directAudioError.message}`);
                
                // Fallback to direct YouTube links for audio
                return {
                    title: 'YouTube Music',
                    high: `https://www.youtube.com/watch?v=${videoId}`,
                    low: `https://www.youtube.com/watch?v=${videoId}`,
                    thumbnail: thumbnail,
                    embed_url: `https://www.youtube.com/embed/${videoId}`,
                    youtube_fallback: true,
                    isAudio: true,
                    source: 'redirect'
                };
            }
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
