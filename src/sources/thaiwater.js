import { fetchJson } from "../services/http.js";
import { isTargetProvince, normalizeProvince, numberOrNull, statusFromSituation, textOrNull, trendFromDelta, withFreshness } from "../services/normalize.js";

const BASE_URL = "https://api-v3.thaiwater.net/api/v1/thaiwater30/public";
const SOURCE_NAME = "สถาบันสารสนเทศทรัพยากรน้ำ";

export async function collectThaiWater() {
  const [waterlevel, rain, flow] = await Promise.all([
    fetchJson(`${BASE_URL}/waterlevel_load`, { headers: { referer: "https://www.thaiwater.net/" } }),
    fetchJson(`${BASE_URL}/rain_24h`, { headers: { referer: "https://www.thaiwater.net/" } }),
    fetchJson(`${BASE_URL}/flow`, { headers: { referer: "https://www.thaiwater.net/" } })
  ]);

  const stations = [
    ...normalizeWaterlevel(waterlevel),
    ...normalizeRain(rain),
    ...normalizeFlow(flow)
  ];

  return {
    source: buildSourceSummary(SOURCE_NAME, "https://www.thaiwater.net/", [waterlevel, rain, flow]),
    stations,
    overbank_stations: normalizeOverbankWaterlevel(waterlevel),
    alerts: []
  };
}

function normalizeWaterlevel(result) {
  const rows = Array.isArray(result.data?.waterlevel_data?.data) ? result.data.waterlevel_data.data : [];
  return rows
    .filter((item) => isTargetProvince(item.geocode?.province_name?.th))
    .map((item) => withFreshness({
      station_id: textOrNull(item.station?.tele_station_oldcode ?? item.station?.id ?? item.id),
      station_name: textOrNull(item.station?.tele_station_name?.th),
      province: normalizeProvince(item.geocode?.province_name?.th),
      district: textOrNull(item.geocode?.amphoe_name?.th),
      latitude: numberOrNull(item.station?.tele_station_lat),
      longitude: numberOrNull(item.station?.tele_station_long),
      water_level: numberOrNull(item.waterlevel_msl ?? item.waterlevel_m),
      bank_level: null,
      water_gap_to_bank: null,
      flow_rate: numberOrNull(item.flow_rate ?? item.discharge),
      rainfall_1h: null,
      rainfall_3h: null,
      rainfall_24h: null,
      trend: trendFromDelta(numberOrNull(item.waterlevel_msl) - numberOrNull(item.waterlevel_msl_previous)),
      status: statusFromSituation(item.situation_level),
      category: "River",
      source: SOURCE_NAME,
      source_name: SOURCE_NAME,
      source_url: `${BASE_URL}/waterlevel_load`,
      source_type: "sensor",
      observed_at: toIso(item.waterlevel_datetime),
      fetched_at: result.fetchedAt,
      source_updated_at: toIso(item.waterlevel_datetime),
      attribution_text: "สถาบันสารสนเทศทรัพยากรน้ำ public API"
    }));
}

function normalizeOverbankWaterlevel(result) {
  const rows = Array.isArray(result.data?.waterlevel_data?.data) ? result.data.waterlevel_data.data : [];
  return rows
    .filter((item) => String(item.diff_wl_bank_text ?? "").startsWith("ล้นตลิ่ง"))
    .map((item) => withFreshness({
      station_id: textOrNull(item.station?.tele_station_oldcode ?? item.station?.id ?? item.id),
      station_name: textOrNull(item.station?.tele_station_name?.th),
      province: normalizeProvince(item.geocode?.province_name?.th),
      district: textOrNull(item.geocode?.amphoe_name?.th),
      latitude: numberOrNull(item.station?.tele_station_lat),
      longitude: numberOrNull(item.station?.tele_station_long),
      water_level: numberOrNull(item.waterlevel_msl ?? item.waterlevel_m),
      bank_level: numberOrNull(item.station?.min_bank ?? item.station?.left_bank ?? item.station?.right_bank),
      water_gap_to_bank: numberOrNull(item.diff_wl_bank),
      flow_rate: numberOrNull(item.flow_rate ?? item.discharge),
      rainfall_1h: null,
      rainfall_3h: null,
      rainfall_24h: null,
      trend: trendFromDelta(numberOrNull(item.waterlevel_msl) - numberOrNull(item.waterlevel_msl_previous)),
      status: "critical",
      category: "River",
      source: SOURCE_NAME,
      source_name: SOURCE_NAME,
      source_url: "https://twa.thaiwater.net/th/map/flash-flood/water-level/overall",
      source_type: "sensor",
      observed_at: toIso(item.waterlevel_datetime),
      fetched_at: result.fetchedAt,
      source_updated_at: toIso(item.waterlevel_datetime),
      attribution_text: `น้ำล้นตลิ่ง ${numberOrNull(item.diff_wl_bank) ?? "-"} ม.`
    }));
}

