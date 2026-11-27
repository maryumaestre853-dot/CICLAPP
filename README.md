# Ciclapp — Instalación y ejecución

## Resumen
Este proyecto tiene dos partes:

- `backend/` — API en FastAPI con base de datos PostgreSQL.
- `frontend/` — app móvil con Expo y React Native.

Este README explica cómo instalar y ejecutar ambas partes.

---

## Requisitos previos

Instala estos componentes antes de comenzar:

- Node.js 18 o superior
- Python 3.11 o superior
- PostgreSQL 14 o superior
- Expo CLI (se instala con npm)
- Git (opcional)

---

## 1) Configurar el backend

### 1.1) Crear la base de datos

Usa `psql` o tu cliente favorito para crear la base de datos:

```sql
CREATE DATABASE ciclapp;
```

### 1.2) Entrar al directorio del backend

```bash
cd backend
```

### 1.3) Crear y activar un entorno virtual

Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

Windows CMD:

```cmd
python -m venv .venv
.\.venv\Scripts\activate
```

Mac/Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

### 1.4) Instalar dependencias del backend

```bash
pip install fastapi uvicorn sqlalchemy psycopg2-binary
```

### 1.5) Configurar la conexión a PostgreSQL

Configura `DATABASE_URL` en el entorno o en un archivo `.env` dentro de `backend/`:

```python
DATABASE_URL=postgresql+psycopg2://postgres:tu_clave@localhost:5432/ciclapp
```

Ajusta usuario, contraseña, host o puerto según tu instalación.

Para habilitar el envío de códigos de recuperación, agrega al mismo `.env` las
credenciales de un servidor SMTP:

```text
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USERNAME=tu_cuenta
SMTP_PASSWORD=tu_clave_de_aplicacion
SMTP_FROM=tu_cuenta@example.com
SMTP_USE_TLS=true
```

`SMTP_FROM` puede omitirse si coincide con `SMTP_USERNAME`. Sin configuración
SMTP, el formulario de recuperación indicará que el servicio de correo no está
disponible.

### 1.6) Iniciar el backend

```bash
py -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Si `py` no funciona, usa `python` o `python3`.

### 1.7) Verificar el backend

Visita en tu navegador:

```text
http://127.0.0.1:8000/docs
```

Si ves la documentación de FastAPI, el backend está corriendo.

---

## 2) Configurar el frontend

### 2.1) Entrar al directorio del frontend

```bash
cd frontend
```

### 2.2) Instalar dependencias

```bash
npm install
```

### 2.3) Ajustar la URL del backend

Edita `frontend/app/services/storage.ts` y actualiza:

```ts
export const API_URL = "http://192.168.1.9:8000";
```

Cambia esta URL por la IP y el puerto donde tu backend sea accesible.

- Dispositivo físico: usa la IP local de tu PC.
- Emulador Android: prueba con `10.0.2.2:8000`.
- Emulador iOS: usa `127.0.0.1:8000`.

### 2.4) Iniciar el frontend

```bash
npx expo start --clear
```

### 2.5) Abrir la app

Desde el panel de Expo puedes abrir la app en:

- Expo Go en un celular físico
- Emulador Android
- Simulador iOS

En Android, el mapa se muestra con OpenStreetMap dentro de un WebView para no
depender de la autorización de Google Maps del entorno de prueba. Requiere
conexión a Internet. En iOS se conserva el mapa nativo.

---

## 3) Orden recomendado de arranque

1. Inicia PostgreSQL.
2. Inicia el backend en `backend/`.
3. Ajusta `API_URL` en el frontend.
4. Inicia el frontend en `frontend/`.

---

## 4) Problemas comunes

### El backend no encuentra PostgreSQL

- Asegúrate de que PostgreSQL esté corriendo.
- Confirma que la base de datos `ciclapp` existe.
- Revisa las credenciales y el puerto en `backend/database.py`.

### El frontend no se conecta al backend

- Comprueba que `API_URL` apunta a la IP correcta.
- Asegúrate de que el dispositivo/emulador pueda acceder a la red.
- Si usas un dispositivo físico, PC y celular deben estar en la misma WiFi.

### El mapa de Android no carga

- Comprueba que el teléfono tiene conexión a Internet.
- Reinicia Expo con `npx expo start --clear` para cargar el código actualizado.
- El mapa Android usa OpenStreetMap; no requiere la clave nativa de Google Maps.

### Expo no inicia o muestra errores

```bash
npx expo install @react-native-async-storage/async-storage
npx expo install react-native-maps
npx expo install expo-location
npx expo start --clear
```

---

## 5) Estructura de carpetas

```
backend/      ← API FastAPI + SQLAlchemy
frontend/     ← App Expo / React Native
```

---

## 6) Notas finales

- El backend crea las tablas automáticamente al iniciar.
- El frontend usa `AsyncStorage` para caché local y la API del backend
  para sincronizar datos.
- Si modificas la configuración de la base de datos, reinicia el backend.
