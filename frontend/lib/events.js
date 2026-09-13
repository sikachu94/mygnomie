import { uid } from "./format.js";

// scope: "planting" | "container" | "garden". "container" covers pots as
// well as raised beds and in-ground plots (see CONTAINER_TYPES in species.js)
// so ground gardeners get the same relocated/soil_amended/weeding events as
// container gardeners — nothing container-specific about the name.
export const EVENT_TYPES = {
  watering: { category: "action", scope: "planting", fields: "amount_l?, method?" },
  fertilizing: { category: "action", scope: "planting", fields: "fertilizer_type?, amount?, unit?, method?, product?, npk?" },
  pruning: { category: "action", scope: "planting", fields: "technique?, reason?" },
  growth_measurement: { category: "measurement", scope: "planting", fields: "metric?, value?, unit?" },
  harvest: { category: "measurement", scope: "planting", fields: "quantity?, unit?, quality?, harvest_method?" },
  pest_sighting: { category: "observation", scope: "planting", fields: "pest?, severity?, affected_area?" },
  disease_sighting: { category: "observation", scope: "planting", fields: "disease?, severity?" },
  pest_treatment: { category: "action", scope: "planting", fields: "target_pest?, method?, product?" },
  disease_treatment: { category: "action", scope: "planting", fields: "target_disease?, method?, product?" },
  inspection: { category: "observation", scope: "planting", fields: "(no payload — just an optional note)" },
  stage_change: { category: "lifecycle", scope: "planting", fields: "from_stage, to_stage" },
  planting_ended: { category: "lifecycle", scope: "planting", fields: "end_reason" },
  transplanted: { category: "lifecycle", scope: "planting", fields: "to_container_id?, reason?" },
  photo_log: { category: "observation", scope: "planting", fields: "(no payload — just a photo)" },
  relocated: { category: "lifecycle", scope: "container", fields: "new_placement?, sun_exposure_hours?" },
  soil_amended: { category: "lifecycle", scope: "container", fields: "trigger?, new_volume_l?" },
  weeding: { category: "action", scope: "container", fields: "method?, area?" },
  soil_test: { category: "measurement", scope: "container", fields: "ph?, moisture_pct?, method?" },
  weather_protection: { category: "action", scope: "container", fields: "action?, trigger?" },
  germination: { category: "observation", scope: "planting", fields: "days_to_germinate?, germination_rate?" },
  thinning: { category: "action", scope: "planting", fields: "removed_count?, reason?" },
  rainfall: { category: "measurement", scope: "garden", fields: "amount_mm" },
  frost: { category: "observation", scope: "garden", fields: "severity?" },
  garden_event: { category: "observation", scope: "garden", fields: "note" },
};

export const scopeOf = (eventType) => EVENT_TYPES[eventType]?.scope || "planting";

// Event types that render as an andon-style alert regardless of any
// severity value in their payload — severity isn't a reliable enum since
// the AI extractor doesn't enforce one. Single source of truth: EventIcon's
// stamp color, the log's day-rollup highlighting, and each entry's row
// styling all read from this instead of each keeping their own copy.
// Treatments are deliberately NOT alerts — they're the resolving action,
// so they render in the calmer "routine" color instead.
export const ALERT_EVENT_TYPES = new Set(["pest_sighting", "disease_sighting"]);
export const isAlertEvent = (eventType) => ALERT_EVENT_TYPES.has(eventType);

