#!/usr/bin/env node

import { existsSync } from "node:fs";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { getAudioInfo } from "./audio.js";
import { ASRError, AudioFileError } from "./errors.js";
import type { ContextMode, TranscriptionResult } from "./transcriber.js";
import { ASRTranscriber } from "./transcriber.js";

const server = new Server(
  {
    name: "autoglm-asr",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

let transcriber: ASRTranscriber | null = null;

function getTranscriber(): ASRTranscriber {
  if (!transcriber) {
    transcriber = new ASRTranscriber();
  }
  return transcriber;
}

function formatResult(result: TranscriptionResult): string {
  const { stats } = result;
  let statsLine = `**Duration:** ${result.duration.toFixed(1)}s | **Chunks:** ${stats.chunksTranscribed}/${stats.chunks}`;
  if (stats.chunksSkippedSilent > 0) {
    statsLine += ` (${stats.chunksSkippedSilent} silent skipped)`;
  }
  statsLine += ` | **Time:** ${stats.totalTime}s | **Mode:** ${stats.mode}`;

  const lines = [
    "## Transcription Result",
    "",
    statsLine,
    "",
    "### Full Text",
    "",
    result.text,
  ];

  const nonEmptySegments = result.segments.filter((seg) => seg.text.trim());
  if (nonEmptySegments.length > 1) {
    lines.push("", "### Segments", "");
    for (const seg of nonEmptySegments) {
      lines.push(`**[${seg.start.toFixed(1)}s - ${seg.end.toFixed(1)}s]** ${seg.text}`);
    }
  }

  return lines.join("\n");
}

function formatError(error: unknown): string {
  if (error instanceof ASRError) {
    return `${error.code}: ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "transcribe_audio",
      description: `Transcribe an audio file to text using AutoGLM ASR.

Supports: mp3, wav, m4a, flac, ogg, webm

Features:
- Automatic chunking for long audio (>30s)
- Sliding window concurrency for speed + quality
- Context passing between chunks for better accuracy

Args:
    audio_path: Absolute path to the audio file
    context_mode: "sliding" (recommended), "none" (fastest), or "full_serial" (best quality but slow)
    max_concurrency: Max parallel API requests (default: 5)

Returns:
    Full transcription text with timing segments`,
      inputSchema: {
        type: "object",
        properties: {
          audio_path: {
            type: "string",
            description: "Absolute path to the audio file to transcribe",
          },
          context_mode: {
            type: "string",
            enum: ["sliding", "none", "full_serial"],
            default: "sliding",
            description: "Context strategy: 'sliding' (balanced), 'none' (fastest), 'full_serial' (best quality)",
          },
          max_concurrency: {
            type: "integer",
            minimum: 1,
            maximum: 20,
            default: 5,
            description: "Maximum number of concurrent API requests",
          },
        },
        required: ["audio_path"],
      },
    },
    {
      name: "get_audio_info",
      description: `Get information about an audio file (duration, format).

Use this to check audio length before transcription.`,
      inputSchema: {
        type: "object",
        properties: {
          audio_path: {
            type: "string",
            description: "Absolute path to the audio file",
          },
        },
        required: ["audio_path"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "transcribe_audio") {
    const audioPath = args?.audio_path as string;
    const contextMode = (args?.context_mode as ContextMode) || "sliding";
    const maxConcurrency = (args?.max_concurrency as number) || 5;

    if (!existsSync(audioPath)) {
      return {
        content: [{ type: "text", text: `Error: ${formatError(new AudioFileError(audioPath))}` }],
      };
    }

    try {
      const t = getTranscriber();
      const result = await t.transcribe(audioPath, contextMode, maxConcurrency);
      return {
        content: [{ type: "text", text: formatResult(result) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${formatError(error)}` }],
      };
    }
  }

  if (name === "get_audio_info") {
    const audioPath = args?.audio_path as string;

    if (!existsSync(audioPath)) {
      return {
        content: [{ type: "text", text: `Error: ${formatError(new AudioFileError(audioPath))}` }],
      };
    }

    try {
      const info = await getAudioInfo(audioPath);
      const estimatedChunks = Math.max(1, Math.ceil(info.duration / 25));
      const text = `## Audio Info

**File:** ${audioPath.split("/").pop()}
**Format:** ${info.format}
**Duration:** ${info.duration.toFixed(1)}s (${(info.duration / 60).toFixed(1)} minutes)
**Sample Rate:** ${info.sampleRate} Hz
**Channels:** ${info.channels}
**Estimated chunks:** ${estimatedChunks} (at 25s per chunk)`;

      return {
        content: [{ type: "text", text }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error reading audio: ${formatError(error)}` }],
      };
    }
  }

  return {
    content: [{ type: "text", text: `Unknown tool: ${name}` }],
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("AutoGLM ASR MCP server running on stdio");
}

main().catch(console.error);
