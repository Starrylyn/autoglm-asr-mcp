"""Core ASR transcription logic with sliding window concurrency."""

import asyncio
import base64
import re
import time
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any

import httpx

from .audio_utils import AudioChunk, get_audio_format, load_audio, split_audio_on_silence
from .config import ASRConfig, get_config

HALLUCINATION_PATTERNS = [
    re.compile(r"^The sound of .+", re.IGNORECASE),
    re.compile(r"^There (is|are) no .+ sounds?", re.IGNORECASE),
    re.compile(r"^No (speech|audio|sound|voice)", re.IGNORECASE),
    re.compile(r"^This (audio|clip|segment) (contains?|is) (silence|silent|no)", re.IGNORECASE),
    re.compile(r"^\[?(silence|no speech|inaudible)\]?$", re.IGNORECASE),
    re.compile(r"^(音频|这段音频|该音频).*(静音|无声|没有声音|无内容)", re.IGNORECASE),
]


def is_hallucination(text: str) -> bool:
    """Detect if transcription is likely a hallucination (model describing silence)."""
    text = text.strip()
    if not text:
        return False
    for pattern in HALLUCINATION_PATTERNS:
        if pattern.search(text):
            return True
    return False


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
        context: str = "",
        audio_format: str = "wav",
    ) -> str:
        encoded_base64 = base64.b64encode(chunk.data).decode("utf-8")
        data_url = f"data:audio/{audio_format};base64,{encoded_base64}"
        
        messages: list[dict[str, Any]] = [
            {
                "role": "system",
                "content": "你是一个名为 ChatGLM 的人工智能助手。你是基于智谱AI训练的语言模型 GLM-4 模型开发的，你的任务是针对用户的问题和要求提供适当的答复和支持。\n\n",
            },
        ]
        
        if context:
            messages.append({
                "role": "user",
                "content": [{"type": "text", "text": context}],
            })
        
        messages.extend([
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "<|begin_of_audio|><|endoftext|><|end_of_audio|>"},
                    {"type": "audio_url", "audio_url": {"url": data_url}},
                ],
            },
            {
                "role": "user",
                "content": [{"type": "text", "text": "将这段音频转录成文字."}],
            },
        ])
        
        payload = {
            "model": self.config.model,
            "messages": messages,
            "max_tokens": 1024,
            "temperature": 1,
            "repetition_penalty": 1.1,
            "stream": False,
            "top_k": 1,
            "top_p": 0.9,
        }
        
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.config.api_key}",
        }
        
        client = await self._get_client()
        
        for attempt in range(self.config.max_retries + 1):
            try:
                response = await client.post(
                    self.config.api_base,
                    headers=headers,
                    json=payload,
                )
                response.raise_for_status()
                result = response.json()
                
                if isinstance(result, dict) and result.get("choices"):
                    return result["choices"][0]["message"].get("content", "") or ""
                if isinstance(result, dict) and result.get("content"):
                    return result.get("content", "")
                return ""
                
            except httpx.HTTPStatusError as e:
                if attempt == self.config.max_retries:
                    raise RuntimeError(f"ASR API error after {self.config.max_retries + 1} attempts: {e}")
                await asyncio.sleep(1 * (attempt + 1))
            except httpx.TimeoutException:
                if attempt == self.config.max_retries:
                    raise RuntimeError(f"ASR API timeout after {self.config.max_retries + 1} attempts")
                await asyncio.sleep(1 * (attempt + 1))
        
        return ""
    
    def _truncate_context(self, text: str) -> str:
        if len(text) <= self.config.context_max_chars:
            return text
        return text[-self.config.context_max_chars :]
    
    async def transcribe(
        self,
        audio_path: str | Path,
        context_mode: ContextMode = ContextMode.SLIDING,
        max_concurrency: int | None = None,
    ) -> TranscriptionResult:
        """Transcribe audio file using sliding window concurrency with context.
        
        Sliding window strategy:
        1. First chunk runs alone to establish context
        2. Remaining chunks run concurrently, all carrying the first chunk's result as context
        3. Results merged in order
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
        results: dict[int, str] = {}
        skipped_silent = 0
        
        async def transcribe_with_semaphore(chunk: AudioChunk, ctx: str) -> None:
            async with semaphore:
                if chunk.is_silent:
                    results[chunk.index] = ""
                    return
                text = await self._transcribe_chunk(chunk, context=ctx, audio_format=audio_format)
                if is_hallucination(text):
                    text = ""
                results[chunk.index] = text
        
        non_silent_chunks = [c for c in chunks if not c.is_silent]
        skipped_silent = len(chunks) - len(non_silent_chunks)
        
        for chunk in chunks:
            if chunk.is_silent:
                results[chunk.index] = ""
        
        if context_mode == ContextMode.NONE:
            tasks = [transcribe_with_semaphore(chunk, "") for chunk in non_silent_chunks]
            await asyncio.gather(*tasks)
        
        elif context_mode == ContextMode.FULL_SERIAL:
            context = ""
            for chunk in chunks:
                if chunk.is_silent:
                    continue
                text = await self._transcribe_chunk(chunk, context=context, audio_format=audio_format)
                if is_hallucination(text):
                    text = ""
                results[chunk.index] = text
                if text:
                    context = self._truncate_context(context + text)
        
        elif context_mode == ContextMode.SLIDING:
            first_non_silent = next((c for c in chunks if not c.is_silent), None)
            if first_non_silent:
                first_text = await self._transcribe_chunk(first_non_silent, context="", audio_format=audio_format)
                if is_hallucination(first_text):
                    first_text = ""
                results[first_non_silent.index] = first_text
                
                remaining = [c for c in non_silent_chunks if c.index != first_non_silent.index]
                if remaining:
                    context = self._truncate_context(first_text) if first_text else ""
                    tasks = [transcribe_with_semaphore(chunk, context) for chunk in remaining]
                    await asyncio.gather(*tasks)
        
        segments = []
        for chunk in chunks:
            text = results.get(chunk.index, "")
            segments.append(TranscriptionSegment(
                start=chunk.start_ms / 1000.0,
                end=chunk.end_ms / 1000.0,
                text=text,
            ))
        
        full_text = "".join(seg.text for seg in segments)
        elapsed = time.time() - start_time
        
        return TranscriptionResult(
            text=full_text,
            segments=segments,
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
