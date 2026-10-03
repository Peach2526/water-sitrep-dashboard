const state = {
  data: null
};

const MAP_BOUNDARIES = window.MAP_SHAPES ?? {
  meta: {},
  provinces: [],
  bangkokDistricts: []
};

document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  if (params.has("pdf")) {
    document.body.classList.add("pdf-export");
    if (params.get("scale") === "2") {
      document.body.classList.add("pdf-export-hq");
    }
  }
  document.getElementById("refreshButton").addEventListener("click", () => loadDashboard());
  loadDashboard();
});

async function loadDashboard() {
  const button = document.getElementById("refreshButton");
  button.disabled = true;
  button.innerHTML = '<span aria-hidden="true">↻</span> กำลังโหลด';

  try {
    const response = await fetch("/api/dashboard", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.data = await response.json();
    renderDashboard();
    showToast(state.data.cache?.served_from_cache ? "ใช้ข้อมูลจาก cache เพื่อลดการเรียกเว็บต้นทาง" : "ดึงข้อมูลล่าสุดแล้ว");
  } catch (error) {
    showToast(`โหลดข้อมูลไม่ได้: ${error.message}`);
  } finally {
    button.disabled = false;
    button.innerHTML = '<span aria-hidden="true">↻</span> รีเฟรชข้อมูล';
  }
}

function renderDashboard() {
  setText("generatedAt", formatDateTime(state.data.generated_at));
  setText("reportDate", formatReportDate(state.data.generated_at));
  setText("cacheStatus", state.data.cache?.served_from_cache ? `ข้อมูลจาก cache (${state.data.cache.cache_age_seconds}s)` : "ดึงข้อมูลรอบใหม่");

  renderProvinceSituation();
  renderDischarges();
  renderWeather();
  renderBangkokPerimeter();
}

function renderProvinceSituation() {
  const summary = state.data.executive_summary?.province_situation;
  const critical = summary?.critical ?? [];
  const watch = summary?.watch ?? [];
  const totalAffected = summary?.total_affected_provinces ?? (critical.length + watch.length);

  setText("provincePanelTitle", `จว.ประสบอุทกภัย ${totalAffected} จังหวัด`);
  setText("provinceMapSummary", `ประสบอุทกภัย ${totalAffected} จังหวัด`);
  renderProvinceStatusMap(critical, watch);
  document.getElementById("provinceAffectedAreas").innerHTML = renderProvinceAreaList([...critical, ...watch], "ไม่พบจังหวัดประสบอุทกภัย");
  renderImpactSummary(summary?.impact_summary);
}

function renderProvinceStatusMap(criticalRows, watchRows) {
  const criticalMap = new Map(criticalRows.map((row) => [normalizeProvinceName(row.province), row]));
  const watchMap = new Map(watchRows.map((row) => [normalizeProvinceName(row.province), row]));
  const shapes = MAP_BOUNDARIES.provinces.map((shape) => {
    const key = normalizeProvinceName(shape.key);
    const critical = criticalMap.get(key);
    const watch = watchMap.get(key);
    const row = critical ?? watch ?? null;
    const status = critical ? "critical" : watch ? "watch" : "muted";
    const countText = critical ? "ระดับวิกฤต" : watch ? "ระดับเฝ้าระวัง" : "ไม่มีสถานะ";
    const title = row?.evidence?.station_name ? `${shape.name}: ${countText} (${row.evidence.station_name})` : `${shape.name}: ${countText}`;

    return `
      <g class="map-region province-region ${status}" tabindex="0" role="img" aria-label="${escapeAttr(title)}">
        <title>${escapeHtml(title)}</title>
        <path d="${shape.path}"></path>
        ${renderMapLabel(shape.name, shape.label, status, "province-label")}
      </g>
    `;
  }).join("");

  document.getElementById("provinceStatusMap").innerHTML = `
    <svg viewBox="0 0 520 760" role="img" aria-label="แผนที่ประเทศไทยแสดงสถานะจังหวัดประสบอุทกภัยและเฝ้าระวัง">
      ${shapes}
    </svg>
  `;

  const provinceMapSource = document.getElementById("provinceMapSource");
  if (provinceMapSource) {
    provinceMapSource.innerHTML = renderProvinceSourceFoot([...criticalRows, ...watchRows]);
  }
}

function renderDischarges() {
  const rows = state.data.executive_summary?.key_discharges ?? [];
  const container = document.getElementById("dischargeCards");
  if (!rows.length) {
    container.innerHTML = `<p class="note">ยังไม่พบข้อมูลอัตราระบายจากสถาบันสารสนเทศทรัพยากรน้ำ</p>`;
    return;
  }

  const chart = buildDischargeChart(rows);
  container.innerHTML = `
    <div class="discharge-chart-card">
      ${renderDischargeChart(chart)}
      <div class="discharge-legend">
        ${chart.series.map((item) => renderDischargeLegendItem(item, chart)).join("")}
      </div>
    </div>
    <footer class="source-foot">${renderDischargeSourceFoot(rows)}</footer>
  `;
}

function latestHistoryRow(rows) {
  return [...rows].reverse().find((row) => row.source_updated_at) ?? null;
}

function collectHistoryDates(rows) {
  const dates = new Set();
  for (const item of rows) {
    for (const row of item.history ?? []) {
      if (row.date) dates.add(row.date);
    }
  }
  return [...dates].sort();
}

function buildDischargeChart(rows) {
  const dates = collectHistoryDates(rows);
  const series = rows.map((item, index) => {
    const historyByDate = new Map((item.history ?? []).map((row) => [row.date, row.flow_rate]));
    const values = dates.map((date) => {
      const historyValue = historyByDate.get(date);
      if (Number.isFinite(historyValue)) return historyValue;
      const latestDate = toBangkokDateKey(item.station?.source_updated_at ?? item.station?.observed_at);
      return latestDate === date && Number.isFinite(item.station?.flow_rate) ? item.station.flow_rate : null;
    });
    return {
      id: item.station?.station_id ?? `flow-${index}`,
      title: item.title,
      color: DISCHARGE_COLORS[index % DISCHARGE_COLORS.length],
      values
    };
  });
  return {
    dates,
    firstDate: dates[0] ?? null,
    latestDate: dates.at(-1) ?? null,
    series
  };
}

const DISCHARGE_COLORS = ["#0f766e", "#b45309", "#2563eb", "#7c3aed"];

function renderDischargeChart(chart) {
  const width = 520;
  const height = 168;
  const pad = { top: 14, right: 18, bottom: 26, left: 36 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const allValues = chart.series.flatMap((item) => item.values).filter(Number.isFinite);
  const yMax = niceChartMax(Math.max(...allValues, 1));
  const yFor = (value) => pad.top + plotHeight - (value / yMax) * plotHeight;
  const xFor = (index) => chart.dates.length <= 1
    ? pad.left
    : pad.left + (index / (chart.dates.length - 1)) * plotWidth;

  const lines = chart.series.map((item) => {
    const points = item.values
      .map((value, index) => {
        if (!Number.isFinite(value)) return null;
        const y = yFor(value);
        return `${roundSvg(xFor(index))},${roundSvg(y)}`;
      })
      .filter(Boolean);
    if (points.length < 2) return "";
    return `<polyline class="discharge-line" points="${points.join(" ")}" stroke="${item.color}"></polyline>`;
  }).join("");

  const dots = chart.series.map((item) => item.values.map((value, index) => {
    if (!Number.isFinite(value)) return "";
    const y = yFor(value);
    return `<circle class="discharge-dot" cx="${roundSvg(xFor(index))}" cy="${roundSvg(y)}" r="2.4" fill="${item.color}"></circle>`;
  }).join("")).join("");
  const midValue = yMax / 2;

  return `
    <svg class="discharge-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="กราฟแนวโน้มอัตราระบายและอัตราการไหลจุดสำคัญ">
      <line class="chart-axis" x1="${pad.left}" y1="${pad.top + plotHeight}" x2="${width - pad.right}" y2="${pad.top + plotHeight}"></line>
      <line class="chart-grid" x1="${pad.left}" y1="${pad.top + plotHeight * 0.5}" x2="${width - pad.right}" y2="${pad.top + plotHeight * 0.5}"></line>
      ${chart.dates.map((date, index) => `<line class="chart-tick" x1="${roundSvg(xFor(index))}" y1="${pad.top}" x2="${roundSvg(xFor(index))}" y2="${pad.top + plotHeight}"></line>`).join("")}
      ${lines}
      ${dots}
      <text class="chart-y-label" x="${pad.left - 5}" y="${pad.top + 4}" text-anchor="end">${escapeHtml(formatFlowCompact(yMax))}</text>
      <text class="chart-y-label" x="${pad.left - 5}" y="${pad.top + plotHeight * 0.5 + 4}" text-anchor="end">${escapeHtml(formatFlowCompact(midValue))}</text>
      <text class="chart-y-label" x="${pad.left - 5}" y="${pad.top + plotHeight + 4}" text-anchor="end">0</text>
      <text class="chart-label" x="${pad.left}" y="${height - 7}" text-anchor="start">${escapeHtml(formatHistoryDate(chart.firstDate))}</text>
      <text class="chart-label" x="${width - pad.right}" y="${height - 7}" text-anchor="end">${escapeHtml(formatHistoryDate(chart.latestDate))}</text>
    </svg>
  `;
}

function niceChartMax(value) {
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const fraction = value / magnitude;
  const niceFraction = fraction <= 1 ? 1
    : fraction <= 2 ? 2
      : fraction <= 2.5 ? 2.5
        : fraction <= 5 ? 5
          : 10;
  return niceFraction * magnitude;
}

function renderDischargeLegendItem(item, chart) {
  const firstIndex = firstFiniteIndex(item.values);
  const latestIndex = latestFiniteIndex(item.values);
  const firstValue = item.values[firstIndex];
  const latestValue = item.values[latestIndex];
  const firstLabel = formatHistoryDate(chart.dates[firstIndex]);
  const latestLabel = formatHistoryDate(chart.dates[latestIndex]);
  return `
    <div class="discharge-legend-item">
      <span class="series-dot" style="background:${item.color}"></span>
      <strong>${escapeHtml(item.title)}</strong>
      <small>${firstLabel} ${formatFlowCompact(firstValue)} → ${latestLabel} ${formatFlowCompact(latestValue)}</small>
    </div>
  `;
}

function firstFiniteIndex(values) {
  const index = values.findIndex(Number.isFinite);
  return index === -1 ? 0 : index;
}

function latestFiniteIndex(values) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (Number.isFinite(values[index])) return index;
  }
  return values.length - 1;
}

