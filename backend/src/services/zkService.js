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
                const ts = new Date(log.recordTime);
                
                // Guardar log crudo si no existe
                const [record, created] = await RegistroCrudo.findOrCreate({
                    where: {
                        uid_reloj: uid,
                        timestamp: ts
                    }
                });

                if (created) uidsInvolucrados.add(uid);
            }

            // 3. Procesar asistencia para los UIDs que tuvieron nuevos registros hoy
            console.log(`⚙️ Procesando asistencia para ${uidsInvolucrados.size} empleados...`);
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

        const registros = await RegistroCrudo.findAll({ 
            where: { 
                uid_reloj: uid,
                timestamp: {
                    [Op.gte]: new Date(fecha + "T00:00:00"),
                    [Op.lte]: new Date(fecha + "T23:59:59")
                }
            }, 
            order: [["timestamp", "ASC"]] 
        });
        
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

            const formatTime = (date) => {
                const h = String(date.getHours()).padStart(2, '0');
                const m = String(date.getMinutes()).padStart(2, '0');
                return `${h}:${m}`;
            };

            await AsistenciaProcesada.upsert({
                id: `${uid}-${fecha}`,
                uid_reloj: uid,
                fecha: fecha,
                hora_entrada: formatTime(entrada),
                hora_salida: registros.length > 1 ? formatTime(salida) : null,
                horas_totales: registros.length > 1 ? diffHrs.toFixed(2) : 0,
                estado: esTarde ? "TARDE" : (registros.length === 1 ? "PRESENTE" : "PRESENTE"),
                cumplio_jornada: diffHrs >= horasRequeridas,
                empleadoId: emp.id
            });
        }
    } catch (error) {
        console.error(`❌ Error procesando asistencia UID ${uid}:`, error.message);
    }
};

const syncClockTime = async () => {
    return await withDevice(async (zk) => {
        const now = new Date();
        // Codificación de fecha para protocolo ZK (202 = CMD_SET_TIME)
        const encoded = ((now.getFullYear() % 100) * 12 * 31 + now.getMonth() * 31 + now.getDate() - 1) * (24 * 60 * 60) +
                        (now.getHours() * 60 + now.getMinutes()) * 60 + now.getSeconds();
        const buf = Buffer.alloc(4);
        buf.writeUInt32LE(encoded, 0);
        
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
