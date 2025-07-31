const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const axios = require('axios');
// Add these lines at the top with your other imports
const youtubeController = require('./controllers/youtubeController');
const facebookController = require('./controllers/facebookController');
// Import from your first codebase - updated for version compatibility
const { alldown, threads } = require('shaon-media-downloader');
const { ttdl, twitter, igdl } = require('btch-downloader');
const { facebook } = require('@mrnima/facebook-downloader');
const fbAlt = require('@xaviabot/fb-downloader');
const { BitlyClient } = require('bitly');
const tinyurl = require('tinyurl');
const config = require('./config');
const puppeteer = require('puppeteer-core');

// Fallback dependencies to maintain compatibility
const youtubeDl = require('youtube-dl-exec');
const fbDownloader = require('fb-downloader');
const fetch = require('node-fetch'); // Note: changed to commonjs style import for compatibility

// Setup app
const app = express();
const PORT = process.env.PORT || 5000;
const bitly = new BitlyClient(config.BITLY_ACCESS_TOKEN || 'your_bitly_token');
// Add this to the top of your server.js file, right after your imports

// Ensure temp directory exists with proper permissions
const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) {
    console.log('Creating temp directory...');
    try {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
        // Set permissive permissions
        fs.chmodSync(TEMP_DIR, 0o777);
        console.log(`Temp directory created at ${TEMP_DIR}`);
    } catch (error) {
        console.error(`Error creating temp directory: ${error.message}`);
    }
}

// Middleware
app.use(cors());
app.use(express.json());

// Increase timeout for external requests
http.globalAgent.maxSockets = 25;
https.globalAgent.maxSockets = 25;
http.globalAgent.keepAlive = true;
https.globalAgent.keepAlive = true;

// Function to shorten URL with fallback
const shortenUrl = async (url) => {
    if (!url) {
        console.warn("Shorten URL: No URL provided.");
        return url;
    }

    try {
        console.info("Shorten URL: Attempting to shorten with Bitly.");
        const response = await bitly.shorten(url);
        console.info("Shorten URL: Successfully shortened with Bitly.");
        return response.link;
    } catch (error) {
        console.warn("Shorten URL: Bitly failed, falling back to TinyURL.");
        try {
            const tinyResponse = await tinyurl.shorten(url);
            console.info("Shorten URL: Successfully shortened with TinyURL.");
            return tinyResponse;
        } catch (fallbackError) {
            console.error("Shorten URL: Both shortening methods failed.");
            return url;
        }
    }
};

// Function to identify platform - UPDATED to include ALL platforms from your Flutter app
const identifyPlatform = (url) => {
    console.info("Platform Identification: Determining the platform for the given URL.");
    const lowerUrl = url.toLowerCase();

    // Social Media Platforms
    if (lowerUrl.includes('instagram.com')) return 'instagram';
    if (lowerUrl.includes('tiktok.com')) return 'tiktok';
    if (lowerUrl.includes('facebook.com') || lowerUrl.includes('fb.watch') || lowerUrl.includes('fb.com')) return 'facebook';
    if (lowerUrl.includes('x.com') || lowerUrl.includes('twitter.com')) return 'twitter';
    if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) return 'youtube';
    if (lowerUrl.includes('pinterest.com') || lowerUrl.includes('pin.it')) return 'pinterest';
    if (lowerUrl.includes('threads.net')) return 'threads';
    if (lowerUrl.includes('reddit.com')) return 'reddit';
    if (lowerUrl.includes('linkedin.com')) return 'linkedin';
    if (lowerUrl.includes('tumblr.com')) return 'tumblr';
    if (lowerUrl.includes('vk.com')) return 'vk';
    if (lowerUrl.includes('bilibili.com')) return 'bilibili';
    if (lowerUrl.includes('snapchat.com')) return 'snapchat';

    // Music Platforms
    if (lowerUrl.includes('spotify.com')) return 'spotify';
    if (lowerUrl.includes('soundcloud.com')) return 'soundcloud';
    if (lowerUrl.includes('bandcamp.com')) return 'bandcamp';
    if (lowerUrl.includes('deezer.com')) return 'deezer';
    if (lowerUrl.includes('music.apple.com')) return 'apple_music';
    if (lowerUrl.includes('music.amazon.com')) return 'amazon_music';
    if (lowerUrl.includes('mixcloud.com')) return 'mixcloud';
    if (lowerUrl.includes('audiomack.com')) return 'audiomack';

    // Video Platforms
    if (lowerUrl.includes('vimeo.com')) return 'vimeo';
    if (lowerUrl.includes('dailymotion.com')) return 'dailymotion';
    if (lowerUrl.includes('twitch.tv')) return 'twitch';

    console.warn("Platform Identification: Unable to identify the platform.");
    return null;
};

