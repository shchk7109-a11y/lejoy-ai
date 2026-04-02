/**
 * Client-side MP4 export for story pages.
 * Uses WebCodecs (VideoEncoder + AudioEncoder) + mp4-muxer to produce
 * a standard H.264 + AAC MP4 playable on both Android and iPhone.
 */
import { Muxer, ArrayBufferTarget } from "mp4-muxer";

export type ExportPage = {
  text: string;
  imageUrl?: string;
  audioUrl?: string;
};

type ProgressCallback = (percent: number) => void;

const VIDEO_WIDTH = 720;
const VIDEO_HEIGHT = 960;
const DEFAULT_PAGE_DURATION_S = 5;
const SAMPLE_RATE = 44100;

export function isExportSupported(): boolean {
  return typeof VideoEncoder !== "undefined" && typeof AudioEncoder !== "undefined";
}

// ── Main export function ─────────────────────────────────────
export async function exportStoryToMp4(
  pages: ExportPage[],
  title: string,
  onProgress?: ProgressCallback
): Promise<Blob> {
  if (!isExportSupported()) {
    throw new Error("\u5f53\u524d\u6d4f\u89c8\u5668\u4e0d\u652f\u6301\u89c6\u9891\u5bfc\u51fa\uff0c\u8bf7\u4f7f\u7528\u6700\u65b0\u7248 Chrome \u6d4f\u89c8\u5668");
  }

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: "avc", width: VIDEO_WIDTH, height: VIDEO_HEIGHT },
    audio: { codec: "aac", numberOfChannels: 1, sampleRate: SAMPLE_RATE },
    fastStart: "in-memory",
  });

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => console.error("[MP4] VideoEncoder error:", e),
  });
  videoEncoder.configure({
    codec: "avc1.42001f",
    width: VIDEO_WIDTH,
    height: VIDEO_HEIGHT,
    bitrate: 1_000_000,
    framerate: 1,
  });

  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (e) => console.error("[MP4] AudioEncoder error:", e),
  });
  audioEncoder.configure({
    codec: "mp4a.40.2",
    numberOfChannels: 1,
    sampleRate: SAMPLE_RATE,
    bitrate: 128_000,
  });

  // Use regular Canvas for better font + drawImage compatibility
  const canvas = document.createElement("canvas");
  canvas.width = VIDEO_WIDTH;
  canvas.height = VIDEO_HEIGHT;
  const ctx = canvas.getContext("2d")!;
  const audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE });

  let videoTimestampUs = 0;
  let audioTimestampUs = 0;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    onProgress?.(Math.round((i / pages.length) * 90));

    // ── Draw frame ───────────────────────────────────────────
    ctx.fillStyle = "#FFF8F0";
    ctx.fillRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);

    // Draw image
    if (page.imageUrl) {
      try {
        const img = await loadImageElement(page.imageUrl);
        const imgH = VIDEO_HEIGHT * 0.6;
        drawCover(ctx, img, 0, 0, VIDEO_WIDTH, imgH);
        console.log(`[MP4] Page ${i + 1} image loaded: ${img.naturalWidth}x${img.naturalHeight}`);
      } catch (e) {
        console.error(`[MP4] Page ${i + 1} image load failed:`, e);
      }
    }

    // Draw text area
    drawTextArea(ctx, page.text, VIDEO_HEIGHT * 0.6);

    // ── Decode audio ─────────────────────────────────────────
    let pageDurationS = DEFAULT_PAGE_DURATION_S;
    let pcmData: Float32Array | null = null;
    if (page.audioUrl) {
      try {
        const audioBuffer = await fetchAndDecodeAudio(audioCtx, page.audioUrl);
        pageDurationS = audioBuffer.duration;
        pcmData = resampleToMono(audioBuffer, SAMPLE_RATE);
      } catch (e) {
        console.warn(`[MP4] Page ${i + 1} audio decode failed:`, e);
      }
    }

    const pageDurationUs = Math.round(pageDurationS * 1_000_000);

    // ── Encode video frame ───────────────────────────────────
    const frame = new VideoFrame(canvas, {
      timestamp: videoTimestampUs,
      duration: pageDurationUs,
    });
    videoEncoder.encode(frame, { keyFrame: true });
    frame.close();
    videoTimestampUs += pageDurationUs;

    // ── Encode audio ─────────────────────────────────────────
    if (pcmData && pcmData.length > 0) {
      // Ensure we have a non-shared ArrayBuffer
      const buffer = new ArrayBuffer(pcmData.byteLength);
      new Float32Array(buffer).set(pcmData);
      const audioData = new AudioData({
        format: "f32-planar",
        sampleRate: SAMPLE_RATE,
        numberOfFrames: pcmData.length,
        numberOfChannels: 1,
        timestamp: audioTimestampUs,
        data: buffer,
      });
      audioEncoder.encode(audioData);
      audioData.close();
    }
    audioTimestampUs += pageDurationUs;
  }

  await videoEncoder.flush();
  await audioEncoder.flush();
  videoEncoder.close();
  audioEncoder.close();
  await audioCtx.close();

  muxer.finalize();
  onProgress?.(100);

  return new Blob([target.buffer], { type: "video/mp4" });
}

