import * as XLSX from 'xlsx';
import type { TurnoEntry } from '@/types/turno';

function rowsForExport(entries: TurnoEntry[]) {
  return entries.map((e) => ({
    Turno: e.turno,
    Fecha: e.fecha,
    Hora: e.hora,
    'QR leído': e.qrContent,
    Estado: e.estado,
  }));
}

export function exportToCsv(entries: TurnoEntry[]): void {
  const rows = rowsForExport(entries);
  const ws = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, `turnos_despacho_${dateStamp()}.csv`);
}

export function exportToXlsx(entries: TurnoEntry[]): void {
  const rows = rowsForExport(entries);
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Turnos');
  XLSX.writeFile(wb, `turnos_despacho_${dateStamp()}.xlsx`);
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Beep corto de confirmación al generar turno */
export function playSuccessBeep(): void {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    osc.stop(ctx.currentTime + 0.26);
    setTimeout(() => ctx.close(), 400);
  } catch {
    /* dispositivos sin audio */
  }
}
