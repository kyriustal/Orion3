const path = require('path');
const fs = require('fs');

// Garante que o .env seja carregado antes de qualquer coisa
require('dotenv').config();

const serverEntry = path.join(__dirname, 'dist-server', 'server.js');

console.log("Orion 2 - Iniciando Servidor...");

try {
    if (!fs.existsSync(serverEntry)) {
        console.error("ERRO: dist-server/server.js nao encontrado.");
        process.exit(1);
    }
    
    // Inicia o servidor compilado
    require(serverEntry);
} catch (error) {
    console.error("FALHA NO BOOT:");
    console.error(error.message);
    process.exit(1);
}
