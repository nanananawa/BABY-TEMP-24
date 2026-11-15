import type { BedSlot, EspDevice, Ward, WardSettings } from '../types';
import { formatClockThai, formatStayDetailThai } from './wardHelpers';

export interface ExportOptions {
  scope: 'ward' | 'all' | 'single';
  selectedBedId?: string;
  wardId?: string;
}

export function exportWardsToExcel(
  wards: Ward[],
  devices: Record<string, EspDevice>,
  settings: WardSettings,
  options: ExportOptions
) {
  let targetBeds: { bed: BedSlot; wardName: string }[] = [];

  if (options.scope === 'single' && options.selectedBedId) {
    for (const w of wards) {
      const b = w.beds.find((slot) => slot.id === options.selectedBedId);
      if (b && b.patient) {
        targetBeds = [{ bed: b, wardName: w.name }];
        break;
      }
    }
  } else if (options.scope === 'ward' && options.wardId) {
    const w = wards.find((item) => item.id === options.wardId);
    if (w) {
      targetBeds = w.beds
        .filter((b) => b.patient !== null)
        .map((b) => ({ bed: b, wardName: w.name }));
    }
  } else {
    // all
    for (const w of wards) {
      for (const b of w.beds) {
        if (b.patient) {
          targetBeds.push({ bed: b, wardName: w.name });
        }
      }
    }
  }

  if (targetBeds.length === 0) {
    alert('ไม่พบข้อมูลผู้ป่วยสำหรับส่งออกรายงาน');
    return;
  }

  const now = new Date();
  const printDateStr =
    now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }) +
    ' เวลา ' +
    now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) +
    ' น.';

  let html = `
  <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <style>
      body { font-family: 'Sarabun', 'Segoe UI', Tahoma, Arial, sans-serif; font-size: 11pt; }
      .header-title { font-size: 16pt; font-weight: bold; color: #0f766e; text-align: center; height: 35px; }
      .header-sub { font-size: 10pt; color: #475569; text-align: center; height: 20px; }
      .card-table { border-collapse: collapse; margin-bottom: 25px; width: 100%; }
      .meta-label { background-color: #f1f5f9; font-weight: bold; border: 1px solid #cbd5e1; padding: 6px 10px; font-size: 10pt; }
      .meta-val { background-color: #ffffff; border: 1px solid #cbd5e1; padding: 6px 10px; font-size: 10pt; }
      .th-col { background-color: #0f766e; color: #ffffff; font-weight: bold; text-align: center; border: 1px solid #0d9488; height: 28px; font-size: 10pt; }
      .td-cell { border: 1px solid #e2e8f0; padding: 5px 8px; font-size: 9.5pt; text-align: center; }
      .badge-normal { background-color: #d1fae5; color: #065f46; font-weight: bold; text-align: center; border: 1px solid #a7f3d0; }
      .badge-watch { background-color: #fef3c7; color: #92400e; font-weight: bold; text-align: center; border: 1px solid #fde68a; }
      .badge-fever { background-color: #fee2e2; color: #991b1b; font-weight: bold; text-align: center; border: 1px solid #fca5a5; }
      .stat-header { background-color: #e2e8f0; font-weight: bold; text-align: center; border: 1px solid #cbd5e1; font-size: 10pt; }
      .stat-val { font-weight: bold; text-align: center; border: 1px solid #cbd5e1; font-size: 11pt; }
    </style>
  </head>
  <body>
    <table class="card-table">
      <tr>
        <td colspan="6" class="header-title">🏥 รายงานบันทึกอุณหภูมิร่างกายผู้ป่วยเด็ก (${settings.hospitalName || 'โรงพยาบาล'})</td>
      </tr>
      <tr>
        <td colspan="6" class="header-sub">ระบบติดตามอุณหภูมิเรียลไทม์ • พิมพ์รายงานเมื่อ: ${printDateStr}</td>
      </tr>
      <tr><td colspan="6" style="height: 12px;"></td></tr>
  `;

  targetBeds.forEach(({ bed, wardName }) => {
    const p = bed.patient!;
    const dev = bed.deviceId ? devices[bed.deviceId] : undefined;
    const history = dev?.history ?? [];

    let minT = '-';
    let maxT = '-';
    let avgT = '-';
    let feverCount = 0;

    if (history.length > 0) {
      const temps = history.map((h) => h.temperature).filter((t) => typeof t === 'number' && !isNaN(t));
      if (temps.length > 0) {
        minT = Math.min(...temps).toFixed(1);
        maxT = Math.max(...temps).toFixed(1);
        avgT = (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1);
        feverCount = history.filter((h) => h.temperature >= settings.feverThreshold).length;
      }
    }

    const currentTempStr =
      dev && dev.temperature !== null ? `${dev.temperature.toFixed(1)} °C` : '--.- °C';
    const batteryStr = dev && dev.battery !== null ? `${dev.battery}%` : '-';

    html += `
      <!-- ข้อมูลผู้ป่วย -->
      <tr>
        <td class="meta-label">วอร์ด / เตียง:</td>
        <td class="meta-val" colspan="2"><b>${wardName} · ${bed.label}</b></td>
        <td class="meta-label">รหัส HN:</td>
        <td class="meta-val" colspan="2"><b>${p.hn || '-'}</b></td>
      </tr>
      <tr>
        <td class="meta-label">ชื่อผู้ป่วย:</td>
        <td class="meta-val" colspan="2"><b>${p.name}</b> ${p.age ? `(${p.age})` : ''}</td>
        <td class="meta-label">รหัสอุปกรณ์:</td>
        <td class="meta-val" colspan="2">${bed.deviceId || 'ยังไม่ระบุ'} (แบตเตอรี่ ${batteryStr})</td>
      </tr>
      <tr>
        <td class="meta-label">วันเริ่มรักษา:</td>
        <td class="meta-val" colspan="2">${formatStayDetailThai(p.admittedAt, Date.now())}</td>
        <td class="meta-label">อาการ / บันทึก:</td>
        <td class="meta-val" colspan="2">${p.notes || '-'}</td>
      </tr>

      <!-- สรุปสถิติอุณหภูมิ -->
      <tr>
        <td class="stat-header">อุณหภูมิต่ำสุด</td>
        <td class="stat-header">อุณหภูมิเฉลี่ย</td>
        <td class="stat-header">อุณหภูมิสูงสุด</td>
        <td class="stat-header" colspan="2">จำนวนครั้งที่มีไข้สูง (≥ ${settings.feverThreshold}°C)</td>
        <td class="stat-header">อุณหภูมิล่าสุด</td>
      </tr>
      <tr>
        <td class="stat-val" style="color: #0284c7;">${minT} °C</td>
        <td class="stat-val" style="color: #0d9488;">${avgT} °C</td>
        <td class="stat-val" style="color: #dc2626;">${maxT} °C</td>
        <td class="stat-val" colspan="2" style="color: ${feverCount > 0 ? '#dc2626' : '#166534'};">${feverCount} ครั้ง</td>
        <td class="stat-val"><b>${currentTempStr}</b></td>
      </tr>
      <tr><td colspan="6" style="height: 6px;"></td></tr>

      <!-- ตารางประวัติการวัด (แสดงค่าเฉลี่ย) -->
      <tr>
        <th class="th-col" style="width: 50px;">ลำดับ</th>
        <th class="th-col" style="width: 160px;">วัน-เวลา</th>
        <th class="th-col" style="width: 120px;">รหัสอุปกรณ์</th>
        <th class="th-col" style="width: 120px;">อุณหภูมิเฉลี่ย (°C)</th>
        <th class="th-col" style="width: 100px;">สถานะ</th>
        <th class="th-col" style="width: 100px;">แบตเตอรี่</th>
      </tr>
    `;

    if (history.length === 0) {
      html += `<tr><td colspan="6" class="td-cell" style="color:#94a3b8; padding:12px;">ยังไม่มีข้อมูลประวัติการวัด</td></tr>`;
    } else {
      [...history].reverse().forEach((row, idx) => {
        let badgeClass = 'badge-normal';
        let statusLabel = 'ปกติ';
        if (row.temperature >= settings.feverThreshold) {
          badgeClass = 'badge-fever';
          statusLabel = 'มีไข้สูง';
        } else if (row.temperature >= settings.watchThreshold) {
          badgeClass = 'badge-watch';
          statusLabel = 'ไข้ต่ำ / เฝ้าระวัง';
        }

        html += `
          <tr>
            <td class="td-cell">${idx + 1}</td>
            <td class="td-cell">${formatClockThai(row.timestamp)}</td>
            <td class="td-cell">${bed.deviceId || '-'}</td>
            <td class="td-cell ${badgeClass}"><b>${row.temperature.toFixed(1)}</b></td>
            <td class="td-cell ${badgeClass}">${statusLabel}</td>
            <td class="td-cell">${row.battery !== null && row.battery !== undefined ? `${row.battery}%` : '-'}</td>
          </tr>
        `;
      });
    }

    html += `<tr><td colspan="6" style="height: 20px; border-bottom: 2px dashed #cbd5e1;"></td></tr>`;
    html += `<tr><td colspan="6" style="height: 15px;"></td></tr>`;
  });

  html += `
    </table>
  </body>
  </html>
  `;

  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const downloadUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const filename = `BabyTemp_Report_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}.xls`;
  a.href = downloadUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(downloadUrl);
}

