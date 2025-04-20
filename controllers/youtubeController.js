// controllers/youtubeController.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { ytdown } = require("nayan-videos-downloader");
const youtubeDl = require('youtube-dl-exec'); // Add this dependency
const fetch = require('node-fetch');
const crypto = require('crypto');
const SYTDL = require('s-ytdl'); // Add the s-ytdl package

// Create temp directory if it doesn't exist
const TEMP_DIR = path.join(__dirname, '../temp');
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Collection of user agents to rotate through to avoid rate limiting
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
];

// Get a random user agent
function getRandomUserAgent() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Download YouTube video with enhanced reliability and anti-blocking measures
 * @param {string} url - YouTube video URL
 * @returns {Promise<Object>} - Video data
 */
async function downloadYouTubeVideo(url) {
    try {
        console.log(`Processing YouTube URL: ${url}`);
        
        // Check if this is just a homepage URL (not a specific video)
        if (url === 'https://www.youtube.com/' || 
            url === 'https://m.youtube.com/' || 
            url === 'https://youtube.com/' ||
            url === 'https://youtu.be/') {
            console.log("This is a YouTube homepage URL, not a specific video URL");
            return {
                success: false,
                error: "Please provide a specific YouTube video URL, not the homepage",
                homepage: true
            };
        }
        
        // Check if this is a search URL
        if (url.includes('/results') || url.includes('search_query=')) {
            console.log("This appears to be a YouTube search URL, not a direct video URL");
            return {
                success: false,
                error: "The provided URL is a YouTube search page, not a direct video URL. Please provide a direct video URL.",
                youtube_search: true
            };
        }
        
        // Extract video ID for thumbnail fallback
        let videoId = extractVideoId(url);
        
        // Normalize mobile URL to desktop
        if (url.includes('m.youtube.com')) {
            url = url.replace(/m\.youtube\.com/, 'www.youtube.com');
            console.log(`Converted to desktop URL: ${url}`);
        }
        
        // Also handle youtu.be short URLs
        if (url.includes('youtu.be/') && !videoId) {
            const shortUrlMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
            if (shortUrlMatch && shortUrlMatch[1]) {
                videoId = shortUrlMatch[1];
                url = `https://www.youtube.com/watch?v=${videoId}`;
                console.log(`Converted short URL to full URL: ${url}`);
            }
        }
        
        // Check if we have a valid video ID - RETURN EARLY if no ID
        if (!videoId) {
            console.log("No valid YouTube video ID found in URL");
            return {
                success: false,
                error: "No valid YouTube video ID found in URL. Please provide a direct video URL.",
            };
        }

        // Thumbnail will be consistent regardless of download method
        const thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
        
        // APPROACH 0: Try s-ytdl package first (newest addition)
        try {
            console.log("Attempting to download with s-ytdl package...");
            
            // First try high quality (720p - quality "5")
            const highQualityResult = await SYTDL.dl(url, "5", "video");
            console.log("s-ytdl high quality download successful!");
            
            // Then try a lower quality (480p - quality "4")
            let lowQualityResult;
            try {
                lowQualityResult = await SYTDL.dl(url, "4", "video");
                console.log("s-ytdl low quality download successful!");
            } catch (lowQualityError) {
                console.log("s-ytdl low quality failed, using high quality as fallback");
                lowQualityResult = highQualityResult;
            }
            
            // Get title info using the high quality result
            const title = highQualityResult.title || 'YouTube Video';
            
            return {
                title: title,
                high: highQualityResult.url || '',
                low: lowQualityResult.url || highQualityResult.url || '',
                thumbnail: thumbnail,
                source: 's-ytdl'
            };
        } catch (sytdlError) {
            console.error(`s-ytdl error: ${sytdlError.message}`);
            console.log("Falling back to other methods...");
            // Continue to next approach
        }
        
        // APPROACH 1: Try InnerTube API (YouTube's internal API) - more stealthy than youtube-dl
        try {
            console.log("Attempting to use YouTube InnerTube API...");
            const innerTubeResult = await extractWithInnerTubeApi(videoId);
            console.log("YouTube InnerTube API successful!");
            
            return {
                title: innerTubeResult.title || 'YouTube Video',
                high: innerTubeResult.highQualityUrl || '',
                low: innerTubeResult.lowQualityUrl || '',
                thumbnail: thumbnail,
                source: 'innertube-api'
            };
        } catch (innerTubeError) {
            console.error(`InnerTube API error: ${innerTubeError.message}`);
            console.log("Falling back to other methods...");
            // Continue to next approach
        }
        
        // APPROACH 2: Try to extract video URL from embed page (often less restricted)
        try {
            console.log("Attempting to extract from YouTube embed page...");
            const embedResult = await extractFromEmbedPage(videoId);
            console.log("YouTube embed extraction successful!");
            
            return {
                title: embedResult.title || 'YouTube Video',
                high: embedResult.highQualityUrl || '',
                low: embedResult.lowQualityUrl || '',
                thumbnail: thumbnail,
                source: 'embed-extract'
            };
        } catch (embedError) {
            console.error(`Embed extraction error: ${embedError.message}`);
            console.log("Falling back to other methods...");
            // Continue to next approach
        }
        
        // APPROACH 3: Try youtube-dl-exec with anti-blocking measures
        try {
            console.log("Attempting to download with enhanced youtube-dl-exec...");
            const result = await downloadWithYoutubeDlEnhanced(url);
            console.log("Enhanced youtube-dl-exec download successful!");
            
            return {
                title: result.title || 'YouTube Video',
                high: result.highQualityUrl || '',
                low: result.lowQualityUrl || '',
                thumbnail: thumbnail,
                source: 'youtube-dl-enhanced'
            };
        } catch (ytdlError) {
            console.error(`Enhanced youtube-dl-exec error: ${ytdlError.message}`);
            console.log("Falling back to other methods...");
            // Continue to next approach
        }
        
        // APPROACH 4: Try ytdown from nayan-videos-downloader
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
            
            // APPROACH 5: Try direct download to file using youtube-dl-exec with different options
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
                
                // APPROACH 6: Try invidious fallback
                try {
                    console.log("Trying invidious API as fallback...");
                    const invidiousResult = await getFromInvidiousApi(videoId);
                    console.log("Invidious API successful!");
                    
                    return {
                        title: invidiousResult.title || 'YouTube Video',
                        high: invidiousResult.highQualityUrl || '',
                        low: invidiousResult.lowQualityUrl || '',
                        thumbnail: thumbnail,
                        source: 'invidious'
                    };
                } catch (invidiousError) {
                    console.error(`Invidious API error: ${invidiousError.message}`);
                    
                    // APPROACH 7: Last resort fallback to direct YouTube links
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
 * Extract video info using YouTube's InnerTube API (internal API that's less likely to be blocked)
 * @param {string} videoId - YouTube video ID
 * @returns {Promise<Object>} - Video information and URLs
 */
async function extractWithInnerTubeApi(videoId) {
    try {
        // Generate needed variables
        const userAgent = getRandomUserAgent();
        const clientName = 'WEB';
        const clientVersion = '2.20240419.01.00';
        const apiKey = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8'; // Public YouTube API key
        
        // Random context values to appear more like a real browser
        const screenWidth = [1920, 1366, 1440, 1280][Math.floor(Math.random() * 4)];
        const screenHeight = [1080, 768, 900, 720][Math.floor(Math.random() * 4)];
        const screenDensity = [1, 2][Math.floor(Math.random() * 2)];
        const clientScreen = `${screenWidth}x${screenHeight}`;
        
        // Generate visitor data (mimics YouTube's real visitor tracking)
        const visitorData = Buffer.from(`CgIQABIb${crypto.randomBytes(15).toString('base64')}`).toString('base64');

        // URL for InnerTube player API
        const url = `https://www.youtube.com/youtubei/v1/player?key=${apiKey}`;
        
        // Create request body (mimicking what YouTube web player sends)
        const requestBody = {
            context: {
                client: {
                    hl: 'en',
                    gl: 'US',
                    clientName,
                    clientVersion,
                    screenPixelDensity: screenDensity,
                    screenDensityFloat: screenDensity,
                    clientScreen,
                    utcOffsetMinutes: -new Date().getTimezoneOffset(),
                },
                user: {
                    lockedSafetyMode: false
                },
                request: {
                    useSsl: true,
                    internalExperimentFlags: [],
                    consistencyTokenJars: []
                },
                clientScreenNonce: crypto.randomBytes(16).toString('base64'),
                clickTracking: {
                    clickTrackingParams: crypto.randomBytes(33).toString('base64')
                },
                adSignalsInfo: {
                    params: []
                }
            },
            videoId,
            racyCheckOk: true,
            contentCheckOk: true
        };

        // Add player params for web
        requestBody.context.client.clientScreen = clientScreen;
        requestBody.context.client.visitorData = visitorData;
        requestBody.context.client.mainAppWebInfo = {
            graftUrl: `/watch?v=${videoId}`,
            webDisplayMode: 'WEB_DISPLAY_MODE_BROWSER',
            isWebNativeShareAvailable: false
        };

        console.log(`Making InnerTube API request for video ${videoId}`);
        
        // Make the API request
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'User-Agent': userAgent,
                'Content-Type': 'application/json',
                'X-YouTube-Client-Name': '1',
                'X-YouTube-Client-Version': clientVersion,
                'Origin': 'https://www.youtube.com',
                'Referer': `https://www.youtube.com/watch?v=${videoId}`,
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            throw new Error(`InnerTube API request failed with status ${response.status}`);
        }

        const data = await response.json();
        
        // Check if the video is playable
        if (data.playabilityStatus?.status !== 'OK') {
            throw new Error(`Video not playable: ${data.playabilityStatus?.reason || 'Unknown reason'}`);
        }

        // Extract video details
        const title = data.videoDetails?.title || 'YouTube Video';
        
        // Extract streaming URLs - check for adaptive formats first
        let highQualityUrl = '';
        let lowQualityUrl = '';
        
        if (data.streamingData?.adaptiveFormats && data.streamingData.adaptiveFormats.length > 0) {
            // Get video formats
            const videoFormats = data.streamingData.adaptiveFormats.filter(f => 
                f.mimeType && f.mimeType.includes('video') && f.url
            );
            
            // Get audio formats
            const audioFormats = data.streamingData.adaptiveFormats.filter(f => 
                f.mimeType && f.mimeType.includes('audio') && f.url
            );
            
            if (videoFormats.length > 0 && audioFormats.length > 0) {
                // Sort video formats by quality
                videoFormats.sort((a, b) => (b.height || 0) - (a.height || 0));
                
                // Sort audio formats by bitrate
                audioFormats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
                
                // For adaptive formats, we need to choose one video and one audio
                // For simplicity in this implementation, we'll use the URLs directly
                // though in a real player, these would need to be combined
                
                // Find high quality (720p or better if available)
                const highQualityVideo = videoFormats.find(f => 
                    (f.height >= 720 && f.height <= 1080)
                ) || videoFormats[0];
                
                // Find lower quality backup (480p or close)
                const lowQualityVideo = videoFormats.find(f => 
                    (f.height <= 480 && f.height >= 360)
                ) || videoFormats[videoFormats.length - 1];
                
                highQualityUrl = highQualityVideo?.url || '';
                lowQualityUrl = lowQualityVideo?.url || '';
            }
        }
        
        // If no adaptive formats or URLs, try formats
        if ((!highQualityUrl || !lowQualityUrl) && data.streamingData?.formats && data.streamingData.formats.length > 0) {
            // These are combined video+audio formats
            const formats = data.streamingData.formats.filter(f => f.url);
            
            if (formats.length > 0) {
                // Sort by quality
                formats.sort((a, b) => (b.height || 0) - (a.height || 0));
                
                // Find high quality
                const highQualityFormat = formats.find(f => 
                    (f.height >= 720 && f.height <= 1080)
                ) || formats[0];
                
                // Find lower quality
                const lowQualityFormat = formats.find(f => 
                    (f.height <= 480 && f.height >= 360)
                ) || formats[formats.length - 1];
                
                highQualityUrl = highQualityFormat?.url || formats[0]?.url || '';
                lowQualityUrl = lowQualityFormat?.url || formats[formats.length - 1]?.url || '';
            }
        }
        
        if (!highQualityUrl && !lowQualityUrl) {
            throw new Error('No video URLs found in InnerTube API response');
        }
        
        // Use the same URL for both if only one is available
        if (!highQualityUrl) highQualityUrl = lowQualityUrl;
        if (!lowQualityUrl) lowQualityUrl = highQualityUrl;
        
        return {
            title,
            highQualityUrl,
            lowQualityUrl
        };
    } catch (error) {
        console.error(`InnerTube API extraction error: ${error.message}`);
        throw error;
    }
}

/**
 * Extract video URL from YouTube embed page (often has fewer restrictions)
 * @param {string} videoId - YouTube video ID
 * @returns {Promise<Object>} - Video URLs
 */
async function extractFromEmbedPage(videoId) {
    try {
        const userAgent = getRandomUserAgent();
        const embedUrl = `https://www.youtube.com/embed/${videoId}`;
        
        console.log(`Fetching YouTube embed page for video ${videoId}`);
        
        // Add a small random delay to avoid detection
        await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 1000));
        
        const response = await fetch(embedUrl, {
            headers: {
                'User-Agent': userAgent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to fetch embed page: ${response.status}`);
        }
        
        const html = await response.text();
        
        // Extract title
        let title = 'YouTube Video';
        const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
        if (titleMatch && titleMatch[1]) {
            title = titleMatch[1].replace(' - YouTube', '').trim();
        }
        
        // Look for player_response JSON in the page
        const playerResponseMatch = html.match(/\"player_response\":\"([^\"]+)\"/);
        
        if (!playerResponseMatch || !playerResponseMatch[1]) {
            throw new Error('Could not find player_response in embed page');
        }
        
        // Decode the player_response JSON
        const playerResponseStr = playerResponseMatch[1]
            .replace(/\\u0026/g, '&')
            .replace(/\\"/g, '"')
            .replace(/\\\//g, '/')
            .replace(/\\\\u/g, '\\u');
            
        try {
            const playerResponse = JSON.parse(playerResponseStr);
            
            // Extract URLs from player response
            if (!playerResponse.streamingData) {
                throw new Error('No streaming data found in player response');
            }
            
            let highQualityUrl = '';
            let lowQualityUrl = '';
            
            // Check for formats (combined audio+video)
            if (playerResponse.streamingData.formats && playerResponse.streamingData.formats.length > 0) {
                const formats = playerResponse.streamingData.formats
                    .filter(f => f.url)
                    .sort((a, b) => (b.height || 0) - (a.height || 0));
                
                if (formats.length > 0) {
                    // Find high quality
                    const highQualityFormat = formats.find(f => 
                        (f.height >= 720 && f.height <= 1080)
                    ) || formats[0];
                    
                    // Find lower quality
                    const lowQualityFormat = formats.find(f => 
                        (f.height <= 480 && f.height >= 360)
                    ) || formats[formats.length - 1];
                    
                    highQualityUrl = highQualityFormat?.url || formats[0]?.url || '';
                    lowQualityUrl = lowQualityFormat?.url || formats[formats.length - 1]?.url || '';
                }
            }
            
            // If no formats or URLs, try adaptive formats
            if ((!highQualityUrl || !lowQualityUrl) && 
                playerResponse.streamingData.adaptiveFormats && 
                playerResponse.streamingData.adaptiveFormats.length > 0) {
                
                // Filter to only formats with URLs
                const adaptiveFormats = playerResponse.streamingData.adaptiveFormats
                    .filter(f => f.url);
                
                // Get video formats with URLs
                const videoFormats = adaptiveFormats
                    .filter(f => f.mimeType && f.mimeType.includes('video'))
                    .sort((a, b) => (b.height || 0) - (a.height || 0));
                
                if (videoFormats.length > 0) {
                    // Find high quality
                    const highQualityFormat = videoFormats.find(f => 
                        (f.height >= 720 && f.height <= 1080)
                    ) || videoFormats[0];
                    
                    // Find lower quality
                    const lowQualityFormat = videoFormats.find(f => 
                        (f.height <= 480 && f.height >= 360)
                    ) || videoFormats[videoFormats.length - 1];
                    
                    highQualityUrl = highQualityFormat?.url || '';
                    lowQualityUrl = lowQualityFormat?.url || '';
                }
            }
            
            if (!highQualityUrl && !lowQualityUrl) {
                throw new Error('No video URLs found in player response');
            }
            
            // Use the same URL for both if only one is available
            if (!highQualityUrl) highQualityUrl = lowQualityUrl;
            if (!lowQualityUrl) lowQualityUrl = highQualityUrl;
            
            return {
                title,
                highQualityUrl,
                lowQualityUrl
            };
        } catch (jsonError) {
            console.error(`Error parsing player_response: ${jsonError.message}`);
            throw jsonError;
        }
    } catch (error) {
        console.error(`Embed page extraction error: ${error.message}`);
        throw error;
    }
}

/**
 * Download YouTube video using youtube-dl-exec with anti-blocking measures
 * @param {string} url - YouTube URL
 * @returns {Promise<Object>} - Video URLs
 */
async function downloadWithYoutubeDlEnhanced(url) {
    try {
        // Add a random delay before request
        await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1500));
        
        // Get a random user agent
        const userAgent = getRandomUserAgent();
        
        // Configure youtube-dl-exec with enhanced options to avoid blocking
        const info = await youtubeDl(url, {
            dumpSingleJson: true,
            noCheckCertificates: true,
            noWarnings: true,
            preferFreeFormats: true,
            addHeader: [
                'referer:https://www.google.com/',  // Make it look like we came from Google
                `user-agent:${userAgent}`,
                'accept-language:en-US,en;q=0.9',
                'sec-fetch-dest:document',
                'sec-fetch-mode:navigate',
                'sec-fetch-site:cross-site',
                'sec-fetch-user:?1',
                'upgrade-insecure-requests:1'
            ],
            // More specific format selection to avoid confusion
            formatSort: 'res:720,res:480,res:360',
            socketTimeout: 15  // Shorter timeout to fail faster
        });

        if (!info || !info.formats || info.formats.length === 0) {
            throw new Error('No video formats found');
        }

        // Look for the best video formats
        // First try to find formats with both video and audio
        const videoFormats = info.formats.filter(f => 
            f.vcodec !== 'none' && f.acodec !== 'none'
        );

        if (videoFormats.length === 0) {
            throw new Error('No combined video+audio formats found');
        }

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
        console.error(`Enhanced youtube-dl extraction error: ${error.message}`);
        throw error;
    }
}

/**
 * Try to get video information from Invidious API instances
 * Invidious is an alternative YouTube frontend with public APIs
 * @param {string} videoId - YouTube video ID
 * @returns {Promise<Object>} - Video URLs
 */
async function getFromInvidiousApi(videoId) {
    // List of public Invidious instances to try
    const invidiousInstances = [
        'https://invidious.snopyta.org',
        'https://yewtu.be',
        'https://invidious.kavin.rocks',
        'https://inv.riverside.rocks',
        'https://vid.puffyan.us',
        'https://invidious.flokinet.to',
        // Add more instances if needed
    ];
    
    // Shuffle the instances to distribute load
    const shuffledInstances = [...invidiousInstances]
        .sort(() => Math.random() - 0.5);
    
    // Try each instance one at a time
    let lastError = null;
    
    for (const instance of shuffledInstances) {
        try {
            // Add a small delay between requests
            await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 700));
            
            const apiUrl = `${instance}/api/v1/videos/${videoId}`;
            console.log(`Trying Invidious instance: ${instance}`);
            
            const response = await fetch(apiUrl, {
                headers: {
                    'User-Agent': getRandomUserAgent(),
                    'Accept': 'application/json',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache',
                },
                timeout: 10000 // 10 second timeout
            });
            
            if (!response.ok) {
                console.log(`Instance ${instance} returned status ${response.status}`);
                lastError = new Error(`API returned status ${response.status}`);
                continue; // Try next instance
            }
            
            const data = await response.json();
            
            if (!data || !data.videoId) {
                console.log(`Instance ${instance} returned invalid data`);
                lastError = new Error('Invalid data from API');
                continue; // Try next instance
            }
            
            // Extract video info
            const title = data.title || 'YouTube Video';
            
            // Extract adaptive formats
            if (!data.adaptiveFormats || data.adaptiveFormats.length === 0) {
                console.log(`Instance ${instance} has no adaptive formats`);
                lastError = new Error('No adaptive formats available');
                continue; // Try next instance
            }
            
            // Get video formats
            const videoFormats = data.adaptiveFormats
                .filter(f => f.type && f.type.includes('video/') && f.url)
                .sort((a, b) => (b.height || 0) - (a.height || 0));
            
            if (!videoFormats || videoFormats.length === 0) {
                console.log(`Instance ${instance} has no video formats`);
                lastError = new Error('No video formats found');
                continue; // Try next instance
            }
            
            // Find high quality (720p or better if available)
            const highQualityFormat = videoFormats.find(f => 
                (f.height >= 720 && f.height <= 1080)
            ) || videoFormats[0];
            
            // Find lower quality backup (480p or close)
            const lowQualityFormat = videoFormats.find(f => 
                (f.height <= 480 && f.height >= 360)
            ) || videoFormats[videoFormats.length - 1];
            
            if (!highQualityFormat || !highQualityFormat.url) {
                console.log(`Instance ${instance} has no high quality URL`);
                lastError = new Error('No high quality URL found');
                continue; // Try next instance
            }
            
            let highQualityUrl = highQualityFormat.url;
            let lowQualityUrl = lowQualityFormat?.url || highQualityFormat.url;
            
            return {
                title,
                highQualityUrl,
                lowQualityUrl
            };
        } catch (error) {
            console.log(`Error with instance ${instance}: ${error.message}`);
            lastError = error;
            // Continue to next instance
        }
    }
    
    // If we get here, all instances failed
    throw lastError || new Error('All Invidious instances failed');
}

/**
 * Download YouTube video directly to a file with enhanced anti-blocking measures
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
        // Get a random user agent
        const userAgent = getRandomUserAgent();
        
        // Try a completely different approach - use ffmpeg directly
        try {
            // Get video info first
            const infoOptions = {
                dumpSingleJson: true,
                skipDownload: true,
                noCheckCertificates: true,
                noWarnings: true,
                addHeader: [
                    'referer:https://www.google.com/',
                    `user-agent:${userAgent}`,
                    'accept-language:en-US,en;q=0.9',
                ],
                formatSort: 'res:720,res:480,res:360',
                socketTimeout: 10
            };
            
            // Execute youtube-dl-exec to get info
            const info = await youtubeDl(url, infoOptions);
            
            if (!info || !info.formats || info.formats.length === 0) {
                throw new Error('No video formats found in info');
            }
            
            // Look for a format with both video and audio
            const videoFormats = info.formats.filter(f => 
                f.vcodec !== 'none' && f.acodec !== 'none'
            );
            
            if (videoFormats.length === 0) {
                throw new Error('No combined video+audio formats found');
            }
            
            // Find a suitable format (720p or less for better compatibility)
            const bestFormat = videoFormats.find(f => 
                (f.height >= 480 && f.height <= 720)
            ) || videoFormats[0];
            
            if (!bestFormat || !bestFormat.url) {
                throw new Error('No format URL found');
            }
            
            // Try a different approach - download it using different format arguments
            const options = {
                output: filePath,
                format: bestFormat.format_id || 'best[height<=720]',
                noCheckCertificates: true,
                noWarnings: true,
                noCallHome: true, // Avoid calling back to youtube-dl server
                noPostOverwrites: true,
                addHeader: [
                    'referer:https://www.google.com/',
                    `user-agent:${userAgent}`,
                    'accept-language:en-US,en;q=0.9',
                    'origin:https://www.youtube.com',
                ],
                retries: 3, // Retry up to 3 times
                fragmentRetries: 3,
                bufferSize: '16K', // Smaller buffer size
            };
            
            console.log(`Downloading YouTube video to file: ${filePath}`);
            console.log(`Using format ID: ${options.format}`);
            
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
                title: info.title || 'YouTube Video',
                fileUrl: fileUrl,
                filePath: filePath
            };
        } catch (ytdlError) {
            console.error(`youtube-dl file download error: ${ytdlError.message}`);
            
            // Try a completely different approach - use curl with a direct M3U8 URL if available
            try {
                const webPageUrl = `https://www.youtube.com/watch?v=${videoId}`;
                
                console.log('Attempting to extract m3u8 URL from web page');
                
                // Fetch the web page to extract the m3u8 URL
                const webPageResponse = await fetch(webPageUrl, {
                    headers: {
                        'User-Agent': userAgent,
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Cache-Control': 'no-cache',
                        'Pragma': 'no-cache',
                        'Referer': 'https://www.google.com/',
                    }
                });
                
                if (!webPageResponse.ok) {
                    throw new Error(`Failed to fetch web page: ${webPageResponse.status}`);
                }
                
                const webPageHtml = await webPageResponse.text();
                
                // Look for m3u8 URL in the page
                const m3u8Match = webPageHtml.match(/https:\/\/manifest\.googlevideo\.com\/api\/manifest\/hls_playlist[^"']+/);
                
                if (!m3u8Match) {
                    throw new Error('No m3u8 URL found in web page');
                }
                
                const m3u8Url = m3u8Match[0].replace(/\\u0026/g, '&').replace(/\\u003d/g, '=');
                
                console.log(`Found m3u8 URL: ${m3u8Url.substring(0, 100)}...`);
                
                // Use youtube-dl-exec with the direct m3u8 URL
                const m3u8Options = {
                    output: filePath,
                    addHeader: [
                        'referer:https://www.youtube.com/',
                        `user-agent:${userAgent}`,
                        'origin:https://www.youtube.com',
                    ],
                };
                
                await youtubeDl(m3u8Url, m3u8Options);
                
                // Check if download was successful
                if (!fs.existsSync(filePath)) {
                    throw new Error('m3u8 download failed - output file not created');
                }
                
                const stats = fs.statSync(filePath);
                if (stats.size === 0) {
                    throw new Error('m3u8 downloaded file is empty');
                }
                
                console.log(`Successfully downloaded YouTube video via m3u8 (${stats.size} bytes)`);
                
                // Create URL for streaming the file
                const fileUrl = `/api/stream-file?path=${encodeURIComponent(filePath)}`;
                
                return {
                    title: 'YouTube Video',
                    fileUrl: fileUrl,
                    filePath: filePath
                };
            } catch (m3u8Error) {
                console.error(`m3u8 download error: ${m3u8Error.message}`);
                throw m3u8Error;
            }
        }
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
 * Extract video ID from YouTube URL with improved pattern matching
 * @param {string} url - YouTube URL
 * @returns {string} - Video ID
 */
function extractVideoId(url) {
    if (!url) return '';
    
    // Handle standard YouTube URLs
    const standardMatch = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
    if (standardMatch && standardMatch[1]) {
        return standardMatch[1];
    }
    
    // Handle YouTube Music URLs
    const musicMatch = url.match(/music\.youtube\.com\/watch\?(?:.*&)?v=([a-zA-Z0-9_-]{11})/i);
    if (musicMatch && musicMatch[1]) {
        return musicMatch[1];
    }
    
    // Handle YouTube Shorts URLs
    const shortsMatch = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/i);
    if (shortsMatch && shortsMatch[1]) {
        return shortsMatch[1];
    }
    
    // Handle youtu.be short URLs
    const shortUrlMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/i);
    if (shortUrlMatch && shortUrlMatch[1]) {
        return shortUrlMatch[1];
    }
    
    // Handle URLs with video ID in a different format
    const alternatMatch = url.match(/(?:youtube\.com\/(?:.*\/)?(?:.*[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
    if (alternatMatch && alternatMatch[1]) {
        return alternatMatch[1];
    }
    
    // If nothing matched, try a more basic fallback pattern
    const basicMatch = url.match(/([a-zA-Z0-9_-]{11})/);
    if (basicMatch && basicMatch[1]) {
        // Verify this actually looks like a proper video ID by checking its format
        const isValidFormat = /^[a-zA-Z0-9_-]{11}$/.test(basicMatch[1]);
        if (isValidFormat) {
            return basicMatch[1];
        }
    }
    
    return '';
}

/**
 * Download YouTube music audio with enhanced anti-blocking measures
 * @param {string} url - YouTube music URL
 * @returns {Promise<Object>} - Audio data
 */
async function downloadYouTubeMusic(url) {
    try {
        console.log(`Processing YouTube Music URL: ${url}`);
        
        // Check if this is just a homepage URL (not a specific video)
        if (url === 'https://www.youtube.com/' || 
            url === 'https://m.youtube.com/' || 
            url === 'https://youtube.com/' ||
            url === 'https://youtu.be/' ||
            url === 'https://music.youtube.com/') {
            console.log("This is a YouTube homepage URL, not a specific video URL");
            return {
                success: false,
                error: "Please provide a specific YouTube video URL, not the homepage",
                homepage: true
            };
        }
        
        // Check if this is a search URL
        if (url.includes('/results') || url.includes('search_query=')) {
            console.log("This appears to be a YouTube search URL, not a direct video URL");
            return {
                success: false,
                error: "The provided URL is a YouTube search page, not a direct video URL. Please provide a direct video URL.",
                youtube_search: true
            };
        }
        
        // Extract video ID first (before URL conversion)
        let videoId = extractVideoId(url);
        
        // Convert youtube music URL to regular youtube if needed
        if (url.includes('music.youtube.com')) {
            if (videoId) {
                url = `https://www.youtube.com/watch?v=${videoId}`;
                console.log(`Converted to regular YouTube URL: ${url}`);
            }
        }
        
        // Handle youtu.be short URLs as well
        if (url.includes('youtu.be/') && !videoId) {
            const shortUrlMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
            if (shortUrlMatch && shortUrlMatch[1]) {
                videoId = shortUrlMatch[1];
                url = `https://www.youtube.com/watch?v=${videoId}`;
                console.log(`Converted short URL to full URL: ${url}`);
            }
        }
        
        // Check if we have a valid video ID - RETURN EARLY if no ID
        if (!videoId) {
            console.log("No valid YouTube video ID found in URL");
            return {
                success: false,
                error: "No valid YouTube video ID found in URL. Please provide a direct video URL.",
            };
        }
        
        // Thumbnail will be consistent regardless of download method
        const thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
        
        // APPROACH 0: Try s-ytdl package for audio
        try {
            console.log("Attempting to download audio with s-ytdl package...");
            
            // Try highest audio quality (192kbps - quality "4")
            const audioResult = await SYTDL.dl(url, "4", "audio");
            console.log("s-ytdl audio download successful!");
            
            return {
                title: audioResult.title || 'YouTube Music',
                high: audioResult.url || '',
                low: audioResult.url || '',
                thumbnail: thumbnail,
                isAudio: true,
                source: 's-ytdl-audio'
            };
        } catch (sytdlError) {
            console.error(`s-ytdl audio error: ${sytdlError.message}`);
            console.log("Falling back to other methods...");
            // Continue to next approach
        }
        
        // APPROACH 1: Try InnerTube API for audio stream extraction
        try {
            console.log("Attempting to use YouTube InnerTube API for audio...");
            const innerTubeResult = await extractWithInnerTubeApi(videoId);
            console.log("YouTube InnerTube API successful!");
            
            // We want to prefer audio-only formats if available
            // Let's try to use the InnerTube API results directly to get an audio stream
            try {
                // There's a risk we might need to parse the formats from the result again
                // But for now, just use the URL from the InnerTube result
                
                return {
                    title: innerTubeResult.title || 'YouTube Music',
                    high: innerTubeResult.highQualityUrl || '',
                    low: innerTubeResult.lowQualityUrl || '',
                    thumbnail: thumbnail,
                    isAudio: true,
                    source: 'innertube-api-audio'
                };
            } catch (innerTubeAudioError) {
                console.error(`InnerTube audio extraction error: ${innerTubeAudioError.message}`);
                // Continue with the URL we got anyway
                return {
                    title: innerTubeResult.title || 'YouTube Music',
                    high: innerTubeResult.highQualityUrl || '',
                    low: innerTubeResult.lowQualityUrl || '',
                    thumbnail: thumbnail,
                    isAudio: true,
                    source: 'innertube-api'
                };
            }
        } catch (innerTubeError) {
            console.error(`InnerTube API audio error: ${innerTubeError.message}`);
            console.log("Falling back to other methods...");
            // Continue to next approach
        }
        
        // APPROACH 2: Try audio extraction from embed page
        try {
            console.log("Attempting to extract audio from YouTube embed page...");
            const embedResult = await extractFromEmbedPage(videoId);
            console.log("YouTube embed extraction successful!");
            
            // Use the embed page result directly
            return {
                title: embedResult.title || 'YouTube Music',
                high: embedResult.highQualityUrl || '',
                low: embedResult.lowQualityUrl || '',
                thumbnail: thumbnail,
                isAudio: true,
                source: 'embed-extract-audio'
            };
        } catch (embedError) {
            console.error(`Embed audio extraction error: ${embedError.message}`);
            console.log("Falling back to other methods...");
            // Continue to next approach
        }
        
        // APPROACH 3: Try youtube-dl-exec for audio with enhanced anti-blocking
        try {
            console.log("Attempting to download audio with enhanced youtube-dl-exec...");
            
            // Random delay to avoid detection patterns
            await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1500));
            
            const uniqueId = Date.now();
            const fileName = `youtube-music-${videoId}-${uniqueId}.mp3`;
            const filePath = path.join(TEMP_DIR, fileName);
            
            // Get a random user agent
            const userAgent = getRandomUserAgent();
            
            // Define enhanced options for youtube-dl-exec
            const options = {
                output: filePath,
                extractAudio: true,
                audioFormat: 'mp3',
                audioQuality: 0,  // Best quality
                noCheckCertificates: true,
                noWarnings: true,
                noCallHome: true, // Avoid calling back to youtube-dl server
                addHeader: [
                    'referer:https://www.google.com/',
                    `user-agent:${userAgent}`,
                    'accept-language:en-US,en;q=0.9',
                    'sec-fetch-dest:document',
                    'sec-fetch-mode:navigate',
                    'sec-fetch-site:cross-site',
                ],
                retries: 3,
                fragmentRetries: 3,
                socketTimeout: 15
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
            
            // Get title information (use pre-cached info if available)
            let title = 'YouTube Music';
            try {
                const info = await youtubeDl(url, {
                    dumpSingleJson: true,
                    skipDownload: true,
                    noCheckCertificates: true,
                    noWarnings: true,
                    addHeader: [`user-agent:${userAgent}`],
                    socketTimeout: 10
                });
                
                if (info && info.title) {
                    title = info.title;
                }
            } catch (titleError) {
                console.warn(`Could not get title info: ${titleError.message}`);
                // Continue without title info
            }
            
            // Create URL for streaming the file
            const fileUrl = `/api/stream-file?path=${encodeURIComponent(filePath)}`;
            
            return {
                title: title,
                high: fileUrl,
                low: fileUrl,
                thumbnail: thumbnail,
                source: 'youtube-dl-audio-enhanced',
                localFilePath: filePath,
                isAudio: true
            };
        } catch (ytdlError) {
            console.error(`Enhanced youtube-dl-exec audio error: ${ytdlError.message}`);
            console.log("Falling back to other methods...");
            // Continue to next approach
        }
        
        // APPROACH 4: Try ytdown from nayan-videos-downloader
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
            
            // APPROACH 5: Try Invidious API for audio
            try {
                console.log("Trying invidious API for audio...");
                const invidiousResult = await getFromInvidiousApi(videoId);
                console.log("Invidious API successful!");
                
                return {
                    title: invidiousResult.title || 'YouTube Music',
                    high: invidiousResult.highQualityUrl || '',
                    low: invidiousResult.lowQualityUrl || '',
                    thumbnail: thumbnail,
                    isAudio: true,
                    source: 'invidious-audio'
                };
            } catch (invidiousError) {
                console.error(`Invidious API audio error: ${invidiousError.message}`);
                
                // APPROACH 6: Try youtube-dl-exec again but with better audio format selection
                try {
                    console.log("Attempting to extract audio URL with youtube-dl-exec and a different approach...");
                    
                    // Use a different user agent
                    const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
                    
                    const info = await youtubeDl(url, {
                        dumpSingleJson: true,
                        noCheckCertificates: true,
                        noWarnings: true,
                        format: 'bestaudio',
                        addHeader: [
                            `user-agent:${userAgent}`,
                            'referer:https://www.google.com/',
                            'accept-language:en-US,en;q=0.9',
                        ],
                        socketTimeout: 10
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
                    
                    // APPROACH 7: Final fallback to direct YouTube links for audio
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
