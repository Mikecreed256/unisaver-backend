const { ytdown } = require('nayan-videos-downloader');

(async () => {
    try {
        const result = await ytdown("https://youtu.be/aRSuyrZFu_Q?si=bsfzgeeGmRpshqnF");
        console.log("YouTube media details:", {
            success: result.status,
            data: {
                title: result.data.title,
                url: result.data.url,
                thumbnail: result.data.thumb,
                sizes: ["Low Quality", "High Quality"],
                source: "youtube"
            }
        });
    } catch (error) {
        console.error("❌ YouTube Error:", error.message || error);
    }
})();
