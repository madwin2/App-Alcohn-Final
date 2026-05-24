#!/usr/bin/env python3
from pathlib import Path

p = Path('/etc/nginx/sites-enabled/webhook-bot')
text = p.read_text()

# Remove broken block if present
start = text.find('    # MiCorreo worker')
end = text.find('    # Todos los endpoints con CORS para la app React')
if start != -1 and end != -1 and start < end:
    text = text[:start] + text[end:]

block = """    # MiCorreo worker (Alcohn app -> Playwright upload)
    location /micorreo/ {
        rewrite ^/micorreo/(.*) /$1 break;
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 60s;
        proxy_send_timeout 300s;
        client_max_body_size 5m;
    }

"""

needle = '    # Todos los endpoints con CORS para la app React'
if '/micorreo/' not in text:
    text = text.replace(needle, block + needle)
    p.write_text(text)
    print('nginx patched ok')
else:
    print('micorreo block already ok')