// Plain-language stand-ins for raw event_type strings. Anywhere a person
// reads the log, they should see "Watered" and "Pest spotted", not
// "watering" or "pest_sighting" with underscores swapped for spaces.
export const EVENT_TYPE_LABELS = {
  watering: "Watered",
  fertilizing: "Fertilized",
  pruning: "Pruned",
  growth_measurement: "Measurement",
  harvest: "Harvested",
  pest_sighting: "Pest!",
  disease_sighting: "Disease",
  pest_treatment: "Pest treated",
  disease_treatment: "Disease treated",
  inspection: "Inspected",
  stage_change: "Next Growth Stage",
  planting_ended: "Plant is gone",
  photo_log: "Photo",
  rainfall: "Rain",
  frost: "Frost",
  container_setup: "Pot set up",
  planting_setup: "Plant added",
  relocated: "Moved",
  soil_amended: "Soil changed",
  weeding: "Weeded",
  transplanted: "Transplanted",
  soil_test: "Soil tested",
  weather_protection: "Weather protection",
  germination: "Germinated",
  thinning: "Thinned",
  garden_event: "Garden Event",
};

export function labelForEventType(eventType) {
  return EVENT_TYPE_LABELS[eventType] || eventType.replace(/_/g, " ");
}

// ---------------------------------------------------------------------------
// Manual log-entry form (LogEntryForm.jsx): the chip row won't scale as one
// flat list once every event type is included, so it's split into a primary
// row (the most common actions, in roughly descending frequency) and a
// "More" overflow grouped by theme. MANUAL_ENTRY_TYPES stays the full flat
// list for everything else that just needs "is this a loggable type" (garden
// scope filtering, editingEvent lookups, etc).
// ---------------------------------------------------------------------------

export const MANUAL_ENTRY_PRIMARY = [
  "watering",
  "harvest",
  "pest_sighting",
  "disease_sighting",
  "fertilizing",
  "inspection",
  "pruning",
  "photo_log",
];

export const MANUAL_ENTRY_MORE_GROUPS = [
  { label: "Treat", types: ["pest_treatment", "disease_treatment"] },
  { label: "Container", types: ["relocated", "soil_amended", "weeding", "transplanted", "soil_test", "weather_protection"] },
  { label: "Growth", types: ["germination", "thinning"] },
  { label: "Record", types: ["growth_measurement", "garden_event"] },
];

export const MANUAL_ENTRY_TYPES = [
  ...MANUAL_ENTRY_PRIMARY,
  ...MANUAL_ENTRY_MORE_GROUPS.flatMap((g) => g.types),
];

// Present-tense/type-name labels ("Watering", "Pest") on purpose — distinct
// from EVENT_TYPE_LABELS above, which is past-tense for describing something
// that already happened in the log rows.
export const MANUAL_ENTRY_LABELS = {
  watering: "Watering",
  fertilizing: "Fertilize",
  pruning: "Prune",
  harvest: "Harvest",
  growth_measurement: "Measurement",
  pest_sighting: "Pest",
  disease_sighting: "Disease",
  pest_treatment: "Treat pest",
  disease_treatment: "Treat disease",
  inspection: "Inspect",
  garden_event: "Garden Event",
  photo_log: "Photo",
  relocated: "Relocate",
  soil_amended: "Amend soil",
  weeding: "Weed",
  transplanted: "Transplant",
  soil_test: "Soil test",
  weather_protection: "Protect",
  germination: "Germination",
  thinning: "Thin seedlings",
};

