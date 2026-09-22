Videos de fondo — login (Almacén Central)
=========================================

Sitio: Almacén Central

Video principal (pantalla de inicio de sesión):

  login-operation-mini.mp4 — bucle corto (~12 s, ~380 KB) video LAN
  login-operation-lite.mp4 — alternativa (~22 s, ~2.5 MB)
  login-operation-full.mp4 — montaje completo (~118 s, ~20 MB) solo LAN local
  Secuencia: pasillos/racks → montacargas (3 tomas) → inspección de inventario

  login-operation-poster.jpg — vista previa (legacy)

Imagen login WMS principal (index.html):

  ../img/login-wms-poster.jpg — almacén ejecutivo, tono azul DC

Imagen portal Despacho (despacho.html):

  ../img/login-dispatch-poster.jpg — muelle / carga, tono ámbar

Imagen portal Operaciones de Piso / Reportes (averias.html):

  ../img/login-averias-poster.jpg — piso almacén, paletas, tono verde

Clips del montaje (Mixkit — almacén / montacargas / racks):

  clip-racks.mp4           — recorrido en almacén (23010)
  clip-forklift-rack-a.mp4 — montacargas operando (45848)
  clip-forklift-rack-b.mp4 — vehículo elevador / montacargas (23303)
  clip-forklift-rack-c.mp4 — operador montacargas (23789)
  clip-inventory.mp4       — inspección de productos (4705)

No incluir en el montaje (camión de carga / muelle):

  clip-loading.mp4, clip-walk.mp4

Regenerar login-operation-lite.mp4 (ffmpeg en PATH):

  cd assets/video
  ffmpeg -y -i login-operation-full.mp4 -t 22 -an -vf "scale=1280:-2" -c:v libx264 -preset medium -crf 27 -movflags +faststart -pix_fmt yuv420p -r 24 login-operation-lite.mp4

Regenerar login-operation-full.mp4 (ffmpeg en PATH):

  cd assets/video
  ffmpeg -y -f concat -safe 0 -i concat-list.txt -c copy login-operation-raw.mp4
  ffmpeg -y -i login-operation-raw.mp4 -an -c:v libx264 -preset fast -crf 22 -movflags +faststart -pix_fmt yuv420p login-operation-full.mp4

Sirve la app con serve-dashboard.ps1.
