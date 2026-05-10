const { COMMANDS } = require("node-zklib/constants");
console.log("COMMANDS:", JSON.stringify(COMMANDS, null, 2));

const test = async () => {
    const zkInstance = new ZKLib(
        String(process.env.RELOJ_IP || "").trim(),
        parseInt(process.env.RELOJ_PORT, 10),
        10000,
        4000
    );

    try {
        await zkInstance.createSocket();
        console.log("Métodos disponibles en zkInstance (instancia + prototipo):", Object.getOwnPropertyNames(Object.getPrototypeOf(zkInstance)).concat(Object.keys(zkInstance)).filter(k => typeof zkInstance[k] === 'function'));
        await zkInstance.disconnect();
    } catch (e) {
        console.error(e);
    }
};

test();
