import { fetchText } from "../services/http.js";
import { numberOrNull, statusFromText, withFreshness } from "../services/normalize.js";

const SOURCE_URL = "https://now.bangkok.go.th/flood-alert.html";
const SNAPSHOT_UPDATED_AT = "2026-09-30T12:40:00+07:00";

const SNAPSHOT_ROADS = [
  ["ถ.เทพรักษ์", "ช่วงบิ๊กซีสะพานใหม่", "บางเขน", 20, 13.89038, 100.60601],
  ["ถ.หลวงแพ่ง", "ช่วงโลตัสลาดกระบัง", "ลาดกระบัง", 20, 13.72084, 100.79314],
  ["ถ.เจ้าคุณทหาร", "บริเวณร้านปฤษฏ์ชัย ค้าไม้ และจุดใกล้เคียง", "ลาดกระบัง", 20, 13.75297, 100.77276],
  ["ถ.สุวินทวงศ์", "ช่วง ถ.หทัยราษฎร์", "มีนบุรี", 20, 13.81686, 100.72258],
  ["ถ.อ่อนนุช", "ช่วง ซ.อ่อนนุช 59", "ประเวศ", 20, 13.71948, 100.67292],
  ["ถ.ศรีนครินทร์", "ช่วง ถ.กำแพงเพชร 7", "สวนหลวง", 20, 13.74052, 100.64234],
  ["ถ.รามอินทรา", "ช่วง ซ.รามอินทรา 5", "บางเขน", 15, 13.87044, 100.60372],
  ["ถ.พัฒนาการ", "ช่วง ซ.พัฒนาการ 53", "สวนหลวง", 15, 13.73283, 100.64831],
  ["ถ.ลาดกระบัง", "ช่วง ซ.ลาดกระบัง 30/1", "ลาดกระบัง", 10, 13.72237, 100.7377],
  ["ถ.สีหบุรานุกิจ", "ช่วง ซ.สีหบุรานุกิจ 14", "มีนบุรี", 10, 13.81242, 100.7248],
  ["ถ.วัชรพล", "ช่วง ซ.วัชรพล 8", "บางเขน", 5, 13.8911, 100.6419],
  ["ถ.นวมินทร์", "ช่วง ซ.นวมินทร์ 38", "บึงกุ่ม", 5, 13.79441, 100.65171],
  ["ถ.ลาดพร้าว", "ช่วง ซ.ลาดพร้าว 110", "วังทองหลาง", 5, 13.78131, 100.61781]
];

export async function collectBangkokNow() {
  const live = await fetchText(SOURCE_URL, { timeoutMs: 20000 });
  const fetchedAt = live.fetchedAt ?? new Date().toISOString();
  const liveRoads = live.ok ? parseLiveRoads(live.text, fetchedAt) : [];
  const records = liveRoads.length
    ? liveRoads
    : SNAPSHOT_ROADS.map(([road, segment, district, depthCm, lat, lng], index) => normalizeRoad({
      id: `now-road-${index + 1}`,
      road,
      segment,
      district,
      depthCm,
      lat,
      lng,
      fetchedAt,
      liveOk: false,
      sourceUpdatedAt: SNAPSHOT_UPDATED_AT
    }));

  return {
    source: {
      name: liveRoads.length ? "Bangkok NOW" : "Bangkok NOW (snapshot)",
      url: SOURCE_URL,
      type: "road_flood",
      ok: live.ok && liveRoads.length > 0,
      fetched_at: fetchedAt,
      source_updated_at: latestSourceUpdatedAt(records) ?? SNAPSHOT_UPDATED_AT,
      error: live.ok && liveRoads.length > 0 ? null : `อ่านข้อมูล NOW สดไม่ได้ (${live.error ?? live.status ?? "parse_failed"}); ใช้ snapshot ล่าสุดที่ตรวจจาก browser`
    },
    stations: records,
    alerts: []
  };
}

