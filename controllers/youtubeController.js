const fs = require('fs')
const path = require('path')
const { YtDlp } = require('ytdlp-nodejs')
const ytdl = require('ytdl-core')
const ffmpeg = require('fluent-ffmpeg')
try {
  const ffmpegBin = require('@ffmpeg-installer/ffmpeg')
  ffmpeg.setFfmpegPath(ffmpegBin.path)
} catch (_) {
  console.log('Using system ffmpeg')
}
const TEMP_DIR = path.join(__dirname, '..', 'temp')
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true })
const limiter = (() => {
  const calls = []
  return async (fn, max = 5, window = 1e4) => {
    const now = Date.now()
    while (calls[0] < now - window) calls.shift()
    if (calls.length >= max) await new Promise(r => setTimeout(r, calls[0] + window - now))
    calls.push(now)
    return fn()
  }
})()
const sortFormats = fmts => fmts.filter(f => f.vcodec !== 'none' && f.acodec !== 'none').sort((a, b) => (b.height || 0) - (a.height || 0))
const pickHighLow = fmts => ({ high: fmts.find(f => (f.height || 0) >= 720) || fmts[0], low: [...fmts].reverse().find(f => (f.height || 0) <= 360) || fmts.at(-1) })
async function downloadYouTubeVideo(url) {
  try {
    return await limiter(async () => {
      const yt = new YtDlp()
      const info = await yt.getInfo(url)
      const fmts = sortFormats(info.formats)
      const { high, low } = pickHighLow(fmts)
      return { success: true, source: 'ytdlp-nodejs', videoId: info.id, title: info.title, author: info.uploader, length: info.duration, thumbnail: info.thumbnail, high: high.url, low: low.url }
    })
  } catch (_) {
    const info = await ytdl.getInfo(url)
    const fmts = sortFormats(info.formats)
    const { high, low } = pickHighLow(fmts)
    return { success: true, source: 'ytdl-core', videoId: info.videoDetails.videoId, title: info.videoDetails.title, author: info.videoDetails.author.name, length: info.videoDetails.lengthSeconds, thumbnail: info.videoDetails.thumbnails.at(-1).url, high: high.url, low: low.url }
  }
}
async function downloadYouTubeMusic(url) {
  const data = await downloadYouTubeVideo(url)
  const yt = new YtDlp()
  const mp3 = await yt.getBestAudio(url, { ext: 'mp3' })
  return { ...data, mp3 }
}
async function getVideoQualities(url) {
  const yt = new YtDlp()
  const info = await yt.getInfo(url)
  return sortFormats(info.formats).map(f => ({ itag: f.format_id, height: f.height, fps: f.fps, size: f.filesize, note: f.format_note }))
}
function scheduleCleanup(maxAge = 864e5) {
  setInterval(() => {
    fs.readdirSync(TEMP_DIR).forEach(f => {
      const fp = path.join(TEMP_DIR, f)
      if (Date.now() - fs.statSync(fp).mtimeMs > maxAge) fs.rmSync(fp, { force: true })
    })
  }, maxAge / 2)
}
scheduleCleanup()
module.exports = { downloadYouTubeVideo, downloadYouTubeMusic, getVideoQualities }
