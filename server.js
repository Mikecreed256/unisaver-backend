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
// Enhanced generic handler with youtube-dl - ENHANCED for additional platforms
// Replace your existing processGenericUrlWithYtdl function with this improved version
async function processGenericUrlWithYtdl(url, platform) {
    console.log(`Processing ${platform} URL with youtube-dl: ${url}`);

    // Verify we're not trying to process just a homepage URL
    try {
        const uri = new URL(url);
        if (uri.pathname === '/' || uri.pathname === '') {
            throw new Error(`URL appears to be just the ${platform} homepage, not a specific content URL`);
        }
    } catch (urlError) {
        console.warn(`URL parsing error: ${urlError.message}`);
        // Continue anyway, as the error might be unrelated to the path
    }

    try {
        // Use much simpler, universally compatible options for youtube-dl
        const ytdlOptions = {
            dumpSingleJson: true,
            noCheckCertificates: true,
            noWarnings: true,
            addHeader: [
                'referer:' + new URL(url).origin,
                'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            ],
        };

        // Use simpler format string that works on all versions
        if (['spotify', 'soundcloud', 'bandcamp', 'deezer', 'apple_music',
             'amazon_music', 'mixcloud', 'audiomack'].includes(platform)) {
            // For audio platforms
            ytdlOptions.extractAudio = true;
            ytdlOptions.audioFormat = 'mp3';
            ytdlOptions.format = 'bestaudio';  // Simple format string
        } else {
            // For video platforms
            ytdlOptions.format = 'best';  // Simple format string
        }

        console.log(`Executing youtube-dl for ${platform} with format: ${ytdlOptions.format}`);
        const info = await youtubeDl(url, ytdlOptions);

        // Now process the results based on platform type
        const isAudioPlatform = ['spotify', 'soundcloud', 'bandcamp', 'deezer', 'apple_music',
            'amazon_music', 'mixcloud', 'audiomack'].includes(platform);

        // Extract the URL based on the platform type
        let mediaUrl = '';
        let quality = 'Standard Quality';

        if (isAudioPlatform) {
            // For audio platforms, get the best audio URL
            if (info.url) {
                mediaUrl = info.url;
            } else if (info.formats && info.formats.length > 0) {
                // Try to find audio-focused format
                const audioFormats = info.formats
                    .filter(f => f.acodec !== 'none')
                    .sort((a, b) => {
                        const bitrateA = a.abr || 0;
                        const bitrateB = b.abr || 0;
                        return bitrateB - bitrateA;  // Sort by bitrate, highest first
                    });

                if (audioFormats.length > 0) {
                    const bestFormat = audioFormats[0];
                    mediaUrl = bestFormat.url;
                    if (bestFormat.abr) {
                        quality = `${bestFormat.abr}kbps`;
                    }
                } else if (info.formats.length > 0) {
                    // If no audio-only formats, use the first available
                    mediaUrl = info.formats[0].url;
                }
            }
        } else {
            // For video platforms, get the best video URL
            if (info.url) {
                mediaUrl = info.url;
            } else if (info.formats && info.formats.length > 0) {
                // Try to find a good quality video+audio format
                const videoFormats = info.formats
                    .filter(f => f.vcodec !== 'none' && f.acodec !== 'none')
                    .sort((a, b) => {
                        const heightA = a.height || 0;
                        const heightB = b.height || 0;
                        return heightB - heightA;  // Sort by height/resolution, highest first
                    });

                if (videoFormats.length > 0) {
                    const bestFormat = videoFormats[0];
                    mediaUrl = bestFormat.url;
                    if (bestFormat.height) {
                        quality = `${bestFormat.height}p`;
                    } else if (bestFormat.format_note) {
                        quality = bestFormat.format_note;
                    }
                } else if (info.formats.length > 0) {
                    // If no video formats with audio, use the first available
                    mediaUrl = info.formats[0].url;
                }
            }
        }

        if (!mediaUrl) {
            throw new Error(`No ${isAudioPlatform ? 'audio' : 'video'} URL found for ${platform}`);
        }

        console.log(`Successfully extracted ${platform} ${isAudioPlatform ? 'audio' : 'video'} URL: ${mediaUrl.substring(0, 100)}...`);

        return {
            success: true,
            data: {
                title: info.title || `${platform.charAt(0).toUpperCase() + platform.slice(1)} ${isAudioPlatform ? 'Audio' : 'Video'}`,
                url: mediaUrl,
                thumbnail: info.thumbnail || 'https://via.placeholder.com/300x150',
                sizes: [quality],
                source: platform,
                mediaType: isAudioPlatform ? 'audio' : 'video',
            }
        };
    } catch (ytdlError) {
        console.error(`youtube-dl error for ${platform}: ${ytdlError.message}`);

        // Try a different approach for different platforms
        try {
            console.log(`Attempting alternative approach for ${platform}...`);

            // Platform-specific fallbacks
            if (platform === 'soundcloud') {
                return await handleSoundCloudFallback(url);
            } else if (platform === 'vimeo') {
                return await handleVimeoFallback(url);
            } else if (platform === 'spotify') {
                return await handleSpotifyFallback(url);
            } else if (platform === 'bandcamp') {
                return await handleBandcampFallback(url);
            } else {
                // Generic fallback for other platforms - try with modified options
                const fallbackOptions = {
                    dumpSingleJson: true,
                    noCheckCertificates: true,
                    noWarnings: true,
                    format: ['spotify', 'soundcloud', 'bandcamp', 'deezer', 'apple_music',
                        'amazon_music', 'mixcloud', 'audiomack'].includes(platform) ? 'bestaudio' : 'best',
                    addHeader: [
                        'user-agent:Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
                    ],
                };

                const info = await youtubeDl(url, fallbackOptions);
                const isAudioPlatform = ['spotify', 'soundcloud', 'bandcamp', 'deezer', 'apple_music',
                    'amazon_music', 'mixcloud', 'audiomack'].includes(platform);
                
                let bestUrl = info.url || '';
                if (!bestUrl && info.formats && info.formats.length > 0) {
                    bestUrl = info.formats[0].url;
                }

                if (!bestUrl) {
                    throw new Error('No media URL found in fallback attempt');
                }

                return {
                    success: true,
                    data: {
                        title: info.title || `${platform.charAt(0).toUpperCase() + platform.slice(1)} ${isAudioPlatform ? 'Audio' : 'Video'}`,
                        url: bestUrl,
                        thumbnail: info.thumbnail || 'https://via.placeholder.com/300x150',
                        sizes: ['Standard Quality'],
                        source: platform,
                        mediaType: isAudioPlatform ? 'audio' : 'video',
                    }
                };
            }
        } catch (fallbackError) {
            console.error(`Fallback method for ${platform} also failed: ${fallbackError.message}`);

            // Last resort: try to at least get metadata
            try {
                console.log(`Attempting to extract basic metadata for ${platform}...`);
                const response = await fetch(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    }
                });

                if (!response.ok) {
                    throw new Error(`Failed to fetch page: ${response.status}`);
                }

                const html = await response.text();
                
                // Extract basic metadata
                let title = `${platform.charAt(0).toUpperCase() + platform.slice(1)} Media`;
                let thumbnail = 'https://via.placeholder.com/300x150';
                
                // Try to extract title
                const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/i) || 
                                  html.match(/<title>([^<]+)<\/title>/i);
                if (titleMatch && titleMatch[1]) {
                    title = titleMatch[1].trim();
                }
                
                // Try to extract thumbnail
                const thumbnailMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
                if (thumbnailMatch && thumbnailMatch[1]) {
                    thumbnail = thumbnailMatch[1];
                }

                // For the last resort, use our download endpoint
                const downloadUrl = `/api/download?url=${encodeURIComponent(url)}`;
                
                return {
                    success: true,
                    data: {
                        title: title,
                        url: downloadUrl,
                        thumbnail: thumbnail,
                        sizes: ['Original Quality'],
                        source: platform,
                        mediaType: ['spotify', 'soundcloud', 'bandcamp', 'deezer', 'apple_music',
                            'amazon_music', 'mixcloud', 'audiomack'].includes(platform) ? 'audio' : 'video',
                        useDownloadEndpoint: true
                    }
                };
            } catch (metadataError) {
                console.error(`All methods failed for ${platform}: ${metadataError.message}`);
                throw new Error(`Could not process ${platform} content: ${ytdlError.message}`);
            }
        }
    }
}

// Platform-specific fallback handlers
async function handleSoundCloudFallback(url) {
    console.log('Using SoundCloud-specific fallback method');

    try {
        // Try to fetch the SoundCloud page to extract metadata and stream URL
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch SoundCloud page: ${response.status}`);
        }

        const html = await response.text();

        // Extract basic metadata
        let title = 'SoundCloud Track';
        let thumbnail = 'https://via.placeholder.com/300x150';
        let streamUrl = '';

        // Extract title
        const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/i);
        if (titleMatch && titleMatch[1]) {
            title = titleMatch[1];
        }

        // Extract thumbnail
        const thumbnailMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
        if (thumbnailMatch && thumbnailMatch[1]) {
            thumbnail = thumbnailMatch[1];
        }

        // Look for SoundCloud API data
        const apiDataMatch = html.match(/window\.__sc_hydration\s*=\s*(\[.*?\]);/s);
        if (apiDataMatch && apiDataMatch[1]) {
            try {
                const hydrationData = JSON.parse(apiDataMatch[1]);
                
                // Find the stream info in the hydration data
                const streamInfo = hydrationData.find(item => 
                    item.hydratable === 'sound' || 
                    (item.data && (item.data.streamUrl || item.data.stream_url || 
                                  (item.data.media && item.data.media.transcodings)))
                );
                
                if (streamInfo && streamInfo.data) {
                    // Try to find the stream URL
                    if (streamInfo.data.streamUrl) {
                        streamUrl = streamInfo.data.streamUrl;
                    } else if (streamInfo.data.stream_url) {
                        streamUrl = streamInfo.data.stream_url;
                    } else if (streamInfo.data.media && streamInfo.data.media.transcodings) {
                        // Find progressive stream if available
                        const progressiveStream = streamInfo.data.media.transcodings.find(
                            t => t.format.protocol === 'progressive'
                        );
                        
                        if (progressiveStream && progressiveStream.url) {
                            streamUrl = progressiveStream.url;
                            
                            // Need to add client_id to the URL
                            const clientIdMatch = html.match(/client_id=([^&"]+)/);
                            if (clientIdMatch && clientIdMatch[1]) {
                                const clientId = clientIdMatch[1];
                                streamUrl = `${streamUrl}?client_id=${clientId}`;
                            }
                        }
                    }
                }
            } catch (jsonError) {
                console.error('Error parsing SoundCloud hydration data:', jsonError);
            }
        }

        // If we found a stream URL, use it
        if (streamUrl) {
            console.log(`Found SoundCloud stream URL: ${streamUrl}`);
            return {
                success: true,
                data: {
                    title: title,
                    url: streamUrl,
                    thumbnail: thumbnail,
                    sizes: ['High Quality'],
                    source: 'soundcloud',
                    mediaType: 'audio',
                }
            };
        }

        // No stream URL found, use our download endpoint
        console.log('No direct stream URL found, using download endpoint');
        const downloadUrl = `/api/download?url=${encodeURIComponent(url)}`;
        
        return {
            success: true,
            data: {
                title: title,
                url: downloadUrl,
                thumbnail: thumbnail,
                sizes: ['Original Quality'],
                source: 'soundcloud',
                mediaType: 'audio',
                useDownloadEndpoint: true
            }
        };
    } catch (error) {
        console.error(`SoundCloud fallback error: ${error.message}`);
        throw error;
    }
}

async function handleVimeoFallback(url) {
    console.log('Using Vimeo-specific fallback method');

    try {
        // Fetch the Vimeo page
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch Vimeo page: ${response.status}`);
        }

        const html = await response.text();

        // Extract basic metadata
        let title = 'Vimeo Video';
        let thumbnail = 'https://via.placeholder.com/300x150';
        let videoUrl = '';

        // Extract title
        const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/i);
        if (titleMatch && titleMatch[1]) {
            title = titleMatch[1];
        }

        // Extract thumbnail
        const thumbnailMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
        if (thumbnailMatch && thumbnailMatch[1]) {
            thumbnail = thumbnailMatch[1];
        }

        // Look for Vimeo config data
        const configMatch = html.match(/var config = ({.*?});/s);
        if (configMatch && configMatch[1]) {
            try {
                // Replace single quotes with double quotes for JSON parsing
                let configStr = configMatch[1].replace(/'/g, '"');
                const config = JSON.parse(configStr);
                
                // Extract video URL from config
                if (config.video && config.video.play && config.video.play.progressive) {
                    const progressiveUrls = config.video.play.progressive;
                    if (Array.isArray(progressiveUrls) && progressiveUrls.length > 0) {
                        // Sort by quality (highest first)
                        progressiveUrls.sort((a, b) => 
                            parseInt(b.height || 0) - parseInt(a.height || 0)
                        );
                        
                        const bestQuality = progressiveUrls[0];
                        videoUrl = bestQuality.url;
                        
                        console.log(`Found Vimeo video URL (${bestQuality.height}p): ${videoUrl}`);
                    }
                }
            } catch (jsonError) {
                console.error('Error parsing Vimeo config:', jsonError);
            }
        }

        // If we couldn't find config, try a different approach
        if (!videoUrl) {
            // Look for player_url in metadata
            const playerUrlMatch = html.match(/<meta property="twitter:player" content="([^"]+)"/i);
            if (playerUrlMatch && playerUrlMatch[1]) {
                console.log('Found Vimeo player URL, using download endpoint');
            }
            
            // Use our download endpoint as fallback
            const downloadUrl = `/api/download?url=${encodeURIComponent(url)}`;
            
            return {
                success: true,
                data: {
                    title: title,
                    url: downloadUrl,
                    thumbnail: thumbnail,
                    sizes: ['Original Quality'],
                    source: 'vimeo',
                    mediaType: 'video',
                    useDownloadEndpoint: true
                }
            };
        }

        return {
            success: true,
            data: {
                title: title,
                url: videoUrl,
                thumbnail: thumbnail,
                sizes: ['High Quality'],
                source: 'vimeo',
                mediaType: 'video',
            }
        };
    } catch (error) {
        console.error(`Vimeo fallback error: ${error.message}`);
        throw error;
    }
}

