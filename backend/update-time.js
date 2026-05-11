// update-time.js
const { syncClockTime } = require('./src/services/zkService');

console.log("⏳ Sincronizando hora con el reloj...");
syncClockTime()
    .then(() => {
        console.log("✨ ¡Hora actualizada correctamente!");
        process.exit(0);
    })
    .catch(err => {
        console.error("❌ Error:", err.message);
        process.exit(1);
    });
