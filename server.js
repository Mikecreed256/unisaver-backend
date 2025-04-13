// server.js - Part 1: Core Setup and Utilities

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const axios = require('axios');

// Import controllers
const youtubeController = require('./controllers/youtubeController');
const facebookController = require('./controllers/facebookController');
const pinterestController = require('./controllers/pinterestController');
const twitterController = require('./controllers/twitterController');
const instagramController = require('./controllers/instagramController');
const threadsController = require('./controllers/threadsController');
const tiktokController = require('./controllers/tiktokController');

// Import core dependencies
const { BitlyClient } = require('bitly');
const tinyurl = require('tinyurl');
const config = require('./config');
const fetch = require('node-fetch');

// Setup app
const app = express();
const PORT = process.env.PORT || 5000;
const bitly = new BitlyClient(config.BITLY_ACCESS_TOKEN || 'your_bitly_token');

// Create a temporary directory for downloads
const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
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

// Function to identify platform
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

    try {
        switch (platform) {
            case 'youtube': {
                const youtubeData = data.data || data;
                if (!youtubeData || (!youtubeData.low && !youtubeData.high)) {
                    throw new Error("Data Formatting: YouTube data is incomplete or improperly formatted.");
                }
                console.info("Data Formatting: YouTube data formatted successfully.");
                return {
                    title: youtubeData.title || 'Untitled Video',
                    url: youtubeData.high || youtubeData.low || '',
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
                const twitterData = data?.data || data;
                const videoUrl = twitterData?.high || twitterData?.low || twitterData?.url || '';
                console.info("Data Formatting: Twitter data formatted successfully.");
                return {
                    title: twitterData?.title || 'Untitled Video',
                    url: videoUrl,
                    thumbnail: twitterData?.thumbnail || placeholderThumbnail,
                    sizes: twitterData?.high && twitterData?.low ? ['High Quality', 'Low Quality'] : ['Original Quality'],
                    source: platform,
                };
            }

            case 'facebook': {
                console.log("Processing Facebook data...");

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
                console.info("Data Formatting: Pinterest data formatted successfully.");
                // Handle Pinterest data format from controller
                if (data.imran) {
                    return {
                        title: data.imran?.title || 'Untitled Image',
                        url: data.imran?.url || '',
                        thumbnail: data.imran?.thumbnail || data.imran?.url || placeholderThumbnail,
                        sizes: ['Original Quality'],
                        source: platform,
                    };
                }

                return {
                    title: data.title || 'Untitled Image',
                    url: data.url || '',
                    thumbnail: data.thumbnail || data.url || placeholderThumbnail,
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
                    url: data.data?.video || data.url || '',
                    thumbnail: data.thumbnail || placeholderThumbnail,
                    sizes: ['Original Quality'],
                    source: platform,
                };

            // Generic handler for all other platforms
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
    } catch (error) {
        console.error(`Data formatting error for ${platform}:`, error.message);
        // Return a minimum valid object to prevent further errors
        return {
            title: 'Media',
            url: '',
            thumbnail: placeholderThumbnail,
            sizes: ['Original Quality'],
            source: platform,
            error: error.message
        };
    }
};

// Function to download large files with streaming
const downloadLargeFile = async (fileUrl, filename) => {
    const filePath = path.join(TEMP_DIR, filename);
    const writer = fs.createWriteStream(filePath);

    try {
        const response = await axios({
            method: 'get',
            url: fileUrl,
            responseType: 'stream',
            timeout: 0,
        });

        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', () => resolve(filePath));
            writer.on('error', reject);
        });
    } catch (error) {
        console.error("Error downloading large file:", error);
        throw new Error(`Failed to download the file: ${error.message}`);
    }
};

