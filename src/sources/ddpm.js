import { readFileSync } from "node:fs";
import { fetchJson, fetchTextHead } from "../services/http.js";
import { withFreshness } from "../services/normalize.js";

const CMS_URL = "https://direct.disaster.go.th/directing/cms?id=8728";
const CATALOG_SEARCH_URL = "https://catalog.disaster.go.th/api/3/action/package_search?q=%E0%B9%80%E0%B8%95%E0%B8%B7%E0%B8%AD%E0%B8%99%E0%B8%A0%E0%B8%B1%E0%B8%A2&rows=5";
const DDPM_REPORT_STALE_HOURS = 18;
const MANUAL_REPORT_URL = new URL("../../data/ddpm-manual-report.json", import.meta.url);
const DEFAULT_REPORT = {
  id: "165403",
  title: "รายงานสถานการณ์สาธารณภัย วันที่ 3 ต.ค เวลา 06.00 น.",
  url: "https://direct.disaster.go.th/directing/cms?id=8728",
  file_url: "https://backofficeminisite.disaster.go.th/upload/minisite/194/file_attach/191/a2b330c7c4aeac830b7d1c848499ee0d.pdf",
  source_updated_at: "2026-10-03T06:00:00+07:00",
  current_provinces: [
    "เพชรบูรณ์", "นครสวรรค์", "อุทัยธานี", "ลพบุรี", "สิงห์บุรี", "ชัยนาท", "สุพรรณบุรี", "กาญจนบุรี", "อ่างทอง",
    "สระบุรี", "พระนครศรีอยุธยา", "สมุทรปราการ", "ปทุมธานี", "นครปฐม", "ราชบุรี", "เพชรบุรี", "นครนายก",
    "ปราจีนบุรี", "ฉะเชิงเทรา", "สระแก้ว", "ชลบุรี", "ระยอง", "จันทบุรี", "บุรีรัมย์", "ชัยภูมิ", "สุรินทร์",
    "กรุงเทพมหานคร"
  ],
  current_details: [
    ["นครสวรรค์", "rising", 13013, 0, ["พยุหะคีรี", "แม่วงก์", "ตาคลี", "ไพศาลี", "ลาดยาว", "บรรพตพิสัย", "เก้าเลี้ยว", "เมืองฯ", "ชุมแสง", "ท่าตะโก", "ตากฟ้า", "โกรกพระ", "ชุมตาบง", "หนองบัว"]],
    ["อุทัยธานี", "rising", 4785, 0, ["หนองฉาง", "ห้วยคต", "สว่างอารมณ์", "หนองขาหย่าง", "บ้านไร่", "ลานสัก", "เมืองฯ", "ทัพทัน"]],
    ["ลพบุรี", "falling", 975, 0, ["บ้านหมี่"]],
    ["ชัยนาท", "rising", 5811, 0, ["เมืองฯ", "วัดสิงห์", "มโนรมย์", "สรรพยา", "หันคา", "หนองมะโมง", "สรรคบุรี", "เนินขาม"]],
    ["สิงห์บุรี", "rising", 989, 0, ["อินทร์บุรี", "พรหมบุรี", "เมืองฯ"]],
    ["สุพรรณบุรี", "rising", 23912, 0, ["บางปลาม้า", "สองพี่น้อง", "ดอนเจดีย์", "ศรีประจันต์", "เมืองฯ", "สามชุก", "เดิมบางนางบวช", "อู่ทอง", "ด่านช้าง"]],
    ["กาญจนบุรี", "falling", 8237, 2, ["ไทรโยค", "ห้วยกระเจา", "หนองปรือ", "พนมทวน", "ด่านมะขามเตี้ย", "ท่าม่วง", "ท่ามะกา", "บ่อพลอย", "ศรีสวัสดิ์", "ทองผาภูมิ", "เมืองฯ", "สังขละบุรี"]],
    ["อ่างทอง", "rising", 1938, 0, ["ป่าโมก", "ไชโย", "วิเศษชัยชาญ", "เมืองฯ", "สามโก้"]],
    ["สระบุรี", "falling", 3066, 1, ["หนองแซง", "เมืองฯ", "หนองแค", "หนองโดน", "วิหารแดง", "บ้านหมอ", "ดอนพุด", "เฉลิมพระเกียรติ"]],
    ["พระนครศรีอยุธยา", "rising", 48704, 1, ["เสนา", "บางบาล", "ผักไห่", "บางไทร", "เมืองฯ", "บางปะอิน", "บางปะหัน", "ลาดบัวหลวง", "นครหลวง", "วังน้อย", "อุทัย", "ท่าเรือ", "ภาชี", "บ้านแพรก", "บางซ้าย"]],
    ["สมุทรปราการ", "falling", 223346, 8, ["บางเสาธง", "บางบ่อ", "บางพลี", "เมืองฯ", "พระประแดง", "พระสมุทรเจดีย์"]],
    ["ปทุมธานี", "rising", 169724, 0, ["ธัญบุรี", "เมืองฯ", "สามโคก", "คลองหลวง", "ลำลูกกา", "หนองเสือ", "ลาดหลุมแก้ว"]],
    ["นครปฐม", "falling", 43687, 0, ["เมืองฯ", "กำแพงแสน", "นครชัยศรี", "พุทธมณฑล", "สามพราน", "บางเลน", "ดอนตูม"]],
    ["ราชบุรี", "rising", 15539, 0, ["โพธาราม", "บางแพ", "เมืองฯ", "ดำเนินสะดวก", "บ้านโป่ง", "วัดเพลง", "จอมบึง", "ปากท่อ", "สวนผึ้ง"]],
    ["เพชรบุรี", "rising", 6, 0, ["แก่งกระจาน"]],
    ["นครนายก", "rising", 49018, 0, ["ปากพลี", "เมืองฯ", "บ้านนา", "องครักษ์"]],
    ["ปราจีนบุรี", "rising", 46160, 0, ["กบินทร์บุรี", "นาดี", "ศรีมหาโพธิ", "เมืองฯ", "ประจันตคาม", "บ้านสร้าง", "ศรีมโหสถ"]],
    ["ฉะเชิงเทรา", "rising", 54647, 0, ["บางน้ำเปรี้ยว", "พนมสารคาม", "บางคล้า", "แปลงยาว", "ท่าตะเกียบ", "สนามชัยเขต", "เมืองฯ", "บ้านโพธิ์", "บางปะกง", "คลองเขื่อน", "ราชสาส์น"]],
    ["สระแก้ว", "falling", 5148, 6, ["อรัญประเทศ", "เมืองฯ"]],
    ["ชลบุรี", "falling", 118723, 0, ["เมืองฯ", "สัตหีบ", "พนัสนิคม", "ศรีราชา", "บางละมุง", "บ้านบึง", "หนองใหญ่", "เกาะจันทร์", "พานทอง", "บ่อทอง"]],
    ["ระยอง", "stable", 1310, 0, ["เมืองฯ", "แกลง"]],
    ["จันทบุรี", "falling", 7000, 2, ["นายายอาม", "ท่าใหม่"]],
    ["บุรีรัมย์", "falling", 428, 0, ["นางรอง", "ชำนิ"]],
    ["กรุงเทพมหานคร", "falling", 329000, 4, ["กรุงเทพมหานคร"]]
  ],
  affected_households: 1175292,
  affected_people: 3244091,
  deaths: 24,
  affected_provinces: [
    "เชียงราย", "แม่ฮ่องสอน", "เชียงใหม่", "ลำปาง", "แพร่", "ตาก", "เพชรบูรณ์", "พิษณุโลก", "กำแพงเพชร",
    "พิจิตร", "นครสวรรค์", "บุรีรัมย์", "ยโสธร", "ชัยภูมิ", "สุรินทร์", "นครราชสีมา", "อุทัยธานี", "ลพบุรี",
    "สิงห์บุรี", "ชัยนาท", "สุพรรณบุรี", "กาญจนบุรี", "อ่างทอง", "พระนครศรีอยุธยา", "สมุทรปราการ", "สระบุรี",
    "ปทุมธานี", "นนทบุรี", "นครปฐม", "ราชบุรี", "สมุทรสาคร", "เพชรบุรี", "นครนายก", "ปราจีนบุรี", "ฉะเชิงเทรา",
    "สระแก้ว", "ชลบุรี", "ระยอง", "จันทบุรี", "ตราด", "ชุมพร", "ระนอง", "สุราษฎร์ธานี", "กระบี่", "พังงา",
    "สตูล", "กรุงเทพมหานคร"
  ]
};
const LATEST_REPORT = loadManualReport() ?? DEFAULT_REPORT;

