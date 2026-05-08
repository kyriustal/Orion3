const path = require('path');
const fs = require('fs');

console.log('--- ORION BOOTLOADER INICIADO ---');

try {
    // 1. Carrega variáveis de ambiente
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        require('dotenv').config({ path: envPath });
        console.log('✅ Arquivo .env carregado.');
    } else {
        console.warn('⚠️ Arquivo .env não encontrado.');
    }

    // 2. Tenta iniciar o servidor principal (dist-server/server.js)
    const serverPath = path.join(__dirname, 'dist-server', 'server.js');
    
    if (!fs.existsSync(serverPath)) {
        throw new Error(`Servidor não encontrado em: ${serverPath}. Certifique-se de que o build foi concluído.`);
    }

    console.log('🚀 Iniciando servidor principal...');
    require(serverPath);

} catch (error) {
    console.error('❌ ERRO NO BOOTLOADER:', error.message);
    
    // Se o servidor principal falhar, cria um servidor de emergência para mostrar o erro
    const express = require('express');
    const emergencyApp = express();
    
    emergencyApp.get('*', (req, res) => {
        res.status(500).send(`
            <div style="font-family: sans-serif; padding: 40px; color: #721c24; background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 8px;">
                <h1 style="margin-top: 0;">O Orion encontrou um problema no servidor</h1>
                <p>O erro detectado foi:</p>
                <pre style="background: rgba(0,0,0,0.05); padding: 20px; border-radius: 4px; border: 1px solid rgba(0,0,0,0.1); white-space: pre-wrap;">${error.stack || error.message}</pre>
                <hr style="border: 0; border-top: 1px solid #f5c6cb; margin: 20px 0;">
                <p><strong>Ação recomendada:</strong> Verifique se todas as dependências foram instaladas e se o comando de build foi executado com sucesso na Hostinger.</p>
                <button onclick="window.location.reload()" style="background: #721c24; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer;">Tentar Novamente</button>
            </div>
        `);
    });

    emergencyApp.listen(process.env.PORT || 8080, () => {
        console.log('🆘 Servidor de emergência rodando na porta ' + (process.env.PORT || 8080));
    });
}
