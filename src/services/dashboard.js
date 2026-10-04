import { collectBangkokNow } from "../sources/bangkokNow.js";
import { collectDdsBangkok } from "../sources/ddsBangkok.js";
import { collectDdpm } from "../sources/ddpm.js";
import { collectPopnix } from "../sources/popnix.js";
import { collectThaiWaterDailyReportHistory } from "../sources/thaiwaterDailyReport.js";
import { collectThaiWater } from "../sources/thaiwater.js";
import { collectThaiWaterTide } from "../sources/thaiwaterTide.js";
import { collectTmd } from "../sources/tmd.js";
import { uniqueByStation, withFreshness } from "./normalize.js";

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache = null;

export async function getDashboardData({ force = false } = {}) {
  const now = Date.now();
  if (!force && cache && now - cache.cachedAtMs < CACHE_TTL_MS) {
    return {
      ...cache.payload,
      cache: {
        ...cache.payload.cache,
        served_from_cache: true,
        cache_age_seconds: Math.round((now - cache.cachedAtMs) / 1000)
      }
    };
  }

  const collections = await Promise.allSettled([
    collectPopnix(),
    collectThaiWater(),
    collectDdsBangkok(),
    collectBangkokNow(),
    collectTmd(),
    collectDdpm(),
    collectThaiWaterDailyReportHistory(),
    collectThaiWaterTide()
  ]);

  const errors = [];
  const successful = collections.flatMap((result, index) => {
    if (result.status === "fulfilled") return [result.value];
    errors.push({ source: ["POPNIX", "สถาบันสารสนเทศทรัพยากรน้ำ", "DDS/BMA", "Bangkok NOW", "TMD", "DDPM", "สถาบันสารสนเทศทรัพยากรน้ำ daily report", "กรมอุทกศาสตร์ กองทัพเรือ"][index], error: result.reason?.message ?? "unknown_error" });
    return [];
  });

  const stations = uniqueByStation(successful.flatMap((item) => item.stations ?? []))
    .filter((station) => Number.isFinite(station.latitude) && Number.isFinite(station.longitude))
    .map(withFreshness);

  const alerts = successful.flatMap((item) => item.alerts ?? []).map(withFreshness);
  const sources = successful.map((item) => item.source).filter(Boolean);
  const weatherForecast = successful.find((item) => item.weather_forecast)?.weather_forecast ?? null;
  const tideForecast = successful.find((item) => item.tide_forecast)?.tide_forecast ?? null;
  const dischargeHistory = successful.find((item) => item.discharge_history)?.discharge_history ?? {};
  const officialProvinceSituation = successful.find((item) => item.province_situation)?.province_situation ?? null;
  const overbankStations = successful.flatMap((item) => item.overbank_stations ?? []).map(withFreshness);

  const payload = {
    generated_at: new Date().toISOString(),
    cache: {
      ttl_seconds: CACHE_TTL_MS / 1000,
      served_from_cache: false,
      cache_age_seconds: 0
    },
    overview: buildOverview(stations, sources),
    executive_summary: buildExecutiveSummary(stations, sources, dischargeHistory, officialProvinceSituation, overbankStations),
    weather_forecast: weatherForecast,
    tide_forecast: tideForecast,
    flow: buildFlow(stations),
    stations,
    alerts,
    sources,
    errors
  };

  cache = { cachedAtMs: now, payload };
  return payload;
}

