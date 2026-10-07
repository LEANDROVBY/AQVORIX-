# AQVORIX SERVER 1.1

Servidor de VYBE preparado para un modelo Free + PRO.

## Nuevas funciones

- `GET /api/usage?userId=...` contador diario.
- 20 mensajes/día gratis por defecto.
- Usuarios PRO sin límite diario.
- `GET /api/me?userId=...` estado de la cuenta.
- Iniciativa corregida: devuelve `shouldSpeak` y `message` y requiere PRO.
- `POST /api/admin/grant-pro` para pruebas manuales.

## Monetización real

Para una app Android distribuida por Google Play, las funciones digitales premium deben integrarse con Google Play Billing. El endpoint `grant-pro` es solamente para pruebas; no es un sistema de cobro.

## Ejecutar

```bash
npm install
cp .env.example .env
npm start
```
