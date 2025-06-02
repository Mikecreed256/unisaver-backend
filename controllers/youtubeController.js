// controllers/youtubeController.js

const ytdl = require('ytdl-core');
const path = require('path');

exports.download = async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({
      success: false,
      message: 'Missing `url` in request body'
    });
  }

  // Simple YouTube URL check
  const isValid = /(?:youtube\.com\/watch\?v=|youtu\.be\/)/i.test(url);
  if (!isValid) {
    return res.status(400).json({
      success: false,
      message: 'Invalid YouTube URL'
    });
  }

  try {
    const info = await ytdl.getInfo(url);
    const formats = info.formats
      .filter(f => f.hasVideo && f.hasAudio && f.url)
      .sort((a, b) => (b.height || 0) - (a.height || 0));

    if (formats.length === 0) {
      return res.status(500).json({
        success: false,
        message: 'No downloadable formats found'
      });
    }

    const bestFormat = formats[0];
    const directUrl = bestFormat.url;

    // Sanitize title for filename
    const rawTitle = info.videoDetails.title || 'video';
    const sanitizedTitle = rawTitle
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '_')
      .substring(0, 100);
    const ext = path.extname(bestFormat.container || '.mp4') || '.mp4';
    const filename = sanitizedTitle.endsWith(ext)
      ? sanitizedTitle
      : sanitizedTitle + ext;

    return res.json({
      success: true,
      data: {
        url: directUrl,
        title: rawTitle,
        filename
      }
    });
  } catch (err) {
    console.error('YouTube download error:', err.message);
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
};
