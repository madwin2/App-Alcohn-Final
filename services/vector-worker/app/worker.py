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
            base_url = (sello.get("archivo_base") or "").strip()
            if not base_url:
                raise VectorizationError("El sello no tiene archivo_base.")

            source = self.repo.download_base_file(base_url)
            eps_content, preview_jpg_content = vectorize_logo(source, self.settings)
            _eps_url, preview_url = self.repo.upload_vector_eps_and_preview_jpg(
                order_id=str(sello["orden_id"]),
                sello_id=str(sello_id),
                eps_content=eps_content,
                preview_jpg_content=preview_jpg_content,
            )
            self.repo.mark_job_done(job_id, preview_url)
            print(f"[vector-worker] job done: {job_id} -> {sello_id}")
        except Exception as exc:
            terminal = isinstance(exc, VectorizationError)
            self.repo.mark_job_error(job_id, str(exc), terminal=terminal)
            print(f"[vector-worker] job error: {job_id} -> {exc}")
