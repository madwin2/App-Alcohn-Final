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
    vtracer_bin: str


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
        vtracer_bin=os.getenv("VTRACER_BIN", "vtracer").strip() or "vtracer",
    )
