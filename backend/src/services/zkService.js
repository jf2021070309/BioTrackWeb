const ZKLib = require('zklib-js-zkteko');
const { AsistenciaProcesada, Empleado, RegistroCrudo } = require("../models");
const { Op } = require("sequelize");

const createDevice = () => new ZKLib(
    String(process.env.RELOJ_IP || "192.168.1.214").trim(),
    parseInt(process.env.RELOJ_PORT || 4370, 10),
    10000,
    5200
);

// Lock simple para evitar colisiones
let hardwareBusy = false;

const acquireLock = async () => {
    while (hardwareBusy) {
        await new Promise(r => setTimeout(r, 500));
    }
    hardwareBusy = true;
};

const releaseLock = async () => {
    await new Promise(r => setTimeout(r, 1000));
    hardwareBusy = false;
};

async function withDevice(fn) {
    const zk = createDevice();
    try {
        await zk.createSocket();
        return await fn(zk);
    } catch (err) {
        console.error('❌ ZK Error:', err.message || err);
        throw err;
    } finally {
        try { await zk.disconnect(); } catch (_) {}
    }
}

const cleanClockUid = (uid) => String(uid).trim();

const syncClockData = async () => {
    await acquireLock();
    try {
        console.log("🔄 Iniciando sincronización robusta con zkteco-js...");
        
        await withDevice(async (zk) => {
            // 1. Sincronizar usuarios (Reloj -> DB)
            console.log("👥 Obteniendo usuarios del reloj...");
            const { data: users } = await zk.getUsers();
            console.log(`✅ ${users.length} usuarios encontrados en el reloj.`);

            for (const u of users) {
                const uid = cleanClockUid(u.userId);
                await Empleado.findOrCreate({
                    where: { uid_reloj: uid },
                    defaults: {
                        nombre: u.name,
                        activo: true
                    }
                });
            }

            // 2. Obtener marcaciones
            console.log("📅 Descargando marcaciones...");
            const { data: logs } = await zk.getAttendances();
            console.log(`✅ ${logs.length} marcaciones recibidas.`);

            const fechaActual = new Date().toISOString().split("T")[0];
            const uidsInvolucrados = new Set();

            for (const log of logs) {
                const uid = cleanClockUid(log.deviceUserId);
                if (!uid || uid === "" || uid.includes('\x00')) continue; // Saltar basura

                const ts = new Date(log.recordTime);
                
                // Guardar log crudo si no existe
                await RegistroCrudo.findOrCreate({
                    where: {
                        uid_reloj: uid,
                        timestamp: ts
                    }
                });

                // Si la marcación es de hoy, la incluimos para procesar
                if (log.recordTime.includes(fechaActual) || ts.toISOString().startsWith(fechaActual)) {
                    uidsInvolucrados.add(uid);
                }
            }

            // 3. Procesar asistencia
            console.log(`⚙️ Procesando asistencia para ${uidsInvolucrados.size} empleados... (${Array.from(uidsInvolucrados).join(', ')})`);
            for (const uid of uidsInvolucrados) {
                await procesarAsistencias(uid, fechaActual);
            }
        });

        console.log("✨ Sincronización completada con éxito.");
    } catch (error) {
        console.error("❌ Error en syncClockData:", error.message);
        throw error;
    } finally {
        await releaseLock();
    }
};

const procesarAsistencias = async (uid, fecha) => {
    try {
        const emp = await Empleado.findOne({ where: { uid_reloj: uid } });
        if (!emp) return;

        const [year, month, day] = fecha.split("-").map(Number);
        const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
        const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);

        const registros = await RegistroCrudo.findAll({ 
            where: { 
                uid_reloj: uid,
                timestamp: {
                    [Op.between]: [startOfDay, endOfDay]
                }
            }, 
            order: [["timestamp", "ASC"]] 
        });

        console.log(`🔍 [DEBUG] UID ${uid} en fecha ${fecha}: ${registros.length} registros encontrados.`);
        
        if (registros.length > 0) {
            const entrada = registros[0].timestamp;
            const salida = registros[registros.length - 1].timestamp;
            const diffHrs = (salida.getTime() - entrada.getTime()) / (1000 * 60 * 60);
            
            const cargo = (emp.cargo || "").toLowerCase();
            let horasRequeridas = 8;
            let esTarde = false;
            let estado = "PRESENTE";

            if (cargo.includes("practicante")) horasRequeridas = 6;

            // Lógica de tardanza básica (ejemplo 8:05 AM)
            if (entrada.getHours() > 8 || (entrada.getHours() === 8 && entrada.getMinutes() > 5)) {
                esTarde = true;
                estado = "TARDE";
            }

            // Buscar si ya existe la asistencia para este empleado y fecha
            let asistencia = await AsistenciaProcesada.findOne({
                where: { uid_reloj: uid, fecha: fecha }
            });

            const datosAsistencia = {
                uid_reloj: uid,
                fecha: fecha,
                hora_entrada: entrada,
                hora_salida: registros.length > 1 ? salida : null,
                horas_totales: registros.length > 1 ? diffHrs.toFixed(2) : 0,
                estado: esTarde ? "TARDE" : (registros.length === 1 ? "INCOMPLETO" : "PRESENTE"),
                cumplio_jornada: diffHrs >= horasRequeridas,
                empleadoId: emp.id
            };

            if (asistencia) {
                await asistencia.update(datosAsistencia);
                console.log(`✅ Asistencia ACTUALIZADA para UID ${uid}`);
            } else {
                await AsistenciaProcesada.create(datosAsistencia);
                console.log(`✨ Asistencia CREADA para UID ${uid}`);
            }
        }
    } catch (error) {
        console.error(`❌ Error procesando asistencia UID ${uid}:`, error.message);
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
        console.log("✅ Hora sincronizada:", now.toLocaleString());
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
                where: { uid_reloj: cleanClockUid(u.userId) },
                defaults: { nombre: u.name, activo: true }
            });
        }
        return true;
    } catch (e) {
        return false;
    }
};

const updateClockUser = async (userId, name, password, role, cardno) => {
    return await withDevice(async (zk) => {
        // En zkteco-js el orden suele ser (uid, userid, name, password, role, cardno)
        // Nota: uid suele ser un número incremental. Usaremos userId como uid para simplificar si es numérico.
        const uid = parseInt(userId) || 100; 
        await zk.setUser(uid, userId, name, password, role, cardno);
        return true;
    });
};

const deleteClockUser = async (uid) => {
    return await withDevice(async (zk) => {
        await zk.deleteUser(uid);
        return true;
    });
};

const getClockAdmins = async () => {
    const users = await getClockUsers();
    return users.filter(u => u.role > 0);
};

module.exports = {
    syncClockData,
    syncClockTime,
    getClockUsers,
    importUsers,
    updateClockUser,
    deleteClockUser,
    getClockAdmins
};
