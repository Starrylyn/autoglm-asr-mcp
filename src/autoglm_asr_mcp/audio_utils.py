"""Audio processing utilities for chunking and format handling."""

from dataclasses import dataclass
from pathlib import Path

from pydub import AudioSegment
from pydub.silence import detect_silence

from .vad import is_chunk_silent_vad, is_vad_available


@dataclass
class AudioChunk:
    """Represents a chunk of audio with timing information."""
    
    data: bytes
    start_ms: int
    end_ms: int
    index: int
    is_silent: bool = False
    
    @property
    def duration_sec(self) -> float:
        return (self.end_ms - self.start_ms) / 1000.0


def is_chunk_silent(audio: AudioSegment, silence_thresh_db: int = -40) -> bool:
    """Check if audio chunk is silent using VAD (preferred) or dBFS fallback."""
    if len(audio) == 0:
        return True
    if is_vad_available():
        return is_chunk_silent_vad(audio, min_speech_ratio=0.05)
    return audio.dBFS < silence_thresh_db


def load_audio(path: str | Path) -> AudioSegment:
    """Load audio file and convert to standard format (16kHz mono)."""
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Audio file not found: {path}")
    
    audio = AudioSegment.from_file(str(path))
    audio = audio.set_frame_rate(16000).set_channels(1)
    return audio


def get_audio_format(path: str | Path) -> str:
    """Detect audio format from file extension."""
    suffix = Path(path).suffix.lower().lstrip(".")
    format_map = {
        "mp3": "mp3",
        "wav": "wav",
        "m4a": "m4a",
        "flac": "flac",
        "ogg": "ogg",
        "webm": "webm",
    }
    return format_map.get(suffix, "wav")


def split_audio_on_silence(
    audio: AudioSegment,
    max_chunk_duration_ms: int = 25000,
    min_silence_len: int = 500,
    silence_thresh: int = -40,
) -> list[AudioChunk]:
    """Split audio into chunks, preferring to split at silence points.
    
    Strategy:
    1. Detect all silence regions in the audio
    2. Use silence points as preferred split locations
    3. If no silence found within max_chunk_duration, force split at max duration
    """
    total_duration = len(audio)
    
    if total_duration <= max_chunk_duration_ms:
        silent = is_chunk_silent(audio, silence_thresh)
        return [AudioChunk(
            data=audio.export(format="wav").read(),
            start_ms=0,
            end_ms=total_duration,
            index=0,
            is_silent=silent,
        )]
    
    silence_ranges = detect_silence(
        audio,
        min_silence_len=min_silence_len,
        silence_thresh=silence_thresh,
    )
    
    silence_midpoints = [(start + end) // 2 for start, end in silence_ranges]
    
    chunks: list[AudioChunk] = []
    current_start = 0
    chunk_index = 0
    
    while current_start < total_duration:
        ideal_end = current_start + max_chunk_duration_ms
        
        if ideal_end >= total_duration:
            chunk_audio = audio[current_start:total_duration]
            silent = is_chunk_silent(chunk_audio, silence_thresh)
            chunks.append(AudioChunk(
                data=chunk_audio.export(format="wav").read(),
                start_ms=current_start,
                end_ms=total_duration,
                index=chunk_index,
                is_silent=silent,
            ))
            break
        
        best_split = None
        for midpoint in silence_midpoints:
            if current_start < midpoint <= ideal_end:
                best_split = midpoint
        
        if best_split is None:
            best_split = ideal_end
        
        chunk_audio = audio[current_start:best_split]
        silent = is_chunk_silent(chunk_audio, silence_thresh)
        chunks.append(AudioChunk(
            data=chunk_audio.export(format="wav").read(),
            start_ms=current_start,
            end_ms=best_split,
            index=chunk_index,
            is_silent=silent,
        ))
        
        current_start = best_split
        chunk_index += 1
    
    return chunks


def get_audio_duration(path: str | Path) -> float:
    """Get audio duration in seconds."""
    audio = load_audio(path)
    return len(audio) / 1000.0