const WATCH_STATUSES = new Set(["watch", "warning"]);
const PERIMETER_PROVINCES = new Set(["นนทบุรี", "ปทุมธานี", "สมุทรปราการ", "นครปฐม", "สมุทรสาคร"]);
const BANGKOK_DISTRICT_CENTROIDS = [
  { name: "พระนคร", lat: 13.756, lng: 100.497 },
  { name: "ดุสิต", lat: 13.782, lng: 100.517 },
  { name: "หนองจอก", lat: 13.855, lng: 100.862 },
  { name: "บางรัก", lat: 13.728, lng: 100.525 },
  { name: "บางเขน", lat: 13.873, lng: 100.596 },
  { name: "บางกะปิ", lat: 13.765, lng: 100.647 },
  { name: "ปทุมวัน", lat: 13.744, lng: 100.532 },
  { name: "ป้อมปราบศัตรูพ่าย", lat: 13.748, lng: 100.513 },
  { name: "พระโขนง", lat: 13.702, lng: 100.603 },
  { name: "มีนบุรี", lat: 13.813, lng: 100.731 },
  { name: "ลาดกระบัง", lat: 13.723, lng: 100.784 },
  { name: "ยานนาวา", lat: 13.696, lng: 100.543 },
  { name: "สัมพันธวงศ์", lat: 13.738, lng: 100.509 },
  { name: "พญาไท", lat: 13.78, lng: 100.542 },
  { name: "ธนบุรี", lat: 13.725, lng: 100.485 },
  { name: "บางกอกใหญ่", lat: 13.731, lng: 100.474 },
  { name: "ห้วยขวาง", lat: 13.776, lng: 100.574 },
  { name: "คลองสาน", lat: 13.73, lng: 100.507 },
  { name: "ตลิ่งชัน", lat: 13.779, lng: 100.432 },
  { name: "บางกอกน้อย", lat: 13.761, lng: 100.469 },
  { name: "บางขุนเทียน", lat: 13.593, lng: 100.415 },
  { name: "ภาษีเจริญ", lat: 13.714, lng: 100.437 },
  { name: "หนองแขม", lat: 13.704, lng: 100.348 },
  { name: "ราษฎร์บูรณะ", lat: 13.676, lng: 100.505 },
  { name: "บางพลัด", lat: 13.793, lng: 100.493 },
  { name: "ดินแดง", lat: 13.769, lng: 100.552 },
  { name: "บึงกุ่ม", lat: 13.808, lng: 100.651 },
  { name: "สาทร", lat: 13.718, lng: 100.529 },
  { name: "บางซื่อ", lat: 13.819, lng: 100.529 },
  { name: "จตุจักร", lat: 13.828, lng: 100.56 },
  { name: "บางคอแหลม", lat: 13.697, lng: 100.506 },
  { name: "ประเวศ", lat: 13.706, lng: 100.694 },
  { name: "คลองเตย", lat: 13.708, lng: 100.57 },
  { name: "สวนหลวง", lat: 13.731, lng: 100.626 },
  { name: "จอมทอง", lat: 13.677, lng: 100.469 },
  { name: "ดอนเมือง", lat: 13.913, lng: 100.589 },
  { name: "ราชเทวี", lat: 13.759, lng: 100.537 },
  { name: "ลาดพร้าว", lat: 13.811, lng: 100.608 },
  { name: "วัฒนา", lat: 13.727, lng: 100.585 },
  { name: "บางแค", lat: 13.696, lng: 100.409 },
  { name: "หลักสี่", lat: 13.887, lng: 100.579 },
  { name: "สายไหม", lat: 13.919, lng: 100.649 },
  { name: "คันนายาว", lat: 13.827, lng: 100.677 },
  { name: "สะพานสูง", lat: 13.768, lng: 100.684 },
  { name: "วังทองหลาง", lat: 13.786, lng: 100.611 },
  { name: "คลองสามวา", lat: 13.859, lng: 100.704 },
  { name: "บางนา", lat: 13.668, lng: 100.617 },
  { name: "ทวีวัฒนา", lat: 13.772, lng: 100.352 },
  { name: "ทุ่งครุ", lat: 13.628, lng: 100.507 },
  { name: "บางบอน", lat: 13.661, lng: 100.395 }
];

function buildExecutiveSummary(stations, sources, dischargeHistory, officialProvinceSituation, overbankStations = []) {
  return {
    province_situation: officialProvinceSituation
      ? mergeOfficialProvinceSituationWithOverbank(officialProvinceSituation, overbankStations)
      : buildProvinceSituation(stations),
    key_discharges: buildKeyDischarges(stations, dischargeHistory),
    bangkok_perimeter: buildBangkokPerimeterSummary(stations),
    source_notes: sources.map((source) => ({
      name: source.name,
      url: source.url,
      source_updated_at: source.source_updated_at,
      fetched_at: source.fetched_at,
      ok: source.ok
    }))
  };
}

