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
        supabase_ok = False
        if self.client:
            try:
                (
                    self.client.table("vector_jobs")
                    .select("id")
                    .limit(1)
                    .execute()
                )
                supabase_ok = True
            except Exception:
                supabase_ok = False
        return {
            "ok": True,
            "hasSupabase": bool(self.settings.supabase_url and self.settings.supabase_service_role_key),
            "supabaseOk": supabase_ok,
        }

    def _require_client(self) -> Client:
        if not self.client:
            raise RuntimeError(
                "SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son obligatorias para procesar vectorización."
            )
        return self.client

    def enqueue_job(
        self,
        *,
        sello_id: str,
        orden_id: str,
        base_url: str | None = None,
        max_attempts: int | None = None,
    ) -> dict[str, Any]:
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
            job_id = existing[0]["id"]
            update: dict[str, Any] = {
                "estado": "PENDING",
                "locked_at": None,
                "worker_id": None,
                "run_after": now_iso(),
                "last_error": None,
            }
            if base_url:
                update["base_url"] = base_url
            try:
                updated = (
                    client.table("vector_jobs")
                    .update(update)
                    .eq("id", job_id)
                    .execute()
                    .data
                )
                if updated:
                    return updated[0]
            except Exception as exc:
                if "base_url" in str(exc):
                    update.pop("base_url", None)
                    updated = (
                        client.table("vector_jobs")
                        .update(update)
                        .eq("id", job_id)
                        .execute()
                        .data
                    )
                    if updated:
                        return updated[0]
                else:
                    raise
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
        if base_url:
            payload["base_url"] = base_url
        try:
            data = (
                client.table("vector_jobs")
                .insert(payload)
                .execute()
                .data
            )
        except Exception as exc:
            if base_url and "base_url" in str(exc):
                payload.pop("base_url", None)
                data = (
                    client.table("vector_jobs")
                    .insert(payload)
                    .execute()
                    .data
                )
            else:
                raise
        if not data:
            raise RuntimeError("No se pudo crear vector_jobs.")
        return data[0]

    def mark_sello_enqueued(self, sello_id: str, base_url: str | None = None) -> None:
        client = self._require_client()
        update: dict[str, Any] = {
            "estado_vectorizacion": "EN_PROCESO",
            "error_vectorizacion_mensaje": None,
        }
        if base_url:
            update["archivo_base"] = base_url
        (
            client.table("sellos")
            .update(update)
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

    def release_orphan_locks_on_startup(self) -> None:
        """Tras un restart de PM2, jobs PROCESSING quedan huérfanos."""
        client = self._require_client()
        (
            client.table("vector_jobs")
            .update(
                {
                    "estado": "PENDING",
                    "locked_at": None,
                    "worker_id": None,
                    "run_after": now_iso(),
                }
            )
            .eq("estado", "PROCESSING")
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

    def upload_vector_and_preview(
        self,
        *,
        order_id: str,
        sello_id: str,
        vector_content: bytes,
        vector_ext: str,
        preview_jpg_content: bytes,
    ) -> tuple[str, str]:
        ts = int(dt.datetime.now().timestamp())
        base_path = f"ordenes/{order_id}/sellos/{sello_id}/vector_auto_{ts}"
        ext = vector_ext.lower().lstrip(".")
        content_types = {
            "svg": "image/svg+xml",
            "eps": "application/postscript",
        }
        if ext not in content_types:
            raise ValueError(f"Extensión de vector no soportada: {ext}")

        vector_path = f"{base_path}.{ext}"
        preview_path = f"{base_path}_preview.jpg"

        self._upload_bytes(path=vector_path, content_type=content_types[ext], payload=vector_content)
        self._upload_bytes(path=preview_path, content_type="image/jpeg", payload=preview_jpg_content)

        vector_url = f"{self.settings.supabase_url}/storage/v1/object/public/{self.settings.vector_bucket}/{vector_path}"
        preview_url = f"{self.settings.supabase_url}/storage/v1/object/public/{self.settings.vector_bucket}/{preview_path}"
        return vector_url, preview_url

    def upload_vector_eps_and_preview_jpg(
        self,
        *,
        order_id: str,
        sello_id: str,
        eps_content: bytes,
        preview_jpg_content: bytes,
    ) -> tuple[str, str]:
        return self.upload_vector_and_preview(
            order_id=order_id,
            sello_id=sello_id,
            vector_content=eps_content,
            vector_ext="eps",
            preview_jpg_content=preview_jpg_content,
        )