// Standardize the response for different platforms
const formatData = async (platform, data) => {
    console.info(`Data Formatting: Formatting data for platform '${platform}'.`);
    const placeholderThumbnail = 'https://via.placeholder.com/300x150';

    switch (platform) {
        case 'youtube': {
            const youtubeData = data.data;
            if (!youtubeData || (!youtubeData.low && !youtubeData.high)) {
                throw new Error("Data Formatting: YouTube data is incomplete or improperly formatted.");
            }
            console.info("Data Formatting: YouTube data formatted successfully.");
            return {
                title: youtubeData.title || 'Untitled Video',
                url: youtubeData.low || youtubeData.high || '',
                thumbnail: youtubeData.thumbnail || placeholderThumbnail,
                sizes: ['Low Quality', 'High Quality'],
                source: platform,
            };
        }

        case 'instagram': {
            if (!data || !data[0]?.url) {
                console.error("Data Formatting: Instagram data is missing or invalid.");
                throw new Error("Instagram data is missing or invalid.");
            }
            console.info("Data Formatting: Instagram data formatted successfully.");
            return {
                title: data[0]?.wm || 'Untitled Media',
                url: data[0]?.url,
                thumbnail: data[0]?.thumbnail || placeholderThumbnail,
                sizes: ['Original Quality'],
                source: platform,
            };
        }

        case 'twitter': {
            const twitterData = data?.data;
            const videoUrl = twitterData?.high || twitterData?.low || '';
            console.info("Data Formatting: Twitter data formatted successfully.");
            return {
                title: twitterData?.title || 'Untitled Video',
                url: videoUrl,
                thumbnail: placeholderThumbnail,
                sizes: twitterData?.high && twitterData?.low ? ['High Quality', 'Low Quality'] : ['Original Quality'],
                source: platform,
            };
        }

        case 'facebook': {
            console.log("Processing Facebook data...");
            // Handle multiple possible Facebook data structures

            // Structure from @mrnima/facebook-downloader
            if (data.result?.links?.HD || data.result?.links?.SD) {
                return {
                    title: data.title || 'Untitled Video',
                    url: data.result.links.HD || data.result.links.SD || '',
                    thumbnail: data.result.thumbnail || placeholderThumbnail,
                    sizes: ['Original Quality'],
                    source: platform,
                };
            }

            // Structure from @xaviabot/fb-downloader
            if (data.hd || data.sd) {
                return {
                    title: data.title || 'Untitled Video',
                    url: data.hd || data.sd || '',
                    thumbnail: data.thumbnail || placeholderThumbnail,
                    sizes: ['Original Quality'],
                    source: platform,
                };
            }

            // Structure from fb-downloader (array)
            if (Array.isArray(data) && data.length > 0 && data[0].url) {
                return {
                    title: 'Facebook Video',
                    url: data[0].url || '',
                    thumbnail: data[0].thumbnail || placeholderThumbnail,
                    sizes: data[0].isHD ? ['HD Quality'] : ['Standard Quality'],
                    source: platform,
                };
            }

            // Structure from fb-downloader (object with urls array)
            if (data.urls && Array.isArray(data.urls) && data.urls.length > 0) {
                return {
                    title: data.title || 'Facebook Video',
                    url: data.urls[0].url || '',
                    thumbnail: data.thumbnail || placeholderThumbnail,
                    sizes: data.urls[0].isHD ? ['HD Quality'] : ['Standard Quality'],
                    source: platform,
                };
            }

            // Generic fallback for any other structure
            return {
                title: data.title || 'Facebook Video',
                url: data.url || data.download_url || data.videoUrl || '',
                thumbnail: data.thumbnail || data.image || placeholderThumbnail,
                sizes: ['Original Quality'],
                source: platform,
            };
        }
        case 'pinterest': {
            console.info("Data Formatting: Pinterest is handled by dedicated endpoint.");
            // Use a generic format in case this is still called somewhere
            return {
                title: data.title || 'Pinterest Image',
                url: data.url || '',
                thumbnail: data.thumbnail || placeholderThumbnail,
                sizes: ['Original Quality'],
                source: platform,
            };
        }
        case 'tiktok':
            console.log("Processing TikTok data...");
            return {
                title: data.title || 'Untitled Video',
                url: data.video?.[0] || '',
                thumbnail: data.thumbnail || placeholderThumbnail,
                sizes: ['Original Quality'],
                audio: data.audio?.[0] || '',
                source: platform,
            };

        case 'threads':
            console.log("Processing Threads data...");
            return {
                title: data.title || 'Untitled Post',
                url: data.data?.video || '',
                thumbnail: data.thumbnail || placeholderThumbnail,
                sizes: ['Original Quality'],
                source: platform,
            };

        // Support for additional platforms with a more generic approach
        case 'spotify':
        case 'soundcloud':
        case 'bandcamp':
        case 'deezer':
        case 'apple_music':
        case 'amazon_music':
        case 'mixcloud':
        case 'audiomack':
            console.log(`Processing ${platform} data...`);
            return {
                title: data.title || `${platform.charAt(0).toUpperCase() + platform.slice(1)} Audio`,
                url: data.url || '',
                thumbnail: data.thumbnail || placeholderThumbnail,
                sizes: ['Original Quality'],
                audio: true,
                source: platform,
            };

        case 'vimeo':
        case 'dailymotion':
        case 'twitch':
        case 'reddit':
        case 'linkedin':
        case 'tumblr':
        case 'vk':
        case 'bilibili':
        case 'snapchat':
            console.log(`Processing ${platform} data...`);
            return {
                title: data.title || `${platform.charAt(0).toUpperCase() + platform.slice(1)} Media`,
                url: data.url || '',
                thumbnail: data.thumbnail || placeholderThumbnail,
                sizes: ['Original Quality'],
                source: platform,
            };

        default:
            console.warn("Data Formatting: Generic formatting applied.");
            return {
                title: data.title || 'Untitled Media',
                url: data.url || '',
                thumbnail: data.thumbnail || placeholderThumbnail,
                sizes: data.sizes?.length > 0 ? data.sizes : ['Original Quality'],
                source: platform,
            };
    }
};

