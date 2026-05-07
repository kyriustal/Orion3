/**
 * ORION 2 - BOOTLOADER OFICIAL (HOSTINGER)
 * Este arquivo é o ponto de entrada principal que o Phusion Passenger deve executar.
 */

const path = require('path');
const fs = require('fs');

// Carrega variáveis de ambiente manualmente se o .env existir
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
    console.log("Variáveis de ambiente carregadas do .env local.");
}

// Caminho para o servidor compilado
const serverEntry = path.join(__dirname, 'dist-server', 'server.js');

console.log("Iniciando Orion Backend Intelligence...");

try {
    if (!fs.existsSync(serverEntry)) {
        throw new Error("Build não encontrado! Por favor, certifique-se de que a pasta 'dist-server' existe.");
    }
    
    // Executa o servidor principal
    require(serverEntry);
    
} catch (error) {
    console.error("ERRO CRÍTICO NO BOOT:");
    console.error(error.message);
    
    // Servidor de emergência para evitar o erro 503 genérico e mostrar o erro real
    const http = require('http');
    http.createServer((req, res) => {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`FALHA NA INICIALIZAÇÃO DO ORION\n\nDetalhe técnico:\n${error.message}`);
    }).listen(process.env.PORT || 3000);
}