export async function collectDdpm() {
  const [cms, catalog] = await Promise.all([
    fetchTextHead(CMS_URL),
    fetchJson(CATALOG_SEARCH_URL)
  ]);

  const alerts = [
    normalizeCmsReport(cms),
    ...normalizeCatalog(catalog)
  ].filter(Boolean);

  const provinceSituation = buildDdpmProvinceSituation();

  return {
    source: {
      name: "กรมป้องกันและบรรเทาสาธารณภัย",
      url: CMS_URL,
      type: "report",
      ok: cms.ok || catalog.ok,
      fetched_at: new Date().toISOString(),
      source_updated_at: LATEST_REPORT.source_updated_at,
      error: cms.ok || catalog.ok ? provinceSituation.stale_reason : [cms.error, catalog.error].filter(Boolean).join("; "),
      is_stale: provinceSituation.is_stale,
      stale_reason: provinceSituation.stale_reason
    },
    stations: [],
    alerts,
    province_situation: provinceSituation
  };
}

function buildDdpmProvinceSituation() {
  const isStale = isReportStale(LATEST_REPORT.source_updated_at);
  const staleReason = isStale
    ? "ระบบยังไม่สามารถอ่านรายงาน ปภ. ฉบับใหม่จากหน้าเว็บต้นทางได้ จึงใช้รายงานล่าสุดที่ระบบมีลิงก์ไฟล์ทางการ"
    : null;
  const currentRows = LATEST_REPORT.current_details.map(([province, trend, households, deaths, districts]) => buildProvinceRow(province, trend === "rising" ? "critical" : "watch", {
    trend,
    households,
    deaths,
    districts,
    isStale,
    staleReason
  }));
  const provinceRows = currentRows.filter((row) => row.province !== "กรุงเทพมหานคร");
  return {
    critical: provinceRows.filter((row) => row.status === "critical"),
    watch: provinceRows.filter((row) => row.status === "watch"),
    normal: [],
    total_affected_provinces: LATEST_REPORT.total_affected_provinces ?? provinceRows.length,
    source_name: "กรมป้องกันและบรรเทาสาธารณภัย",
    source_url: LATEST_REPORT.file_url,
    source_updated_at: LATEST_REPORT.source_updated_at,
    report_title: LATEST_REPORT.title,
    is_stale: isStale,
    stale_reason: staleReason,
    impact_summary: {
      affected_households: LATEST_REPORT.affected_households,
      affected_people: LATEST_REPORT.affected_people,
      deaths: LATEST_REPORT.deaths,
      source_name: "กรมป้องกันและบรรเทาสาธารณภัย",
      source_url: LATEST_REPORT.file_url,
      source_updated_at: LATEST_REPORT.source_updated_at,
      is_stale: isStale,
      stale_reason: staleReason,
      top_affected_households: currentRows
        .filter((row) => Number.isFinite(row.affected_households) && row.affected_households > 0)
        .sort((a, b) => b.affected_households - a.affected_households)
        .slice(0, 3)
        .map((row) => ({ province: row.province, households: row.affected_households })),
      death_details: currentRows
        .filter((row) => row.deaths > 0)
        .map((row) => ({ province: row.province, deaths: row.deaths }))
    },
    methodology: "ใช้จังหวัดที่ ปภ. ระบุว่าปัจจุบันยังคงมีสถานการณ์ โดยแยกจังหวัดระดับน้ำเพิ่มขึ้นเป็นวิกฤต และระดับน้ำลดลง/ทรงตัวเป็นเฝ้าระวัง"
  };
}

