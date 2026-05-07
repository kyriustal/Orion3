/**
 * ORION 2 - BOOTLOADER CJS (HOSTINGER)
 * Usamos .cjs para forçar o CommonJS e permitir o uso de require() 
 * mesmo com o projeto sendo "type": "module".
 */

const path = require('path');
const fs = require('fs');

// Carrega variáveis de ambiente
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
}

const serverEntry = path.join(__dirname, 'dist-server', 'server.js');

console.log("Iniciando Orion Backend (Modo CJS)...");

try {
    if (!fs.existsSync(serverEntry)) {
        throw new Error("Build 'dist-server' nao encontrado.");
    }
    require(serverEntry);
} catch (error) {
    console.error("ERRO NO BOOT:", error.message);
    const http = require('http');
    http.createServer((req, res) => {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`FALHA NA INICIALIZAÇÃO\n\nErro:\n${error.message}`);
    }).listen(process.env.PORT || 3000);
}
