import { fetchText } from "../services/http.js";

const BASE_URL = "https://tiwrm.hii.or.th/DATA/REPORT/php/show_itcwater.php";
const HII_SOURCE_NAME = "สถาบันสารสนเทศทรัพยากรน้ำ";
const RID_SOURCE_NAME = "กรมชลประทาน";
const START_MONTH = 8;
const START_DAY = 25;
const HISTORY_STATIONS = {
  "Ct.19": "แม่น้ำสะแกกรัง",
  "C.13": "เขื่อนเจ้าพระยา",
  "S.28": "แม่น้ำป่าสัก",
  "C.29": "บางไทร"
};
const FROZEN_HISTORY = {
  "Ct.19": [
    ["2026-09-25", 99, 20.91], ["2026-09-26", 159, 21.56], ["2026-09-27", 265, 22.44], ["2026-09-28", 363, 23.08],
    ["2026-09-29", 413, 23.37], ["2026-09-30", 529, 23.99], ["2026-10-01", 570, 24.2], ["2026-10-02", 531, 24]
  ],
  "C.13": [
    ["2026-09-25", 1750, 13.89], ["2026-09-26", 1850, 14.21], ["2026-09-27", 1950, 14.52], ["2026-09-28", 1950, 14.52],
    ["2026-09-29", 2000, 14.67], ["2026-09-30", 2200, 15.22], ["2026-10-01", 2300, 15.46], ["2026-10-02", 2500, 15.93]
  ],
  "S.28": [
    ["2026-09-25", 34, 18.41], ["2026-09-26", 70, 19.28], ["2026-09-27", 64, 19.16], ["2026-09-28", 58, 19.02],
    ["2026-09-29", 25, 18.1], ["2026-09-30", 84, 19.59], ["2026-10-01", 184, 21.35], ["2026-10-02", 354, 24.08]
  ],
  "C.29": [
    ["2026-09-25", 1693, null, "https://www.rid.go.th/th/water-situation/28855"],
    ["2026-09-26", 1748, null, "https://www.rid.go.th/th/water-situation/28861"],
    ["2026-09-27", 1895, null, "https://www.rid.go.th/th/water-situation/28867"],
    ["2026-09-28", 1736, null, "https://www.rid.go.th/th/water-situation/28873"],
    ["2026-09-29", 1814, null, "https://www.rid.go.th/th/water-situation/28920"],
    ["2026-09-30", 2071, null, "https://www.rid.go.th/th/water-situation/28926"],
    ["2026-10-01", 2173, null, "https://www.rid.go.th/th/water-situation/28965"],
    ["2026-10-02", 2113, null, "https://www.rid.go.th/th/water-situation/28971"]
  ]
};

export async function collectThaiWaterDailyReportHistory() {
  const dates = buildReportDates();
  const historyByStation = Object.fromEntries(Object.keys(HISTORY_STATIONS).map((stationId) => [stationId, []]));
  seedFrozenHistory(historyByStation, dates);

  const frozenDates = new Set(Object.values(FROZEN_HISTORY).flatMap((rows) => rows.map(([date]) => date)));
  const fetchDates = dates.filter((date) => !frozenDates.has(date));
  const results = await Promise.all(fetchDates.map((date) => fetchReportDate(date)));
  let latestSourceUpdate = latestHistoryUpdate(historyByStation);

  for (const [index, result] of results.entries()) {
    const date = fetchDates[index];
    if (!result.ok || !isDailyReport(result.text)) continue;

    latestSourceUpdate = `${date}T06:00:00+07:00`;
    const rows = parseReport(result.text);
    for (const stationId of Object.keys(HISTORY_STATIONS)) {
      const row = rows.get(stationId);
      if (!row || (!Number.isFinite(row.flow_rate) && !Number.isFinite(row.water_level))) continue;
      upsertHistoryRow(historyByStation[stationId], {
        date,
        flow_rate: row?.flow_rate ?? null,
        water_level: row?.water_level ?? null,
        source_name: HII_SOURCE_NAME,
        source_url: `${BASE_URL}?sdate=${date}`,
        source_updated_at: `${date}T06:00:00+07:00`
      });
    }
  }

  return {
    source: {
      name: HII_SOURCE_NAME,
      url: BASE_URL,
      type: "sensor",
      ok: Object.values(historyByStation).some((rows) => rows.length > 0),
      fetched_at: new Date().toISOString(),
      source_updated_at: latestSourceUpdate,
      error: null
    },
    discharge_history: historyByStation
  };
}

function seedFrozenHistory(historyByStation, dates) {
  const requestedDates = new Set(dates);
  for (const [stationId, rows] of Object.entries(FROZEN_HISTORY)) {
    for (const [date, flowRate, waterLevel, sourceUrl] of rows) {
      if (!requestedDates.has(date)) continue;
      const isRid = stationId === "C.29";
      historyByStation[stationId].push({
        date,
        flow_rate: flowRate,
        water_level: waterLevel,
        source_name: isRid ? RID_SOURCE_NAME : HII_SOURCE_NAME,
        source_url: sourceUrl ?? `${BASE_URL}?sdate=${date}`,
        source_updated_at: `${date}T${isRid ? "08:00:00" : "06:00:00"}+07:00`,
        locked: true
      });
    }
  }
}

function upsertHistoryRow(rows, row) {
  const current = rows.find((item) => item.date === row.date);
  if (!current) {
    rows.push(row);
    return;
  }
  if (Number.isFinite(row.flow_rate) || Number.isFinite(row.water_level)) {
    Object.assign(current, row);
  }
}

function latestHistoryUpdate(historyByStation) {
  return Object.values(historyByStation)
    .flat()
    .map((row) => row.source_updated_at)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;
}

async function fetchReportDate(date) {
  return fetchText(`${BASE_URL}?sdate=${date}`, {
    headers: { referer: "https://tiwrm.hii.or.th/" },
    timeoutMs: 45000
  });
}

function buildReportDates() {
  const now = new Date();
  const bangkokNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
  const year = bangkokNow.getFullYear();
  const start = new Date(year, START_MONTH, START_DAY);
  const end = new Date(year, bangkokNow.getMonth(), bangkokNow.getDate());
  const dates = [];

  for (let cursor = start; cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    dates.push(toDateString(cursor));
  }

  return dates;
}

function parseReport(html) {
  const cells = [...html.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => cleanCell(match[1]));
  const rows = new Map();

  for (let index = 0; index < cells.length; index += 1) {
    const cell = cells[index];
    const stationId = stationIdFromCell(cell);
    if (!stationId || rows.has(stationId)) continue;

    rows.set(stationId, {
      station_id: stationId,
      station_name: HISTORY_STATIONS[stationId],
      water_level: numberOrNull(cells[index + 4]),
      flow_rate: numberOrNull(cells[index + 5])
    });
  }

  return rows;
}

function stationIdFromCell(cell) {
  if (cell.includes("(Ct.19)")) return "Ct.19";
  if (cell.includes("(C.13)")) return "C.13";
  if (cell.includes("(S.28)")) return "S.28";
  if (cell.includes("(C.29)") || cell.includes("(C.29A)") || cell.includes("บางไทร ปริมาณน้ำเฉลี่ยรายวัน")) return "C.29";
  return null;
}

function isDailyReport(text) {
  return text.length > 10000 && (text.includes("(C.13)") || text.includes("(Ct.19)") || text.includes("(S.28)"));
}

function cleanCell(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function numberOrNull(value) {
  const normalized = String(value ?? "").replaceAll(",", "").trim();
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function toDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
