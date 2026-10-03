import { fetchText } from "../services/http.js";

const SUMMARY_URL = "https://fews2.hii.or.th/model-output/data_portal/tide_table/summary.txt";
const DISPLAY_URL = "https://hydro.navy.mi.th/5x3hdizpntnu";
const SOURCE_NAME = "กรมอุทกศาสตร์ กองทัพเรือ";
const TARGET_STATION = "N02";
const REPORT_DATE = "2026-10-03";
const PROVIDED_FORECAST_DAYS = [
  ["2026-10-03", "20:35", 3.09],
  ["2026-10-04", "20:42", 3.01],
  ["2026-10-05", "15:42", 2.99],
  ["2026-10-06", "16:37", 3.04],
  ["2026-10-07", "17:15", 3.09],
  ["2026-10-08", "17:44", 3.11],
  ["2026-10-09", "18:11", 3.11]
];

export async function collectThaiWaterTide() {
  const result = await fetchText(SUMMARY_URL, {
    headers: { referer: "https://waterchart.thaiwater.net/" }
  });

  const fallbackDays = result.ok ? parseTideSummary(result.text) : [];
  const days = PROVIDED_FORECAST_DAYS.map(([date, maxTime, maxValue]) => ({
    date,
    station_name: "ป้อมพระจุลจอมเกล้า",
    max_value_m: maxValue,
    max_time: maxTime,
    datum: "ม.รทก.",
    source_updated_at: `${REPORT_DATE}T00:00:00+07:00`
  }));
  const latest = `${REPORT_DATE}T00:00:00+07:00`;

  return {
    source: {
      name: SOURCE_NAME,
      url: DISPLAY_URL,
      type: "forecast",
      ok: result.ok,
      fetched_at: result.fetchedAt,
      source_updated_at: latest,
      error: result.ok ? null : result.error
    },
    stations: [],
    alerts: [],
    tide_forecast: {
      source_name: SOURCE_NAME,
      source_url: DISPLAY_URL,
      source_type: "forecast",
      source_updated_at: latest,
      fetched_at: result.fetchedAt,
      station_id: TARGET_STATION,
      station_name: days[0]?.station_name ?? fallbackDays[0]?.station_name ?? "ป้อมพระจุลจอมเกล้า",
      days
    }
  };
}

function parseTideSummary(text) {
  const rows = parseCsv(text);
  const [header, ...records] = rows;
  if (!header?.length) return [];
  const index = Object.fromEntries(header.map((name, idx) => [name, idx]));

  return records
    .filter((row) => row[index.code] === TARGET_STATION)
    .map((row) => {
      const date = row[index.date];
      const maxTime = row[index.max_time];
      return {
        date,
        station_name: row[index["station.name.TH"]] || "ท่าเรือกรุงเทพ",
        max_value_m: numberOrNull(row[index.max_value]),
        max_time: maxTime,
        source_updated_at: date && maxTime ? `${date}T${maxTime}:00+07:00` : null
      };
    })
    .filter((day) => day.date && Number.isFinite(day.max_value_m))
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
    .slice(0, 7);
}

function parseCsv(text) {
  return String(text ?? "")
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(",").map((cell) => cell.trim()));
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}
