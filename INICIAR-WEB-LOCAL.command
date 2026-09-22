#!/bin/zsh
# Inicia la web local (Mac) con sync Supabase Free en http://127.0.0.1:8080/
cd "$(dirname "$0")"
PORT=8080

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Ya hay un servidor en el puerto $PORT"
else
  echo "Iniciando Almacén Central DC en http://127.0.0.1:$PORT/"
  /usr/bin/python3 -m http.server "$PORT" --bind 127.0.0.1 >/tmp/almacen-dc-http.log 2>&1 &
  echo $! >/tmp/almacen-dc-http.pid
  sleep 1
fi

open "http://127.0.0.1:$PORT/"
echo "Listo. Ctrl+F5 si no ves cambios."
echo "Para detener: kill \$(cat /tmp/almacen-dc-http.pid)"
