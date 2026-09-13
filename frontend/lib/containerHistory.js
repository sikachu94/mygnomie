import { projectPlanting } from "./projections.js";

/**
 * Every planting that has ever occupied this container, in arrival order,
 * derived entirely from planting_setup + transplanted events — the same
 * fold-over-events approach as projections.js, no new event type.
 */
export function buildContainerHistory(containerId, plantings, events) {
  const entries = [];

  for (const planting of plantings) {
    const own = events
      .filter((e) => e.entity_type === "planting" && e.entity_id === planting.id)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const setup = own.find((e) => e.event_type === "planting_setup");
    const transplants = own.filter((e) => e.event_type === "transplanted");
    const ended = [...own].reverse().find((e) => e.event_type === "planting_ended");

    const stints = [];
    const initialContainer = setup?.payload?.container_id;
    if (initialContainer) stints.push({ containerId: initialContainer, enteredAt: setup.timestamp || planting.started_at });

    for (const t of transplants) {
      if (stints.length) stints[stints.length - 1].leftAt = t.timestamp;
      const toContainer = t.payload?.to_container_id;
      if (toContainer) stints.push({ containerId: toContainer, enteredAt: t.timestamp });
    }

    const proj = projectPlanting(planting, events);
    for (const stint of stints) {
      if (stint.containerId !== containerId) continue;
      const isCurrentStint = !stint.leftAt;
      entries.push({
        planting,
        entered_at: stint.enteredAt,
        left_at: stint.leftAt || (isCurrentStint && ended ? ended.timestamp : null),
        exit_reason: isCurrentStint ? ended?.payload?.end_reason : "moved",
        harvest_count: proj.harvest_count,
        had_issue: !!proj.open_issue,
      });
    }
  }

  return entries.sort((a, b) => new Date(a.entered_at) - new Date(b.entered_at));
}