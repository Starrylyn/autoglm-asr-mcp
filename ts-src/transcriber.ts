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

const HALLUCINATION_PATTERNS = [
  /^The sound of .+/i,
  /^There (is|are) no .+ sounds?/i,
  /^No (speech|audio|sound|voice)/i,
  /^This (audio|clip|segment) (contains?|is) (silence|silent|no)/i,
  /^\[?(silence|no speech|inaudible)\]?$/i,
  /^(音频|这段音频|该音频).*(静音|无声|没有声音|无内容)/i,
];

function isHallucination(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return HALLUCINATION_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export class ASRTranscriber {
  private config: ASRConfig;

  constructor(config?: ASRConfig) {
    this.config = config ?? getConfig();
  }

  private async transcribeChunk(
    chunk: AudioChunk,
    context: string,
  ): Promise<string> {
    const base64Audio = chunk.data.toString("base64");
    const dataUrl = `data:audio/wav;base64,${base64Audio}`;

    const messages: Array<{ role: string; content: string | Array<{ type: string; text?: string; audio_url?: { url: string } }> }> = [
      {
        role: "system",
        content: "你是一个名为 ChatGLM 的人工智能助手。你是基于智谱AI训练的语言模型 GLM-4 模型开发的，你的任务是针对用户的问题和要求提供适当的答复和支持。\n\n",
      },
    ];

    if (context) {
      messages.push({
        role: "user",
        content: [{ type: "text", text: context }],
      });
    }

    messages.push(
      {
        role: "user",
        content: [
          { type: "text", text: "<|begin_of_audio|><|endoftext|><|end_of_audio|>" },
          { type: "audio_url", audio_url: { url: dataUrl } },
        ],
      },
      {
        role: "user",
        content: [{ type: "text", text: "将这段音频转录成文字." }],
      },
    );

    const payload = {
      model: this.config.model,
      messages,
      max_tokens: 1024,
      temperature: 1,
      repetition_penalty: 1.1,
      stream: false,
      top_k: 1,
      top_p: 0.9,
    };

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
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw APIError.fromResponse(response.status, response.statusText);
        }

        const result = await response.json() as { choices?: Array<{ message?: { content?: string } }>; content?: string };

        if (result.choices?.[0]?.message?.content) {
          return result.choices[0].message.content;
        }
        if (result.content) {
          return result.content;
        }
        return "";
      } catch (error) {
        const normalizedError =
          error instanceof APIError
            ? error
            : (error instanceof Error && error.name === "AbortError")
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

        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }

    return "";
  }

  private truncateContext(text: string): string {
    if (text.length <= this.config.contextMaxChars) {
      return text;
    }
    return text.slice(-this.config.contextMaxChars);
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
    const results = new Map<number, string>();

    const nonSilentChunks = chunks.filter((c) => !c.isSilent);
    const skippedSilent = chunks.length - nonSilentChunks.length;

    for (const chunk of chunks) {
      if (chunk.isSilent) {
        results.set(chunk.index, "");
      }
    }

    const transcribeWithLimit = (chunk: AudioChunk, ctx: string) =>
      limit(async () => {
        let text = await this.transcribeChunk(chunk, ctx);
        if (isHallucination(text)) {
          text = "";
        }
        results.set(chunk.index, text);
      });

    if (contextMode === "none") {
      await Promise.all(
        nonSilentChunks.map((chunk) => transcribeWithLimit(chunk, "")),
      );
    } else if (contextMode === "full_serial") {
      let context = "";
      for (const chunk of chunks) {
        if (chunk.isSilent) continue;
        let text = await this.transcribeChunk(chunk, context);
        if (isHallucination(text)) {
          text = "";
        }
        results.set(chunk.index, text);
        if (text) {
          context = this.truncateContext(context + text);
        }
      }
    } else if (contextMode === "sliding") {
      const firstNonSilent = nonSilentChunks[0];
      if (firstNonSilent) {
        let firstText = await this.transcribeChunk(firstNonSilent, "");
        if (isHallucination(firstText)) {
          firstText = "";
        }
        results.set(firstNonSilent.index, firstText);

        const remaining = nonSilentChunks.slice(1);
        if (remaining.length > 0) {
          const context = firstText ? this.truncateContext(firstText) : "";
          await Promise.all(
            remaining.map((chunk) => transcribeWithLimit(chunk, context)),
          );
        }
      }
    }

    const segments: TranscriptionSegment[] = chunks.map((chunk) => ({
      start: chunk.startMs / 1000,
      end: chunk.endMs / 1000,
      text: results.get(chunk.index) ?? "",
    }));

    const fullText = segments.map((s) => s.text).join("");
    const elapsed = (Date.now() - startTime) / 1000;

    return {
      text: fullText,
      segments,
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
