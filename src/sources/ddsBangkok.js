import { fetchJson } from "../services/http.js";
import { numberOrNull, statusFromText, textOrNull, withFreshness } from "../services/normalize.js";

const BASE_URL = "https://flood.bangkok.go.th/api";

export async function collectDdsBangkok() {
  const [water, rain, flood] = await Promise.all([
    fetchJson(`${BASE_URL}/mainwater/lastdata/0`),
    fetchJson(`${BASE_URL}/rain/threshold`),
    fetchJson(`${BASE_URL}/flood/threshold`)
  ]);

  const stations = [
    ...normalizeWater(water),
    ...normalizeRain(rain),
    ...normalizeFlood(flood)
  ];

  return {
    source: buildSourceSummary("สำนักการระบายน้ำ กรุงเทพมหานคร", "https://dds.bangkok.go.th/", [water, rain, flood]),
    stations,
    alerts: []
  };
}

function normalizeWater(result) {
  const rows = Array.isArray(result.data) ? result.data : [];
  return rows.map((item) => withFreshness({
    station_id: textOrNull(item.st_code),
    station_name: textOrNull(item.st_name),
    province: "กรุงเทพฯ",
    district: null,
    latitude: numberOrNull(item.latitude),
    longitude: numberOrNull(item.longitude),
    water_level: numberOrNull(item.wl_m ?? item.wl_in),
    bank_level: null,
    water_gap_to_bank: null,
    flow_rate: null,
    rainfall_1h: null,
    rainfall_3h: null,
    rainfall_24h: null,
    trend: null,
    status: statusFromText(item.status),
    category: "Canal",
    source: "สำนักการระบายน้ำ กรุงเทพมหานคร",
    source_name: "สำนักการระบายน้ำ กรุงเทพมหานคร",
    source_url: `${BASE_URL}/mainwater/lastdata/0`,
    source_type: "sensor",
    observed_at: toIso(item.site_time),
    fetched_at: result.fetchedAt,
    source_updated_at: toIso(item.site_time),
    attribution_text: "สำนักการระบายน้ำ กรุงเทพมหานคร"
  }));
}

function normalizeRain(result) {
  const rows = Array.isArray(result.data) ? result.data : [];
  return rows.map((item) => withFreshness({
    station_id: textOrNull(item.st_code ?? item.id),
    station_name: textOrNull(item.st_name ?? item.name),
    province: "กรุงเทพฯ",
    district: null,
    latitude: numberOrNull(item.latitude ?? item.lat),
    longitude: numberOrNull(item.longitude ?? item.lng),
    water_level: null,
    bank_level: null,
    water_gap_to_bank: null,
    flow_rate: null,
    rainfall_1h: numberOrNull(item.rain_1h ?? item.rain1h),
    rainfall_3h: numberOrNull(item.rain_3h ?? item.rain3h),
    rainfall_24h: numberOrNull(item.rain_24h ?? item.rain24h),
    trend: null,
    status: statusFromText(item.status),
    category: "Rain",
    source: "สำนักการระบายน้ำ กรุงเทพมหานคร",
    source_name: "สำนักการระบายน้ำ กรุงเทพมหานคร",
    source_url: `${BASE_URL}/rain/threshold`,
    source_type: "rain",
    observed_at: toIso(item.site_time ?? item.datetime),
    fetched_at: result.fetchedAt,
    source_updated_at: toIso(item.site_time ?? item.datetime),
    attribution_text: "สำนักการระบายน้ำ กรุงเทพมหานคร"
  }));
}

function normalizeFlood(result) {
  const rows = Array.isArray(result.data) ? result.data : [];
  return rows.map((item) => withFreshness({
    station_id: textOrNull(item.id ?? item.st_code ?? item.name),
    station_name: textOrNull(item.name ?? item.st_name),
    province: "กรุงเทพฯ",
    district: textOrNull(item.district),
    latitude: numberOrNull(item.latitude ?? item.lat),
    longitude: numberOrNull(item.longitude ?? item.lng),
    water_level: numberOrNull(item.depth),
    bank_level: null,
    water_gap_to_bank: null,
    flow_rate: null,
    rainfall_1h: null,
    rainfall_3h: null,
    rainfall_24h: null,
    trend: null,
    status: statusFromText(item.status),
    category: "Road Flood",
    source: "สำนักการระบายน้ำ กรุงเทพมหานคร",
    source_name: "สำนักการระบายน้ำ กรุงเทพมหานคร",
    source_url: `${BASE_URL}/flood/threshold`,
    source_type: "road_flood",
    observed_at: toIso(item.site_time ?? item.datetime),
    fetched_at: result.fetchedAt,
    source_updated_at: toIso(item.site_time ?? item.datetime),
    attribution_text: "สำนักการระบายน้ำ กรุงเทพมหานคร"
  }));
}

function buildSourceSummary(name, url, results) {
  const ok = results.some((result) => result.ok);
  const latest = results
    .flatMap((result) => Array.isArray(result.data) ? result.data : [])
    .map((row) => row.site_time ?? row.datetime)
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
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}
