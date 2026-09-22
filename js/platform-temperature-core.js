/**
 * Monitoreo de temperatura — lógica de áreas, rangos y estados
 */
(function (global) {
  'use strict';

  var DEFAULT_AREAS = [
    { id: 'almacen', name: 'Almacén', minCelsius: 20, maxCelsius: 26, warnMargin: 2, sortOrder: 1 },
    { id: 'cuarto_frio', name: 'Cuarto frío', minCelsius: 0, maxCelsius: 4, warnMargin: 1, sortOrder: 2 },
    { id: 'nave1', name: 'Nave 1', minCelsius: 20, maxCelsius: 26, warnMargin: 2, sortOrder: 3 },
    { id: 'nave2', name: 'Nave 2', minCelsius: 20, maxCelsius: 26, warnMargin: 2, sortOrder: 4 },
    { id: 'nave3', name: 'Nave 3', minCelsius: 20, maxCelsius: 26, warnMargin: 2, sortOrder: 5 },
    { id: 'area_averia', name: 'Área de avería', minCelsius: 18, maxCelsius: 28, warnMargin: 2, sortOrder: 6 }
  ];

  var STATUS_LABELS = {
    ok: 'Normal',
    warn: 'Advertencia',
    critical: 'Crítico',
    unknown: 'Sin datos'
  };

  function mapArea(row) {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      minCelsius: Number(row.min_celsius != null ? row.min_celsius : row.minCelsius),
      maxCelsius: Number(row.max_celsius != null ? row.max_celsius : row.maxCelsius),
      warnMargin: Number(row.warn_margin != null ? row.warn_margin : row.warnMargin),
      sortOrder: Number(row.sort_order != null ? row.sort_order : row.sortOrder || 0),
      active: row.active !== false
    };
  }

  function mapCurrent(row, area) {
    if (!row) return null;
    return {
      areaId: row.area_id || row.areaId,
      celsius: row.celsius != null ? Number(row.celsius) : null,
      status: row.status || 'unknown',
      readingId: row.reading_id || row.readingId || null,
      updatedAt: row.updated_at || row.updatedAt || null,
      area: area || null
    };
  }

  function mapReading(row) {
    if (!row) return null;
    return {
      id: row.id,
      areaId: row.area_id || row.areaId,
      celsius: Number(row.celsius),
      recordedAt: row.recorded_at || row.recordedAt,
      source: row.source || 'manual',
      recordedBy: row.recorded_by || row.recordedBy || '',
      notes: row.notes || ''
    };
  }

  function mapAlert(row) {
    if (!row) return null;
    return {
      id: row.id,
      areaId: row.area_id || row.areaId,
      readingId: row.reading_id || row.readingId,
      celsius: Number(row.celsius),
      alertType: row.alert_type || row.alertType,
      severity: row.severity || 'critical',
      status: row.status || 'active',
      message: row.message || '',
      createdAt: row.created_at || row.createdAt,
      resolvedAt: row.resolved_at || row.resolvedAt,
      acknowledgedBy: row.acknowledged_by || row.acknowledgedBy || ''
    };
  }

  function computeStatus(celsius, area) {
    if (celsius == null || isNaN(celsius) || !area) return 'unknown';
    var min = Number(area.minCelsius);
    var max = Number(area.maxCelsius);
    var margin = Number(area.warnMargin || 2);
    if (celsius < min || celsius > max) return 'critical';
    if (celsius <= (min + margin) || celsius >= (max - margin)) return 'warn';
    return 'ok';
  }

  function formatCelsius(value) {
    if (value == null || isNaN(value)) return '—';
    return Number(value).toFixed(1) + '°C';
  }

  function formatRange(area) {
    if (!area) return '—';
    return Number(area.minCelsius).toFixed(0) + '–' + Number(area.maxCelsius).toFixed(0) + '°C';
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('es-DO', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch (e) {
      return String(iso);
    }
  }

  function statusLabel(status) {
    return STATUS_LABELS[status] || STATUS_LABELS.unknown;
  }

  function defaultAreas() {
    return DEFAULT_AREAS.slice();
  }

  function summarizeCurrent(currentList) {
    var counts = { ok: 0, warn: 0, critical: 0, unknown: 0 };
    (currentList || []).forEach(function (c) {
      var st = c.status || 'unknown';
      counts[st] = (counts[st] || 0) + 1;
    });
    return counts;
  }

  global.PlatformTemperatureCore = {
    DEFAULT_AREAS: DEFAULT_AREAS,
    STATUS_LABELS: STATUS_LABELS,
    mapArea: mapArea,
    mapCurrent: mapCurrent,
    mapReading: mapReading,
    mapAlert: mapAlert,
    computeStatus: computeStatus,
    formatCelsius: formatCelsius,
    formatRange: formatRange,
    formatDateTime: formatDateTime,
    statusLabel: statusLabel,
    defaultAreas: defaultAreas,
    summarizeCurrent: summarizeCurrent
  };
})(typeof window !== 'undefined' ? window : this);
