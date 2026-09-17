from fastapi import APIRouter, Depends

from .deps import get_current_user, get_db

router = APIRouter()

# If a user has never explicitly created a garden, we don't make them stop
# and set one up — we default them into a "whole house" garden instead.
# `whole_house` is a real value in gardens.type's check constraint.
DEFAULT_GARDEN = {"name": "My Home", "type": "whole_house"}


def _ensure_default_garden(db, user_id: str) -> dict:
    """Every container/planting needs a garden row to hang off of (that's
    how row-level security is scoped), but the *person* using the app should
    never have to think about "gardens" if all they have is a windowsill
    basil plant. If they have zero gardens, silently create the default one
    and use that instead of forcing setup first.
    """
    result = db.table("gardens").insert([{**DEFAULT_GARDEN, "user_id": user_id}]).execute()
    return result.data[0]


def _flatten_planting(item: dict) -> dict:
    """Normalize joined plant metadata into the app-facing shape.

    The database stores the reference via plant_id and the catalog row under
    `plants(...)`; older client code may still send or expect a direct
    `species` string. We support both by flattening the join while preserving
    any existing direct fields.
    """
    species = item.pop("plants", None) or {}
    item["species"] = item.get("species") or species.get("plant_name")
    item["plant_id"] = item.get("plant_id") or species.get("id")
    item["species_info"] = {
        "harvest_type": species.get("harvest_type"),
        "life_cycle_type": species.get("life_cycle_type"),
        "latin_name": species.get("latin_name"),
        "variety": species.get("variety"),
        "usda_symbol": species.get("usda_symbol"),
        "usda_common_name": species.get("usda_common_name"),
        "ph_min": species.get("ph_min"),
        "ph_max": species.get("ph_max"),
        "precipitation_min_in": species.get("precipitation_min_in"),
        "precipitation_max_in": species.get("precipitation_max_in"),
        "moisture_use": species.get("moisture_use"),
        "drought_tolerance": species.get("drought_tolerance"),
        "shade_tolerance": species.get("shade_tolerance"),
        "growth_habit": species.get("growth_habit"),
        "bloom_period": species.get("bloom_period"),
        "usda_source_url": species.get("usda_source_url"),
    }
    return item


@router.get("/api/gardens")
def list_gardens(user_id: str = Depends(get_current_user), db = Depends(get_db)):
    gardens = (
        db.table("gardens")
        .select("id, name, type, location, timezone, established_at, notes, hardiness_zone, hardiness_zone_temp_range_f, hardiness_zone_updated_at")
        .eq("user_id", user_id)
        .order("established_at")   # <-- was missing; without this, Postgres/PostgREST
                                #     can return rows in any order, so list[0] in
                                #     useGardenData.js's fallback was picking a
                                #     different garden across reloads.
        .execute()
        .data
    )
    # if not gardens:
    #     gardens = [_ensure_default_garden(db, user_id)]

    garden_ids = [garden["id"] for garden in gardens]

    plantings_raw = (
        db.table("plantings")
        .select(
            "*, plants(id, plant_name, harvest_type, life_cycle_type, latin_name, variety, "
            "usda_symbol, usda_common_name, "
            "ph_min, ph_max, precipitation_min_in, precipitation_max_in, moisture_use, "
            "drought_tolerance, shade_tolerance, growth_habit, bloom_period, usda_source_url)"
        )
        .in_("garden_id", garden_ids)
        .execute()
        .data
    )
    plantings = [_flatten_planting(dict(item)) for item in plantings_raw]
    containers = db.table("containers").select("*").in_("garden_id", garden_ids).execute().data
    events = db.table("garden_events").select("*").in_("garden_id", garden_ids).execute().data

    return {
        "gardens": [
            {
                **garden,
                "plantings": [item for item in plantings if item.get("garden_id") == garden["id"]],
                "containers": [item for item in containers if item.get("garden_id") == garden["id"]],
                "events": [item for item in events if item.get("garden_id") == garden["id"]],
            }
            for garden in gardens
        ]
    }