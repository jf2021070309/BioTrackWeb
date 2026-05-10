const ZKLib = require("node-zklib");
require("dotenv").config();

const test = async () => {
    const zkInstance = new ZKLib(
        String(process.env.RELOJ_IP || "").trim(),
        parseInt(process.env.RELOJ_PORT, 10),
        10000,
        4000
    );

    try {
        await zkInstance.createSocket();
        const users = await zkInstance.getUsers();
        console.log(JSON.stringify(users.data, null, 2));
        await zkInstance.disconnect();
    } catch (e) {
        console.error(e);
    }
};

test();