export function exportWardsToCsv(
  wards: Ward[],
  devices: Record<string, EspDevice>,
  settings: WardSettings,
  options: ExportOptions
) {
  let targetBeds: { bed: BedSlot; wardName: string }[] = [];

  if (options.scope === 'single' && options.selectedBedId) {
    for (const w of wards) {
      const b = w.beds.find((slot) => slot.id === options.selectedBedId);
      if (b && b.patient) {
        targetBeds = [{ bed: b, wardName: w.name }];
        break;
      }
    }
  } else if (options.scope === 'ward' && options.wardId) {
    const w = wards.find((item) => item.id === options.wardId);
    if (w) {
      targetBeds = w.beds
        .filter((b) => b.patient !== null)
        .map((b) => ({ bed: b, wardName: w.name }));
    }
  } else {
    for (const w of wards) {
      for (const b of w.beds) {
        if (b.patient) targetBeds.push({ bed: b, wardName: w.name });
      }
    }
  }

  if (targetBeds.length === 0) {
    alert('ไม่พบข้อมูลผู้ป่วยสำหรับส่งออกรายงาน');
    return;
  }

  const rows = [
    [
      'ลำดับ',
      'วอร์ด',
      'เตียง',
      'รหัส HN',
      'ชื่อผู้ป่วยเด็ก',
      'อายุ',
      'วันเวลาที่วัด',
      'รหัสอุปกรณ์',
      'อุณหภูมิเฉลี่ย (°C)',
      'สถานะ',
      'แบตเตอรี่ (%)',
      'สัญญาณ WiFi (dBm)',
    ].join(','),
  ];

  let seq = 1;
  targetBeds.forEach(({ bed, wardName }) => {
    const p = bed.patient!;
    const dev = bed.deviceId ? devices[bed.deviceId] : undefined;
    const history = dev?.history ?? [];

    history.forEach((h) => {
      let status = 'ปกติ';
      if (h.temperature >= settings.feverThreshold) status = 'ไข้สูง';
      else if (h.temperature >= settings.watchThreshold) status = 'เฝ้าระวัง';

      const isoTime = new Date(h.timestamp).toISOString();
      rows.push(
        [
          seq++,
          `"${wardName}"`,
          `"${bed.label}"`,
          `"${p.hn || ''}"`,
          `"${p.name}"`,
          `"${p.age || ''}"`,
          `"${isoTime}"`,
          `"${bed.deviceId || ''}"`,
          h.temperature.toFixed(1),
          `"${status}"`,
          h.battery !== null && h.battery !== undefined ? h.battery : '',
          h.rssi !== null && h.rssi !== undefined ? h.rssi : '',
        ].join(',')
      );
    });
  });

  const bom = '\uFEFF';
  const csvContent = bom + rows.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `BabyTemp_Data_${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
