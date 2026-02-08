"""Voice Activity Detection with webrtcvad (lightweight) or fallback to dBFS."""

import numpy as np
from pydub import AudioSegment

_webrtcvad_available = None


def _check_webrtcvad_available() -> bool:
    global _webrtcvad_available
    if _webrtcvad_available is not None:
        return _webrtcvad_available
    try:
        import webrtcvad
        _webrtcvad_available = True
    except ImportError:
        _webrtcvad_available = False
    return _webrtcvad_available


def get_speech_ratio_webrtcvad(
    audio: AudioSegment, 
    sample_rate: int = 16000,
    aggressiveness: int = 2,
    frame_duration_ms: int = 30,
) -> float:
    """Get ratio of audio containing speech using WebRTC VAD.
    
    Args:
        audio: Audio segment to analyze
        sample_rate: Must be 8000, 16000, 32000, or 48000
        aggressiveness: 0-3, higher = more aggressive filtering of non-speech
        frame_duration_ms: 10, 20, or 30 ms
    
    Returns:
        Value between 0.0 (all silence) and 1.0 (all speech)
    """
    if not _check_webrtcvad_available():
        return _get_speech_ratio_dbfs(audio)
    
    try:
        import webrtcvad
        
        audio = audio.set_frame_rate(sample_rate).set_channels(1).set_sample_width(2)
        raw_data = audio.raw_data
        
        vad = webrtcvad.Vad(aggressiveness)
        
        frame_size = int(sample_rate * frame_duration_ms / 1000) * 2
        num_frames = len(raw_data) // frame_size
        
        if num_frames == 0:
            return _get_speech_ratio_dbfs(audio)
        
        speech_frames = 0
        for i in range(num_frames):
            frame = raw_data[i * frame_size:(i + 1) * frame_size]
            if vad.is_speech(frame, sample_rate):
                speech_frames += 1
        
        return speech_frames / num_frames
        
    except Exception:
        return _get_speech_ratio_dbfs(audio)


def _get_speech_ratio_dbfs(audio: AudioSegment, silence_thresh_db: int = -40) -> float:
    """Fallback: estimate speech ratio using dBFS."""
    if len(audio) == 0:
        return 0.0
    if audio.dBFS < silence_thresh_db:
        return 0.0
    return 1.0


def is_chunk_silent_vad(
    audio: AudioSegment, 
    min_speech_ratio: float = 0.05,
    sample_rate: int = 16000,
) -> bool:
    """Check if chunk is silent using VAD.
    
    Args:
        audio: Audio segment to check
        min_speech_ratio: Minimum ratio of speech required (0.05 = 5%)
        sample_rate: Sample rate for VAD processing
    
    Returns:
        True if chunk has less than min_speech_ratio speech content
    """
    ratio = get_speech_ratio_webrtcvad(audio, sample_rate)
    return ratio < min_speech_ratio


def is_vad_available() -> bool:
    """Check if WebRTC VAD is available."""
    return _check_webrtcvad_available()
