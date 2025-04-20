// controllers/youtubeController.js
const axios = require('axios');
const ytDlp = require('yt-dlp-exec');
const ytdl = require('ytdl-core');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Create temp directory
const TEMP_DIR = path.join(__dirname, '../temp');
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

async function downloadYouTubeVideo(url) {
    console.log(`Processing YouTube URL: ${url}`);

    // Normalize mobile URL to desktop
    if (url.includes('m.youtube.com')) {
        url = url.replace(/m\.youtube\.com/, 'www.youtube.com');
        console.log(`Converted to desktop URL: ${url}`);
    }

    // Extract video ID
    let videoId = '';
    const videoIdMatch = url.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})(?:&|\/|$)/);
    if (videoIdMatch && videoIdMatch[1]) {
        videoId = videoIdMatch[1];
        console.log(`Extracted video ID: ${videoId}`);
    } else {
        console.warn("Couldn't extract video ID from URL");
    }

    // --- Attempt 1: Using ytdl-core ---
    try {
        console.log("Attempt 1: Using ytdl-core package");
        
        // Get info with ytdl-core
        const videoInfo = await ytdl.getInfo(url);
        
        if (videoInfo && videoInfo.formats && videoInfo.formats.length > 0) {
            console.log(`ytdl-core found ${videoInfo.formats.length} formats`);
            
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
            const highQuality = formats[0];
            const lowQuality = formats.length > 1 ? 
                formats[Math.min(formats.length - 1, 3)] : // Use the 4th format or last if less than 4
                highQuality;
            
            // Return format expected by your API
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
        console.error(`Attempt 1 failed: ${ytdlError.message}`);
        
        // --- Attempt 2: Alternative ytdl-core approach ---
        try {
            console.log("Attempt 2: Alternate ytdl-core approach");
            
            // Use a different set of options
            const options = { 
                quality: 'highest',
                filter: format => format.container === 'mp4' && format.hasVideo && format.hasAudio
            };
            
            const info = await ytdl.getInfo(url);
            const format = ytdl.chooseFormat(info.formats, options);
            
            if (format) {
                // Find a lower quality format for the "low" option
                const lowOption = info.formats.find(f => 
                    f.container === 'mp4' && 
                    f.hasVideo && 
                    f.hasAudio && 
                    f.height && 
                    f.height < format.height
                ) || format;
                
                return {
                    title: info.videoDetails.title || 'YouTube Video',
                    high: format.url,
                    low: lowOption.url,
                    thumbnail: info.videoDetails.thumbnails.length > 0 
                        ? info.videoDetails.thumbnails[info.videoDetails.thumbnails.length - 1].url 
                        : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                    source: 'ytdl-core-alt'
                };
            }
            
            throw new Error('No format found with alternate ytdl-core approach');
        } catch (altYtdlError) {
            console.error(`Attempt 2 failed: ${altYtdlError.message}`);
            
            // --- Attempt 3: Using yt-dlp ---
            try {
                console.log("Attempt 3: Using yt-dlp with custom options");
                
                // Create a more resilient yt-dlp command with custom options
                // Use different user agents, referrers and format selection
                const options = {
                    format: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
                    noCheckCertificates: true,
                    noWarnings: true,
                    dumpSingleJson: true,
                    addHeader: [
                        'referer:https://www.youtube.com',
                        'user-agent:Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)'
                    ]
                };
                
                const info = await ytDlp(url, options);
                
                if (info && info.formats && info.formats.length > 0) {
                    // Find best video+audio format
                    const videoFormats = info.formats.filter(f => 
                        f.vcodec !== 'none' && 
                        f.acodec !== 'none'
                    );
                    
                    // Sort by quality (resolution)
                    videoFormats.sort((a, b) => {
                        const heightA = a.height || 0;
                        const heightB = b.height || 0;
                        return heightB - heightA;
                    });
                    
                    const bestFormat = videoFormats.length > 0 ? 
                        videoFormats[0] : 
                        info.formats[0];
                    
                    const lowFormat = videoFormats.length > 1 ? 
                        videoFormats[Math.min(videoFormats.length - 1, 2)] : 
                        bestFormat;
                    
                    return {
                        title: info.title || 'YouTube Video',
                        high: bestFormat.url,
                        low: lowFormat.url,
                        thumbnail: info.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                        source: 'yt-dlp'
                    };
                }
                
                throw new Error('No formats found with yt-dlp');
            } catch (ytDlpError) {
                console.error(`Attempt 3 failed: ${ytDlpError.message}`);
                
                // --- Attempt 4: Direct yt-dlp for local file ---
                try {
                    console.log("Attempt 4: Using yt-dlp to download to a local file");
                    
                    const tempFilePath = path.join(TEMP_DIR, `youtube-${Date.now()}.mp4`);
                    
                    // Use a simpler approach for stubborn videos
                    await ytDlp(url, {
                        output: tempFilePath,
                        format: 'best[ext=mp4]/best',
                        limitRate: '5M',
                        retries: 10,
                        fragmentRetries: 10,
                        noCheckCertificates: true,
                        noWarnings: true,
                        addHeader: [
                            'referer:https://www.youtube.com',
                            'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                        ]
                    });
                    
                    if (fs.existsSync(tempFilePath) && fs.statSync(tempFilePath).size > 10000) {
                        console.log(`Successfully downloaded to ${tempFilePath}`);
                        const videoUrl = `/api/stream-file?path=${encodeURIComponent(tempFilePath)}`;
                        
                        return {
                            title: 'YouTube Video',
                            high: videoUrl,
                            low: videoUrl,
                            thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                            localFilePath: tempFilePath,
                            source: 'yt-dlp-file'
                        };
                    }
                    
                    throw new Error('Failed to create a local video file');
                } catch (localFileError) {
                    console.error(`Attempt 4 failed: ${localFileError.message}`);
                    
                    // --- Attempt 5: Last resort with direct YouTube link ---
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
}

// Function for YouTube Music
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
    
    // --- Attempt 1: Use ytdl-core with audio focus ---
    try {
        console.log("Attempt 1: Using ytdl-core for audio extraction");
        
        const info = await ytdl.getInfo(url);
        
        // Filter for audio formats, prioritizing higher quality
        const audioFormats = info.formats
            .filter(format => format.hasAudio)
            .sort((a, b) => {
                // Sort by audio quality (bitrate)
                const bitrateA = a.audioBitrate || 0;
                const bitrateB = b.audioBitrate || 0;
                return bitrateB - bitrateA;
            });
        
        if (audioFormats.length === 0) {
            throw new Error('No audio formats found');
        }
        
        const bestAudio = audioFormats[0];
        
        // Download to a file for better compatibility
        const tempFilePath = path.join(TEMP_DIR, `ytmusic-${Date.now()}.mp3`);
        console.log(`Downloading audio to ${tempFilePath}`);
        
        const writeStream = fs.createWriteStream(tempFilePath);
        
        // Use ytdl to pipe the audio to the file
        ytdl(url, { 
            quality: bestAudio.itag, 
            filter: format => format.hasAudio
        }).pipe(writeStream);
        
        return new Promise((resolve, reject) => {
            writeStream.on('finish', () => {
                console.log(`Audio download complete: ${tempFilePath}`);
                const audioUrl = `/api/stream-file?path=${encodeURIComponent(tempFilePath)}`;
                
                resolve({
                    title: info.videoDetails.title || 'YouTube Music',
                    high: audioUrl,
                    low: audioUrl,
                    thumbnail: info.videoDetails.thumbnails.length > 0 
                        ? info.videoDetails.thumbnails[info.videoDetails.thumbnails.length - 1].url 
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
    } catch (ytdlError) {
        console.error(`Audio ytdl-core attempt failed: ${ytdlError.message}`);
        
        // --- Attempt 2: Use yt-dlp with audio focus ---
        try {
            console.log("Attempt 2: Using yt-dlp for audio extraction");
            
            const tempFilePath = path.join(TEMP_DIR, `ytmusic-${Date.now()}.mp3`);
            
            await ytDlp(url, {
                output: tempFilePath,
                extractAudio: true,
                audioFormat: 'mp3',
                audioQuality: 0,  // best quality
                embedThumbnail: true,
                addMetadata: true,
                noCheckCertificates: true,
                retries: 10,
                fragmentRetries: 10,
                addHeader: [
                    'referer:https://www.youtube.com',
                    'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                ]
            });
            
            if (fs.existsSync(tempFilePath) && fs.statSync(tempFilePath).size > 10000) {
                console.log(`Successfully downloaded audio to ${tempFilePath}`);
                const audioUrl = `/api/stream-file?path=${encodeURIComponent(tempFilePath)}`;
                
                // Extract video ID for thumbnail
                let videoId = '';
                const videoIdMatch = url.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})(?:&|\/|$)/);
                if (videoIdMatch && videoIdMatch[1]) {
                    videoId = videoIdMatch[1];
                }
                
                return {
                    title: 'YouTube Music',
                    high: audioUrl,
                    low: audioUrl,
                    thumbnail: videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '',
                    localFilePath: tempFilePath,
                    isAudio: true,
                    source: 'yt-dlp-audio'
                };
            }
            
            throw new Error('Failed to create local audio file');
        } catch (ytdlpError) {
            console.error(`Audio yt-dlp attempt failed: ${ytdlpError.message}`);
            
            // --- Attempt 3: Just get regular video and mark as audio ---
            console.log("Falling back to regular YouTube video downloader");
            const result = await downloadYouTubeVideo(url);
            result.isAudio = true;
            return result;
        }
    }
}

module.exports = { downloadYouTubeVideo, downloadYouTubeMusic };