// Function to validate a video URL
async function validateMediaUrl(url, expectedType = null) {
    console.log(`Validating media URL: ${url}`);

    try {
        // Skip validation for local server URLs
        if (url.startsWith('/api/')) {
            return url;
        }

        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.5',
            'Referer': 'https://www.google.com/',
            'Origin': 'https://www.google.com',
        };

        // Try a HEAD request first
        try {
            const response = await fetch(url, {
                method: 'HEAD',
                headers,
                redirect: 'follow'
            });

            if (response.ok) {
                const contentType = response.headers.get('content-type');
                const contentLength = response.headers.get('content-length');

                console.log(`URL validation: status=${response.status}, type=${contentType}, length=${contentLength}`);

                // If there's a specific type expected, validate it
                if (expectedType && contentType) {
                    if (contentType.includes(expectedType)) {
                        return url;
                    }
                }
                // Otherwise just check if it's a media content type
                else if (contentType) {
                    if (contentType.includes('video') ||
                        contentType.includes('image') ||
                        contentType.includes('audio') ||
                        contentLength && parseInt(contentLength) > 50000) {
                        return url;
                    }
                }

                // If content length is substantial, it's probably valid
                if (contentLength && parseInt(contentLength) > 500000) {
                    return url;
                }
            }
        } catch (headError) {
            console.warn(`HEAD request failed: ${headError.message}`);
        }

        // Fall back to a small GET request
        const rangeResponse = await fetch(url, {
            headers: {
                ...headers,
                'Range': 'bytes=0-8192'  // Get just first 8KB to check signature
            },
            redirect: 'follow'
        });

        if (rangeResponse.ok || rangeResponse.status === 206) {
            return url;
        }

        // For URLs that have media file extensions, return as is
        if (url.match(/\.(mp4|webm|jpg|jpeg|png|gif|mp3|webp)($|\?)/i)) {
            return url;
        }

        console.warn('URL validation: Could not definitively confirm valid media');
        return url; // Return URL anyway, as some platforms' URLs might fail validation but work
    } catch (error) {
        console.error(`URL validation error: ${error.message}`);
        return url; // Return URL as is
    }
}
// server.js - Part 2: API Routes and Server Initialization

// Basic route
app.get('/', (req, res) => {
    res.send('Social Media Download API is running');
});

// File streaming endpoint for downloaded videos
app.get('/api/stream-file', (req, res) => {
    const { path: filePath } = req.query;

    if (!filePath) {
        return res.status(400).json({ error: 'File path is required' });
    }

    // Security check to ensure we're only serving files from the temp directory
    if (!filePath.startsWith(TEMP_DIR) && !filePath.includes('/temp/')) {
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
            'Content-Disposition': 'attachment; filename="video.mp4"'
        });

        fs.createReadStream(filePath).pipe(res);
    }
});

// Main function to handle media download
app.post('/api/download-media', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        console.warn("Download Media: No URL provided in the request.");
        return res.status(400).json({ error: 'No URL provided' });
    }

    const platform = identifyPlatform(url);

    if (!platform) {
        console.warn("Download Media: Unsupported platform for the given URL.");
        return res.status(400).json({ error: 'Unsupported platform' });
    }

    try {
        console.info(`Download Media: Fetching data for platform '${platform}'.`);
        let result;

        // Use appropriate controller based on platform
        switch (platform) {
            case 'youtube':
                result = await youtubeController.downloadYouTubeVideo(url);
                break;
            case 'facebook':
                result = await facebookController.downloadFacebookVideo(url);
                break;
            case 'pinterest':
                result = await pinterestController.downloadPinterestMedia(url);
                break;
            case 'twitter':
                result = await twitterController.downloadTwitterVideo(url);
                break;
            case 'instagram':
                result = await instagramController.downloadInstagramMedia(url);
                break;
            case 'threads':
                result = await threadsController.downloadThreadsMedia(url);
                break;
            case 'tiktok':
                result = await tiktokController.downloadTikTokVideo(url);
                break;
            default:
                // Generic handler for other platforms
                result = await processGenericUrlWithYtdl(url, platform);
                break;
        }

        if (!result) {
            throw new Error(`No data returned for ${platform}`);
        }

        // Format the data consistently
        const formattedData = await formatData(platform, result);

        // Validate URLs before returning
        if (formattedData.url) {
            formattedData.url = await validateMediaUrl(formattedData.url);
        }

        if (formattedData.thumbnail) {
            formattedData.thumbnail = await validateMediaUrl(formattedData.thumbnail, 'image');
        }

        console.info("Download Media: Media successfully processed.");

        // Return successful response
        res.status(200).json({
            success: true,
            data: formattedData,
        });
    } catch (error) {
        console.error(`Download Media: Error occurred - ${error.message}`);
        res.status(500).json({
            error: `Failed to download media from ${platform}`,
            details: error.message,
            platform
        });
    }
});

