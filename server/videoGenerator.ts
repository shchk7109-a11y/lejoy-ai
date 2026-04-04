import { execSync, exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const execAsync = promisify(exec);

export interface StoryPageData {
  pageNumber: number;
  imageUrl: string;
  audioBase64: string;
  audioMime: string; // e.g. "audio/L16;rate=24000" or "audio/wav"
  text: string;
}

/**
 * 将故事的图片+语音合成为MP4视频
 * 每页图片显示对应语音时长，最后拼接为完整视频
 */
export async function generateStoryVideo(
  pages: StoryPageData[],
  title: string
): Promise<Buffer> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "story-video-"));

  try {
    const segmentFiles: string[] = [];

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];

      // 1. 下载图片
      const imgPath = path.join(tmpDir, `page${i + 1}.jpg`);
      const imgResp = await fetch(page.imageUrl);
      const imgBuf = Buffer.from(await imgResp.arrayBuffer());
      fs.writeFileSync(imgPath, imgBuf);

      // 2. 写入音频文件
      const audioBuf = Buffer.from(page.audioBase64, "base64");
      let audioPath = path.join(tmpDir, `page${i + 1}.wav`);

      // 判断音频格式
      const mime = page.audioMime || "";
      if (mime.includes("L16") || mime.includes("pcm")) {
        // 原始PCM数据，需要加WAV头
        const rateMatch = mime.match(/rate=(\d+)/);
        const sampleRate = rateMatch ? parseInt(rateMatch[1]) : 24000;
        const wavBuf = pcmToWav(audioBuf, sampleRate, 1, 16);
        fs.writeFileSync(audioPath, wavBuf);
      } else {
        // 已经是WAV或其他格式，直接写入
        const ext = mime.includes("mp3") ? "mp3" : mime.includes("ogg") ? "ogg" : "wav";
        audioPath = path.join(tmpDir, `page${i + 1}.${ext}`);
        fs.writeFileSync(audioPath, audioBuf);
      }

      // 3. 获取音频时长（秒）
      let duration = 5; // 默认5秒
      try {
        const { stdout } = await execAsync(
          `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${audioPath}"`
        );
        const parsed = parseFloat(stdout.trim());
        if (!isNaN(parsed) && parsed > 0) duration = Math.ceil(parsed) + 0.5; // 加0.5秒缓冲
      } catch {
        duration = 8; // 获取失败用8秒
      }

      // 4. 合成单页视频（图片+音频）
      const segPath = path.join(tmpDir, `seg${i + 1}.mp4`);
      const ffmpegCmd = [
        "ffmpeg -y",
        `-loop 1 -t ${duration} -i "${imgPath}"`,
        `-i "${audioPath}"`,
        `-c:v libx264 -tune stillimage -preset fast`,
        `-c:a aac -b:a 128k`,
        `-pix_fmt yuv420p`,
        `-vf "scale=1080:1080:force_original_aspect_ratio=decrease,pad=1080:1080:(ow-iw)/2:(oh-ih)/2:color=white"`,
        `-shortest`,
        `"${segPath}"`
      ].join(" ");

      await execAsync(ffmpegCmd);
      segmentFiles.push(segPath);
    }

    // 5. 拼接所有片段
    const concatListPath = path.join(tmpDir, "concat.txt");
    const concatContent = segmentFiles.map(f => `file '${f}'`).join("\n");
    fs.writeFileSync(concatListPath, concatContent);

    const outputPath = path.join(tmpDir, "story.mp4");
    await execAsync(
      `ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c copy "${outputPath}"`
    );

    const videoBuf = fs.readFileSync(outputPath);
    return videoBuf;
  } finally {
    // 清理临时文件
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch { /* ignore */ }
  }
}

/**
 * 将原始PCM数据转换为WAV格式
 */
function pcmToWav(pcmData: Buffer, sampleRate: number, channels: number, bitDepth: number): Buffer {
  const byteRate = (sampleRate * channels * bitDepth) / 8;
  const blockAlign = (channels * bitDepth) / 8;
  const dataSize = pcmData.length;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const wav = Buffer.alloc(totalSize);
  let offset = 0;

  // RIFF header
  wav.write("RIFF", offset); offset += 4;
  wav.writeUInt32LE(totalSize - 8, offset); offset += 4;
  wav.write("WAVE", offset); offset += 4;

  // fmt chunk
  wav.write("fmt ", offset); offset += 4;
  wav.writeUInt32LE(16, offset); offset += 4; // chunk size
  wav.writeUInt16LE(1, offset); offset += 2;  // PCM format
  wav.writeUInt16LE(channels, offset); offset += 2;
  wav.writeUInt32LE(sampleRate, offset); offset += 4;
  wav.writeUInt32LE(byteRate, offset); offset += 4;
  wav.writeUInt16LE(blockAlign, offset); offset += 2;
  wav.writeUInt16LE(bitDepth, offset); offset += 2;

  // data chunk
  wav.write("data", offset); offset += 4;
  wav.writeUInt32LE(dataSize, offset); offset += 4;
  pcmData.copy(wav, offset);

  return wav;
}
