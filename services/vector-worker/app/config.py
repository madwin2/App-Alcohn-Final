from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


WORKER_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(WORKER_ROOT / ".env")


@dataclass(frozen=True)
class Settings:
    port: int
    api_key: str
    supabase_url: str
    supabase_service_role_key: str
    vector_bucket: str
    poll_interval_seconds: int
    lock_stale_minutes: int
    max_attempts_default: int
    potrace_bin: str
    mkbitmap_bin: str
    upscayl_bin: str
    vector_engine: str
    upscale_enabled: bool
    upscale_required: bool
    upscale_factor: int
    upscale_model: str
    upscale_model_low_quality: str
    upscale_tile_size: int
    vector_target_long_side: int
    vector_ai_target_long_side: int
    vector_max_upscale: float
    vector_max_megapixels: float
    openai_api_key: str
    ai_enhance_enabled: bool
    ai_enhance_model: str


def load_settings() -> Settings:
    return Settings(
        port=int(os.getenv("PORT", "8790")),
        api_key=os.getenv("VECTOR_WORKER_API_KEY", "").strip(),
        supabase_url=os.getenv("SUPABASE_URL", "").strip(),
        supabase_service_role_key=os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip(),
        vector_bucket=os.getenv("VECTOR_BUCKET", "vector").strip() or "vector",
        poll_interval_seconds=int(os.getenv("VECTOR_POLL_INTERVAL_SECONDS", "12")),
        lock_stale_minutes=int(os.getenv("VECTOR_LOCK_STALE_MINUTES", "15")),
        max_attempts_default=int(os.getenv("VECTOR_MAX_ATTEMPTS_DEFAULT", "4")),
        potrace_bin=os.getenv("POTRACE_BIN", "potrace").strip() or "potrace",
        mkbitmap_bin=os.getenv("MKBITMAP_BIN", "mkbitmap").strip() or "mkbitmap",
        upscayl_bin=os.getenv("UPSCAYL_BIN", "/opt/upscayl-ncnn/upscayl-bin-20251207-174704-linux/upscayl-bin").strip(),
        vector_engine=os.getenv("VECTOR_ENGINE", "potrace").strip().lower() or "potrace",
        upscale_enabled=os.getenv("VECTOR_UPSCALE_ENABLED", "true").strip().lower() in {"1", "true", "yes"},
        upscale_required=os.getenv("VECTOR_UPSCALE_REQUIRED", "false").strip().lower() in {"1", "true", "yes"},
        upscale_factor=int(os.getenv("VECTOR_UPSCALE_FACTOR", "4")),
        upscale_model=os.getenv("VECTOR_UPSCALE_MODEL", "realesrgan-x4plus").strip() or "realesrgan-x4plus",
        upscale_model_low_quality=os.getenv("VECTOR_UPSCALE_MODEL_LOW_QUALITY", "realesrnet-x4plus").strip()
        or "realesrnet-x4plus",
        upscale_tile_size=int(os.getenv("VECTOR_UPSCALE_TILE_SIZE", "256")),
        vector_target_long_side=int(os.getenv("VECTOR_TARGET_LONG_SIDE", "2800")),
        vector_ai_target_long_side=int(os.getenv("VECTOR_AI_TARGET_LONG_SIDE", "3600")),
        vector_max_upscale=float(os.getenv("VECTOR_MAX_UPSCALE", "3")),
        vector_max_megapixels=float(os.getenv("VECTOR_MAX_MEGAPIXELS", "8")),
        openai_api_key=os.getenv("OPENAI_API_KEY", "").strip(),
        ai_enhance_enabled=os.getenv("VECTOR_AI_ENHANCE_ENABLED", "true").strip().lower() in {"1", "true", "yes"},
        ai_enhance_model=os.getenv("VECTOR_AI_ENHANCE_MODEL", "gpt-image-1").strip() or "gpt-image-1",
    )