// Field definitions for the manual log-entry form. Each field is
// { key, label, kind: "number" | "text" | "select", options?, placeholder? }.
// Per design decision, NOTHING here is required — every field is skipped in
// buildManualEvents/save() if left blank. The only data every event carries
// is what's derived automatically (id, timestamp, garden_id, entity_type,
// entity_id, category, source, confidence).
export const MANUAL_ENTRY_FIELDS = {
  watering: [
    { key: "amount_l", label: "Amount (litres)", kind: "number" },
    { key: "method", label: "Method", kind: "select", options: ["hand", "drip", "sprinkler"] },
  ],
  fertilizing: [
    { key: "fertilizer_type", label: "Type", kind: "select", options: ["granular", "liquid", "organic", "slow_release"] },
    { key: "amount", label: "Amount", kind: "number" },
    { key: "unit", label: "Unit", kind: "select", options: ["g", "ml", "tbsp", "cup"] },
    { key: "method", label: "Method", kind: "select", options: ["soil_drench", "foliar_spray", "top_dress"] },
    { key: "product", label: "Product", kind: "text", placeholder: "optional, e.g. fish emulsion" },
    { key: "npk", label: "N-P-K", kind: "text", placeholder: "optional, e.g. 10-10-10" },
  ],
  pruning: [
    { key: "technique", label: "Technique", kind: "select", options: ["deadhead", "pinch", "prune", "thin", "stake"] },
    { key: "reason", label: "Reason", kind: "text", placeholder: "optional" },
  ],
  harvest: [
    { key: "quantity", label: "Quantity", kind: "number" },
    { key: "unit", label: "Unit", kind: "select", options: ["g", "kg", "pieces"] },
    { key: "quality", label: "Quality", kind: "select", options: ["poor", "fair", "good", "excellent"] },
    { key: "harvest_method", label: "Method", kind: "select", options: ["hand-picked", "cut", "pulled"] },
  ],
  growth_measurement: [
    { key: "metric", label: "What are you measuring?", kind: "text", placeholder: "e.g. height" },
    { key: "value", label: "Value", kind: "number" },
    { key: "unit", label: "Unit", kind: "text", placeholder: "e.g. cm" },
  ],
  pest_sighting: [
    { key: "pest", label: "Pest", kind: "text", placeholder: "e.g. aphids" },
    { key: "severity", label: "Severity", kind: "select", options: ["light", "moderate", "severe"] },
    { key: "affected_area", label: "Affected area", kind: "text", placeholder: "optional" },
  ],
  disease_sighting: [
    { key: "disease", label: "Disease", kind: "text", placeholder: "e.g. powdery mildew" },
    { key: "severity", label: "Severity", kind: "select", options: ["light", "moderate", "severe"] },
  ],
  pest_treatment: [
    { key: "target_pest", label: "Pest", kind: "text", placeholder: "e.g. aphids" },
    { key: "method", label: "Method", kind: "select", options: ["neem_oil", "insecticidal_soap", "manual_removal", "biological_control", "other"] },
    { key: "product", label: "Product", kind: "text", placeholder: "optional" },
  ],
  disease_treatment: [
    { key: "target_disease", label: "Disease", kind: "text", placeholder: "e.g. powdery mildew" },
    { key: "method", label: "Method", kind: "select", options: ["fungicide", "pruned_affected", "improved_airflow", "other"] },
    { key: "product", label: "Product", kind: "text", placeholder: "optional" },
  ],
  inspection: [],
  garden_event: [],
  photo_log: [],
  relocated: [
    { key: "new_placement", label: "New placement", kind: "text", placeholder: "e.g. south balcony rail" },
    { key: "sun_exposure_hours", label: "Sun (hrs/day)", kind: "number" },
  ],
  // Note: the full initial_soil_composition[] structure (component + percent
  // rows) used at planting setup isn't reproduced here — that stays a
  // multi-row editor on the "add plant" form. This quick-log sheet only
  // captures why the soil was touched and the container's new size, to keep
  // it fast. Editing the full composition here is a reasonable follow-up.
  soil_amended: [
    { key: "trigger", label: "Reason", kind: "select", options: ["top_dress", "mulch", "root_bound_refresh", "nutrient_boost"] },
    { key: "new_volume_l", label: "New size (L)", kind: "number" },
  ],
  weeding: [
    { key: "method", label: "Method", kind: "select", options: ["hand_pulled", "hoed", "mulched"] },
    { key: "area", label: "Area", kind: "text", placeholder: "optional, e.g. north bed" },
  ],
  transplanted: [
    // Rendered as a dynamic container picker in LogEntryForm.jsx, not a
    // static <select> — see the field.key === "to_container_id" special case.
    { key: "to_container_id", label: "Move to container", kind: "select", options: [] },
    { key: "reason", label: "Reason", kind: "text", placeholder: "optional" },
  ],
  soil_test: [
    { key: "ph", label: "Soil pH", kind: "number" },
    { key: "moisture_pct", label: "Moisture (%)", kind: "number" },
    { key: "method", label: "Method", kind: "select", options: ["probe", "strip", "meter", "visual"] },
  ],
  weather_protection: [
    { key: "action", label: "What did you do?", kind: "select", options: ["covered", "moved_indoors", "shade_provided"] },
    { key: "trigger", label: "Why", kind: "select", options: ["frost", "heat", "wind", "hail"] },
  ],
  germination: [
    { key: "days_to_germinate", label: "Days to germinate", kind: "number" },
    { key: "germination_rate", label: "Germination rate (%)", kind: "number" },
  ],
  thinning: [
    { key: "removed_count", label: "Seedlings removed", kind: "number" },
    { key: "reason", label: "Reason", kind: "text", placeholder: "optional, e.g. overcrowded" },
  ],
};