function renderDischargeSourceFoot(rows) {
  const records = rows
    .flatMap((item) => [item.station, ...(item.history ?? [])])
    .filter(Boolean);
  const sources = new Map();
  for (const record of records) {
    if (record.source_name && !sources.has(record.source_name)) {
      sources.set(record.source_name, record.source_url ?? null);
    }
  }
  const latest = records
    .map((record) => record.source_updated_at ?? record.observed_at ?? record.fetched_at)
    .filter(Boolean)
    .sort()
    .at(-1);
  const sourceText = [...sources.entries()].map(([name, url]) => {
    const safeName = escapeHtml(name);
    return url ? `<a href="${escapeAttr(url)}" target="_blank" rel="noreferrer">${safeName}</a>` : safeName;
  }).join(", ");
  return `ที่มา: ${sourceText || "-"}, ${formatCompactDateTime(latest)}`;
}

function renderWeather() {
  const forecast = state.data.weather_forecast;
  const tide = state.data.tide_forecast;
  const summary = document.getElementById("weatherSummary");
  const days = document.getElementById("weatherDays");

  if (!forecast?.days?.length) {
    summary.innerHTML = `<p class="note">ยังไม่พบข้อมูลพยากรณ์ 7 วันจากกรมอุตุ</p>`;
    days.innerHTML = "";
    return;
  }

  const tideByDate = new Map((tide?.days ?? []).map((day) => [day.date, day]));
  days.innerHTML = forecast.days.map((day) => `
    <article class="weather-day ${weatherRainClass(day.rain_percent)}">
      <i class="weather-icon ${weatherIconClass(day.rain_percent)}" aria-hidden="true"></i>
      <strong>${formatDateShort(day.date)}</strong>
      <small>ฝน ${formatNullable(day.rain_percent, "%")}</small>
      <em>${formatNullable(day.temp_min_c, "°C")} - ${formatNullable(day.temp_max_c, "°C")}</em>
      ${renderTideInline(tideByDate.get(toBangkokDateKey(day.date)))}
    </article>
  `).join("");

  summary.innerHTML = `
    <footer class="source-foot weather-source">${renderEvidenceFoot(forecast)}</footer>
    <footer class="source-foot tide-source">${renderTideSourceFoot(tide)}</footer>
  `;
}

