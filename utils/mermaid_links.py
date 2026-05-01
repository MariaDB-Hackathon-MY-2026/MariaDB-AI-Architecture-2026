from __future__ import annotations

import base64
import zlib
from urllib.parse import quote


def encode_mermaid_base64(code: str) -> str:
    """Base64url-encode Mermaid code for mermaid.ink endpoints."""
    raw = (code or "").encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def encode_mermaid_live_pako(code: str, *, theme: str = "default") -> str:
    """Return `pako:<base64url>` for mermaid.live/edit#... payloads.

    Mermaid Live expects a compressed JSON "state" object, not raw diagram text.
    """
    state = {
        "code": code or "",
        "mermaid": {"theme": theme},
        "autoSync": True,
        "updateDiagram": True,
        "editorMode": "code",
    }
    raw = json_dumps_compact(state).encode("utf-8")
    compressed = zlib.compress(raw, level=9)
    b64 = base64.urlsafe_b64encode(compressed).decode("ascii").rstrip("=")
    return f"pako:{b64}"


def json_dumps_compact(value) -> str:
    import json

    return json.dumps(value, separators=(",", ":"), ensure_ascii=False)


def mermaid_live_edit_url(*, code: str) -> str:
    payload = encode_mermaid_live_pako(code)
    return f"https://mermaid.live/edit#{payload}"


def mermaid_ink_url(*, code: str, kind: str, theme: str = "light", bg_color: str | None = None) -> str:
    """Build a mermaid.ink URL.

    `kind`: "svg" | "img"
    """
    kind = kind.strip().lower()
    if kind not in {"svg", "img"}:
        raise ValueError("kind must be 'svg' or 'img'")

    # Prefer base64(code) for broad compatibility. (pako payloads are Mermaid Live state.)
    payload = encode_mermaid_base64(code)

    params: dict[str, str] = {}
    # mermaid.ink supports `?theme=dark|neutral|default|forest|base`
    mermaid_theme = "dark" if theme.lower().strip() == "dark" else "neutral"
    params["theme"] = mermaid_theme
    if bg_color:
        params["bgColor"] = bg_color

    qs = ""
    if params:
        qs = "?" + "&".join(f"{k}={quote(str(v), safe='')}" for k, v in params.items())

    return f"https://mermaid.ink/{kind}/{payload}{qs}"

