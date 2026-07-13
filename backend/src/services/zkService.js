const ZKLib = require('zklib-js-zkteko');
const { AsistenciaProcesada, Empleado, RegistroCrudo, RolJornada } = require("../models");
const { Op } = require("sequelize");
const lockfile = require('proper-lockfile');
const path = require('path');
const fs = require('fs');

// Archivo que servirá de semáforo para todos los procesos
const LOCK_FILE_PATH = path.join(__dirname, '../../reloj.lock');
if (!fs.existsSync(LOCK_FILE_PATH)) fs.writeFileSync(LOCK_FILE_PATH, 'LOCK');

// ─── Instancia ──────────────────────────────────────────
const DEVICE_TIMEOUT = parseInt(process.env.RELOJ_TIMEOUT || 10000, 10);
const createDevice = () => new ZKLib(
    String(process.env.RELOJ_IP || "192.168.1.214").trim(),
    parseInt(process.env.RELOJ_PORT || 4370, 10),
    DEVICE_TIMEOUT
);

const UDP_COOLDOWN_MS = 5000;

// ─── Wrapper principal con Lock de Archivo ──────────────
async function withDevice(fn) {
    // Añadimos reintentos para problemas transitorios de red / UDP
    const maxAttempts = parseInt(process.env.RELOJ_RETRIES || '3', 10);
    const retryDelay = parseInt(process.env.RELOJ_RETRY_DELAY || '2000', 10);

    let lastErr;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        let release;
        try {
            // Intentar obtener el lock (reintenta por 30 segundos)
            // stale: 15000 significa que si el proceso muere, el lock caduca en 15 seg
            release = await lockfile.lock(LOCK_FILE_PATH, { 
                retries: { retries: 60, minTimeout: 500 },
                stale: 15000 
            });

            const zk = createDevice();
            await zk.createSocket();
            const result = await fn(zk);

            // Desconexión limpia
            try { await zk.disconnect(); } catch (_) {}

            // Espera de seguridad antes de soltar el archivo (Cooldown UDP)
            await new Promise(r => setTimeout(r, UDP_COOLDOWN_MS));

            if (release) await release();
            return result;
        } catch (err) {
            lastErr = err;

            // Si el lock está ocupado, no reintentamos muchas veces
            if (err && err.code === 'ELOCKED') {
                throw new Error('El reloj está siendo usado por otro proceso. Intente en unos segundos.');
            }

            const errMsg = (err && (err.err && err.err.message)) || (err && err.message) || '';
            const isTimeout = typeof errMsg === 'string' && errMsg.toUpperCase().includes('TIMEOUT');

            console.error(`❌ ZK Error (attempt ${attempt}/${maxAttempts}):`, errMsg || err);

            // Si no es un timeout de red, no reintentamos
            if (!isTimeout) {
                if (release) await release();
                throw err;
            }

            // Esperar antes de reintentar
            if (release) await release();
            if (attempt < maxAttempts) {
                await new Promise(r => setTimeout(r, retryDelay));
                console.log(`🔁 Reintentando conexión al reloj (intento ${attempt + 1})...`);
                continue;
            }
        }
    }

    console.error('❌ ZK: todos los intentos fallaron');
    throw lastErr || new Error('Error desconocido al acceder al reloj');
}

const cleanUid = (uid) => {
    // El reloj puede devolver caracteres de control (ej. \x0B) o espacios.
    // Eliminamos caracteres no imprimibles y hacemos trim.
    if (uid === null || uid === undefined) return "";
    try {
        return String(uid)
            .replace(/[\x00-\x1F\x7F]/g, '') // eliminar controles ASCII
            .trim();
    } catch (e) {
        return String(uid).trim();
    }
};