function renderTideInline(day) {
  if (!day || !Number.isFinite(day.max_value_m)) return `<b class="tide-inline muted">หนุน -</b>`;
  return `<b class="tide-inline ${tideLevelClass(day.max_value_m)}">หนุน ${formatNumber(day.max_value_m)} ม.รทก.</b>`;
}

function tideLevelClass(value) {
  if (value > 2) return "tide-critical";
  if (value >= 1.7) return "tide-watch";
  return "tide-normal";
}

function renderTideSourceFoot(tide) {
  if (!tide?.source_name) return "ที่มา: น้ำทะเลหนุน -";
  const name = renderSourceName(tide);
  return `ที่มา: ${name}, ${formatCompactDateOnly(tide.source_updated_at ?? tide.fetched_at)} · สถานีตรวจวัดระดับน้ำป้อมพระจุลจอมเกล้า`;
}

function weatherIconClass(rainPercent) {
  if (rainPercent >= 70) return "storm";
  if (rainPercent >= 50) return "rain";
  if (rainPercent >= 30) return "shower";
  return "cloud";
}

function weatherRainClass(rainPercent) {
  if (rainPercent >= 70) return "rain-heavy";
  if (rainPercent >= 50) return "rain-medium";
  if (rainPercent >= 30) return "rain-light";
  return "rain-low";
}

