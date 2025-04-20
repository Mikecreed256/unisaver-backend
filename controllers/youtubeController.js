// Add or update these endpoints in your server.js file

// YouTube info endpoint
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

// YouTube download endpoint - redirect to the video URL instead of downloading on server
app.get('/api/download', async (req, res) => {
  try {
    const { url, itag } = req.query;
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`Processing download - URL: ${url}, format: ${itag || 'yt_high'}`);
    
    // Check if it's a YouTube URL
    const platform = identifyPlatform(url);
    if (platform === 'youtube') {
      // Use the YouTube controller to get the video URL
      const ytData = await youtubeController.downloadYouTubeVideo(url);
      
      // If we have a direct URL from ytdown, redirect to it
      if (ytData.high) {
        console.log(`Redirecting to YouTube video URL: ${ytData.high.substring(0, 100)}...`);
        return res.redirect(ytData.high);
      }
      
      // If no direct URL, return error
      return res.status(404).json({ 
        error: 'No direct download URL available', 
        youtube_fallback: true,
        embedUrl: `https://www.youtube.com/embed/${extractVideoId(url)}`
      });
    }
    
    // Continue with existing download logic for other platforms...
    // (Your existing download code here)
    
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Download failed', details: error.message });
  }
});

// Helper function to extract video ID
function extractVideoId(url) {
  const videoIdMatch = url.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})(?:&|\/|$)/);
  return (videoIdMatch && videoIdMatch[1]) ? videoIdMatch[1] : '';
}