// Function to download large files with streaming
const downloadLargeFile = async (fileUrl, filename) => {
    const writer = fs.createWriteStream(`./downloads/${filename}`);

    try {
        const response = await axios({
            method: 'get',
            url: fileUrl,
            responseType: 'stream',
            timeout: 0,
        });

        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', () => resolve('Download completed'));
            writer.on('error', reject);
        });
    } catch (error) {
        console.error("Error downloading large file:", error);
        throw new Error(`Failed to download the file: ${error.message}`);
    }
};

// Routes
app.get('/', (req, res) => {
    res.send('Social Media Download API is running');
});

// File streaming endpoint for downloaded Twitter videos
app.get('/api/stream-file', (req, res) => {
    const { path: filePath } = req.query;

    if (!filePath) {
        return res.status(400).json({ error: 'File path is required' });
    }

    // Security check to ensure we're only serving files from the temp directory
    if (!filePath.startsWith(TEMP_DIR)) {
        return res.status(403).json({ error: 'Access denied' });
    }

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
        // Handle range requests for video streaming
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(filePath, { start, end });

        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': 'video/mp4',
        });

        file.pipe(res);
    } else {
        // Handle normal requests
        res.writeHead(200, {
            'Content-Length': fileSize,
            'Content-Type': 'video/mp4',
            'Content-Disposition': 'attachment; filename="twitter-video.mp4"'
        });

        fs.createReadStream(filePath).pipe(res);
    }
});

