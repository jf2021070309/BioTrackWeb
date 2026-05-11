const ZKLib = require('zklib-js-zkteko');

const zk = new ZKLib('192.168.1.214', 4370, 10000);

async function main() {
  try {
    console.log('Intentando conectar con zklib-js (AlexanderSaenz)...');
    await zk.createSocket();
    console.log('✅ Conectado al K14');

    const info = await zk.getInfo();
    console.log('Info:', info);

    const users = await zk.getUsers();
    console.log('Usuarios recuperados:', users.data.length);

    const logs = await zk.getAttendances();
    console.log('Asistencias recuperadas:', logs.data.length);

    await zk.disconnect();
    console.log('🔌 Desconectado');
  } catch (e) {
    console.error('❌ Error:', e);
  }
}

main();
