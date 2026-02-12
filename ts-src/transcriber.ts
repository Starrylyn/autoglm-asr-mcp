import pLimit from "p-limit";
import { getAudioInfo, splitAudio, type AudioChunk } from "./audio.js";
import { getConfig, type ASRConfig } from "./config.js";
import { APIError } from "./errors.js";

export type ContextMode = "none" | "sliding" | "full_serial";

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptionResult {
  text: string;
  segments: TranscriptionSegment[];
  duration: number;
  stats: {
    chunks: number;
    chunksTranscribed: number;
    chunksSkippedSilent: number;
    totalTime: number;
    mode: string;
    concurrency: number;
  };
}

interface APIResponseSegment {
  id: number;
  start: number;
  end: number;
  text: string;
}

interface APIResponse {
  text?: string;
  segments?: APIResponseSegment[];
  // Fallback: chat completions format
  choices?: Array<{ message?: { content?: string } }>;
  content?: string;
}

export class ASRTranscriber {
  private config: ASRConfig;

  constructor(config?: ASRConfig) {
    this.config = config ?? getConfig();
  }

  /**
   * Transcribe a single audio chunk via the /audio/transcriptions endpoint.
   * Sends multipart/form-data with the audio file buffer.
   */
  private async transcribeChunk(
    chunk: AudioChunk,
  ): Promise<{ text: string; segments: TranscriptionSegment[] }> {
    const formData = new FormData();
    const blob = new Blob([chunk.data], { type: "audio/wav" });
    formData.append("file", blob, "audio.wav");
    formData.append("model", this.config.model);

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          this.config.requestTimeout * 1000,
        );

        const response = await fetch(this.config.apiBase, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: formData,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw APIError.fromResponse(response.status, response.statusText);
        }

        const result = (await response.json()) as APIResponse;

        // New /audio/transcriptions format: { text, segments }
        if (result.text !== undefined) {
          const segments: TranscriptionSegment[] = (result.segments ?? []).map(
            (seg) => ({
              start: seg.start,
              end: seg.end,
              text: seg.text,
            }),
          );
          return { text: result.text, segments };
        }

        // Fallback: chat completions format
        if (result.choices?.[0]?.message?.content) {
          return { text: result.choices[0].message.content, segments: [] };
        }
        if (result.content) {
          return { text: result.content, segments: [] };
        }

        return { text: "", segments: [] };
      } catch (error) {
        const normalizedError =
          error instanceof APIError
            ? error
            : error instanceof Error && error.name === "AbortError"
              ? APIError.timeout(this.config.requestTimeout)
              : new APIError(String(error), undefined, true, error);

        const isLastAttempt = attempt === this.config.maxRetries;
        const retryable = normalizedError.retryable;

        if (!retryable) {
          throw normalizedError;
        }

        if (isLastAttempt) {
          throw APIError.maxRetriesExceeded(
            this.config.maxRetries + 1,
            normalizedError,
          );
        }

        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * (attempt + 1)),
        );
      }
    }

    return { text: "", segments: [] };
  }

  async transcribe(
    audioPath: string,
    contextMode: ContextMode = "sliding",
    maxConcurrency?: number,
  ): Promise<TranscriptionResult> {
    const startTime = Date.now();
    const info = await getAudioInfo(audioPath);
    const totalDuration = info.duration;

    const chunks = await splitAudio(audioPath, this.config.maxChunkDuration);

    if (chunks.length === 0) {
      return {
        text: "",
        segments: [],
        duration: totalDuration,
        stats: {
          chunks: 0,
          chunksTranscribed: 0,
          chunksSkippedSilent: 0,
          totalTime: 0,
          mode: contextMode,
          concurrency: 0,
        },
      };
    }

    const concurrency = maxConcurrency ?? this.config.maxConcurrency;
    const limit = pLimit(concurrency);
    const textResults = new Map<number, string>();
    const segmentResults = new Map<number, TranscriptionSegment[]>();

    const nonSilentChunks = chunks.filter((c) => !c.isSilent);
    const skippedSilent = chunks.length - nonSilentChunks.length;

    for (const chunk of chunks) {
      if (chunk.isSilent) {
        textResults.set(chunk.index, "");
        segmentResults.set(chunk.index, []);
      }
    }

    // New API doesn't use context passing, so all modes effectively run in parallel
    await Promise.all(
      nonSilentChunks.map((chunk) =>
        limit(async () => {
          const result = await this.transcribeChunk(chunk);
          textResults.set(chunk.index, result.text);
          // Offset API segments by the chunk's start time
          const offsetSegments = result.segments.map((seg) => ({
            start: seg.start + chunk.startMs / 1000,
            end: seg.end + chunk.startMs / 1000,
            text: seg.text,
          }));
          segmentResults.set(chunk.index, offsetSegments);
        }),
      ),
    );

    // Merge segments in chunk order
    const allSegments: TranscriptionSegment[] = [];
    for (const chunk of chunks) {
      const segs = segmentResults.get(chunk.index) ?? [];
      if (segs.length > 0) {
        allSegments.push(...segs);
      } else {
        // Fallback: create a segment from the text result
        const text = textResults.get(chunk.index) ?? "";
        if (text) {
          allSegments.push({
            start: chunk.startMs / 1000,
            end: chunk.endMs / 1000,
            text,
          });
        }
      }
    }

    const fullText = chunks
      .map((chunk) => textResults.get(chunk.index) ?? "")
      .join("");
    const elapsed = (Date.now() - startTime) / 1000;

    return {
      text: fullText,
      segments: allSegments,
      duration: totalDuration,
      stats: {
        chunks: chunks.length,
        chunksTranscribed: chunks.length - skippedSilent,
        chunksSkippedSilent: skippedSilent,
        totalTime: Math.round(elapsed * 100) / 100,
        mode: contextMode,
        concurrency,
      },
    };
  }
}
