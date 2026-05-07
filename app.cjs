// Ponto de entrada otimizado para Hostinger / Phusion Passenger
// Este arquivo é JS puro (CommonJS) para evitar qualquer erro de transpilação no servidor.

const path = require('path');
const fs = require('fs');

// Verifica se o build do backend já existe
const serverEntry = path.join(__dirname, 'dist-server', 'server.js');

if (!fs.existsSync(serverEntry)) {
    console.error("ERRO CRÍTICO: Backend não compilado.");
    console.error("Execute 'npm run build:server' para gerar os arquivos na pasta dist-server.");
    process.exit(1);
}

// Inicia o servidor compilado
require(serverEntry);
