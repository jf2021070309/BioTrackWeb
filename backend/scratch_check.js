const { Empleado, RolJornada } = require("./src/models");

async function check() {
  try {
    const roles = await RolJornada.findAll();
    console.log("ROLES DE JORNADA:");
    console.log(JSON.stringify(roles, null, 2));

    const empleados = await Empleado.findAll({ include: [RolJornada] });
    console.log("\nEMPLEADOS CON ROL:");
    console.log(JSON.stringify(empleados.map(e => ({
      id: e.id,
      nombre: e.nombre,
      uid_reloj: e.uid_reloj,
      rol_jornada_id: e.rol_jornada_id,
      RolJornada: e.RolJornada ? e.RolJornada.nombre : null
    })), null, 2));
  } catch (error) {
    console.error("Error checking DB:", error);
  } finally {
    process.exit(0);
  }
}

check();