function renderBangkokPerimeter() {
  const summary = state.data.executive_summary?.bangkok_perimeter ?? {};
  const criticalDistricts = summary.bangkok_critical_districts ?? [];
  const bangkokWatch = summary.bangkok_watch_areas ?? [];

  setText("bangkokMapSummary", `พบจุดวิกฤตใน ${criticalDistricts.length} เขต · จุดเฝ้าระวังใน ${bangkokWatch.length} เขต`);
  renderBangkokDistrictMap(criticalDistricts, bangkokWatch);
  document.getElementById("bangkokCriticalAreas").innerHTML = renderBangkokCriticalAreaList(criticalDistricts, "ไม่พบเขตที่มีจุดน้ำระดับวิกฤต");
  document.getElementById("bangkokWatchAreas").innerHTML = renderBulletAreaList(bangkokWatch, "ไม่พบเขตต้องเฝ้าระวัง");
}

function renderBangkokDistrictMap(criticalDistricts, watchDistricts) {
  const criticalMap = new Map(criticalDistricts.map((row) => [normalizeDistrictName(row.name), row]));
  const watchMap = new Map(watchDistricts.map((row) => [normalizeDistrictName(row.name), row]));
  const shapes = MAP_BOUNDARIES.bangkokDistricts.map((shape) => {
    const key = normalizeDistrictName(shape.key);
    const critical = criticalMap.get(key);
    const watch = watchMap.get(key);
    const row = critical ?? watch ?? null;
    const status = critical ? "critical" : watch ? "watch" : "muted";
    const countText = critical ? `${critical.stations.length} จุดวิกฤต` : watch ? `${watch.stations.length} จุดเฝ้าระวัง` : "ไม่มีสถานะ";
    const title = row?.stations?.[0]?.station_name ? `${shape.name}: ${countText} (${row.stations[0].station_name})` : `${shape.name}: ${countText}`;

    return `
      <g class="map-region district-region ${status}" tabindex="0" role="img" aria-label="${escapeAttr(title)}">
        <title>${escapeHtml(title)}</title>
        <path d="${shape.path}"></path>
        ${renderMapLabel(shape.name, shape.label, status, "district-label")}
      </g>
    `;
  }).join("");

  document.getElementById("bangkokDistrictMap").innerHTML = `
    <svg viewBox="0 0 760 540" role="img" aria-label="แผนที่กรุงเทพมหานคร 50 เขต">
      ${shapes}
    </svg>
  `;

  const evidence = criticalDistricts[0]?.stations?.[0] ?? watchDistricts[0]?.stations?.[0];
  document.getElementById("bangkokMapSource").innerHTML = renderEvidenceFoot(evidence);
}

