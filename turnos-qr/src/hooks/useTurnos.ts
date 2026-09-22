import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DashboardStats, ScanResult, TurnoEntry, TurnosState } from '@/types/turno';
import {
  createEntry,
  isDuplicateScan,
  loadTurnosState,
  saveTurnosState,
  statsForToday,
} from '@/utils/storage';
import { playSuccessBeep } from '@/utils/export';

export function useTurnos() {
  const [state, setState] = useState<TurnosState>(() => loadTurnosState());
  const [lastScan, setLastScan] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    saveTurnosState(state);
  }, [state]);

  const stats: DashboardStats = useMemo(
    () => statsForToday(state.entries),
    [state.entries],
  );

  const registerScan = useCallback((qrContent: string): TurnoEntry | null => {
    const text = qrContent.trim();
    if (!text) {
      setError('El código QR está vacío.');
      return null;
    }
    if (isDuplicateScan(state.entries, text)) {
      setError('Este QR ya generó un turno hace menos de 10 segundos.');
      return null;
    }

    setError(null);
    let created: TurnoEntry | null = null;
    setState((prev) => {
      const nextCounter = prev.counter + 1;
      created = createEntry(nextCounter, text);
      return {
        counter: nextCounter,
        entries: [created, ...prev.entries],
      };
    });

    if (!created) return null;
    playSuccessBeep();
    setLastScan({ qrContent: text, entry: created });
    return created;
  }, [state.entries]);

  const validateTurno = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      entries: prev.entries.map((e) =>
        e.id === id ? { ...e, estado: 'VALIDADO' as const } : e,
      ),
    }));
  }, []);

  const resetCounter = useCallback(() => {
    if (!window.confirm('¿Reiniciar la numeración de turnos? El historial se conserva.')) return;
    setState((prev) => ({ ...prev, counter: 0 }));
    setLastScan(null);
    setError(null);
  }, []);

  const loadSamples = useCallback(() => {
    import('@/data/sampleData').then(({ SAMPLE_ENTRIES, SAMPLE_COUNTER }) => {
      setState({ counter: SAMPLE_COUNTER, entries: SAMPLE_ENTRIES });
      setLastScan(null);
      setError(null);
    });
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    entries: state.entries,
    counter: state.counter,
    stats,
    lastScan,
    error,
    registerScan,
    validateTurno,
    resetCounter,
    loadSamples,
    clearError,
  };
}
