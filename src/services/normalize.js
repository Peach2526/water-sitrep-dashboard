export const TARGET_PROVINCES = new Set([
  "นครสวรรค์",
  "ชัยนาท",
  "สิงห์บุรี",
  "อ่างทอง",
  "พระนครศรีอยุธยา",
  "อยุธยา",
  "ปทุมธานี",
  "นนทบุรี",
  "กรุงเทพมหานคร",
  "กรุงเทพฯ",
  "กรุงเทพ",
  "สมุทรปราการ",
  "นครปฐม",
  "สมุทรสาคร",
  "ลพบุรี",
  "สระบุรี",
  "อุทัยธานี",
  "กำแพงเพชร"
]);

export const SOURCE_STALENESS_HOURS = {
  sensor: 6,
  road_flood: 6,
  rain: 6,
  official_alert: 48,
  forecast: 36,
  report: 72
};

export function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function textOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

export function normalizeProvince(value) {
  const text = textOrNull(value);
  if (!text) return null;
  if (text === "พระนครศรีอยุธยา") return "อยุธยา";
  if (text === "กรุงเทพมหานคร") return "กรุงเทพฯ";
  return text;
}

export function statusFromSituation(value) {
  const level = numberOrNull(value);
  if (level === null) return "no_data";
  if (level >= 5) return "critical";
  if (level === 4) return "warning";
  if (level === 3) return "watch";
  return "normal";
}

export function statusFromText(value) {
  const text = String(value ?? "").toLowerCase();
  if (!text) return "no_data";
  if (text.includes("critical") || text.includes("red") || text.includes("วิกฤต")) return "critical";
  if (text.includes("warning") || text.includes("orange") || text.includes("เตือน")) return "warning";
  if (text.includes("watch") || text.includes("yellow") || text.includes("เฝ้า")) return "watch";
  if (text.includes("normal") || text.includes("green") || text.includes("ปกติ")) return "normal";
  return "no_data";
}

export function trendFromDelta(delta) {
  const value = numberOrNull(delta);
  if (value === null) return null;
  if (value > 0.02) return "rising";
  if (value < -0.02) return "falling";
  return "flat";
}

export function isTargetProvince(province) {
  const normalized = normalizeProvince(province);
  return normalized ? TARGET_PROVINCES.has(normalized) : false;
}

export function withFreshness(record) {
  const sourceType = record.source_type ?? "sensor";
  const observed = record.source_updated_at ?? record.observed_at;
  const staleHours = SOURCE_STALENESS_HOURS[sourceType] ?? 12;
  const isStale = observed ? Date.now() - Date.parse(observed) > staleHours * 60 * 60 * 1000 : true;

  return {
    ...record,
    is_stale: record.is_stale ?? isStale,
    stale_reason: record.stale_reason ?? (isStale ? "ข้อมูลเก่ากว่าช่วงเวลาที่คาดไว้หรือไม่พบเวลาอัปเดตจากต้นทาง" : null)
  };
}

export function uniqueByStation(records) {
  const seen = new Map();
  for (const record of records) {
    const key = `${record.source_name}:${record.station_id}`;
    if (!seen.has(key)) {
      seen.set(key, record);
      continue;
    }

    const current = seen.get(key);
    const currentTime = Date.parse(current.observed_at ?? current.fetched_at ?? 0);
    const nextTime = Date.parse(record.observed_at ?? record.fetched_at ?? 0);
    if (nextTime > currentTime) seen.set(key, record);
  }
  return [...seen.values()];
}
