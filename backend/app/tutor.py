"""OpenAI tutor — streaming via the Responses API with the built-in web_search tool.

Yields plain event dicts so the route layer stays in charge of SSE framing and DB
persistence. Errors are surfaced as events (never raised) so the stream always closes
cleanly for the client.
"""

import json
import os
from collections.abc import Iterator

from openai import OpenAI

_client: OpenAI | None = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI()
    return _client


def _extract_citations(final) -> list[dict]:
    """Pull url_citation annotations off the final response, deduped by URL, in order."""
    seen: set[str] = set()
    out: list[dict] = []
    for item in getattr(final, "output", None) or []:
        if getattr(item, "type", None) != "message":
            continue
        for part in getattr(item, "content", None) or []:
            for ann in getattr(part, "annotations", None) or []:
                if getattr(ann, "type", None) != "url_citation":
                    continue
                url = getattr(ann, "url", None)
                if url and url not in seen:
                    seen.add(url)
                    out.append({"url": url, "title": getattr(ann, "title", None) or url})
    return out


def _json_completion(instructions: str, input_messages: list[dict]) -> dict | None:
    """One-shot non-streaming call that returns a parsed JSON object, or None (no key)."""
    if not os.getenv("OPENAI_API_KEY"):
        return None
    model = os.getenv("MODEL", "gpt-5.4")
    resp = _get_client().responses.create(
        model=model, instructions=instructions, input=input_messages
    )
    raw = (resp.output_text or "").strip()
    if raw.startswith("```"):  # tolerate accidental code fences
        raw = raw.strip("`")
        raw = raw[raw.find("{") :] if "{" in raw else raw
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        start, end = raw.find("{"), raw.rfind("}")
        if start == -1 or end == -1:
            return {}
        try:
            return json.loads(raw[start : end + 1])
        except json.JSONDecodeError:
            return {}


def generate_text(instructions: str, input_messages: list[dict]) -> str | None:
    """One-shot plain-text generation (e.g. the learner profile)."""
    if not os.getenv("OPENAI_API_KEY"):
        return None
    model = os.getenv("MODEL", "gpt-5.4")
    resp = _get_client().responses.create(
        model=model, instructions=instructions, input=input_messages
    )
    return resp.output_text


def run_librarian(instructions: str, input_messages: list[dict]) -> dict | None:
    """Returns the parsed {"operations": [...]} dict, or None."""
    data = _json_completion(instructions, input_messages)
    if data is None:
        return None
    ops = data.get("operations") if isinstance(data, dict) else None
    return {"operations": ops if isinstance(ops, list) else []}


def extract_concepts(instructions: str, input_messages: list[dict]) -> list | None:
    """Returns a list of concept dicts rolled up from the notes, or None (no key)."""
    data = _json_completion(instructions, input_messages)
    if data is None:
        return None
    cs = data.get("concepts") if isinstance(data, dict) else None
    return cs if isinstance(cs, list) else []


def extract_hierarchy(instructions: str, input_messages: list[dict]) -> list | None:
    """Returns the concept tree (list of root nodes) rolled up from the notes, or None."""
    data = _json_completion(instructions, input_messages)
    if data is None:
        return None
    root = data.get("root") if isinstance(data, dict) else None
    return root if isinstance(root, list) else []


def write_single_note(instructions: str, input_messages: list[dict]) -> dict | None:
    """Write one evergreen note ({title, body, links}) from a flagged passage, or None."""
    data = _json_completion(instructions, input_messages)
    if not isinstance(data, dict):
        return None
    title = (data.get("title") or "").strip()
    body = (data.get("body") or "").strip()
    if not title or not body:
        return None
    links = data.get("links") or []
    return {"title": title, "body": body, "links": [str(x) for x in links if x]}


def generate_quiz(instructions: str, input_messages: list[dict]) -> list | None:
    """Returns a list of question dicts, or None (no key)."""
    data = _json_completion(instructions, input_messages)
    if data is None:
        return None
    qs = data.get("questions") if isinstance(data, dict) else None
    return qs if isinstance(qs, list) else []


def grade_text_answers(instructions: str, payload: str) -> dict:
    """Grade free-text answers. payload is a JSON string of items. Returns {id: {correct, feedback}}."""
    data = _json_completion(instructions, [{"role": "user", "content": payload}])
    out: dict[str, dict] = {}
    if not data:
        return out
    for g in data.get("grades", []) if isinstance(data, dict) else []:
        if isinstance(g, dict) and "id" in g:
            out[str(g["id"])] = {
                "correct": bool(g.get("correct")),
                "feedback": g.get("feedback", ""),
            }
    return out


def stream_events(instructions: str, input_messages: list[dict]) -> Iterator[dict]:
    """Yield {'type': 'delta'|'status'|'error', ...} events.

    The caller adds the terminal 'done' event and persists the assembled text.
    """
    if not os.getenv("OPENAI_API_KEY"):
        yield {
            "type": "error",
            "message": "OPENAI_API_KEY is not set. Add it to backend/.env and restart.",
        }
        return

    model = os.getenv("MODEL", "gpt-4.1")
    announced_search = False
    try:
        with _get_client().responses.stream(
            model=model,
            instructions=instructions,
            input=input_messages,
            tools=[{"type": "web_search"}],
        ) as stream:
            for event in stream:
                et = getattr(event, "type", "")
                if et == "response.output_text.delta":
                    yield {"type": "delta", "text": event.delta}
                elif et.startswith("response.web_search_call") and not announced_search:
                    announced_search = True
                    yield {"type": "status", "text": "Searching the web…"}
            # After streaming, pull the citations off the completed response.
            try:
                citations = _extract_citations(stream.get_final_response())
                if citations:
                    yield {"type": "citations", "items": citations}
            except Exception:
                pass
    except Exception as e:  # surface as an event; keep the stream well-formed
        yield {"type": "error", "message": f"{type(e).__name__}: {e}"}
