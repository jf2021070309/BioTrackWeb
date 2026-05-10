const ZKLib = require("node-zklib");
const { RegistroCrudo, AsistenciaProcesada, Empleado } = require("../models");
const { COMMANDS } = require("node-zklib/constants");

// Mutex simple para evitar colisiones en el hardware
let hardwareBusy = false;
const acquireLock = async (retryCount = 0) => {
    if (hardwareBusy) {
        if (retryCount > 15) throw new Error("Hardware ocupado: Demasiados reintentos");
        // Esperar un poco más entre reintentos
        await new Promise(r => setTimeout(r, 1500)); 
        return acquireLock(retryCount + 1);
    }
    hardwareBusy = true;
};

const releaseLock = async () => {
    // Pequeño tiempo de espera antes de liberar para que el reloj "respire"
    await new Promise(r => setTimeout(r, 1500));
    hardwareBusy = false;
};

const createZkInstance = () => {
    return new ZKLib(
        String(process.env.RELOJ_IP || "").trim(),
        parseInt(process.env.RELOJ_PORT, 10),
        20000, // Aumentamos a 20s
        4000   // Reducimos el inport timeout para que sea más ágil en reintentos
    );
};

const safeDisconnect = async (zkInstance) => {
    try { 
        if (zkInstance) {
            await zkInstance.disconnect(); 
        }
    } catch (error) {}
};

const connectWithRetry = async (zkInstance, maxRetries = 2) => {
    for (let i = 0; i < maxRetries; i++) {
        try {
            console.log(`Intentando conectar (TCP/UDP) - Intento ${i + 1}...`);
            await zkInstance.createSocket();
            return true;
        } catch (e) {
            console.warn(`Intento ${i + 1} fallido: ${e.message}`);
            
            // Si es el último intento, probamos forzar un cierre antes de rendirnos
            if (i === maxRetries - 1) throw e;
            
            await new Promise(r => setTimeout(r, 1000));
        }
    }
};

const cleanClockUid = (value) => {
    return value ? String(value).trim() : null;
};

const getClockUsers = async () => {
    await acquireLock();
    let zkInstance = createZkInstance();
    try {
        await connectWithRetry(zkInstance);
        // Darle un respiro al hardware tras conectar
        await new Promise(r => setTimeout(r, 1000));
        const users = await zkInstance.getUsers();
        return users.data || [];
    } catch (e) {
        console.error("Error obteniendo usuarios:", e?.message || e || "Error desconocido");
        return [];
    } finally { 
        await safeDisconnect(zkInstance); 
        await releaseLock();
    }
};

const getClockAdmins = async () => {
    const users = await getClockUsers();
    return users.filter(user => String(user.role) === "14" || user.role === 14);
};

const importUsers = async () => {
    await acquireLock();
    let zkInstance = createZkInstance();
    try {
        await connectWithRetry(zkInstance);
        await new Promise(r => setTimeout(r, 1000));
        const users = await zkInstance.getUsers();
        if (!users || !users.data) throw new Error("No se recibieron datos de usuarios");
        for (let user of users.data) {
            const uid = cleanClockUid(user.userId);
            if (!uid) continue;
            await Empleado.upsert({
                uid_reloj: uid,
                nombre: user.name || "Usuario " + uid,
                activo: true,
                sincronizado_reloj: true,
                rol_reloj: parseInt(user.role) || 0
            });
        }
        return true;
    } catch (e) { 
        console.error("Error importando usuarios:", e?.message || e || "Error desconocido"); 
        return false; 
    }
    finally { 
        await safeDisconnect(zkInstance); 
        await releaseLock();
    }
};