function parseLiveRoads(html, fetchedAt) {
  const roads = extractRoadsArray(html);
  if (!roads.length) return [];
  const sourceUpdatedAt = parseSourceUpdatedAt(html) ?? fetchedAt;
  return roads.flatMap((road, roadIndex) => {
    const points = Array.isArray(road.k) && road.k.length ? road.k : [[`now-road-${roadIndex + 1}`, road.s, road.m, road.l, road.m, 0, road.s]];
    return points.map((point, pointIndex) => normalizeRoad({
      id: textOrFallback(point[0], `now-road-${roadIndex + 1}-${pointIndex + 1}`),
      road: textOrFallback(road.n, "ถนน"),
      segment: textOrFallback(point[6] ?? point[1] ?? road.s, road.s ?? ""),
      district: textOrFallback(road.d, ""),
      depthCm: numberOrNull(point[2] ?? road.m),
      lat: null,
      lng: null,
      fetchedAt,
      liveOk: true,
      sourceUpdatedAt
    }));
  });
}

function extractRoadsArray(html) {
  const marker = "const ROADS =";
  const markerIndex = html.indexOf(marker);
  if (markerIndex === -1) return [];
  const start = html.indexOf("[", markerIndex);
  if (start === -1) return [];
  const end = findMatchingBracket(html, start);
  if (end === -1) return [];
  try {
    const rows = JSON.parse(stripLineComments(html.slice(start, end + 1)));
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function stripLineComments(value) {
  return String(value ?? "").replace(/^\s*\/\/.*$/gm, "");
}

function findMatchingBracket(text, start) {
  let depth = 0;
  let inString = false;
  let quote = "";
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        inString = false;
      }
      continue;
    }
    if (char === "\"" || char === "'") {
      inString = true;
      quote = char;
      continue;
    }
    if (char === "[") depth += 1;
    if (char === "]") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function parseSourceUpdatedAt(html) {
  const match = html.match(/ค่าเวลา\s*<b>([^<]+)<\/b>\s*·\s*([^<\n]+)/);
  if (!match) return null;
  const time = match[1].replace("น.", "").trim();
  const dateText = match[2].trim();
  const dateMatch = dateText.match(/(\d{1,2})\s+([ก-ฮ.]+)\s+(\d{4})/);
  if (!dateMatch) return null;
  const month = thaiMonthNumber(dateMatch[2]);
  if (!month) return null;
  const year = Number(dateMatch[3]) - 543;
  const day = String(Number(dateMatch[1])).padStart(2, "0");
  return `${year}-${String(month).padStart(2, "0")}-${day}T${time}:00+07:00`;
}

function thaiMonthNumber(value) {
  const key = String(value ?? "").replaceAll(".", "");
  return {
    "มค": 1,
    "กพ": 2,
    "มีค": 3,
    "เมย": 4,
    "พค": 5,
    "มิย": 6,
    "กค": 7,
    "สค": 8,
    "กย": 9,
    "ตค": 10,
    "พย": 11,
    "ธค": 12
  }[key] ?? null;
}

function normalizeRoad(item) {
  const status = statusFromDepth(item.depthCm);
  return withFreshness({
    station_id: item.id,
    station_name: `${item.road} ${item.segment}`,
    province: "กรุงเทพฯ",
    district: item.district,
    latitude: numberOrNull(item.lat),
    longitude: numberOrNull(item.lng),
    water_level: item.depthCm,
    bank_level: null,
    water_gap_to_bank: null,
    flow_rate: null,
    rainfall_1h: null,
    rainfall_3h: null,
    rainfall_24h: null,
    trend: null,
    status,
    category: "Road Flood",
    source: item.liveOk ? "Bangkok NOW" : "Bangkok NOW (snapshot)",
    source_name: item.liveOk ? "Bangkok NOW" : "Bangkok NOW (snapshot)",
    source_url: SOURCE_URL,
    source_type: "road_flood",
    observed_at: item.sourceUpdatedAt ?? SNAPSHOT_UPDATED_AT,
    fetched_at: item.fetchedAt,
    source_updated_at: item.sourceUpdatedAt ?? SNAPSHOT_UPDATED_AT,
    attribution_text: "Bangkok NOW Flood Alert",
    is_stale: false,
    stale_reason: item.liveOk ? null : "ใช้ snapshot จากหน้า NOW เพราะ server อ่านข้อมูลสดไม่ได้"
  });
}

function latestSourceUpdatedAt(records) {
  return records
    .map((record) => record.source_updated_at)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;
}

function textOrFallback(value, fallback) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function statusFromDepth(depthCm) {
  const depth = numberOrNull(depthCm);
  if (depth === null) return statusFromText("");
  if (depth > 10) return "critical";
  if (depth >= 10) return "warning";
  if (depth > 0) return "watch";
  return "normal";
}
