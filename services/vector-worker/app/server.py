from __future__ import annotations

import asyncio
import contextlib
from typing import Literal

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from .config import Settings, load_settings
from .supabase_client import VectorWorkerRepository
from .worker import VectorWorkerLoop


class EnqueueBody(BaseModel):
    selloId: str = Field(min_length=1, max_length=64)
    orderId: str = Field(min_length=1, max_length=64)
    baseUrl: str = Field(min_length=1, max_length=2000)
    reason: Literal["BASE_UPLOADED", "BASE_REPLACED"] = "BASE_UPLOADED"


def build_app() -> FastAPI:
    settings: Settings = load_settings()
    repo = VectorWorkerRepository(settings)
    loop = VectorWorkerLoop(settings, repo)
    app = FastAPI(title="vector-worker")

    @app.on_event("startup")
    async def on_startup() -> None:
        repo.release_orphan_locks_on_startup()
        app.state.worker_task = asyncio.create_task(loop.run_forever())
        print("[vector-worker] startup ok")

    @app.on_event("shutdown")
    async def on_shutdown() -> None:
        loop.stop()
        task = getattr(app.state, "worker_task", None)
        if task:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task

    @app.get("/health")
    async def health() -> dict:
        return {
            "ok": True,
            "service": "vector-worker",
            "pollSeconds": settings.poll_interval_seconds,
            **repo.health(),
        }

    @app.post("/enqueue")
    async def enqueue(body: EnqueueBody, authorization: str | None = Header(default=None)) -> dict:
        if not settings.api_key:
            raise HTTPException(status_code=503, detail="VECTOR_WORKER_API_KEY no configurada.")
        if not settings.supabase_url or not settings.supabase_service_role_key:
            raise HTTPException(
                status_code=503,
                detail="Worker sin credenciales Supabase (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).",
            )

        expected = f"Bearer {settings.api_key}"
        if authorization != expected:
            raise HTTPException(status_code=401, detail="No autorizado")

        try:
            repo.mark_sello_enqueued(body.selloId, base_url=body.baseUrl)
            job = repo.enqueue_job(
                sello_id=body.selloId,
                orden_id=body.orderId,
                base_url=body.baseUrl,
            )
        except Exception as exc:
            message = str(exc)
            if "Invalid API key" in message or "401" in message:
                raise HTTPException(
                    status_code=503,
                    detail="Supabase rechazó la service role key del worker. Actualizá SUPABASE_SERVICE_ROLE_KEY en Hetzner.",
                ) from exc
            raise HTTPException(status_code=503, detail=f"No se pudo encolar vectorización: {message}") from exc

        return {
            "status": "queued",
            "message": "Vectorización encolada.",
            "httpStatus": 202,
            "jobId": job.get("id"),
            "reason": body.reason,
        }

    return app

app = build_app()
