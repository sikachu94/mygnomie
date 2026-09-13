import { useState, useEffect, useCallback } from "react";
import { uid } from "../lib/format.js";
import { buildManualEvents } from "../lib/events.js";

export function useWeather({ garden, events, addEvent, updateGardenAndPersist }) {
  const [weather, setWeather] = useState(null);
  const [weatherError, setWeatherError] = useState(null);
  const [locating, setLocating] = useState(false);
  const [weatherTick, setWeatherTick] = useState(0);
  // { trigger: "frost"|"heat"|"wind"|"hail", severity } — set whenever an
  // auto-logged weather event might call for a gardener response, cleared
  // by logWeatherProtection or dismissWeatherPrompt.
  const [weatherPrompt, setWeatherPrompt] = useState(null);

  useEffect(() => {
    if (!garden?.location) return;
    let cancelled = false;
    (async () => {
      try {
        const { lat, lng } = garden.location;
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,precipitation,weather_code&daily=precipitation_sum,temperature_2m_min,temperature_2m_max,windspeed_10m_max&timezone=auto`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("weather fetch failed");
        const data = await res.json();
        if (cancelled) return;
        setWeather(data);
        setWeatherError(null);

        const todayKey = new Date().toDateString();
        const loggedToday = (type, matchPayload) =>
          events.some(
            (ev) =>
              ev.entity_type === "garden" &&
              ev.event_type === type &&
              new Date(ev.timestamp).toDateString() === todayKey &&
              (!matchPayload || matchPayload(ev.payload))
          );

        const precipToday = data.daily?.precipitation_sum?.[0];
        const minTemp = data.daily?.temperature_2m_min?.[0];
        const maxTemp = data.daily?.temperature_2m_max?.[0];
        const maxWindKph = data.daily?.windspeed_10m_max?.[0];
        const weatherCode = data.current?.weather_code;
        const HAIL_CODES = new Set([96, 99]); // WMO: thunderstorm w/ slight or heavy hail

        const auto = [];
        let nextPrompt = null;

        if (!loggedToday("rainfall") && typeof precipToday === "number" && precipToday > 0.5) {
          auto.push({ id: uid("evt"), timestamp: new Date().toISOString(), garden_id: garden.id, entity_type: "garden", entity_id: garden.id, category: "measurement", source: "external", event_type: "rainfall", payload: { amount_mm: precipToday }, confidence: "observed" });
        }
        // Priority when several trigger the same day: heat, then wind, then
        // hail, then frost overwrites last — frost is usually the most
        // consequential for potted plants, so it wins the visible prompt.
        if (!loggedToday("weather_event", (p) => p.subtype === "heat") && typeof maxTemp === "number" && maxTemp >= 35) {
          const severity = maxTemp >= 40 ? "severe" : "moderate";
          auto.push({ id: uid("evt"), timestamp: new Date().toISOString(), garden_id: garden.id, entity_type: "garden", entity_id: garden.id, category: "observation", source: "external", event_type: "weather_event", payload: { subtype: "heat", severity, temp_c: maxTemp }, confidence: "observed" });
          nextPrompt = { trigger: "heat", severity };
        }
        if (!loggedToday("weather_event", (p) => p.subtype === "wind") && typeof maxWindKph === "number" && maxWindKph >= 50) {
          const severity = maxWindKph >= 80 ? "severe" : "moderate";
          auto.push({ id: uid("evt"), timestamp: new Date().toISOString(), garden_id: garden.id, entity_type: "garden", entity_id: garden.id, category: "observation", source: "external", event_type: "weather_event", payload: { subtype: "wind", severity, wind_kph: maxWindKph }, confidence: "observed" });
          nextPrompt = { trigger: "wind", severity };
        }
        if (!loggedToday("weather_event", (p) => p.subtype === "hail") && HAIL_CODES.has(weatherCode)) {
          auto.push({ id: uid("evt"), timestamp: new Date().toISOString(), garden_id: garden.id, entity_type: "garden", entity_id: garden.id, category: "observation", source: "external", event_type: "weather_event", payload: { subtype: "hail" }, confidence: "observed" });
          nextPrompt = { trigger: "hail", severity: null };
        }
        if (!loggedToday("frost") && typeof minTemp === "number" && minTemp < 0) {
          const severity = minTemp < -3 ? "hard" : "light";
          auto.push({ id: uid("evt"), timestamp: new Date().toISOString(), garden_id: garden.id, entity_type: "garden", entity_id: garden.id, category: "observation", source: "external", event_type: "frost", payload: { severity }, confidence: "observed" });
          nextPrompt = { trigger: "frost", severity };
        }

        if (nextPrompt) setWeatherPrompt(nextPrompt);
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

  const logWeatherProtection = useCallback(async (containerIds, action) => {
    if (!containerIds?.length || !garden?.id || !weatherPrompt) return;
    const built = buildManualEvents({
      eventType: "weather_protection",
      gardenId: garden.id,
      targetIds: containerIds,
      payload: { action, trigger: weatherPrompt.trigger },
    });
    await addEvent(built);
    setWeatherPrompt(null);
  }, [addEvent, garden, weatherPrompt]);

  const dismissWeatherPrompt = useCallback(() => setWeatherPrompt(null), []);

  return {
    weather, weatherError, locating, weatherPrompt,
    setGardenLocation, clearGardenLocation, useMyLocation,
    logWeatherProtection, dismissWeatherPrompt,
    refresh, reset,
  };
}