async function handleSpotifyFallback(url) {
    console.log('Using Spotify-specific fallback method');
    
    try {
        // Get metadata from Spotify page
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch Spotify page: ${response.status}`);
        }

        const html = await response.text();

        // Extract basic metadata
        let title = 'Spotify Track';
        let artist = '';
        let thumbnail = 'https://via.placeholder.com/300x150';

        // Extract title
        const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/i);
        if (titleMatch && titleMatch[1]) {
            title = titleMatch[1];
        }

        // Extract artist from description
        const descMatch = html.match(/<meta property="og:description" content="([^"]+)"/i);
        if (descMatch && descMatch[1]) {
            const descParts = descMatch[1].split('·');
            if (descParts.length > 0) {
                artist = descParts[0].trim();
            }
        }

        // Extract thumbnail
        const thumbnailMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
        if (thumbnailMatch && thumbnailMatch[1]) {
            thumbnail = thumbnailMatch[1];
        }

        // For Spotify, we'll use our download endpoint
        const downloadUrl = `/api/download?url=${encodeURIComponent(url)}`;
        
        return {
            success: true,
            data: {
                title: artist ? `${artist} - ${title}` : title,
                url: downloadUrl,
                thumbnail: thumbnail,
                sizes: ['High Quality'],
                source: 'spotify',
                mediaType: 'audio',
                useDownloadEndpoint: true
            }
        };
    } catch (error) {
        console.error(`Spotify fallback error: ${error.message}`);
        throw error;
    }
}

async function handleBandcampFallback(url) {
    console.log('Using Bandcamp-specific fallback method');
    
    try {
        // Get metadata from Bandcamp page
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch Bandcamp page: ${response.status}`);
        }

        const html = await response.text();

        // Extract basic metadata
        let title = 'Bandcamp Track';
        let artist = '';
        let thumbnail = 'https://via.placeholder.com/300x150';
        let trackUrl = '';

        // Extract title
        const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/i);
        if (titleMatch && titleMatch[1]) {
            title = titleMatch[1];
        }

        // Extract thumbnail
        const thumbnailMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
        if (thumbnailMatch && thumbnailMatch[1]) {
            thumbnail = thumbnailMatch[1];
        }

        // Look for the track data in the page
        const trackDataMatch = html.match(/data-tralbum="([^"]+)"/);
        if (trackDataMatch && trackDataMatch[1]) {
            try {
                // Decode HTML entities and parse as JSON
                const decodedData = trackDataMatch[1]
                    .replace(/&quot;/g, '"')
                    .replace(/&amp;/g, '&')
                    .replace(/\\u002f/g, '/');
                    
                const trackData = JSON.parse(decodedData);
                
                // Extract track info
                if (trackData.trackinfo && trackData.trackinfo.length > 0) {
                    const track = trackData.trackinfo[0];
                    if (track.file && track.file.mp3-128) {
                        trackUrl = track.file['mp3-128'];
                        console.log(`Found Bandcamp track URL: ${trackUrl}`);
                    }
                }
                
                // Extract artist if available
                if (trackData.artist) {
                    artist = trackData.artist;
                }
            } catch (jsonError) {
                console.error('Error parsing Bandcamp track data:', jsonError);
            }
        }

        // Alternative method to find track URL
        if (!trackUrl) {
            const fileMatch = html.match(/{"mp3-128":"([^"]+)"/);
            if (fileMatch && fileMatch[1]) {
                trackUrl = fileMatch[1].replace(/\\u0026/g, '&');
                console.log(`Found alternative Bandcamp track URL: ${trackUrl}`);
            }
        }

        // If we found a track URL, use it
        if (trackUrl) {
            return {
                success: true,
                data: {
                    title: artist ? `${artist} - ${title}` : title,
                    url: trackUrl,
                    thumbnail: thumbnail,
                    sizes: ['128kbps'],
                    source: 'bandcamp',
                    mediaType: 'audio',
                }
            };
        }

        // No track URL found, use our download endpoint
        console.log('No direct track URL found, using download endpoint');
        const downloadUrl = `/api/download?url=${encodeURIComponent(url)}`;
        
        return {
            success: true,
            data: {
                title: artist ? `${artist} - ${title}` : title,
                url: downloadUrl,
                thumbnail: thumbnail,
                sizes: ['Original Quality'],
                source: 'bandcamp',
                mediaType: 'audio',
                useDownloadEndpoint: true
            }
        };
    } catch (error) {
        console.error(`Bandcamp fallback error: ${error.message}`);
        throw error;
    }
}
// Add this specialized function for handling Facebook mobile URLs
// Enhanced Facebook mobile video downloader to fix black screen issues
async function processFacebookMobileUrl(url) {
    console.log(`Processing Facebook mobile URL: ${url}`);

    // Check if it's a mobile sharing URL
    const isMobileShare = url.includes('m.facebook.com/share/v/') || url.includes('fb.watch');

    if (isMobileShare) {
        console.log('Detected Facebook mobile sharing URL, using specialized approach');

        try {
            // Extract video ID from various URL formats
            let videoId = null;

            if (url.includes('/share/v/')) {
                const match = url.match(/\/share\/v\/([^\/\?]+)/);
                if (match && match[1]) videoId = match[1];
            } else if (url.includes('fb.watch/')) {
                const match = url.match(/fb\.watch\/([^\/\?]+)/);
                if (match && match[1]) videoId = match[1];
            } else if (url.includes('watch?v=')) {
                const match = url.match(/watch\?v=([^&]+)/);
                if (match && match[1]) videoId = match[1];
            }

            // If we have a video ID, try to create desktop URLs
            if (videoId) {
                console.log(`Extracted video ID: ${videoId}`);

                // These are Facebook URL formats that often work better
                const alternativeUrls = [
                    `https://www.facebook.com/watch/?v=${videoId}`,
                    `https://www.facebook.com/watch?v=${videoId}`,
                    `https://fb.watch/${videoId}`
                ];

                // Try each alternative URL with our downloaders
                for (const altUrl of alternativeUrls) {
                    console.log(`Trying alternative URL: ${altUrl}`);

                    // First try fbDownloader
                    try {
                        const result = await fbDownloader(altUrl);
                        if (Array.isArray(result) && result.length > 0 && result[0].url) {
                            // Validate the URL actually contains video
                            const validUrl = await validateVideoUrl(result[0].url);
                            if (validUrl) {
                                console.log(`Successfully found valid video URL with fbDownloader: ${validUrl}`);
                                return {
                                    success: true,
                                    data: {
                                        title: 'Facebook Video',
                                        url: validUrl,
                                        thumbnail: result[0].thumbnail || 'https://via.placeholder.com/300x150',
                                        sizes: result[0].isHD ? ['HD Quality'] : ['Standard Quality'],
                                        source: 'facebook',
                                    }
                                };
                            }
                        }
                    } catch (err) {
                        console.warn(`fbDownloader failed with ${altUrl}: ${err.message}`);
                    }
                }
            }

            // The above approaches failed, try direct browser emulation approach
            console.log('Attempting direct browser emulation approach');

            // Common Facebook video patterns
            const videoUrlPatterns = [
                /"browser_native_hd_url":"([^"]+)"/,
                /"browser_native_sd_url":"([^"]+)"/,
                /"hd_src_no_ratelimit":"([^"]+)"/,
                /"hd_src":"([^"]+)"/,
                /"sd_src_no_ratelimit":"([^"]+)"/,
                /"sd_src":"([^"]+)"/,
                /"video_url":"([^"]+)"/,
                /"playable_url_quality_hd":"([^"]+)"/,
                /"playable_url":"([^"]+)"/
            ];

            // Attempt to directly fetch the page with a browser-like request
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Referer': 'https://www.facebook.com/',
                    'Upgrade-Insecure-Requests': '1',
                    'Cache-Control': 'max-age=0'
                },
                redirect: 'follow'
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch Facebook page: ${response.status}`);
            }

            const html = await response.text();
            console.log(`Fetched HTML content (${html.length} bytes)`);

            // Attempt to find video URLs in the page content
            const videoUrls = [];

            for (const pattern of videoUrlPatterns) {
                const matches = [...html.matchAll(pattern)];
                for (const match of matches) {
                    if (match && match[1]) {
                        let videoUrl = match[1]
                            .replace(/\\u0025/g, '%')
                            .replace(/\\u002F/g, '/')
                            .replace(/\\\//g, '/')
                            .replace(/\\/g, '')
                            .replace(/&amp;/g, '&');

                        videoUrls.push(videoUrl);
                        console.log(`Found potential video URL with pattern ${pattern}: ${videoUrl.substr(0, 100)}...`);
                    }
                }
            }

            // Check for direct video tags
            const videoTagMatches = [...html.matchAll(/<video[^>]+src="([^"]+)"/g)];
            for (const match of videoTagMatches) {
                if (match && match[1]) {
                    videoUrls.push(match[1]);
                    console.log(`Found video tag source: ${match[1].substr(0, 100)}...`);
                }
            }

            // Check for source tags
            const sourceTagMatches = [...html.matchAll(/<source[^>]+src="([^"]+)"/g)];
            for (const match of sourceTagMatches) {
                if (match && match[1]) {
                    videoUrls.push(match[1]);
                    console.log(`Found source tag: ${match[1].substr(0, 100)}...`);
                }
            }

            // Remove duplicates
            const uniqueVideoUrls = [...new Set(videoUrls)];

            // Check each URL to see if it's a valid video
            for (const videoUrl of uniqueVideoUrls) {
                try {
                    const validUrl = await validateVideoUrl(videoUrl);
                    if (validUrl) {
                        // Extract thumbnail and title if available
                        let thumbnail = '';
                        const thumbnailMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
                        if (thumbnailMatch && thumbnailMatch[1]) {
                            thumbnail = thumbnailMatch[1];
                        }

                        let title = 'Facebook Video';
                        const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/i);
                        if (titleMatch && titleMatch[1]) {
                            title = titleMatch[1];
                        }

                        console.log(`Found valid video URL: ${validUrl.substr(0, 100)}...`);

                        return {
                            success: true,
                            data: {
                                title,
                                url: validUrl,
                                thumbnail: thumbnail || 'https://via.placeholder.com/300x150',
                                sizes: videoUrl.includes('hd_src') || videoUrl.includes('hd_url') ? ['HD Quality'] : ['Standard Quality'],
                                source: 'facebook',
                            }
                        };
                    }
                } catch (validationError) {
                    console.warn(`Validation failed for ${videoUrl}: ${validationError.message}`);
                }
            }

            // If we got here, we need to try more aggressive methods
            if (uniqueVideoUrls.length > 0) {
                // Just return the first URL we found - at least it's a direct link from Facebook
                // We will handle the download specially in the download handler
                const bestUrl = uniqueVideoUrls[0];

                // Get any thumbnail and title
                let thumbnail = '';
                const thumbnailMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
                if (thumbnailMatch && thumbnailMatch[1]) {
                    thumbnail = thumbnailMatch[1];
                }

                let title = 'Facebook Video';
                const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/i);
                if (titleMatch && titleMatch[1]) {
                    title = titleMatch[1];
                }

                console.log(`Using first available video URL: ${bestUrl.substr(0, 100)}...`);

                return {
                    success: true,
                    data: {
                        title,
                        url: bestUrl,
                        thumbnail: thumbnail || 'https://via.placeholder.com/300x150',
                        sizes: bestUrl.includes('hd_src') || bestUrl.includes('hd_url') ? ['HD Quality'] : ['Standard Quality'],
                        source: 'facebook',
                        is_fb_video: true,  // Special flag to handle this differently in download
                        original_url: url   // Keep the original URL for reference
                    }
                };
            }

            throw new Error('Could not find any video URLs in Facebook content');
        } catch (error) {
            console.error(`Facebook video extraction error: ${error.message}`);
            throw error;
        }
    }

    // Not a mobile sharing URL, return null and let the regular handler process it
    return null;
}

// Function to validate a video URL is actually a video and not a black screen
async function validateVideoUrl(url) {
    console.log(`Validating video URL: ${url}`);

    try {
        // First, check if it's a video URL by file extension or content type
        if (url.includes('.mp4') || url.includes('video')) {
            // Try a HEAD request to check the content type
            const headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Accept-Language': 'en-US,en;q=0.5',
                'Referer': 'https://www.facebook.com/',
                'Origin': 'https://www.facebook.com/',
                'Sec-Fetch-Dest': 'video',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'cross-site',
            };

            const response = await fetch(url, {
                method: 'HEAD',
                headers,
                redirect: 'follow'
            });

            if (response.ok) {
                const contentType = response.headers.get('content-type');
                const contentLength = response.headers.get('content-length');

                console.log(`URL validation: status=${response.status}, type=${contentType}, length=${contentLength}`);

                // Check if it's a video content type and has reasonable size
                if (contentType && contentType.includes('video') && contentLength && parseInt(contentLength) > 50000) {
                    return url;
                }

                // Even if not explicitly video type, if it's over 1MB it's likely a valid video
                if (contentLength && parseInt(contentLength) > 1000000) {
                    return url;
                }
            }

            // If HEAD request failed or didn't confirm video, try a small GET request
            // to check actual content
            const rangeHeaders = {
                ...headers,
                'Range': 'bytes=0-8192'  // Get just first 8KB to check signature
            };

            const rangeResponse = await fetch(url, {
                headers: rangeHeaders,
                redirect: 'follow'
            });

            if (rangeResponse.ok || rangeResponse.status === 206) {
                const buffer = await rangeResponse.arrayBuffer();
                const bytes = new Uint8Array(buffer);

                // Check for video file signatures
                // MP4 signature: ftyp (66 74 79 70) after the first 4 bytes
                // Check for MP4 signature
                if (bytes.length > 8) {
                    if (
                        (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) || // ftyp
                        (bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x00 && bytes[3] === 0x18) || // h264 common start
                        (bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x01) // MPEG TS stream
                    ) {
                        console.log('URL validation: Found valid video file signature');
                        return url;
                    }
                }
            }
        }

        // If we get here, we couldn't definitively validate it as a video
        // But for Facebook it might still be valid, so return the URL with warning
        console.warn('URL validation: Could not definitively confirm valid video');
        return url;
    } catch (error) {
        console.error(`URL validation error: ${error.message}`);
        // Return the URL anyway, as Facebook URLs often fail validation but work
        return url;
    }
}
// Helper: Puppeteer-based Threads page fetch - with multi-path support and fallbacks
async function fetchThreadsPage(url) {
    let browser = null;
    try {
        // Chrome paths that might exist on Render and other environments
        const possiblePaths = [
            // Render pre-installed
            '/opt/render/project/.render/chrome/opt/google/chrome/chrome',
            // Other common locations
            '/usr/bin/chromium-browser',
            '/usr/bin/chromium',
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable'
        ];

        // Find the first path that exists
        let executablePath = null;
        for (const path of possiblePaths) {
            try {
                if (fs.existsSync(path)) {
                    executablePath = path;
                    console.log(`Found Chrome at: ${path}`);
                    break;
                }
            } catch (e) {
                // Continue checking other paths
            }
        }

        if (!executablePath) {
            console.warn('Could not find Chrome installation, fallback to fetch');
            // Enhanced headers to better simulate a real browser
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Sec-Fetch-Site': 'none',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-User': '?1',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Ch-Ua': '"Google Chrome";v="120", "Chromium";v="120"',
                    'Sec-Ch-Ua-Mobile': '?0',
                    'Sec-Ch-Ua-Platform': '"Windows"',
                    'Upgrade-Insecure-Requests': '1',
                    'Cache-Control': 'max-age=0',
                    'Referer': 'https://www.threads.net/'
                }
            });
            return await response.text();
        }

        // Launch browser with the found path
        browser = await puppeteer.launch({
            headless: true,
            executablePath,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-gpu'
            ]
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

        // Get the full HTML of the page
        const html = await page.content();
        return html;
    } catch (error) {
        console.error('Puppeteer error:', error.message);
        // Fallback to basic fetch if puppeteer fails
        try {
            console.log('Falling back to basic fetch after puppeteer error');
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9'
                }
            });
            return await response.text();
        } catch (fetchError) {
            console.error('Fetch fallback also failed:', fetchError.message);
            throw fetchError;
        }
    } finally {
        if (browser) {
            await browser.close().catch(e => console.error('Error closing browser:', e.message));
        }
    }
}

// Routes
app.get('/', (req, res) => {
    res.send('Social Media Download API is running');
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
// Add this to your server.js file to handle streaming of local files

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
// Main function to handle media download - New implementation
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
        let data;

        switch (platform) {
            case 'instagram':
                data = await igdl(url);
                break;
            case 'tiktok':
                data = await ttdl(url);
                break;
            case 'facebook':
                data = await facebook(url);
                break;
            case 'twitter':
                // Using youtube-dl for Twitter/X instead of alldown
                const twitterResult = await processTwitterWithYtdl(url);
                return res.status(200).json(twitterResult);
            case 'youtube':
                data = await alldown(url);
                break;
            case 'pinterest':
                data = await pinterestdl(url);
                break;
            case 'threads':
                data = await threads(url);
                break;
            default:
                // For all other platforms, use youtube-dl
                console.info(`Using enhanced generic handler for platform: ${platform}`);
                const result = await processGenericUrlWithYtdl(url, platform);
                return res.status(200).json(result);
        }

        if (!data) {
            console.error("Download Media: No data returned for the platform.");
            return res.status(404).json({ error: 'Data not found for the platform' });
        }

        const formattedData = await formatData(platform, data);

        // Shorten URLs for all platforms except Threads
        if (platform !== 'threads') {
            formattedData.url = await shortenUrl(formattedData.url);
            formattedData.thumbnail = await shortenUrl(formattedData.thumbnail);
        }

        console.info("Download Media: Media successfully downloaded and formatted.");

        // Download the large file if needed
        if (platform === 'youtube' && formattedData.url) {
            await downloadLargeFile(formattedData.url, 'large_video.mp4');
        }

        // 200 OK: Successful response
        res.status(200).json({
            success: true,
            data: formattedData,
        });
    } catch (error) {
        console.error(`Download Media: Error occurred - ${error.message}`);

        // Fallback to existing methods from your server.js
        try {
            console.log(`Attempting fallback for ${platform} URL: ${url}`);

            // Use your existing endpoint logic as fallback
            let response;

            if (platform === 'pinterest') {
                // Use our dedicated Pinterest endpoint instead of processPinterestUrl
                console.log(`Using dedicated Pinterest endpoint for: ${url}`);
                const pinterestResponse = await fetch(`http://localhost:${PORT}/api/pinterest?url=${encodeURIComponent(url)}`);
                if (!pinterestResponse.ok) {
                    throw new Error(`Pinterest endpoint returned status: ${pinterestResponse.status}`);
                }
                response = await pinterestResponse.json();
            } else if (platform === 'facebook') {
                response = await processFacebookUrl(url);
            } else if (platform === 'threads') {
                response = await processThreadsUrl(url);
            } else if (platform === 'youtube') {
                response = await processYoutubeWithYtdl(url);
            } else if (platform === 'twitter') {
                response = await processTwitterWithYtdl(url);
            } else {
                // Generic fallback using youtube-dl
                response = await processGenericUrlWithYtdl(url, platform);
            }

            if (response) {
                return res.status(200).json(response);
            }

            throw new Error('Fallback processing also failed');
        } catch (fallbackError) {
            console.error(`Fallback also failed: ${fallbackError.message}`);
            res.status(500).json({ error: 'Failed to download media', details: error.message });
        }
    }
});

