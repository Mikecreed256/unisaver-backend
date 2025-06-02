const fs = require('fs')
const path = require('path')
const ytdl = require('ytdl-core')
const youtubedl = require('youtube-dl-exec')
const ffmpeg = require('fluent-ffmpeg')
const https = require('https')
const http = require('http')

// Try to set ffmpeg path
try {
  const ffmpegBin = require('@ffmpeg-installer/ffmpeg')
  ffmpeg.setFfmpegPath(ffmpegBin.path)
} catch (_) {
  console.log('Using system ffmpeg')
}

const TEMP_DIR = path.join(__dirname, '..', 'temp')
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true })

// Enhanced rate limiter with better defaults for server environment
const limiter = (() => {
  const calls = []
  return async (fn, max = 1, window = 60000) => { // Very conservative: 1 call per minute
    const now = Date.now()
    while (calls.length > 0 && calls[0] < now - window) {
      calls.shift()
    }
    
    if (calls.length >= max) {
      const waitTime = calls[0] + window - now
      console.log(`Rate limit reached, waiting ${Math.ceil(waitTime/1000)}s`)
      await new Promise(r => setTimeout(r, waitTime))
    }
    
    calls.push(now)
    return fn()
  }
})()

// Rotating proxies and user agents for server environment
const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/120.0.0.0 Safari/537.36'
]

const getRandomUserAgent = () => userAgents[Math.floor(Math.random() * userAgents.length)]

// Create cookies.txt content for server environment
function createServerCookies() {
  const cookiesPath = path.join(TEMP_DIR, 'youtube_cookies.txt')
  
  // Basic cookies that might help with some requests
  const cookieContent = `# Netscape HTTP Cookie File
# Generated for server environment
.youtube.com	TRUE	/	FALSE	1735689600	CONSENT	PENDING+999
.youtube.com	TRUE	/	FALSE	1735689600	PREF	tz=UTC
.youtube.com	TRUE	/	FALSE	1735689600	YSC	random123456789
`
  
  try {
    fs.writeFileSync(cookiesPath, cookieContent)
    return cookiesPath
  } catch (error) {
    console.log('Failed to create cookies file:', error.message)
    return null
  }
}

// Format sorting utilities
const sortFormats = fmts => {
  if (!Array.isArray(fmts)) return []
  return fmts
    .filter(f => f && f.vcodec !== 'none' && f.acodec !== 'none')
    .sort((a, b) => (b.height || 0) - (a.height || 0))
}

const pickHighLow = fmts => {
  if (!fmts || fmts.length === 0) {
    return { high: null, low: null }
  }
  
  const high = fmts.find(f => (f.height || 0) >= 720) || fmts[0]
  const low = [...fmts].reverse().find(f => (f.height || 0) <= 360) || fmts.at(-1)
  
  return { high, low }
}

// Retry wrapper with longer delays for server environment
async function retryOnError(fn, maxRetries = 2, baseDelay = 5000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (error) {
      const isRetryableError = 
        error.message?.includes('Sign in to confirm') ||
        error.message?.includes('bot') ||
        error.message?.includes('429') ||
        error.message?.includes('Too Many Requests') ||
        error.statusCode === 410 ||
        error.statusCode === 429
      
      if (isRetryableError && i < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, i) + Math.random() * 2000 // Add jitter
        console.log(`Attempt ${i + 1} failed: ${error.message}. Retrying in ${Math.ceil(delay/1000)}s...`)
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }
      throw error
    }
  }
}