function renderBulletAreaList(rows, emptyText) {
  if (!rows.length) return `<p class="note">${escapeHtml(emptyText)}</p>`;
  const items = rows.map((row) => {
    const areaName = row.name ?? row.province ?? "-";
    const isProvinceReport = Array.isArray(row.districts);
    const details = isProvinceReport
      ? row.districts.filter(Boolean).join(", ")
      : (row.stations ?? []).slice(0, 3).map((station) => station.station_name).filter(Boolean).join(", ");
    const morePoints = !isProvinceReport && (row.stations ?? []).length > 3 ? "..." : "";
    return `<li>${renderTrendMark(row.trend)}<strong>${escapeHtml(areaName)}</strong>${details ? ` (${escapeHtml(details)}${morePoints})` : ""}</li>`;
  }).join("");
  return `<ul>${items}</ul>${renderBulletSource(rows)}`;
}

function renderProvinceAreaList(rows, emptyText) {
  if (!rows.length) return `<p class="note">${escapeHtml(emptyText)}</p>`;
  const items = rows.map((row) => {
    const areaName = row.province ?? "-";
    const districts = Array.isArray(row.districts) ? row.districts.filter(Boolean) : [];
    const overbank = uniqueProvinceOverbankPoints(row.overbank_stations ?? []);
    const details = [
      ...districts.map((district) => escapeHtml(district)),
      ...overbank.map(renderProvinceOverbankPoint)
    ];
    return `<li>${renderTrendMark(row.trend)}<strong>${escapeHtml(areaName)}</strong>${details.length ? ` (${details.join(", ")})` : ""}</li>`;
  }).join("");
  return `<ul>${items}</ul>${renderProvinceSourceFoot(rows)}`;
}

function renderProvinceOverbankPoint(station) {
  const district = station.district ? `${escapeHtml(station.district)}: ` : "";
  const gap = Number.isFinite(station.water_gap_to_bank) ? ` +${formatNumber(station.water_gap_to_bank)} ม.` : "";
  return `<span class="overbank-point">${district}${escapeHtml(station.station_name ?? "น้ำล้นตลิ่ง")}${gap}</span>`;
}

function uniqueProvinceOverbankPoints(stations) {
  const selected = [];
  const keys = new Set();
  for (const station of stations) {
    const key = `${station.district ?? ""}:${station.station_name ?? ""}`;
    if (keys.has(key)) continue;
    keys.add(key);
    selected.push(station);
  }
  return selected.slice(0, 3);
}

function renderBangkokCriticalAreaList(rows, emptyText) {
  if (!rows.length) return `<p class="note">${escapeHtml(emptyText)}</p>`;
  const items = rows.map((row) => {
    const areaName = row.name ?? "-";
    const roadFloods = uniqueRoadFloodPoints((row.stations ?? [])
      .filter((station) => station.category === "Road Flood" && Number.isFinite(station.water_level) && station.water_level >= 15));
    const details = roadFloods.length
      ? roadFloods.map(renderRoadFloodPoint).join(", ")
      : (row.stations ?? []).slice(0, 3).map((station) => escapeHtml(station.station_name)).filter(Boolean).join(", ");
    const morePoints = !roadFloods.length && (row.stations ?? []).length > 3 ? "..." : "";
    return `<li><strong>${escapeHtml(areaName)}</strong>${details ? ` (${details}${morePoints})` : ""}</li>`;
  }).join("");
  return `<ul>${items}</ul>${renderBulletSource(rows)}`;
}

function renderRoadFloodPoint(station) {
  const className = station.water_level >= 20 ? "road-depth-critical" : "road-depth-watch";
  return `<span class="road-flood-point ${className}">${escapeHtml(station.station_name)}</span>`;
}

