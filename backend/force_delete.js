const { deleteClockUser } = require("./src/services/zkService");
require("dotenv").config();

const userId = process.argv[2];

if (!userId) {
    console.error("Por favor especifica el UserID a borrar. Ejemplo: node force_delete.js 4");
    process.exit(1);
}

const run = async () => {
    console.log(`Forzando borrado de UserID: ${userId} en el reloj...`);
    const success = await deleteClockUser(userId);
    if (success) {
        console.log("Comando enviado exitosamente al reloj.");
    } else {
        console.error("Hubo un error al intentar borrar.");
    }
};

run();