// Enhanced Twitter Handler with direct download approach
async function processTwitterWithYtdl(url) {
    console.log(`Processing Twitter/X URL with youtube-dl: ${url}`);

    try {
        // First, try to fetch the Twitter page to extract videos directly
        console.log('Fetching Twitter page content...');
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch Twitter page: ${response.status}`);
        }

        const html = await response.text();

        // Extract title
        let title = 'Twitter/X Video';
        const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
        if (titleMatch && titleMatch[1]) {
            title = titleMatch[1].replace(' / X', '').replace(' / Twitter', '').trim();
        }

        // First look for video in the page content
        console.log('Looking for video URLs in Twitter page...');

        // Different patterns to find Twitter video URLs
        const videoUrlPatterns = [
            /video_url":"([^"]+)"/,
            /playbackUrl":"([^"]+)"/,
            /video_info\"\:.*?\{\"bitrate\"\:.*?\"url\"\:\"([^\"]+)\"/,
            /"(?:https?:\/\/video\.twimg\.com\/[^"]+\.mp4[^"]*)"/g,
            /https?:\/\/video\.twimg\.com\/[^"'\s]+\.mp4[^"'\s]*/g
        ];

        let videoUrl = null;

        for (const pattern of videoUrlPatterns) {
            if (pattern.global) {
                const matches = html.match(pattern);
                if (matches && matches.length > 0) {
                    videoUrl = matches[0].replace(/"/g, '').replace(/&amp;/g, '&');
                    console.log(`Found Twitter video URL with global pattern: ${videoUrl.substring(0, 100)}...`);
                    break;
                }
            } else {
                const match = pattern.exec(html);
                if (match && match[1]) {
                    videoUrl = match[1]
                        .replace(/\\u002F/g, '/')
                        .replace(/\\\//g, '/')
                        .replace(/\\/g, '')
                        .replace(/&amp;/g, '&');
                    console.log(`Found Twitter video URL with pattern: ${videoUrl.substring(0, 100)}...`);
                    break;
                }
            }
        }

        // If we found a direct video URL, return it
        if (videoUrl) {
            // Extract thumbnail
            let thumbnail = '';
            const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
            if (ogImageMatch && ogImageMatch[1]) {
                thumbnail = ogImageMatch[1];
            }

            return {
                success: true,
                data: {
                    title,
                    url: videoUrl,
                    thumbnail: thumbnail || 'https://via.placeholder.com/300x150',
                    sizes: ['Original Quality'],
                    source: 'twitter',
                }
            };
        }

        // If direct extraction fails, try youtube-dl
        console.log('Direct video extraction failed, trying youtube-dl...');

        const info = await youtubeDl(url, {
            dumpSingleJson: true,
            noCheckCertificates: true,
            noWarnings: true,
            addHeader: [
                'referer:twitter.com',
                'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            ],
        });

        if (info && info.formats && info.formats.length > 0) {
            // Find the best video format
            const formats = info.formats.filter(f => f.vcodec !== 'none' && f.acodec !== 'none');

            // Sort by quality (resolution)
            formats.sort((a, b) => {
                const heightA = a.height || 0;
                const heightB = b.height || 0;
                return heightB - heightA;
            });

            const bestFormat = formats[0] || info.formats[0];

            console.log(`Selected Twitter format: ${bestFormat.format_note || 'Unknown'} (${bestFormat.height || 'Unknown'}p)`);

            return {
                success: true,
                data: {
                    title: info.title || title,
                    url: bestFormat.url,
                    thumbnail: info.thumbnail || 'https://via.placeholder.com/300x150',
                    sizes: ['Original Quality'],
                    source: 'twitter',
                }
            };
        }

        // If we get here, we couldn't find a video
        throw new Error('No video found in Twitter content');

    } catch (error) {
        console.error('Twitter/X download error:', error);

        // One last attempt - try to download directly to file
        try {
            console.log('Attempting direct file download for Twitter...');

            // Create a temporary unique filename
            const tempId = Date.now();
            const tempFilePath = path.join(TEMP_DIR, `twitter-${tempId}.mp4`);

            const ytDlOptions = {
                output: tempFilePath,
                format: 'best[ext=mp4]/best',
                noCheckCertificates: true,
                noWarnings: true,
                addHeader: [
                    'referer:twitter.com',
                    'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
                ],
            };

            console.log(`Downloading Twitter video to ${tempFilePath}`);
            await youtubeDl(url, ytDlOptions);

            // Check if file was created and has content
            if (fs.existsSync(tempFilePath)) {
                const stats = fs.statSync(tempFilePath);
                if (stats.size > 0) {
                    console.log(`Successfully downloaded Twitter video (${stats.size} bytes)`);

                    // Get video URL for streaming
                    const videoUrl = `/api/stream-file?path=${encodeURIComponent(tempFilePath)}`;

                    return {
                        success: true,
                        data: {
                            title: 'Twitter/X Video',
                            url: videoUrl,
                            localFilePath: tempFilePath,
                            thumbnail: 'https://via.placeholder.com/300x150',
                            sizes: ['Original Quality'],
                            source: 'twitter',
                        }
                    };
                } else {
                    fs.unlinkSync(tempFilePath); // Delete empty file
                }
            }

            throw new Error('Failed to download Twitter video to file');
        } catch (finalError) {
            console.error('All Twitter download methods failed:', finalError);
            throw finalError;
        }
    }
}

// API info endpoint
app.get('/api/info', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const platform = identifyPlatform(url);
        console.log(`Detected platform for ${url}: ${platform}`);

        if (!platform) {
            return res.status(400).json({ error: 'Unsupported platform' });
        }

        // Special handling for Pinterest
        if (platform === 'pinterest') {
            console.log('Using dedicated Pinterest endpoint');
            try {
                const pinterestResponse = await fetch(`http://localhost:${PORT}/api/pinterest?url=${encodeURIComponent(url)}`);
                
                if (!pinterestResponse.ok) {
                    throw new Error(`Pinterest endpoint returned status: ${pinterestResponse.status}`);
                }
                
                return res.json(await pinterestResponse.json());
            } catch (pinterestError) {
                console.error('Pinterest endpoint error:', pinterestError);
            }
        }

        // For other platforms, use a simple response format
        const isAudioPlatform = ['spotify', 'soundcloud', 'bandcamp', 'deezer', 'apple_music',
            'amazon_music', 'mixcloud', 'audiomack'].includes(platform);

        const isImage = platform === 'pinterest';

        const formattedResponse = {
            title: `${platform.charAt(0).toUpperCase() + platform.slice(1)} Media`,
            formats: [{
                itag: 'best',
                quality: 'Best Quality',
                mimeType: isImage ? 'image/jpeg' :
                    isAudioPlatform ? 'audio/mp3' : 'video/mp4',
                url: url,
                hasAudio: !isImage,
                hasVideo: !isImage && !isAudioPlatform,
            }],
            thumbnails: [{ url: 'https://via.placeholder.com/300x150' }],
            platform,
            mediaType: isImage ? 'image' :
                isAudioPlatform ? 'audio' : 'video',
            directUrl: `/api/direct?url=${encodeURIComponent(url)}&referer=${platform}.com`
        };

        return res.json(formattedResponse);
    } catch (error) {
        console.error('API info error:', error);
        res.status(500).json({ error: 'Processing failed', details: error.message });
    }
});

