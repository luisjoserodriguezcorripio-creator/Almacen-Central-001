/**
 * Portal Operaciones de Piso — núcleo: fechas, estados, seguridad, auditoría
 */
(function (global) {
  'use strict';

  var AUDIT_KEY = 'averias_dc_audit_log';
  var MAX_AUDIT = 500;

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function sanitizeText(value, maxLen) {
    var s = String(value == null ? '' : value)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .trim();
    if (maxLen && s.length > maxLen) s = s.slice(0, maxLen);
    return s;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function formatDisplayDateTime(value) {
    if (!value) return '—';
    var d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) {
      return String(value);
    }
    try {
      return new Intl.DateTimeFormat('es-DO', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }).format(d);
    } catch (e) {
      return d.toLocaleString('es-DO');
    }
  }

  function statusLabel(status) {
    var s = String(status || 'PENDIENTE').toUpperCase();
    if (s === 'CORREGIDO' || s === 'FINALIZADO') return 'Finalizado';
    return 'Pendiente';
  }

  function isCorrectedStatus(record) {
    var s = String(record && record.status || '').toUpperCase();
    return s === 'CORREGIDO' || s === 'FINALIZADO';
  }

  function isPendingStatus(record) {
    return !isCorrectedStatus(record);
  }

  function stampNewReport(record) {
    if (!record) return record;
    var iso = nowIso();
    if (!record.reportDateIso) record.reportDateIso = iso;
    if (!record.reportDate) record.reportDate = formatDisplayDateTime(iso);
    if (!record.status) record.status = 'PENDIENTE';
    return record;
  }

  function finalizeRecord(record, userName) {
    if (!record) return record;
    var iso = nowIso();
    record.status = 'CORREGIDO';
    record.correctedBy = sanitizeText(userName, 120);
    record.correctionDateIso = iso;
    record.executedAtIso = iso;
    record.correctionDate = formatDisplayDateTime(iso);
    return record;
  }

  function normalizeRecordTimestamps(record) {
    if (!record) return;
    if (record.correctionDate && !record.correctionDateIso) {
      var cp = Date.parse(record.correctionDate);
      if (!isNaN(cp)) record.correctionDateIso = new Date(cp).toISOString();
    }
    if ((record.reportDate || record.fechaRegistro || record.fecha) && !record.reportDateIso) {
      var rp = Date.parse(record.reportDateIso || record.reportDate || record.fechaRegistro || record.fecha);
      if (!isNaN(rp)) record.reportDateIso = new Date(rp).toISOString();
    }
    if (record.status && String(record.status).toUpperCase() === 'FINALIZADO') {
      record.status = 'CORREGIDO';
    }
  }

  function recordTimeForMerge(r) {
    if (!r) return 0;
    return Date.parse(r.correctionDateIso) ||
      Date.parse(r.executedAtIso) ||
      Date.parse(r.modifiedAt) ||
      Date.parse(r.reportDateIso) ||
      Date.parse(r.correctionDate) ||
      Date.parse(r.fechaRegistro) ||
      Date.parse(r.fecha) ||
      Date.parse(r.reportDate) ||
      (typeof r.id === 'number' ? r.id : parseInt(r.id, 10)) || 0;
  }

  function datesBlockHtml(record, esc) {
    esc = esc || escapeHtml;
    var reported = formatDisplayDateTime(record.reportDateIso || record.reportDate || record.fechaRegistro || record.fecha);
    var html = '<div class="av-record-dates">' +
      '<div class="incidence-card-row"><span class="incidence-card-label">Reportado:</span>' +
      '<span class="incidence-card-value">' + esc(reported) + '</span></div>';
    if (isCorrectedStatus(record)) {
      html += '<div class="incidence-card-row"><span class="incidence-card-label">Finalizado:</span>' +
        '<span class="incidence-card-value av-date-closed">' +
        esc(formatDisplayDateTime(record.executedAtIso || record.correctionDateIso || record.correctionDate)) +
        (record.correctedBy ? ' · ' + esc(record.correctedBy) : '') +
        '</span></div>';
    }
    html += '</div>';
    return html;
  }

  function auditLog(action, detail, user) {
    if (!global.localStorage) return;
    try {
      var list = JSON.parse(global.localStorage.getItem(AUDIT_KEY) || '[]');
      if (!Array.isArray(list)) list = [];
      list.unshift({
        at: nowIso(),
        action: sanitizeText(action, 80),
        detail: typeof detail === 'object' ? detail : { msg: sanitizeText(detail, 300) },
        user: sanitizeText(user || '—', 120)
      });
      if (list.length > MAX_AUDIT) list.length = MAX_AUDIT;
      global.localStorage.setItem(AUDIT_KEY, JSON.stringify(list));
    } catch (e) { /* noop */ }
  }

  function getAuditLog(limit) {
    try {
      var list = JSON.parse(global.localStorage.getItem(AUDIT_KEY) || '[]');
      if (!Array.isArray(list)) return [];
      return list.slice(0, limit || 50);
    } catch (e) {
      return [];
    }
  }

  global.PlatformAveriasCore = {
    escapeHtml: escapeHtml,
    sanitizeText: sanitizeText,
    nowIso: nowIso,
    formatDisplayDateTime: formatDisplayDateTime,
    statusLabel: statusLabel,
    isCorrectedStatus: isCorrectedStatus,
    isPendingStatus: isPendingStatus,
    stampNewReport: stampNewReport,
    finalizeRecord: finalizeRecord,
    normalizeRecordTimestamps: normalizeRecordTimestamps,
    recordTimeForMerge: recordTimeForMerge,
    datesBlockHtml: datesBlockHtml,
    auditLog: auditLog,
    getAuditLog: getAuditLog
  };
})(typeof window !== 'undefined' ? window : this);
