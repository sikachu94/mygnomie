import { labelForEntity, labelForEventType } from "./events.js";

// Category -> andon color, matching the app's existing moss/gold/clay palette.
// Lifecycle events don't have an existing accent color in styles.css, so this
// introduces one (--grey) rather than repurposing an unrelated hue.
export const CATEGORY_COLORS = {
  action: "var(--moss)",
  measurement: "var(--gold)",
  observation: "var(--clay)",
  lifecycle: "var(--grey)",
};

export const CATEGORY_LABELS = {
  action: "Action",
  measurement: "Measurement",
  observation: "Observation",
  lifecycle: "Lifecycle",
};

export const CATEGORIES = ["action", "measurement", "observation", "lifecycle"];

// "Something's wrong" event types the andon board tracks.
const ISSUE_EVENT_TYPES = ["pest_sighting", "disease_sighting", "frost"];

// Pairs each issue type with the event type that resolves it. frost has no
// counterpart yet (weather_protection is a future addition) so it keeps the
// old "most recent sighting is always open" behavior; pest/disease sightings
// now close once a matching treatment postdates them.
const TREATMENT_EVENT_TYPE_BY_ISSUE = {
  pest_sighting: "pest_treatment",
  disease_sighting: "disease_treatment",
};

// Below this run length, same-type entries just render individually —
// the "3 waterings" example in the brief implies 1-2 in a row isn't noise yet.
const COLLAPSE_THRESHOLD = 3;

/** Distinct plant/container subjects referenced by events, for the filter chip row. */
export function buildSubjectFacets(events, plantings, containers) {
  const seen = new Map();
  for (const event of events) {
    if (event.entity_type === "garden") continue; // weather isn't a "subject" to filter by
    const key = `${event.entity_type}:${event.entity_id}`;
    if (seen.has(key)) continue;
    seen.set(key, { key, name: labelForEntity(event, plantings, containers) });
  }
  return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Most recent pest/disease/frost event per (entity, event_type) — the andon
 * board — minus any that have since been treated. An issue is "open" only
 * while its latest sighting is newer than the latest matching treatment for
 * that same entity; if a treatment postdates the sighting, it's dropped from
 * the list. Same "most recent wins" pattern used throughout projections.js,
 * just checked against two event types instead of one.
 */
export function findOpenIssues(events) {
  const latestByKey = new Map();
  for (const event of events) {
    if (!ISSUE_EVENT_TYPES.includes(event.event_type)) continue;
    const key = `${event.entity_type}:${event.entity_id}:${event.event_type}`;
    const existing = latestByKey.get(key);
    if (!existing || new Date(event.timestamp) > new Date(existing.timestamp)) {
      latestByKey.set(key, event);
    }
  }

  const openIssues = [];
  for (const issue of latestByKey.values()) {
    const treatmentType = TREATMENT_EVENT_TYPE_BY_ISSUE[issue.event_type];
    if (treatmentType) {
      const treated = events.some(
        (e) =>
          e.event_type === treatmentType &&
          e.entity_type === issue.entity_type &&
          e.entity_id === issue.entity_id &&
          new Date(e.timestamp) > new Date(issue.timestamp)
      );
      if (treated) continue;
    }
    openIssues.push(issue);
  }
  return openIssues.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

/**
 * @param {object} filters { subjectKey, category, hasPhoto, query }
 * subjectKey/category of "all" (or falsy) means "no filter on this facet".
 */
export function matchesFilters(event, filters, plantings, containers) {
  const { subjectKey, category, hasPhoto, query } = filters;

  if (subjectKey && subjectKey !== "all") {
    if (`${event.entity_type}:${event.entity_id}` !== subjectKey) return false;
  }
  if (category && category !== "all" && event.category !== category) return false;
  if (hasPhoto && !(event.media && event.media.length)) return false;

  if (query && query.trim()) {
    const q = query.trim().toLowerCase();
    const haystack = [
      labelForEntity(event, plantings, containers),
      labelForEventType(event.event_type),
      event.event_type,
      event.note,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(q)) return false;
  }

  return true;
}

/**
 * Walks a timestamp-sorted (newest-first) list and clusters consecutive
 * routine entries sharing the same subject + event type once a run is long
 * enough to be visual noise. Issue-type events are never collapsed — those
 * are exactly the abnormalities the timeline is supposed to surface.
 * Returns a list of { type: "single", item } | { type: "cluster", items, key }.
 */
export function clusterRoutineEvents(items) {
  const out = [];
  let i = 0;
  while (i < items.length) {
    const current = items[i];
    let j = i + 1;
    while (
      j < items.length &&
      items[j].event_type === current.event_type &&
      items[j].entity_id === current.entity_id &&
      !ISSUE_EVENT_TYPES.includes(items[j].event_type)
    ) {
      j++;
    }
    const run = items.slice(i, j);
    if (run.length >= COLLAPSE_THRESHOLD && !ISSUE_EVENT_TYPES.includes(current.event_type)) {
      out.push({ type: "cluster", items: run, key: `${current.entity_id}-${current.event_type}-${current.id}` });
    } else {
      for (const item of run) out.push({ type: "single", item });
    }
    i = j;
  }
  return out;
}

/** Groups an already-filtered, newest-first list by subject. */
export function groupByPlant(events, plantings, containers) {
  const groups = new Map();
  for (const event of events) {
    const label = labelForEntity(event, plantings, containers);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(event);
  }
  return Array.from(groups.entries())
    .map(([label, items]) => ({ label, items }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Groups an already-filtered, newest-first list by event type, busiest first. */
export function groupByType(events) {
  const groups = new Map();
  for (const event of events) {
    const label = labelForEventType(event.event_type);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(event);
  }
  return Array.from(groups.entries())
    .map(([label, items]) => ({ label, items }))
    .sort((a, b) => b.items.length - a.items.length);
}