function normalizeRain(result) {
  const rows = Array.isArray(result.data?.data) ? result.data.data : [];
  return rows
    .filter((item) => isTargetProvince(item.geocode?.province_name?.th))
    .map((item) => withFreshness({
      station_id: textOrNull(item.station?.tele_station_oldcode ?? item.station?.id ?? item.id),
      station_name: textOrNull(item.station?.tele_station_name?.th),
      province: normalizeProvince(item.geocode?.province_name?.th),
      district: textOrNull(item.geocode?.amphoe_name?.th),
      latitude: numberOrNull(item.station?.tele_station_lat),
      longitude: numberOrNull(item.station?.tele_station_long),
      water_level: null,
      bank_level: null,
      water_gap_to_bank: null,
      flow_rate: null,
      rainfall_1h: null,
      rainfall_3h: null,
      rainfall_24h: numberOrNull(item.rain_24h),
      trend: null,
      status: "no_data",
      category: "Rain",
      source: SOURCE_NAME,
      source_name: SOURCE_NAME,
      source_url: `${BASE_URL}/rain_24h`,
      source_type: "rain",
      observed_at: toIso(item.rainfall_datetime),
      fetched_at: result.fetchedAt,
      source_updated_at: toIso(item.rainfall_datetime),
      attribution_text: "สถาบันสารสนเทศทรัพยากรน้ำ public API"
    }));
}

function normalizeFlow(result) {
  const rows = Array.isArray(result.data?.data) ? result.data.data : [];
  return rows
    .filter((item) => isTargetProvince(item.geocode?.province_name?.th))
    .map((item) => withFreshness({
      station_id: textOrNull(item.station?.flow_oldcode ?? item.station?.id ?? item.id),
      station_name: textOrNull(item.station?.flow_name?.th),
      province: normalizeProvince(item.geocode?.province_name?.th),
      district: textOrNull(item.geocode?.amphoe_name?.th),
      latitude: numberOrNull(item.station?.flow_lat),
      longitude: numberOrNull(item.station?.flow_long),
      water_level: null,
      bank_level: null,
      water_gap_to_bank: null,
      flow_rate: numberOrNull(item.flow_value),
      rainfall_1h: null,
      rainfall_3h: null,
      rainfall_24h: null,
      trend: null,
      status: "no_data",
      category: "Canal",
      source: SOURCE_NAME,
      source_name: SOURCE_NAME,
      source_url: `${BASE_URL}/flow`,
      source_type: "sensor",
      observed_at: toIso(item.flow_datetime),
      fetched_at: result.fetchedAt,
      source_updated_at: toIso(item.flow_datetime),
      attribution_text: "สถาบันสารสนเทศทรัพยากรน้ำ public API"
    }));
}

function buildSourceSummary(name, url, results) {
  const ok = results.some((result) => result.ok);
  const latest = results
    .flatMap((result) => {
      const rows = result.data?.waterlevel_data?.data ?? result.data?.data ?? [];
      return rows.map((row) => row.waterlevel_datetime ?? row.rainfall_datetime ?? row.flow_datetime);
    })
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
