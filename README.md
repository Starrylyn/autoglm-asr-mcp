# AutoGLM ASR MCP Server

MCP server for audio transcription using Zhipu AI's AutoGLM ASR API. Designed for coding agents (Claude Code, Cursor, Windsurf, etc).

This repository includes two implementations:

- **TypeScript (Node.js)**: published to npm as `autoglm-asr-mcp` (recommended if you want to run via `npx`)
- **Python**: published to PyPI as `autoglm-asr-mcp`

## Features

- **Fast**: Sliding window concurrency - first chunk establishes context, rest run in parallel
- **Accurate**: Context passing between chunks for better transcription quality  
- **Long audio support**: Automatic intelligent chunking at silence points (API limit: 30s/request)
- **Multiple formats**: mp3, wav, m4a, flac, ogg, webm
- **Zero dependencies**: Only requires ffmpeg installed on system

## Prerequisites

**ffmpeg** must be installed:

```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
apt install ffmpeg

# Windows
choco install ffmpeg
```

## Installation & Usage

### TypeScript (Node.js)

### Claude Desktop / Claude Code

Add to your `claude_desktop_config.json`:

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

### Cursor / Windsurf / Other MCP Clients

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

Get your API key from [Zhipu AI Open Platform](https://open.bigmodel.cn/).

### Python

Install:

```bash
pip install autoglm-asr-mcp
```

Run:

```bash
export AUTOGLM_ASR_API_KEY="your-api-key"
autoglm-asr-mcp
```

Example MCP client config (if your client supports running a local command):

```json
{
  "mcpServers": {
    "autoglm-asr": {
      "command": "autoglm-asr-mcp",
      "env": {
        "AUTOGLM_ASR_API_KEY": "your-api-key"
      }
    }
  }
}
```

## Tools

### `transcribe_audio`

Transcribe an audio file to text.

**Parameters:**
- `audio_path` (required): Absolute path to the audio file
- `context_mode` (optional): `"sliding"` (default), `"none"` (fastest), `"full_serial"` (best quality)
- `max_concurrency` (optional): Max parallel requests (default: 5)

### `get_audio_info`

Get audio file information (duration, format, estimated chunks).

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTOGLM_ASR_API_KEY` | (required) | Your Zhipu AI API key |
| `AUTOGLM_ASR_API_BASE` | `https://open.bigmodel.cn/api/paas/v4/audio/transcriptions` | API endpoint |
| `AUTOGLM_ASR_MODEL` | `glm-asr` | Model name |
| `AUTOGLM_ASR_MAX_CHUNK_DURATION` | `25` | Max seconds per chunk |
| `AUTOGLM_ASR_MAX_CONCURRENCY` | `5` | Max parallel API requests |
| `AUTOGLM_ASR_CONTEXT_MAX_CHARS` | `2000` | Max context characters |

## Context Modes

| Mode | Speed | Quality | Description |
|------|-------|---------|-------------|
| `sliding` | ⚡⚡ | ⭐⭐⭐ | First chunk alone, then parallel with context (recommended) |
| `none` | ⚡⚡⚡ | ⭐⭐ | All chunks in parallel, no context |
| `full_serial` | ⚡ | ⭐⭐⭐⭐ | Sequential, full context chain |

## License

MIT