// ── Helper: load image as HTMLImageElement via proxy ──────────
function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    // Use server proxy to avoid CORS
    img.src = `/api/asset-proxy?url=${encodeURIComponent(url)}`;
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error(`Image load error: ${e}`));
  });
}

// ── Helper: draw image covering area (object-fit: cover) ─────
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number, dy: number, dw: number, dh: number
) {
  const imgRatio = img.naturalWidth / img.naturalHeight;
  const areaRatio = dw / dh;
  let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
  if (imgRatio > areaRatio) {
    sw = img.naturalHeight * areaRatio;
    sx = (img.naturalWidth - sw) / 2;
  } else {
    sh = img.naturalWidth / areaRatio;
    sy = (img.naturalHeight - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

// ── Helper: draw text area ───────────────────────────────────
function drawTextArea(ctx: CanvasRenderingContext2D, text: string, yStart: number) {
  const padding = 32;

  ctx.fillStyle = "rgba(255, 248, 240, 0.95)";
  ctx.fillRect(0, yStart, VIDEO_WIDTH, VIDEO_HEIGHT - yStart);

  ctx.strokeStyle = "#E8D5C0";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, yStart + 8);
  ctx.lineTo(VIDEO_WIDTH - padding, yStart + 8);
  ctx.stroke();

  ctx.fillStyle = "#3D2B1F";
  ctx.font = "bold 30px 'Microsoft YaHei', 'PingFang SC', sans-serif";
  ctx.textBaseline = "top";

  const maxWidth = VIDEO_WIDTH - padding * 2;
  const lineHeight = 46;
  let y = yStart + 24;
  let line = "";

  for (const char of text) {
    const testLine = line + char;
    if (ctx.measureText(testLine).width > maxWidth && line.length > 0) {
      ctx.fillText(line, padding, y);
      y += lineHeight;
      line = char;
    } else {
      line = testLine;
    }
  }
  if (line) ctx.fillText(line, padding, y);
}

// ── Helper: fetch and decode audio via proxy ─────────────────
async function fetchAndDecodeAudio(audioCtx: AudioContext, url: string): Promise<AudioBuffer> {
  const response = await fetch(`/api/asset-proxy?url=${encodeURIComponent(url)}`);
  if (!response.ok) throw new Error(`Audio fetch failed: ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();
  return audioCtx.decodeAudioData(arrayBuffer);
}

// ── Helper: resample to mono ─────────────────────────────────
function resampleToMono(audioBuffer: AudioBuffer, targetRate: number): Float32Array {
  const length = audioBuffer.length;
  const channels = audioBuffer.numberOfChannels;
  const mono = new Float32Array(length);
  for (let ch = 0; ch < channels; ch++) {
    const data = audioBuffer.getChannelData(ch);
    for (let i = 0; i < length; i++) mono[i] += data[i] / channels;
  }

  if (audioBuffer.sampleRate === targetRate) return mono;

  const ratio = targetRate / audioBuffer.sampleRate;
  const newLength = Math.round(length * ratio);
  const resampled = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const srcIdx = i / ratio;
    const idx = Math.floor(srcIdx);
    const frac = srcIdx - idx;
    resampled[i] = (mono[idx] ?? 0) + ((mono[Math.min(idx + 1, length - 1)] ?? 0) - (mono[idx] ?? 0)) * frac;
  }
  return resampled;
}
