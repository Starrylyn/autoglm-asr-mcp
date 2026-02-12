# AutoGLM ASR MCP Server

MCP server for audio transcription using Zhipu AI's ASR API. Designed for coding agents (Claude Code, Cursor, Windsurf, etc).

## Features

- **Fast**: Sliding window concurrency - first chunk establishes context, rest run in parallel
- **Accurate**: Context passing between chunks for better transcription quality  
- **Long audio support**: Automatic intelligent chunking at silence points (API limit: 30s/request)
- **Multiple formats**: mp3, wav, m4a, flac, ogg, webm
- **Zero config**: Works out of the box, only requires API key

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

Get your API key from [Zhipu AI Open Platform](https://open.bigmodel.cn/).

## Installation

### NPX (Recommended)

No installation required. Use directly with npx:

```bash
npx autoglm-asr-mcp
```

## Configuration

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

### Cursor / Windsurf

Add to your MCP configuration:

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

### VS Code

For quick installation, click the button below:

[![Install with NPX in VS Code](https://img.shields.io/badge/VS_Code-NPM-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=autoglm-asr&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22autoglm-asr-mcp%22%5D%2C%22env%22%3A%7B%22AUTOGLM_ASR_API_KEY%22%3A%22your-api-key%22%7D%7D)

For manual installation, add to your `.vscode/mcp.json`:

```json
{
  "servers": {
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

## Tools

### `transcribe_audio`

Transcribe an audio file to text.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `audio_path` | string | Yes | Absolute path to the audio file |
| `context_mode` | string | No | `"sliding"` (default), `"none"` (fastest), `"full_serial"` (best quality) |
| `max_concurrency` | number | No | Max parallel requests (default: 5) |

### `get_audio_info`

Get audio file information (duration, format, estimated chunks).

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `audio_path` | string | Yes | Absolute path to the audio file |

## Context Modes

| Mode | Speed | Quality | Description |
|------|-------|---------|-------------|
| `sliding` | Fast | High | First chunk alone, then parallel with context (recommended) |
| `none` | Fastest | Medium | All chunks in parallel, no context |
| `full_serial` | Slow | Best | Sequential, full context chain |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTOGLM_ASR_API_KEY` | (required) | Your Zhipu AI API key |
| `AUTOGLM_ASR_API_BASE` | `https://open.bigmodel.cn/api/paas/v4/audio/transcriptions` | API endpoint |
| `AUTOGLM_ASR_MODEL` | `glm-asr-2512` | Model name |
| `AUTOGLM_ASR_MAX_CHUNK_DURATION` | `25` | Max seconds per chunk |
| `AUTOGLM_ASR_MAX_CONCURRENCY` | `5` | Max parallel API requests |
| `AUTOGLM_ASR_CONTEXT_MAX_CHARS` | `2000` | Max context characters |

## Supported Audio Formats

- mp3
- wav
- m4a
- flac
- ogg
- webm

## License

MIT
