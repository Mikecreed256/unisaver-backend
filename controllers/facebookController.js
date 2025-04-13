// controllers/facebookController.js
const { facebook } = require('@mrnima/facebook-downloader');
const fbAlt = require('@xaviabot/fb-downloader');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const fetch = require('node-fetch');

async function downloadFacebookVideo(url) {
    console.log(`Processing Facebook URL: ${url}`);

    // Try primary method first
    try {
        const result = await facebook(url);
        if (result && result.result && (result.result.links?.HD || result.result.links?.SD)) {
            console.log("Facebook video successfully downloaded with primary method");
            return result;
        }
        throw new Error("Primary Facebook downloader returned invalid data");
    } catch (primaryError) {
        console.warn(`Primary Facebook download failed: ${primaryError.message}`);

        // Try secondary method
        try {
            console.log("Trying alternative Facebook downloader...");
            const altResult = await fbAlt(url);
            if (altResult && (altResult.hd || altResult.sd)) {
                console.log("Facebook video successfully downloaded with alternative method");
                return altResult;
            }
            throw new Error("Alternative downloader returned invalid data");
        } catch (altError) {
            console.error(`Alternative Facebook download also failed: ${altError.message}`);

            // Try direct page scraping as last resort
            try {
                console.log("Trying direct page scraping for Facebook...");

                // Fetch the Facebook page with proper headers
                const response = await fetch(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.5',
                    }
                });

                if (!response.ok) {
                    throw new Error(`Failed to fetch Facebook page: ${response.status}`);
                }

                const html = await response.text();

                // Extract title
                let title = 'Facebook Video';
                const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
                if (titleMatch && titleMatch[1]) {
                    title = titleMatch[1].replace(' | Facebook', '').trim();
                }

                // Extract video URL using various patterns
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

                for (const pattern of videoUrlPatterns) {
                    const match = html.match(pattern);
                    if (match && match[1]) {
                        let videoUrl = match[1]
                            .replace(/\\u0025/g, '%')
                            .replace(/\\u002F/g, '/')
                            .replace(/\\\//g, '/')
                            .replace(/\\/g, '')
                            .replace(/&amp;/g, '&');

                        console.log(`Found Facebook video URL: ${videoUrl.substring(0, 100)}...`);

                        // Extract thumbnail
                        let thumbnail = '';
                        const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
                        if (ogImageMatch && ogImageMatch[1]) {
                            thumbnail = ogImageMatch[1];
                        }

                        return {
                            title: title,
                            hd: videoUrl,
                            sd: videoUrl,
                            thumbnail: thumbnail || 'https://via.placeholder.com/300x150'
                        };
                    }
                }

                throw new Error("Could not extract video URL from Facebook page");
            } catch (scrapingError) {
                console.error(`Facebook page scraping failed: ${scrapingError.message}`);
                throw new Error(`Failed to download Facebook video: ${scrapingError.message}`);
            }
        }
    }
}

module.exports = { downloadFacebookVideo };