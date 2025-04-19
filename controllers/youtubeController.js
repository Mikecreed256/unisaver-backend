// controllers/youtubeController.js
const axios = require('axios');
const ytDlp = require('yt-dlp-exec');
const ytdl = require('ytdl-core');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const { ytdown } = require("nayan-videos-downloader");

// Create temp directory.
const TEMP_DIR = path.join(__dirname, '../temp');
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

async function downloadYouTubeVideo(url) {
    console.log(`Processing YouTube URL: ${url}`);

    // Normalize mobile URL to desktop.
    if (url.includes('m.youtube.com')) {
        url = url.replace(/m\.youtube\.com/, 'www.youtube.com');
        console.log(`Converted to desktop URL: ${url}`);
    }

    // Extract video ID.
    let videoId = '';
    const videoIdMatch = url.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})(?:&|\/|$)/);
    if (videoIdMatch && videoIdMatch[1]) {
        videoId = videoIdMatch[1];
        console.log(`Extracted video ID: ${videoId}`);
    } else {
        console.warn("Couldn't extract video ID from URL");
    }

    // --- Attempt 1: Using nayan-videos-downloader ytdown function ---
    try {
        console.log("Attempt 1: Using nayan-videos-downloader ytdown package");
        const nayanResult = await ytdown(url);
        
        // Check if the result is valid and has media data
        if (nayanResult && nayanResult.status === true && nayanResult.media) {
            console.log("nayan-videos-downloader successfully fetched YouTube data");
            
            return {
                title: nayanResult.media.title || 'YouTube Video',
                high: nayanResult.media.high || nayanResult.media.url || '',
                low: nayanResult.media.low || nayanResult.media.url || nayanResult.media.high || '',
                thumbnail: nayanResult.media.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                source: 'nayan-videos-downloader'
            };
        }
        
        // If we get a response but status is false, throw specific error
        if (nayanResult && nayanResult.status === false) {
            throw new Error(nayanResult.msg || "Service unavailable");
        }
        
        throw new Error('Invalid response from nayan-videos-downloader');
    } catch (nayanError) {
        console.error(`Attempt 1 failed: ${nayanError.message}`);
        
        // --- Attempt 2: Using ytdl-core ---
        try {
            console.log("Attempt 2: Using ytdl-core package");
            
            // First validate if the video is available
            const videoInfo = await ytdl.getInfo(url);
            
            if (videoInfo && videoInfo.formats && videoInfo.formats.length > 0) {
                console.log(`ytdl-core found ${videoInfo.formats.length} formats`);
                
                // Filter and sort formats
                // Get video formats with both audio and video
                let formats = videoInfo.formats.filter(format => 
                    format.hasVideo && format.hasAudio
                );
                
                // If no formats with both video and audio, get the best video and audio separately
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
                const highQuality = formats[0];
                const lowQuality = formats.length > 1 ? 
                    formats[Math.min(formats.length - 1, 3)] : // Use the 4th format or last if less than 4
                    highQuality;
                
                return {
                    title: videoInfo.videoDetails.title || 'YouTube Video',
                    high: highQuality.url,
                    low: lowQuality.url,
                    thumbnail: videoInfo.videoDetails.thumbnails.length > 0 
                        ? videoInfo.videoDetails.thumbnails[videoInfo.videoDetails.thumbnails.length - 1].url 
                        : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                    source: 'ytdl-core'
                };
            }
            
            throw new Error('No formats found with ytdl-core');
        } catch (ytdlError) {
            console.error(`Attempt 2 failed: ${ytdlError.message}`);
            
            // --- Attempt 3: yt-dlp (your existing code) ---
            try {
                console.log("Attempt 3: Using yt-dlp to extract metadata as JSON");
                const info = await ytDlp(url, {
                    dumpSingleJson: true,
                    noCheckCertificates: true,
                    noWarnings: true,
                    preferFreeFormats: true,
                    addHeader: [
                        'referer:https://www.youtube.com',
                        'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    ],
                    verbose: true,
                });

                console.log(`Found ${info.formats?.length || 0} formats`);
                if (info && info.formats && info.formats.length > 0) {
                    const format = info.formats.find(f =>
                        f.format_note === '720p' && f.vcodec !== 'none' && f.acodec !== 'none'
                    ) || info.formats.find(f => f.vcodec !== 'none' && f.acodec !== 'none') || info.formats[0];

                    return {
                        title: info.title || 'YouTube Video',
                        high: format.url,
                        low: info.formats.length > 1 ? info.formats[1].url : format.url,
                        thumbnail: info.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                        source: 'yt-dlp'
                    };
                }
                throw new Error('No video formats found with yt-dlp');
            } catch (ytDlpError) {
                console.error(`Attempt 3 failed: ${ytDlpError.message}`);
                
                // --- Attempt 4: YouTube embed link fallback ---
                console.log("All download attempts failed. Providing YouTube embed link instead.");
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
    }
}

// Add a specific function for YouTube Music
async function downloadYouTubeMusic(url) {
    console.log(`Processing YouTube Music URL: ${url}`);
    
    // Convert youtube music to regular youtube if needed
    if (url.includes('music.youtube.com')) {
        const videoId = url.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})(?:&|\/|$)/);
        if (videoId && videoId[1]) {
            url = `https://www.youtube.com/watch?v=${videoId[1]}`;
            console.log(`Converted to regular YouTube URL: ${url}`);
        }
    }
    
    // --- Attempt 1: Using nayan-videos-downloader ytdown ---
    try {
        console.log("Attempt 1: Using nayan-videos-downloader ytdown for music");
        const nayanResult = await ytdown(url);
        
        if (nayanResult && nayanResult.status === true && nayanResult.media) {
            console.log("nayan-videos-downloader successfully fetched YouTube Music data");
            
            // For YouTube Music, we prefer audio extraction
            // We'll download to a local file to make sure we get audio format
            const tempFilePath = path.join(TEMP_DIR, `ytmusic-${Date.now()}.mp3`);
            
            try {
                // Try to download the audio using axios
                const audioUrl = nayanResult.media.high || nayanResult.media.low || nayanResult.media.url;
                
                if (!audioUrl) {
                    throw new Error("No audio URL available");
                }
                
                console.log(`Downloading audio to ${tempFilePath} from ${audioUrl}`);
                
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
                
                return {
                    title: nayanResult.media.title || 'YouTube Music',
                    high: audioStreamUrl,
                    low: audioStreamUrl,
                    thumbnail: nayanResult.media.thumbnail || '',
                    localFilePath: tempFilePath,
                    isAudio: true,
                    source: 'nayan-videos-downloader-audio'
                };
            } catch (downloadError) {
                console.error(`Error downloading audio: ${downloadError.message}`);
                
                // If download fails, return direct URLs
                return {
                    title: nayanResult.media.title || 'YouTube Music',
                    high: nayanResult.media.high || nayanResult.media.url || '',
                    low: nayanResult.media.low || nayanResult.media.url || nayanResult.media.high || '',
                    thumbnail: nayanResult.media.thumbnail || '',
                    isAudio: true,
                    source: 'nayan-videos-downloader'
                };
            }
        }
        
        throw new Error('Invalid response from nayan-videos-downloader');
    } catch (nayanError) {
        console.error(`YouTube Music nayan-videos-downloader attempt failed: ${nayanError.message}`);
        
        // Fall back to ytdl-core for audio extraction
        try {
            console.log("Attempting to download YouTube Music with ytdl-core");
            
            // Get video info
            const videoInfo = await ytdl.getInfo(url);
            
            if (videoInfo && videoInfo.formats && videoInfo.formats.length > 0) {
                console.log(`Found ${videoInfo.formats.length} formats`);
                
                // Filter for audio-only formats
                const audioFormats = videoInfo.formats.filter(format => 
                    format.hasAudio && !format.hasVideo
                );
                
                // If no audio-only formats, use formats with both audio and video
                const formats = audioFormats.length > 0 ? audioFormats : videoInfo.formats.filter(format => 
                    format.hasAudio
                );
                
                if (formats.length === 0) {
                    throw new Error('No audio formats found');
                }
                
                // Sort by audio quality (highest bitrate first)
                formats.sort((a, b) => {
                    const bitrateA = a.audioBitrate || 0;
                    const bitrateB = b.audioBitrate || 0;
                    return bitrateB - bitrateA;
                });
                
                // Get high and low quality options
                const highQuality = formats[0];
                const lowQuality = formats.length > 1 ? formats[formats.length - 1] : highQuality;
                
                // Download to a local file (recommended for audio)
                const tempFilePath = path.join(TEMP_DIR, `ytmusic-${Date.now()}.mp3`);
                
                console.log(`Downloading audio to ${tempFilePath}`);
                const writeStream = fs.createWriteStream(tempFilePath);
                ytdl(url, { quality: highQuality.itag, filter: 'audioonly' }).pipe(writeStream);
                
                return new Promise((resolve, reject) => {
                    writeStream.on('finish', () => {
                        console.log(`Audio download complete: ${tempFilePath}`);
                        const audioUrl = `/api/stream-file?path=${encodeURIComponent(tempFilePath)}`;
                        resolve({
                            title: videoInfo.videoDetails.title || 'YouTube Music',
                            high: audioUrl,
                            low: audioUrl,
                            thumbnail: videoInfo.videoDetails.thumbnails.length > 0 
                                ? videoInfo.videoDetails.thumbnails[videoInfo.videoDetails.thumbnails.length - 1].url 
                                : '',
                            localFilePath: tempFilePath,
                            isAudio: true,
                            source: 'ytdl-core-audio'
                        });
                    });
                    
                    writeStream.on('error', (err) => {
                        console.error('Error writing audio file:', err);
                        fs.unlink(tempFilePath, () => {});
                        reject(err);
                    });
                });
            }
            
            throw new Error('No formats found with ytdl-core');
        } catch (ytdlError) {
            console.error(`YouTube Music ytdl-core attempt failed: ${ytdlError.message}`);
            
            // Fall back to the regular YouTube downloader as last resort
            console.log("Falling back to regular YouTube video downloader");
            const result = await downloadYouTubeVideo(url);
            result.isAudio = true; // Mark as audio even though it's a video format
            return result;
        }
    }
}

module.exports = { downloadYouTubeVideo, downloadYouTubeMusic };