// ─── Lógica de asistencia ───────────────────────────────
const procesarAsistencias = async (uid, fecha) => {
    try {
        const emp = await Empleado.findOne({ 
            where: { uid_reloj: uid },
            include: [RolJornada]
        });
        if (!emp) return;

        const [y, m, d] = fecha.split("-").map(Number);
        const inicio = new Date(y, m - 1, d, 0, 0, 0);
        const fin    = new Date(y, m - 1, d, 23, 59, 59);

        const registros = await RegistroCrudo.findAll({
            where: { uid_reloj: uid, timestamp: { [Op.between]: [inicio, fin] } },
            order: [["timestamp", "ASC"]]
        });

        if (!registros.length) return;

        const entrada = registros[0].timestamp;
        const tieneSalida = registros.length >= 2;
        const salida = tieneSalida ? registros[registros.length - 1].timestamp : null;

        let tolerancia = 5;
        let schedHoraEntrada = "08:00:00";

        if (emp.RolJornada) {
            schedHoraEntrada = emp.RolJornada.hora_entrada_1 || "08:00:00";
            tolerancia = emp.RolJornada.tolerancia_minutos !== undefined ? emp.RolJornada.tolerancia_minutos : 5;
        }

        const [schedHour, schedMin] = schedHoraEntrada.split(":").map(Number);
        const entradaMinutos = entrada.getHours() * 60 + entrada.getMinutes();
        const schedMinutos = schedHour * 60 + schedMin;
        const limiteMinutos = schedMinutos + tolerancia;

        const esTarde = entradaMinutos > limiteMinutos;
        const minutosTardanza = esTarde ? entradaMinutos - schedMinutos : 0;

        let estado = "FALTA_SALIDA";
        if (tieneSalida) {
            estado = esTarde ? "TARDE" : "PRESENTE";
        }

        const diffHrs = tieneSalida ? (salida - entrada) / (1000 * 60 * 60) : 0;

        const datos = {
            uid_reloj: uid,
            fecha,
            hora_entrada: entrada,
            hora_salida: salida,
            horas_totales: tieneSalida ? parseFloat(diffHrs.toFixed(2)) : 0,
            estado,
            minutos_tardanza: minutosTardanza,
            cumplio_jornada: false
        };

        const [asist, created] = await AsistenciaProcesada.findOrCreate({
            where: { uid_reloj: uid, fecha },
            defaults: datos
        });
        if (!created) await asist.update(datos);

        console.log(`${created ? '✨ CREADA' : '✅ ACTUALIZADA'} asistencia UID ${uid} - Estado: ${estado}`);
    } catch (e) {
        console.error(`❌ procesarAsistencias UID ${uid}:`, e.message);
    }
};

const syncClockData = async () => {
    console.log("🔄 Iniciando sincronización robusta...");
    try {
        await withDevice(async (zk) => {
            // 1. Reloj -> Web (Importar usuarios nuevos y detectar faltantes)
            console.log("👥 Descargando usuarios del reloj...");
            const { data: users } = await zk.getUsers();
            const uidsEnReloj = users.map(u => cleanUid(u.userId));

            // Marcar como "no sincronizados" los que estén en la web pero no en el reloj
            await Empleado.update(
                { sincronizado_reloj: false },
                { where: { uid_reloj: { [Op.notIn]: uidsEnReloj } } }
            );

            for (const u of users) {
                const uid = cleanUid(u.userId);
                if (!uid) continue;
                await Empleado.findOrCreate({
                    where: { uid_reloj: uid },
                    defaults: { nombre: u.name, activo: true, sincronizado_reloj: true }
                });
            }

            // 2. Web -> Reloj (Subir empleados nuevos, editados o recuperados)
            // ELIMINADO: Ahora los usuarios solo se registran en la máquina directamente.

            // 3. Marcaciones -> registros_crudos
            console.log("📅 Descargando marcaciones...");
            const { data: logs } = await zk.getAttendances();
            const fechaActual = new Date().toISOString().split("T")[0];
            const uidsHoy = new Set();

            for (const log of logs) {
                const uid = cleanUid(log.deviceUserId);
                if (!uid || uid.includes('\x1E')) continue;
                const ts = new Date(log.recordTime);
                if (ts.getFullYear() < 2020) continue; 

                await RegistroCrudo.findOrCreate({
                    where: { uid_reloj: uid, timestamp: ts }
                });

                if (ts.toISOString().startsWith(fechaActual)) uidsHoy.add(uid);
            }

            console.log(`⚙️ Procesando ${uidsHoy.size} empleados...`);
            for (const uid of uidsHoy) {
                await procesarAsistencias(uid, fechaActual);
            }
        });
        console.log("✨ Sincronización completada.");
    } catch (error) {
        console.error("❌ syncClockData falló:", error.message);
    }
};

const syncClockTime = async () => {
    return await withDevice(async (zk) => {
        const now = new Date();
        const timeEncoded = ((((now.getFullYear() - 2000) * 12 +
            now.getMonth()) * 31 +
            now.getDate() - 1) * 24 +
            now.getHours()) * 60 * 60 +
            now.getMinutes() * 60 +
            now.getSeconds();
            
        const buf = Buffer.alloc(4);
        buf.writeUInt32LE(timeEncoded, 0);
        
        await zk.executeCmd(202, buf);
        return now;
    });
};

const getClockUsers = async () => {
    return await withDevice(async (zk) => {
        const { data } = await zk.getUsers();
        return data;
    });
};

const getClockAdmins = async () => {
    try {
        const users = await getClockUsers();
        return (users || []).filter(u => u.role === 14 || u.role === 3 || u.privilege === 14);
    } catch {
        return [];
    }
};

const importUsers = async () => {
    try {
        const users = await getClockUsers();
        for (const u of users) {
            await Empleado.findOrCreate({
                where: { uid_reloj: cleanUid(u.userId) },
                defaults: { nombre: u.name, activo: true }
            });
        }
        return true;
    } catch { return false; }
};

// Funciones updateClockUser y deleteClockUser eliminadas (solo lectura)

module.exports = {
    syncClockData,
    syncClockTime,
    getClockUsers,
    getClockAdmins,
    importUsers
};
