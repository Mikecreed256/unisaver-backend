const fs = require('fs')
const path = require('path')
const { YtDlp } = require('ytdlp-nodejs')
const ytdl = require('ytdl-core')
const youtubedl = require('youtube-dl-exec')
const ffmpeg = require('fluent-ffmpeg')
const crypto = require('crypto')

// Try to set ffmpeg path
try {
  const ffmpegBin = require('@ffmpeg-installer/ffmpeg')
  ffmpeg.setFfmpegPath(ffmpegBin.path)
} catch (_) {
  console.log('Using system ffmpeg')
}

const TEMP_DIR = path.join(__dirname, '..', 'temp')
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true })

// Enhanced rate limiter with better defaults
const limiter = (() => {
  const calls = []
  return async (fn, max = 2, window = 30000) => { // More conservative: 2 calls per 30 seconds
    const now = Date.now()
    // Remove old calls outside the window
    while (calls.length > 0 && calls[0] < now - window) {
      calls.shift()
    }
    
    if (calls.length >= max) {
      const waitTime = calls[0] + window - now
      console.log(`Rate limit reached, waiting ${waitTime}ms`)
      await new Promise(r => setTimeout(r, waitTime))
    }
    
    calls.push(now)
    return fn()
  }
})()

// User agent rotation
const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0'
]

const getRandomUserAgent = () => userAgents[Math.floor(Math.random() * userAgents.length)]

// Format sorting and selection utilities
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

// Retry wrapper for 410 errors
async function retryOnError(fn, maxRetries = 3, retryDelay = 2000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (error) {
      const isRetryableError = 
        error.statusCode === 410 ||
        error.message?.includes('410') ||
        error.message?.includes('Sign in to confirm') ||
        error.message?.includes('bot') ||
        error.message?.includes('unavailable')
      
      if (isRetryableError && i < maxRetries - 1) {
        const delay = retryDelay * Math.pow(2, i) // Exponential backoff
        console.log(`Attempt ${i + 1} failed: ${error.message}. Retrying in ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }
      throw error
    }
  }
}

// Method 1: yt-dlp with cookies (most reliable)
async function tryYtDlpWithCookies(url) {
  console.log('Trying yt-dlp with browser cookies...')
  
  const browsers = ['chrome', 'firefox', 'edge', 'safari']
  
  for (const browser of browsers) {
    try {
      const result = await youtubedl(url, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        preferFreeFormats: true,
        addHeader: [
          `referer:https://www.youtube.com/`,
          `user-agent:${getRandomUserAgent()}`
        ],
        cookiesFromBrowser: browser
      })
      
      if (result && result.formats) {
        const formats = sortFormats(result.formats)
        const { high, low } = pickHighLow(formats)
        
        return {
          success: true,
          source: `yt-dlp-cookies-${browser}`,
          videoId: result.id,
          title: result.title,
          author: result.uploader || result.channel,
          length: result.duration,
          thumbnail: result.thumbnail,
          high: high?.url,
          low: low?.url
        }
      }
    } catch (error) {
      console.log(`Failed with ${browser} cookies: ${error.message}`)
      continue
    }
  }
  
  throw new Error('All browser cookie methods failed')
}

// Method 2: yt-dlp basic (no cookies)
async function tryYtDlpBasic(url) {
  console.log('Trying basic yt-dlp...')
  
  const result = await youtubedl(url, {
    dumpSingleJson: true,
    noCheckCertificates: true,
    noWarnings: true,
    preferFreeFormats: true,
    addHeader: [
      `referer:https://www.youtube.com/`,
      `user-agent:${getRandomUserAgent()}`
    ],
    // Additional anti-detection measures
    sleepInterval: 1,
    maxSleepInterval: 5
  })
  
  if (result && result.formats) {
    const formats = sortFormats(result.formats)
    const { high, low } = pickHighLow(formats)
    
    return {
      success: true,
      source: 'yt-dlp-basic',
      videoId: result.id,
      title: result.title,
      author: result.uploader || result.channel,
      length: result.duration,
      thumbnail: result.thumbnail,
      high: high?.url,
      low: low?.url
    }
  }
  
  throw new Error('No formats found in yt-dlp result')
}

// Method 3: ytdlp-nodejs
async function tryYtDlpNodejs(url) {
  console.log('Trying ytdlp-nodejs...')
  
  const yt = new YtDlp()
  const info = await yt.getInfo(url)
  
  if (info && info.formats) {
    const formats = sortFormats(info.formats)
    const { high, low } = pickHighLow(formats)
    
    return {
      success: true,
      source: 'ytdlp-nodejs',
      videoId: info.id,
      title: info.title,
      author: info.uploader,
      length: info.duration,
      thumbnail: info.thumbnail,
      high: high?.url,
      low: low?.url
    }
  }
  
  throw new Error('No formats found in ytdlp-nodejs result')
}

// Method 4: ytdl-core fallback
async function tryYtdlCore(url) {
  console.log('Trying ytdl-core fallback...')
  
  const info = await ytdl.getInfo(url)
  const formats = info.formats.filter(f => f.hasVideo && f.hasAudio)
  
  if (formats.length === 0) {
    throw new Error('No combined formats available in ytdl-core')
  }
  
  const sortedFormats = formats.sort((a, b) => (b.height || 0) - (a.height || 0))
  const { high, low } = pickHighLow(sortedFormats)
  
  return {
    success: true,
    source: 'ytdl-core',
    videoId: info.videoDetails.videoId,
    title: info.videoDetails.title,
    author: info.videoDetails.author.name,
    length: parseInt(info.videoDetails.lengthSeconds),
    thumbnail: info.videoDetails.thumbnails?.at(-1)?.url,
    high: high?.url,
    low: low?.url
  }
}

