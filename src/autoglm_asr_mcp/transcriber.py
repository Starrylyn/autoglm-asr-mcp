"""Core ASR transcription logic using Zhipu AI audio transcription API."""

import asyncio
import time
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any

import httpx

from .audio_utils import AudioChunk, get_audio_format, load_audio, split_audio_on_silence
from .config import ASRConfig, get_config


class ContextMode(str, Enum):
    NONE = "none"
    SLIDING = "sliding"
    FULL_SERIAL = "full_serial"


@dataclass
class TranscriptionSegment:
    start: float
    end: float
    text: str


@dataclass
class TranscriptionResult:
    text: str
    segments: list[TranscriptionSegment]
    duration: float
    stats: dict = field(default_factory=dict)


class ASRTranscriber:
    def __init__(self, config: ASRConfig | None = None):
        self.config = config or get_config()
        self.config.validate()
        self._client: httpx.AsyncClient | None = None
    
    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=self.config.request_timeout)
        return self._client
    
    async def close(self) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None
    
    async def _transcribe_chunk(
        self,
        chunk: AudioChunk,
        audio_format: str = "wav",
    ) -> dict[str, Any]:
        """Transcribe a single audio chunk via /audio/transcriptions endpoint.
        
        Sends multipart/form-data with the audio file.
        Returns dict with 'text' and 'segments' keys.
        """
        mime_type = f"audio/{audio_format}"
        filename = f"audio.{audio_format}"
        
        headers = {
            "Authorization": f"Bearer {self.config.api_key}",
        }
        
        client = await self._get_client()
        
        for attempt in range(self.config.max_retries + 1):
            try:
                files = {"file": (filename, chunk.data, mime_type)}
                data = {"model": self.config.model}
                
                response = await client.post(
                    self.config.api_base,
                    headers=headers,
                    files=files,
                    data=data,
                )
                response.raise_for_status()
                result = response.json()
                
                # New /audio/transcriptions format: { text, segments }
                if isinstance(result, dict) and "text" in result:
                    segments = []
                    for seg in result.get("segments", []):
                        segments.append(TranscriptionSegment(
                            start=seg.get("start", 0),
                            end=seg.get("end", 0),
                            text=seg.get("text", ""),
                        ))
                    return {"text": result["text"], "segments": segments}
                
                # Fallback: chat completions format
                if isinstance(result, dict) and result.get("choices"):
                    text = result["choices"][0]["message"].get("content", "") or ""
                    return {"text": text, "segments": []}
                if isinstance(result, dict) and result.get("content"):
                    return {"text": result.get("content", ""), "segments": []}
                
                return {"text": "", "segments": []}
                
            except httpx.HTTPStatusError as e:
                if attempt == self.config.max_retries:
                    raise RuntimeError(f"ASR API error after {self.config.max_retries + 1} attempts: {e}")
                await asyncio.sleep(1 * (attempt + 1))
            except httpx.TimeoutException:
                if attempt == self.config.max_retries:
                    raise RuntimeError(f"ASR API timeout after {self.config.max_retries + 1} attempts")
                await asyncio.sleep(1 * (attempt + 1))
        
        return {"text": "", "segments": []}
    
    async def transcribe(
        self,
        audio_path: str | Path,
        context_mode: ContextMode = ContextMode.SLIDING,
        max_concurrency: int | None = None,
    ) -> TranscriptionResult:
        """Transcribe audio file with automatic chunking and parallel requests.
        
        The new /audio/transcriptions API doesn't require context passing,
        so all chunks are transcribed in parallel regardless of context_mode.
        The context_mode parameter is kept for backward compatibility.
        """
        start_time = time.time()
        audio_path = Path(audio_path)
        audio_format = get_audio_format(audio_path)
        
        audio = load_audio(audio_path)
        total_duration = len(audio) / 1000.0
        
        chunks = split_audio_on_silence(
            audio,
            max_chunk_duration_ms=self.config.max_chunk_duration * 1000,
        )
        
        if not chunks:
            return TranscriptionResult(
                text="",
                segments=[],
                duration=total_duration,
                stats={"chunks": 0, "total_time": 0, "mode": context_mode.value},
            )
        
        concurrency = max_concurrency or self.config.max_concurrency
        semaphore = asyncio.Semaphore(concurrency)
        text_results: dict[int, str] = {}
        segment_results: dict[int, list[TranscriptionSegment]] = {}
        skipped_silent = 0
        
        non_silent_chunks = [c for c in chunks if not c.is_silent]
        skipped_silent = len(chunks) - len(non_silent_chunks)
        
        for chunk in chunks:
            if chunk.is_silent:
                text_results[chunk.index] = ""
                segment_results[chunk.index] = []
        
        async def transcribe_with_semaphore(chunk: AudioChunk) -> None:
            async with semaphore:
                result = await self._transcribe_chunk(chunk, audio_format=audio_format)
                text_results[chunk.index] = result["text"]
                # Offset API segments by the chunk's start time
                offset_segments = []
                for seg in result["segments"]:
                    offset_segments.append(TranscriptionSegment(
                        start=seg.start + chunk.start_ms / 1000.0,
                        end=seg.end + chunk.start_ms / 1000.0,
                        text=seg.text,
                    ))
                segment_results[chunk.index] = offset_segments
        
        # All chunks run in parallel (new API doesn't need context passing)
        tasks = [transcribe_with_semaphore(chunk) for chunk in non_silent_chunks]
        await asyncio.gather(*tasks)
        
        # Merge segments in chunk order
        all_segments: list[TranscriptionSegment] = []
        for chunk in chunks:
            segs = segment_results.get(chunk.index, [])
            if segs:
                all_segments.extend(segs)
            else:
                # Fallback: create a segment from the text result
                text = text_results.get(chunk.index, "")
                if text:
                    all_segments.append(TranscriptionSegment(
                        start=chunk.start_ms / 1000.0,
                        end=chunk.end_ms / 1000.0,
                        text=text,
                    ))
        
        full_text = "".join(text_results.get(chunk.index, "") for chunk in chunks)
        elapsed = time.time() - start_time
        
        return TranscriptionResult(
            text=full_text,
            segments=all_segments,
            duration=total_duration,
            stats={
                "chunks": len(chunks),
                "chunks_transcribed": len(chunks) - skipped_silent,
                "chunks_skipped_silent": skipped_silent,
                "total_time": round(elapsed, 2),
                "mode": context_mode.value,
                "concurrency": concurrency,
            },
        )
