const { Sequelize, DataTypes } = require("sequelize");
require("dotenv").config();

const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASS, {
    host: process.env.DB_HOST,
    dialect: "mysql",
    logging: false
});

const Empleado = sequelize.define("Empleado", {
    uid_reloj: { type: DataTypes.STRING, unique: true, allowNull: false },
    nombre: { type: DataTypes.STRING, allowNull: false },
    dni: { type: DataTypes.STRING, unique: true },
    cargo: DataTypes.STRING,
    rol_jornada_id: DataTypes.INTEGER,
    activo: { type: DataTypes.BOOLEAN, defaultValue: true },
    sincronizado_reloj: { type: DataTypes.BOOLEAN, defaultValue: false },
    fecha_sync_reloj: DataTypes.DATE,
    rol_reloj: { type: DataTypes.INTEGER, defaultValue: 0 },
    huella_registrada: { type: DataTypes.BOOLEAN, defaultValue: false },
    fecha_huella: DataTypes.DATE
}, { tableName: "empleados", timestamps: false });

const RegistroCrudo = sequelize.define("RegistroCrudo", {
    uid_reloj: { type: DataTypes.STRING, allowNull: false },
    timestamp: { type: DataTypes.DATE, allowNull: false }
}, { tableName: "registros_crudos", timestamps: false });

const AsistenciaProcesada = sequelize.define("AsistenciaProcesada", {
    uid_reloj: { type: DataTypes.STRING, allowNull: false },
    fecha: { type: DataTypes.DATEONLY, allowNull: false },
    hora_entrada: DataTypes.DATE,
    hora_salida: DataTypes.DATE,
    horas_totales: DataTypes.DECIMAL(5, 2),
    cumplio_jornada: DataTypes.BOOLEAN,
    estado: { type: DataTypes.ENUM("PRESENTE", "CUMPLIO", "TARDE", "SALIDA_TEMPRANA", "NO_CUMPLIO", "INCOMPLETO", "AUSENTE"), defaultValue: "PRESENTE" },
    minutos_tardanza: { type: DataTypes.INTEGER, defaultValue: 0 },
    minutos_salida_temprana: { type: DataTypes.INTEGER, defaultValue: 0 }
}, { tableName: "asistencias_procesadas", timestamps: false });

Empleado.hasMany(RegistroCrudo, { foreignKey: "uid_reloj", sourceKey: "uid_reloj" });
Empleado.hasMany(AsistenciaProcesada, { foreignKey: "uid_reloj", sourceKey: "uid_reloj" });
AsistenciaProcesada.belongsTo(Empleado, { foreignKey: "uid_reloj", targetKey: "uid_reloj" });

module.exports = { sequelize, Empleado, RegistroCrudo, AsistenciaProcesada };
