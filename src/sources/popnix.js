import { fetchJson } from "../services/http.js";
import { numberOrNull, statusFromSituation, textOrNull, trendFromDelta, withFreshness } from "../services/normalize.js";

const BASE_URL = "https://flood.pop.in.th";

export async function collectPopnix() {
  const [overview, river, rain, roads, districts] = await Promise.all([
    fetchJson(`${BASE_URL}/api_overview.php`),
    fetchJson(`${BASE_URL}/api_river.php`),
    fetchJson(`${BASE_URL}/api_rain.php`),
    fetchJson(`${BASE_URL}/api_roads.php`),
    fetchJson(`${BASE_URL}/data/districts.json`)
  ]);

  const fetchedAt = new Date().toISOString();
  const districtOf = buildBangkokDistrictLookup(districts.data);
  const stations = [
    ...normalizeOverview(overview, fetchedAt, districtOf),
    ...normalizeRiver(river, fetchedAt),
    ...normalizeRain(rain, fetchedAt),
    ...normalizeRoads(roads, fetchedAt)
  ];

  return {
    source: buildSourceSummary("POPNIX Flood", `${BASE_URL}/api/`, [overview, river, rain, roads]),
    stations,
    alerts: []
  };
}

function normalizeOverview(result, fallbackFetchedAt, districtOf) {
  if (!result.ok || !Array.isArray(result.data?.stations)) return [];
  return result.data.stations.map((item) => withFreshness({
    station_id: textOrNull(item.id ?? item.code ?? item.oldcode),
    station_name: textOrNull(item.name),
    province: "กรุงเทพฯ",
    district: textOrNull(item.district) ?? districtOf(numberOrNull(item.lat), numberOrNull(item.lng)),
    latitude: numberOrNull(item.lat),
    longitude: numberOrNull(item.lng),
    water_level: numberOrNull(item.wl),
    bank_level: numberOrNull(item.bank),
    water_gap_to_bank: gapFromLevels(item),
    flow_rate: null,
    rainfall_1h: null,
    rainfall_3h: null,
    rainfall_24h: null,
    trend: trendFromPopnix(item.trend ?? item.delta),
    status: statusFromPopnixLevel(item.level ?? item.situation),
    category: "Canal",
    source: "POPNIX Flood",
    source_name: "POPNIX Flood",
    source_url: `${BASE_URL}/api_overview.php`,
    source_type: "sensor",
    observed_at: toIso(item.measured_at),
    fetched_at: result.fetchedAt ?? fallbackFetchedAt,
    source_updated_at: toIso(result.data?.summary?.latest ?? item.measured_at),
    attribution_text: "ข้อมูล: สำนักการระบายน้ำ กรุงเทพมหานคร ผ่าน POPNIX Flood (flood.pop.in.th)",
    raw_status_label: item.level ?? item.situation ?? null
  }));
}

function normalizeRiver(result, fallbackFetchedAt) {
  if (!result.ok || !Array.isArray(result.data?.stations)) return [];
  return result.data.stations.map((item) => withFreshness({
    station_id: textOrNull(item.code ?? item.oldcode),
    station_name: textOrNull(item.name),
    province: null,
    district: null,
    latitude: numberOrNull(item.lat),
    longitude: numberOrNull(item.lng),
    water_level: numberOrNull(item.wl),
    bank_level: numberOrNull(item.bank),
    water_gap_to_bank: numberOrNull(item.diff),
    flow_rate: numberOrNull(item.flow),
    rainfall_1h: null,
    rainfall_3h: null,
    rainfall_24h: null,
    trend: trendFromPopnix(item.trend ?? item.delta),
    status: statusFromPopnixLevel(item.level ?? item.situation),
    category: "River",
    source: "POPNIX Flood",
    source_name: "POPNIX Flood",
    source_url: `${BASE_URL}/api_river.php`,
    source_type: "sensor",
    observed_at: toIso(item.measured_at),
    fetched_at: result.fetchedAt ?? fallbackFetchedAt,
    source_updated_at: toIso(result.data?.summary?.latest ?? item.measured_at),
    attribution_text: "POPNIX Flood Open Data",
    raw_status_label: item.situation ?? null
  }));
}

function normalizeRain(result, fallbackFetchedAt) {
  const rows = Array.isArray(result.data?.stations) ? result.data.stations : [];
  return rows.map((item) => withFreshness({
    station_id: textOrNull(item.code ?? item.oldcode),
    station_name: textOrNull(item.name),
    province: null,
    district: null,
    latitude: numberOrNull(item.lat),
    longitude: numberOrNull(item.lng),
    water_level: null,
    bank_level: null,
    water_gap_to_bank: null,
    flow_rate: null,
    rainfall_1h: numberOrNull(item.rain1h ?? item.rain_1h),
    rainfall_3h: numberOrNull(item.rain3h ?? item.rain_3h),
    rainfall_24h: numberOrNull(item.rain24h ?? item.rain_24h ?? item.rain),
    trend: null,
    status: statusFromPopnixLevel(item.level ?? item.situation),
    category: "Rain",
    source: "POPNIX Flood",
    source_name: "POPNIX Flood",
    source_url: `${BASE_URL}/api_rain.php`,
    source_type: "rain",
    observed_at: toIso(item.measured_at),
    fetched_at: result.fetchedAt ?? fallbackFetchedAt,
    source_updated_at: toIso(result.data?.summary?.latest ?? item.measured_at),
    attribution_text: "POPNIX Flood Open Data"
  }));
}

