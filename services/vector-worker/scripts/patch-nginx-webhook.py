#!/usr/bin/env python3
from pathlib import Path

p = Path('/etc/nginx/sites-enabled/webhook-bot')
text = p.read_text()

block = """    # Vector worker (Alcohn app -> EPS auto-vectorization)
    location /vector/ {
        rewrite ^/vector/(.*) /$1 break;
        proxy_pass http://127.0.0.1:8790;
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
if '/vector/' not in text:
    text = text.replace(needle, block + needle)
    p.write_text(text)
    print('nginx patched ok for /vector/')
else:
    print('vector block already present')
