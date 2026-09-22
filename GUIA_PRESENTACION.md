# Guía de presentación — Almacén Central

Documento para demostrar la plataforma a dirección o clientes internos (**15–20 minutos**).

---

## Antes de la reunión (30 min)

1. **Arrancar el servidor**
   ```powershell
   .\serve-dashboard.ps1
   ```
2. **Abrir** http://localhost:8080 en Chrome o Edge (pantalla completa: F11).
3. **Iniciar sesión** como `admin` / `JANSELCASTRO01`.
4. **Importar datos** (Administración → Datos Excel):
   - Excel de **Operaciones** (control de almacén).
   - Excel de **Línea de trabajo**.
   - **Diario de facturas** del cliente.
5. Verificar chips **Ops ✓**, **Línea ✓**, **Fac ✓** en la barra superior.
6. En **Facturas**, opcional: guardar **metas por almacén** y **tasa de cambio**.
7. Cerrar y volver a abrir **Dashboard general** para confirmar KPIs.

---

## Guión sugerido (15 min)

### 1. Contexto (2 min)

> «WMS Control centraliza en un solo panel la **operación del almacén**, la **línea de trabajo**, la **facturación** y la **productividad**. Los datos vienen de los Excel que ya exportan del WMS y del ERP; no se mezclan entre sí y se actualizan al importar.»

Pantalla: **login** → mostrar roles (Admin / Supervisor / Operador).

### 2. Dashboard general (4 min)

Menú: **Dashboard general**.

Destacar:

- **Barra de estado** con resumen por área (verde = datos cargados).
- **Tres tarjetas** con KPIs principales.
- **Gestos**: deslizar ← → cambia de módulo; tocar tarjeta abre el detalle.
- Botón **Pantalla TV** para sala de juntas.

Mensaje clave: *«En segundos vemos si operación, línea y facturación están bajo control.»*

### 3. Operaciones (3 min)

Menú: **Operaciones**.

- KPIs: abiertos, en proceso, total a trabajar.
- Gráfico de tendencia y desglose por área/tipo.
- Filtros por fecha y usuario.

### 4. Línea de trabajo (2 min)

Menú: **Línea de Trabajo**.

- Tareas **en proceso** y usuarios con pendiente.
- Vista solo pendientes para supervisión diaria.

### 5. Facturas (3 min)

Menú: **Facturas**.

- Todo en **RD$** (dólares convertidos con tasa actual).
- Ventas y órdenes por almacén.
- **Metas por almacén** y semáforo de cumplimiento (si están configuradas).

### 6. Modo TV (2 min)

Activar **Modo TV** desde el menú lateral o Dashboard general.

- Rotación automática: Operación → Línea → Factura.
- Una pantalla, sin scroll, letras grandes.
- Salir con **Esc**.

### 7. Cierre (1 min)

Menú: **Reportes** → informe consolidado → **Exportar PDF** (si aplica).

> «La plataforma está lista para uso piloto en almacén: importación Excel, roles, backup en Administración, y evolución a servidor central cuando la empresa lo requiera.»

---

## Preguntas frecuentes

| Pregunta | Respuesta |
|----------|-----------|
| ¿Necesita internet? | Solo la primera vez (librerías). Luego puede usarse en red local. |
| ¿Dónde se guardan los datos? | En el navegador (`localStorage`). Backup JSON en Administración. |
| ¿Se pueden cambiar usuarios? | Sí, en Administración (admin). |
| ¿Facturas en dólares? | Se convierten a pesos con la tasa configurada; no se muestran USD en el panel. |
| ¿Móvil / tablet? | Optimizado para escritorio y TV; tablet en horizontal es usable. |

---

## Si algo falla en vivo

| Problema | Solución rápida |
|----------|-----------------|
| Gráficos vacíos | Recargar página; verificar que abrió `http://localhost:8080` |
| «Sin datos» | Reimportar Excel en Administración |
| Modo TV no sale | Pulsar de nuevo Modo TV; Esc y reintentar |
| Excel no importa | Validar archivo → botón Validar antes de Importar |

Diagnóstico: Administración → Herramientas → **Diagnóstico del sistema**.

---

## Próximos pasos (mensaje para la empresa)

1. Piloto con datos reales semanales.
2. Definir metas por almacén en Facturas.
3. Pantalla TV en bodega o sala de supervisión.
4. Fase 2 (opcional): servidor, usuarios centralizados, integración API.

---

*WMS Control — Centro de Almacén*
