const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Rota de Saúde (Teste)
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Orion 2 ONLINE via Rescue Mode' });
});

// IA (GPT via Axios)
app.post('/api/orion-web/chat', async (req, res) => {
    try {
        const { message } = req.body;
        const apiKey = process.env.OPENAI_API_KEY;
        
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: message }]
        }, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        
        res.json({ reply: response.data.choices[0].message.content });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Simulação
app.post('/api/agent/simulate', async (req, res) => {
    res.json({ reply: "Simulação ativa (Modo de Resgate)", status: 'success' });
});

// Frontend
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));
app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor de Resgate rodando na porta ${PORT}`);
});
