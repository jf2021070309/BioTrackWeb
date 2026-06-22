# BioTrackWeb

Plataforma integral para la gestión de asistencia y personal con integración a relojes biométricos ZKTeco.

## Requisitos Previos

- **Node.js** instalado.
- **XAMPP** (con MySQL corriendo).
- El reloj biométrico debe estar conectado a la red local y con la IP configurada en el archivo `backend/.env`.

---

## 🚀 Cómo arrancar el proyecto

El proyecto consta de 3 partes que deben ejecutarse en paralelo (puedes usar diferentes pestañas de tu terminal).

### 1. Arrancar el Backend (Servidor API)
Se encarga de exponer los servicios y conectar la base de datos con la interfaz.

```powershell
cd backend
node src/index.js
```
*(Deberás ver un mensaje de éxito: `🚀 Servidor BioTrack en puerto 5000` y `✅ Base de datos sincronizada`)*

### 2. Arrancar el Frontend (Interfaz Web en React)
Levanta la interfaz gráfica donde puedes ver las estadísticas y administrar empleados.

```powershell
cd frontend
npm run dev
```
*(Abre la URL que te genera en el navegador, normalmente `http://localhost:5173`)*

---

## 🛠 Solución de Problemas Comunes

- **`❌ Error DB: Unknown database 'biotrack_db'`**: Significa que no has creado la base de datos en MySQL. Abre XAMPP, ve a phpMyAdmin y ejecuta el archivo `backend/database.sql` para crear las tablas.
- **`TIMEOUT_ON_WRITING_MESSAGE`**: El servidor no puede comunicarse con el reloj biométrico. Revisa que la IP del reloj coincida con la del `.env` y que esté encendido/conectado a la red.