/** Turns a parsed AI draft into a full event-log entry ready to persist. */
export function buildEvent(draft, gardenId) {
  const scope = scopeOf(draft.event_type);
  const entityType = scope === "garden" ? "garden" : scope === "container" ? "container" : "planting";
  const entityId = scope === "garden" ? gardenId : scope === "container" ? draft.container_id : draft.planting_id;
  return {
    id: uid("evt"),
    timestamp: new Date().toISOString(),
    garden_id: gardenId,
    entity_type: entityType,
    entity_id: entityId,
    category: draft.category,
    source: "self",
    event_type: draft.event_type,
    payload: draft.payload || {},
    note: draft.note || undefined,
    media: draft.media?.length ? draft.media : undefined,
    confidence: "observed",
  };
}

/**
 * Builds a minimal, ready-to-persist event for one-tap quick actions
 * (watering, fertilizing, harvest, photo_log) — no note, empty payload by
 * default.
 */
export function quickLogEvent(eventType, entityId, gardenId, extra = {}) {
  const meta = EVENT_TYPES[eventType];
  const scope = meta?.scope || "planting";
  const entityType = scope === "garden" ? "garden" : scope === "container" ? "container" : "planting";
  return {
    id: uid("evt"),
    timestamp: new Date().toISOString(),
    garden_id: gardenId,
    entity_type: entityType,
    entity_id: scope === "garden" ? gardenId : entityId,
    category: meta?.category || "action",
    source: "self",
    event_type: eventType,
    payload: {},
    confidence: "observed",
    ...extra,
  };
}

/**
 * Short human-readable fragment of a saved event's payload, for the
 * subtitle line under a log entry — e.g. "0.5L, by hand" or "Aphids ·
 * moderate". Returns null when the payload has nothing worth surfacing
 * (quick-tap actions log with an empty payload on purpose).
 */
