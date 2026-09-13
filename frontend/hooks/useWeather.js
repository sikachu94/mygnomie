import { useState, useEffect, useCallback } from "react";
import { GARDEN_ID } from "../lib/seedData.js";
import { uid } from "../lib/format.js";
import { buildManualEvents } from "../lib/events.js";

export function useWeather({ garden, events, addEvent, updateGardenAndPersist }) {
  const [weather, setWeather] = useState(null);
  const [weatherError, setWeatherError] = useState(null);
  const [locating, setLocating] = useState(false);
  const [weatherTick, setWeatherTick] = useState(0);
  // { severity: "light" | "hard" } once today's frost has been auto-logged
  // and nobody's said whether anything got covered — cleared by
  // logWeatherProtection or dismissFrostPrompt.
  const [frostPrompt, setFrostPrompt] = useState(null);

  useEffect(() => {
    if (!garden?.location) return;
    let cancelled = false;
    (async () => {
      try {
        const { lat, lng } = garden.location;
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,precipitation,weather_code&daily=precipitation_sum,temperature_2m_min,temperature_2m_max&timezone=auto`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("weather fetch failed");
        const data = await res.json();
        if (cancelled) return;
        setWeather(data);
        setWeatherError(null);
        const todayKey = new Date().toDateString();
        const alreadyRain = events.some((ev) => ev.entity_type === "garden" && ev.event_type === "rainfall" && new Date(ev.timestamp).toDateString() === todayKey);
        const alreadyFrost = events.some((ev) => ev.entity_type === "garden" && ev.event_type === "frost" && new Date(ev.timestamp).toDateString() === todayKey);
        const precipToday = data.daily?.precipitation_sum?.[0];
        const minTemp = data.daily?.temperature_2m_min?.[0];
        const auto = [];
        if (!alreadyRain && typeof precipToday === "number" && precipToday > 0.5) {
          auto.push({ id: uid("evt"), timestamp: new Date().toISOString(), garden_id: GARDEN_ID, entity_type: "garden", entity_id: GARDEN_ID, category: "measurement", source: "external", event_type: "rainfall", payload: { amount_mm: precipToday }, confidence: "observed" });
        }
        if (!alreadyFrost && typeof minTemp === "number" && minTemp < 0) {
          const severity = minTemp < -3 ? "hard" : "light";
          auto.push({ id: uid("evt"), timestamp: new Date().toISOString(), garden_id: GARDEN_ID, entity_type: "garden", entity_id: GARDEN_ID, category: "observation", source: "external", event_type: "frost", payload: { severity }, confidence: "observed" });
          setFrostPrompt({ severity });
        }
        if (auto.length) addEvent(auto);
      } catch (err) {
        if (!cancelled) setWeatherError("Couldn't fetch weather right now.");
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [garden, weatherTick]);

  const setGardenLocation = useCallback((loc) => {
    updateGardenAndPersist({ location: { lat: loc.lat, lng: loc.lng }, label: loc.label });
    setWeather(null);
  }, [updateGardenAndPersist]);

  const clearGardenLocation = useCallback(() => {
    updateGardenAndPersist({ location: null, label: null });
    setWeather(null);
  }, [updateGardenAndPersist]);

  const useMyLocation = useCallback(() => {
    if (!navigator.geolocation) { setWeatherError("Location isn't available in this browser — pick a city instead."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLocating(false); setGardenLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: "Current location" }); },
      () => { setLocating(false); setWeatherError("Couldn't get your location — pick a city instead."); },
      { timeout: 8000 }
    );
  }, [setGardenLocation]);

  const refresh = useCallback(() => setWeatherTick((t) => t + 1), []);
  const reset = useCallback(() => { setWeather(null); setWeatherError(null); }, []);

  /**
   * Logs a weather_protection event (container-scoped) for each selected
   * container, then dismisses the prompt. `action` is one of "covered" |
   * "moved_indoors" | "shade_provided". Uses garden.id (the real Supabase
   * id) rather than the seedData GARDEN_ID constant, since these events
   * need to pass ownership verification against the caller's actual garden.
   */
  const logWeatherProtection = useCallback(async (containerIds, action) => {
    if (!containerIds?.length || !garden?.id) return;
    const built = buildManualEvents({
      eventType: "weather_protection",
      gardenId: garden.id,
      targetIds: containerIds,
      payload: { action, trigger: "frost" },
    });
    await addEvent(built);
    setFrostPrompt(null);
  }, [addEvent, garden]);

  const dismissFrostPrompt = useCallback(() => setFrostPrompt(null), []);

  return {
    weather, weatherError, locating, frostPrompt,
    setGardenLocation, clearGardenLocation, useMyLocation,
    logWeatherProtection, dismissFrostPrompt,
    refresh, reset,
  };
}