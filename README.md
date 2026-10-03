# Dashboard สถานการณ์น้ำลุ่มเจ้าพระยาและกรุงเทพฯ

MVP dashboard ภาษาไทยสำหรับดูข้อมูลล่าสุดจากแหล่ง public/open data โดยไม่ auto refresh และไม่เก็บข้อมูลย้อนหลังเอง

## สิ่งที่ MVP นี้ทำ

- โหลดข้อมูลเมื่อเปิดหน้า dashboard
- มีปุ่ม `รีเฟรชข้อมูล` สำหรับโหลดข้อมูลอีกครั้ง
- ใช้ in-memory cache 5 นาที เพื่อลดการเรียกเว็บต้นทาง
- รวมข้อมูล sensor, ฝน, ถนนน้ำท่วม, forecast และประกาศ/รายงานทางการ
- แสดงแผนที่จังหวัดไทยและเขตกรุงเทพฯ จากไฟล์ขอบเขต local โดยไม่เรียก map tile ภายนอก
- แสดงแหล่งที่มา, ลิงก์ต้นทาง, เวลาที่ต้นทางอัปเดต และเวลาที่ระบบดึงข้อมูล
- แสดง stale status เมื่อข้อมูลเก่าหรือ source ไม่ระบุเวลาอัปเดต
- ไม่ตีความเองว่าน้ำท่วมหรือปลอดภัย หาก source ไม่มีสถานะทางการ
- ไม่เก็บข้อมูลย้อนหลัง และไม่สร้างกราฟย้อนหลังจำลอง

## Source audit

| Source | วิธีดึงข้อมูลใน MVP | สถานะ | ความเสี่ยง/หมายเหตุ |
| --- | --- | --- | --- |
| สถาบันสารสนเทศทรัพยากรน้ำ | Public JSON API: `waterlevel_load`, `rain_24h`, `flow` และรายงานน้ำท่ารายวัน | ใช้ได้ | endpoint อาจเปลี่ยนได้ ควรมี fallback และแสดง stale |
| กรมชลประทาน | รายงานสภาพน้ำท่ารายวัน | ใช้เป็นข้อมูลสำรองบางสถานี | ใช้เติมข้อมูลย้อนหลังที่รายงานรายวันของ สสน. ไม่ส่งค่า เช่น บางไทร C.29 |
| POPNIX Flood | Open Data JSON API: `api_overview.php`, `api_river.php`, `api_rain.php`, `api_roads.php` | ใช้ได้ดี | ต้องเคารพ rate limit และ attribution |
| สำนักการระบายน้ำ กทม. | JSON API ของ `flood.bangkok.go.th/api/...` | ใช้ได้ | บาง endpoint อาจมีข้อมูลเก่า จึงต้องแสดง freshness |
| กรมอุตุนิยมวิทยา | `DailyForecast/v2` และ `WeatherWarningNews/v1` | ใช้ได้ | warning API ที่พบอาจส่งประกาศเก่า ต้องแสดง stale |
| ปภ. | CMS/PDF/catalog public endpoints | ใช้เป็น report/official document | ไม่ scrape HTML เนื้อหาโดยตรงใน MVP; ให้ลิงก์ต้นทาง |

## โครงสร้าง

```text
water-dashboard/
  server.js
  src/
    services/
      dashboard.js
      http.js
      normalize.js
    sources/
      popnix.js
      thaiwater.js
      ddsBangkok.js
      tmd.js
      ddpm.js
  public/
    index.html
    styles.css
    app.js
    map-data.js
```

## วิธีรัน

ต้องใช้ Node.js 20 ขึ้นไป

```bash
cd water-dashboard
npm start
```

เปิด:

```text
http://localhost:4173
```

ถ้าใช้ runtime ที่มากับ Codex:

```bash
/Users/mayji/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node server.js
```

หลังแก้ไฟล์ใน `src/` ให้หยุด server เดิมแล้วเปิดใหม่หนึ่งครั้ง เพราะ backend จะโหลด collector ตอนเริ่ม server

## วิธีตรวจโค้ด

```bash
npm run check
```

หรือใช้ Node จาก Codex runtime:

```bash
/Users/mayji/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --check server.js
```

## Refresh และ cache

- หน้าเว็บเรียก `/api/dashboard` ตอนเปิดหน้าและตอนกดปุ่ม
- Server ใช้ cache 5 นาที
- ถ้ากดซ้ำภายใน cache TTL ระบบจะส่งข้อมูล cache กลับมา
- ไม่มี cron
- ไม่มี background worker
- ไม่มี auto refresh

สำหรับ development เท่านั้น ถ้าต้องการ force refresh:

```bash
ALLOW_FORCE_REFRESH=true npm start
```

แล้วเรียก:

```text
/api/dashboard?force=1
```

## การเพิ่ม data source ใหม่

1. เพิ่มไฟล์ใหม่ใน `src/sources/`
2. export function ที่ return รูปแบบนี้:

```js
{
  source: {
    name,
    url,
    type,
    ok,
    fetched_at,
    source_updated_at,
    error
  },
  stations: [],
  alerts: []
}
```

3. normalize station ให้มีฟิลด์กลาง:

```js
{
  station_id,
  station_name,
  province,
  district,
  latitude,
  longitude,
  water_level,
  bank_level,
  water_gap_to_bank,
  flow_rate,
  rainfall_1h,
  rainfall_3h,
  rainfall_24h,
  trend,
  status,
  category,
  source_name,
  source_url,
  source_type,
  observed_at,
  fetched_at,
  source_updated_at,
  is_stale,
  stale_reason,
  attribution_text
}
```

4. เพิ่ม collector ใน `src/services/dashboard.js`
5. หลีกเลี่ยง scraping หากมี API หรือ document endpoint ที่เหมาะสมกว่า

## Deploy ฟรี

ตัวนี้เป็น Node static server ไม่มี database จึง deploy ได้บน free tier ที่รองรับ Node เช่น Render หรือ Railway free/credit plan ตามที่มีในช่วงเวลานั้น หรือปรับเป็น serverless endpoint บน Vercel ได้ในรอบถัดไป

ต้องระวังว่า free tier อาจ sleep และ public API ต้นทางอาจมี rate limit
