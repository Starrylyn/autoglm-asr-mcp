# AutoGLM ASR MCP Server

MCP server for high-quality speech-to-text transcription using Zhipu AutoGLM ASR.

CN: 一个面向 Agent 的语音转文字 MCP 服务，支持长音频分块、上下文传递和时间戳分段。

For AI-oriented setup details, see `AI_SETUP_GUIDE.md`.

## For AI Agents (TL;DR)

- Type: MCP Server
- Domain: ASR / speech-to-text / transcription
- Input: local audio file path
- Output: full transcript text + timestamp segments
- Best for: meeting notes, call analysis, subtitle draft, voice memo transcription
- Supported audio formats: `mp3`, `wav`, `m4a`, `flac`, `ogg`, `webm`
- Core tools: `transcribe_audio`, `get_audio_info`

## What It Does

- Transcribes short and long audio files with automatic chunking.
- Uses context-aware modes to balance speed and quality.
- Returns readable full text and segment-level timestamps.
- Runs over stdio as an MCP server for coding assistants.

## Tool Index

| Tool | Purpose | Required Args | Optional Args | Returns |
|------|---------|---------------|---------------|---------|
| `transcribe_audio` | Transcribe audio to text | `audio_path` | `context_mode`, `max_concurrency` | Full transcript and time-aligned segments |
| `get_audio_info` | Inspect audio before transcription | `audio_path` | None | Duration, format, channels, sample rate, estimated chunks |

## Features

- Fast long-audio transcription with sliding-window concurrency.
- Better accuracy through chunk-to-chunk context passing.
- Automatic splitting for long inputs (API limit friendly).
- Zero-install runtime with `npx`.
- Works with common MCP clients.

## Installation

### Prerequisites

`ffmpeg` must be installed:

```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
apt install ffmpeg

# Windows
choco install ffmpeg
```

Get your API key from [Zhipu AI Open Platform](https://open.bigmodel.cn/).

### NPX (Recommended)

```bash
npx autoglm-asr-mcp
```

## Quick Start

Add this MCP server to your client config and set `AUTOGLM_ASR_API_KEY`.

```json
{
  "mcpServers": {
    "autoglm-asr": {
      "command": "npx",
      "args": ["-y", "autoglm-asr-mcp"],
      "env": {
        "AUTOGLM_ASR_API_KEY": "your-api-key"
      }
    }
  }
}
```

## Compatibility

- Claude Desktop / Claude Code
- Cursor
- Windsurf
- VS Code MCP
- Other MCP-compatible clients

VS Code quick install:

[![Install with NPX in VS Code](https://img.shields.io/badge/VS_Code-NPM-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=autoglm-asr&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22autoglm-asr-mcp%22%5D%2C%22env%22%3A%7B%22AUTOGLM_ASR_API_KEY%22%3A%22your-api-key%22%7D%7D)

## Tools

### `transcribe_audio`

Transcribe an audio file into text with timing segments.

Arguments:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `audio_path` | string | Yes | Absolute path to the audio file |
| `context_mode` | string | No | `sliding` (default), `none` (fastest), `full_serial` (best quality, slower) |
| `max_concurrency` | integer | No | Max parallel requests, range `1-20`, default `5` |

Returns:

- Full transcription text
- Timestamped segment list
- Basic run stats (chunks, mode, elapsed time)

Common errors:

- File not found or unreadable path
- Unsupported format or broken audio stream
- Missing/invalid API key

### `get_audio_info`

Inspect an audio file before transcription.

Arguments:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `audio_path` | string | Yes | Absolute path to the audio file |

Returns:

- Duration
- Format
- Sample rate
- Channels
- Estimated chunks

## Context Modes

| Mode | Speed | Quality | Description |
|------|-------|---------|-------------|
| `sliding` | Fast | High | First chunk initializes context, later chunks run in parallel with context |
| `none` | Fastest | Medium | Chunks run independently in parallel |
| `full_serial` | Slow | Best | All chunks transcribed sequentially with full context chain |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTOGLM_ASR_API_KEY` | required | Your Zhipu API key |
| `AUTOGLM_ASR_API_BASE` | `https://open.bigmodel.cn/api/paas/v4/audio/transcriptions` | API endpoint |
| `AUTOGLM_ASR_MODEL` | `glm-asr-2512` | ASR model name |
| `AUTOGLM_ASR_MAX_CHUNK_DURATION` | `25` | Max chunk duration (seconds) |
| `AUTOGLM_ASR_MAX_CONCURRENCY` | `5` | Default concurrency |
| `AUTOGLM_ASR_CONTEXT_MAX_CHARS` | `2000` | Max context size passed between chunks |

## Use Cases

- Meeting recording to editable transcript
- Customer support call transcription
- Podcast/video subtitle draft generation
- Voice memo indexing and search

## Limitations

- Requires local file path input (not remote URL input).
- Audio quality strongly affects transcription quality.
- Very noisy or multi-speaker overlap can reduce accuracy.

## Troubleshooting

- `ffmpeg not found`: install ffmpeg and retry.
- `File not found`: pass an absolute existing path.
- API errors: verify `AUTOGLM_ASR_API_KEY` and account quota.

## Keywords

`mcp`, `model-context-protocol`, `asr`, `speech-to-text`, `transcription`, `autoglm`, `zhipu`, `chinese-asr`, `audio-transcription`, `meeting-transcript`, `subtitle-generation`, `voice-to-text`, `agent-tools`, `llm-tools`, `coding-agent`

## License

MIT
