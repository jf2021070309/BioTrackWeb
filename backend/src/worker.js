// src/worker.js — Proceso independiente para sincronización con el reloj
require('dotenv').config();
const cron = require('node-cron');
const { syncClockData } = require('./services/zkService');

console.log('🚀 Worker BioTrack ZK iniciado');
console.log('📅 Programado para sincronizar cada 5 minutos.');

// Sincronizar cada 5 minutos
// '*/5 * * * *' = cada 5 minutos
cron.schedule('*/5 * * * *', async () => {
    console.log(`\n⏰ [${new Date().toLocaleString()}] Iniciando ciclo de sincronización automática...`);
    await syncClockData();
});

// Sincronización inmediata al arrancar el proceso
console.log("⏳ Ejecutando sincronización inicial...");
syncClockData();