// Facebook Handler (from your implementation)
async function processFacebookUrl(url) {
    console.log(`Processing Facebook URL: ${url}`);

    try {
        const result = await fbDownloader(url);

        if (Array.isArray(result) && result.length > 0) {
            return {
                success: true,
                data: {
                    title: 'Facebook Video',
                    url: result[0].url,
                    thumbnail: 'https://via.placeholder.com/300x150',
                    sizes: ['Original Quality'],
                    source: 'facebook',
                }
            };
        }

        if (result && result.urls && result.urls.length > 0) {
            return {
                success: true,
                data: {
                    title: result.title || 'Facebook Video',
                    url: result.urls[0].url,
                    thumbnail: result.thumbnail || 'https://via.placeholder.com/300x150',
                    sizes: ['Original Quality'],
                    source: 'facebook',
                }
            };
        }
    } catch (err) {
        console.warn('fb-downloader failed:', err.message);
    }

    // Fallback to youtube-dl
    try {
        const info = await youtubeDl(url, {
            dumpSingleJson: true,
            noCheckCertificates: true,
            noWarnings: true,
        });

        if (info && info.formats && info.formats.length > 0) {
            // Find the best format
            const videoFormat = info.formats.find(f => f.vcodec !== 'none' && f.acodec !== 'none') || info.formats[0];

            return {
                success: true,
                data: {
                    title: info.title || 'Facebook Video',
                    url: videoFormat.url,
                    thumbnail: info.thumbnail || 'https://via.placeholder.com/300x150',
                    sizes: ['Original Quality'],
                    source: 'facebook',
                }
            };
        }
    } catch (ytdlError) {
        console.error('youtube-dl fallback error:', ytdlError);
        throw ytdlError;
    }
}

// Threads Handler
async function processThreadsUrl(url) {
    console.log(`Processing Threads URL: ${url}`);

    let html = await fetchThreadsPage(url);

    let title = 'Threads Post';
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
        title = titleMatch[1].trim();
    }

    // First try to detect video via Open Graph meta tag
    const ogVideoMatch = html.match(/<meta property="og:video" content="([^"]+)"\/?>/i) ||
        html.match(/<meta property="og:video:url" content="([^"]+)"\/?>/i);

    if (ogVideoMatch && ogVideoMatch[1]) {
        let videoUrl = ogVideoMatch[1].replace(/&amp;/g, '&');

        // Check if the URL needs a protocol
        if (videoUrl.startsWith('//')) {
            videoUrl = 'https:' + videoUrl;
        }

        const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"\/?>/i);
        const thumbnail = ogImageMatch ? ogImageMatch[1] : '';

        return {
            success: true,
            data: {
                title,
                url: videoUrl,
                thumbnail: thumbnail || 'https://via.placeholder.com/300x150',
                sizes: ['Original Quality'],
                source: 'threads',
            }
        };
    }

    // Otherwise try image meta tag
    const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"\/?>/i);
    if (ogImageMatch && ogImageMatch[1]) {
        const imageUrl = ogImageMatch[1];

        return {
            success: true,
            data: {
                title,
                url: imageUrl,
                thumbnail: imageUrl,
                sizes: ['Original Quality'],
                source: 'threads',
            }
        };
    }

    // Also look for video URLs in the content
    const videoRegexes = [
        /"video_url":"([^"]+)"/,
        /"playbackUrl":"([^"]+)"/,
        /"mediaUrl":"([^"]+)"/,
        /"videoUrl":"([^"]+)"/,
        /"url":"([^"]+\.mp4[^"]*)"/
    ];

    let videoUrl = null;

    for (const regex of videoRegexes) {
        const match = html.match(regex);
        if (match && match[1]) {
            videoUrl = match[1]
                .replace(/\\u002F/g, '/')
                .replace(/\\\//g, '/')
                .replace(/\\/g, '')
                .replace(/&amp;/g, '&');
            break;
        }
    }

    if (videoUrl) {
        return {
            success: true,
            data: {
                title,
                url: videoUrl,
                thumbnail: 'https://via.placeholder.com/300x150',
                sizes: ['Original Quality'],
                source: 'threads',
            }
        };
    }

    throw new Error('No media found in this Threads post');
}

// YouTube Handler with youtube-dl
async function processYoutubeWithYtdl(url) {
    console.log(`Processing YouTube URL with youtube-dl: ${url}`);

    try {
        const info = await youtubeDl(url, {
            dumpSingleJson: true,
            noCheckCertificates: true,
            noWarnings: true,
        });

        if (info && info.formats && info.formats.length > 0) {
            // Find a good quality format
            const format = info.formats.find(f =>
                f.format_note === '720p' && f.vcodec !== 'none' && f.acodec !== 'none'
            ) || info.formats.find(f =>
                f.vcodec !== 'none' && f.acodec !== 'none'
            ) || info.formats[0];

            return {
                success: true,
                data: {
                    title: info.title || 'YouTube Video',
                    url: format.url,
                    thumbnail: info.thumbnail || 'https://via.placeholder.com/300x150',
                    sizes: ['Original Quality'],
                    source: 'youtube',
                }
            };
        }

        throw new Error('No video formats found');
    } catch (error) {
        console.error('YouTube download error:', error);
        throw error;
    }
}

