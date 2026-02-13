# AutoGLM ASR MCP - AI Agent Setup Guide

This guide helps AI agents and developers quickly configure and use `autoglm-asr-mcp`.

CN: 本文档用于让 Agent 和开发者快速完成 AutoGLM ASR MCP 的安装、配置和调用。

## For AI Agents (TL;DR)

- Type: MCP server over stdio
- Domain: ASR, speech-to-text, audio transcription
- Tools: `transcribe_audio`, `get_audio_info`
- Input requirement: absolute local audio path
- Output: transcript text with timestamp segments
- Best for: meeting notes, call analysis, subtitle drafting

## Capability Snapshot

| Field | Value |
|------|-------|
| Package | `autoglm-asr-mcp` |
| Runtime | Node.js >= 18 |
| API provider | Zhipu AutoGLM ASR |
| Supported formats | `mp3`, `wav`, `m4a`, `flac`, `ogg`, `webm` |
| Long audio | Yes, automatic chunking |
| Recommended mode | `sliding` |

## Prerequisites

Install `ffmpeg`:

```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
apt install ffmpeg

# Windows
choco install ffmpeg
```

Prepare API key from [Zhipu AI Open Platform](https://open.bigmodel.cn/).

## Quick Start

Run with `npx` (no global install):

```bash
npx autoglm-asr-mcp
```

Add to MCP config:

```json
{
  "mcpServers": {
    "autoglm-asr": {
      "command": "npx",
      "args": ["-y", "autoglm-asr-mcp"],
      "env": {
        "AUTOGLM_ASR_API_KEY": "<your-api-key>"
      }
    }
  }
}
```

## Client Config Examples

Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "autoglm-asr": {
      "command": "npx",
      "args": ["-y", "autoglm-asr-mcp"],
      "env": {
        "AUTOGLM_ASR_API_KEY": "<your-api-key>"
      }
    }
  }
}
```

Cursor (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "autoglm-asr": {
      "command": "npx",
      "args": ["-y", "autoglm-asr-mcp"],
      "env": {
        "AUTOGLM_ASR_API_KEY": "<your-api-key>"
      }
    }
  }
}
```

OpenCode (`opencode.jsonc`):

```jsonc
{
  "mcp": {
    "autoglm_asr": {
      "type": "local",
      "command": ["npx", "-y", "autoglm-asr-mcp"],
      "enabled": true,
      "environment": {
        "AUTOGLM_ASR_API_KEY": "<your-api-key>"
      },
      "timeout": 600000
    }
  }
}
```

## Tool Reference

### `transcribe_audio`

Transcribe an audio file into text with timestamp segments.

| Arg | Type | Required | Default | Description |
|-----|------|----------|---------|-------------|
| `audio_path` | string | Yes | - | Absolute path to audio file |
| `context_mode` | string | No | `sliding` | `sliding`, `none`, `full_serial` |
| `max_concurrency` | integer | No | `5` | Range `1-20` |

Returns:

- Full transcript text
- Segment list with `start`, `end`, and `text`
- Run stats (chunks, elapsed time, mode)

### `get_audio_info`

Get metadata for an audio file.

| Arg | Type | Required | Description |
|-----|------|----------|-------------|
| `audio_path` | string | Yes | Absolute path to audio file |

Returns:

- Duration
- Format
- Sample rate
- Channels
- Estimated chunk count

## Context Modes

| Mode | Speed | Quality | Notes |
|------|-------|---------|-------|
| `sliding` | Fast | High | Recommended for most tasks |
| `none` | Fastest | Medium | No cross-chunk context |
| `full_serial` | Slow | Best | Sequential full-context chain |

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AUTOGLM_ASR_API_KEY` | Yes | - | Zhipu API key |
| `AUTOGLM_ASR_API_BASE` | No | `https://open.bigmodel.cn/api/paas/v4/audio/transcriptions` | API endpoint |
| `AUTOGLM_ASR_MODEL` | No | `glm-asr-2512` | ASR model name |
| `AUTOGLM_ASR_MAX_CHUNK_DURATION` | No | `25` | Max seconds per chunk |
| `AUTOGLM_ASR_MAX_CONCURRENCY` | No | `5` | Default concurrency |
| `AUTOGLM_ASR_CONTEXT_MAX_CHARS` | No | `2000` | Max context chars |
| `AUTOGLM_ASR_REQUEST_TIMEOUT` | No | `60` | Request timeout (seconds) |
| `AUTOGLM_ASR_MAX_RETRIES` | No | `2` | Retry attempts |

## Constraints and Notes

- `audio_path` must be an absolute path.
- Inputs are local files, not remote URLs.
- Very noisy audio or overlapping speakers may reduce quality.
- API request limit per chunk is handled by automatic chunking.

## Troubleshooting

- `ffmpeg not found`: install `ffmpeg` and restart client.
- `AUTOGLM_ASR_API_KEY environment variable is required`: set API key in MCP config.
- `File not found`: verify absolute file path and permissions.
- Timeout/network error: increase `AUTOGLM_ASR_REQUEST_TIMEOUT` or retry with smaller concurrency.

## Keywords (for Search and Retrieval)

`mcp`, `model-context-protocol`, `asr`, `speech-to-text`, `transcription`, `autoglm`, `zhipu`, `audio-transcription`, `chinese-asr`, `meeting-transcript`, `subtitle-generation`, `voice-to-text`, `agent-tools`
