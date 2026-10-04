# VYBE SERVER 1.0

Servidor independiente para VYBE.

## Incluye

- GET /health
- GET /api/config
- POST /api/chat
- GET /api/history?userId=...
- DELETE /api/history?userId=...
- GET /api/initiative?userId=...
- POST /api/initiative
- POST /api/initiative/check
- POST /api/create-preference (Mercado Pago opcional)
- POST /api/webhook

Los mensajes e iniciativa se guardan en `data/vybe-data.json`.

## Ejecutar en Termux

```bash
pkg update
pkg install nodejs
npm install
cp .env.example .env
npm start
```

El servidor escucha en `0.0.0.0:3000`.

## Importante

Este servidor ya funciona sin una clave de IA: usa respuestas locales de respaldo.
Para respuestas de IA generativa reales hay que conectar un proveedor de IA y guardar su clave
solo en el servidor, nunca dentro de la APK.

Mercado Pago también es opcional. No pongas tokens dentro de la app.
