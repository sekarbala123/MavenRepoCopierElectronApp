const net = require('net');
const port = process.env.PORT ? (process.env.PORT - 1) : 3000;

process.env.ELECTRON_START_URL = `http://localhost:${port}`;

const client = new net.Socket();

let startedElectron = false;
const tryConnection = () => client.connect({port: port}, () => {
    client.end();
    if(!startedElectron) {
        console.log('starting electron');
        const exec = require('child_process').exec;
        exec('npm run electron');
        startedElectron = true;
    }
});

tryConnection();

client.on('error', (error) => {
    setTimeout(tryConnection, 1000);
});
