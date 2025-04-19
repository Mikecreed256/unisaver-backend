// controllers/youtubeController.js
const axios = require('axios');
const ytDlp = require('yt-dlp-exec');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const { ytdown } = require("nayan-videos-downloader");

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

    // --- Attempt 0: Using nayan-videos-downloader ---
    try {
        console.log("Attempt 0: Using nayan-videos-downloader package");
        const nayanResult = await ytdown(url);
        
        if (nayanResult && nayanResult.links && nayanResult.links.length > 0) {
            console.log(`nayan-videos-downloader found ${nayanResult.links.length} download links`);
            
            // Filter for video files (mp4)
            const videoLinks = nayanResult.links.filter(link => 
                link.quality && 
                (link.quality.includes('p') || link.quality.includes('HD') || link.quality.includes('SD'))
            );
            
            // If we have video links, use those
            if (videoLinks.length > 0) {
                // Sort by quality (high to low)
                videoLinks.sort((a, b) => {
                    // Extract resolution values for comparison
                    const getResValue = (quality) => {
                        if (!quality) return 0;
                        const match = quality.match(/(\d+)p/);
                        return match ? parseInt(match[1]) : 0;
                    };
                    
                    return getResValue(b.quality) - getResValue(a.quality);
                });
                
                const highQuality = videoLinks[0];
                const lowQuality = videoLinks.length > 1 ? videoLinks[videoLinks.length - 1] : highQuality;
                
                return {
                    title: nayanResult.meta?.title || 'YouTube Video',
                    high: highQuality.url,
                    low: lowQuality.url,
                    thumbnail: nayanResult.meta?.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                    source: 'nayan-videos-downloader'
                };
            }
            
            // If we only have audio links, use those
            const audioLinks = nayanResult.links.filter(link => 
                link.type === 'audio' || link.quality?.toLowerCase().includes('audio')
            );
            
            if (audioLinks.length > 0) {
                // Sort by quality
                audioLinks.sort((a, b) => {
                    const getKbps = (quality) => {
                        if (!quality) return 0;
                        const match = quality.match(/(\d+)kbps/);
                        return match ? parseInt(match[1]) : 0;
                    };
                    
                    return getKbps(b.quality) - getKbps(a.quality);
                });
                
                const highQuality = audioLinks[0];
                const lowQuality = audioLinks.length > 1 ? audioLinks[audioLinks.length - 1] : highQuality;
                
                return {
                    title: nayanResult.meta?.title || 'YouTube Audio',
                    high: highQuality.url,
                    low: lowQuality.url,
                    thumbnail: nayanResult.meta?.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                    isAudio: true,
                    source: 'nayan-videos-downloader'
                };
            }
        }
        
        throw new Error('No links found with nayan-videos-downloader');
    } catch (nayanError) {
        console.error(`Attempt 0 failed: ${nayanError.message}`);
        // Continue to other attempts
    }

    // Update yt-dlp.
    try {
        console.log("Updating yt-dlp...");
        await ytDlp('--update');
        console.log("yt-dlp updated successfully");
    } catch (updateError) {
        console.warn(`yt-dlp update failed: ${updateError.message}`);
    }

    // Create temp directory.
    const TEMP_DIR = path.join(__dirname, '../temp');
    if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
    }

    // --- Attempt 1: JSON metadata extraction ---
    try {
        console.log("Attempt 1: Using yt-dlp to extract metadata as JSON");
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
        throw new Error('No video formats found');
    } catch (ytDlpError) {
        console.error(`Attempt 1 failed: ${ytDlpError.message}`);

        // --- Attempt 2: Try alternative URL formats ---
        try {
            console.log("Attempt 2: Trying alternative URL formats");
            const urlFormats = [
                url,
                `https://www.youtube.com/watch?v=${videoId}`,
                `https://youtu.be/${videoId}`,
                `https://www.youtube.com/embed/${videoId}`
            ];

            for (const testUrl of urlFormats) {
                if (!testUrl) continue;
                console.log(`Trying URL format: ${testUrl}`);
                const tempFilePath = path.join(TEMP_DIR, `youtube-${Date.now()}.mp4`);
                try {
                    await ytDlp(testUrl, {
                        output: tempFilePath,
                        format: 'best[ext=mp4]/best',
                        noCheckCertificates: true,
                        addHeader: [
                            'referer:https://www.youtube.com',
                            'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                        ],
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
                } catch (testUrlError) {
                    console.warn(`URL format failed: ${testUrlError.message}`);
                }
            }
            throw new Error("All alternative URL formats failed");
        } catch (attempt2Error) {
            console.error(`Attempt 2 failed: ${attempt2Error.message}`);

            // --- Attempt 3: Direct shell execution fallback ---
            try {
                console.log("Attempt 3: Direct shell execution fallback using yt-dlp");
                const tempFilePath = path.join(TEMP_DIR, `youtube-${Date.now()}.mp4`);
                // Resolve absolute path for the yt-dlp binary
                const ytDlpPath = path.join(__dirname, '../node_modules/yt-dlp-exec/bin/yt-dlp');
                const command = `"${ytDlpPath}" -f "best[ext=mp4]/best" --no-warnings --no-check-certificate --referer "https://www.youtube.com" --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" -o "${tempFilePath}" "${url}"`;
                console.log(`Executing command: ${command}`);
                await execPromise(command);
                if (fs.existsSync(tempFilePath) && fs.statSync(tempFilePath).size > 10000) {
                    console.log(`Shell command download successful: ${tempFilePath}`);
                    const videoUrl = `/api/stream-file?path=${encodeURIComponent(tempFilePath)}`;
                    return {
                        title: 'YouTube Video',
                        high: videoUrl,
                        low: videoUrl,
                        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                        localFilePath: tempFilePath,
                        source: 'yt-dlp-shell'
                    };
                }
                throw new Error("Shell command did not create a valid file");
            } catch (shellError) {
                console.error(`Attempt 3 failed: ${shellError.message}`);
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
    
    // --- Attempt with nayan-videos-downloader first ---
    try {
        console.log("Attempting to download YouTube Music with nayan-videos-downloader");
        const nayanResult = await ytdown(url);
        
        if (nayanResult && nayanResult.links && nayanResult.links.length > 0) {
            console.log(`Found ${nayanResult.links.length} links`);
            
            // Filter for audio files
            const audioLinks = nayanResult.links.filter(link => 
                link.type === 'audio' || 
                (link.quality && link.quality.toLowerCase().includes('audio')) ||
                (link.quality && link.quality.toLowerCase().includes('kbps'))
            );
            
            if (audioLinks.length > 0) {
                // Sort by quality
                audioLinks.sort((a, b) => {
                    const getKbps = (quality) => {
                        if (!quality) return 0;
                        const match = quality.match(/(\d+)kbps/);
                        return match ? parseInt(match[1]) : 0;
                    };
                    
                    return getKbps(b.quality) - getKbps(a.quality);
                });
                
                const highQuality = audioLinks[0];
                const lowQuality = audioLinks.length > 1 ? audioLinks[audioLinks.length - 1] : highQuality;
                
                return {
                    title: nayanResult.meta?.title || 'YouTube Music',
                    high: highQuality.url,
                    low: lowQuality.url,
                    thumbnail: nayanResult.meta?.thumbnail || '',
                    isAudio: true,
                    source: 'nayan-videos-downloader'
                };
            }
            
            // If no specific audio links found, use any available links
            const highQuality = nayanResult.links[0];
            const lowQuality = nayanResult.links.length > 1 ? nayanResult.links[nayanResult.links.length - 1] : highQuality;
            
            return {
                title: nayanResult.meta?.title || 'YouTube Music',
                high: highQuality.url,
                low: lowQuality.url,
                thumbnail: nayanResult.meta?.thumbnail || '',
                isAudio: true,
                source: 'nayan-videos-downloader'
            };
        }
        
        throw new Error('No links found with nayan-videos-downloader');
    } catch (nayanError) {
        console.error(`YouTube Music nayan-videos-downloader attempt failed: ${nayanError.message}`);
        
        // Fall back to the regular YouTube downloader but with audio-focused options
        try {
            console.log("Falling back to yt-dlp for audio extraction");
            
            // Create temp directory if it doesn't exist
            const TEMP_DIR = path.join(__dirname, '../temp');
            if (!fs.existsSync(TEMP_DIR)) {
                fs.mkdirSync(TEMP_DIR, { recursive: true });
            }
            
            const tempFilePath = path.join(TEMP_DIR, `ytmusic-${Date.now()}.mp3`);
            
            await ytDlp(url, {
                output: tempFilePath,
                extractAudio: true,
                audioFormat: 'mp3',
                audioQuality: 0, // best quality
                noCheckCertificates: true,
                noWarnings: true,
                addHeader: [
                    'referer:https://www.youtube.com',
                    'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                ],
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
            
            throw new Error("Failed to extract audio with yt-dlp");
        } catch (ytdlpError) {
            console.error(`YouTube Music yt-dlp attempt failed: ${ytdlpError.message}`);
            
            // Fall back to the regular video downloader as last resort
            console.log("Falling back to regular YouTube video downloader");
            return downloadYouTubeVideo(url);
        }
    }
}

module.exports = { downloadYouTubeVideo, downloadYouTubeMusic };
