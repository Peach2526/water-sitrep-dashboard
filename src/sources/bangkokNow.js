import { fetchTextHead } from "../services/http.js";
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
  const live = await fetchTextHead(SOURCE_URL);
  const fetchedAt = live.fetchedAt ?? new Date().toISOString();
  const records = SNAPSHOT_ROADS.map(([road, segment, district, depthCm, lat, lng], index) => normalizeRoad({
    id: `now-road-${index + 1}`,
    road,
    segment,
    district,
    depthCm,
    lat,
    lng,
    fetchedAt,
    liveOk: live.ok
  }));

  return {
    source: {
      name: live.ok ? "Bangkok NOW" : "Bangkok NOW (snapshot)",
      url: SOURCE_URL,
      type: "road_flood",
      ok: live.ok,
      fetched_at: fetchedAt,
      source_updated_at: SNAPSHOT_UPDATED_AT,
      error: live.ok ? null : `เรียกหน้า NOW จาก server ไม่ได้ (${live.error ?? live.status ?? "unknown"}); ใช้ snapshot ล่าสุดที่ตรวจจาก browser`
    },
    stations: records,
    alerts: []
  };
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
    observed_at: SNAPSHOT_UPDATED_AT,
    fetched_at: item.fetchedAt,
    source_updated_at: SNAPSHOT_UPDATED_AT,
    attribution_text: "Bangkok NOW Flood Alert",
    is_stale: true,
    stale_reason: item.liveOk ? "ข้อมูลจาก NOW ล่าสุดที่พบในหน้าเว็บ" : "ใช้ snapshot จากหน้า NOW เพราะ server เรียกโดเมน now.bangkok.go.th ไม่ได้"
  });
}

function statusFromDepth(depthCm) {
  const depth = numberOrNull(depthCm);
  if (depth === null) return statusFromText("");
  if (depth > 10) return "critical";
  if (depth >= 10) return "warning";
  if (depth > 0) return "watch";
  return "normal";
}