export function describeEventPayload(eventType, payload = {}) {
  switch (eventType) {
    case "watering":
      return payload.amount_l ? `${payload.amount_l}L${payload.method ? `, by ${payload.method}` : ""}` : payload.method || null;
    case "fertilizing":
      return payload.amount
        ? `${payload.amount}${payload.unit || ""}${payload.fertilizer_type ? `, ${payload.fertilizer_type}` : ""}`
        : payload.fertilizer_type || payload.product || null;
    case "pruning":
      return payload.technique ? `${payload.technique}${payload.reason ? ` — ${payload.reason}` : ""}` : payload.reason || null;
    case "harvest":
      return payload.quantity
        ? `${payload.quantity}${payload.unit ? ` ${payload.unit}` : ""}${payload.quality ? `, ${payload.quality}` : ""}${payload.harvest_method ? ` (${payload.harvest_method})` : ""}`
        : payload.quality || payload.harvest_method || null;
    case "pest_sighting":
      return payload.pest ? `${payload.pest}${payload.severity ? ` · ${payload.severity}` : ""}` : payload.severity || null;
    case "disease_sighting":
      return payload.disease ? `${payload.disease}${payload.severity ? ` · ${payload.severity}` : ""}` : payload.severity || null;
    case "pest_treatment":
      return payload.target_pest ? `${payload.target_pest}${payload.method ? ` · ${payload.method.replace(/_/g, " ")}` : ""}` : payload.method?.replace(/_/g, " ") || null;
    case "disease_treatment":
      return payload.target_disease ? `${payload.target_disease}${payload.method ? ` · ${payload.method.replace(/_/g, " ")}` : ""}` : payload.method?.replace(/_/g, " ") || null;
    case "weeding":
      return payload.method ? `${payload.method.replace(/_/g, " ")}${payload.area ? ` — ${payload.area}` : ""}` : payload.area || null;
    case "relocated":
      return payload.new_placement || null;
    case "soil_amended":
      return payload.trigger ? payload.trigger.replace(/_/g, " ") : null;
    case "transplanted":
      return payload.reason || null;
    case "rainfall":
      return payload.amount_mm ? `${payload.amount_mm}mm` : null;
    case "frost":
      return payload.severity || null;
    case "growth_measurement":
      return payload.metric ? `${payload.metric}: ${payload.value ?? "—"}${payload.unit ? ` ${payload.unit}` : ""}` : null;
    case "soil_test":
      return payload.ph != null
        ? `pH ${payload.ph}${payload.moisture_pct != null ? `, ${payload.moisture_pct}% moisture` : ""}`
        : payload.moisture_pct != null ? `${payload.moisture_pct}% moisture` : payload.method || null;
    case "weather_protection":
      return payload.action
        ? `${payload.action.replace(/_/g, " ")}${payload.trigger ? ` — ${payload.trigger}` : ""}`
        : payload.trigger || null;
    case "germination":
      return payload.days_to_germinate
        ? `Germinated in ${payload.days_to_germinate}d${payload.germination_rate ? `, ${payload.germination_rate}% rate` : ""}`
        : payload.germination_rate ? `${payload.germination_rate}% germination rate` : null;
    case "thinning":
      return payload.removed_count
        ? `Removed ${payload.removed_count}${payload.reason ? ` — ${payload.reason}` : ""}`
        : payload.reason || null;
    default:
      return null;

  }
}

/** Human-readable label for an event's subject, for the recent-log list. */
export function labelForEntity(event, plantings, containers) {
    if (event.entity_type === "garden") return "Garden";
    if (event.entity_type === "container") {
    const container = containers.find((item) => item.id === event.entity_id);
    if (!container) return "Unknown container";
    const typedName = [container.material, container.type, "container"].filter(Boolean).join(" ");
    return typedName || container.name || "Unknown container";
  }
  return plantings.find((planting) => planting.id === event.entity_id)?.nickname || "Unknown planting";
}

/**
 * Builds one or more ready-to-persist events from the manual log-entry
 * form. `targetIds` are planting ids for planting-scoped types, container
 * ids for container-scoped types, and ignored for garden-scoped types
 * (which always produce exactly one event against the garden itself).
 */
export function buildManualEvents({ eventType, gardenId, targetIds = [], payload = {}, note, media }) {
  const meta = EVENT_TYPES[eventType];
  const scope = scopeOf(eventType);
  const base = {
    category: meta?.category || "observation",
    source: "self",
    event_type: eventType,
    payload,
    note: note || undefined,
    media: media?.length ? media : undefined,
    confidence: "observed",
  };

  if (scope === "garden") {
    return [{
      id: uid("evt"), timestamp: new Date().toISOString(), garden_id: gardenId,
      entity_type: "garden", entity_id: gardenId, ...base,
    }];
  }

  const entityType = scope === "container" ? "container" : "planting";
  return targetIds.map((id) => ({
    id: uid("evt"), timestamp: new Date().toISOString(), garden_id: gardenId,
    entity_type: entityType, entity_id: id, ...base,
  }));
}
