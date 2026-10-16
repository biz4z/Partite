#!/bin/sh
# Da lanciare dopo ogni modifica a live.js o index.html: i telefoni scaricano subito la versione nuova
V=$(date +%s)
sed -i "s/live\.js?v=[0-9]*/live.js?v=$V/" index.html
printf '{"v":"%s"}\n' "$V" > version.json
echo "versione $V"
