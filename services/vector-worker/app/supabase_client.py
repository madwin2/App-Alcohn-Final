from __future__ import annotations

import datetime as dt
from typing import Any
from urllib.parse import quote

import requests
from supabase import Client, create_client

from .config import Settings


def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


class VectorWorkerRepository:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client: Client | None = None
        if settings.supabase_url and settings.supabase_service_role_key:
            self.client = create_client(settings.supabase_url, settings.supabase_service_role_key)

    def health(self) -> dict[str, Any]:
        return {
            "ok": True,
            "hasSupabase": bool(self.settings.supabase_url and self.settings.supabase_service_role_key),
        }

    def _require_client(self) -> Client:
        if not self.client:
            raise RuntimeError(
                "SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son obligatorias para procesar vectorización."
            )
        return self.client

    def enqueue_job(self, *, sello_id: str, orden_id: str, max_attempts: int | None = None) -> dict[str, Any]:
        client = self._require_client()
        existing = (
            client.table("vector_jobs")
            .select("id, estado")
            .eq("sello_id", sello_id)
            .in_("estado", ["PENDING", "PROCESSING"])
            .order("created_at", desc=True)
            .limit(1)
            .execute()
            .data
        )
        if existing:
            return existing[0]

        payload = {
            "sello_id": sello_id,
            "orden_id": orden_id,
            "estado": "PENDING",
            "attempts": 0,
            "max_attempts": max_attempts or self.settings.max_attempts_default,
            "run_after": now_iso(),
            "last_error": None,
            "locked_at": None,
            "worker_id": None,
            "finished_at": None,
        }
        data = (
            client.table("vector_jobs")
            .insert(payload)
            .execute()
            .data
        )
        if not data:
            raise RuntimeError("No se pudo crear vector_jobs.")
        return data[0]

    def mark_sello_enqueued(self, sello_id: str) -> None:
        client = self._require_client()
        (
            client.table("sellos")
            .update(
                {
                    "estado_vectorizacion": "EN_PROCESO",
                    "error_vectorizacion_mensaje": None,
                }
            )
            .eq("id", sello_id)
            .execute()
        )

    def fetch_sello(self, sello_id: str) -> dict[str, Any] | None:
        client = self._require_client()
        rows = (
            client.table("sellos")
            .select("id, orden_id, archivo_base, estado_vectorizacion")
            .eq("id", sello_id)
            .limit(1)
            .execute()
            .data
        )
        return rows[0] if rows else None

    def recover_stale_locks(self) -> None:
        client = self._require_client()
        stale_dt = dt.datetime.now(dt.timezone.utc) - dt.timedelta(minutes=self.settings.lock_stale_minutes)
        stale_iso = stale_dt.isoformat()
        (
            client.table("vector_jobs")
            .update(
                {
                    "estado": "PENDING",
                    "locked_at": None,
                    "worker_id": None,
                    "run_after": now_iso(),
                    "last_error": "Lock vencido: job recuperado automáticamente.",
                }
            )
            .eq("estado", "PROCESSING")
            .lt("locked_at", stale_iso)
            .execute()
        )

    def claim_next_job(self, worker_id: str) -> dict[str, Any] | None:
        client = self._require_client()
        self.recover_stale_locks()
        rows = (
            client.table("vector_jobs")
            .select("*")
            .in_("estado", ["PENDING", "ERROR"])
            .order("created_at")
            .limit(25)
            .execute()
            .data
        )
        if not rows:
            return None

        now = dt.datetime.now(dt.timezone.utc)
        for row in rows:
            run_after = row.get("run_after")
            if run_after:
                try:
                    run_after_dt = dt.datetime.fromisoformat(str(run_after).replace("Z", "+00:00"))
                    if run_after_dt > now:
                        continue
                except Exception:
                    pass

            attempts = int(row.get("attempts") or 0)
            max_attempts = int(row.get("max_attempts") or self.settings.max_attempts_default)
            if attempts >= max_attempts:
                continue

            updated = (
                client.table("vector_jobs")
                .update(
                    {
                        "estado": "PROCESSING",
                        "worker_id": worker_id,
                        "locked_at": now_iso(),
                    }
                )
                .eq("id", row["id"])
                .in_("estado", ["PENDING", "ERROR"])
                .execute()
                .data
            )
            if updated:
                return updated[0]
        return None

    def mark_job_done(self, job_id: str, preview_url: str) -> None:
        client = self._require_client()
        row = (
            client.table("vector_jobs")
            .select("sello_id")
            .eq("id", job_id)
            .single()
            .execute()
            .data
        )
        if not row:
            raise RuntimeError("Job no encontrado al finalizar.")
        sello_id = row["sello_id"]
        (
            client.table("sellos")
            .update(
                {
                    "archivo_vector_preview": preview_url,
                    "estado_vectorizacion": "VECTORIZADO",
                    "error_vectorizacion_mensaje": None,
                }
            )
            .eq("id", sello_id)
            .execute()
        )
        (
            client.table("vector_jobs")
            .update(
                {
                    "estado": "DONE",
                    "locked_at": None,
                    "worker_id": None,
                    "last_error": None,
                    "finished_at": now_iso(),
                }
            )
            .eq("id", job_id)
            .execute()
        )

    def mark_job_error(self, job_id: str, error_message: str, *, terminal: bool) -> None:
        client = self._require_client()
        row = (
            client.table("vector_jobs")
            .select("sello_id, attempts, max_attempts")
            .eq("id", job_id)
            .single()
            .execute()
            .data
        )
        if not row:
            return
        attempts = int(row.get("attempts") or 0) + 1
        max_attempts = int(row.get("max_attempts") or self.settings.max_attempts_default)
        is_terminal = terminal or attempts >= max_attempts
        retry_after = dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=min(20, attempts * 2))

        (
            client.table("sellos")
            .update(
                {
                    "estado_vectorizacion": "ERROR" if is_terminal else "EN_PROCESO",
                    "error_vectorizacion_mensaje": error_message[:800],
                }
            )
            .eq("id", row["sello_id"])
            .execute()
        )

        (
            client.table("vector_jobs")
            .update(
                {
                    "estado": "ERROR",
                    "attempts": attempts,
                    "locked_at": None,
                    "worker_id": None,
                    "last_error": error_message[:1500],
                    "run_after": retry_after.isoformat() if not is_terminal else None,
                    "finished_at": now_iso() if is_terminal else None,
                }
            )
            .eq("id", job_id)
            .execute()
        )

    def download_base_file(self, url: str) -> bytes:
        response = requests.get(url, timeout=45)
        response.raise_for_status()
        return response.content

    def _upload_bytes(self, *, path: str, content_type: str, payload: bytes) -> None:
        encoded_path = quote(path, safe="/")
        endpoint = f"{self.settings.supabase_url}/storage/v1/object/{self.settings.vector_bucket}/{encoded_path}"
        headers = {
            "Authorization": f"Bearer {self.settings.supabase_service_role_key}",
            "apikey": self.settings.supabase_service_role_key,
            "Content-Type": content_type,
            "x-upsert": "true",
        }
        response = requests.post(endpoint, headers=headers, data=payload, timeout=60)
        response.raise_for_status()

    def upload_vector_eps_and_preview_jpg(
        self,
        *,
        order_id: str,
        sello_id: str,
        eps_content: bytes,
        preview_jpg_content: bytes,
    ) -> tuple[str, str]:
        ts = int(dt.datetime.now().timestamp())
        base_path = f"ordenes/{order_id}/sellos/{sello_id}/vector_auto_{ts}"
        eps_path = f"{base_path}.eps"
        preview_path = f"{base_path}_preview.jpg"

        self._upload_bytes(path=eps_path, content_type="application/postscript", payload=eps_content)
        self._upload_bytes(path=preview_path, content_type="image/jpeg", payload=preview_jpg_content)

        eps_url = f"{self.settings.supabase_url}/storage/v1/object/public/{self.settings.vector_bucket}/{eps_path}"
        preview_url = f"{self.settings.supabase_url}/storage/v1/object/public/{self.settings.vector_bucket}/{preview_path}"
        return eps_url, preview_url
