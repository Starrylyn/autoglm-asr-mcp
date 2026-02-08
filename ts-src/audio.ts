import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FFmpegError } from "./errors.js";

export interface AudioChunk {
  data: Buffer;
  startMs: number;
  endMs: number;
  index: number;
  isSilent: boolean;
}

export interface AudioInfo {
  duration: number;
  format: string;
  sampleRate: number;
  channels: number;
}

async function runFFprobe(filePath: string): Promise<AudioInfo> {
  return new Promise((resolve, reject) => {
    const args = [
      "-v", "quiet",
      "-print_format", "json",
      "-show_format",
      "-show_streams",
      filePath,
    ];

    const proc = spawn("ffprobe", args);
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => { stdout += data; });
    proc.stderr.on("data", (data) => { stderr += data; });

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new FFmpegError("ffprobe", stderr));
        return;
      }
      try {
        const info = JSON.parse(stdout);
        const audioStream = info.streams?.find((s: { codec_type: string }) => s.codec_type === "audio");
        resolve({
          duration: parseFloat(info.format?.duration || "0"),
          format: info.format?.format_name || "unknown",
          sampleRate: parseInt(audioStream?.sample_rate || "16000", 10),
          channels: parseInt(audioStream?.channels || "1", 10),
        });
      } catch (e) {
        reject(
          new FFmpegError(
            "ffprobe-parse",
            `Failed to parse ffprobe output: ${String(e)}`,
            e,
          ),
        );
      }
    });
  });
}

async function extractSegment(
  inputPath: string,
  startSec: number,
  durationSec: number,
  outputPath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-i", inputPath,
      "-ss", startSec.toString(),
      "-t", durationSec.toString(),
      "-ar", "16000",
      "-ac", "1",
      "-f", "wav",
      outputPath,
    ];

    const proc = spawn("ffmpeg", args);
    let stderr = "";
    proc.stderr.on("data", (data) => { stderr += data; });

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new FFmpegError("extract", stderr));
      } else {
        resolve();
      }
    });
  });
}

async function detectSilenceRanges(
  filePath: string,
  silenceThreshDb: number = -40,
  minSilenceLen: number = 0.5,
): Promise<Array<{ start: number; end: number }>> {
  return new Promise((resolve, reject) => {
    const args = [
      "-i", filePath,
      "-af", `silencedetect=noise=${silenceThreshDb}dB:d=${minSilenceLen}`,
      "-f", "null",
      "-",
    ];

    const proc = spawn("ffmpeg", args);
    let stderr = "";
    proc.stderr.on("data", (data) => { stderr += data; });

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new FFmpegError("silencedetect", stderr));
        return;
      }

      const ranges: Array<{ start: number; end: number }> = [];
      const startRegex = /silence_start: ([\d.]+)/g;
      const endRegex = /silence_end: ([\d.]+)/g;

      const starts: number[] = [];
      const ends: number[] = [];

      let match: RegExpExecArray | null = startRegex.exec(stderr);
      while (match !== null) {
        starts.push(parseFloat(match[1]));
        match = startRegex.exec(stderr);
      }
      match = endRegex.exec(stderr);
      while (match !== null) {
        ends.push(parseFloat(match[1]));
        match = endRegex.exec(stderr);
      }

      for (let i = 0; i < Math.min(starts.length, ends.length); i++) {
        ranges.push({ start: starts[i], end: ends[i] });
      }

      resolve(ranges);
    });
  });
}

function calculateRMS(buffer: Buffer): number {
  let sum = 0;
  for (let i = 44; i < buffer.length; i += 2) {
    const sample = buffer.readInt16LE(i);
    sum += sample * sample;
  }
  const numSamples = (buffer.length - 44) / 2;
  if (numSamples === 0) return -100;
  const rms = Math.sqrt(sum / numSamples);
  return 20 * Math.log10(rms / 32768);
}

export async function getAudioInfo(filePath: string): Promise<AudioInfo> {
  return runFFprobe(filePath);
}

export async function splitAudio(
  filePath: string,
  maxChunkDurationSec: number = 25,
  silenceThreshDb: number = -40,
): Promise<AudioChunk[]> {
  const info = await runFFprobe(filePath);
  const totalDuration = info.duration;

  if (totalDuration <= maxChunkDurationSec) {
    const tempDir = await mkdtemp(join(tmpdir(), "asr-"));
    try {
      const outPath = join(tempDir, "chunk_0.wav");
      await extractSegment(filePath, 0, totalDuration, outPath);
      const data = await readFile(outPath);

      const rmsDb = calculateRMS(data);
      return [{
        data,
        startMs: 0,
        endMs: Math.round(totalDuration * 1000),
        index: 0,
        isSilent: rmsDb < silenceThreshDb,
      }];
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  const silenceRanges = await detectSilenceRanges(filePath, silenceThreshDb);
  const silenceMidpoints = silenceRanges.map(r => (r.start + r.end) / 2);

  const chunks: AudioChunk[] = [];
  const tempDir = await mkdtemp(join(tmpdir(), "asr-"));

  try {
    let currentStart = 0;
    let chunkIndex = 0;

    while (currentStart < totalDuration) {
      const idealEnd = currentStart + maxChunkDurationSec;

      let bestSplit: number | null = null;
      for (const midpoint of silenceMidpoints) {
        if (midpoint > currentStart && midpoint <= idealEnd) {
          bestSplit = midpoint;
        }
      }

      const actualEnd = bestSplit ?? Math.min(idealEnd, totalDuration);
      const duration = actualEnd - currentStart;

      const outPath = join(tempDir, `chunk_${chunkIndex}.wav`);
      await extractSegment(filePath, currentStart, duration, outPath);
      const data = await readFile(outPath);

      const rmsDb = calculateRMS(data);

      chunks.push({
        data,
        startMs: Math.round(currentStart * 1000),
        endMs: Math.round(actualEnd * 1000),
        index: chunkIndex,
        isSilent: rmsDb < silenceThreshDb,
      });

      currentStart = actualEnd;
      chunkIndex++;
    }

    return chunks;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
