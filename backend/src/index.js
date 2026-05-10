const express = require("express");
const cors = require("cors");
const swaggerUi = require("swagger-ui-express");
const swaggerJsdoc = require("swagger-jsdoc");
const { sequelize, AsistenciaProcesada, Empleado, RegistroCrudo } = require("./models");
const { syncClockData, importUsers, updateClockUser, getClockAdmins, syncClockTime, getClockUsers, deleteClockUser } = require("./services/zkService");
require("dotenv").config();

const app = express();

// --- ESCUDO CONTRA CRASHES DEL HARDWARE ---
// La librería node-zklib tiene bugs que pueden tirar el servidor.
process.on('uncaughtException', (error) => {
    console.error('❌ ERROR CRÍTICO ATRAPADO:', error.message);
    if (error.stack?.includes('node-zklib')) {
        console.error('⚠️ El error proviene de la librería del reloj. El servidor seguirá funcionando.');
    }
});
process.on('unhandledRejection', (reason) => {
    console.error('❌ PROMESA NO MANEJADA:', reason);
});

app.use(cors());
app.use(express.json());

// CONFIGURACIÓN DE SWAGGER
const swaggerOptions = {
    definition: {
        openapi: "3.0.0",
        info: {
            title: "BioTrack API",
            version: "1.0.0",
            description: "API para la gestión de asistencia biométrica y personal con ZKTeco K14",
            contact: { name: "BioTrack Support" }
        },
        servers: [{ url: "http://localhost:5000" }]
    },
    apis: ["./src/index.js"]
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocs));

/**
 * @openapi
 * /:
 *   get:
 *     tags: [General]
 *     summary: Página de bienvenida
 *     responses:
 *       200:
 *         description: Servidor Online
 */
app.get("/", (req, res) => {
    res.send(`
        <div style="font-family: sans-serif; text-align: center; padding: 50px;">
            <h1 style="color: #2563eb;">BioTrack API v1.0</h1>
            <p style="color: #64748b;">Servidor funcionando correctamente y conectado al hardware.</p>
            <a href="/api-docs" style="display: inline-block; padding: 12px 24px; background: #2563eb; color: white; border-radius: 10px; text-decoration: none; font-weight: bold;">Ver Documentación Swagger</a>
        </div>
    `);
});

/**
 * @openapi
 * /api/empleados:
 *   get:
 *     tags: [Empleados]
 *     summary: Listar todos los empleados
 *     responses:
 *       200:
 *         description: Lista de empleados
 *   post:
 *     tags: [Empleados]
 *     summary: Crear nuevo empleado
 */
app.get("/api/empleados", async (req, res) => {
    res.json(await Empleado.findAll({ order: [["uid_reloj", "ASC"]] }));
});

app.post("/api/empleados", async (req, res) => {
    try { res.json(await Empleado.create(req.body)); } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * @openapi
 * /api/empleados/{id}:
 *   put:
 *     tags: [Empleados]
 *     summary: Actualizar datos de un empleado
 *   delete:
 *     tags: [Empleados]
 *     summary: Eliminar un empleado (Web y Hardware)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Eliminado de ambos sitios
 */
app.put("/api/empleados/:id", async (req, res) => {
    try {
        const empleado = await Empleado.findByPk(req.params.id);
        if (!empleado) return res.status(404).json({ error: "No encontrado" });
        await empleado.update(req.body);
        res.json(empleado);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/empleados/:id", async (req, res) => {
    try {
        const empleado = await Empleado.findByPk(req.params.id);
        if (empleado) {
            // 1. Intentar borrar del reloj físico
            await deleteClockUser(empleado.uid_reloj);
            // 2. Borrar de la base de datos
            await empleado.destroy();
        }
        res.json({ message: "Eliminado de la web y del reloj" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * @openapi
 * /api/stats:
 *   get:
 *     tags: [Estadísticas]
 *     summary: Estadísticas del Dashboard
 */
app.get("/api/stats", async (req, res) => {
    try {
        const { fecha } = req.query;
        const targetDate = fecha || new Date().toISOString().split("T")[0];
        const empleadosActivos = await Empleado.findAll({ where: { activo: true } });
        const asistencias = await AsistenciaProcesada.findAll({
            where: { fecha: targetDate },
            include: [Empleado]
        });
        const presentes = asistencias.length;
        const idsAsistieron = new Set(asistencias.map(a => String(a.uid_reloj)));
        const listaAusentes = empleadosActivos.filter(e => !idsAsistieron.has(String(e.uid_reloj)));
        const ultimoLog = await RegistroCrudo.findOne({ order: [["timestamp", "DESC"]] });

        res.json({
            resumen: {
                empleadosActivos: empleadosActivos.length,
                presentes,
                ausentes: listaAusentes.length,
                tardanzas: asistencias.filter(a => a.estado === "TARDE").length,
                incompletos: asistencias.filter(a => a.estado === "INCOMPLETO").length,
                cumplieron: asistencias.filter(a => a.cumplio_jornada).length,
                horasPromedio: presentes > 0 ? (asistencias.reduce((acc, a) => acc + parseFloat(a.horas_totales || 0), 0) / presentes).toFixed(1) : 0
            },
            tardanzas: asistencias.filter(a => a.estado === "TARDE"),
            ausentes: listaAusentes,
            ultimoRegistro: ultimoLog ? ultimoLog.timestamp : null
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/asistencias", async (req, res) => {
    const { fecha, desde, hasta } = req.query;
    const { Op } = require("sequelize");
    
    let where = {};
    if (fecha) {
        where.fecha = fecha;
    } else if (desde && hasta) {
        where.fecha = { [Op.between]: [desde, hasta] };
    }

    res.json(await AsistenciaProcesada.findAll({ 
        where,
        include: [Empleado], 
        order: [["fecha", "DESC"], ["hora_entrada", "ASC"]] 
    }));
});

/**
 * @openapi
 * /api/reloj/usuarios:
 *   get:
 *     tags: [Hardware K14]
 *     summary: Listar usuarios directamente del reloj
 */
app.get("/api/reloj/usuarios", async (req, res) => {
    try { 
        const users = await getClockUsers();
        res.json(users || []); 
    } catch (e) { 
        res.status(500).json({ error: e.message }); 
    }
});

app.put("/api/reloj/usuarios/:uid", async (req, res) => {
    const { userId, name, password, role, cardno } = req.body;
    const success = await updateClockUser(userId, name, password, role, cardno);
    res.json({ message: success ? "Actualizado" : "Error" });
});

app.get("/api/reloj/admins", async (req, res) => {
    try { res.json(await getClockAdmins()); } 
    catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/reloj/sync-hora", async (req, res) => {
    try { res.json({ hora: await syncClockTime() }); } 
    catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/sync", async (req, res) => {
    try { await syncClockData(); res.json({ message: "Ok" }); } 
    catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/importar-empleados", async (req, res) => {
    const success = await importUsers();
    res.json({ message: success ? "Ok" : "Error" });
});

const PORT = process.env.PORT || 5000;
sequelize.sync().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 Servidor BioTrack en puerto ${PORT}`);
        
        // Iniciar tarea de sincronización automática (cada 60 segundos)
        console.log("🕒 Tarea de auto-sincronización activada (60s)");
        setInterval(async () => {
            try {
                // El log de "Iniciando" solo se verá en la consola del servidor
                await syncClockData();
            } catch (error) {
                console.error("Error en auto-sincronización:", error.message);
            }
        }, 60000);
    });
});