function mergeOfficialProvinceSituationWithOverbank(provinceSituation, overbankStations) {
  const overbankByProvince = groupOverbankStationsByProvince(overbankStations);
  const rows = [...(provinceSituation.critical ?? []), ...(provinceSituation.watch ?? [])]
    .map((row) => {
      const overbank = overbankByProvince.get(normalizeProvinceKey(row.province)) ?? [];
      const hasOverbank = overbank.length > 0;
      const status = row.trend === "rising" || hasOverbank ? "critical" : "watch";
      const stations = [
        ...(row.stations ?? []),
        ...overbank
      ];
      const evidence = hasOverbank ? overbank[0] : row.evidence;
      return {
        ...row,
        status,
        critical: status === "critical" ? Math.max(1, overbank.length) : 0,
        watch: status === "watch" ? 1 : 0,
        overbank_stations: overbank,
        stations,
        evidence
      };
    });

  return {
    ...provinceSituation,
    critical: rows.filter((row) => row.status === "critical"),
    watch: rows.filter((row) => row.status === "watch"),
    normal: [],
    total_affected_provinces: provinceSituation.total_affected_provinces ?? rows.length,
    methodology: "ใช้จังหวัดที่ ปภ. ระบุว่ายังคงมีสถานการณ์ แยกระดับวิกฤตจากระดับน้ำเพิ่มขึ้นหรือมีจุดน้ำล้นตลิ่งจากสถาบันสารสนเทศทรัพยากรน้ำ และแยกระดับเฝ้าระวังจากระดับน้ำลดลง/ทรงตัวที่ไม่พบจุดน้ำล้นตลิ่ง"
  };
}

function groupOverbankStationsByProvince(stations) {
  const groups = new Map();
  for (const station of stations) {
    if (station.is_stale) continue;
    const key = normalizeProvinceKey(station.province);
    if (!key || key === "กรุงเทพมหานคร") continue;
    const current = groups.get(key) ?? [];
    current.push(pickStationSummary(station));
    groups.set(key, current);
  }
  for (const [key, rows] of groups.entries()) {
    groups.set(key, rows
      .sort((a, b) => {
        const gapDiff = (b.water_gap_to_bank ?? -Infinity) - (a.water_gap_to_bank ?? -Infinity);
        return gapDiff || Date.parse(b.source_updated_at ?? 0) - Date.parse(a.source_updated_at ?? 0);
      })
      .slice(0, 4));
  }
  return groups;
}

function normalizeProvinceKey(province) {
  if (!province) return null;
  if (province === "กรุงเทพฯ" || province === "กรุงเทพมหานคร") return "กรุงเทพมหานคร";
  if (province === "อยุธยา" || province === "พระนครศรีอยุธยา") return "พระนครศรีอยุธยา";
  return province;
}

function buildProvinceSituation(stations) {
  const byProvince = new Map();
  for (const station of stations) {
    if (!station.province || station.status === "no_data") continue;
    const current = byProvince.get(station.province) ?? {
      province: station.province,
      critical: 0,
      watch: 0,
      warning: 0,
      normal: 0,
      stations: []
    };
    current[station.status] = (current[station.status] ?? 0) + 1;
    current.stations.push(pickStationSummary(station));
    byProvince.set(station.province, current);
  }

  const provinceRows = [...byProvince.values()].map((row) => {
    const status = row.critical > 0 ? "critical" : (row.warning > 0 || row.watch > 0 ? "watch" : "normal");
    const evidence = row.stations
      .filter((station) => status === "critical" ? station.status === "critical" : WATCH_STATUSES.has(station.status))
      .sort((a, b) => statusRank(b.status) - statusRank(a.status))[0] ?? row.stations[0];
    return { ...row, status, evidence };
  });

  return {
    critical: provinceRows.filter((row) => row.status === "critical"),
    watch: provinceRows.filter((row) => row.status === "watch"),
    normal: provinceRows.filter((row) => row.status === "normal"),
    methodology: "นับจังหวัดจากสถานีที่ source ให้สถานะ critical หรือ watch/warning อย่างน้อย 1 จุด โดยไม่นับสถานี no_data"
  };
}