function normalizeRoads(result, fallbackFetchedAt) {
  const rows = Array.isArray(result.data?.roads) ? result.data.roads : Array.isArray(result.data?.stations) ? result.data.stations : [];
  return rows.map((item) => withFreshness({
    station_id: textOrNull(item.id ?? item.code ?? item.name),
    station_name: textOrNull(item.name ?? item.road),
    province: "กรุงเทพฯ",
    district: textOrNull(item.district),
    latitude: numberOrNull(item.lat),
    longitude: numberOrNull(item.lng),
    water_level: numberOrNull(item.depth),
    bank_level: null,
    water_gap_to_bank: null,
    flow_rate: null,
    rainfall_1h: null,
    rainfall_3h: null,
    rainfall_24h: null,
    trend: null,
    status: statusFromPopnixLevel(item.level ?? item.situation),
    category: "Road Flood",
    source: "POPNIX Flood",
    source_name: "POPNIX Flood",
    source_url: `${BASE_URL}/api_roads.php`,
    source_type: "road_flood",
    observed_at: toIso(item.measured_at ?? item.updated_at),
    fetched_at: result.fetchedAt ?? fallbackFetchedAt,
    source_updated_at: toIso(result.data?.summary?.latest ?? item.measured_at ?? item.updated_at),
    attribution_text: "POPNIX Flood Open Data"
  }));
}

function statusFromPopnixLevel(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "crit" || text === "critical" || text === "flood") return "critical";
  if (text === "warn" || text === "warning" || text === "slight") return "watch";
  if (text === "ok" || text === "dry" || text === "normal") return "normal";
  if (text === "unk" || text === "none" || text === "off") return "no_data";
  return statusFromSituation(value);
}

function trendFromPopnix(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "up") return "rising";
  if (text === "down") return "falling";
  if (text === "flat") return "flat";
  return trendFromDelta(value);
}

function gapFromLevels(item) {
  const diff = numberOrNull(item.diff);
  if (diff !== null) return diff;
  const waterLevel = numberOrNull(item.wl);
  const bankLevel = numberOrNull(item.bank);
  return waterLevel !== null && bankLevel !== null ? waterLevel - bankLevel : null;
}

function buildBangkokDistrictLookup(districtData) {
  const projection = districtData?.p;
  const districts = Array.isArray(districtData?.d) ? districtData.d.map((district) => ({
    name: textOrNull(district.th),
    rings: Array.isArray(district.r) ? district.r.filter(Array.isArray) : []
  })).filter((district) => district.name && district.rings.length) : [];

  if (!projection || !Number.isFinite(projection.lng0) || !Number.isFinite(projection.lat0) ||
      !Number.isFinite(projection.kx) || !Number.isFinite(projection.ky) || !districts.length) {
    return () => null;
  }

  const prepared = districts.map((district) => ({
    ...district,
    bounds: ringBounds(district.rings)
  }));

  return (lat, lng) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const x = (lng - projection.lng0) * projection.kx;
    const y = (projection.lat0 - lat) * projection.ky;

    for (const district of prepared) {
      const [minX, minY, maxX, maxY] = district.bounds;
      if (x < minX || x > maxX || y < minY || y > maxY) continue;
      if (district.rings.some((ring) => inRing(x, y, ring))) return district.name;
    }
    return null;
  };
}

function ringBounds(rings) {
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (const ring of rings) {
    for (let index = 0; index < ring.length; index += 2) {
      bounds[0] = Math.min(bounds[0], ring[index]);
      bounds[1] = Math.min(bounds[1], ring[index + 1]);
      bounds[2] = Math.max(bounds[2], ring[index]);
      bounds[3] = Math.max(bounds[3], ring[index + 1]);
    }
  }
  return bounds;
}

function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i];
    const yi = ring[i + 1];
    const xj = ring[j];
    const yj = ring[j + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function buildSourceSummary(name, url, results) {
  const ok = results.some((result) => result.ok);
  const latest = results
    .map((result) => result.data?.summary?.latest ?? result.data?.summary?.generated ?? result.fetchedAt)
    .filter(Boolean)
    .map(toIso)
    .filter(Boolean)
    .sort()
    .at(-1);

  return {
    name,
    url,
    type: "sensor",
    ok,
    fetched_at: new Date().toISOString(),
    source_updated_at: latest,
    error: ok ? null : results.map((result) => result.error).filter(Boolean).join("; ")
  };
}

function toIso(value) {
  if (!value) return null;
  const normalized = String(value).replace(" ", "T");
  const parsed = Date.parse(normalized.includes("+") || normalized.endsWith("Z") ? normalized : `${normalized}+07:00`);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}