// Generic handler with youtube-dl - ENHANCED for additional platforms
async function processGenericUrlWithYtdl(url, platform) {
    console.log(`Processing ${platform} URL with youtube-dl: ${url}`);

    try {
        const info = await youtubeDl(url, {
            dumpSingleJson: true,
            noCheckCertificates: true,
            noWarnings: true,
        });

        if (info && info.formats && info.formats.length > 0) {
            // Select appropriate format based on platform type
            let format;

            // For audio platforms, select an audio-only format if available
            if (['spotify', 'soundcloud', 'bandcamp', 'deezer', 'apple_music',
                'amazon_music', 'mixcloud', 'audiomack'].includes(platform)) {
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
                success: true,
                data: {
                    title: info.title || `${platform} Media`,
                    url: format.url,
                    thumbnail: info.thumbnail || 'https://via.placeholder.com/300x150',
                    sizes: ['Original Quality'],
                    source: platform,
                    // Add extra info for audio platforms
                    isAudio: ['spotify', 'soundcloud', 'bandcamp', 'deezer', 'apple_music',
                        'amazon_music', 'mixcloud', 'audiomack'].includes(platform),
                }
            };
        }

        throw new Error('No media formats found');
    } catch (error) {
        console.error(`${platform} download error:`, error);
        throw error;
    }
}
app.get('/api/info', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    // Redirect request to our new implementation
    try {
        const platform = identifyPlatform(url);
        console.log(`Detected platform for ${url}: ${platform}`);

        if (!platform) {
            return res.status(400).json({ error: 'Unsupported platform' });
        }

        // Carefully check if URL is just a homepage without causing errors
        try {
            const uri = new URL(url);
            if ((uri.pathname === '/' || uri.pathname === '') && 
                ['spotify', 'soundcloud', 'bandcamp', 'deezer', 'apple_music',
                'amazon_music', 'mixcloud', 'audiomack', 'vimeo',
                'dailymotion', 'twitch', 'reddit', 'linkedin', 
                'tumblr', 'vk', 'bilibili', 'snapchat'].includes(platform)) {
                
                console.warn(`URL appears to be just the ${platform} homepage, not specific content`);
                return res.status(400).json({ 
                    error: 'Invalid URL',
                    message: `Please provide a URL to a specific ${platform} content, not just the homepage`
                });
            }
        } catch (urlError) {
            // Continue anyway as this error might be unrelated to the path
            console.warn(`URL parsing error: ${urlError.message}`);
        }

        // Special handling for Pinterest
        if (platform === 'pinterest') {
            console.log('Using dedicated Pinterest endpoint');
            try {
                // Use our dedicated Pinterest endpoint
                const pinterestResponse = await fetch(`http://localhost:${PORT}/api/pinterest?url=${encodeURIComponent(url)}`);
                
                if (!pinterestResponse.ok) {
                    throw new Error(`Pinterest endpoint returned status: ${pinterestResponse.status}`);
                }
                
                // Our Pinterest endpoint already returns data in the expected format
                return res.json(await pinterestResponse.json());
            } catch (pinterestError) {
                console.error('Pinterest endpoint error:', pinterestError);
                // If Pinterest endpoint fails, continue with the regular flow
            }
        }

        // Call our internal download function (original code continues here)
        const response = await fetch(`http://localhost:${PORT}/api/download-media`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url }),
        });

        const data = await response.json();

        if (data.success) {
            // Transform response to format expected by Flutter app
            const isAudioPlatform = ['spotify', 'soundcloud', 'bandcamp', 'deezer', 'apple_music',
                'amazon_music', 'mixcloud', 'audiomack'].includes(platform);

            const isImage = platform === 'pinterest' ||
                (data.data.url && (data.data.url.includes('.jpg') ||
                    data.data.url.includes('.jpeg') ||
                    data.data.url.includes('.png')));

            const formattedResponse = {
                title: data.data.title,
                formats: [{
                    itag: 'best',
                    quality: 'Best Quality',
                    mimeType: isImage ? 'image/jpeg' :
                        isAudioPlatform ? 'audio/mp3' : 'video/mp4',
                    url: data.data.url,
                    hasAudio: !isImage,
                    hasVideo: !isImage && !isAudioPlatform,
                }],
                thumbnails: [{ url: data.data.thumbnail }],
                platform,
                mediaType: isImage ? 'image' :
                    isAudioPlatform ? 'audio' : 'video',
                // Add directUrl to help mobile app with direct downloading
                directUrl: `/api/direct?url=${encodeURIComponent(data.data.url)}&referer=${platform}.com`
            };

            return res.json(formattedResponse);
        }

        throw new Error(data.error || 'Processing failed');
    } catch (error) {
        console.error('API info error:', error);

        // Fall back to youtube-dl for all platforms
        try {
            const platform = identifyPlatform(url);
            
            // For Pinterest, make one last attempt with our dedicated endpoint
            if (platform === 'pinterest') {
                try {
                    console.log('Attempting Pinterest endpoint as fallback');
                    const pinterestResponse = await fetch(`http://localhost:${PORT}/api/pinterest?url=${encodeURIComponent(url)}`);
                    if (pinterestResponse.ok) {
                        return res.json(await pinterestResponse.json());
                    }
                } catch (pinterestFallbackError) {
                    console.warn('Pinterest fallback also failed:', pinterestFallbackError);
                    // Continue to generic fallback
                }
            }
            
            const isAudioPlatform = ['spotify', 'soundcloud', 'bandcamp', 'deezer', 'apple_music',
                'amazon_music', 'mixcloud', 'audiomack'].includes(platform);

            try {
                console.log(`Trying improved generic handler for ${platform}`);
                const result = await processGenericUrlWithYtdl(url, platform);
                
                if (result && result.success && result.data) {
                    // Format to match expected response format
                    const isImage = result.data.url && (
                        result.data.url.includes('.jpg') ||
                        result.data.url.includes('.jpeg') ||
                        result.data.url.includes('.png')
                    );
                    
                    // Check if this is a download endpoint URL
                    let directUrl = null;
                    if (result.data.useDownloadEndpoint) {
                        directUrl = result.data.url;
                    } else {
                        directUrl = `/api/direct?url=${encodeURIComponent(result.data.url)}&referer=${platform}.com`;
                    }
                    
                    return res.json({
                        title: result.data.title,
                        formats: [{
                            itag: 'best',
                            quality: result.data.sizes?.[0] || 'Best Quality',
                            mimeType: isImage ? 'image/jpeg' :
                                isAudioPlatform ? 'audio/mp3' : 'video/mp4',
                            url: result.data.url,
                            hasAudio: !isImage,
                            hasVideo: !isImage && !isAudioPlatform,
                        }],
                        thumbnails: [{ url: result.data.thumbnail }],
                        platform,
                        mediaType: isImage ? 'image' :
                            isAudioPlatform ? 'audio' : 'video',
                        directUrl: directUrl
                    });
                }
            } catch (handlerError) {
                console.error(`Improved handler failed for ${platform}: ${handlerError.message}`);
                // Continue to more generic fallback
            }

            // Generic youtube-dl fallback with simplified options
            const ytdlOptions = {
                dumpSingleJson: true,
                noCheckCertificates: true,
                noWarnings: true,
                format: isAudioPlatform ? 'bestaudio' : 'best'  // Simplified format string
            };
            
            console.log(`Trying simple youtube-dl for ${platform} with format: ${ytdlOptions.format}`);
            const info = await youtubeDl(url, ytdlOptions);

            // Different format handling based on platform type
            let formats = [];

            if (isAudioPlatform) {
                // Prefer audio-only formats for audio platforms
                formats = (info.formats || [])
                    .filter(f => f.acodec !== 'none')
                    .map(format => {
                        return {
                            itag: format.format_id,
                            quality: format.format_note || 'Unknown',
                            mimeType: format.ext ? `audio/${format.ext}` : 'audio/mp3',
                            url: format.url,
                            hasAudio: true,
                            hasVideo: false,
                        };
                    });
            } else {
                // Regular format handling for video platforms
                formats = (info.formats || []).map(format => {
                    const isVideo = format.vcodec !== 'none';
                    const isAudio = format.acodec !== 'none';

                    let qualityLabel = format.format_note || 'Unknown';
                    if (format.height) {
                        qualityLabel = `${format.height}p`;
                    }

                    let mimeType = 'application/octet-stream';
                    if (format.ext) {
                        if (isVideo) mimeType = `video/${format.ext}`;
                        else if (isAudio) mimeType = `audio/${format.ext}`;
                    }

                    return {
                        itag: format.format_id,
                        quality: qualityLabel,
                        mimeType,
                        url: format.url,
                        hasAudio: isAudio,
                        hasVideo: isVideo,
                    };
                });
            }

            // If no formats were found, provide a minimal fallback
            if (formats.length === 0) {
                formats = [{
                    itag: 'best',
                    quality: 'Best Quality',
                    mimeType: isAudioPlatform ? 'audio/mp3' : 'video/mp4',
                    url: url, // Use original URL as fallback
                    hasAudio: true,
                    hasVideo: !isAudioPlatform,
                }];
            }

            res.json({
                title: info.title || `${platform} Media`,
                thumbnails: info.thumbnails ?
                    info.thumbnails.map(t => ({ url: t.url, width: t.width, height: t.height })) :
                    [{ url: 'https://via.placeholder.com/300x150' }],
                formats,
                platform,
                mediaType: isAudioPlatform ? 'audio' : 'video',
                directUrl: `/api/direct?url=${encodeURIComponent(formats[0].url)}&referer=${platform}.com`
            });
        } catch (fallbackError) {
            console.error('Fallback processing error:', fallbackError);

            // Ultimate fallback with minimal info
            const platform = identifyPlatform(url) || 'unknown';
            const isAudioPlatform = ['spotify', 'soundcloud', 'bandcamp', 'deezer', 'apple_music',
                'amazon_music', 'mixcloud', 'audiomack'].includes(platform);

            res.json({
                title: `${platform.charAt(0).toUpperCase() + platform.slice(1)} Media`,
                thumbnails: [{ url: 'https://via.placeholder.com/300x150' }],
                formats: [{
                    itag: 'best',
                    quality: 'Original Quality',
                    mimeType: isAudioPlatform ? 'audio/mp3' : 'video/mp4',
                    url: url,
                    hasAudio: true,
                    hasVideo: !isAudioPlatform,
                }],
                platform,
                mediaType: isAudioPlatform ? 'audio' : 'video',
                directUrl: `/api/direct?url=${encodeURIComponent(url)}&referer=${platform}.com`
            });
        }
    }
});
// Implement platform-specific endpoints to match your Flutter app

// Twitter endpoint
// Replace the Twitter endpoint with this improved version