// Method 1: yt-dlp with server-friendly options
async function tryYtDlpWithServerOptions(url) {
  console.log('Trying yt-dlp with server-optimized settings...')
  
  const cookiesPath = createServerCookies()
  const userAgent = getRandomUserAgent()
  
  const options = {
    dumpSingleJson: true,
    noCheckCertificates: true,
    noWarnings: true,
    preferFreeFormats: true,
    geoBypass: true,
    addHeader: [
      `referer:https://www.google.com/`,
      `user-agent:${userAgent}`,
      'accept-language:en-US,en;q=0.9',
      'accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    ],
    sleepInterval: 2,
    maxSleepInterval: 8,
    sleepSubtitles: 2
  }
  
  // Add cookies if file was created successfully
  if (cookiesPath) {
    options.cookies = cookiesPath
  }
  
  try {
    const result = await youtubedl(url, options)
    
    if (result && result.formats) {
      const formats = sortFormats(result.formats)
      const { high, low } = pickHighLow(formats)
      
      return {
        success: true,
        source: 'yt-dlp-server',
        videoId: result.id,
        title: result.title,
        author: result.uploader || result.channel,
        length: result.duration,
        thumbnail: result.thumbnail,
        high: high?.url,
        low: low?.url
      }
    }
    
    throw new Error('No formats found in result')
  } finally {
    // Clean up cookies file
    if (cookiesPath && fs.existsSync(cookiesPath)) {
      try {
        fs.unlinkSync(cookiesPath)
      } catch (_) {}
    }
  }
}

// Method 2: yt-dlp with minimal options (fallback)
async function tryYtDlpMinimal(url) {
  console.log('Trying minimal yt-dlp...')
  
  const result = await youtubedl(url, {
    dumpSingleJson: true,
    noWarnings: true,
    ignoreErrors: true,
    skipDownload: true,
    addHeader: [`user-agent:${getRandomUserAgent()}`]
  })
  
  if (result && result.formats) {
    const formats = sortFormats(result.formats)
    const { high, low } = pickHighLow(formats)
    
    return {
      success: true,
      source: 'yt-dlp-minimal',
      videoId: result.id,
      title: result.title,
      author: result.uploader || result.channel,
      length: result.duration,
      thumbnail: result.thumbnail,
      high: high?.url,
      low: low?.url
    }
  }
  
  throw new Error('No formats found in minimal result')
}

// Method 3: ytdl-core with enhanced options
async function tryYtdlCore(url) {
  console.log('Trying ytdl-core...')
  
  const agent = {
    headers: {
      'User-Agent': getRandomUserAgent(),
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  }
  
  const info = await ytdl.getInfo(url, { 
    requestOptions: agent,
    lang: 'en' 
  })
  
  const formats = info.formats.filter(f => f.hasVideo && f.hasAudio && f.url)
  
  if (formats.length === 0) {
    throw new Error('No combined formats available')
  }
  
  const sortedFormats = formats.sort((a, b) => (b.height || 0) - (a.height || 0))
  const { high, low } = pickHighLow(sortedFormats)
  
  return {
    success: true,
    source: 'ytdl-core',
    videoId: info.videoDetails.videoId,
    title: info.videoDetails.title,
    author: info.videoDetails.author?.name || 'Unknown',
    length: parseInt(info.videoDetails.lengthSeconds) || 0,
    thumbnail: info.videoDetails.thumbnails?.at(-1)?.url,
    high: high?.url,
    low: low?.url
  }
}

// Method 4: Direct API approach (last resort)
async function tryDirectVideoInfo(url) {
  console.log('Trying direct video info extraction...')
  
  // Extract video ID from URL
  const videoIdMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/)
  if (!videoIdMatch) {
    throw new Error('Could not extract video ID from URL')
  }
  
  const videoId = videoIdMatch[1]
  
  // Try to get basic info via ytdl-core without formats
  try {
    const info = await ytdl.getBasicInfo(`https://www.youtube.com/watch?v=${videoId}`)
    
    return {
      success: true,
      source: 'direct-info',
      videoId: info.videoDetails.videoId,
      title: info.videoDetails.title,
      author: info.videoDetails.author?.name || 'Unknown',
      length: parseInt(info.videoDetails.lengthSeconds) || 0,
      thumbnail: info.videoDetails.thumbnails?.at(-1)?.url,
      high: null, // No direct URLs available
      low: null
    }
  } catch (error) {
    throw new Error(`Direct info extraction failed: ${error.message}`)
  }
}

// Main download function optimized for server environment
async function downloadYouTubeVideo(url) {
  console.log(`Starting server-optimized download for: ${url}`)
  
  // Clean URL
  const cleanUrl = url.replace(/^https?:\/\/m\.youtube\.com/, 'https://www.youtube.com')
  
  // Methods ordered by success probability in server environment
  const methods = [
    () => retryOnError(() => tryYtdlCore(cleanUrl)),
    () => retryOnError(() => tryYtDlpWithServerOptions(cleanUrl)),
    () => retryOnError(() => tryYtDlpMinimal(cleanUrl)),
    () => retryOnError(() => tryDirectVideoInfo(cleanUrl))
  ]
  
  let lastError = null
  
  for (let i = 0; i < methods.length; i++) {
    try {
      const result = await limiter(methods[i])
      if (result && result.success) {
        console.log(`✓ Success with method: ${result.source}`)
        return result
      }
    } catch (error) {
      console.log(`✗ Method ${i + 1} failed: ${error.message}`)
      lastError = error
      
      // Longer delay between methods in server environment
      if (i < methods.length - 1) {
        const delay = 3000 + Math.random() * 2000
        console.log(`Waiting ${Math.ceil(delay/1000)}s before next method...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }
  
  throw new Error(`All methods failed. Last error: ${lastError?.message || 'Unknown error'}`)
}

// Simplified music download for server environment
async function downloadYouTubeMusic(url) {
  console.log(`Starting music download for: ${url}`)
  
  try {
    // Get basic video info first
    const videoData = await downloadYouTubeVideo(url)
    
    // Try to get audio-only URL via yt-dlp
    try {
      const result = await limiter(async () => {
        return await youtubedl(url, {
          dumpSingleJson: true,
          format: 'bestaudio[ext=m4a]/bestaudio',
          noWarnings: true,
          addHeader: [`user-agent:${getRandomUserAgent()}`]
        })
      })
      
      if (result && result.url) {
        return {
          ...videoData,
          mp3: result.url
        }
      }
    } catch (audioError) {
      console.log(`Audio extraction failed: ${audioError.message}`)
    }
    
    // Fallback to video URLs
    return {
      ...videoData,
      mp3: videoData.high || videoData.low
    }
  } catch (error) {
    throw new Error(`Music download failed: ${error.message}`)
  }
}

// Simplified quality check for server environment
async function getVideoQualities(url) {
  console.log(`Getting video qualities for: ${url}`)
  
  try {
    const result = await limiter(async () => {
      return await youtubedl(url, {
        listFormats: true,
        noWarnings: true
      })
    })
    
    // Parse the format list output
    if (typeof result === 'string') {
      const lines = result.split('\n')
      const formatLines = lines.filter(line => 
        line.includes('mp4') || line.includes('webm') || line.includes('x')
      )
      
      return formatLines.map((line, index) => {
        const parts = line.trim().split(/\s+/)
        return {
          itag: parts[0] || `format_${index}`,
          height: 'N/A',
          fps: 'N/A',
          size: 'N/A',
          note: line.trim()
        }
      })
    }
    
    return [{ itag: 'default', height: 'N/A', fps: 'N/A', size: 'N/A', note: 'Default quality' }]
  } catch (error) {
    console.log(`Quality check failed: ${error.message}`)
    return [{ itag: 'unknown', height: 'N/A', fps: 'N/A', size: 'N/A', note: 'Quality info unavailable' }]
  }
}

// Enhanced cleanup for server environment
function scheduleCleanup(maxAge = 3600000) { // 1 hour for server environment
  const cleanup = () => {
    try {
      if (!fs.existsSync(TEMP_DIR)) return
      
      const files = fs.readdirSync(TEMP_DIR)
      let cleanedCount = 0
      
      files.forEach(filename => {
        try {
          const filepath = path.join(TEMP_DIR, filename)
          const stats = fs.statSync(filepath)
          
          if (Date.now() - stats.mtimeMs > maxAge) {
            fs.rmSync(filepath, { force: true })
            cleanedCount++
          }
        } catch (error) {
          console.log(`Failed to clean ${filename}: ${error.message}`)
        }
      })
      
      if (cleanedCount > 0) {
        console.log(`🧹 Cleaned ${cleanedCount} temp files`)
      }
    } catch (error) {
      console.log(`Cleanup error: ${error.message}`)
    }
  }
  
  cleanup()
  const intervalMinutes = Math.ceil(maxAge / 2 / 1000 / 60)
  setInterval(cleanup, maxAge / 2)
  console.log(`🕒 Cleanup scheduled every ${intervalMinutes} minutes`)
}

// Utility functions
function isValidYouTubeUrl(url) {
  const patterns = [
    /^https?:\/\/(www\.|m\.)?youtube\.com\/watch\?v=[\w-]+/,
    /^https?:\/\/youtu\.be\/[\w-]+/,
    /^https?:\/\/(www\.|m\.)?youtube\.com\/embed\/[\w-]+/
  ]
  
  return patterns.some(pattern => pattern.test(url))
}

function handleDownloadError(error, url) {
  const errorMessages = {
    'Sign in to confirm': '🤖 YouTube requires verification - server environment detected',
    'bot': '🛡️ Anti-bot protection triggered',
    '410': '⏰ Video URL expired',
    'Private video': '🔒 Video is private',
    'unavailable': '❌ Video unavailable',
    'region': '🌍 Geographic restriction'
  }
  
  for (const [key, message] of Object.entries(errorMessages)) {
    if (error.message?.includes(key)) {
      return new Error(`${message}: ${url}`)
    }
  }
  
  return error
}

// Initialize
scheduleCleanup()
console.log('🚀 YouTube downloader initialized for server environment')

module.exports = {
  downloadYouTubeVideo,
  downloadYouTubeMusic,
  getVideoQualities,
  isValidYouTubeUrl,
  handleDownloadError,
  
  // Server-optimized exports
  tryYtdlCore,
  tryYtDlpWithServerOptions,
  tryYtDlpMinimal,
  retryOnError,
  limiter
}
