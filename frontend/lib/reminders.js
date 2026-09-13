import { projectPlanting } from "./projections.js";
import { estimateSpeciesReference } from "./speciesEstimates.js";
import { fmtDate } from "./format.js";

const DAY_MS = 86400000;

export function buildReminders(plantings, events, weather) {
  const reminders = [];

  for (const planting of plantings) {
    const proj = projectPlanting(planting, events);
    if (proj.status === "ended") continue;
    const meta = estimateSpeciesReference(planting.species_info);
    if (!meta) continue;

    if (proj.stage === meta.target_stage) {
      reminders.push({
        planting_id: planting.id,
        nickname: planting.nickname,
        kind: "harvest",
        title: `${planting.nickname} is ready to harvest`,
        detail: `It's at the ${friendlyStage(proj.stage)} stage — pick when ripe.`,
      });
    }

    if (proj.last_watered_at) {
      const daysSinceWater = Math.floor((Date.now() - new Date(proj.last_watered_at).getTime()) / DAY_MS);
      const rainToday = weather?.daily?.precipitation_sum?.[0];
      const rainCovered = typeof rainToday === "number" && rainToday > 2;
      if (daysSinceWater >= meta.water_frequency_days && !rainCovered) {
        reminders.push({
          planting_id: planting.id,
          nickname: planting.nickname,
          kind: "water",
          title: `Water ${planting.nickname}`,
          detail: `Last watered ${fmtDate(proj.last_watered_at)} — about ${meta.water_frequency_days} days ago.`,
        });
      }
    } else {
      const age = proj.days_since_entry;
      if (age >= meta.water_frequency_days) {
        reminders.push({
          planting_id: planting.id,
          nickname: planting.nickname,
          kind: "water",
          title: `Water ${planting.nickname}`,
          detail: `No watering logged yet, and it's been ${age} days since planting.`,
        });
      }
    }

    if (proj.last_fertilized_at) {
      const daysSinceFeed = Math.floor((Date.now() - new Date(proj.last_fertilized_at).getTime()) / DAY_MS);
      if (daysSinceFeed >= meta.fertilize_frequency_days) {
        reminders.push({
          planting_id: planting.id,
          nickname: planting.nickname,
          kind: "fertilize",
          title: `Feed ${planting.nickname}`,
          detail: `Last fed ${fmtDate(proj.last_fertilized_at)} — about ${daysSinceFeed} days ago.`,
        });
      }
    } else {
      const age = proj.days_since_entry;
      if (age >= meta.fertilize_frequency_days) {
        reminders.push({
          planting_id: planting.id,
          nickname: planting.nickname,
          kind: "fertilize",
          title: `Feed ${planting.nickname}`,
          detail: `No feeding logged yet, and it's been ${age} days since planting.`,
        });
      }
    }

    if (meta.flowering_signal === "decline_warning" && proj.stage === "flowering") {
      reminders.push({
        planting_id: planting.id,
        nickname: planting.nickname,
        kind: "harvest",
        title: `Harvest ${planting.nickname} soon`,
        detail: `It's flowering, which means it's about to bolt. Harvest the leaves now.`,
      });
    }

    if (proj.open_issue) {
      const pest = proj.open_issue.payload?.pest || proj.open_issue.payload?.disease;
      const daysSince = Math.floor((Date.now() - new Date(proj.open_issue.timestamp).getTime()) / DAY_MS);
      reminders.push({
        planting_id: planting.id,
        nickname: planting.nickname,
        kind: "issue",
        title: `Check ${planting.nickname} for ${pest || "a problem"}`,
        detail: `Spotted ${daysSince} day${daysSince === 1 ? "" : "s"} ago, ${proj.open_issue.payload?.severity || "unspecified"} severity — no treatment logged yet.`,
      });
    }
  }

  const order = { issue: 0, harvest: 1, water: 2, fertilize: 3 };
  return reminders.sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9));
}

/**
 * Returns the single planting a one-tap quick action ("Water") should
 * target: whichever plant buildReminders would flag first (issue > harvest
 * > water > fertilize, its existing priority order). If nothing is
 * currently flagged, falls back to whichever active planting has gone
 * longest without a watering log — never surfaces an ended planting.
 */
export function pickPriorityPlanting(plantings, events, weather) {
  const reminders = buildReminders(plantings, events, weather);
  if (reminders.length) {
    return plantings.find((p) => p.id === reminders[0].planting_id) || null;
  }

  const active = plantings.filter((p) => projectPlanting(p, events).status === "active");
  if (!active.length) return null;

  return [...active].sort((a, b) => {
    const aWatered = projectPlanting(a, events).last_watered_at;
    const bWatered = projectPlanting(b, events).last_watered_at;
    if (!aWatered && !bWatered) return 0;
    if (!aWatered) return -1; // never watered sorts first — most neglected
    if (!bWatered) return 1;
    return new Date(aWatered) - new Date(bWatered);
  })[0];
}

export function friendlyStage(stage) {
  const labels = {
    seed: "Seed",
    germinated: "Sprouted",
    seedling: "Seedling",
    vegetative: "Growing",
    budding: "Budding",
    flowering: "Flowering",
    fruiting: "Fruiting",
    seed_set: "Seeding",
    senescent: "Fading",
    dormant: "Dormant",
    mature: "Mature",
    unknown: "—",
  };
  return labels[stage] || stage;
}
