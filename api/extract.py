import json
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, ValidationError

from .deps import EXTRACT_MODEL, get_current_user, get_db, openrouter_client, verify_garden_ownership

router = APIRouter()
logger = logging.getLogger(__name__)


class EventDraft(BaseModel):
    planting_id: Optional[str] = Field(
        default=None,
        description="ID from the known plantings list. Set for planting-scoped event types; leave null otherwise.",
    )
    container_id: Optional[str] = Field(
        default=None,
        description="ID from the known containers list. Set for container-scoped event types (relocated, "
        "soil_amended, weeding); leave null otherwise.",
    )
    event_type: str = Field(description="One of the allowed event types listed in the system prompt.")
    category: str = Field(description="E.g., action, measurement, observation, lifecycle")
    payload: Dict[str, Any] = Field(
        default_factory=dict, description="Matching fields for the specific event type. Every field is optional."
    )
    note: Optional[str] = Field(
        default=None, description="Short human-readable note for anything not captured structurally."
    )


class EventDraftList(BaseModel):
    """Wraps the drafts in an object — most JSON-schema/JSON-mode setups expect an object at the root."""

    drafts: List[EventDraft] = Field(default_factory=list)


class ExtractRequest(BaseModel):
    note: str = Field(min_length=1, max_length=10000)
    garden_id: str


@router.post("/api/extract")
def extract_events(req: ExtractRequest, user_id: str = Depends(get_current_user), db = Depends(get_db)):
    verify_garden_ownership(db, req.garden_id, user_id)

    # 1. Fetch this garden's active plantings and containers to give the
    # model as context. The DB stores the canonical species reference by
    # plant_id and keeps the catalog in the `plants` table, so keep the join
    # visible to the model.
    plantings_res = (
        db.table("plantings")
        .select("id, nickname, plant_id, plants(id, plant_name, latin_name)")
        .eq("garden_id", req.garden_id)
        .execute()
    )
    plantings_context = "\n".join(
        f"{p['id']} | {p['nickname']} | {((p.get('plants') or {}).get('plant_name') or p.get('species') or p.get('plant_id'))}"
        for p in plantings_res.data
    )

    containers_res = (
        db.table("containers")
        .select("id, name, type, material")
        .eq("garden_id", req.garden_id)
        .execute()
    )
    containers_context = "\n".join(
        f"{c['id']} | {c['name']} | {c.get('type')}/{c.get('material')}" for c in containers_res.data
    )

    schema = EventDraftList.model_json_schema()
    system_instruction = f"""You convert a home gardener's freeform note into structured event-log entries for myGnomie, a garden tracker.

Known plantings (id | nickname | species):
{plantings_context}

Known containers (id | name | type/material):
{containers_context}

Allowed event types, grouped by what they target:

Planting-scoped (set planting_id, leave container_id null):
  watering, fertilizing, pruning, growth_measurement, harvest, pest_sighting, disease_sighting,
  pest_treatment, disease_treatment, inspection, photo_log, transplanted, germination, thinning

Container-scoped (set container_id, leave planting_id null) — a "container" includes pots as well
as raised beds and in-ground garden plots, not just potted containers:
  relocated, soil_amended, weeding, soil_test, weather_protection

Garden-scoped (leave both planting_id and container_id null):
  rainfall, frost, garden_event

Respond with ONLY a JSON object matching this schema, no prose, no markdown fences:
{json.dumps(schema)}

Every payload field is optional — only include the ones the note actually supports; never invent values.
pest_treatment / disease_treatment are for when the gardener describes *doing something about* a pest or
disease (spraying, removing it by hand, etc.) — use pest_sighting / disease_sighting instead when they're
just reporting that they *saw* one.
germination is for a from-seed planting reporting how/when it sprouted (days_to_germinate,
germination_rate) — only relevant early in that planting's life.
thinning is for removing excess seedlings from a crowded sowing (removed_count, reason).
soil_test is a pH/moisture reading taken on a container's soil — distinct from soil_amended,
which is for actually changing the soil.
weather_protection is what the gardener did in response to weather (action: covered,
moved_indoors, or shade_provided; trigger: what prompted it, e.g. frost or heat).
inspection is for a routine "checked, it's fine" note with nothing else to report.
Never propose photo_log from text alone — photos are attached by the user directly, not inferred.
If the note describes more than one distinct thing, include multiple items in "drafts".
If nothing matches a known planting/container or event type, return {{"drafts": []}}."""

    # 2. Call OpenRouter in JSON mode
    try:
        response = openrouter_client.chat.complete(
            model=EXTRACT_MODEL,
            messages=[
                {"role": "system", "content": system_instruction},
                {"role": "user", "content": req.note},
            ],
            response_format={"type": "json_object"},
        )
    except Exception as exc:
        logger.exception("OpenRouter extraction request failed: %s", exc)
        raise HTTPException(status_code=502, detail="Extraction provider is unavailable")

    raw = response.choices[0].message.content
    if not raw:
        logger.error("OpenRouter extraction response had empty content")
        raise HTTPException(status_code=502, detail="Extraction provider returned an empty response")

    # 3. Validate the model's output against our schema. Also tolerates a
    # bare JSON array in case the model ignores the "wrap in drafts" instruction.
    try:
        parsed = EventDraftList.model_validate_json(raw)
    except ValidationError:
        try:
            parsed = EventDraftList.model_validate({"drafts": json.loads(raw)})
        except Exception as exc:
            logger.exception("OpenRouter extraction response was invalid: %s", exc)
            raise HTTPException(status_code=502, detail="Model returned a response that didn't match the expected schema.")

    return {"drafts": [d.model_dump() for d in parsed.drafts]}