const syncClockData = async () => {
    await acquireLock();
    let zkInstance = createZkInstance();
    try {
        await connectWithRetry(zkInstance);
        await new Promise(r => setTimeout(r, 1000));
        
        // 1. Sincronizar usuarios primero
        const users = await zkInstance.getUsers();
        if (!users || !users.data) throw new Error("No se pudieron obtener usuarios");
        for (let user of users.data) {
            const uid = cleanClockUid(user.userId);
            if (!uid) continue;
            await Empleado.findOrCreate({
                where: { uid_reloj: uid },
                defaults: {
                    uid_reloj: uid,
                    nombre: user.name || "Usuario " + uid,
                    activo: true,
                    sincronizado_reloj: true,
                    rol_reloj: parseInt(user.role) || 0
                }
            });
        }

        // 2. Traer marcaciones
        const logs = await zkInstance.getAttendances();
        if (!logs || !logs.data) {
             console.log("No hay marcaciones nuevas o el reloj no respondió.");
             return;
        }
        for (let log of logs.data) {
            const uid = cleanClockUid(log.deviceUserId);
            if (!uid) continue;

            const emp = await Empleado.findOne({ where: { uid_reloj: uid } });
            if (!emp) continue;

            await RegistroCrudo.findOrCreate({
                where: { uid_reloj: uid, timestamp: log.recordTime },
                defaults: { uid_reloj: uid, timestamp: log.recordTime }
            });
            await procesarAsistenciaDiaria(uid, log.recordTime);
        }
    } catch (e) {
        console.error("Error sincronizando marcaciones:", e?.message || e || "Error desconocido");
    } finally { 
        await safeDisconnect(zkInstance); 
        await releaseLock();
    }
};

const procesarAsistenciaDiaria = async (uid, timestamp) => {
    try {
        const fecha = timestamp.toISOString().split("T")[0];
        const emp = await Empleado.findOne({ where: { uid_reloj: uid } });
        if (!emp) return;

        const registros = await RegistroCrudo.findAll({ 
            where: { uid_reloj: uid }, 
            order: [["timestamp", "ASC"]] 
        });
        
        // Filtrar solo los registros del día actual
        const hoy = registros.filter(r => {
            const rFecha = r.timestamp.toISOString().split("T")[0];
            return rFecha === fecha;
        });
        
        if (hoy.length > 0) {
            const entrada = hoy[0].timestamp;
            const salida = hoy[hoy.length - 1].timestamp;
            const diffHrs = (salida.getTime() - entrada.getTime()) / (1000 * 60 * 60);
            
            const cargo = (emp.cargo || "").toLowerCase();
            let horasRequeridas = 8;
            let esTarde = false;
            let estado = "PRESENTE";

            // 1. Determinar horas requeridas por rol
            if (cargo.includes("practicante")) {
                horasRequeridas = 6;
            } else if (cargo.includes("dev") || cargo.includes("desarrollador")) {
                horasRequeridas = 8; // Flexible
            }

            // 2. Lógica de horarios fijos para Conductor/Operadora
            let minutosTardanza = 0;
            let minutosSalidaTemprana = 0;

            if (cargo.includes("conductor") || cargo.includes("operadora") || cargo.includes("operador")) {
                const horaEntrada = entrada.getHours();
                const minEntrada = entrada.getMinutes();
                const esTurnoManana = horaEntrada < 11;
                const horaInicioTurno = esTurnoManana ? 6 : 14;
                const horaFinTurno = esTurnoManana ? 14 : 22;

                // Cálculo de Tardanza
                if (horaEntrada > horaInicioTurno || (horaEntrada === horaInicioTurno && minEntrada > 5)) {
                    esTarde = true;
                    const inicioTurno = new Date(entrada);
                    inicioTurno.setHours(horaInicioTurno, 0, 0, 0);
                    minutosTardanza = Math.max(0, Math.floor((entrada.getTime() - inicioTurno.getTime()) / (1000 * 60)));
                }

                // Cálculo de Salida Temprana (si marcó salida antes de la hora de fin de turno)
                if (salida.getHours() < horaFinTurno) {
                    const finTurno = new Date(salida);
                    finTurno.setHours(horaFinTurno, 0, 0, 0);
                    minutosSalidaTemprana = Math.max(0, Math.floor((finTurno.getTime() - salida.getTime()) / (1000 * 60)));
                }
            }

            // 3. Determinar Estado Final
            const esMismaHora = entrada.getTime() === salida.getTime();
            const cumplioHoras = diffHrs >= (horasRequeridas - 0.05); // Margen de 3 min

            if (esMismaHora) {
                estado = "INCOMPLETO";
            } else if (esTarde) {
                estado = "TARDE";
            } else if (cumplioHoras) {
                estado = "CUMPLIO";
            } else {
                estado = "NO_CUMPLIO";
            }

            await AsistenciaProcesada.upsert({
                uid_reloj: uid, 
                fecha, 
                hora_entrada: entrada, 
                hora_salida: salida,
                horas_totales: diffHrs.toFixed(2),
                cumplio_jornada: cumplioHoras,
                estado: estado,
                minutos_tardanza: minutosTardanza,
                minutos_salida_temprana: minutosSalidaTemprana
            });
        }
    } catch (error) {
        console.error(`Error procesando asistencia para UID ${uid}:`, error.message);
    }
};

