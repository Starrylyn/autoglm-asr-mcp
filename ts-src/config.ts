import { ConfigError } from "./errors.js";

export interface ASRConfig {
  apiBase: string;
  apiKey: string;
  model: string;
  maxChunkDuration: number;
  maxConcurrency: number;
  contextMaxChars: number;
  requestTimeout: number;
  maxRetries: number;
}

export function getConfig(): ASRConfig {
  const apiKey = process.env.AUTOGLM_ASR_API_KEY;
  if (!apiKey) {
    throw ConfigError.missingApiKey();
  }

  return {
    apiBase: process.env.AUTOGLM_ASR_API_BASE || "https://open.bigmodel.cn/api/paas/v4/audio/transcriptions",
    apiKey,
    model: process.env.AUTOGLM_ASR_MODEL || "glm-asr",
    maxChunkDuration: parseInt(process.env.AUTOGLM_ASR_MAX_CHUNK_DURATION || "25", 10),
    maxConcurrency: parseInt(process.env.AUTOGLM_ASR_MAX_CONCURRENCY || "5", 10),
    contextMaxChars: parseInt(process.env.AUTOGLM_ASR_CONTEXT_MAX_CHARS || "2000", 10),
    requestTimeout: parseInt(process.env.AUTOGLM_ASR_REQUEST_TIMEOUT || "60", 10),
    maxRetries: parseInt(process.env.AUTOGLM_ASR_MAX_RETRIES || "2", 10),
  };
}
