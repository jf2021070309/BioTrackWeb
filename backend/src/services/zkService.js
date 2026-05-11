const ZKLib = require('zklib-js-zkteko');
const { AsistenciaProcesada, Empleado, RegistroCrudo } = require("../models");
const { Op } = require("sequelize");
const lockfile = require('proper-lockfile');
const path = require('path');
const fs = require('fs');

// Archivo que servirá de semáforo para todos los procesos
const LOCK_FILE_PATH = path.join(__dirname, '../../reloj.lock');
if (!fs.existsSync(LOCK_FILE_PATH)) fs.writeFileSync(LOCK_FILE_PATH, 'LOCK');

// ─── Instancia ──────────────────────────────────────────
const createDevice = () => new ZKLib(
    String(process.env.RELOJ_IP || "192.168.1.214").trim(),
    parseInt(process.env.RELOJ_PORT || 4370, 10),
    10000
);

const UDP_COOLDOWN_MS = 5000;

// ─── Wrapper principal con Lock de Archivo ──────────────
async function withDevice(fn) {
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
        
        return result;
    } catch (err) {
        if (err.code === 'ELOCKED') {
            throw new Error('El reloj está siendo usado por otro proceso. Intente en unos segundos.');
        }
        console.error('❌ ZK Error:', err.message || err);
        throw err;
    } finally {
        if (release) await release();
    }
}

const cleanUid = (uid) => String(uid || "").trim();

// ─── Lógica de asistencia ───────────────────────────────
const procesarAsistencias = async (uid, fecha) => {
    try {
        const emp = await Empleado.findOne({ where: { uid_reloj: uid } });
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
        const salida  = registros[registros.length - 1].timestamp;
        const diffHrs = (salida - entrada) / (1000 * 60 * 60);

        const cargo = (emp.cargo || "").toLowerCase();
        const horasReq = cargo.includes("practicante") ? 6 : 8;
        const esTarde  = entrada.getHours() > 8 ||
                        (entrada.getHours() === 8 && entrada.getMinutes() > 5);

        let estado = "PRESENTE";
        if (esTarde) estado = "TARDE";
        if (registros.length === 1) estado = "INCOMPLETO";

        const datos = {
            uid_reloj: uid,
            fecha,
            hora_entrada: entrada,
            hora_salida: registros.length > 1 ? salida : null,
            horas_totales: registros.length > 1 ? parseFloat(diffHrs.toFixed(2)) : 0,
            estado,
            cumplio_jornada: diffHrs >= horasReq
        };

        const [asist, created] = await AsistenciaProcesada.findOrCreate({
            where: { uid_reloj: uid, fecha },
            defaults: datos
        });
        if (!created) await asist.update(datos);

        console.log(`${created ? '✨ CREADA' : '✅ ACTUALIZADA'} asistencia UID ${uid}`);
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
            console.log("📤 Subiendo empleados nuevos al reloj...");
            const pendientes = await Empleado.findAll({ where: { sincronizado_reloj: false } });
            for (const p of pendientes) {
                try {
                    const uidNum = parseInt(p.uid_reloj);
                    if (isNaN(uidNum) || uidNum <= 0 || uidNum > 3000) {
                        console.warn(`   ⚠️ UID fuera de rango para ${p.nombre}: ${p.uid_reloj}`);
                        continue;
                    }

                    // Validaciones según los límites reales de la librería y el hardware
                    const nombreLimpio = String(p.nombre).trim().substring(0, 24);
                    const userIdStr   = String(p.uid_reloj).substring(0, 9);
                    const passStr     = String(p.password || "").substring(0, 8);
                    const cardStr     = String(p.cardno || "0").substring(0, 10);
                    const role        = p.rol_reloj || 0;

                    console.log(`📤 Intentando subir a: ${nombreLimpio} (ID: ${uidNum})...`);
                    
                    // setUser(uid, userid, name, password, role, cardno)
                    const result = await zk.setUser(uidNum, userIdStr, nombreLimpio, passStr, role, cardStr);
                    
                    if (result === false) {
                        console.error(`   ❌ El reloj rechazó los datos de ${nombreLimpio} (Validación fallida en librería)`);
                        continue;
                    }

                    console.log(`   ✅ ${nombreLimpio} guardado en el reloj.`);
                    await p.update({ sincronizado_reloj: true });
                } catch (e) {
                    console.error(`   ❌ Error con ${p.nombre}:`, e.message);
                }
            }

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
        const buf = Buffer.alloc(6);
        buf.writeUInt8(now.getFullYear() % 100, 0);
        buf.writeUInt8(now.getMonth() + 1, 1);
        buf.writeUInt8(now.getDate(), 2);
        buf.writeUInt8(now.getHours(), 3);
        buf.writeUInt8(now.getMinutes(), 4);
        buf.writeUInt8(now.getSeconds(), 5);
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

const updateClockUser = async (userId, name, password, role, cardno) => {
    return await withDevice(async (zk) => {
        const uid = parseInt(userId) || 100;
        await zk.setUser(uid, userId, name, password, role, cardno);
        return true;
    });
};

const deleteClockUser = async (uid) => {
    return await withDevice(async (zk) => {
        const uidNum = parseInt(uid) || 0;
        const buf = Buffer.alloc(2);
        buf.writeUInt16LE(uidNum, 0);
        await zk.executeCmd(100, buf);
        return true;
    });
};

module.exports = {
    syncClockData,
    syncClockTime,
    getClockUsers,
    importUsers,
    updateClockUser,
    deleteClockUser
};