function uniqueRoadFloodPoints(stations) {
  const selected = [];
  const keys = [];
  const sorted = [...stations].sort((a, b) => {
    const updatedDiff = Date.parse(b.source_updated_at ?? 0) - Date.parse(a.source_updated_at ?? 0);
    return updatedDiff || b.water_level - a.water_level || a.station_name.localeCompare(b.station_name, "th");
  });

  for (const station of sorted) {
    const key = roadFloodKey(station.station_name);
    if (keys.some((current) => current.includes(key) || key.includes(current))) continue;
    keys.push(key);
    selected.push(station);
  }

  return selected.sort((a, b) => b.water_level - a.water_level || a.station_name.localeCompare(b.station_name, "th"));
}

function roadFloodKey(name) {
  return String(name ?? "")
    .replaceAll("ฎ", "ฏ")
    .replace(/ถนน|ถ\.|ซอย|ซ\.|ช่วง|บริเวณ|ร้าน|และจุดใกล้เคียง/g, "")
    .replace(/[()\s.]/g, "")
    .trim();
}

function renderImpactSummary(summary) {
  const container = document.getElementById("impactSummary");
  if (!container) return;
  if (!summary) {
    container.innerHTML = `<p class="note">ยังไม่พบยอดผลกระทบรวมจากรายงาน ปภ.</p>`;
    return;
  }

  container.innerHTML = `
    <div class="impact-grid">
      <div>
        <span>ปชช.ได้รับผลกระทบ</span>
        <strong>${formatNumber(summary.affected_households)} ครัวเรือน</strong>
        <small>${formatNumber(summary.affected_people)} คน</small>
        <small>${formatTopAffectedHouseholds(summary.top_affected_households)}</small>
      </div>
      <div>
        <span>ผู้เสียชีวิต</span>
        <strong>${formatNumber(summary.deaths)} ราย</strong>
        <small>${formatDeathDetails(summary.death_details)}</small>
      </div>
    </div>
  `;
}

function formatDeathDetails(details = []) {
  if (!Array.isArray(details) || !details.length) return "";
  return `(${details.map((item) => `จ.${item.province} ${formatNumber(item.deaths)} ราย`).join(", ")})`;
}

function formatTopAffectedHouseholds(rows = []) {
  if (!Array.isArray(rows) || !rows.length) return "";
  return `(${rows.map((item) => `${formatProvinceShort(item.province)} ${formatNumber(item.households)} ครัวเรือน`).join(", ")})`;
}

function formatProvinceShort(province) {
  return province === "กรุงเทพมหานคร" ? "กทม." : province;
}

function renderTrendMark(trend) {
  if (trend === "rising") return `<span class="trend-mark rising" title="ระดับน้ำเพิ่มขึ้น" aria-label="ระดับน้ำเพิ่มขึ้น">↑</span>`;
  if (trend === "falling") return `<span class="trend-mark falling" title="ระดับน้ำลดลง" aria-label="ระดับน้ำลดลง">↓</span>`;
  if (trend === "stable") return `<span class="trend-mark stable" title="ระดับน้ำทรงตัว" aria-label="ระดับน้ำทรงตัว">-</span>`;
  return "";
}

function renderBulletSource(rows) {
  const firstStation = rows.flatMap((row) => row.stations ?? []).find(Boolean);
  return `<footer class="source-foot">${firstStation ? renderEvidenceFoot(firstStation) : "ที่มา: -"}</footer>`;
}

function renderProvinceSourceFoot(rows) {
  const records = rows.flatMap((row) => [row.evidence, ...(row.stations ?? []), ...(row.overbank_stations ?? [])]).filter(Boolean);
  if (!records.length) return "ที่มา: -";
  const sources = new Map();
  for (const record of records) {
    const name = record.source_name;
    if (!name || sources.has(name)) continue;
    sources.set(name, record.source_url ?? null);
  }
  const latest = records
    .map((record) => record.source_updated_at ?? record.observed_at ?? record.fetched_at)
    .filter(Boolean)
    .sort()
    .at(-1);
  const sourceText = [...sources.entries()].map(([name, url]) => {
    const safeName = escapeHtml(name);
    return url ? `<a href="${escapeAttr(url)}" target="_blank" rel="noreferrer">${safeName}</a>` : safeName;
  }).join(", ");
  return `ที่มา: ${sourceText || "-"}, ${formatCompactDateTime(latest)}`;
}

