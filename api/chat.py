import logging
import re
from typing import Any, List, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .deps import CHAT_MODEL, get_current_user, get_db, openrouter_client, verify_garden_ownership

router = APIRouter()
logger = logging.getLogger(__name__)


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class ChatRequest(BaseModel):
    garden_id: str
    messages: List[ChatMessage] = Field(min_length=1, max_length=50)
    # Optional client-computed context (per-plant projections, species reference
    # data, live weather). The backend has no independent access to weather —
    # it only exists in the browser — so the frontend supplies it here.
    context: str | None = Field(default=None, max_length=20000)


class ChatEventCreate(BaseModel):
    entity_type: Literal["garden", "container", "planting"]
    entity_id: str
    event_type: str
    category: str
    source: str = "self"
    payload: dict[str, Any] = Field(default_factory=dict)
    note: str | None = None
    media: list[str] | None = None


class ChatEventEdit(BaseModel):
    event_id: str
    entity_type: Literal["garden", "container", "planting"] | None = None
    entity_id: str | None = None
    event_type: str | None = None
    category: str | None = None
    source: str | None = None
    payload: dict[str, Any] | None = None
    note: str | None = None
    media: list[str] | None = None


class ChatModelResponse(BaseModel):
    reply: str
    create_events: list[ChatEventCreate] = Field(default_factory=list)
    edit_events: list[ChatEventEdit] = Field(default_factory=list)


def _parse_chat_response(content: str) -> ChatModelResponse:
    text = content.strip()
    candidates = [text]
    fenced = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", text, flags=re.IGNORECASE | re.DOTALL)
    if fenced:
        candidates.append(fenced.group(1).strip())
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        candidates.append(text[start : end + 1])

    for candidate in dict.fromkeys(candidates):
        try:
            return ChatModelResponse.model_validate_json(candidate)
        except Exception:
            continue

    return ChatModelResponse(reply=text)


