# Almacén Central 001

Plataforma web de **control ejecutivo de almacén**: importación Excel, dashboards, modo TV, **despacho**, inventario RF, turnos, agenda, recepción y **red local (LAN)**.

**Propietario:** [luisjoserodriguezcorripio-creator](https://github.com/luisjoserodriguezcorripio-creator)  
**Repositorio:** [Almacen-Central-001](https://github.com/luisjoserodriguezcorripio-creator/Almacen-Central-001)  
**GitHub Pages:** https://luisjoserodriguezcorripio-creator.github.io/Almacen-Central-001/

## Módulos

| Módulo | Qué muestra |
|--------|-------------|
| **Centro de mando** | KPIs unificados de operación y facturas |
| **Operaciones** | Abiertos, en proceso, tendencias, por área |
| **Facturas** | Ventas por almacén, metas, gráficos |
| **Productividad** | Rendimiento por empleado |
| **Despacho** | Preparador ↔ Validador |
| **Inventario RF** | Conteo pickup, rack y piso |
| **Turnos** | Chofer y supervisor |
| **Agenda** | Tareas diarias por puesto |
| **Recepción** | Contenedores, validación y ubicación |

## Inicio rápido

```powershell
cd C:\Users\lrruiz\Projects\Almacen-Central-001
.\serve-dashboard.ps1
```

Abrir: **http://localhost:8080**

> No abrir `index.html` como `file://`. Requiere servidor HTTP.

## Nota de independencia

Esta copia está desconectada de Firebase/Supabase/JsonBin del proyecto anterior. Configure sus propias credenciales en `data/site-config.json` cuando las necesite.

## Atajos

| Atajo | Acción |
|-------|--------|
| `Alt+1` | Centro de mando |
| `Alt+2` | Productividad |
| `Alt+3` | Operaciones |
| `Alt+4` | Facturas |
| `Alt+5` | Despacho |
| `Alt+6` | Reportes |
| `Alt+7` | Administración |
| `R` | Actualizar |
| `T` | Tema claro/oscuro |
| `Esc` | Salir modo TV |
| `?` | Ayuda |

---

**Versión:** Almacen-Central-001 — marca propia, portales y WMS completo.