function renderEvidenceFoot(station) {
  if (!station) return "ที่มา: -";
  return `ที่มา: ${renderSourceName(station)}, ${formatCompactDateTime(station.source_updated_at ?? station.observed_at ?? station.fetched_at)}`;
}

function renderSourceName(record) {
  const name = escapeHtml(record.source_name ?? "-");
  if (!record.source_url) return name;
  return `<a href="${escapeAttr(record.source_url)}" target="_blank" rel="noreferrer">${name}</a>`;
}

function normalizeProvinceName(value) {
  const name = String(value ?? "").trim();
  if (name === "กรุงเทพฯ" || name === "กรุงเทพมหานคร") return "กรุงเทพมหานคร";
  if (name === "อยุธยา" || name === "พระนครศรีอยุธยา") return "พระนครศรีอยุธยา";
  return name;
}

function normalizeDistrictName(value) {
  return String(value ?? "").trim().replace(/^เขต/, "");
}

function renderMapLabel(name, label, status, className) {
  if (!Array.isArray(label)) return "";
  const [x, y] = label;
  const lines = wrapMapLabel(name);
  const startDy = lines.length === 1 ? 4 : -2;
  return `
    <text class="map-label ${className} ${status}" x="${x}" y="${y}" text-anchor="middle">
      ${lines.map((line, index) => `<tspan x="${x}" dy="${index === 0 ? startDy : 11}">${escapeHtml(line)}</tspan>`).join("")}
    </text>
  `;
}

function wrapMapLabel(name) {
  if (name.length <= 8) return [name];
  const splitAt = Math.ceil(name.length / 2);
  return [name.slice(0, splitAt), name.slice(splitAt)];
}

function formatBoundarySource(source) {
  return source?.name ?? "ไฟล์ขอบเขตแบบ GeoJSON";
}

function formatWater(station) {
  return Number.isFinite(station.water_level) ? `ระดับน้ำอ้างอิง ${formatNumber(station.water_level)} ม.รทก.` : "ระดับน้ำอ้างอิง -";
}

function formatGap(value) {
  if (!Number.isFinite(value)) return "ห่างตลิ่ง -";
  if (value > 0) return `สูงกว่าตลิ่ง ${formatNumber(value)} ม.`;
  if (value < 0) return `ต่ำกว่าตลิ่ง ${formatNumber(Math.abs(value))} ม.`;
  return "เท่าระดับตลิ่ง";
}

function formatTrend(trend) {
  if (trend === "rising") return "แนวโน้ม ↑";
  if (trend === "falling") return "แนวโน้ม ↓";
  if (trend === "flat") return "แนวโน้ม →";
  return "แนวโน้ม -";
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok"
  }).format(date);
}

function formatReportDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Bangkok"
  }).format(date);
}

function formatCompactDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  const parts = new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Bangkok"
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("day")} ${part("month")}${part("year")} ${part("hour")}.${part("minute")} น.`;
}

function formatCompactDateOnly(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  const parts = new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
    timeZone: "Asia/Bangkok"
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("day")} ${part("month")}${part("year")}`;
}

function formatDateShort(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Bangkok"
  }).format(date);
}

function formatHistoryDate(value) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00+07:00`);
  if (!Number.isFinite(date.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Bangkok"
  }).format(date);
}

function toBangkokDateKey(value) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Bangkok"
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function roundSvg(value) {
  return Math.round(value * 10) / 10;
}

function formatNullable(value, unit) {
  return Number.isFinite(value) ? `${formatNumber(value)}${unit}` : "-";
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("th-TH", { maximumFractionDigits: 2 }).format(value);
}

function formatFlowCompact(value) {
  if (!Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("th-TH", {
    maximumFractionDigits: 0,
    useGrouping: false
  }).format(value);
}

function setText(id, value) {
  document.getElementById(id).textContent = value;
}

function truncate(text, maxLength) {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => toast.classList.remove("visible"), 3600);
}