function buildProvinceRow(province, status, details = {}) {
  const station = {
    station_id: `ddpm-${province}`,
    station_name: waterTrendText(details.trend),
    province,
    district: null,
    latitude: null,
    longitude: null,
    status,
    source_name: "กรมป้องกันและบรรเทาสาธารณภัย",
    source_url: LATEST_REPORT.file_url,
    source_type: "report",
    observed_at: LATEST_REPORT.source_updated_at,
    fetched_at: new Date().toISOString(),
    source_updated_at: LATEST_REPORT.source_updated_at,
    attribution_text: LATEST_REPORT.title,
    is_stale: details.isStale ?? false,
    stale_reason: details.staleReason ?? null
  };
  return {
    province,
    critical: status === "critical" ? 1 : 0,
    watch: status === "watch" ? 1 : 0,
    warning: 0,
    normal: 0,
    status,
    trend: details.trend ?? null,
    districts: details.districts ?? [],
    affected_households: details.households ?? null,
    deaths: details.deaths ?? null,
    is_stale: details.isStale ?? false,
    stale_reason: details.staleReason ?? null,
    stations: [station],
    evidence: station
  };
}

function isReportStale(sourceUpdatedAt) {
  const observed = Date.parse(sourceUpdatedAt);
  if (!Number.isFinite(observed)) return true;
  return Date.now() - observed > DDPM_REPORT_STALE_HOURS * 60 * 60 * 1000;
}