// Twitter endpoint with enhanced handling
app.get('/api/twitter', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        console.log(`Processing Twitter URL: ${url}`);

        // Try with our enhanced Twitter handler
        const twData = await processTwitterWithYtdl(url);

        if (twData.success) {
            // If we have a local file path, use it for direct download
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
                // If we have a local file, we already have the streaming URL
                directUrl: hasLocalFile ? twData.data.url : `/api/direct?url=${encodeURIComponent(twData.data.url)}`
            };

            return res.json(formattedResponse);
        }

        throw new Error('Twitter processing failed');
    } catch (error) {
        console.error('Twitter endpoint error:', error);

        // Try one more approach using alldown directly
        try {
            const twData = await alldown(url);

            if (twData && twData.data && (twData.data.low || twData.data.high)) {
                const formattedData = await formatData('twitter', twData);

                return res.json({
                    title: formattedData.title,
                    formats: [{
                        itag: 'twitter_high',
                        quality: 'High Quality',
                        mimeType: 'video/mp4',
                        url: formattedData.url,
                        hasAudio: true,
                        hasVideo: true,
                    }],
                    thumbnails: [{ url: formattedData.thumbnail }],
                    platform: 'twitter',
                    mediaType: 'video',
                });
            }
        } catch (alldownError) {
            console.warn('Final Twitter fallback with alldown failed:', alldownError.message);
        }

        res.status(500).json({
            error: 'Twitter processing failed',
            details: error.message,
            suggestion: 'Twitter may be restricting this video. Try downloading with a browser extension instead.'
        });
    }
});
app.get('/api/youtube-music', async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    const ytData = await youtubeController.downloadYouTubeMusic(url);

    // Format the response to match your existing API format
    const isLocalFile = !!ytData.localFilePath;
    
    return res.json({
      title: ytData.title || 'YouTube Music',
      formats: [{
        itag: 'ytmusic_high',
        quality: 'High Quality Audio',
        mimeType: 'audio/mp3',
        url: ytData.high || '',
        hasAudio: true,
        hasVideo: false,
      }],
      thumbnails: [{ url: ytData.thumbnail || 'https://via.placeholder.com/300x150' }],
      platform: 'youtube_music',
      mediaType: 'audio',
      // If we have a local file, we already have the streaming URL
      directUrl: isLocalFile ? ytData.high : `/api/direct?url=${encodeURIComponent(ytData.high)}&referer=youtube.com`,
      source: ytData.source || 'unknown',
      isAudio: true
    });
  } catch (error) {
    console.error('YouTube Music endpoint error:', error);
    res.status(500).json({ error: 'YouTube Music processing failed', details: error.message });
  }
});
app.get('/api/pinterest', async (req, res) => {
    try {
      const { url } = req.query;
  
      if (!url) {
        return res.status(400).json({ error: 'URL is required' });
      }
  
      console.log(`Processing Pinterest URL: ${url}`);
  
      // User agent for Pinterest requests
      const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36';
  
      // First, get the actual page to find image data
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
      console.log(`Pinterest HTML retrieved: ${html.length} bytes`);
  
      // Extract title
      let title = 'Pinterest Media';
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        title = titleMatch[1].replace(' | Pinterest', '').trim();
      }
  
      // ==========================================
      // NEW CODE: Video detection section
      // ==========================================
      console.log("Looking for video content first...");
  
      // Multiple patterns to find Pinterest videos
      const videoPatterns = [
        /"video_url":"([^"]+)"/i,                     // Common pattern
        /"contentUrl":\s*"(https:\/\/v\.pinimg\.com[^"]+)"/i, // From JSON-LD
        /"contentUrl":\s*"([^"]+\.mp4[^"]*)"/i,       // Generic mp4 in JSON-LD
        /'contentUrl':\s*'([^']+\.mp4[^']*)'/i,       // Alternative quotes
        /<meta\s+property="og:video"\s+content="([^"]+)"/i,  // Open Graph video tag
        /<meta\s+property="og:video:url"\s+content="([^"]+)"/i,  // OG video URL
        /"v_hd":\s*\{[^}]*"url":\s*"([^"]+)"/i,       // HD video URL in JSON
        /"v_sd":\s*\{[^}]*"url":\s*"([^"]+)"/i,       // SD video URL in JSON
        /https:\/\/v\.pinimg\.com\/videos\/mc\/[^"'\s]+\.mp4/i  // Direct pattern search
      ];
  
      // Try each pattern
      let videoUrl = null;
      for (const pattern of videoPatterns) {
        const match = html.match(pattern);
        if (match && match[1]) {
          videoUrl = match[1]
            .replace(/\\u002F/g, '/')
            .replace(/\\\//g, '/')
            .replace(/\\/g, '')
            .replace(/&amp;/g, '&');
          console.log(`Found potential video URL using pattern ${pattern}: ${videoUrl}`);
          break;
        }
      }
  
      // If no video URL found with regex, try to look in JSON data chunks
      if (!videoUrl) {
        console.log("No video found with regex patterns, looking in JSON data...");
        
        // Look for JSON data in script tags
        const jsonScripts = html.match(/<script[^>]*type="application\/json"[^>]*>([^<]+)<\/script>/g);
        if (jsonScripts) {
          for (const scriptTag of jsonScripts) {
            try {
              const jsonContent = scriptTag.match(/<script[^>]*>([^<]+)<\/script>/)[1];
              const data = JSON.parse(jsonContent);
              
              // Navigate through the JSON data looking for video URLs
              // This is a recursive function to search deeply nested objects
              const findVideoUrls = (obj, path = '') => {
                if (!obj) return null;
                
                // If this is a string that looks like a video URL, return it
                if (typeof obj === 'string' && 
                    (obj.includes('v.pinimg.com') || 
                     obj.includes('.mp4') || 
                     obj.includes('/videos/')) &&
                    obj.startsWith('http')) {
                  console.log(`Found video URL in JSON at path ${path}: ${obj}`);
                  return obj;
                }
                
                // If it's an object, search its properties
                if (typeof obj === 'object') {
                  // First check some common key names
                  const videoKeys = ['video_url', 'videoUrl', 'mp4Url', 'contentUrl', 'url'];
                  for (const key of videoKeys) {
                    if (obj[key] && typeof obj[key] === 'string' && 
                        (obj[key].includes('.mp4') || 
                         obj[key].includes('v.pinimg.com') || 
                         obj[key].includes('/videos/'))) {
                      console.log(`Found video URL in JSON with key ${key}: ${obj[key]}`);
                      return obj[key];
                    }
                  }
                  
                  // Then recursively search all properties
                  for (const key in obj) {
                    const result = findVideoUrls(obj[key], `${path}.${key}`);
                    if (result) return result;
                  }
                }
                
                // If it's an array, search its items
                if (Array.isArray(obj)) {
                  for (let i = 0; i < obj.length; i++) {
                    const result = findVideoUrls(obj[i], `${path}[${i}]`);
                    if (result) return result;
                  }
                }
                
                return null;
              };
              
              const foundUrl = findVideoUrls(data);
              if (foundUrl) {
                videoUrl = foundUrl
                  .replace(/\\u002F/g, '/')
                  .replace(/\\\//g, '/')
                  .replace(/\\/g, '')
                  .replace(/&amp;/g, '&');
                break;
              }
            } catch (jsonError) {
              console.warn(`Error parsing JSON in script tag: ${jsonError.message}`);
              // Continue to next script tag
            }
          }
        }
      }
  
      // If video URL found, validate and prepare response
      if (videoUrl) {
        console.log(`Found Pinterest video URL: ${videoUrl}`);
        
        // Get thumbnail for the video
        let thumbnail = '';
        const thumbnailPatterns = [
          /"image_url":"([^"]+)"/i,
          /"poster_images":\["([^"]+)"\]/i,
          /<meta property="og:image" content="([^"]+)"/i,
          /"thumbnails":\s*\{[^}]*"orig":\s*"([^"]+)"/i
        ];
        
        for (const pattern of thumbnailPatterns) {
          const match = html.match(pattern);
          if (match && match[1]) {
            thumbnail = match[1].replace(/\\/g, '');
            console.log(`Found video thumbnail: ${thumbnail}`);
            break;
          }
        }
        
        // Always make a validation call to ensure this is really a video
        try {
          const videoCheck = await fetch(videoUrl, {
            method: 'HEAD',
            headers: { 
              'User-Agent': userAgent,
              'Referer': 'https://www.pinterest.com/'
            }
          });
          
          const contentType = videoCheck.headers.get('content-type');
          console.log(`Video validation check: status=${videoCheck.status}, content-type=${contentType}`);
          
          if (videoCheck.ok) {
            // If content type is not video, but URL ends with .mp4, trust the extension
            const isVideoContent = contentType && contentType.includes('video');
            const hasVideoExtension = videoUrl.toLowerCase().includes('.mp4');
            
            if (!isVideoContent && !hasVideoExtension) {
              console.warn(`Warning: URL doesn't appear to be a video (${contentType})`);
              // Continue anyway - Pinterest sometimes serves videos with incorrect content types
            }
          }
        } catch (validationError) {
          console.warn(`Video validation error: ${validationError.message}`);
          // Continue anyway, validation is just a precaution
        }
        
        // Return video data
        return res.json({
          title: title,
          thumbnails: [{ url: thumbnail || 'https://via.placeholder.com/300x150', width: 480, height: 480 }],
          formats: [{
            itag: 'pin_video_0',
            quality: 'Original Quality',
            mimeType: 'video/mp4',
            url: videoUrl,
            hasAudio: true,
            hasVideo: true,
            contentLength: 0,
            container: 'mp4'
          }],
          platform: 'pinterest',
          mediaType: 'video',
          directUrl: `/api/direct?url=${encodeURIComponent(videoUrl)}&referer=pinterest.com`,
          // Include the thumbnail URL specifically for clients that need it
          thumbnailUrl: thumbnail || 'https://via.placeholder.com/300x150'
        });
      }
      
      console.log("No video found, looking for images...");
      // ==========================================
      // END OF NEW CODE
      // ==========================================
  
      // Method 1: Find image URLs directly in the HTML
      let imageUrls = [];
  
      // Look for high-res originals first
      const originalImages = html.match(/https:\/\/i\.pinimg\.com\/originals\/[a-zA-Z0-9\/\._-]+\.(?:jpg|jpeg|png|gif)/gi);
      if (originalImages && originalImages.length > 0) {
        imageUrls = [...new Set(originalImages)]; // Remove duplicates
      }
  
      // If no originals, look for specific sizes (736x is common for Pinterest)
      if (imageUrls.length === 0) {
        const sizedImages = html.match(/https:\/\/i\.pinimg\.com\/[0-9]+x(?:\/[a-zA-Z0-9\/\._-]+\.(?:jpg|jpeg|png|gif))/gi);
        if (sizedImages && sizedImages.length > 0) {
          imageUrls = [...new Set(sizedImages)]; // Remove duplicates
        }
      }
  
      // Method 2: Extract from JSON data
      if (imageUrls.length === 0) {
        const jsonMatch = html.match(/\{"resourceResponses":\[.*?\].*?\}/g);
        if (jsonMatch && jsonMatch.length > 0) {
          try {
            const data = JSON.parse(jsonMatch[0]);
            if (data.resourceResponses && data.resourceResponses.length > 0) {
              const resources = data.resourceResponses[0].response?.data;
  
              if (resources) {
                // Try to extract from pin data
                if (resources.pin) {
                  const pin = resources.pin;
  
                  // Update title if available
                  if (pin.title) {
                    title = pin.title;
                  }
  
                  // Get images
                  if (pin.images && pin.images.orig) {
                    imageUrls.push(pin.images.orig.url);
                  }
  
                  // Get all available sizes
                  if (pin.images) {
                    Object.values(pin.images).forEach(img => {
                      if (img && img.url) {
                        imageUrls.push(img.url);
                      }
                    });
                  }
                }
  
                // Extract from multiple pins in a board
                if (resources.board?.pins) {
                  resources.board.pins.forEach(pin => {
                    if (pin.images && pin.images.orig) {
                      imageUrls.push(pin.images.orig.url);
                    }
                  });
                }
              }
            }
          } catch (jsonError) {
            console.error('Error parsing Pinterest JSON data:', jsonError);
          }
        }
      }
  
      // Method 3: Look for specialized Pinterest schema data
      if (imageUrls.length === 0) {
        const schemaMatch = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
        if (schemaMatch && schemaMatch[1]) {
          try {
            const schemaData = JSON.parse(schemaMatch[1]);
            if (schemaData.image) {
              if (Array.isArray(schemaData.image)) {
                imageUrls = imageUrls.concat(schemaData.image);
              } else {
                imageUrls.push(schemaData.image);
              }
            }
  
            // Update title if available
            if (schemaData.name) {
              title = schemaData.name;
            }
          } catch (schemaError) {
            console.error('Error parsing Pinterest schema data:', schemaError);
          }
        }
      }
  
      // Method 4: Extract from og:image meta tags
      if (imageUrls.length === 0) {
        const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
        if (ogImageMatch && ogImageMatch[1]) {
          imageUrls.push(ogImageMatch[1]);
        }
      }
  
      // Fallback for when no images are found
      if (imageUrls.length === 0) {
        return res.status(404).json({
          error: 'No images or videos found on this Pinterest page',
          details: 'Try opening the pin in a browser and copying the URL directly'
        });
      }
  
      // Remove duplicates and filter out invalid URLs
      imageUrls = [...new Set(imageUrls)].filter(url =>
        url && url.startsWith('http') &&
        /\.(jpg|jpeg|png|gif|webp)/i.test(url)
      );
  
      // Sort by quality (prioritize originals and larger sizes)
      imageUrls.sort((a, b) => {
        // Original images are preferred
        if (a.includes('/originals/') && !b.includes('/originals/')) return -1;
        if (!a.includes('/originals/') && b.includes('/originals/')) return 1;
  
        // Check for resolution indicators
        const sizesA = a.match(/\/([0-9]+)x\//);
        const sizesB = b.match(/\/([0-9]+)x\//);
  
        if (sizesA && sizesB) {
          return parseInt(sizesB[1]) - parseInt(sizesA[1]); // Higher resolution first
        }
  
        return b.length - a.length; // Longer URLs usually contain more metadata
      });
  
      // Create format objects for each image
      const formats = imageUrls.map((url, index) => {
        // Try to determine quality from URL
        let quality = 'Standard';
  
        if (url.includes('/originals/')) {
          quality = 'Original';
        } else {
          const sizeMatch = url.match(/\/([0-9]+)x\//);
          if (sizeMatch && sizeMatch[1]) {
            quality = `${sizeMatch[1]}px`;
          }
        }
  
        // Determine image format
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
// Replace your existing Facebook endpoint in main server with this one from your old server
// Updated Facebook endpoint with mobile URL handling integration
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

// Threads endpoint
app.get('/api/threads', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        // First try with shaon-media-downloader
        try {
            const threadsData = await threads(url);

            if (threadsData && threadsData.data && threadsData.data.video) {
                const formattedData = await formatData('threads', threadsData);

                return res.json({
                    title: formattedData.title,
                    formats: [{
                        itag: 'threads_0',
                        quality: 'Original Quality',
                        mimeType: 'video/mp4',
                        url: formattedData.url,
                        hasAudio: true,
                        hasVideo: true,
                    }],
                    thumbnails: [{ url: formattedData.thumbnail }],
                    platform: 'threads',
                    mediaType: 'video',
                });
            }
        } catch (threadsErr) {
            console.warn('Threads download with shaon-media-downloader failed:', threadsErr.message);
        }

        // Fallback to your implementation
        const threadsData = await processThreadsUrl(url);

        if (threadsData.success) {
            const isVideo = threadsData.data.url.includes('.mp4');

            const formattedResponse = {
                title: threadsData.data.title,
                formats: [{
                    itag: 'threads_0',
                    quality: 'Original Quality',
                    mimeType: isVideo ? 'video/mp4' : 'image/jpeg',
                    url: threadsData.data.url,
                    hasAudio: isVideo,
                    hasVideo: isVideo,
                }],
                thumbnails: [{ url: threadsData.data.thumbnail }],
                platform: 'threads',
                mediaType: isVideo ? 'video' : 'image',
            };

            return res.json(formattedResponse);
        }

        throw new Error('Threads processing failed');
    } catch (error) {
        console.error('Threads endpoint error:', error);
        res.status(500).json({ error: 'Threads processing failed', details: error.message });
    }
});

app.get('/api/youtube', async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    const ytData = await youtubeController.downloadYouTubeVideo(url);

    // Format the response specifically for your app
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
      // Include direct URLs for client to use
      directUrl: ytData.high
    });
  } catch (error) {
    console.error('YouTube endpoint error:', error);
    res.status(500).json({ error: 'YouTube processing failed', details: error.message });
  }
});
    
// Audio platforms handler (Spotify, SoundCloud, etc.)
app.get('/api/audio-platform', async (req, res) => {
    const { url, platform } = req.query;

    if (!url || !platform) {
        return res.status(400).json({ error: 'URL and platform are required' });
    }

    try {
        // Use youtube-dl for audio platforms
        const info = await youtubeDl(url, {
            dumpSingleJson: true,
            noCheckCertificates: true,
            noWarnings: true,
            extractAudio: true,
            audioFormat: 'mp3',
        });

        // Find the best audio format
        const formats = (info.formats || [])
            .filter(f => f.acodec !== 'none')
            .map(format => {
                return {
                    itag: format.format_id,
                    quality: format.format_note || 'Unknown',
                    mimeType: format.ext ? `audio/${format.ext}` : 'audio/mp3',
                    url: format.url,
                    hasAudio: true,
                    hasVideo: false,
                };
            });

        if (formats.length === 0) {
            throw new Error('No audio formats found');
        }

        res.json({
            title: info.title || `${platform} Audio`,
            thumbnails: info.thumbnail ? [{ url: info.thumbnail }] : [{ url: 'https://via.placeholder.com/300x150' }],
            formats,
            platform,
            mediaType: 'audio',
        });
    } catch (error) {
        console.error(`${platform} endpoint error:`, error);
        res.status(500).json({ error: `${platform} processing failed`, details: error.message });
    }
});

