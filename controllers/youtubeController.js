// controllers/youtubeController.js
const axios = require('axios');
const ytDlp = require('yt-dlp-exec');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

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
                thumbnail: info.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
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
                            localFilePath: tempFilePath
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
                        localFilePath: tempFilePath
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
                    youtube_fallback: true
                };
            }
        }
    }
}

module.exports = { downloadYouTubeVideo };