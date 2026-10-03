import { fetchJson } from "../services/http.js";
import { withFreshness } from "../services/normalize.js";

const DAILY_FORECAST_URL = "https://data.tmd.go.th/api/DailyForecast/v2/?uid=api&ukey=api12345&format=json";
const WARNING_NEWS_URL = "https://data.tmd.go.th/api/WeatherWarningNews/v1/?uid=api&ukey=api12345&format=json";
const SEVEN_DAY_URL = "https://data.tmd.go.th/api/WeatherForecast7Days/v2/?uid=api&ukey=api12345&format=json";
const SEVEN_DAY_REGION_URL = "https://data.tmd.go.th/api/WeatherForecast7DaysByRegion/v2/?uid=api&ukey=api12345&format=json";

export async function collectTmd() {
  const [daily, warning, sevenDay, sevenDayRegion] = await Promise.all([
    fetchJson(DAILY_FORECAST_URL),
    fetchJson(WARNING_NEWS_URL),
    fetchJson(SEVEN_DAY_URL),
    fetchJson(SEVEN_DAY_REGION_URL)
  ]);

  const alerts = [
    normalizeDailyForecast(daily),
    normalizeWarningNews(warning)
  ].filter(Boolean);

  return {
    source: buildSourceSummary("กรมอุตุนิยมวิทยา", "https://www.tmd.go.th/forecast/daily", [daily, warning, sevenDay, sevenDayRegion]),
    stations: [],
    alerts,
    weather_forecast: normalizeSevenDayForecast(sevenDay, sevenDayRegion)
  };
}

function normalizeDailyForecast(result) {
  if (!result.ok || !result.data?.DailyForecast) return null;
  const forecast = result.data.DailyForecast;
  const header = result.data.header ?? {};
  return withFreshness({
    id: "tmd-daily-forecast",
    title: "พยากรณ์อากาศ 24 ชั่วโมง",
    agency: "กรมอุตุนิยมวิทยา",
    description: forecast.OverallDescriptionThai ?? "มีข้อมูลพยากรณ์อากาศจากกรมอุตุนิยมวิทยา",
    source_name: "กรมอุตุนิยมวิทยา",
    source_url: "https://www.tmd.go.th/forecast/daily",
    source_type: "forecast",
    observed_at: toIso(header.lastBuildDate),
    fetched_at: result.fetchedAt,
    source_updated_at: toIso(header.lastBuildDate),
    attribution_text: "Thai Meteorological Department",
    status: "no_data"
  });
}

function normalizeWarningNews(result) {
  if (!result.ok || !result.data?.WarningNews) return null;
  const warning = result.data.WarningNews;
  const header = result.data.header ?? {};
  const announcedAt = toIso(warning.AnnounceDateTime);

  return withFreshness({
    id: "tmd-warning-news",
    title: warning.TitleThai ?? "ประกาศกรมอุตุนิยมวิทยา",
    agency: "กรมอุตุนิยมวิทยา",
    description: warning.DescriptionThai ?? "",
    source_name: "กรมอุตุนิยมวิทยา",
    source_url: WARNING_NEWS_URL,
    source_type: "official_alert",
    observed_at: announcedAt,
    fetched_at: result.fetchedAt,
    source_updated_at: announcedAt ?? toIso(header.lastBuildDate),
    attribution_text: "Thai Meteorological Department",
    status: "no_data"
  });
}

function buildSourceSummary(name, url, results) {
  const ok = results.some((result) => result.ok);
  const latest = results
    .map((result) => result.data?.header?.lastBuildDate)
    .concat(results.map((result) => result.data?.header?.LastBuildDate))
    .map(toIso)
    .filter(Boolean)
    .sort()
    .at(-1);

  return {
    name,
    url,
    type: "forecast",
    ok,
    fetched_at: new Date().toISOString(),
    source_updated_at: latest,
    error: ok ? null : results.map((result) => result.error).filter(Boolean).join("; ")
  };
}

function normalizeSevenDayForecast(result, regionResult) {
  const provinces = result.data?.Provinces?.Province;
  const bangkok = Array.isArray(provinces)
    ? provinces.find((item) => item.ProvinceNameThai === "กรุงเทพมหานคร")
    : null;
  const forecast = bangkok?.SevenDaysForecast;
  const header = result.data?.header ?? {};
  const regionHeader = regionResult.data?.header ?? {};
  const dates = forecast?.ForecastDate ?? [];

  return {
    source_name: "กรมอุตุนิยมวิทยา",
    source_url: SEVEN_DAY_URL,
    source_type: "forecast",
    source_updated_at: toIso(header.LastBuildDate ?? regionHeader.lastBuildDate),
    fetched_at: result.fetchedAt ?? regionResult.fetchedAt,
    attribution_text: "Thai Meteorological Department",
    overall_period: regionResult.data?.OverallForecast?.Date ?? null,
    overall_description: regionResult.data?.OverallForecast?.OverallDescriptionThai ?? null,
    province: "กรุงเทพมหานคร",
    days: dates.map((date, index) => ({
      date: parseForecastDate(date),
      date_label: date,
      description: forecast.DescriptionThai?.[index] ?? null,
      rain_percent: numberOrNull(forecast.PercentRainCover?.[index]),
      temp_max_c: numberOrNull(forecast.MaximumTemperature?.[index]),
      temp_min_c: numberOrNull(forecast.MinimumTemperature?.[index]),
      wind_speed_kmh: numberOrNull(forecast.WindSpeed?.[index])
    }))
      .filter((day) => day.date)
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
  };
}

function parseForecastDate(value) {
  if (!value) return null;
  const [day, month, year] = String(value).split("/").map(Number);
  if (!day || !month || !year) return null;
  return new Date(Date.UTC(year, month - 1, day)).toISOString();
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toIso(value) {
  if (!value) return null;
  const normalized = String(value).replace(" ", "T");
  const parsed = Date.parse(normalized.includes("+") || normalized.endsWith("Z") ? normalized : `${normalized}+07:00`);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}
