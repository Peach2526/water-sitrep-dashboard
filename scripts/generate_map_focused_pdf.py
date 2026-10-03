import json
import math
import re
from datetime import datetime, timezone, timedelta
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "tmp/pdfs/dashboard-data.json"
MAP_PATH = ROOT / "public/map-data.js"
LOGO_PATH = ROOT / "public/isoc-seal.jpg"
OUT_PATH = ROOT / "output/pdf/water-sitrep-a4-map-focused.pdf"

BKK_TZ = timezone(timedelta(hours=7))

RED = colors.HexColor("#cf3035")
ORANGE = colors.HexColor("#d19a00")
YELLOW = colors.HexColor("#f2cc4d")
GREEN = colors.HexColor("#16875f")
TEAL = colors.HexColor("#0d6f66")
BLUE = colors.HexColor("#1d6fd8")
INK = colors.HexColor("#17231f")
MUTED = colors.HexColor("#60706b")
LINE = colors.HexColor("#cbd6d1")
PALE = colors.HexColor("#f5f8f6")
NO_STATUS = colors.HexColor("#e5ece8")


def register_fonts():
    regular = Path("/System/Library/Fonts/Supplemental/Tahoma.ttf")
    bold = Path("/System/Library/Fonts/Supplemental/Tahoma Bold.ttf")
    pdfmetrics.registerFont(TTFont("Thai", str(regular)))
    pdfmetrics.registerFont(TTFont("Thai-Bold", str(bold)))


def load_data():
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    raw = MAP_PATH.read_text(encoding="utf-8")
    match = re.search(r"window\.MAP_SHAPES\s*=\s*(\{.*\});?\s*$", raw, re.S)
    if not match:
        raise RuntimeError("Cannot find MAP_SHAPES in map-data.js")
    maps = json.loads(match.group(1))
    return data, maps


def dt(value):
    if not value:
        return None
    text = str(value).replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(text).astimezone(BKK_TZ)
    except ValueError:
        return None


def thai_short_date(value, with_time=True):
    parsed = dt(value)
    if not parsed:
        return "-"
    months = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]
    year = (parsed.year + 543) % 100
    out = f"{parsed.day} {months[parsed.month]} {year:02d}"
    if with_time:
        out += f" {parsed.hour:02d}.{parsed.minute:02d} น."
    return out


def thai_full_date(value):
    parsed = dt(value)
    if not parsed:
        parsed = datetime.now(BKK_TZ)
    months = ["", "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"]
    return f"{parsed.day} {months[parsed.month]} {parsed.year + 543}"


def fmt_num(value):
    if value is None:
        return "-"
    if isinstance(value, float) and not value.is_integer():
        return f"{value:,.2f}"
    return f"{int(value):,}"


def draw_text(c, text, x, y, size=8, color=INK, font="Thai", align="left"):
    c.setFont(font, size)
    c.setFillColor(color)
    if align == "right":
        c.drawRightString(x, y, str(text))
    elif align == "center":
        c.drawCentredString(x, y, str(text))
    else:
        c.drawString(x, y, str(text))


def wrap_text(text, max_chars):
    words = str(text).split()
    lines = []
    cur = ""
    for word in words:
        trial = (cur + " " + word).strip()
        if len(trial) <= max_chars:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines


def card(c, x, y, w, h, radius=6, fill=colors.white, stroke=LINE):
    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.setLineWidth(0.65)
    c.roundRect(x, y, w, h, radius, stroke=1, fill=1)


def parse_path_points(path_data):
    nums = []
    for token in re.findall(r"[MLZmlz]|-?\d+(?:\.\d+)?", path_data):
        nums.append(token)
    commands = []
    i = 0
    current = None
    while i < len(nums):
        token = nums[i]
        if token.upper() == "Z":
            commands.append(("Z",))
            current = None
            i += 1
            continue
        if token.upper() in ("M", "L"):
            cmd = token.upper()
            if i + 2 >= len(nums):
                break
            x = float(nums[i + 1])
            y = float(nums[i + 2])
            commands.append((cmd, x, y))
            current = cmd
            i += 3
            continue
        if current in ("M", "L") and i + 1 < len(nums):
            x = float(nums[i])
            y = float(nums[i + 1])
            commands.append(("L", x, y))
            i += 2
            continue
        i += 1
    return commands