// Direct download endpoint
// Direct download endpoint
app.get('/api/direct', async (req, res) => {
    const { url, filename } = req.query;
    
    // Special handling for Pinterest videos
    if (url.includes('v.pinimg.com') || (url.includes('pinimg.com') && url.includes('.mp4'))) {
        console.log('Pinterest video URL detected, applying special handling');
        
        const pinterestHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Range': 'bytes=0-',  // Critical for video streaming
            'Referer': 'https://www.pinterest.com/',
            'Origin': 'https://www.pinterest.com',
            'Sec-Fetch-Dest': 'video',
            'Sec-Fetch-Mode': 'cors', 
            'Sec-Fetch-Site': 'cross-site'
        };
        
        // Clean the URL - Pinterest often has escaped characters
        const cleanedUrl = url
            .replace(/\\u002F/g, '/')
            .replace(/\\\//g, '/')
            .replace(/\\/g, '')
            .replace(/&amp;/g, '&');
        
        console.log(`Using cleaned Pinterest video URL: ${cleanedUrl}`);
        
        try {
            const downloadResp = await fetch(cleanedUrl, {
                headers: pinterestHeaders,
                redirect: 'follow'
            });
            
            if (!downloadResp.ok) {
                throw new Error(`Failed to fetch Pinterest video: ${downloadResp.status}`);
            }
            
            const contentType = downloadResp.headers.get('content-type') || 'video/mp4';
            console.log(`Pinterest video content type: ${contentType}`);
            
            let outputFilename = filename || 'pinterest-video.mp4';
            
            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Disposition', `attachment; filename="${outputFilename}"`);
            
            downloadResp.body.pipe(res);
            return; // Exit the function early
        } catch (error) {
            console.error('Pinterest video download error:', error);
            // Continue with normal processing as fallback
        }
    }

    // Special handling for Facebook Mobile sharing URLs
    if (url.includes('m.facebook.com/share/v/')) {
        console.log(`Facebook mobile sharing URL detected: ${url}`);
        try {
            // Process the URL with our specialized handler
            const mobileResult = await processFacebookMobileUrl(url);
            if (mobileResult && mobileResult.success && mobileResult.data.url) {
                url = mobileResult.data.url;
                console.log(`Resolved Facebook mobile URL to: ${url}`);
            }
        } catch (fbMobileError) {
            console.error(`Error processing Facebook mobile URL: ${fbMobileError.message}`);
            // Continue with original URL if processing fails
        }
    }

    // Always use Facebook-specific headers for any Facebook URLs or fbcdn.net URLs
    let headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': new URL(url).origin,
    };

    // Special handling for Facebook videos (especially those with black screen issues)
    if (url.includes('facebook.com') || url.includes('fb.watch') || url.includes('fb.com') ||
        url.includes('fbcdn.net') || url.includes('video.xx.fbcdn.net')) {

        console.log('Detected Facebook URL, applying specialized handling');

        // Check if it's a mobile share URL which needs special processing
        const isMobileShare = url.includes('m.facebook.com/share/v/') ||
            (url.includes('fb.watch') && !url.includes('.mp4'));

        // First try to resolve the URL using our Facebook endpoint
        if (isMobileShare || !url.includes('.mp4')) {
            try {
                console.log('Not a direct media URL, resolving through Facebook endpoint');
                const fbResponse = await fetch(`http://localhost:${PORT}/api/facebook?url=${encodeURIComponent(url)}`);

                if (fbResponse.ok) {
                    const fbData = await fbResponse.json();

                    if (fbData && fbData.formats && fbData.formats.length > 0) {
                        // Check for HD version first
                        const hdFormat = fbData.formats.find(f =>
                            f.quality && (f.quality.includes('HD') || f.quality.includes('720'))
                        );

                        // Use HD if available, otherwise first format
                        const bestFormat = hdFormat || fbData.formats[0];

                        // Update the URL to use the direct video URL
                        console.log(`Using resolved Facebook URL: ${bestFormat.url}`);
                        url = bestFormat.url;
                    }
                }
            } catch (fbResolveError) {
                console.error(`Error resolving Facebook URL: ${fbResolveError.message}`);
                // Continue with original URL
            }
        }

        // Facebook requires specific headers
        const fbHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Range': 'bytes=0-',  // This helps with some Facebook videos
            'Referer': 'https://www.facebook.com/',
            'Origin': 'https://www.facebook.com',
            'Sec-Fetch-Dest': 'video',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'cross-site',
            'Connection': 'keep-alive'
        };

        // Sometimes using a mobile user agent helps
        if (url.includes('m.facebook.com')) {
            fbHeaders['User-Agent'] = 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1';
        }

        headers = fbHeaders;
    }

    // If we have a specific referer from the query, use it
    if (req.query.referer) {
        headers['Referer'] = req.query.referer.startsWith('http')
            ? req.query.referer
            : `https://${req.query.referer}`;
    }

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        console.log(`Processing direct download: ${url}`);

        const downloadResp = await fetch(url, {
            headers: headers,
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

// Download endpoint - FIXED VERSION
app.get('/api/download', async (req, res) => {
    try {
        let { url, itag } = req.query;
        
        // Special handling for Pinterest URLs
        if (url.includes('pinterest.com') || url.includes('pin.it')) {
            console.log('Pinterest URL detected, using enhanced handler...');
            try {
                // First try our dedicated Pinterest endpoint to resolve the media URL
                const pinterestResponse = await fetch(`http://localhost:${PORT}/api/pinterest?url=${encodeURIComponent(url)}`);
                
                if (!pinterestResponse.ok) {
                    throw new Error(`Pinterest endpoint returned status: ${pinterestResponse.status}`);
                }
                
                const pinterestData = await pinterestResponse.json();
                
                // Get the best format (first one in the formats array)
                if (pinterestData.formats && pinterestData.formats.length > 0) {
                    const format = pinterestData.formats[0];
                    let directUrl = format.url;
                    const isVideo = format.mimeType && format.mimeType.includes('video');
                    
                    console.log(`Resolved Pinterest URL to direct media: ${directUrl}`);
                    console.log(`Media type: ${isVideo ? 'Video' : 'Image'}`);
                    
                    // Clean up URL - especially important for videos
                    directUrl = directUrl
                        .replace(/\\u002F/g, '/')
                        .replace(/\\\//g, '/')
                        .replace(/\\/g, '')
                        .replace(/&amp;/g, '&');
                    
                    // Update the URL to the direct media URL
                    url = directUrl;
                    
                    // Set up file info
                    const fileExt = isVideo ? 'mp4' : (format.container || 'jpg');
                    const tempFilePath = path.join(TEMP_DIR, `pinterest-${Date.now()}.${fileExt}`);
                    
                    // Prepare headers based on content type
                    const headers = {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Referer': 'https://www.pinterest.com/',
                        'Origin': 'https://www.pinterest.com'
                    };
                    
                    // Add video-specific headers if it's a video
                    if (isVideo) {
                        headers['Accept'] = '*/*';
                        headers['Accept-Language'] = 'en-US,en;q=0.9';
                        headers['Range'] = 'bytes=0-';
                        headers['Sec-Fetch-Dest'] = 'video';
                        headers['Sec-Fetch-Mode'] = 'cors';
                        headers['Sec-Fetch-Site'] = 'cross-site';
                        console.log('Using video-specific headers for Pinterest video');
                    } else {
                        headers['Accept'] = 'image/*, */*';
                    }
                    
                    try {
                        console.log(`Downloading Pinterest ${isVideo ? 'video' : 'image'} directly...`);
                        
                        // For videos, try to validate the URL first with a HEAD request
                        if (isVideo) {
                            try {
                                const headResponse = await fetch(directUrl, {
                                    method: 'HEAD',
                                    headers,
                                    redirect: 'follow'
                                });
                                
                                if (headResponse.ok) {
                                    const contentType = headResponse.headers.get('content-type');
                                    console.log(`Pinterest content type: ${contentType}`);
                                    
                                    // If it's not a video content type, warn but continue
                                    if (contentType && !contentType.includes('video')) {
                                        console.warn(`Warning: URL doesn't appear to be a video (${contentType}), but continuing anyway`);
                                    }
                                }
                            } catch (headError) {
                                console.warn(`HEAD request failed, continuing anyway: ${headError.message}`);
                            }
                        }
                        
                        // Now download the actual file
                        const downloadResponse = await fetch(directUrl, {
                            headers,
                            redirect: 'follow'
                        });
                        
                        if (!downloadResponse.ok) {
                            throw new Error(`Pinterest download failed with status: ${downloadResponse.status}`);
                        }
                        
                        const fileStream = fs.createWriteStream(tempFilePath);
                        await new Promise((resolve, reject) => {
                            downloadResponse.body.pipe(fileStream);
                            downloadResponse.body.on('error', reject);
                            fileStream.on('finish', resolve);
                        });
                        
                        console.log(`Successfully downloaded Pinterest media to ${tempFilePath}`);
                        
                        // Check if the file is valid
                        const stat = fs.statSync(tempFilePath);
                        
                        // Different minimum size checks for videos vs images
                        const minSize = isVideo ? 10000 : 100; // 10KB for videos, 100 bytes for images
                        if (stat.size < minSize) {
                            throw new Error(`Downloaded file is too small (${stat.size} bytes), likely not valid`);
                        }
                        
                        // Determine content type based on what we know
                        let contentType = 'application/octet-stream';
                        if (isVideo) {
                            contentType = 'video/mp4';
                        } else if (fileExt === 'jpg' || fileExt === 'jpeg') {
                            contentType = 'image/jpeg';
                        } else if (fileExt === 'png') {
                            contentType = 'image/png';
                        } else if (fileExt === 'gif') {
                            contentType = 'image/gif';
                        } else if (fileExt === 'webp') {
                            contentType = 'image/webp';
                        }
                        
                        // Set response headers
                        res.setHeader('Content-Length', stat.size);
                        res.setHeader('Content-Type', contentType);
                        
                        // Format filename
                        const safeTitle = pinterestData.title ? 
                            pinterestData.title.replace(/[^a-z0-9]/gi, '_').substring(0, 20) : 
                            'pinterest-media';
                        
                        res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.${fileExt}"`);
                        
                        // Send the file
                        const responseStream = fs.createReadStream(tempFilePath);
                        responseStream.pipe(res);
                        
                        // Clean up the temp file
                        responseStream.on('end', () => {
                            fs.unlink(tempFilePath, (err) => {
                                if (err) console.error('Error deleting temp file:', err);
                            });
                        });
                        
                        // Return from the function early since we've handled the response
                        return;
                    } catch (directDownloadError) {
                        console.error('Direct Pinterest download failed:', directDownloadError);
                        console.log('Continuing with the regular download process using the direct URL');
                        // Continue with the regular download process using the direct URL
                    }
                } else {
                    console.warn('No formats found in Pinterest data, falling back to normal processing');
                }
            } catch (pinterestEndpointError) {
                console.error(`Pinterest endpoint error: ${pinterestEndpointError.message}`);
                console.log('Falling back to direct download using ffmpeg...');
                
                // If the Pinterest endpoint fails, try a more direct approach
                try {
                    // This is a last-resort approach for videos using ffmpeg
                    const tempFilePath = path.join(TEMP_DIR, `pinterest-${Date.now()}.mp4`);
                    const ffmpegPath = 'ffmpeg'; // Make sure ffmpeg is installed
                    
                    // More robust headers
                    const headers = {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Referer': 'https://www.pinterest.com/',
                    };
                    
                    // Try ffmpeg for more robust video download
                    const ffmpegCmd = `${ffmpegPath} -headers "User-Agent: ${headers['User-Agent']}" -headers "Referer: ${headers.Referer}" -i "${url}" -c copy -y "${tempFilePath}"`;
                    
                    console.log('Executing ffmpeg command for Pinterest video');
                    
                    const { exec } = require('child_process');
                    await new Promise((resolve, reject) => {
                        exec(ffmpegCmd, (error, stdout, stderr) => {
                            if (error) {
                                console.error(`ffmpeg error: ${error.message}`);
                                return reject(error);
                            }
                            resolve();
                        });
                    });
                    
                    // Check if ffmpeg created a valid file
                    if (fs.existsSync(tempFilePath) && fs.statSync(tempFilePath).size > 10000) {
                        console.log(`Successfully downloaded Pinterest video with ffmpeg: ${tempFilePath}`);
                        
                        const stat = fs.statSync(tempFilePath);
                        
                        res.setHeader('Content-Length', stat.size);
                        res.setHeader('Content-Type', 'video/mp4');
                        res.setHeader('Content-Disposition', `attachment; filename="pinterest-video.mp4"`);
                        
                        const fileStream = fs.createReadStream(tempFilePath);
                        fileStream.pipe(res);
                        
                        fileStream.on('end', () => {
                            fs.unlink(tempFilePath, (err) => {
                                if (err) console.error('Error deleting temp file:', err);
                            });
                        });
                        
                        return; // Exit early as we're handling the response
                    }
                    
                    // If ffmpeg failed, continue with normal processing
                    console.warn('ffmpeg approach failed or produced invalid file, continuing with normal processing');
                    
                } catch (ffmpegError) {
                    console.error(`ffmpeg approach failed: ${ffmpegError.message}`);
                    // Continue to standard processing
                }
            }
        }

        // Special handling for music and video platforms
        const platform = identifyPlatform(url);
        const isAudioPlatform = ['spotify', 'soundcloud', 'bandcamp', 'deezer', 'apple_music',
            'amazon_music', 'mixcloud', 'audiomack'].includes(platform);
        const isVideoPlatform = ['vimeo', 'dailymotion', 'twitch', 'reddit', 'linkedin', 
            'tumblr', 'vk', 'bilibili', 'snapchat'].includes(platform);

        if (isAudioPlatform || isVideoPlatform) {
            console.log(`Special handling for ${platform} (${isAudioPlatform ? 'audio' : 'video'} platform)`);
            
            // Verify not just a homepage URL
            try {
                const uri = new URL(url);
                if (uri.pathname === '/' || uri.pathname === '') {
                    return res.status(400).json({ 
                        error: 'Invalid URL',
                        message: `Please provide a URL to a specific ${platform} content, not just the homepage`
                    });
                }
            } catch (urlError) {
                console.warn(`URL parsing error: ${urlError.message}`);
                // Continue anyway as this error might be unrelated to the path
            }

            // Create unique file name
            const uniqueId = Date.now();
            const fileExt = isAudioPlatform ? 'mp3' : 'mp4';
            const tempFilePath = path.join(TEMP_DIR, `${platform}-${uniqueId}.${fileExt}`);
            
            // Configure youtube-dl options based on platform
            const options = {
                output: tempFilePath,
                noCheckCertificates: true,
                noWarnings: true,
                preferFreeFormats: true,
                addHeader: [
                    'referer:' + new URL(url).origin,
                    'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                ],
            };

            // Set format based on platform type
            if (isAudioPlatform) {
                options.extractAudio = true;
                options.audioFormat = 'mp3';
                options.audioQuality = 0;
                options.format = itag && itag !== 'best' ? itag : 'bestaudio';
            } else {
                options.format = itag && itag !== 'best' ? itag : 'best';
            }

            try {
                console.log(`Downloading ${platform} content with youtube-dl using format: ${options.format}`);
                await youtubeDl(url, options);
                console.log(`youtube-dl completed for ${platform}`);
                
                // Check if the file was created successfully
                if (!fs.existsSync(tempFilePath)) {
                    throw new Error(`Download failed - file not created for ${platform}`);
                }
                
                const stat = fs.statSync(tempFilePath);
                
                // Make sure the file has actual content
                if (stat.size === 0) {
                    fs.unlinkSync(tempFilePath);
                    throw new Error(`Downloaded file for ${platform} is empty`);
                }
                
                console.log(`Successfully downloaded ${platform} file (${stat.size} bytes)`);
                
                // Determine content type for response
                let contentType = 'application/octet-stream';
                if (fileExt === 'mp4') contentType = 'video/mp4';
                else if (fileExt === 'mp3') contentType = 'audio/mpeg';
                
                // Determine a friendly filename
                const filename = `${platform}-download.${fileExt}`;
                
                // Stream the file to the client
                res.setHeader('Content-Length', stat.size);
                res.setHeader('Content-Type', contentType);
                res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                
                const fileStream = fs.createReadStream(tempFilePath);
                fileStream.pipe(res);
                
                fileStream.on('end', () => {
                    fs.unlink(tempFilePath, (err) => {
                        if (err) console.error('Error deleting temp file:', err);
                    });
                });
                
                return; // Exit early as we're handling the response
            } catch (ytdlError) {
                console.error(`youtube-dl error for ${platform}: ${ytdlError.message}`);
                
                // Platform-specific fallbacks
                try {
                    console.log(`Attempting specialized fallback for ${platform}`);
                    
                    // Choose fallback based on platform
                    if (platform === 'soundcloud') {
                        await handleSoundCloudDownload(url, tempFilePath);
                    } else if (platform === 'vimeo') {
                        await handleVimeoDownload(url, tempFilePath);
                    } else if (platform === 'spotify') {
                        await handleSpotifyDownload(url, tempFilePath);
                    } else {
                        // Generic direct download attempt
                        await handleDirectDownload(url, tempFilePath, platform);
                    }
                    
                    // If we reach here, the fallback was successful
                    const stat = fs.statSync(tempFilePath);
                    
                    // Determine content type
                    let contentType = isAudioPlatform ? 'audio/mpeg' : 'video/mp4';
                    
                    // Determine a friendly filename
                    const filename = `${platform}-download.${fileExt}`;
                    
                    // Stream the file to the client
                    res.setHeader('Content-Length', stat.size);
                    res.setHeader('Content-Type', contentType);
                    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                    
                    const fileStream = fs.createReadStream(tempFilePath);
                    fileStream.pipe(res);
                    
                    fileStream.on('end', () => {
                        fs.unlink(tempFilePath, (err) => {
                            if (err) console.error('Error deleting temp file:', err);
                        });
                    });
                    
                    return; // Exit early as we're handling the response
                } catch (fallbackError) {
                    console.error(`Fallback also failed for ${platform}: ${fallbackError.message}`);
                    // Continue with the rest of the download logic (we'll fall through to the standard handling below)
                }
            }
        }

        // Special handling for Twitter URLs
        if (url.includes('twitter.com') || url.includes('x.com')) {
            try {
                console.log('Using enhanced Twitter download handler for this URL');
                const twitterData = await processTwitterWithYtdl(url);

                if (twitterData.success) {
                    // If we have a local file already downloaded, stream it directly
                    if (twitterData.data.localFilePath && fs.existsSync(twitterData.data.localFilePath)) {
                        console.log(`Using already downloaded Twitter file: ${twitterData.data.localFilePath}`);

                        const stat = fs.statSync(twitterData.data.localFilePath);

                        res.setHeader('Content-Length', stat.size);
                        res.setHeader('Content-Type', 'video/mp4');
                        res.setHeader('Content-Disposition', 'attachment; filename="twitter-video.mp4"');

                        const fileStream = fs.createReadStream(twitterData.data.localFilePath);
                        fileStream.pipe(res);

                        return; // Exit early as we're handling the response
                    }

                    // Otherwise use the direct URL
                    url = twitterData.data.url;
                    console.log(`Using Twitter direct URL: ${url}`);
                }
            } catch (twitterError) {
                console.error(`Twitter handler error in download endpoint: ${twitterError.message}`);
                // Continue with normal download
            }
        }

        // Handle issues with URL formatting (remove any trailing spaces)
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        url = url.trim();

        // For direct media URLs, don't use youtube-dl
        const isDirect = url.includes('.mp4') || url.includes('.jpg') || url.includes('.png') ||
            url.includes('.mp3') || url.includes('scontent.cdninstagram.com') ||
            url.includes('fbcdn.net');

        const uniqueId = Date.now();
        const tempFilePath = path.join(TEMP_DIR, `download-${uniqueId}.mp4`);

        if (isDirect) {
            console.log('Direct media URL detected, using direct download instead of youtube-dl');
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
// Special handling for music and video platforms
const platform = identifyPlatform(url);
const isAudioPlatform = ['spotify', 'soundcloud', 'bandcamp', 'deezer', 'apple_music',
    'amazon_music', 'mixcloud', 'audiomack'].includes(platform);
const isVideoPlatform = ['vimeo', 'dailymotion', 'twitch', 'reddit', 'linkedin', 
    'tumblr', 'vk', 'bilibili', 'snapchat'].includes(platform);

if (isAudioPlatform || isVideoPlatform) {
    console.log(`Special handling for ${platform} (${isAudioPlatform ? 'audio' : 'video'} platform)`);
    
    // Verify not just a homepage URL
    try {
        const uri = new URL(url);
        if (uri.pathname === '/' || uri.pathname === '') {
            return res.status(400).json({ 
                error: 'Invalid URL',
                message: `Please provide a URL to a specific ${platform} content, not just the homepage`
            });
        }
    } catch (urlError) {
        console.warn(`URL parsing error: ${urlError.message}`);
        // Continue anyway as this error might be unrelated to the path
    }

    // Create unique file name
    const uniqueId = Date.now();
    const fileExt = isAudioPlatform ? 'mp3' : 'mp4';
    const tempFilePath = path.join(TEMP_DIR, `${platform}-${uniqueId}.${fileExt}`);
    
    // Configure youtube-dl options based on platform
    const options = {
        output: tempFilePath,
        noCheckCertificates: true,
        noWarnings: true,
        preferFreeFormats: true,
        addHeader: [
            'referer:' + new URL(url).origin,
            'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ],
    };

    // Set format based on platform type
    if (isAudioPlatform) {
        options.extractAudio = true;
        options.audioFormat = 'mp3';
        options.audioQuality = 0;
        options.format = itag && itag !== 'best' ? itag : 'bestaudio';
    } else {
        options.format = itag && itag !== 'best' ? itag : 'best';
    }

    try {
        console.log(`Downloading ${platform} content with youtube-dl using format: ${options.format}`);
        await youtubeDl(url, options);
        console.log(`youtube-dl completed for ${platform}`);
        
        // Check if the file was created successfully
        if (!fs.existsSync(tempFilePath)) {
            throw new Error(`Download failed - file not created for ${platform}`);
        }
        
        const stat = fs.statSync(tempFilePath);
        
        // Make sure the file has actual content
        if (stat.size === 0) {
            fs.unlinkSync(tempFilePath);
            throw new Error(`Downloaded file for ${platform} is empty`);
        }
        
        console.log(`Successfully downloaded ${platform} file (${stat.size} bytes)`);
        
        // Determine content type for response
        let contentType = 'application/octet-stream';
        if (fileExt === 'mp4') contentType = 'video/mp4';
        else if (fileExt === 'mp3') contentType = 'audio/mpeg';
        
        // Determine a friendly filename
        const filename = `${platform}-download.${fileExt}`;
        
        // Stream the file to the client
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        const fileStream = fs.createReadStream(tempFilePath);
        fileStream.pipe(res);
        
        fileStream.on('end', () => {
            fs.unlink(tempFilePath, (err) => {
                if (err) console.error('Error deleting temp file:', err);
            });
        });
        
        return; // Exit early as we're handling the response
    } catch (ytdlError) {
        console.error(`youtube-dl error for ${platform}: ${ytdlError.message}`);
        
        // Platform-specific fallbacks
        try {
            console.log(`Attempting specialized fallback for ${platform}`);
            
            // Choose fallback based on platform
            if (platform === 'soundcloud') {
                await handleSoundCloudDownload(url, tempFilePath);
            } else if (platform === 'vimeo') {
                await handleVimeoDownload(url, tempFilePath);
            } else if (platform === 'spotify') {
                await handleSpotifyDownload(url, tempFilePath);
            } else {
                // Generic direct download attempt
                await handleDirectDownload(url, tempFilePath, platform);
            }
            
            // If we reach here, the fallback was successful
            const stat = fs.statSync(tempFilePath);
            
            // Determine content type
            let contentType = isAudioPlatform ? 'audio/mpeg' : 'video/mp4';
            
            // Determine a friendly filename
            const filename = `${platform}-download.${fileExt}`;
            
            // Stream the file to the client
            res.setHeader('Content-Length', stat.size);
            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            
            const fileStream = fs.createReadStream(tempFilePath);
            fileStream.pipe(res);
            
            fileStream.on('end', () => {
                fs.unlink(tempFilePath, (err) => {
                    if (err) console.error('Error deleting temp file:', err);
                });
            });
            
            return; // Exit early as we're handling the response
        } catch (fallbackError) {
            console.error(`Fallback also failed for ${platform}: ${fallbackError.message}`);
            // Continue with the rest of the download logic (we'll fall through to the standard handling below)
        }
    }
}

        if (url.includes('facebook.com') || url.includes('fb.watch') || url.includes('fb.com')) {
            // If it looks like a Facebook page URL and not a direct media URL, resolve it first
            if (!url.includes('.mp4') && !url.includes('fbcdn.net')) {
                console.log(`Converting Facebook page URL to direct URL: ${url}`);
                try {
                    // Use our Facebook endpoint to get the direct media URL
                    const fbResponse = await fetch(`http://localhost:${PORT}/api/facebook?url=${encodeURIComponent(url)}`);
                    const fbData = await fbResponse.json();

                    // Choose the best format
                    if (fbData && fbData.formats && fbData.formats.length > 0) {
                        // Prefer HD content if available
                        const hdFormat = fbData.formats.find(f => f.quality.includes('HD'));
                        const bestFormat = hdFormat || fbData.formats[0];

                        url = bestFormat.url;
                        console.log(`Using Facebook direct media URL: ${url}`);
                    }
                } catch (fbError) {
                    console.error('Error getting Facebook direct URL:', fbError);
                    // Continue with original URL if lookup fails
                }
            }

            // Always set the proper Facebook-specific headers
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Accept-Language': 'en-US,en;q=0.5',
                'Referer': 'https://www.facebook.com/',
                'Origin': 'https://www.facebook.com/',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
            };
        }
// Special handling for Twitter URLs
        if (url.includes('twitter.com') || url.includes('x.com')) {
            try {
                console.log('Using enhanced Twitter download handler for this URL');
                const twitterData = await processTwitterWithYtdl(url);

                if (twitterData.success) {
                    // If we have a local file already downloaded, stream it directly
                    if (twitterData.data.localFilePath && fs.existsSync(twitterData.data.localFilePath)) {
                        console.log(`Using already downloaded Twitter file: ${twitterData.data.localFilePath}`);

                        const stat = fs.statSync(twitterData.data.localFilePath);

                        res.setHeader('Content-Length', stat.size);
                        res.setHeader('Content-Type', 'video/mp4');
                        res.setHeader('Content-Disposition', 'attachment; filename="twitter-video.mp4"');

                        const fileStream = fs.createReadStream(twitterData.data.localFilePath);
                        fileStream.pipe(res);

                        return; // Exit early as we're handling the response
                    }

                    // Otherwise use the direct URL
                    url = twitterData.data.url;
                    console.log(`Using Twitter direct URL: ${url}`);
                }
            } catch (twitterError) {
                console.error(`Twitter handler error in download endpoint: ${twitterError.message}`);
                // Continue with normal download
            }
        }
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        // Handle issues with URL formatting (remove any trailing spaces)
        url = url.trim();
        // Pinterest-specific handling
        if (url.includes('pinterest.com') || url.includes('pin.it')) {
            console.log('Pinterest URL detected, resolving to direct media...');

            // Check if it's already a direct media URL (ends with image/video extension)
            const isDirectMedia = /\.(jpg|jpeg|png|gif|mp4|webp)($|\?)/i.test(url);

            if (!isDirectMedia) {
                try {
                    // Use the processPinterestUrl function to get the direct media URL
                    const pinterestData = await processPinterestUrl(url);

                    if (pinterestData && pinterestData.success && pinterestData.data && pinterestData.data.url) {
                        const directUrl = pinterestData.data.url;
                        console.log(`Resolved Pinterest URL to direct media: ${directUrl}`);

                        // Verify this is actually an image/video URL
                        if (/\.(jpg|jpeg|png|gif|mp4|webp)($|\?)/i.test(directUrl)) {
                            // Use the direct URL instead
                            url = directUrl;
                        } else {
                            throw new Error('The extracted URL does not appear to be a direct media file');
                        }
                    } else {
                        throw new Error('Could not extract direct media URL from Pinterest link');
                    }
                } catch (error) {
                    console.error('Pinterest resolution error:', error);
                    return res.status(400).json({
                        error: 'Pinterest processing failed',
                        details: error.message,
                        suggestion: 'Try opening the pin in a browser and downloading the image directly'
                    });
                }
            }
        }
        // Important: If URL points to a known media platform but not to actual media file,
        // redirect to info endpoint first to get direct media URL
        if ((url.includes('threads.net') || url.includes('instagram.com')) &&
            !url.includes('.mp4') && !url.includes('.jpg') && !url.includes('.png')) {
            console.log(`Converting platform URL to direct URL: ${url}`);
            try {
                // Get info for this URL to extract the actual media URL
                const infoResponse = await fetch(`http://localhost:${PORT}/api/info?url=${encodeURIComponent(url)}`);
                const info = await infoResponse.json();

                if (info && info.formats && info.formats.length > 0) {
                    // Use the first format's URL as the direct media URL
                    url = info.formats[0].url;
                    console.log(`Using direct media URL instead: ${url}`);
                }
            } catch (infoError) {
                console.error('Error getting direct URL:', infoError);
                // Continue with original URL if info lookup fails
            }
        }

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

// Helper functions from your code
function detectPlatform(url) {
    const lowerUrl = url.toLowerCase();

    if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) {
        return 'youtube';
    } else if (lowerUrl.includes('facebook.com') || lowerUrl.includes('fb.com') || lowerUrl.includes('fb.watch')) {
        return 'facebook';
    } else if (lowerUrl.includes('instagram.com')) {
        return 'instagram';
    } else if (lowerUrl.includes('tiktok.com')) {
        return 'tiktok';
    } else if (lowerUrl.includes('twitter.com') || lowerUrl.includes('x.com')) {
        return 'twitter';
    } else if (lowerUrl.includes('threads.net')) {
        return 'threads';
    } else if (lowerUrl.includes('pinterest.com')) {
        return 'pinterest';
    } else if (lowerUrl.includes('spotify.com')) {
        return 'spotify';
    } else if (lowerUrl.includes('soundcloud.com')) {
        return 'soundcloud';
    } else if (lowerUrl.includes('bandcamp.com')) {
        return 'bandcamp';
    } else if (lowerUrl.includes('deezer.com')) {
        return 'deezer';
    } else if (lowerUrl.includes('music.apple.com')) {
        return 'apple-music';
    } else if (lowerUrl.includes('music.amazon.com')) {
        return 'amazon-music';
    } else if (lowerUrl.includes('mixcloud.com')) {
        return 'mixcloud';
    } else if (lowerUrl.includes('audiomack.com')) {
        return 'audiomack';
    } else if (lowerUrl.includes('vimeo.com')) {
        return 'vimeo';
    } else if (lowerUrl.includes('dailymotion.com')) {
        return 'dailymotion';
    } else if (lowerUrl.includes('twitch.tv')) {
        return 'twitch';
    } else if (lowerUrl.includes('reddit.com')) {
        return 'reddit';
    } else if (lowerUrl.includes('linkedin.com')) {
        return 'linkedin';
    } else if (lowerUrl.includes('tumblr.com')) {
        return 'tumblr';
    } else if (lowerUrl.includes('vk.com')) {
        return 'vk';
    } else if (lowerUrl.includes('bilibili.com')) {
        return 'bilibili';
    } else if (lowerUrl.includes('snapchat.com')) {
        return 'snapchat';
    }

    return 'generic';
}

function getMediaType(platform) {
    // Music platforms
    if (
        [
            'spotify',
            'soundcloud',
            'bandcamp',
            'deezer',
            'apple-music',
            'amazon-music',
            'mixcloud',
            'audiomack',
        ].includes(platform)
    ) {
        return 'audio';
    }
    // Video platforms
    else {
        return 'video';
    }
}
// Helper functions for platform-specific downloads

// Generic direct download handler
async function handleDirectDownload(url, outputPath, platform) {
    console.log(`Performing direct download for ${platform}: ${url}`);
    
    // Set appropriate headers based on platform
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
    };
    
    // Add platform-specific referer
    headers['Referer'] = `https://www.${platform}.com/`;
    
    // Add range header which helps with some platforms
    headers['Range'] = 'bytes=0-';
    
    const downloadResponse = await fetch(url, {
        headers,
        redirect: 'follow'
    });
    
    if (!downloadResponse.ok) {
        throw new Error(`Direct download failed with status: ${downloadResponse.status}`);
    }
    
    const fileStream = fs.createWriteStream(outputPath);
    await new Promise((resolve, reject) => {
        downloadResponse.body.pipe(fileStream);
        downloadResponse.body.on('error', reject);
        fileStream.on('finish', resolve);
    });
    
    // Make sure file has content
    const stat = fs.statSync(outputPath);
    if (stat.size < 1000) { // Less than 1KB probably means an error
        throw new Error(`Downloaded file is too small (${stat.size} bytes)`);
    }
    
    console.log(`Successfully downloaded ${platform} file to ${outputPath}`);
}

// SoundCloud specific download handler
async function handleSoundCloudDownload(url, outputPath) {
    console.log('Using SoundCloud-specific download method');
    
    // First, get the page to extract metadata and client ID
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });
    
    if (!response.ok) {
        throw new Error(`Failed to fetch SoundCloud page: ${response.status}`);
    }
    
    const html = await response.text();
    
    // Try to extract client_id and track_id
    let clientId = null;
    let trackId = null;
    
    // Extract client ID
    const clientIdMatch = html.match(/client_id=([^&"]+)/);
    if (clientIdMatch && clientIdMatch[1]) {
        clientId = clientIdMatch[1];
    }
    
    // Extract track ID
    const trackIdMatch = html.match(/https:\/\/api-v2\.soundcloud\.com\/tracks\/(\d+)/);
    if (trackIdMatch && trackIdMatch[1]) {
        trackId = trackIdMatch[1];
    }
    
    if (!clientId || !trackId) {
        throw new Error('Could not extract SoundCloud track information');
    }
    
    // Get the track streaming info
    const apiUrl = `https://api-v2.soundcloud.com/tracks/${trackId}/streams?client_id=${clientId}`;
    const streamResponse = await fetch(apiUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://soundcloud.com/',
        }
    });
    
    if (!streamResponse.ok) {
        throw new Error(`Failed to fetch SoundCloud stream info: ${streamResponse.status}`);
    }
    
    const streamInfo = await streamResponse.json();
    
    // Extract the stream URL
    let streamUrl = '';
    if (streamInfo.http_mp3_128_url) {
        streamUrl = streamInfo.http_mp3_128_url;
    } else if (streamInfo.hls_mp3_128_url) {
        streamUrl = streamInfo.hls_mp3_128_url;
    } else {
        throw new Error('No suitable stream URL found');
    }
    
    // Download the stream
    console.log(`Downloading SoundCloud stream from: ${streamUrl}`);
    const downloadResponse = await fetch(streamUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://soundcloud.com/',
        }
    });
    
    if (!downloadResponse.ok) {
        throw new Error(`Failed to download SoundCloud stream: ${downloadResponse.status}`);
    }
    
    const fileStream = fs.createWriteStream(outputPath);
    await new Promise((resolve, reject) => {
        downloadResponse.body.pipe(fileStream);
        downloadResponse.body.on('error', reject);
        fileStream.on('finish', resolve);
    });
    
    console.log(`Successfully downloaded SoundCloud track to: ${outputPath}`);
}

// Vimeo specific download handler
async function handleVimeoDownload(url, outputPath) {
    console.log('Using Vimeo-specific download method');
    
    // Get the Vimeo page
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });
    
    if (!response.ok) {
        throw new Error(`Failed to fetch Vimeo page: ${response.status}`);
    }
    
    const html = await response.text();
    
    // Try to extract the config JSON
    const configMatch = html.match(/var config = ({.*?});/s);
    if (!configMatch || !configMatch[1]) {
        throw new Error('Could not find Vimeo config data');
    }
    
    try {
        // Replace single quotes with double quotes for JSON parsing
        let configStr = configMatch[1].replace(/'/g, '"');
        const config = JSON.parse(configStr);
        
        // Extract video URL from config
        if (!config.video || !config.video.play || !config.video.play.progressive) {
            throw new Error('Vimeo config does not contain progressive video data');
        }
        
        const progressiveUrls = config.video.play.progressive;
        if (!Array.isArray(progressiveUrls) || progressiveUrls.length === 0) {
            throw new Error('No progressive video URLs found');
        }
        
        // Sort by quality (highest first)
        progressiveUrls.sort((a, b) => 
            parseInt(b.height || 0) - parseInt(a.height || 0)
        );
        
        const bestQuality = progressiveUrls[0];
        const videoUrl = bestQuality.url;
        
        if (!videoUrl) {
            throw new Error('Could not extract video URL');
        }
        
        console.log(`Downloading Vimeo video from: ${videoUrl}`);
        
        // Download the video
        const downloadResponse = await fetch(videoUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://vimeo.com/',
            }
        });
        
        if (!downloadResponse.ok) {
            throw new Error(`Failed to download Vimeo video: ${downloadResponse.status}`);
        }
        
        const fileStream = fs.createWriteStream(outputPath);
        await new Promise((resolve, reject) => {
            downloadResponse.body.pipe(fileStream);
            downloadResponse.body.on('error', reject);
            fileStream.on('finish', resolve);
        });
        
        console.log(`Successfully downloaded Vimeo video to: ${outputPath}`);
    } catch (parseError) {
        console.error('Error parsing Vimeo config:', parseError);
        throw parseError;
    }
}

