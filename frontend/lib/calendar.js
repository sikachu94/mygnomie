import { projectPlanting } from "./projections.js";
import { estimateSpeciesReference } from "./speciesEstimates.js";

const DAY_MS = 86400000;

function toDateKey(value) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Date(value).toISOString().slice(0, 10);
}

function addDays(dateKey, days) {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateDifference(from, to) {
  return Math.floor((new Date(`${to}T12:00:00.000Z`) - new Date(`${from}T12:00:00.000Z`)) / DAY_MS);
}

function automaticTask(planting, type, dueDate, generatedFrom, today) {
  return {
    id: `calendar-${planting.id}-${type}`,
    garden_id: planting.garden_id,
    planting_id: planting.id,
    planting_name: planting.nickname,
    type,
    due_date: dueDate,
    status: "open",
    source: "automatic",
    generated_from: generatedFrom,
    created_at: `${today}T00:00:00.000Z`,
  };
}

function nextTask(planting, type, dueDate, generatedFrom, today) {
  return { ...automaticTask(planting, type, dueDate, generatedFrom, today), id: `calendar-${planting.id}-${type}-${dueDate}` };
}

export function generateCalendarTasks(plantings, events, existingTasks = [], today = toDateKey(new Date())) {
  const existingByKey = new Map(existingTasks.map((task) => [`${task.planting_id}:${task.type}`, task]));
  const generated = [];

  for (const planting of plantings) {
    const projection = projectPlanting(planting, events);
    if (projection.status === "ended") continue;
    const meta = estimateSpeciesReference(planting.species_info);
    if (!meta) continue;

    const wateringKey = `${planting.id}:watering`;
    const existingWatering = existingByKey.get(wateringKey);
    if (existingWatering) generated.push(existingWatering);
    if (!existingWatering || (existingWatering.status === "completed" && projection.last_watered_at && toDateKey(projection.last_watered_at) >= existingWatering.due_date)) {
      const baseDate = projection.last_watered_at ? toDateKey(projection.last_watered_at) : toDateKey(planting.started_at);
      const dueDate = addDays(baseDate, meta.water_frequency_days);
      generated.push(nextTask(planting, "watering", dueDate < today ? today : dueDate, "watering_cadence", today));
    }

    const fertilizeKey = `${planting.id}:fertilizing`;
    const existingFertilize = existingByKey.get(fertilizeKey);
    if (existingFertilize) generated.push(existingFertilize);
    if (!existingFertilize || (existingFertilize.status === "completed" && projection.last_fertilized_at && toDateKey(projection.last_fertilized_at) >= existingFertilize.due_date)) {
      const baseDate = projection.last_fertilized_at ? toDateKey(projection.last_fertilized_at) : toDateKey(planting.started_at);
      const dueDate = addDays(baseDate, meta.fertilize_frequency_days);
      generated.push(nextTask(planting, "fertilizing", dueDate < today ? today : dueDate, "fertilize_cadence", today));
    }

    const harvestKey = `${planting.id}:harvest`;
    const existingHarvest = existingByKey.get(harvestKey);
    if (existingHarvest) generated.push(existingHarvest);
    else if (projection.stage === meta.target_stage) {
      generated.push(nextTask(planting, "harvest", today, "target_stage", today));
    }
  }

  return generated;
}

export function getMonthDays(monthDate) {
  const year = monthDate.getUTCFullYear();
  const month = monthDate.getUTCMonth();
  const first = new Date(Date.UTC(year, month, 1));
  const startOffset = first.getUTCDay();
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(Date.UTC(year, month, 1 - startOffset + index));
    return {
      date: date.toISOString().slice(0, 10),
      day: date.getUTCDate(),
      inMonth: date.getUTCMonth() === month,
    };
  });
}

export function groupCalendarItems(tasks, events) {
  const grouped = {};
  const ensure = (date) => {
    if (!grouped[date]) grouped[date] = { tasks: [], events: [] };
    return grouped[date];
  };
  for (const task of tasks) ensure(toDateKey(task.due_date)).tasks.push(task);
  for (const event of events) ensure(toDateKey(event.timestamp)).events.push(event);
  return grouped;
}

export function shiftTaskDate(task, dueDate) {
  return { ...task, due_date: toDateKey(dueDate), status: "open" };
}

export function taskDaysFromToday(task, today = toDateKey(new Date())) {
  return dateDifference(today, task.due_date);
}