// API info endpoint for platform detection
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

        // Use controllers to get data
        let data;
        switch (platform) {
            case 'youtube':
                data = await youtubeController.downloadYouTubeVideo(url);
                break;
            case 'facebook':
                data = await facebookController.downloadFacebookVideo(url);
                break;
            case 'pinterest':
                data = await pinterestController.downloadPinterestMedia(url);
                break;
            case 'twitter':
                data = await twitterController.downloadTwitterVideo(url);
                break;
            case 'instagram':
                data = await instagramController.downloadInstagramMedia(url);
                break;
            case 'threads':
                data = await threadsController.downloadThreadsMedia(url);
                break;
            case 'tiktok':
                data = await tiktokController.downloadTikTokVideo(url);
                break;
            default:
                // Generic handler
                data = await processGenericUrlWithYtdl(url, platform);
                break;
        }

        // Format the response for the Flutter app
        const formattedData = await formatData(platform, data);

        const isAudioPlatform = ['spotify', 'soundcloud', 'bandcamp', 'deezer', 'apple_music',
            'amazon_music', 'mixcloud', 'audiomack'].includes(platform);

        const isImage = platform === 'pinterest' ||
            (formattedData.url && (formattedData.url.includes('.jpg') ||
                formattedData.url.includes('.jpeg') ||
                formattedData.url.includes('.png')));

        const response = {
            title: formattedData.title,
            formats: [{
                itag: 'best',
                quality: 'Best Quality',
                mimeType: isImage ? 'image/jpeg' :
                    isAudioPlatform ? 'audio/mp3' : 'video/mp4',
                url: formattedData.url,
                hasAudio: !isImage,
                hasVideo: !isImage && !isAudioPlatform,
            }],
            thumbnails: [{ url: formattedData.thumbnail }],
            platform,
            mediaType: isImage ? 'image' :
                isAudioPlatform ? 'audio' : 'video',
        };

        return res.json(response);
    } catch (error) {
        console.error('API info error:', error);
        res.status(500).json({
            error: 'Failed to get media info',
            details: error.message,
            suggestion: 'Try again later or with a different URL'
        });
    }
});

// Platform-specific endpoints

// YouTube endpoint
app.get('/api/youtube', async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const ytData = await youtubeController.downloadYouTubeVideo(url);

        // Format the response
        return res.json({
            title: ytData.title || 'YouTube Video',
            formats: [{
                itag: 'yt_high',
                quality: 'High Quality',
                mimeType: 'video/mp4',
                url: ytData.high || ytData.low || '',
                hasAudio: true,
                hasVideo: true,
            }],
            thumbnails: [{ url: ytData.thumbnail || 'https://via.placeholder.com/300x150' }],
            platform: 'youtube',
            mediaType: 'video',
        });
    } catch (error) {
        console.error('YouTube endpoint error:', error);
        res.status(500).json({ error: 'YouTube processing failed', details: error.message });
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

// Pinterest endpoint
app.get('/api/pinterest', async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const pinterestData = await pinterestController.downloadPinterestMedia(url);

        if (!pinterestData.imran || !pinterestData.imran.url) {
            throw new Error('Invalid Pinterest data returned');
        }

        return res.json({
            title: pinterestData.imran.title || 'Pinterest Image',
            formats: [{
                itag: 'pin_0',
                quality: 'Original Quality',
                mimeType: pinterestData.imran.isVideo ? 'video/mp4' : 'image/jpeg',
                url: pinterestData.imran.url,
                hasAudio: pinterestData.imran.isVideo,
                hasVideo: pinterestData.imran.isVideo,
            }],
            thumbnails: [{ url: pinterestData.imran.thumbnail || pinterestData.imran.url }],
            platform: 'pinterest',
            mediaType: pinterestData.imran.isVideo ? 'video' : 'image',
        });
    } catch (error) {
        console.error('Pinterest endpoint error:', error);
        res.status(500).json({ error: 'Pinterest processing failed', details: error.message });
    }
});

