import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from core.llm_client import ollama_chat_json  # noqa: E402


def main() -> None:
    text = ollama_chat_json(system="Return ONLY valid JSON.", user='Return only: {"ok": true}', timeout_s=30)
    print(text)


if __name__ == "__main__":
    main()

