'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WEB_USERS = path.join(ROOT, 'data', 'web-users.json');
const OUT_CSV = path.join(ROOT, 'data', 'usuarios-modulos.csv');
const OUT_XLS = path.join(ROOT, 'data', 'usuarios-modulos.xls');

const HASH_PASS = {
  a8ffef0576b53a79c84409727674ee096bf2d67961aa9ebd613f2b06a2fc423c: '51963',
  e7042ac7d09c7bc41c8cfa5749e41858f6980643bc0db1a83cc793d3e24d3f77: '00000'
};

function escXml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escCsv(s) {
  var t = String(s == null ? '' : s);
  if (/[",\n\r]/.test(t)) return '"' + t.replace(/"/g, '""') + '"';
  return t;
}

function rows() {
  var list = [];
  var web = JSON.parse(fs.readFileSync(WEB_USERS, 'utf8'));
  var stamp = (web.updatedAt || new Date().toISOString()).slice(0, 10);

  // Admin general (login WMS / alias)
  list.push({
    modulo: 'WMS · Despacho · Averías · Recepción · Temperatura · Agenda',
    usuario: 'luisjose',
    nombre: 'Administrador general',
    rol: 'administrador',
    clave: '51963',
    tipoAcceso: 'Usuario / contraseña',
    activo: 'Sí',
    notas: 'Alias: admin, administrador'
  });

  (web.users || []).forEach(function (u) {
    var hash = String(u.passwordHash || '');
    var clave = HASH_PASS[hash] || '(clave distinta — resetear si se desconoce)';
    var mods = 'WMS · Despacho · Averías · Recepción · Temperatura · Agenda';
    if (u.role === 'validador') mods += ' (en Despacho entra como Validador)';
    else mods += ' (en Despacho entra como Preparador si tiene permiso)';
    list.push({
      modulo: mods,
      usuario: u.username,
      nombre: u.name || '',
      rol: u.role || '',
      clave: clave,
      tipoAcceso: 'Usuario / contraseña',
      activo: u.active === false ? 'No' : 'Sí',
      notas: 'Publicado ' + stamp
    });
  });

  // Inventario RF
  [
    { usuario: '51192', nombre: 'Jansel Castro', rol: 'COUNT', clave: '(sin clave — solo código)', notas: 'Contador' },
    { usuario: '51963', nombre: 'Luis José Rodríguez Ruíz', rol: 'COUNT', clave: '(sin clave — solo código)', notas: 'Contador' },
    { usuario: '12345', nombre: 'María López', rol: 'COUNT', clave: '(sin clave — solo código)', notas: 'Contador demo' },
    { usuario: 'admin', nombre: 'Administrador', rol: 'ADMIN', clave: 'Central@', notas: 'PIN administrador Inventario RF' }
  ].forEach(function (u) {
    list.push({
      modulo: 'Inventario RF',
      usuario: u.usuario,
      nombre: u.nombre,
      rol: u.rol,
      clave: u.clave,
      tipoAcceso: u.rol === 'ADMIN' ? 'Usuario + PIN' : 'Código empleado',
      activo: 'Sí',
      notas: u.notas
    });
  });

  // Legacy despacho (solo fuera de GitHub Pages público)
  list.push({
    modulo: 'Despacho (demo local)',
    usuario: 'preparador',
    nombre: 'Preparador de pedidos',
    rol: 'preparador',
    clave: '(solo en entorno local — no público)',
    tipoAcceso: 'Usuario / contraseña',
    activo: 'Local',
    notas: 'No disponible en GitHub Pages público'
  });
  list.push({
    modulo: 'Despacho (demo local)',
    usuario: 'validador',
    nombre: 'Validador de despacho',
    rol: 'validador',
    clave: '(solo en entorno local — no público)',
    tipoAcceso: 'Usuario / contraseña',
    activo: 'Local',
    notas: 'No disponible en GitHub Pages público'
  });

  return list;
}

function writeCsv(list) {
  var headers = ['Modulo', 'Usuario', 'Nombre', 'Rol', 'Clave', 'TipoAcceso', 'Activo', 'Notas'];
  var lines = [headers.join(',')];
  list.forEach(function (r) {
    lines.push([
      escCsv(r.modulo),
      escCsv(r.usuario),
      escCsv(r.nombre),
      escCsv(r.rol),
      escCsv(r.clave),
      escCsv(r.tipoAcceso),
      escCsv(r.activo),
      escCsv(r.notas)
    ].join(','));
  });
  fs.writeFileSync(OUT_CSV, '\ufeff' + lines.join('\r\n'), 'utf8');
}

function writeXls(list) {
  var cells = function (vals) {
    return vals.map(function (v) {
      return '<Cell><Data ss:Type="String">' + escXml(v) + '</Data></Cell>';
    }).join('');
  };
  var xml = [];
  xml.push('<?xml version="1.0"?>');
  xml.push('<?mso-application progid="Excel.Sheet"?>');
  xml.push('<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"');
  xml.push(' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">');
  xml.push('<Styles><Style ss:ID="hdr"><Font ss:Bold="1"/></Style></Styles>');
  xml.push('<Worksheet ss:Name="Usuarios"><Table>');
  xml.push('<Row ss:StyleID="hdr">' + cells(['Modulo', 'Usuario', 'Nombre', 'Rol', 'Clave', 'TipoAcceso', 'Activo', 'Notas']) + '</Row>');
  list.forEach(function (r) {
    xml.push('<Row>' + cells([r.modulo, r.usuario, r.nombre, r.rol, r.clave, r.tipoAcceso, r.activo, r.notas]) + '</Row>');
  });
  xml.push('</Table></Worksheet></Workbook>');
  fs.writeFileSync(OUT_XLS, xml.join(''), 'utf8');
}

var list = rows();
writeCsv(list);
writeXls(list);
console.log('OK ' + list.length + ' filas -> data/usuarios-modulos.csv + data/usuarios-modulos.xls');
