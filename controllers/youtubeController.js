// controllers/youtubeController.js
const axios = require('axios');
const ytDlp = require('yt-dlp-exec');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// API base URL for the external service
const API_BASE_URL = 'https://savebackend.onrender.com/api';

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

    // --- Attempt 1: Using savebackend API ---
    try {
        console.log("Attempt 1: Using savebackend API");
        
        // Construct the API URL for YouTube info
        const apiUrl = `${API_BASE_URL}/youtube?url=${encodeURIComponent(url)}`;
        console.log(`Calling API: ${apiUrl}`);
        
        // Make the request to the API
        const response = await axios.get(apiUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json'
            },
            timeout: 20000 // 20 seconds timeout
        });
        
        // Check if we got a valid response
        if (response.data && response.status === 200) {
            console.log("savebackend API returned success response");
            
            // Extract the necessary data from the API response
            const data = response.data;
            
            if (data.formats && data.formats.length > 0) {
                // Find the highest quality format with both video and audio
                const highQualityFormat = data.formats.find(f => 
                    f.hasVideo && f.hasAudio && (f.quality?.includes('High') || f.quality?.includes('720'))
                ) || data.formats[0];
                
                return {
                    title: data.title || 'YouTube Video',
                    high: highQualityFormat.url,
                    low: data.formats.length > 1 ? data.formats[1].url : highQualityFormat.url,
                    thumbnail: data.thumbnails && data.thumbnails.length > 0 ? data.thumbnails[0].url : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                    source: 'savebackend-api'
                };
            }
            
            throw new Error('No video formats found in API response');
        }
        
        throw new Error(`API returned status: ${response.status}`);
    } catch (apiError) {
        console.error(`Attempt 1 failed: ${apiError.message}`);
        
        // --- Attempt 2: Call API download endpoint directly ---
        try {
            console.log("Attempt 2: Using savebackend download API endpoint");
            
            // Construct the direct download API URL
            const downloadApiUrl = `${API_BASE_URL}/download?url=${encodeURIComponent(url)}`;
            console.log(`Calling download API: ${downloadApiUrl}`);
            
            // We'll return this URL for the client to use directly
            return {
                title: 'YouTube Video',
                high: downloadApiUrl,
                low: downloadApiUrl,
                thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                source: 'savebackend-download-api'
            };
        } catch (downloadApiError) {
            console.error(`Attempt 2 failed: ${downloadApiError.message}`);
            
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
    
    // For YouTube Music, we want to prioritize audio formats
    
    // --- Attempt 1: Using savebackend API with audio param ---
    try {
        console.log("Attempt 1: Using savebackend API for audio");
        
        // Construct the API URL for YouTube audio
        const apiUrl = `${API_BASE_URL}/audio?url=${encodeURIComponent(url)}`;
        console.log(`Calling audio API: ${apiUrl}`);
        
        // We'll return this directly for the client to use
        return {
            title: 'YouTube Music',
            high: apiUrl,
            low: apiUrl,
            thumbnail: '', // API will handle thumbnails
            isAudio: true,
            source: 'savebackend-audio-api'
        };
    } catch (apiError) {
        console.error(`Audio API attempt failed: ${apiError.message}`);
        
        // Fall back to the regular YouTube video downloader
        console.log("Falling back to regular YouTube video downloader");
        const result = await downloadYouTubeVideo(url);
        result.isAudio = true; // Mark as audio even though it's a video format
        return result;
    }
}

module.exports = { downloadYouTubeVideo, downloadYouTubeMusic };