def command_bounds(shapes):
    xs, ys = [], []
    parsed = []
    for item in shapes:
        commands = parse_path_points(item["path"])
        parsed.append((item, commands))
        for cmd in commands:
            if len(cmd) == 3:
                xs.append(cmd[1])
                ys.append(cmd[2])
    return parsed, (min(xs), min(ys), max(xs), max(ys))


def draw_shape_map(c, shapes, status_map, box, label_mode="province"):
    x, y, w, h = box
    parsed, (minx, miny, maxx, maxy) = command_bounds(shapes)
    source_w = maxx - minx
    source_h = maxy - miny
    scale = min(w / source_w, h / source_h)
    draw_w = source_w * scale
    draw_h = source_h * scale
    ox = x + (w - draw_w) / 2
    oy = y + (h - draw_h) / 2

    centers = {}
    for item, commands in parsed:
        status = status_map.get(item["name"], "none")
        fill = {"critical": RED, "watch": YELLOW}.get(status, NO_STATUS)
        p = c.beginPath()
        item_xs, item_ys = [], []
        for cmd in commands:
            if cmd[0] == "Z":
                p.close()
                continue
            px = ox + (cmd[1] - minx) * scale
            py = oy + draw_h - (cmd[2] - miny) * scale
            item_xs.append(px)
            item_ys.append(py)
            if cmd[0] == "M":
                p.moveTo(px, py)
            else:
                p.lineTo(px, py)
        c.setFillColor(fill)
        c.setStrokeColor(colors.HexColor("#aab6b2"))
        c.setLineWidth(0.45)
        c.drawPath(p, stroke=1, fill=1)
        if item_xs and item_ys:
            centers[item["name"]] = ((min(item_xs) + max(item_xs)) / 2, (min(item_ys) + max(item_ys)) / 2)

    for name, (cx, cy) in centers.items():
        status = status_map.get(name, "none")
        if label_mode == "bangkok" and status == "none":
            continue
        if label_mode == "bangkok":
            size = 4.2
        else:
            size = 3.2 if status == "none" else 4.2
        color = colors.white if status == "critical" else colors.HexColor("#45534f")
        if status in ("critical", "watch") or label_mode == "bangkok":
            draw_text(c, name.replace("พระนครศรีอยุธยา", "อยุธยา"), cx, cy - size / 3, size=size, color=color, font="Thai-Bold", align="center")


def source_line(c, text, x, y, w):
    c.setStrokeColor(LINE)
    c.line(x, y + 10, x + w, y + 10)
    draw_text(c, text, x, y, size=6.6, color=MUTED)


def draw_stat(c, x, y, w, h, title, value, color):
    card(c, x, y, w, h, radius=5, fill=colors.white)
    draw_text(c, title, x + 7, y + h - 12, size=6.7, color=MUTED, font="Thai-Bold")
    draw_text(c, value, x + 7, y + 7, size=14.5, color=color, font="Thai-Bold")


def make_status_sets(data):
    situation = data["executive_summary"]["province_situation"]
    critical = {item["province"] for item in situation.get("critical", [])}
    watch = {item["province"] for item in situation.get("watch", [])}
    bkk = data["executive_summary"]["bangkok_perimeter"]
    bkk_critical = {item["name"] for item in bkk.get("bangkok_critical_districts", [])}
    bkk_watch = {item["name"] for item in bkk.get("bangkok_watch_districts", [])}
    return critical, watch, bkk_critical, bkk_watch