const syncClockTime = async () => {
    await acquireLock();
    let zkInstance = createZkInstance();
    try {
        await connectWithRetry(zkInstance);
        const now = new Date();
        await zkInstance.setTime(now);
        return now;
    } catch (e) {
        console.error("Error sincronizando hora:", e?.message || e || "Error desconocido");
    } finally { 
        await safeDisconnect(zkInstance); 
        await releaseLock();
    }
};

const createClockUserPayload = (internalUid, userId, name, password, role, cardno) => {
    const payload = Buffer.alloc(72);
    payload.writeUInt16LE(internalUid, 0);
    payload.writeUInt8(role, 2);
    const pwdBuf = Buffer.alloc(8, 0);
    Buffer.from(String(password || "").slice(0, 8), "ascii").copy(pwdBuf);
    pwdBuf.copy(payload, 3);
    const nameBuf = Buffer.alloc(24, 0);
    Buffer.from(String(name || "").slice(0, 24), "ascii").copy(nameBuf);
    nameBuf.copy(payload, 11);
    const idBuf = Buffer.alloc(9, 0);
    Buffer.from(String(userId || "").slice(0, 9), "ascii").copy(idBuf);
    idBuf.copy(payload, 48);
    return payload;
};

const updateClockUser = async (userId, name, password = "", role = 0, cardno = 0) => {
    await acquireLock();
    let zkInstance = createZkInstance();
    try {
        await connectWithRetry(zkInstance);
        
        const users = await zkInstance.getUsers();
        let internalUid = 0;
        const user = users.data.find(u => String(u.userId) === String(userId));
        
        if (user) {
            internalUid = user.uid;
        } else {
            const nextUid = users.data.length > 0 ? Math.max(...users.data.map(u => u.uid)) + 1 : 1;
            internalUid = nextUid;
        }

        const payload = createClockUserPayload(internalUid, userId, name, password, role, cardno);
        await zkInstance.executeCmd(COMMANDS.CMD_USER_WRQ, payload);
        await zkInstance.executeCmd(COMMANDS.CMD_REFRESHDATA, "");
        return true;
    } catch (e) {
        console.error("Error actualizando usuario:", e?.message || e || "Error desconocido");
        return false;
    } finally { 
        await safeDisconnect(zkInstance); 
        await releaseLock();
    }
};

const deleteClockUser = async (userId) => {
    await acquireLock();
    let zkInstance = createZkInstance();
    try {
        await connectWithRetry(zkInstance);
        
        await zkInstance.disableDevice();
        
        const users = await zkInstance.getUsers();
        const user = users.data.find(u => String(u.userId) === String(userId));
        
        if (!user) {
            console.log(`Usuario ${userId} no encontrado en el reloj.`);
            await zkInstance.enableDevice();
            return true;
        }

        const internalUid = user.uid;
        console.log(`Borrando en K14: UserID=${userId}, InternalUID=${internalUid}`);

        const payloadString = Buffer.alloc(9, 0);
        Buffer.from(String(userId).slice(0, 9), "ascii").copy(payloadString);
        await zkInstance.executeCmd(COMMANDS.CMD_DELETE_USER, payloadString);

        const payloadNumeric = Buffer.alloc(2);
        payloadNumeric.writeUInt16LE(internalUid, 0);
        await zkInstance.executeCmd(COMMANDS.CMD_DELETE_USER, payloadNumeric);

        const payloadFull = Buffer.alloc(3);
        payloadFull.writeUInt16LE(internalUid, 0);
        payloadFull.writeUInt8(0xFF, 2);
        await zkInstance.executeCmd(COMMANDS.CMD_DELETE_USER, payloadFull);
        
        await zkInstance.executeCmd(COMMANDS.CMD_REFRESHDATA, "");
        await zkInstance.enableDevice();
        return true;
    } catch (e) { 
        console.error("Error al borrar en K14:", e?.message || e || "Error desconocido"); 
        return false; 
    } finally { 
        await safeDisconnect(zkInstance); 
        await releaseLock();
    }
};

module.exports = { 
    syncClockData, 
    importUsers, 
    getClockUsers, 
    getClockAdmins, 
    updateClockUser,
    deleteClockUser,
    syncClockTime
};
