/**
 * Base error class for ASR-related errors
 */
export class ASRError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ASRError";
  }
}

/**
 * Error thrown when the audio file is not found or cannot be read
 */
export class AudioFileError extends ASRError {
  constructor(filePath: string, cause?: unknown) {
    super(`Audio file not found or cannot be read: ${filePath}`, "AUDIO_FILE_ERROR", cause);
    this.name = "AudioFileError";
  }
}

/**
 * Error thrown when ffmpeg/ffprobe operations fail
 */
export class FFmpegError extends ASRError {
  constructor(operation: string, details: string, cause?: unknown) {
    super(`FFmpeg ${operation} failed: ${details}`, "FFMPEG_ERROR", cause);
    this.name = "FFmpegError";
  }
}

/**
 * Error thrown when the ASR API request fails
 */
export class APIError extends ASRError {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly retryable: boolean = false,
    cause?: unknown,
  ) {
    super(message, "API_ERROR", cause);
    this.name = "APIError";
  }

  static fromResponse(status: number, statusText: string): APIError {
    const retryable = status >= 500 || status === 429;
    return new APIError(
      `API error: ${status} ${statusText}`,
      status,
      retryable,
    );
  }

  static timeout(timeoutSec: number): APIError {
    return new APIError(
      `API request timed out after ${timeoutSec}s`,
      undefined,
      true,
    );
  }

  static maxRetriesExceeded(attempts: number, lastError?: unknown): APIError {
    const suffix = lastError ? `: ${String(lastError)}` : "";
    return new APIError(
      `ASR API failed after ${attempts} attempts${suffix}`,
      undefined,
      false,
      lastError,
    );
  }
}

/**
 * Error thrown when configuration is invalid
 */
export class ConfigError extends ASRError {
  constructor(message: string) {
    super(message, "CONFIG_ERROR");
    this.name = "ConfigError";
  }

  static missingApiKey(): ConfigError {
    return new ConfigError(
      "AUTOGLM_ASR_API_KEY environment variable is required. " +
      "Get your API key from https://open.bigmodel.cn/",
    );
  }
}
