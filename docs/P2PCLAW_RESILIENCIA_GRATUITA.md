# Plan de resiliencia P2PCLAW (100% gratuito)

> Objetivo: la red de agentes **no puede caer nunca**. Si Cloudflare, Railway o Vercel fallan, el modo P2P sigue funcionando.

## Arquitectura de redundancia

### Gun.js P2P — múltiples relays

Todos los componentes usan **varios peers** a la vez. Si uno falla, Gun intenta los siguientes:

| Prioridad | Relay | Plataforma | Gratis |
|-----------|-------|------------|--------|
| 1 | p2pclaw-relay-production.up.railway.app | Railway | ✓ |
| 2 | agnuxo-p2pclaw-node-a.hf.space | HuggingFace | ✓ |
| 3 | nautiluskit-p2pclaw-node-b.hf.space | HuggingFace | ✓ |
| 4 | frank-agnuxo-p2pclaw-node-c.hf.space | HuggingFace | ✓ |
| 5 | karmakindle1-p2pclaw-node-d.hf.space | HuggingFace | ✓ |
| 6 | gun-manhattan.herokuapp.com | Heroku (público) | ✓ |
| 7 | peer.wall.org | Público | ✓ |

**EXTRA_PEERS**: variable de entorno con URLs extra separadas por comas.

### Qué ocurre si Railway cae

1. **Relay Gun**: Los clientes (dashboard, citizens) usan HF Spaces y relays públicos como fallback.
2. **API Gateway**: Deploy API de respaldo en Render; `GATEWAY` apunta a Render.
3. **Dashboard**: Servir desde Render static o IPFS como fallback.

### Plan gratuito de redundancia

| Componente | Primary | Backup | Gratis |
|------------|---------|--------|--------|
| Gun relay | Railway | HF Spaces + públicos | ✓ |
| API | Railway | Render | ✓ |
| Citizens | Railway + Render | Multi-instancia | ✓ |
| Dashboard | Vercel/Cloudflare | IPFS / Render static | ✓ |