// Twitter endpoint
app.get('/api/twitter', async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const twitterData = await twitterController.downloadTwitterVideo(url);

        return res.json({
            title: twitterData.title || 'Twitter Video',
            formats: [{
                itag: 'twitter_0',
                quality: 'Original Quality',
                mimeType: 'video/mp4',
                url: twitterData.url,
                hasAudio: true,
                hasVideo: true
            }],
            thumbnails: [{ url: twitterData.thumbnail || 'https://via.placeholder.com/300x150' }],
            platform: 'twitter',
            mediaType: 'video',
            directUrl: `/api/direct?url=${encodeURIComponent(twitterData.url)}`
        });
    } catch (error) {
        console.error('Twitter endpoint error:', error);
        res.status(500).json({ error: 'Twitter processing failed', details: error.message });
    }
});

// Threads endpoint
app.get('/api/threads', async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const threadsData = await threadsController.downloadThreadsMedia(url);
        const isVideo = threadsData.url && threadsData.url.includes('.mp4');

        return res.json({
            title: threadsData.title || 'Threads Post',
            formats: [{
                itag: 'threads_0',
                quality: 'Original Quality',
                mimeType: isVideo ? 'video/mp4' : 'image/jpeg',
                url: threadsData.url,
                hasAudio: isVideo,
                hasVideo: isVideo,
            }],
            thumbnails: [{ url: threadsData.thumbnail || 'https://via.placeholder.com/300x150' }],
            platform: 'threads',
            mediaType: isVideo ? 'video' : 'image',
        });
    } catch (error) {
        console.error('Threads endpoint error:', error);
        res.status(500).json({ error: 'Threads processing failed', details: error.message });
    }
});

// TikTok endpoint
app.get('/api/tiktok', async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const tiktokData = await tiktokController.downloadTikTokVideo(url);

        return res.json({
            title: tiktokData.title || 'TikTok Video',
            formats: [{
                itag: 'tiktok_0',
                quality: 'Original Quality',
                mimeType: 'video/mp4',
                url: tiktokData.url,
                hasAudio: true,
                hasVideo: true,
            }],
            thumbnails: [{ url: tiktokData.thumbnail || 'https://via.placeholder.com/300x150' }],
            platform: 'tiktok',
            mediaType: 'video',
        });
    } catch (error) {
        console.error('TikTok endpoint error:', error);
        res.status(500).json({ error: 'TikTok processing failed', details: error.message });
    }
});

// Instagram endpoint
app.get('/api/instagram', async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const igData = await instagramController.downloadInstagramMedia(url);
        const isVideo = igData.url && igData.url.includes('.mp4');

        return res.json({
            title: igData.title || 'Instagram Media',
            formats: [{
                itag: 'ig_0',
                quality: 'Original Quality',
                mimeType: isVideo ? 'video/mp4' : 'image/jpeg',
                url: igData.url,
                hasAudio: isVideo,
                hasVideo: isVideo,
            }],
            thumbnails: [{ url: igData.thumbnail || igData.url || 'https://via.placeholder.com/300x150' }],
            platform: 'instagram',
            mediaType: isVideo ? 'video' : 'image',
        });
    } catch (error) {
        console.error('Instagram endpoint error:', error);
        res.status(500).json({ error: 'Instagram processing failed', details: error.message });
    }
});