function buildKeyDischarges(stations, dischargeHistory = {}) {
  return [
    {
      id: "sakae-krang",
      title: "Ct.19 แม่น้ำสะแกกรัง",
      description: "เลือกสถานีในลุ่มน้ำสะแกกรังที่มีค่าอัตราการไหล/ระบายล่าสุด",
      station: buildDailyReportStation("Ct.19", "สถานีบ้านดอนใหญ่", "อุทัยธานี", "เมืองอุทัยธานี", dischargeHistory["Ct.19"] ?? []) ?? findBestStation(stations, [
        { id: "Ct.19", weight: 9 },
        { text: "บ้านดอนใหญ่", weight: 8 },
        { text: "สะแกกรัง", weight: 5 },
        { idPrefix: "SKG", weight: 4 },
        { province: "อุทัยธานี", weight: 2 }
      ]),
      history: dischargeHistory["Ct.19"] ?? []
    },
    {
      id: "chao-phraya-dam",
      title: "C.13 เขื่อนเจ้าพระยา",
      description: "อัตราระบายท้ายเขื่อนเจ้าพระยา",
      station: buildDailyReportStation("C.13", "ท้ายเขื่อนเจ้าพระยา", "ชัยนาท", "สรรพยา", dischargeHistory["C.13"] ?? []) ?? findBestStation(stations, [
        { id: "C.13", weight: 10 },
        { text: "ท้ายเขื่อนเจ้าพระยา", weight: 9 },
        { province: "ชัยนาท", weight: 2 }
      ]),
      history: dischargeHistory["C.13"] ?? []
    },
    {
      id: "pasak",
      title: "S.5 แม่น้ำป่าสัก",
      description: "สถานี S.5 บริเวณพระนครศรีอยุธยาในรายงานน้ำท่า",
      station: buildDailyReportStation("S.5", "รพ.ปัจมาฯ", "พระนครศรีอยุธยา", "พระนครศรีอยุธยา", dischargeHistory["S.5"] ?? []) ?? findBestStation(stations, [
        { id: "S.5", weight: 10 },
        { text: "สะพานปรีดี", weight: 8 },
        { text: "ปัจม", weight: 7 },
        { text: "ป่าสัก", weight: 5 },
        { province: "พระนครศรีอยุธยา", weight: 2 }
      ]),
      history: dischargeHistory["S.5"] ?? []
    },
    {
      id: "bang-sai",
      title: "C29A บางไทร",
      description: "สถานีบางไทรจากรายงานน้ำท่า",
      station: buildDailyReportStation("C29A", "สถานีบางไทร", "พระนครศรีอยุธยา", "บางไทร", dischargeHistory["C29A"] ?? []),
      history: dischargeHistory["C29A"] ?? []
    }
  ];
}

function buildDailyReportStation(stationId, stationName, province, district, history) {
  const latest = [...history].reverse().find((row) => Number.isFinite(row.flow_rate) || Number.isFinite(row.water_level)) ?? history.at(-1);
  if (!latest) return null;
  return {
    station_id: stationId,
    station_name: stationName,
    province,
    district,
    latitude: null,
    longitude: null,
    water_level: latest.water_level,
    bank_level: null,
    water_gap_to_bank: null,
    flow_rate: latest.flow_rate,
    rainfall_1h: null,
    rainfall_3h: null,
    rainfall_24h: null,
    trend: null,
    status: "no_data",
    category: "River",
    source_name: latest.source_name ?? "สถาบันสารสนเทศทรัพยากรน้ำ",
    source_url: latest.source_url,
    observed_at: latest.source_updated_at,
    fetched_at: null,
    source_updated_at: latest.source_updated_at,
    is_stale: false,
    stale_reason: null,
    attribution_text: latest.source_name ?? "สถาบันสารสนเทศทรัพยากรน้ำ"
  };
}

function buildBangkokPerimeterSummary(stations) {
  const freshStations = stations.filter((station) => !station.is_stale);
  const bangkokStations = freshStations.filter((station) => station.province === "กรุงเทพฯ" && station.category === "Road Flood");
  const perimeterStations = freshStations.filter((station) => PERIMETER_PROVINCES.has(station.province));
  const criticalDistricts = groupAreasByKey(bangkokStations, "critical", resolveBangkokDistrict);
  const criticalDistrictNames = new Set(criticalDistricts.map((row) => row.name));
  const watchDistricts = groupWatchAreasByKey(bangkokStations, resolveBangkokDistrict)
    .filter((row) => !criticalDistrictNames.has(row.name));

  return {
    bangkok_critical_districts: criticalDistricts,
    bangkok_watch_areas: watchDistricts,
    perimeter_watch_areas: groupWatchAreas(perimeterStations, "province"),
    methodology: "นับจากสถานีที่มีชื่อเขต/จังหวัดและ source ให้สถานะ critical หรือ watch/warning ไม่ใช้ no_data"
  };
}

