# 📊 Orion 2.0 - Integração Google Sheets & Apps Script

Este script automatiza a recolha organizada de todos os contactos, números e agendamentos vindos do **WhatsApp, Facebook Messenger e Instagram**, além de gerar um **Relatório Diário Executivo em PDF às 23:59 (Horário de Angola / WAT)** e permitir a **extração automática de números para disparos**.

---

## 🚀 Passo a Passo de Instalação (2 Minutos)

### 1. Criar a Planilha no Google Sheets
1. Aceda a [sheets.google.com](https://sheets.google.com) e crie uma nova planilha em branco (ex: `Orion - Atendimento & Agendamentos`).
2. No menu superior da planilha, clique em **Extensões** > **Apps Script**.

### 2. Colar o Código
1. Apague qualquer código existente no editor `Código.gs`.
2. Abra o arquivo `OrionGoogleSheetsSync.js` desta pasta, copie todo o seu conteúdo e cole no editor do Apps Script.
3. Clique no ícone de disquete **Guardar** (Ctrl+S).

### 3. Inicializar as Abas
1. No seletor de funções no topo do Apps Script, selecione `setupSpreadsheet` e clique em **Executar**.
2. O Google pedirá permissão na primeira execução. Clique em **Rever permissões**, selecione sua conta, clique em **Avançadas** e **Aceder a Orion (não seguro)** e **Permitir**.
3. Volte à folha de cálculo: verá as 3 abas criadas e formatadas com design moderno:
   - `💬 Mensagens & Leads`: Registo de todas as interações.
   - `📅 Agendamentos`: Agendamentos detalhados (Nome, Telefone, Email, Assunto, Data, Hora).
   - `🎯 Disparos WhatsApp`: Base consolidada de números WhatsApp higienizados (padrão internacional E.164) para disparos.

### 4. Publicar como Webhook (App da Web)
1. No canto superior direito do Apps Script, clique no botão azul **Implantar (Deploy)** > **Nova Implantação**.
2. No ícone de engrenagem (lado esquerdo), selecione **App da Web**.
3. Configure:
   - **Descrição**: `Orion Sync Webhook`
   - **Executar como**: `Eu (seu email)`
   - **Quem tem acesso**: `Qualquer pessoa` *(Necessário para que o Orion envie as mensagens e agendamentos)*
4. Clique em **Implantar**.
5. Copie a **URL do App da Web** gerada (termina com `/exec`).

### 5. Ligar ao Orion
1. No painel do Orion, aceda ao **Dashboard** > campo **Google Sheets Webhook URL**.
2. Cole a URL do App da Web e clique em **Guardar e Testar**.
3. Pronto! A partir deste momento, todas as mensagens, contactos criados no Live Chat e agendamentos são sincronizados instantaneamente.

---

## ⏰ Relatório Diário Automático às 23:59 (WAT / Angola)
- No menu da folha de cálculo, clique em **⚡ Orion 2.0** > **⏰ 2. Configurar Gatilho Diário (23:59 WAT)**.
- Todos os dias às 23:59 no horário de Angola, o script compila os dados das últimas 24H, gera um **relatório executivo em PDF** e envia por e-mail com a lista dos números WhatsApp pronta para disparos.
- Também pode gerar o relatório a qualquer momento clicando em **📊 3. Gerar e Enviar Relatório Diário Agora (com PDF)** ou diretamente pelo Dashboard do Orion.

---

## 🎯 Extração Automática de Números para Disparos
- **Filtros disponíveis**: `24 Horas`, `Última Semana`, `Último Mês` ou `Sempre`.
- Os números são filtrados e formatados automaticamente (sem espaços, com código DDI internacional como `2449...`), sem necessidade de digitação manual.
- Pode copiar com 1 clique para colar no disparador de mensagens ou importar para as Campanhas do Orion.