// Direct download endpoint
app.get('/api/direct', async (req, res) => {
    const { url, filename, referer } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        console.log(`Processing direct download: ${url}`);

        // Setup proper headers
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.5',
            'Referer': referer || new URL(url).origin,
        };

        // Special handling for Facebook URLs
        if (url.includes('facebook.com') || url.includes('fb.watch') || url.includes('fbcdn.net')) {
            headers['Referer'] = 'https://www.facebook.com/';
            headers['Origin'] = 'https://www.facebook.com';
            headers['Sec-Fetch-Dest'] = 'video';
        }

        const downloadResp = await fetch(url, {
            headers,
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

        // Handle issues with URL formatting
        url = url.trim();

        // Determine platform
        const platform = identifyPlatform(url);

        // For direct media URLs, use direct download
        const isDirect = url.includes('.mp4') || url.includes('.jpg') || url.includes('.png') ||
            url.includes('.mp3') || url.includes('fbcdn.net');

        const uniqueId = Date.now();
        const tempFilePath = path.join(TEMP_DIR, `download-${uniqueId}.mp4`);

        try {
            if (isDirect) {
                // Direct download
                console.log('Direct media URL detected, using direct download');

                // Set appropriate headers based on platform
                const headers = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.82 Safari/537.36',
                    'Accept': '*/*'
                };

                if (platform === 'facebook' || url.includes('fbcdn.net')) {
                    headers['Referer'] = 'https://www.facebook.com/';
                    headers['Origin'] = 'https://www.facebook.com';
                } else if (platform === 'instagram') {
                    headers['Referer'] = 'https://www.instagram.com/';
                    headers['Origin'] = 'https://www.instagram.com';
                } else if (platform === 'threads') {
                    headers['Referer'] = 'https://www.threads.net/';
                    headers['Origin'] = 'https://www.threads.net';
                } else if (platform === 'tiktok') {
                    headers['Referer'] = 'https://www.tiktok.com/';
                    headers['Origin'] = 'https://www.tiktok.com';
                } else if (platform === 'twitter') {
                    headers['Referer'] = 'https://twitter.com/';
                    headers['Origin'] = 'https://twitter.com';
                } else if (platform === 'pinterest') {
                    headers['Referer'] = 'https://www.pinterest.com/';
                    headers['Origin'] = 'https://www.pinterest.com';
                } else {
                    headers['Referer'] = new URL(url).origin;
                }

                const downloadResponse = await fetch(url, {
                    headers,
                    redirect: 'follow'
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
            } else {
                // Use appropriate controller based on platform
                let data;
                switch (platform) {
                    case 'youtube':
                        data = await youtubeController.downloadYouTubeVideo(url);
                        break;
                    case 'facebook':
                        data = await facebookController.downloadFacebookVideo(url);
                        break;
                    case 'pinterest':
                        data = await pinterestController.downloadPinterestMedia(url);
                        break;
                    case 'twitter':
                        data = await twitterController.downloadTwitterVideo(url);
                        break;
                    case 'instagram':
                        data = await instagramController.downloadInstagramMedia(url);
                        break;
                    case 'threads':
                        data = await threadsController.downloadThreadsMedia(url);
                        break;
                    case 'tiktok':
                        data = await tiktokController.downloadTikTokVideo(url);
                        break;
                    default:
                        // Use youtube-dl-exec for other platforms
                        break;
                }

                // If controller returned a valid URL, download it
                if (data && data.url) {
                    const directUrl = data.url;

                    // Download the file
                    const downloadResponse = await fetch(directUrl, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.82 Safari/537.36',
                            'Referer': new URL(url).origin,
                        },
                        redirect: 'follow'
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
                } else {
                    throw new Error('No direct URL available for download');
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
        } catch (downloadError) {
            console.error('Download error:', downloadError);

            // Fallback to redirecting to direct URL
            try {
                let data;
                switch (platform) {
                    case 'youtube':
                        data = await youtubeController.downloadYouTubeVideo(url);
                        break;
                    case 'facebook':
                        data = await facebookController.downloadFacebookVideo(url);
                        break;
                    case 'pinterest':
                        data = await pinterestController.downloadPinterestMedia(url);
                        break;
                    case 'twitter':
                        data = await twitterController.downloadTwitterVideo(url);
                        break;
                    case 'instagram':
                        data = await instagramController.downloadInstagramMedia(url);
                        break;
                    case 'threads':
                        data = await threadsController.downloadThreadsMedia(url);
                        break;
                    case 'tiktok':
                        data = await tiktokController.downloadTikTokVideo(url);
                        break;
                    default:
                        throw new Error('Platform not supported');
                }

                if (data && (data.url || data.high || data.low || (data.imran && data.imran.url))) {
                    const directUrl = data.url || data.high || data.low || (data.imran ? data.imran.url : null);

                    if (directUrl) {
                        console.log(`Redirecting to direct URL: ${directUrl}`);
                        return res.redirect(`/api/direct?url=${encodeURIComponent(directUrl)}&referer=${platform}.com`);
                    }
                }

                throw new Error('No direct URL available');
            } catch (fallbackError) {
                console.error('Fallback redirect failed:', fallbackError);
                res.status(500).json({ error: 'Download failed', details: downloadError.message });
            }
        }
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

        console.log(`Processing audio download - URL: ${url}, format: ${itag || 'best audio'}`);

        const uniqueId = Date.now();
        const tempFilePath = path.join(TEMP_DIR, `audio-${uniqueId}.mp3`);

        // Use appropriate controller based on platform
        const platform = identifyPlatform(url);

        try {
            // For youtube, use special audio extraction
            if (platform === 'youtube') {
                const ytdlpPath = require('yt-dlp-exec').path;
                const { exec } = require('child_process');
                const util = require('util');
                const execPromise = util.promisify(exec);

                const command = `"${ytdlpPath}" -x --audio-format mp3 --audio-quality 0 -o "${tempFilePath}" "${url}"`;
                console.log(`Executing: ${command}`);

                await execPromise(command);

                if (!fs.existsSync(tempFilePath)) {
                    throw new Error('Audio extraction failed');
                }
            } else {
                // For other platforms, try to get the URL and download it
                let data;
                switch (platform) {
                    case 'spotify':
                    case 'soundcloud':
                        // Use your audio platform controllers here
                        break;
                    default:
                        // For video platforms, try to extract audio from video
                        data = await processGenericUrlWithYtdl(url, platform);
                        break;
                }

                if (data && data.url) {
                    const directUrl = data.url;

                    // Download the file
                    const ytdlpPath = require('yt-dlp-exec').path;
                    const { exec } = require('child_process');
                    const util = require('util');
                    const execPromise = util.promisify(exec);

                    const command = `"${ytdlpPath}" -x --audio-format mp3 --audio-quality 0 -o "${tempFilePath}" "${directUrl}"`;
                    console.log(`Executing: ${command}`);

                    await execPromise(command);
                } else {
                    throw new Error('No direct URL available for audio extraction');
                }
            }

            if (!fs.existsSync(tempFilePath)) {
                throw new Error('Audio extraction failed - file not created');
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
            console.error('Audio extraction error:', error);
            res.status(500).json({
                error: 'Audio extraction failed',
                details: error.message,
                suggestion: 'Try downloading the video instead and extracting audio locally.'
            });
        }
    } catch (error) {
        console.error('Audio download error:', error);
        res.status(500).json({ error: 'Audio download failed', details: error.message });
    }
});

// Generic handler with youtube-dl
async function processGenericUrlWithYtdl(url, platform) {
    console.log(`Processing ${platform} URL with youtube-dl: ${url}`);

    try {
        const ytDlp = require('yt-dlp-exec');

        const info = await ytDlp(url, {
            dumpSingleJson: true,
            noCheckCertificates: true,
            noWarnings: true,
        });

        if (info && info.formats && info.formats.length > 0) {
            // Select appropriate format based on platform type
            let format;
            const isAudioPlatform = ['spotify', 'soundcloud', 'bandcamp', 'deezer', 'apple_music',
                'amazon_music', 'mixcloud', 'audiomack'].includes(platform);

            if (isAudioPlatform) {
                // For audio platforms, select an audio-only format if available
                format = info.formats.find(f =>
                    f.acodec !== 'none' && f.vcodec === 'none'
                ) || info.formats.find(f => f.acodec !== 'none') || info.formats[0];
            } else {
                // For video platforms, select a video format with audio
                format = info.formats.find(f =>
                    f.format_note === '720p' && f.vcodec !== 'none' && f.acodec !== 'none'
                ) || info.formats.find(f =>
                    f.vcodec !== 'none' && f.acodec !== 'none'
                ) || info.formats[0];
            }

            return {
                title: info.title || `${platform} Media`,
                url: format.url,
                thumbnail: info.thumbnail || 'https://via.placeholder.com/300x150',
                isAudio: isAudioPlatform,
            };
        }

        throw new Error('No media formats found');
    } catch (error) {
        console.error(`${platform} download error:`, error);
        throw error;
    }
}

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Server accessible at http://localhost:${PORT}`);
    console.log(`Temporary directory: ${TEMP_DIR}`);
});