function groupAreas(stations, targetStatus, field) {
  const groups = new Map();
  for (const station of stations) {
    const key = station[field];
    if (!key || station.status !== targetStatus) continue;
    const current = groups.get(key) ?? { name: key, stations: [], source_updated_at: null, fetched_at: null };
    current.stations.push(pickStationSummary(station));
    current.source_updated_at = maxIso(current.source_updated_at, station.source_updated_at);
    current.fetched_at = maxIso(current.fetched_at, station.fetched_at);
    groups.set(key, current);
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, "th"));
}

function groupAreasByKey(stations, targetStatus, keySelector) {
  const groups = new Map();
  for (const station of stations) {
    const key = keySelector(station);
    if (!key || station.status !== targetStatus) continue;
    const current = groups.get(key) ?? { name: key, stations: [], source_updated_at: null, fetched_at: null };
    current.stations.push(pickStationSummary(station));
    current.source_updated_at = maxIso(current.source_updated_at, station.source_updated_at);
    current.fetched_at = maxIso(current.fetched_at, station.fetched_at);
    groups.set(key, current);
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, "th"));
}

function groupWatchAreas(stations, field) {
  const groups = new Map();
  for (const station of stations) {
    const key = station[field];
    if (!key || !WATCH_STATUSES.has(station.status)) continue;
    const current = groups.get(key) ?? { name: key, stations: [], source_updated_at: null, fetched_at: null };
    current.stations.push(pickStationSummary(station));
    current.source_updated_at = maxIso(current.source_updated_at, station.source_updated_at);
    current.fetched_at = maxIso(current.fetched_at, station.fetched_at);
    groups.set(key, current);
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, "th"));
}

function groupWatchAreasByKey(stations, keySelector) {
  const groups = new Map();
  for (const station of stations) {
    const key = keySelector(station);
    if (!key || !WATCH_STATUSES.has(station.status)) continue;
    const current = groups.get(key) ?? { name: key, stations: [], source_updated_at: null, fetched_at: null };
    current.stations.push(pickStationSummary(station));
    current.source_updated_at = maxIso(current.source_updated_at, station.source_updated_at);
    current.fetched_at = maxIso(current.fetched_at, station.fetched_at);
    groups.set(key, current);
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, "th"));
}

function resolveBangkokDistrict(station) {
  if (station.district) return station.district;
  if (!Number.isFinite(station.latitude) || !Number.isFinite(station.longitude)) return null;
  return BANGKOK_DISTRICT_CENTROIDS
    .map((district) => ({
      name: district.name,
      distance: Math.hypot((district.lat - station.latitude) * 111, (district.lng - station.longitude) * 101)
    }))
    .sort((a, b) => a.distance - b.distance)[0]?.name ?? null;
}

