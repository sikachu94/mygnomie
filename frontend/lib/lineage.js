/**
 * Reads propagation lineage straight off planting_setup's optional
 * source_planting_id — no new event type, same fold-over-events pattern as
 * projections.js. Only meaningful for cutting/division/sown_self plantings,
 * but works for anything that happens to carry the field.
 */
export function getParentPlanting(planting, plantings, events) {
  const setup = events.find(
    (e) => e.entity_type === "planting" && e.entity_id === planting.id && e.event_type === "planting_setup"
  );
  const sourceId = setup?.payload?.source_planting_id;
  return sourceId ? plantings.find((p) => p.id === sourceId) || null : null;
}

export function getChildPlantings(planting, plantings, events) {
  return plantings.filter((p) => {
    const setup = events.find(
      (e) => e.entity_type === "planting" && e.entity_id === p.id && e.event_type === "planting_setup"
    );
    return setup?.payload?.source_planting_id === planting.id;
  });
}