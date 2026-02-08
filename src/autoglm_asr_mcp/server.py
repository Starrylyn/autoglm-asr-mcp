"""MCP server for AutoGLM ASR transcription."""

import asyncio
from pathlib import Path

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import TextContent, Tool

from .audio_utils import get_audio_duration
from .transcriber import ASRTranscriber, ContextMode, TranscriptionResult

server = Server("autoglm-asr")
_transcriber: ASRTranscriber | None = None


def get_transcriber() -> ASRTranscriber:
    global _transcriber
    if _transcriber is None:
        _transcriber = ASRTranscriber()
    return _transcriber


def format_result(result: TranscriptionResult) -> str:
    stats = result.stats
    transcribed = stats.get('chunks_transcribed', stats['chunks'])
    skipped = stats.get('chunks_skipped_silent', 0)
    
    stats_line = f"**Duration:** {result.duration:.1f}s | **Chunks:** {transcribed}/{stats['chunks']}"
    if skipped > 0:
        stats_line += f" ({skipped} silent skipped)"
    stats_line += f" | **Time:** {stats['total_time']}s | **Mode:** {stats['mode']}"
    
    lines = [
        f"## Transcription Result",
        f"",
        stats_line,
        f"",
        f"### Full Text",
        f"",
        result.text,
    ]
    
    non_empty_segments = [seg for seg in result.segments if seg.text.strip()]
    if len(non_empty_segments) > 1:
        lines.extend([
            f"",
            f"### Segments",
            f"",
        ])
        for seg in non_empty_segments:
            lines.append(f"**[{seg.start:.1f}s - {seg.end:.1f}s]** {seg.text}")
    
    return "\n".join(lines)


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="transcribe_audio",
            description="""Transcribe an audio file to text using AutoGLM ASR.

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
    Full transcription text with timing segments""",
            inputSchema={
                "type": "object",
                "properties": {
                    "audio_path": {
                        "type": "string",
                        "description": "Absolute path to the audio file to transcribe",
                    },
                    "context_mode": {
                        "type": "string",
                        "enum": ["sliding", "none", "full_serial"],
                        "default": "sliding",
                        "description": "Context strategy: 'sliding' (balanced), 'none' (fastest), 'full_serial' (best quality)",
                    },
                    "max_concurrency": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 20,
                        "default": 5,
                        "description": "Maximum number of concurrent API requests",
                    },
                },
                "required": ["audio_path"],
            },
        ),
        Tool(
            name="get_audio_info",
            description="""Get information about an audio file (duration, format).

Use this to check audio length before transcription.""",
            inputSchema={
                "type": "object",
                "properties": {
                    "audio_path": {
                        "type": "string",
                        "description": "Absolute path to the audio file",
                    },
                },
                "required": ["audio_path"],
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    if name == "transcribe_audio":
        audio_path = arguments["audio_path"]
        context_mode_str = arguments.get("context_mode", "sliding")
        max_concurrency = arguments.get("max_concurrency", 5)
        
        path = Path(audio_path)
        if not path.exists():
            return [TextContent(type="text", text=f"Error: File not found: {audio_path}")]
        
        if not path.is_file():
            return [TextContent(type="text", text=f"Error: Not a file: {audio_path}")]
        
        try:
            context_mode = ContextMode(context_mode_str)
        except ValueError:
            return [TextContent(
                type="text",
                text=f"Error: Invalid context_mode '{context_mode_str}'. Use: sliding, none, or full_serial",
            )]
        
        try:
            transcriber = get_transcriber()
            result = await transcriber.transcribe(
                audio_path=path,
                context_mode=context_mode,
                max_concurrency=max_concurrency,
            )
            return [TextContent(type="text", text=format_result(result))]
        except ValueError as e:
            return [TextContent(type="text", text=f"Configuration error: {e}")]
        except FileNotFoundError as e:
            return [TextContent(type="text", text=f"File error: {e}")]
        except RuntimeError as e:
            return [TextContent(type="text", text=f"API error: {e}")]
        except Exception as e:
            return [TextContent(type="text", text=f"Unexpected error: {type(e).__name__}: {e}")]
    
    elif name == "get_audio_info":
        audio_path = arguments["audio_path"]
        path = Path(audio_path)
        
        if not path.exists():
            return [TextContent(type="text", text=f"Error: File not found: {audio_path}")]
        
        try:
            duration = get_audio_duration(path)
            suffix = path.suffix.lower()
            size_mb = path.stat().st_size / (1024 * 1024)
            
            info = f"""## Audio Info

**File:** {path.name}
**Format:** {suffix.lstrip('.')}
**Duration:** {duration:.1f}s ({duration / 60:.1f} minutes)
**Size:** {size_mb:.2f} MB
**Estimated chunks:** {max(1, int(duration / 25))} (at 25s per chunk)"""
            
            return [TextContent(type="text", text=info)]
        except Exception as e:
            return [TextContent(type="text", text=f"Error reading audio: {e}")]
    
    return [TextContent(type="text", text=f"Unknown tool: {name}")]


async def run_server() -> None:
    async with stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            server.create_initialization_options(),
        )


def main() -> None:
    asyncio.run(run_server())


if __name__ == "__main__":
    main()
