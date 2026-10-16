#!/usr/bin/env python3
"""Genera index.html (GitHub Pages) dal file HTML dell'artifact claude.ai.
Uso: python3 build.py <file-artifact.html>"""
import re, sys
s = open(sys.argv[1], encoding="utf-8").read()
s = re.sub(r'<link rel="apple-touch-icon" href="data:[^"]+">\n?', '', s)
s = re.sub(r'<link rel="icon" type="image/png" href="data:[^"]+">\n?', '', s)
s = s.replace('<meta name="claude:viewport-fit-sides" content="cover">\n', '')
s = re.sub(r'^\s*<!doctype html>.*?<head>\s*', '', s, flags=re.S | re.I)
s = re.sub(r'</?(html|head|body)\b[^>]*>\s*', '', s, flags=re.I)
s = s.replace('Apri <b>tinyurl.com/m2c6c</b>', 'Apri <b>biz4z.github.io/Partite</b>')
head = '''<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="icon" type="image/png" href="favicon.png">
<link rel="manifest" href="manifest.json">
<meta name="theme-color" content="#ffffff">
'''
i = s.find('<style>')
out = head + s[:i] + '</head>\n<body>\n' + s[i:].rstrip() + '\n</body>\n</html>\n'
open("index.html", "w", encoding="utf-8").write(out)
print("index.html aggiornato")
