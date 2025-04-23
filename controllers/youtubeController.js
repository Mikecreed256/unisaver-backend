const { ytdown } = require('nayan-videos-downloader');

async function downloadYouTubeVideo(url) {
    try {
        const result = await ytdown(url);
        return {
            success: true,
            data: {
                title: result.data.title,
                url: result.data.url || undefined,
                thumbnail: result.data.thumb || `https://i.ytimg.com/vi_webp/${url.split('/')[-1]}/maxresdefault.webp`,
                sizes: ["Low Quality", "High Quality"],
                source: "youtube"
            }
        };
    } catch (error) {
        console.error("❌ YouTube Error:", error.message || error);
        return {
            success: false,
            error: error.message
        };
    }
}

module.exports = {
    downloadYouTubeVideo
};
