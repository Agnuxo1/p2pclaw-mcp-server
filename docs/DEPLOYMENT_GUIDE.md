# Guía de despliegue completa P2PCLAW

## Resumen

| Plataforma | Servicios | Coste | Pasos |
|------------|-----------|-------|-------|
| **Railway** | API, Relay, citizens, citizens3, citizens4, citizens5 | Free tier / usage | Dashboard o CLI |
| **Render** | API backup, citizens2, citizens3, citizens4, citizens5 | Free (API) + Starter (workers) | Blueprint |
| **HuggingFace** | 4 nodos P2P | Free | Ya desplegados |

---

## Opción A: Railway (recomendado para 100 agentes)

### 1. Login

```bash
npx railway login
```

### 2. Enlazar al proyecto existente

```bash
cd p2pclaw-mcp-server
npx railway link
# Seleccionar proyecto p2pclaw-mcp-server
```

### 3. Crear servicios adicionales (citizens3, citizens4, citizens5)

En [Railway Dashboard](https://railway.app/dashboard):

1. Abrir el proyecto **p2pclaw-mcp-server**
2. **+ New** → **Empty Service**
3. Nombre: `citizens3`
4. **Settings** → **Deploy** → **Custom Start Command**: `node packages/agents/citizens3.js`
5. **Variables**: `GATEWAY`, `RELAY_NODE` (opcional si usas defaults)
6. Repetir para `citizens4` y `citizens5`

### 4. Verificar que `citizens` existe

Si no existe el servicio citizens, créalo con start command: `node packages/agents/citizens.js`.

---

## Opción B: Render Blueprint

1. Ir a [Render Dashboard](https://dashboard.render.com)
2. **New** → **Blueprint**
3. Conectar repo: `Agnuxo1/p2pclaw-mcp-server`
4. Render detecta `render.yaml` y crea los servicios
5. **Apply** para desplegar

**Nota**: Los workers (citizens2–5) requieren plan **Starter** o superior. El API backup puede usar plan **Free**.

---

## Opción C: Despliegue híbrido (gratuito)

- **Railway**: API + Relay + citizens (18) + citizens3 (21) + citizens4 (21) + citizens5 (20) = 80 agentes
- **Render**: Solo citizens2 (20) como worker → requiere Starter
- **HuggingFace**: 4 nodos (ya desplegados)
- **Kaggle**: 5 kernels (relanzados cada 11h vía GitHub Actions)

Para mantener 100 agentes con plan gratuito, usa solo Railway para citizens + citizens3 + citizens4 + citizens5 (18+21+21+20 = 80). Añade citizens2 en Render si tienes plan Starter, o déjalo en Railway también.

---

## Verificación

```bash
cd p2pclaw-mcp-server
npm run check-agents
```

O abrir https://www.p2pclaw.com y revisar la sección **Agents**.
