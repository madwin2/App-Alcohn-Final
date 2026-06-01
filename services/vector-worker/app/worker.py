from __future__ import annotations

import asyncio
import os
from typing import Any

from .config import Settings
from .supabase_client import VectorWorkerRepository
from .vectorize import VectorizationError, vectorize_logo


class VectorWorkerLoop:
    def __init__(self, settings: Settings, repo: VectorWorkerRepository) -> None:
        self.settings = settings
        self.repo = repo
        self.worker_id = f"{os.getenv('HOSTNAME', 'vector-worker')}-{os.getpid()}"
        self._running = False

    async def run_forever(self) -> None:
        self._running = True
        while self._running:
            processed_any = False
            try:
                while True:
                    job = self.repo.claim_next_job(self.worker_id)
                    if not job:
                        break
                    processed_any = True
                    self._process_job(job)
            except Exception as exc:
                print(f"[vector-worker] loop error: {exc}")

            wait_seconds = 1 if processed_any else self.settings.poll_interval_seconds
            await asyncio.sleep(wait_seconds)

    def stop(self) -> None:
        self._running = False

    def _process_job(self, job: dict[str, Any]) -> None:
        job_id = job["id"]
        sello_id = job["sello_id"]
        try:
            sello = self.repo.fetch_sello(sello_id)
            if not sello:
                raise VectorizationError("Sello inexistente.")
            base_url = (job.get("base_url") or sello.get("archivo_base") or "").strip()
            if not base_url:
                raise VectorizationError("El sello no tiene archivo_base.")

            source = self.repo.download_base_file(base_url)
            vector_content, preview_jpg_content, vector_ext, meta = vectorize_logo(source, self.settings)
            _vector_url, preview_url = self.repo.upload_vector_and_preview(
                order_id=str(sello["orden_id"]),
                sello_id=str(sello_id),
                vector_content=vector_content,
                vector_ext=vector_ext,
                preview_jpg_content=preview_jpg_content,
            )
            self.repo.mark_job_done(job_id, preview_url)
            print(
                f"[vector-worker] job done: {job_id} -> {sello_id} ({vector_ext}) "
                f"pipeline={meta.get('pipeline')} ai={meta.get('ai_enhanced')} cv_x{meta.get('opencv_upscale')} "
                f"binarize={meta.get('binarize')} "
                f"upscale={meta.get('upscaled')} mkbitmap_s={meta.get('mkbitmap_scale')} "
                f"bg_norm={meta.get('background_normalized')}"
                + (f" ai_err={meta.get('ai_enhance_error')}" if meta.get("ai_enhance_error") else "")
                + (f" upscale_err={meta.get('upscale_error')}" if meta.get("upscale_error") else "")
            )
        except Exception as exc:
            terminal = isinstance(exc, VectorizationError)
            self.repo.mark_job_error(job_id, str(exc), terminal=terminal)
            print(f"[vector-worker] job error: {job_id} -> {exc}")
