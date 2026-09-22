# Cómo está publicado Almacén Central 001

## URL pública (GitHub Pages)

**https://luisjoserodriguezcorripio-creator.github.io/Almacen-Central-001/**

La URL depende del **nombre del repositorio** en GitHub (`Almacen-Central-001`).

### Si aún ves `Almacen-Central-001` en la URL — renombrar en GitHub (1 minuto)

1. Abre: https://github.com/luisjoserodriguezcorripio-creator/Almacen-Central-001/settings  
   (o ejecuta `RENOMBRAR-URL-GITHUB.bat` en esta carpeta)
2. Arriba, en **Repository name**, escribe: **`Almacen-Central-001`**
3. Pulsa **Rename**
4. En PowerShell, en esta carpeta:

```powershell
git remote set-url origin https://github.com/luisjoserodriguezcorripio-creator/Almacen-Central-001.git
git push origin main
```

La web quedará en la nueva URL en **2–5 minutos**. La antigua (`…/Almacen-Central-001/`) redirige un tiempo.

---

## 1. Código en GitHub

https://github.com/luisjoserodriguezcorripio-creator/Almacen-Central-001

---

## 2. Web pública en internet (GitHub Pages)

**URL:**

https://luisjoserodriguezcorripio-creator.github.io/Almacen-Central-001/

La primera publicación tarda **2–5 minutos** después de cada cambio en `main`.

En el repo: **Settings → Pages** → debe decir *GitHub Actions*.

### Qué funciona en la web pública

- Login, dashboards, importar Excel, despacho
- **Personal registrado** (después de publicar usuarios — ver abajo)
- Modo TV, gráficos (con internet para Chart.js)

### Publicar usuarios para que entren desde la web

1. Crea el personal en **Administración → Usuarios** (con `serve-dashboard.ps1` activo).
2. Ejecuta en PowerShell:

```powershell
.\scripts\publicar-usuarios-web.ps1
```

3. Espera **2–5 minutos** y el personal entra en:

https://luisjoserodriguezcorripio-creator.github.io/Almacen-Central-001/

También puedes usar el botón **「Publicar usuarios en la web」** en Administración → Usuarios (exporta y te indica el script).

### Qué NO funciona en GitHub Pages

- **Sincronización LAN** entre varios dispositivos (requiere `serve-dashboard.ps1`)
- Servidor Node en red local

Para la **empresa en el almacén** (celulares + PCs mismo WiFi):

```powershell
.\serve-dashboard.ps1
```

Link LAN: `http://TU-IP:8080`

---

## 3. Seguridad

La URL de GitHub Pages es **pública**. Las contraseñas del README son solo demo.
Cámbialas antes de uso real en producción.
