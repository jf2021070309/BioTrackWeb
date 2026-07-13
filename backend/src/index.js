require("dotenv").config();
const express = require("express");
const cors = require("cors");
const swaggerUi = require("swagger-ui-express");
const swaggerJsdoc = require("swagger-jsdoc");
const { sequelize, AsistenciaProcesada, Empleado, RegistroCrudo, RolJornada } = require("./models");
const { syncClockData, importUsers, getClockAdmins, syncClockTime, getClockUsers } = require("./services/zkService");

const app = express();

// --- ESCUDO CONTRA CRASHES ---
process.on('uncaughtException', (error) => {
    console.error('❌ ERROR CRÍTICO:', error.message);
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

app.get("/", (req, res) => {
    res.send(`
        <div style="font-family: sans-serif; text-align: center; padding: 50px;">
            <h1 style="color: #2563eb;">BioTrack API v1.0</h1>
            <p style="color: #64748b;">Servidor funcionando correctamente.</p>
            <a href="/api-docs" style="display: inline-block; padding: 12px 24px; background: #2563eb; color: white; border-radius: 10px; text-decoration: none; font-weight: bold;">Ver Documentación Swagger</a>
        </div>
    `);
});

app.get("/api/empleados", async (req, res) => {
    res.json(await Empleado.findAll({ 
        include: [RolJornada],
        order: [["uid_reloj", "ASC"]] 
    }));
});

app.get("/api/roles-jornada", async (req, res) => {
    try {
        res.json(await RolJornada.findAll({ order: [["id", "ASC"]] }));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post("/api/empleados", async (req, res) => {
    try { 
        // Solo guarda en la web. No sincroniza con el reloj.
        const data = { ...req.body, sincronizado_reloj: true };
        res.json(await Empleado.create(data)); 
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put("/api/empleados/:id", async (req, res) => {
    try {
        const empleado = await Empleado.findByPk(req.params.id);
        if (!empleado) return res.status(404).json({ error: "No encontrado" });
        
        let rol_jornada_id = req.body.rol_jornada_id;
        let use_custom = req.body.use_custom_schedule;
        
        if (!use_custom && rol_jornada_id && rol_jornada_id !== "custom") {
            const requested_tol = req.body.tolerancia_minutos ? parseInt(req.body.tolerancia_minutos, 10) : 0;
            const existingRol = await RolJornada.findByPk(rol_jornada_id);
            if (existingRol && existingRol.tolerancia_minutos !== requested_tol) {
                use_custom = true;
                req.body.hora_entrada_1 = existingRol.hora_entrada_1;
                req.body.hora_salida_1 = existingRol.hora_salida_1;
                req.body.hora_entrada_2 = existingRol.hora_entrada_2;
                req.body.hora_salida_2 = existingRol.hora_salida_2;
            }
        }
        
        if (use_custom) {
            const { hora_entrada_1, hora_salida_1, hora_entrada_2, hora_salida_2, tolerancia_minutos } = req.body;
            // Normalize empty strings to null
            const h_ent_2 = hora_entrada_2 ? hora_entrada_2 : null;
            const h_sal_2 = hora_salida_2 ? hora_salida_2 : null;
            const tol = tolerancia_minutos ? parseInt(tolerancia_minutos, 10) : 0;
            
            let rol = await RolJornada.findOne({
                where: {
                    hora_entrada_1,
                    hora_salida_1,
                    hora_entrada_2: h_ent_2,
                    hora_salida_2: h_sal_2,
                    tolerancia_minutos: tol
                }
            });
            
            if (!rol) {
                let nombre_rol = `Turno: ${hora_entrada_1.substring(0,5)}-${hora_salida_1.substring(0,5)}`;
                if (h_ent_2 && h_sal_2) {
                    nombre_rol += ` y ${h_ent_2.substring(0,5)}-${h_sal_2.substring(0,5)}`;
                }
                rol = await RolJornada.create({
                    nombre: nombre_rol,
                    hora_entrada_1,
                    hora_salida_1,
                    hora_entrada_2: h_ent_2,
                    hora_salida_2: h_sal_2,
                    tolerancia_minutos: tol
                });
            }
            rol_jornada_id = rol.id;
        }

        // Solo edita en la base de datos local
        const data = { ...req.body, rol_jornada_id, sincronizado_reloj: true };
        await empleado.update(data);
        res.json(empleado);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/empleados/:id", async (req, res) => {
    try {
        const empleado = await Empleado.findByPk(req.params.id);
        if (empleado) {
            await empleado.destroy();
        }
        res.json({ message: "Eliminado solo de la web" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

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

app.get("/api/reloj/usuarios", async (req, res) => {
    try {
        const users = await getClockUsers();
        res.json(users || []);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// app.put("/api/reloj/usuarios/:uid", async (req, res) => { ... }); eliminado para evitar escrituras

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

app.post("/api/login", (req, res) => {
    const { password } = req.body;
    const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
    if (password === adminPassword) {
        res.json({ success: true });
    } else {
        res.status(401).json({ error: "Contraseña incorrecta" });
    }
});

const PORT = process.env.PORT || 5000;

// EL ANCLA: Este intervalo evita que el proceso de Node termine.
setInterval(() => {}, 1000 * 60 * 60); 

app.listen(PORT, () => {
    console.log(`🚀 Servidor BioTrack en puerto ${PORT}`);
    sequelize.sync()
        .then(() => console.log("✅ Base de datos sincronizada"))
        .catch(err => console.error("❌ Error DB:", err.message));
});
