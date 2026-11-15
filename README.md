# Lumen

Panel de administración moderno para **OpenWrt**, pensado como alternativa a LuCI.
Estética y experiencia de uso inspiradas en consolas de red profesionales: barra lateral
compacta, tarjetas, gráficos en vivo y paneles laterales de detalle.

> Estado: **v0.1 (MVP en desarrollo)**. Solo lectura por ahora (panel, red, clientes, registros, sistema).

## Cómo funciona

Lumen es una SPA estática (Svelte 5 + Vite + TypeScript, sin dependencias en runtime) que habla
directamente con el router por **ubus JSON-RPC** (`/ubus`, el mismo canal que usa LuCI).
No hay backend propio: uhttpd sirve los ficheros y rpcd hace de API con sus ACL.

- Se instala en `/www/lumen/` y **convive con LuCI**, que sigue funcionando como respaldo.
- Bundle ~32 KB gzip de JS: cabe en routers con poca flash.
- Una sola petición batch cada 2 s alimenta todas las páginas (`src/lib/live.svelte.ts`).

## Desarrollo

```bash
npm install
npm run dev:mock                          # router simulado, no necesita hardware
LUMEN_TARGET=http://192.168.1.1 npm run dev   # contra un router real (proxy de /ubus)
npm run check                             # svelte-check + TypeScript
```

## Despliegue en un router

```bash
LUMEN_HOST=192.168.1.1 npm run deploy     # claves SSH; o LUMEN_PASS=... con sshpass
# → http://192.168.1.1/lumen/
```

El script compila, sube a un directorio temporal y lo intercambia de forma atómica.
Para quitar Lumen: `rm -rf /www/lumen` en el router.

## Estructura

```
src/lib/        cliente ubus, API de dominio, mock, stores (live, router, theme)
src/components/ Sidebar, Topbar, AreaChart, Donut, Drawer, Meter, Icon
src/routes/     Dashboard, Clients, Network, Logs, System, Login
src/styles/     tokens (claro/oscuro) y estilos base
scripts/        deploy.sh
```

## Hoja de ruta

- [ ] Escritura de configuración vía `uci` con **aplicar con confirmación y rollback automático**
- [ ] Wi-Fi (radios, SSID, clientes asociados vía `iwinfo`/`hostapd`)
- [ ] DHCP/DNS, reservas estáticas, firewall y reenvío de puertos
- [ ] Histórico de tráfico (daemon ligero con series temporales) y tráfico por cliente
- [ ] Paquete instalable (`apk`/`opkg`) con ACL de rpcd propia
- [ ] Gestión de paquetes y actualizaciones de firmware
- [ ] Internacionalización (ahora solo español)

## Notas de seguridad

Lumen nunca guarda credenciales: la sesión ubus vive en `sessionStorage` y caduca con rpcd.
Cualquier cambio de red que pueda cortar el acceso debe pasar por `uci apply` con confirmación.