// Twitter endpoint
app.get('/api/twitter', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        console.log(`Processing Twitter URL: ${url}`);

        const twData = await processTwitterWithYtdl(url);

        if (twData.success) {
            const hasLocalFile = !!twData.data.localFilePath;

            const formattedResponse = {
                title: twData.data.title,
                formats: [{
                    itag: 'twitter_0',
                    quality: 'Original Quality',
                    mimeType: 'video/mp4',
                    url: twData.data.url,
                    hasAudio: true,
                    hasVideo: true
                }],
                thumbnails: [{ url: twData.data.thumbnail }],
                platform: 'twitter',
                mediaType: 'video',
                directUrl: hasLocalFile ? twData.data.url : `/api/direct?url=${encodeURIComponent(twData.data.url)}`
            };

            return res.json(formattedResponse);
        }

        throw new Error('Twitter processing failed');
    } catch (error) {
        console.error('Twitter endpoint error:', error);
        res.status(500).json({
            error: 'Twitter processing failed',
            details: error.message,
            suggestion: 'Twitter may be restricting this video. Try downloading with a browser extension instead.'
        });
    }
});

// Pinterest endpoint
app.get('/api/pinterest', async (req, res) => {
    try {
        const { url } = req.query;

        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        console.log(`Processing Pinterest URL: ${url}`);

        const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36';

        const response = await fetch(url, {
            headers: {
                'User-Agent': userAgent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch Pinterest page: ${response.status} ${response.statusText}`);
        }

        const html = await response.text();

        // Extract title
        let title = 'Pinterest Media';
        const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
        if (titleMatch && titleMatch[1]) {
            title = titleMatch[1].replace(' | Pinterest', '').trim();
        }

        // Look for images
        let imageUrls = [];

        // Look for high-res originals first
        const originalImages = html.match(/https:\/\/i\.pinimg\.com\/originals\/[a-zA-Z0-9\/\._-]+\.(?:jpg|jpeg|png|gif)/gi);
        if (originalImages && originalImages.length > 0) {
            imageUrls = [...new Set(originalImages)];
        }

        // If no originals, look for specific sizes
        if (imageUrls.length === 0) {
            const sizedImages = html.match(/https:\/\/i\.pinimg\.com\/[0-9]+x(?:\/[a-zA-Z0-9\/\._-]+\.(?:jpg|jpeg|png|gif))/gi);
            if (sizedImages && sizedImages.length > 0) {
                imageUrls = [...new Set(sizedImages)];
            }
        }

        // Fallback to og:image
        if (imageUrls.length === 0) {
            const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
            if (ogImageMatch && ogImageMatch[1]) {
                imageUrls.push(ogImageMatch[1]);
            }
        }

        if (imageUrls.length === 0) {
            return res.status(404).json({
                error: 'No images found on this Pinterest page',
                details: 'Try opening the pin in a browser and copying the URL directly'
            });
        }

        // Remove duplicates and filter out invalid URLs
        imageUrls = [...new Set(imageUrls)].filter(url =>
            url && url.startsWith('http') &&
            /\.(jpg|jpeg|png|gif|webp)/i.test(url)
        );

        // Create format objects for each image
        const formats = imageUrls.map((url, index) => {
            let quality = 'Standard';

            if (url.includes('/originals/')) {
                quality = 'Original';
            } else {
                const sizeMatch = url.match(/\/([0-9]+)x\//);
                if (sizeMatch && sizeMatch[1]) {
                    quality = `${sizeMatch[1]}px`;
                }
            }

            let format = 'jpg';
            if (url.toLowerCase().endsWith('.png')) format = 'png';
            else if (url.toLowerCase().endsWith('.gif')) format = 'gif';
            else if (url.toLowerCase().endsWith('.webp')) format = 'webp';

            return {
                itag: `pin_${index}`,
                quality: quality,
                mimeType: `image/${format}`,
                url: url,
                hasAudio: false,
                hasVideo: false,
                contentLength: 0,
                container: format
            };
        });

        // Create a direct download URL for the best image
        const directDownloadUrl = `/api/direct?url=${encodeURIComponent(imageUrls[0])}&referer=pinterest.com`;

        // Return the image info
        res.json({
            title: title,
            thumbnails: [{ url: imageUrls[0], width: 480, height: 480 }],
            formats: formats,
            platform: 'pinterest',
            mediaType: 'image',
            directUrl: directDownloadUrl
        });

    } catch (error) {
        console.error('Pinterest error:', error);
        res.status(500).json({ error: 'Pinterest processing failed', details: error.message });
    }
});

// Facebook endpoint
app.get('/api/facebook', async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const fbData = await facebookController.downloadFacebookVideo(url);

        // Format response based on which downloader was successful
        let videoUrl = '';
        let title = 'Facebook Video';
        let thumbnail = 'https://via.placeholder.com/300x150';

        if (fbData.result?.links) {
            // @mrnima/facebook-downloader format
            videoUrl = fbData.result.links.HD || fbData.result.links.SD || '';
            title = fbData.title || title;
            thumbnail = fbData.result.thumbnail || thumbnail;
        } else if (fbData.hd || fbData.sd) {
            // @xaviabot/fb-downloader format
            videoUrl = fbData.hd || fbData.sd || '';
            title = fbData.title || title;
            thumbnail = fbData.thumbnail || thumbnail;
        }

        return res.json({
            title: title,
            formats: [{
                itag: 'fb_0',
                quality: 'Original Quality',
                mimeType: 'video/mp4',
                url: videoUrl,
                hasAudio: true,
                hasVideo: true,
            }],
            thumbnails: [{ url: thumbnail }],
            platform: 'facebook',
            mediaType: 'video',
            directUrl: `/api/direct?url=${encodeURIComponent(videoUrl)}&referer=facebook.com`,
        });
    } catch (error) {
        console.error('Facebook endpoint error:', error);
        res.status(500).json({ error: 'Facebook processing failed', details: error.message });
    }
});

// YouTube endpoint
app.get('/api/youtube', async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const ytData = await youtubeController.downloadYouTubeVideo(url);

        return res.json({
            title: ytData.title || 'YouTube Video',
            formats: [{
                itag: 'yt_high',
                quality: 'High Quality',
                mimeType: 'video/mp4',
                url: ytData.high || '',
                hasAudio: true,
                hasVideo: true,
            }],
            thumbnails: [{ url: ytData.thumbnail || '' }],
            platform: 'youtube',
            mediaType: 'video',
            directUrl: ytData.high
        });
    } catch (error) {
        console.error('YouTube endpoint error:', error);
        res.status(500).json({ error: 'YouTube processing failed', details: error.message });
    }
});

// Direct download endpoint
app.get('/api/direct', async (req, res) => {
    let { url, filename } = req.query;
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        console.log(`Processing direct download: ${url}`);

        const downloadResp = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': '*/*',
                'Accept-Language': 'en-US,en;q=0.5',
                'Referer': new URL(url).origin,
            },
            redirect: 'follow',
        });

        if (!downloadResp.ok) {
            throw new Error(`Failed to fetch content: ${downloadResp.status}`);
        }

        const contentType = downloadResp.headers.get('content-type') || 'application/octet-stream';

        let outputFilename = filename || 'download';
        if (!outputFilename.includes('.')) {
            if (contentType.includes('video')) outputFilename += '.mp4';
            else if (contentType.includes('audio')) outputFilename += '.mp3';
            else if (contentType.includes('image')) {
                if (contentType.includes('png')) outputFilename += '.png';
                else if (contentType.includes('gif')) outputFilename += '.gif';
                else outputFilename += '.jpg';
            } else if (url.includes('.mp4')) {
                outputFilename += '.mp4';
            } else if (url.includes('.mp3')) {
                outputFilename += '.mp3';
            } else if (url.includes('.jpg') || url.includes('.jpeg')) {
                outputFilename += '.jpg';
            } else if (url.includes('.png')) {
                outputFilename += '.png';
            } else {
                outputFilename += '.bin';
            }
        }

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${outputFilename}"`);

        downloadResp.body.pipe(res);
    } catch (error) {
        console.error('Direct download error:', error);
        res.status(500).json({ error: 'Direct download failed', details: error.message });
    }
});

// Download endpoint
app.get('/api/download', async (req, res) => {
    try {
        let { url, itag } = req.query;
        
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        // Handle issues with URL formatting (remove any trailing spaces)
        url = url.trim();

        console.log(`Processing download - URL: ${url}, format: ${itag || 'best'}`);

        const uniqueId = Date.now();
        const tempFilePath = path.join(TEMP_DIR, `download-${uniqueId}.mp4`);

        // For direct media URLs, don't use youtube-dl
        const isDirect = url.includes('.mp4') || url.includes('.jpg') || url.includes('.png') ||
            url.includes('.mp3') || url.includes('scontent.cdninstagram.com') ||
            url.includes('fbcdn.net');

        if (isDirect) {
            console.log('Direct media URL detected, using direct download instead of youtube-dl');
            try {
                const downloadResponse = await fetch(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.82 Safari/537.36',
                        'Referer': 'https://www.threads.net/',
                        'Accept': '*/*',
                        'Origin': 'https://www.threads.net'
                    },
                });

                if (!downloadResponse.ok) {
                    throw new Error(`Direct download failed with status: ${downloadResponse.status}`);
                }

                const fileStream = fs.createWriteStream(tempFilePath);
                await new Promise((resolve, reject) => {
                    downloadResponse.body.pipe(fileStream);
                    downloadResponse.body.on('error', reject);
                    fileStream.on('finish', resolve);
                });

                console.log(`Successfully downloaded file to ${tempFilePath}`);
            } catch (directError) {
                console.error('Direct download error:', directError);
                throw directError;
            }
        } else {
            // Use youtube-dl for non-direct URLs
            const options = {
                output: tempFilePath,
                noCheckCertificates: true,
                noWarnings: true,
                preferFreeFormats: true,
                addHeader: [
                    'referer:' + new URL(url).origin,
                    'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                ],
            };

            if (itag && itag !== 'best') {
                options.format = itag;
            }

            try {
                await youtubeDl(url, options);
            } catch (ytdlErr) {
                console.error('youtube-dl download error:', ytdlErr);

                // Attempt direct fetch fallback
                if (!fs.existsSync(tempFilePath)) {
                    console.log('Attempting direct fallback download...');
                    const downloadResponse = await fetch(url, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.82 Safari/537.36',
                            'Referer': new URL(url).origin,
                        },
                    });

                    if (!downloadResponse.ok) {
                        throw new Error(`Direct download failed with status: ${downloadResponse.status}`);
                    }

                    const fileStream = fs.createWriteStream(tempFilePath);
                    await new Promise((resolve, reject) => {
                        downloadResponse.body.pipe(fileStream);
                        downloadResponse.body.on('error', reject);
                        fileStream.on('finish', resolve);
                    });
                }
            }
        }

        if (!fs.existsSync(tempFilePath)) {
            throw new Error('Download failed - file not created');
        }

        const stat = fs.statSync(tempFilePath);

        let contentType = 'application/octet-stream';
        if (tempFilePath.endsWith('.mp4')) contentType = 'video/mp4';
        else if (tempFilePath.endsWith('.mp3')) contentType = 'audio/mpeg';
        else if (tempFilePath.endsWith('.webm')) contentType = 'video/webm';
        else if (url.includes('.jpg') || url.includes('.jpeg')) contentType = 'image/jpeg';
        else if (url.includes('.png')) contentType = 'image/png';

        res.setHeader('Content-Length', stat.size);
        res.setHeader('Content-Type', contentType);
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="download${path.extname(tempFilePath)}"`
        );

        const fileStream = fs.createReadStream(tempFilePath);
        fileStream.pipe(res);

        fileStream.on('end', () => {
            fs.unlink(tempFilePath, (err) => {
                if (err) console.error('Error deleting temp file:', err);
            });
        });
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: 'Download failed', details: error.message });
    }
});

// Audio download endpoint
app.get('/api/audio', async (req, res) => {
    try {
        const { url, itag } = req.query;
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        console.log(
            `Processing audio download - URL: ${url}, format: ${itag || 'best audio'}`
        );

        const uniqueId = Date.now();
        const tempFilePath = path.join(TEMP_DIR, `audio-${uniqueId}.mp3`);

        const options = {
            output: tempFilePath,
            extractAudio: true,
            audioFormat: 'mp3',
            audioQuality: 0,
            noCheckCertificates: true,
            noWarnings: true,
            preferFreeFormats: true,
            addHeader: [
                'referer:' + new URL(url).origin,
                'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            ],
        };

        if (itag && itag !== 'best') {
            options.format = itag;
        } else {
            options.formatSort = 'bestaudio';
        }

        try {
            await youtubeDl(url, options);
        } catch (ytdlErr) {
            console.error('youtube-dl audio download error:', ytdlErr);

            // fallback
            if (!fs.existsSync(tempFilePath)) {
                options.format = 'bestaudio/best';
                await youtubeDl(url, options);
            }
        }

        if (!fs.existsSync(tempFilePath)) {
            throw new Error('Download failed - file not created');
        }

        const stat = fs.statSync(tempFilePath);

        res.setHeader('Content-Length', stat.size);
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Disposition', 'attachment; filename="audio.mp3"');

        const fileStream = fs.createReadStream(tempFilePath);
        fileStream.pipe(res);

        fileStream.on('end', () => {
            fs.unlink(tempFilePath, (err) => {
                if (err) console.error('Error deleting temp file:', err);
            });
        });
    } catch (error) {
        console.error('Audio download error:', error);
        res
            .status(500)
            .json({ error: 'Audio download failed', details: error.message });
    }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Server accessible at http://localhost:${PORT}`);
    console.log(`Temporary directory: ${TEMP_DIR}`);
});