// Spotify specific download handler
async function handleSpotifyDownload(url, outputPath) {
    // For Spotify, we'll try youtube-dl with different options first
    console.log('Using Spotify-specific download method');
    
    const options = {
        output: outputPath,
        extractAudio: true,
        audioFormat: 'mp3',
        audioQuality: 0,
        noCheckCertificates: true,
        noWarnings: true,
        format: 'bestaudio',
        addHeader: [
            'user-agent:Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
            'referer:https://open.spotify.com/',
            'accept:*/*',
        ],
    };
    
    try {
        // Try one more time with yt-dlp using different options
        await youtubeDl(url, options);
        
        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
            console.log(`Successfully downloaded Spotify audio to: ${outputPath}`);
            return;
        }
    } catch (error) {
        console.error('Spotify youtube-dl retry failed:', error);
    }
    
    // If youtube-dl fails, try to get the track title and search it on YouTube
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });
    
    if (!response.ok) {
        throw new Error(`Failed to fetch Spotify page: ${response.status}`);
    }
    
    const html = await response.text();
    
    // Extract title and artist
    let title = '';
    let artist = '';
    
    const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/i);
    if (titleMatch && titleMatch[1]) {
        title = titleMatch[1];
    }
    
    const descMatch = html.match(/<meta property="og:description" content="([^"]+)"/i);
    if (descMatch && descMatch[1]) {
        const descParts = descMatch[1].split('·');
        if (descParts.length > 0) {
            artist = descParts[0].trim();
        }
    }
    
    if (!title) {
        throw new Error('Could not extract Spotify track information');
    }
    
    // Create a search query for YouTube
    const searchQuery = `${artist} ${title} audio`;
    console.log(`Searching YouTube for Spotify track: ${searchQuery}`);
    
    // Use youtube-dl to search YouTube
    const searchUrl = `ytsearch1:${searchQuery}`;
    
    try {
        await youtubeDl(searchUrl, {
            output: outputPath,
            extractAudio: true,
            audioFormat: 'mp3',
            audioQuality: 0,
            noCheckCertificates: true,
            noWarnings: true,
            format: 'bestaudio',
        });
        
        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
            console.log(`Successfully downloaded Spotify audio using YouTube search: ${outputPath}`);
            return;
        }
    } catch (searchError) {
        console.error('Spotify YouTube search fallback failed:', searchError);
        throw searchError;
    }
    
    throw new Error('All Spotify download methods failed');
}
// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Server accessible at http://localhost:${PORT}`);
    console.log(`Temporary directory: ${TEMP_DIR}`);

});
