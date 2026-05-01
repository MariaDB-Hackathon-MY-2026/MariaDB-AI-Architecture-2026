"""LLM client abstraction (Phase 2).

Currently supports Ollama via HTTP. Keep this module small so we can swap providers.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
import contextvars
from contextlib import contextmanager
from typing import Generator

import httpx
from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class LlmConfig:
    provider: str
    ollama_base_url: str
    ollama_model: str

    @classmethod
    def from_env(cls) -> "LlmConfig":
        return cls(
            provider=(os.getenv("LLM_PROVIDER", "ollama") or "ollama").strip().lower(),
            ollama_base_url=(os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434") or "")
            .strip()
            .rstrip("/"),
            ollama_model=(os.getenv("OLLAMA_MODEL", "qwen3.5:9b") or "").strip(),
        )


class LlmError(RuntimeError):
    pass


_RUNTIME_LLM: contextvars.ContextVar[LlmConfig | None] = contextvars.ContextVar("runtime_llm_config", default=None)


@contextmanager
def runtime_llm_config(*, base_url: str, model: str, provider: str = "ollama") -> Generator[None, None, None]:
    cfg = LlmConfig(provider=provider, ollama_base_url=(base_url or "").strip().rstrip("/"), ollama_model=(model or "").strip())
    token = _RUNTIME_LLM.set(cfg)
    try:
        yield
    finally:
        _RUNTIME_LLM.reset(token)


def ollama_chat_json(*, system: str, user: str, timeout_s: float = 60.0) -> str:
    """Return assistant text from Ollama /api/chat.

    We keep it as plain text and do strict JSON parsing in higher layers.
    """

    cfg = _RUNTIME_LLM.get() or LlmConfig.from_env()
    if cfg.provider != "ollama":
        raise LlmError(f"Unsupported LLM_PROVIDER={cfg.provider!r}. Use 'ollama'.")
    if not cfg.ollama_model:
        raise LlmError("OLLAMA_MODEL is empty.")

    url = f"{cfg.ollama_base_url}/api/chat"
    payload = {
        "model": cfg.ollama_model,
        "stream": False,
        "format": "json",
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "options": {
            "temperature": 0.2,
        },
    }

    try:
        with httpx.Client(timeout=timeout_s) as client:
            res = client.post(url, json=payload)
            res.raise_for_status()
            data = res.json()
    except httpx.RequestError as exc:
        raise LlmError(f"Could not reach Ollama at {cfg.ollama_base_url}. Is it running?") from exc
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            raise LlmError(
                f"Ollama model not found: {cfg.ollama_model!r}. "
                "Run `ollama pull <model>` and set OLLAMA_MODEL to an installed tag."
            ) from exc
        raise LlmError(f"Ollama error: {exc.response.text}") from exc
    except ValueError as exc:
        raise LlmError("Ollama returned non-JSON response.") from exc

    message = data.get("message") or {}
    content = message.get("content")
    if not isinstance(content, str) or not content.strip():
        raise LlmError("Ollama returned empty content.")
    return content.strip()

