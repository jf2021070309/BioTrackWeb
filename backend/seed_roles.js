const { sequelize, RolJornada } = require("./src/models");

async function init() {
  try {
    await sequelize.query("SET FOREIGN_KEY_CHECKS = 0;");
    await RolJornada.drop();
    await sequelize.query("SET FOREIGN_KEY_CHECKS = 1;");
    await RolJornada.sync({ alter: true });
    
    await RolJornada.create({
      nombre: "Administrativo (Corrido)",
      hora_entrada_1: "08:00:00",
      hora_salida_1: "17:00:00",
      tolerancia_minutos: 15
    });

    await RolJornada.create({
      nombre: "Producción (Partido)",
      hora_entrada_1: "08:00:00",
      hora_salida_1: "12:00:00",
      hora_entrada_2: "14:00:00",
      hora_salida_2: "18:00:00",
      tolerancia_minutos: 15
    });

    console.log("Roles re-creados correctamente.");
  } catch (error) {
    console.error("Error:", error);
  } finally {
    process.exit(0);
  }
}

init();