// Main download function with multiple fallbacks
async function downloadYouTubeVideo(url) {
  console.log(`Starting download process for: ${url}`)
  
  // Clean and normalize URL
  const cleanUrl = url.replace(/^https?:\/\/m\.youtube\.com/, 'https://www.youtube.com')
  
  const methods = [
    () => retryOnError(() => tryYtDlpWithCookies(cleanUrl)),
    () => retryOnError(() => tryYtDlpBasic(cleanUrl)),
    () => retryOnError(() => tryYtDlpNodejs(cleanUrl)),
    () => retryOnError(() => tryYtdlCore(cleanUrl))
  ]
  
  let lastError = null
  
  for (const method of methods) {
    try {
      const result = await limiter(method)
      if (result && result.success) {
        console.log(`Success with method: ${result.source}`)
        return result
      }
    } catch (error) {
      console.log(`Method failed: ${error.message}`)
      lastError = error
      
      // Add delay between methods to avoid rapid requests
      await new Promise(resolve => setTimeout(resolve, 1000))
      continue
    }
  }
  
  throw new Error(`All download methods failed. Last error: ${lastError?.message || 'Unknown error'}`)
}

// Enhanced music download function
async function downloadYouTubeMusic(url) {
  console.log(`Starting music download for: ${url}`)
  
  try {
    // First get video info
    const videoData = await downloadYouTubeVideo(url)
    
    // Then try to get audio-only version
    try {
      const yt = new YtDlp()
      const audioInfo = await yt.getBestAudio(url, { 
        ext: 'mp3',
        audioQuality: 0 // Best quality
      })
      
      return {
        ...videoData,
        mp3: audioInfo.url || audioInfo
      }
    } catch (audioError) {
      console.log(`Audio extraction failed: ${audioError.message}`)
      
      // Fallback: use regular video URL for audio extraction
      return {
        ...videoData,
        mp3: videoData.high || videoData.low
      }
    }
  } catch (error) {
    throw new Error(`Music download failed: ${error.message}`)
  }
}

// Get available video qualities
async function getVideoQualities(url) {
  console.log(`Getting video qualities for: ${url}`)
  
  try {
    const result = await retryOnError(async () => {
      const yt = new YtDlp()
      const info = await yt.getInfo(url)
      return info
    })
    
    if (!result || !result.formats) {
      throw new Error('No format information available')
    }
    
    const qualities = sortFormats(result.formats).map(f => ({
      itag: f.format_id,
      height: f.height || 'N/A',
      fps: f.fps || 'N/A',
      size: f.filesize || 'N/A',
      note: f.format_note || 'N/A',
      ext: f.ext || 'N/A'
    }))
    
    return qualities
  } catch (error) {
    throw new Error(`Failed to get video qualities: ${error.message}`)
  }
}

// Enhanced cleanup function
function scheduleCleanup(maxAge = 864e5) { // 24 hours default
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
          console.log(`Failed to clean file ${filename}: ${error.message}`)
        }
      })
      
      if (cleanedCount > 0) {
        console.log(`Cleaned up ${cleanedCount} temporary files`)
      }
    } catch (error) {
      console.log(`Cleanup failed: ${error.message}`)
    }
  }
  
  // Run cleanup immediately
  cleanup()
  
  // Schedule periodic cleanup
  setInterval(cleanup, maxAge / 2)
  
  console.log(`Cleanup scheduled every ${maxAge / 2 / 1000 / 60} minutes`)
}

// Utility function to validate YouTube URLs
function isValidYouTubeUrl(url) {
  const patterns = [
    /^https?:\/\/(www\.|m\.)?youtube\.com\/watch\?v=[\w-]+/,
    /^https?:\/\/youtu\.be\/[\w-]+/,
    /^https?:\/\/(www\.|m\.)?youtube\.com\/embed\/[\w-]+/
  ]
  
  return patterns.some(pattern => pattern.test(url))
}

// Enhanced error handler
function handleDownloadError(error, url) {
  const errorMap = {
    '410': 'Video URL expired or unavailable',
    'Sign in to confirm': 'YouTube bot detection triggered',
    'Private video': 'Video is private or restricted',
    'Video unavailable': 'Video has been removed or is unavailable',
    'not available': 'Content not available in your region'
  }
  
  for (const [key, message] of Object.entries(errorMap)) {
    if (error.message?.includes(key)) {
      return new Error(`${message}: ${url}`)
    }
  }
  
  return error
}

// Initialize cleanup on module load
scheduleCleanup()

// Export functions
module.exports = {
  downloadYouTubeVideo,
  downloadYouTubeMusic,
  getVideoQualities,
  isValidYouTubeUrl,
  handleDownloadError,
  
  // Utility exports for advanced usage
  retryOnError,
  limiter,
  sortFormats,
  pickHighLow,
  
  // Individual method exports for testing
  tryYtDlpWithCookies,
  tryYtDlpBasic,
  tryYtDlpNodejs,
  tryYtdlCore
}