function findBestStation(stations, rules) {
  const candidates = stations
    .filter((station) => Number.isFinite(station.flow_rate))
    .map((station) => ({ station, score: scoreByRules(station, rules) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || Date.parse(b.station.source_updated_at ?? 0) - Date.parse(a.station.source_updated_at ?? 0));

  return candidates[0] ? pickStationSummary(candidates[0].station) : null;
}

function scoreByRules(station, rules) {
  let score = 0;
  for (const rule of rules) {
    if (rule.id && station.station_id === rule.id) score += rule.weight;
    if (rule.idPrefix && String(station.station_id ?? "").startsWith(rule.idPrefix)) score += rule.weight;
    if (rule.text && String(station.station_name ?? "").includes(rule.text)) score += rule.weight;
    if (rule.province && station.province === rule.province) score += rule.weight;
  }
  if (score <= 0) return 0;
  if (station.source_name === "สถาบันสารสนเทศทรัพยากรน้ำ") score += 2;
  if (station.status === "critical") score += 1;
  return score;
}

function statusRank(status) {
  return { critical: 5, warning: 4, watch: 3, normal: 2, no_data: 1 }[status] ?? 0;
}

function maxIso(a, b) {
  if (!a) return b ?? null;
  if (!b) return a;
  return Date.parse(a) > Date.parse(b) ? a : b;
}

function buildOverview(stations, sources) {
  const counts = {
    normal: 0,
    watch: 0,
    warning: 0,
    critical: 0,
    no_data: 0
  };

  for (const station of stations) {
    counts[station.status] = (counts[station.status] ?? 0) + 1;
  }

  const maxRain = stations
    .filter((station) => Number.isFinite(station.rainfall_24h))
    .sort((a, b) => b.rainfall_24h - a.rainfall_24h)[0] ?? null;

  const closestToBank = stations
    .filter((station) => Number.isFinite(station.water_gap_to_bank))
    .sort((a, b) => Math.abs(a.water_gap_to_bank) - Math.abs(b.water_gap_to_bank))[0] ?? null;

  const latestSourceUpdate = sources
    .map((source) => source.source_updated_at)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;

  return {
    counts,
    max_rain: maxRain ? pickStationSummary(maxRain) : null,
    closest_to_bank: closestToBank ? pickStationSummary(closestToBank) : null,
    latest_source_update: latestSourceUpdate,
    source_count: sources.length,
    station_count: stations.length
  };
}

function buildFlow(stations) {
  const route = [
    { label: "ปิง / วัง / ยม / น่าน", province: "นครสวรรค์", keywords: ["ปิง", "วัง", "ยม", "น่าน"] },
    { label: "นครสวรรค์", province: "นครสวรรค์", keywords: ["เดชาติวงศ์", "นครสวรรค์", "CPY001"] },
    { label: "เขื่อนเจ้าพระยา", province: "ชัยนาท", keywords: ["เขื่อนเจ้าพระยา", "ชัยนาท"] },
    { label: "ชัยนาท", province: "ชัยนาท", keywords: ["ชัยนาท"] },
    { label: "สิงห์บุรี", province: "สิงห์บุรี", keywords: ["สิงห์บุรี"] },
    { label: "อ่างทอง", province: "อ่างทอง", keywords: ["อ่างทอง"] },
    { label: "อยุธยา", province: "อยุธยา", keywords: ["บางบาล", "อยุธยา", "พระนครศรีอยุธยา"] },
    { label: "ปทุมธานี", province: "ปทุมธานี", keywords: ["ปทุมธานี"] },
    { label: "นนทบุรี", province: "นนทบุรี", keywords: ["นนทบุรี", "ปากเกร็ด"] },
    { label: "กรุงเทพฯ", province: "กรุงเทพฯ", keywords: ["กรุงเทพ", "บางกอก", "เจ้าพระยา"] },
    { label: "อ่าวไทย", province: null, keywords: ["ปากน้ำ", "อ่าวไทย"] }
  ];

  return route.map((node) => {
    const candidates = stations
      .filter((station) => station.category === "River" || station.category === "Canal")
      .filter((station) => {
        const haystack = `${station.station_name ?? ""} ${station.province ?? ""} ${station.station_id ?? ""}`;
        return (node.province && station.province === node.province) || node.keywords.some((keyword) => haystack.includes(keyword));
      });

    const station = candidates
      .sort((a, b) => scoreStation(node, b) - scoreStation(node, a))[0] ?? null;

    return {
      label: node.label,
      station: station ? pickStationSummary(station) : null
    };
  });
}

function scoreStation(node, station) {
  let score = 0;
  const haystack = `${station.station_name ?? ""} ${station.province ?? ""} ${station.station_id ?? ""}`;
  if (node.province && station.province === node.province) score += 4;
  for (const keyword of node.keywords) {
    if (haystack.includes(keyword)) score += 2;
  }
  if (station.source_name === "POPNIX Flood") score += 2;
  if (Number.isFinite(station.water_gap_to_bank)) score += 2;
  if (station.category === "River") score += 1;
  return score;
}

function pickStationSummary(station) {
  return {
    station_id: station.station_id,
    station_name: station.station_name,
    province: station.province,
    district: station.district,
    latitude: station.latitude,
    longitude: station.longitude,
    water_level: station.water_level,
    bank_level: station.bank_level,
    water_gap_to_bank: station.water_gap_to_bank,
    flow_rate: station.flow_rate,
    rainfall_1h: station.rainfall_1h,
    rainfall_3h: station.rainfall_3h,
    rainfall_24h: station.rainfall_24h,
    trend: station.trend,
    status: station.status,
    category: station.category,
    source_name: station.source_name,
    source_url: station.source_url,
    observed_at: station.observed_at,
    fetched_at: station.fetched_at,
    source_updated_at: station.source_updated_at,
    is_stale: station.is_stale,
    stale_reason: station.stale_reason,
    attribution_text: station.attribution_text
  };
}
