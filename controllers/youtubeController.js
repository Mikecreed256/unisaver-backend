// controllers/youtubeController.js
const fs = require('fs');
const path = require('path');
const querystring = require('querystring');
const axios = require('axios');
const ytdl = require('ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
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
        while (calls.length > 0 && calls[0] < now - interval) {
            calls.shift();
        }
        if (calls.length >= maxCalls) {
            const oldest = calls[0];
            const waitTime = (oldest + interval) - now;
            await new Promise(r => setTimeout(r, waitTime));
        }
        calls.push(now);
        return fn();
    };
};
const youtubeRateLimiter = createRateLimiter(5, 10000); // Max 5 calls per 10 seconds

/**
 * Fallback: raw get_video_info parser
 */
async function rawGetVideoInfo(videoId) {
    const api = `https://www.youtube.com/get_video_info?video_id=${videoId}&html5=1&pbj=1`;
    const res = await axios.get(api, {
        headers: {
            'User-Agent': 'Mozilla/5.0',
            'Referer': `https://www.youtube.com/watch?v=${videoId}`
        }
    });
    const data = querystring.parse(res.data);
    if (!data.player_response) throw new Error('No player_response in get_video_info');
    const player = JSON.parse(data.player_response);
    return {
        title: player.videoDetails.title,
        author: player.videoDetails.author,
        length: player.videoDetails.lengthSeconds,
        thumbnail: player.videoDetails.thumbnails.slice(-1)[0].url,
        formats: player.streamingData.formats
    };
}

/**
 * Enhanced YouTube video downloader with multiple fallback methods
 */
async function downloadYouTubeVideo(url) {
    console.log(`Downloading YouTube video: ${url}`);
    try {
        // Method 1: ytdl-core
        return await youtubeRateLimiter(async () => {
            try {
                console.log('Attempting method 1: ytdl-core');
                const info = await ytdl.getInfo(url);
                const formats = info.formats.filter(f => f.hasVideo && f.hasAudio);
                formats.sort((a, b) => (b.height || 0) - (a.height || 0));
                const high = formats.find(f => f.height >= 720) || formats[0];
                const low  = formats.reverse().find(f => f.height <= 360) || formats[formats.length - 1];
                const thumb = info.videoDetails.thumbnails.slice(-1)[0].url;
                return {
                    success: true,
                    title: info.videoDetails.title,
                    high:  high.url,
                    low:   low.url,
                    thumbnail: thumb,
                    videoId: info.videoDetails.videoId,
                    author: info.videoDetails.author.name,
                    length: info.videoDetails.lengthSeconds,
                    source: 'ytdl-core'
                };
            } catch (err) {
                console.error('Method 1 failed:', err.stack);
                throw err;
            }
        });
        } catch (e2) {
            console.error('Method 2 failed:', e2.stack);
            // Method 3: youtube-dl-exec
            try {
                console.log('Attempting method 3: youtube-dl-exec');
                const info = await youtubeDl(url, {
                    dumpSingleJson: true,
                    noCheckCertificates: true,
                    noWarnings: true,
                    preferFreeFormats: true,
                    addHeader: [
                        'referer:youtube.com',
                        'user-agent:Mozilla/5.0'
                    ]
                });
                const fmts = info.formats.filter(f => f.vcodec !== 'none' && f.acodec !== 'none');
                fmts.sort((a, b) => (b.height || 0) - (a.height || 0));
                const high = fmts.find(f => f.height >= 720) || fmts[0];
                const low  = fmts.reverse().find(f => f.height <= 480) || fmts[fmts.length - 1];
                return {
                    success: true,
                    title: info.title,
                    high:  high.url,
                    low:   low.url,
                    thumbnail: info.thumbnail,
                    videoId: url.includes('v=') ? url.split('v=')[1].split('&')[0] : url.split('/').pop(),
                    author: info.uploader,
                    length: info.duration,
                    source: 'youtube-dl-exec'
                };
            } catch (e3) {
                console.error('Method 3 failed:', e3.stack);
                // Method 4: raw get_video_info
                try {
                    console.log('Attempting method 4: raw get_video_info');
                    const videoId = url.includes('v=') ? url.split('v=')[1].split('&')[0] : url.split('/').pop();
                    const info = await rawGetVideoInfo(videoId);
                    return {
                        success: true,
                        title: info.title,
                        high:  info.formats[0].url,
                        low:   info.formats[info.formats.length - 1].url,
                        thumbnail: info.thumbnail,
                        videoId,
                        source: 'get_video_info'
                    };
                } catch (e4) {
                    console.error('Method 4 failed:', e4.stack);
                    throw new Error(`All methods failed: ${e4.message}`);
                }
            }
        }
    }


/** Download YouTube as MP3 (unchanged) **/
async function downloadYouTubeMusic(url) { /* ... */ }

/** Get video qualities (unchanged) **/
async function getVideoQualities(url) { /* ... */ }

// Cleanup scheduler (unchanged)
function scheduleCleanup(maxAge = 24 * 60 * 60 * 1000) { /* ... */ }
scheduleCleanup();

module.exports = {
    downloadYouTubeVideo,
    downloadYouTubeMusic,
    getVideoQualities
};
