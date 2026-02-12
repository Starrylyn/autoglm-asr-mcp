# AutoGLM ASR MCP - AI Agent 配置指南

本文档供 AI Agent（Claude Code、Cursor、Windsurf、OpenCode 等）快速配置 AutoGLM ASR 语音转文字 MCP 服务。

## 这是什么

一个 MCP Server，提供两个工具：
- `transcribe_audio` - 将音频文件转录为文字（支持 mp3/wav/m4a/flac/ogg/webm），返回文字和带时间戳的 segments
- `get_audio_info` - 获取音频文件的时长、格式等信息

底层调用智谱 AI 的 `/audio/transcriptions` 接口（类似 OpenAI Whisper 风格），模型为 `glm-asr`。

## 前置条件

系统必须安装 **ffmpeg**：
```bash
# macOS
brew install ffmpeg
# Ubuntu/Debian
apt install ffmpeg
```

## 配置方法

### 方式一：npx 运行（推荐，无需安装）

在你的 MCP 配置文件中添加以下内容。不同客户端的配置文件位置不同，但格式基本相同。

**Claude Desktop** (`claude_desktop_config.json`)：
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

**Cursor** (`.cursor/mcp.json`)：
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

**OpenCode** (`opencode.jsonc`)：
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

### 方式二：Python pip 安装

```bash
pip install autoglm-asr-mcp
```

MCP 配置：
```json
{
  "mcpServers": {
    "autoglm-asr": {
      "command": "autoglm-asr-mcp",
      "env": {
        "AUTOGLM_ASR_API_KEY": "<your-api-key>"
      }
    }
  }
}
```

## 工具使用说明

### transcribe_audio

| 参数 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `audio_path` | 是 | - | 音频文件的绝对路径 |
| `context_mode` | 否 | `sliding` | `sliding` / `none`（最快）/ `full_serial`（保留兼容，新接口下效果等同） |
| `max_concurrency` | 否 | `5` | 最大并发请求数 |

返回示例：
```
text: "你好世界"
segments: [{ start: 0.5, end: 1.2, text: "你好世界" }]
```

### get_audio_info

| 参数 | 必填 | 说明 |
|------|------|------|
| `audio_path` | 是 | 音频文件的绝对路径 |

## 可选环境变量

一般不需要修改，使用默认值即可：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `AUTOGLM_ASR_API_KEY` | （必填） | 智谱 AI API Key |
| `AUTOGLM_ASR_API_BASE` | `https://open.bigmodel.cn/api/paas/v4/audio/transcriptions` | API 地址 |
| `AUTOGLM_ASR_MODEL` | `glm-asr` | 模型名称 |
| `AUTOGLM_ASR_MAX_CHUNK_DURATION` | `25` | 单个音频块最大秒数 |
| `AUTOGLM_ASR_MAX_CONCURRENCY` | `5` | 最大并发请求数 |
| `AUTOGLM_ASR_CONTEXT_MAX_CHARS` | `2000` | 上下文最大字符数 |

## 注意事项

1. `audio_path` 必须是**绝对路径**，不支持相对路径
2. 单次 API 请求限制 30 秒音频，超长音频会自动分块处理
3. 支持的格式：mp3、wav、m4a、flac、ogg、webm
4. 如果遇到超时，可以通过 `AUTOGLM_ASR_REQUEST_TIMEOUT` 环境变量调整（默认 60 秒）
5. API Key 从 [智谱AI开放平台](https://open.bigmodel.cn/) 获取