def _verify_entity(db, garden_id: str, entity_type: str, entity_id: str) -> None:
    if entity_type == "garden":
        if entity_id != garden_id:
            raise HTTPException(status_code=422, detail="Garden event must target its garden")
        return
    table = "plantings" if entity_type == "planting" else "containers"
    result = (
        db.table(table)
        .select("id")
        .eq("id", entity_id)
        .eq("garden_id", garden_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Event entity not found in garden")


def _create_event(db, garden_id: str, event: ChatEventCreate) -> dict:
    _verify_entity(db, garden_id, event.entity_type, event.entity_id)
    event_data = {**event.model_dump(exclude_unset=True), "garden_id": garden_id}
    result = db.table("garden_events").insert([event_data]).execute()
    if not result.data:
        raise HTTPException(status_code=502, detail="Event could not be created")
    return result.data[0]


def _edit_event(db, garden_id: str, edit: ChatEventEdit) -> dict:
    existing = (
        db.table("garden_events")
        .select("*")
        .eq("id", edit.event_id)
        .eq("garden_id", garden_id)
        .limit(1)
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Event not found in garden")

    values = edit.model_dump(exclude_unset=True, exclude_none=True)
    values.pop("event_id", None)
    if not values:
        raise HTTPException(status_code=422, detail="At least one event field is required")
    entity_type = values.get("entity_type", existing.data[0]["entity_type"])
    entity_id = values.get("entity_id", existing.data[0]["entity_id"])
    _verify_entity(db, garden_id, entity_type, entity_id)
    result = (
        db.table("garden_events")
        .update(values)
        .eq("id", edit.event_id)
        .eq("garden_id", garden_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Event not found in garden")
    return result.data[0]


@router.post("/api/chat")
def garden_chat(req: ChatRequest, user_id: str = Depends(get_current_user), db = Depends(get_db)):
    verify_garden_ownership(db, req.garden_id, user_id)

    # 1. Fetch recent events from Supabase (source of truth, always fresh)
    events = (
        db.table("garden_events")
        .select("*")
        .eq("garden_id", req.garden_id)
        .order("timestamp", desc=True)
        .limit(20)
        .execute()
    )

    system_prompt = (
        "You are myGnomie, a friendly home gardening assistant living inside a garden-tracking app. "
        "A real person reads your reply on their phone in a plain chat bubble — it is shown exactly as you "
        "write it, with no markdown rendering, no bold, no headers, and no bullet formatting.\n\n"

        "HOW TO WRITE THE REPLY:\n"
        "- Write like a knowledgeable friend, not a report. Plain sentences only.\n"
        "- Never use markdown syntax (**, #, `, dash/number lists) — it will show up as literal punctuation, "
        "not formatting. If you're naming a couple of things, join them with 'and' or a comma instead of a list.\n"
        "- Keep it short: 1-4 sentences for most answers. Only go longer if the person explicitly asks for "
        "step-by-step detail.\n"
        "- Lead with the direct answer or most useful fact first, then add context only if it's actually needed.\n"
        "- Refer to plants and containers by their nickname (e.g. \"your balcony tomato\"), never by their "
        "database id, event id, or field name — the person has never seen those and never should.\n"
        "- Use everyday language. Avoid horticultural jargon (say 'yellowing leaves', not 'chlorosis') unless "
        "the person used the technical term first.\n"
        "- If the data doesn't tell you enough to answer confidently, say so once, plainly, and ask for or "
        "suggest what would help — don't pad the answer with stacked disclaimers.\n"
        "- Never restate the raw data back at the person, and never include JSON, timestamps, or field names "
        "in the reply.\n\n"

        "LOGGING AND EDITING EVENTS:\n"
        "- Allowed event_type values: watering, fertilizing, pruning, growth_measurement, harvest, "
        "pest_sighting, disease_sighting, pest_treatment, disease_treatment, inspection, photo_log, "
        "transplanted (all entity_type \"planting\"); relocated, soil_amended, weeding (entity_type "
        "\"container\" — this includes raised beds and in-ground plots, not just pots); rainfall, frost, "
        "garden_event (entity_type \"garden\").\n"
        "- pest_treatment/disease_treatment are for when the gardener describes doing something about a "
        "pest or disease; pest_sighting/disease_sighting are for just spotting one. inspection is a quick "
        "\"checked, all good\" note.\n"
        "- Only propose a new event in create_events when the message describes something that already "
        "happened (\"I watered the basil\", \"just picked two tomatoes\") — never invent one from a question.\n"
        "- Only propose edit_events when the person is correcting something they already logged.\n"
        "- When you do log or edit something, confirm it in plain language in the reply — e.g. \"Logged it — "
        "half a liter for the balcony tomato.\" — not by describing the JSON you sent.\n\n"

        "EXAMPLE, same data either way:\n"
        "  Bad: \"Based on the event log, entity planting_seed_1 (Tomato) had event_type watering with payload "
        "{amount_l: 0.5} 2 days ago. **Recommendation:** increase watering frequency.\"\n"
        "  Good: \"Your balcony tomato was last watered 2 days ago with just half a liter — a bit light in "
        "this heat. I'd give it a full liter today.\"\n\n"

        "Answer using the gardener's data below. Return only JSON matching the response schema — the schema "
        "and field names are for you only and must never leak into the reply text. Use exact entity and event "
        "IDs from the data for create_events/edit_events (not in the reply).\n\n"
    )
    if req.context:
        system_prompt += req.context + "\n\n"
    system_prompt += f"RECENT EVENT LOG (most recent first): {events.data}\n\n"
    system_prompt += f"RESPONSE SCHEMA: {ChatModelResponse.model_json_schema()}"

    # 2. Format history for OpenRouter (OpenAI-compatible role/content dicts)
    messages = [{"role": "system", "content": system_prompt}]
    for message in req.messages:
        messages.append(message.model_dump())

    # 3. Generate response
    try:
        response = openrouter_client.chat.complete(
            model=CHAT_MODEL,
            messages=messages,
            response_format={"type": "json_object"},
        )
    except Exception as exc:
        logger.exception("OpenRouter chat request failed: %s", exc)
        raise HTTPException(status_code=502, detail="Assistant provider is unavailable")

    try:
        content = response.choices[0].message.content
        if not content:
            raise ValueError("OpenRouter returned empty content")
        parsed = _parse_chat_response(content)
    except Exception as exc:
        logger.exception("OpenRouter chat response was invalid: %s", exc)
        raise HTTPException(status_code=502, detail="Assistant returned an invalid structured response")

    created_events = [_create_event(db, req.garden_id, event) for event in parsed.create_events]
    updated_events = [_edit_event(db, req.garden_id, event) for event in parsed.edit_events]
    return {
        "reply": parsed.reply,
        "created_events": created_events,
        "updated_events": updated_events,
    }