function waterTrendText(trend) {
  if (trend === "rising") return "ระดับน้ำเพิ่มขึ้น";
  if (trend === "falling") return "ระดับน้ำลดลง";
  if (trend === "stable") return "ระดับน้ำทรงตัว";
  return "ปัจจุบันยังคงมีสถานการณ์อุทกภัย";
}

function normalizeCmsReport(result) {
  return withFreshness({
    id: "ddpm-cms-8728",
    title: "รายงาน/ประกาศสถานการณ์สาธารณภัยจาก ปภ.",
    agency: "กรมป้องกันและบรรเทาสาธารณภัย",
    description: result.ok
      ? "เปิดหน้าเอกสารทางการได้ แต่ MVP นี้ไม่ scrape เนื้อหา HTML โดยตรง ให้กดลิงก์ต้นทางเพื่อตรวจรายละเอียดล่าสุด"
      : `ยังเปิดหน้าเอกสารไม่ได้ (${result.error ?? result.status ?? "unknown"})`,
    source_name: "กรมป้องกันและบรรเทาสาธารณภัย",
    source_url: CMS_URL,
    source_type: "report",
    observed_at: null,
    fetched_at: result.fetchedAt,
    source_updated_at: null,
    attribution_text: "กรมป้องกันและบรรเทาสาธารณภัย",
    status: "no_data",
    is_stale: true,
    stale_reason: "แหล่งนี้เป็นหน้าเอกสาร/CMS ไม่ใช่ sensor API จึงต้องตรวจเวลาในเอกสารต้นทาง"
  });
}

function normalizeCatalog(result) {
  const rows = result.data?.result?.results;
  if (!result.ok || !Array.isArray(rows)) return [];
  return rows.slice(0, 3).map((item) => withFreshness({
    id: `ddpm-catalog-${item.id}`,
    title: item.title ?? item.name ?? "ชุดข้อมูลสาธารณภัย",
    agency: "กรมป้องกันและบรรเทาสาธารณภัย",
    description: item.notes ?? item.objective?.join(", ") ?? "ชุดข้อมูลจาก catalog.disaster.go.th",
    source_name: "กรมป้องกันและบรรเทาสาธารณภัย",
    source_url: `https://catalog.disaster.go.th/dataset/${item.name}`,
    source_type: "report",
    observed_at: toIso(item.metadata_modified ?? item.metadata_created),
    fetched_at: result.fetchedAt,
    source_updated_at: toIso(item.metadata_modified ?? item.metadata_created),
    attribution_text: "DDPM Open Data Catalog",
    status: "no_data"
  }));
}

function toIso(value) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function loadManualReport() {
  try {
    const raw = readFileSync(MANUAL_REPORT_URL, "utf8");
    const data = JSON.parse(raw);
    if (!data?.enabled) return null;
    return {
      ...DEFAULT_REPORT,
      ...data,
      url: data.url ?? DEFAULT_REPORT.url,
      file_url: data.file_url ?? DEFAULT_REPORT.file_url,
      current_details: Array.isArray(data.current_details) && data.current_details.length
        ? data.current_details
        : DEFAULT_REPORT.current_details,
      affected_provinces: Array.isArray(data.affected_provinces) && data.affected_provinces.length
        ? data.affected_provinces
        : DEFAULT_REPORT.affected_provinces
    };
  } catch {
    return null;
  }
}
