import type { TurnoEntry, TurnosState } from '@/types/turno';

export const STORAGE_KEY = 'dc_turnos_despacho_v1';

const DEFAULT_STATE: TurnosState = { counter: 0, entries: [] };

/** Formato T-0001, T-0002… */
export function formatTurnoNumber(n: number): string {
  return `T-${String(Math.max(0, n)).padStart(4, '0')}`;
}

export function todayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function formatTime(date = new Date()): string {
  return date.toTimeString().slice(0, 8);
}

export function loadTurnosState(): TurnosState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw) as TurnosState;
    return {
      counter: Number(parsed.counter) || 0,
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function saveTurnosState(state: TurnosState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function createEntry(counter: number, qrContent: string): TurnoEntry {
  const now = new Date();
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    turno: formatTurnoNumber(counter),
    fecha: todayKey(now),
    hora: formatTime(now),
    qrContent: qrContent.trim(),
    estado: 'PENDIENTE',
    createdAt: now.getTime(),
  };
}

/** Evita doble turno del mismo QR en menos de 10 segundos */
export function isDuplicateScan(entries: TurnoEntry[], qrContent: string, windowMs = 10_000): boolean {
  const normalized = qrContent.trim();
  const cutoff = Date.now() - windowMs;
  return entries.some(
    (e) => e.qrContent === normalized && e.createdAt >= cutoff,
  );
}

export function statsForToday(entries: TurnoEntry[]) {
  const day = todayKey();
  const today = entries.filter((e) => e.fecha === day);
  return {
    totalHoy: today.length,
    validados: today.filter((e) => e.estado === 'VALIDADO').length,
    pendientes: today.filter((e) => e.estado === 'PENDIENTE').length,
  };
}
