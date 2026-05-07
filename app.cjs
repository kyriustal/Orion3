const path = require('path');
const fs = require('fs');

// Log de início
console.log("Iniciando Orion 2 Bootloader...");

const serverEntry = path.join(__dirname, 'dist-server', 'server.js');

try {
    if (!fs.existsSync(serverEntry)) {
        throw new Error("Arquivo dist-server/server.js nao encontrado. O build falhou ou nao foi enviado.");
    }
    
    console.log("Carregando backend...");
    require(serverEntry);
} catch (error) {
    console.error("ERRO NA INICIALIZACAO:");
    console.error(error.message);
    console.error(error.stack);
    
    // Pequeno servidor de fallback para mostrar o erro no navegador (ajuda no debug da Hostinger)
    const http = require('http');
    http.createServer((req, res) => {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`Erro 500 - Falha ao iniciar o Orion 2\n\nDetalhes:\n${error.message}\n\n${error.stack}`);
    }).listen(process.env.PORT || 3000);
}