def draw_flow_chart(c, data, x, y, w, h):
    card(c, x, y, w, h)
    draw_text(c, "อัตราระบาย/อัตราการไหลจุดสำคัญ", x + 8, y + h - 14, size=11, font="Thai-Bold")
    draw_text(c, "ลบ.ม./วินาที", x + w - 8, y + h - 14, size=7, color=MUTED, font="Thai-Bold", align="right")
    left, bottom = x + 24, y + 31
    chart_w, chart_h = w - 46, h - 58
    flows = data["executive_summary"]["key_discharges"]
    all_values = [pt.get("flow_rate") for f in flows for pt in f.get("history", []) if pt.get("flow_rate") is not None]
    max_v = max(all_values) if all_values else 1
    max_v = math.ceil(max_v / 500) * 500
    colors_by = [TEAL, colors.HexColor("#b45a08"), BLUE, colors.HexColor("#7b3fe4")]
    c.setStrokeColor(colors.HexColor("#edf1ef"))
    c.setLineWidth(0.45)
    for i in range(4):
        yy = bottom + chart_h * i / 3
        c.line(left, yy, left + chart_w, yy)
    c.setStrokeColor(LINE)
    c.line(left, bottom, left + chart_w, bottom)
    c.line(left, bottom, left, bottom + chart_h)
    draw_text(c, "25 ก.ย.", left, y + 14, size=6.5, color=MUTED, font="Thai-Bold")
    draw_text(c, "3 ต.ค.", left + chart_w, y + 14, size=6.5, color=MUTED, font="Thai-Bold", align="right")

    legend_y = y + 8
    for idx, flow in enumerate(flows[:4]):
        pts = flow.get("history", [])
        vals = [p.get("flow_rate") for p in pts]
        color = colors_by[idx % len(colors_by)]
        good = [(i, v) for i, v in enumerate(vals) if v is not None]
        if len(good) >= 2:
            c.setStrokeColor(color)
            c.setLineWidth(1.5)
            last = None
            for i, v in good:
                px = left + (chart_w * i / max(1, len(vals) - 1))
                py = bottom + chart_h * (v / max_v)
                if last:
                    c.line(last[0], last[1], px, py)
                c.setFillColor(color)
                c.circle(px, py, 1.4, stroke=0, fill=1)
                last = (px, py)
        lx = x + 14 + (idx % 2) * (w / 2)
        ly = legend_y + (1 - idx // 2) * 10
        latest = flow.get("station", {}).get("flow_rate")
        first = next((p.get("flow_rate") for p in flow.get("history", []) if p.get("flow_rate") is not None), None)
        c.setFillColor(color)
        c.circle(lx, ly + 2, 2.2, stroke=0, fill=1)
        draw_text(c, f"{flow.get('title','-')} {fmt_num(first)}-{fmt_num(latest)}", lx + 6, ly, size=6.2, color=INK, font="Thai")


def draw_weather_tide(c, data, x, y, w, h):
    card(c, x, y, w, h)
    draw_text(c, "พยากรณ์อากาศ / น้ำทะเลหนุน", x + 8, y + h - 13, size=10.5, font="Thai-Bold")
    draw_text(c, "กทม. / ป้อมพระจุลฯ", x + w - 8, y + h - 13, size=6.7, color=MUTED, font="Thai-Bold", align="right")
    days = data["weather_forecast"].get("days", [])
    tides = data["tide_forecast"].get("days", [])
    n = min(7, len(days), len(tides))
    gap = 3
    cell_w = (w - 16 - gap * (n - 1)) / n
    base_y = y + 18
    for i in range(n):
        wx = x + 8 + i * (cell_w + gap)
        rain = days[i].get("rain_percent")
        tide = tides[i].get("max_value_m")
        fill = colors.HexColor("#eaf6fb")
        if rain and rain >= 60:
            fill = colors.HexColor("#fff4d8")
        if rain and rain >= 70:
            fill = colors.HexColor("#fdebe2")
        card(c, wx, base_y, cell_w, h - 38, radius=5, fill=fill)
        parsed = dt(days[i].get("date"))
        label = f"{parsed.day} ต.ค." if parsed else days[i].get("date_label", "-")
        draw_text(c, label, wx + 4, base_y + h - 49, size=7.2, font="Thai-Bold")
        draw_text(c, f"ฝน {rain}%", wx + 4, base_y + h - 59, size=5.8, color=MUTED)
        draw_text(c, f"{days[i].get('temp_min_c','-')}°-{days[i].get('temp_max_c','-')}°C", wx + 4, base_y + h - 68, size=5.6, color=MUTED)
        tide_color = GREEN if tide < 1.7 else ORANGE if tide <= 2.0 else RED
        draw_text(c, f"หนุน {tide:.2f}", wx + 4, base_y + 5, size=6.2, color=tide_color, font="Thai-Bold")
    source_line(c, f"ที่มา: กรมอุตุนิยมวิทยา, {thai_short_date(data['weather_forecast'].get('source_updated_at'))}  |  กรมอุทกศาสตร์ กองทัพเรือ, {thai_short_date(data['tide_forecast'].get('source_updated_at'), False)}", x + 8, y + 6, w - 16)


def draw_bangkok_panel(c, data, maps, x, y, w, h):
    bkk = data["executive_summary"]["bangkok_perimeter"]
    critical = {item["name"] for item in bkk.get("bangkok_critical_districts", [])}
    watch = {item["name"] for item in bkk.get("bangkok_watch_districts", [])}
    status = {name: "critical" for name in critical}
    status.update({name: "watch" for name in watch})
    card(c, x, y, w, h)
    draw_text(c, "พื้นที่กรุงเทพฯ", x + 8, y + h - 16, size=12, font="Thai-Bold")
    draw_text(c, f"วิกฤต {len(critical)} เขต - เฝ้าระวัง {len(watch)} เขต", x + w - 8, y + h - 15, size=7, color=MUTED, font="Thai-Bold", align="right")
    draw_shape_map(c, maps["bangkokDistricts"], status, (x + 8, y + 25, w * 0.56, h - 52), label_mode="bangkok")
    list_x = x + w * 0.60
    draw_text(c, "เขตที่มีจุดน้ำระดับวิกฤต", list_x, y + h - 36, size=8.5, font="Thai-Bold")
    yy = y + h - 49
    for item in bkk.get("bangkok_critical_districts", [])[:7]:
        stations = item.get("stations", [])
        roads = [s for s in stations if s.get("category") == "Road Flood"]
        names = [s.get("station_name", "") for s in (roads or stations)[:2]]
        line = f"- {item['name']} ({', '.join(names)})" if names else f"- {item['name']}"
        for idx, part in enumerate(wrap_text(line, 45)[:2]):
            draw_text(c, part, list_x, yy, size=5.9, color=INK if idx == 0 else MUTED)
            yy -= 8
    if len(bkk.get("bangkok_critical_districts", [])) > 7:
        draw_text(c, f"อีก {len(bkk.get('bangkok_critical_districts', [])) - 7} เขต", list_x, yy, size=5.8, color=MUTED)
    source_line(c, f"ที่มา: POPNIX Flood, {thai_short_date(bkk.get('source_updated_at') or data.get('generated_at'))}", x + 8, y + 9, w - 16)


def draw_impacts(c, data, x, y, w, h):
    situation = data["executive_summary"]["province_situation"]
    impact = situation.get("impact_summary", {})
    affected = impact.get("affected_households")
    people = impact.get("affected_people")
    deaths = impact.get("deaths")
    top = impact.get("top_affected_households", [])[:3]
    deaths_by = impact.get("death_details", [])
    card(c, x, y, w, h)
    draw_text(c, "ผู้ได้รับผลกระทบรวม", x + 8, y + h - 12, size=9.5, font="Thai-Bold")
    draw_text(c, f"{fmt_num(affected)} ครัวเรือน", x + 8, y + 22, size=12.8, color=INK, font="Thai-Bold")
    draw_text(c, f"{fmt_num(people)} คน", x + 8, y + 11, size=6.5, color=MUTED)
    top_text = ", ".join([f"{i['province']} {fmt_num(i['households'])}" for i in top if i.get("households")])
    if top_text:
        draw_text(c, f"สูงสุด: {top_text} ครัวเรือน", x + 235, y + 28, size=5.2, color=MUTED)
    death_parts = [f"{i['province']} {fmt_num(i['deaths'])}" for i in deaths_by[:3] if i.get("deaths")]
    if len(deaths_by) > 3:
        death_parts.append("...")
    death_text = ", ".join(death_parts)
    draw_text(c, f"ผู้เสียชีวิต {fmt_num(deaths)} ราย", x + 235, y + 14, size=7.4, color=INK, font="Thai-Bold")
    if death_text:
        draw_text(c, f"({death_text})", x + 310, y + 14, size=5.2, color=MUTED)


def draw_legend(c, x, y):
    items = [(RED, "วิกฤต"), (YELLOW, "เฝ้าระวัง"), (NO_STATUS, "ไม่มีสถานะ")]
    xx = x
    for color, label in items:
        c.setFillColor(color)
        c.circle(xx + 4, y + 4, 4, stroke=0, fill=1)
        draw_text(c, label, xx + 12, y + 1, size=7, color=MUTED)
        xx += 54


def build_pdf():
    register_fonts()
    data, maps = load_data()
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUT_PATH), pagesize=landscape(A4))
    c.setTitle("Water SitRep A4 Map Focused")
    page_w, page_h = landscape(A4)

    c.setFillColor(colors.white)
    c.rect(0, 0, page_w, page_h, stroke=0, fill=1)

    if LOGO_PATH.exists():
        c.drawImage(ImageReader(str(LOGO_PATH)), 18, page_h - 52, width=38, height=38, mask="auto")
    draw_text(c, "WATER SITREP", 66, page_h - 25, size=8.5, color=colors.HexColor("#1c6e9a"), font="Thai-Bold")
    draw_text(c, f"สรุปสถานการณ์อุทกภัย โดย สขว.กอ.รมน. ณ วันที่ {thai_full_date(data.get('generated_at'))}", 66, page_h - 45, size=17.2, font="Thai-Bold")
    draw_text(c, "ดึงข้อมูลรอบใหม่", page_w - 18, page_h - 25, size=6.8, color=MUTED, font="Thai-Bold", align="right")
    draw_text(c, thai_short_date(data.get("generated_at")), page_w - 18, page_h - 42, size=8.5, font="Thai-Bold", align="right")

    critical, watch, _, _ = make_status_sets(data)
    province_status = {name: "critical" for name in critical}
    province_status.update({name: "watch" for name in watch})
    situation = data["executive_summary"]["province_situation"]

    left_x, left_y, left_w, left_h = 14, 16, 350, page_h - 86
    card(c, left_x, left_y, left_w, left_h, radius=7)
    draw_text(c, "จว.ประสบอุทกภัย 23 จังหวัด", left_x + 10, left_y + left_h - 17, size=13, font="Thai-Bold")
    draw_text(c, f"ระดับวิกฤต {len(critical)} จังหวัด - เฝ้าระวัง {len(watch)} จังหวัด", left_x + left_w - 10, left_y + left_h - 16, size=7.3, color=MUTED, font="Thai-Bold", align="right")
    draw_legend(c, left_x + 10, left_y + left_h - 38)
    draw_shape_map(c, maps["provinces"], province_status, (left_x + 14, left_y + 34, left_w - 28, left_h - 83), label_mode="province")
    source_line(c, f"ที่มา: กรมป้องกันและบรรเทาสาธารณภัย, {thai_short_date(situation.get('source_updated_at') or data.get('generated_at'))}", left_x + 10, left_y + 12, left_w - 20)

    right_x, right_w = 376, page_w - 390
    y_top = page_h - 92
    stats_h = 48
    gap = 8
    sw = (right_w - gap * 3) / 4
    draw_stat(c, right_x, y_top - stats_h, sw, stats_h, "ประสบอุทกภัย", "23 จว.", RED)
    draw_stat(c, right_x + (sw + gap), y_top - stats_h, sw, stats_h, "ระดับวิกฤต", f"{len(critical)} จว.", RED)
    draw_stat(c, right_x + (sw + gap) * 2, y_top - stats_h, sw, stats_h, "เฝ้าระวัง", f"{len(watch)} จว.", ORANGE)
    draw_stat(c, right_x + (sw + gap) * 3, y_top - stats_h, sw, stats_h, "เสียชีวิต", f"{fmt_num(situation.get('impact_summary', {}).get('deaths'))} ราย", RED)

    draw_bangkok_panel(c, data, maps, right_x, 310, right_w, 138)
    draw_flow_chart(c, data, right_x, 187, right_w, 112)
    draw_weather_tide(c, data, right_x, 85, right_w, 91)
    draw_impacts(c, data, right_x, 16, right_w, 58)

    c.showPage()
    c.save()
    print(OUT_PATH)


if __name__ == "__main__":
    build_pdf()
