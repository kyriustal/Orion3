"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsAppService = void 0;
const axios_1 = __importDefault(require("axios"));
const fs_1 = __importDefault(require("fs"));
/**
 * Serviço para gerenciar comunicação com a API do WhatsApp (Meta)
 */
class WhatsAppService {
    /**
     * Envia uma mensagem de texto simples para um número
     */
    static async sendTextMessage(phoneNumberId, to, text, accessToken) {
        const token = accessToken || process.env.META_ACCESS_TOKEN;
        if (!token) {
            console.error('WhatsApp Access Token não configurado.');
            return null;
        }
        try {
            const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;
            const response = await axios_1.default.post(url, {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: to,
                type: "text",
                text: { body: text }
            }, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            console.log(`Resposta enviada para ${to}`);
            return response.data?.messages?.[0]?.id || null;
        }
        catch (error) {
            console.error('Erro ao enviar mensagem para Meta:', error.response?.data || error.message);
            return null;
        }
    }
    /**
     * Busca a URL de mídia da Meta e retorna o conteúdo em Base64
     */
    static async getMedia(mediaId, accessToken) {
        try {
            // 1. Obter a URL da mídia
            const urlResponse = await axios_1.default.get(`https://graph.facebook.com/v19.0/${mediaId}`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            const mediaUrl = urlResponse.data?.url;
            const mimeType = urlResponse.data?.mime_type;
            if (!mediaUrl)
                throw new Error("URL da mídia não encontrada.");
            // 2. Baixar o conteúdo binário
            const mediaResponse = await axios_1.default.get(mediaUrl, {
                headers: { 'Authorization': `Bearer ${accessToken}` },
                responseType: 'arraybuffer'
            });
            const base64 = Buffer.from(mediaResponse.data).toString('base64');
            return {
                base64,
                mimeType
            };
        }
        catch (error) {
            console.error('Erro ao baixar mídia da Meta:', error.message);
            return null;
        }
    }
    /**
     * Envia o indicador de "digitando..." (typing indicator)
     */
    static async sendTypingIndicator(phoneNumberId, messageId, accessToken) {
        const token = accessToken || process.env.META_ACCESS_TOKEN;
        if (!token)
            return;
        try {
            const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;
            await axios_1.default.post(url, {
                messaging_product: "whatsapp",
                status: "read",
                message_id: messageId
            }, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
        }
        catch (error) {
            // Silencioso se falhar, pois é um recurso estético
            console.warn('[WHATSAPP] Falha ao enviar typing indicator:', error.response?.data || error.message);
        }
    }
    /**
     * Faz upload de uma mídia para os servidores da Meta
     * @returns ID da mídia carregada
     */
    static async uploadMedia(filePath, phoneNumberId, accessToken) {
        const token = accessToken || process.env.META_ACCESS_TOKEN;
        if (!token)
            return null;
        try {
            const formData = new FormData();
            const fileBuffer = fs_1.default.readFileSync(filePath);
            const fileBlob = new Blob([fileBuffer], { type: 'audio/mpeg' });
            formData.append('file', fileBlob, 'audio.mp3');
            formData.append('type', 'audio'); // <-- Formato correto exigido pela API da Meta
            formData.append('messaging_product', 'whatsapp');
            const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/media`;
            const response = await axios_1.default.post(url, formData, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'multipart/form-data'
                }
            });
            return response.data.id;
        }
        catch (error) {
            console.error('[WHATSAPP] Erro no upload de mídia:', error.response?.data || error.message);
            return null;
        }
    }
    /**
     * Envia uma mensagem de áudio
     */
    static async sendAudio(toNumber, mediaId, phoneNumberId, accessToken) {
        const token = accessToken || process.env.META_ACCESS_TOKEN;
        if (!token)
            return null;
        try {
            const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;
            const response = await axios_1.default.post(url, {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: toNumber,
                type: "audio",
                audio: {
                    id: mediaId
                }
            }, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            return response.data?.messages?.[0]?.id || null;
        }
        catch (error) {
            console.error('[WHATSAPP] Erro ao enviar áudio:', error.response?.data || error.message);
            return null;
        }
    }
    /**
     * Envia media (imagem, vídeo, áudio ou documento) a partir de uma URL pública
     */
    static async sendMediaByUrl(toNumber, mediaUrl, mimeType, fileName, phoneNumberId, accessToken) {
        const token = accessToken || process.env.META_ACCESS_TOKEN;
        if (!token)
            return null;
        try {
            const isImage = mimeType.startsWith('image/');
            const isVideo = mimeType.startsWith('video/');
            const isAudio = mimeType.startsWith('audio/');
            let type = 'document';
            if (isImage)
                type = 'image';
            else if (isVideo)
                type = 'video';
            else if (isAudio)
                type = 'audio';
            const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;
            const payload = {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: toNumber,
                type: type,
            };
            if (isImage) {
                payload.image = { link: mediaUrl };
            }
            else if (isVideo) {
                payload.video = { link: mediaUrl };
            }
            else if (isAudio) {
                payload.audio = { link: mediaUrl };
            }
            else {
                payload.document = { link: mediaUrl, filename: fileName };
            }
            const response = await axios_1.default.post(url, payload, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            return response.data?.messages?.[0]?.id || null;
        }
        catch (error) {
            console.error(`[WHATSAPP] Erro ao enviar media por URL (${fileName}):`, error.response?.data || error.message);
            return null;
        }
    }
    /**
     * Busca os templates da Meta
     */
    static async getTemplates(wabaId, accessToken) {
        try {
            const url = `https://graph.facebook.com/v19.0/${wabaId}/message_templates`;
            const response = await axios_1.default.get(url, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            return response.data?.data || [];
        }
        catch (error) {
            console.error('[WHATSAPP] Erro ao buscar templates:', error.response?.data || error.message);
            return [];
        }
    }
    /**
     * Extrai e mapeia detalhadamente todas as variáveis de um conteúdo de template.
     * Suporta padrões como [Nome], [Empresa], [Telefone], [Produto], {{1}}, {{nome}}, etc.
     */
    static parseTemplateVariables(content) {
        if (!content)
            return [];
        const matches = [];
        const regex = /\[([^\]]+)\]|\{\{([^}]+)\}\}/g;
        let m;
        while ((m = regex.exec(content)) !== null) {
            const rawToken = m[0];
            const inner = (m[1] || m[2] || '').trim();
            if (!matches.some(x => x.inner === inner)) {
                matches.push({ raw: rawToken, inner });
            }
        }
        return matches.map((item, idx) => {
            const lower = item.inner.toLowerCase();
            let defaultType = 'custom';
            let label = `Variável {{${idx + 1}}}`;
            let example = `Valor ${idx + 1}`;
            if (lower.includes('empresa') || lower.includes('loja') || lower.includes('company') || lower.includes('org')) {
                defaultType = 'company_name';
                label = 'Nome da Empresa';
                example = 'Sua Empresa';
            }
            else if (lower.includes('nome') || lower.includes('cliente') || lower === 'name') {
                defaultType = 'client_name';
                label = 'Nome do Cliente';
                example = 'Maria';
            }
            else if (lower.includes('telefone') || lower.includes('phone') || lower.includes('telemovel') || lower.includes('tel')) {
                defaultType = 'client_phone';
                label = 'Telefone do Cliente';
                example = '+351 912 345 678';
            }
            else if (lower.includes('email') || lower.includes('mail')) {
                defaultType = 'client_email';
                label = 'E-mail do Cliente';
                example = 'cliente@email.com';
            }
            else if (lower.includes('produto') || lower.includes('servico') || lower.includes('product')) {
                defaultType = 'custom';
                label = 'Produto / Serviço';
                example = 'Plano Pro';
            }
            else if (/^\d+$/.test(item.inner)) {
                // Verificar o contexto textual ao redor de {{1}}, {{2}}, etc.
                const tokenIdx = content.indexOf(item.raw);
                const prefix = tokenIdx > 0 ? content.substring(Math.max(0, tokenIdx - 35), tokenIdx).toLowerCase() : '';
                const isCompanyPrefix = /\b(a|da|na|pela|empresa|loja|equipa|equipe|bem-vindo\s+à|bem-vindo\s+a)\s*$/i.test(prefix);
                const isClientPrefix = /\b(olá|ola|oi|hey|caro|cara|prezado|prezada|estimado|estimada|senhor|senhora|sr|sra)\s*$/i.test(prefix);
                if (isCompanyPrefix) {
                    defaultType = 'company_name';
                    label = `Variável {{${item.inner}}} (Nome da Empresa)`;
                    example = 'Sua Empresa';
                }
                else if (isClientPrefix) {
                    defaultType = 'client_name';
                    label = `Variável {{${item.inner}}} (Nome do Cliente)`;
                    example = 'Maria';
                }
                else if (idx === 0) {
                    defaultType = 'client_name';
                    label = `Variável {{${item.inner}}} (Nome do Cliente)`;
                    example = 'Maria';
                }
                else if (idx === 1) {
                    defaultType = 'company_name';
                    label = `Variável {{${item.inner}}} (Nome da Empresa)`;
                    example = 'Sua Empresa';
                }
            }
            return {
                index: idx + 1,
                key: String(idx + 1),
                token: item.raw,
                name: item.inner,
                defaultType,
                label,
                example
            };
        });
    }
    /**
     * Resolve os valores reais de cada variável do template para um contato específico,
     * respeitando as configurações da campanha, o nome da empresa e o perfil do contato.
     * Retorna tanto o mapa numérico para a Meta ({"1": "...", "2": "..."})
     * quanto o texto final renderizado da mensagem (para histórico e fallbacks).
     */
    static resolveVariables(content, configuredVars = {}, contact, companyName = 'Nossa Empresa') {
        const parsed = this.parseTemplateVariables(content);
        const variablesForMeta = {};
        const cleanCompanyName = companyName?.trim() || 'Nossa Empresa';
        const cleanClientName = (contact.name && contact.name.trim() !== 'Sem nome')
            ? contact.name.trim().split(/\s+/)[0]
            : 'Cliente';
        const cleanPhone = contact.phone || '';
        const cleanEmail = contact.email || '';
        // Para cada variável encontrada no template
        parsed.forEach(v => {
            const rawConfig = configuredVars[v.key] ??
                configuredVars[String(v.index)] ??
                configuredVars[v.name] ??
                configuredVars[v.token] ??
                configuredVars[v.name.toLowerCase()] ??
                configuredVars[v.key.toLowerCase()];
            let source = v.defaultType;
            let customVal = '';
            if (typeof rawConfig === 'object' && rawConfig !== null) {
                source = (rawConfig.source || v.defaultType);
                customVal = rawConfig.customValue || rawConfig.value || '';
            }
            else if (typeof rawConfig === 'string' && rawConfig.trim() !== '') {
                const lowerStr = rawConfig.trim().toLowerCase();
                if (lowerStr === 'company_name' ||
                    lowerStr === 'empresa' ||
                    lowerStr === 'nome da empresa' ||
                    lowerStr === 'nome_empresa' ||
                    lowerStr === '{{company_name}}' ||
                    lowerStr === '[empresa]' ||
                    lowerStr === 'company') {
                    source = 'company_name';
                }
                else if (lowerStr === 'client_name' ||
                    lowerStr === 'nome' ||
                    lowerStr === 'cliente' ||
                    lowerStr === 'nome do cliente' ||
                    lowerStr === 'nome_cliente' ||
                    lowerStr === '{{client_name}}' ||
                    lowerStr === '[nome]' ||
                    lowerStr === 'client') {
                    source = 'client_name';
                }
                else if (lowerStr === 'client_phone' ||
                    lowerStr === 'telefone' ||
                    lowerStr === 'telefone do cliente' ||
                    lowerStr === '{{client_phone}}' ||
                    lowerStr === '[telefone]' ||
                    lowerStr === '[phone]' ||
                    lowerStr === 'phone') {
                    source = 'client_phone';
                }
                else if (lowerStr === 'client_email' ||
                    lowerStr === 'email' ||
                    lowerStr === 'e-mail' ||
                    lowerStr === 'email do cliente' ||
                    lowerStr === '{{client_email}}' ||
                    lowerStr === 'mail') {
                    source = 'client_email';
                }
                else {
                    source = 'custom';
                    customVal = rawConfig.trim();
                }
            }
            let resolvedValue = '';
            if (source === 'company_name') {
                resolvedValue = cleanCompanyName;
            }
            else if (source === 'client_name') {
                resolvedValue = cleanClientName;
            }
            else if (source === 'client_phone') {
                resolvedValue = cleanPhone;
            }
            else if (source === 'client_email') {
                resolvedValue = cleanEmail;
            }
            else if (source === 'custom') {
                resolvedValue = customVal || cleanCompanyName;
            }
            else {
                // Fallback de segurança estrito: NUNCA colocar o nome do cliente onde deve ser Empresa!
                if (v.name.toLowerCase().includes('empresa') || v.name.toLowerCase().includes('loja')) {
                    resolvedValue = cleanCompanyName;
                }
                else if (v.name.toLowerCase().includes('nome') || v.name.toLowerCase().includes('cliente')) {
                    resolvedValue = cleanClientName;
                }
                else {
                    resolvedValue = customVal || (v.index === 1 ? cleanClientName : cleanCompanyName);
                }
            }
            variablesForMeta[String(v.index)] = resolvedValue;
        });
        // Se houver chaves numéricas avulsas passadas na configuração
        Object.keys(configuredVars).forEach(k => {
            if (/^\d+$/.test(k) && !variablesForMeta[k]) {
                const val = configuredVars[k];
                if (typeof val === 'object' && val !== null) {
                    const src = val.source || '';
                    if (src === 'company_name')
                        variablesForMeta[k] = cleanCompanyName;
                    else if (src === 'client_name')
                        variablesForMeta[k] = cleanClientName;
                    else if (src === 'client_phone')
                        variablesForMeta[k] = cleanPhone;
                    else if (src === 'client_email')
                        variablesForMeta[k] = cleanEmail;
                    else
                        variablesForMeta[k] = val.customValue || val.value || cleanCompanyName;
                }
                else if (typeof val === 'string') {
                    const lVal = val.toLowerCase().trim();
                    if (lVal === 'company_name' || lVal === 'empresa' || lVal === 'nome da empresa')
                        variablesForMeta[k] = cleanCompanyName;
                    else if (lVal === 'client_name' || lVal === 'nome' || lVal === 'cliente')
                        variablesForMeta[k] = cleanClientName;
                    else if (lVal === 'client_phone' || lVal === 'telefone')
                        variablesForMeta[k] = cleanPhone;
                    else if (lVal === 'client_email' || lVal === 'email')
                        variablesForMeta[k] = cleanEmail;
                    else
                        variablesForMeta[k] = val;
                }
            }
        });
        // Construir o renderedText substituindo todos os tokens conhecidos
        let renderedText = content || '';
        // 1. Substituir tokens de índice numérico: {{1}}, {{2}}, etc.
        Object.keys(variablesForMeta).forEach(idxKey => {
            const val = variablesForMeta[idxKey] || '';
            renderedText = renderedText.replace(new RegExp(`\\{\\{${idxKey}\\}\\}`, 'g'), val);
        });
        // 2. Substituir tokens semânticos conhecidos: [Nome], [Empresa], [Produto], [Telefone]
        renderedText = renderedText
            .replace(/\[(?:Nome|nome|Cliente|cliente)\]/g, cleanClientName)
            .replace(/\{\{(?:Nome|nome|Cliente|cliente)\}\}/g, cleanClientName)
            .replace(/\[(?:Empresa|empresa|Loja|loja|Company)\]/g, cleanCompanyName)
            .replace(/\{\{(?:Empresa|empresa|Loja|loja|Company)\}\}/g, cleanCompanyName)
            .replace(/\[(?:Telefone|telefone|Phone|phone)\]/g, cleanPhone)
            .replace(/\{\{(?:Telefone|telefone|Phone|phone)\}\}/g, cleanPhone);
        // 3. Substituir qualquer variável configurada com nome próprio
        parsed.forEach(v => {
            const val = variablesForMeta[String(v.index)] || '';
            if (v.token) {
                const escaped = v.token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                renderedText = renderedText.replace(new RegExp(escaped, 'g'), val);
            }
        });
        return { variablesForMeta, renderedText };
    }
    /**
     * Prepara o texto do template para a Meta:
     * Converte [Nome], [Empresa], [Produto], {{nome}}, {{empresa}}, etc., para {{1}}, {{2}}, {{3}}
     * e gera os exemplos obrigatórios exigidos pela API da Meta.
     */
    static normalizeTemplateForMeta(rawContent) {
        let text = rawContent || '';
        const placeholdersFound = [];
        // Substituir padrões [Placeholder] ou {{placeholder}} por {{1}}, {{2}}, etc.
        text = text.replace(/\[([^\]]+)\]|\{\{([^}]+)\}\}/g, (match, p1, p2) => {
            const name = (p1 || p2 || match).trim();
            let index = placeholdersFound.indexOf(name);
            if (index === -1) {
                placeholdersFound.push(name);
                index = placeholdersFound.length - 1;
            }
            return `{{${index + 1}}}`;
        });
        // Gerar amostras de exemplo para cada variável encontrada (exigido pela Meta WABA)
        const examples = placeholdersFound.map((name, idx) => {
            const lower = name.toLowerCase();
            if (lower.includes('nome') || lower.includes('cliente'))
                return 'Maria Silva';
            if (lower.includes('empresa') || lower.includes('loja'))
                return 'Empresa Exemplo';
            if (lower.includes('produto') || lower.includes('servico'))
                return 'Plano Premium';
            if (lower.includes('data') || lower.includes('hora'))
                return '15/10/2026';
            if (lower.includes('link') || lower.includes('url'))
                return 'https://exemplo.com';
            return `Exemplo_${idx + 1}`;
        });
        return { text, examples };
    }
    /**
     * Submete um novo template com suporte a botões e variáveis para a Meta WABA
     */
    static async createMetaTemplate(wabaId, accessToken, template) {
        try {
            const { text: formattedContent, examples } = this.normalizeTemplateForMeta(template.content);
            const bodyComponent = {
                type: "BODY",
                text: formattedContent
            };
            // A Meta WABA API exige o campo `example` quando há variáveis {{1}}, {{2}}...
            if (examples.length > 0) {
                bodyComponent.example = {
                    body_text: [examples]
                };
            }
            const components = [bodyComponent];
            if (template.buttons && template.buttons.length > 0) {
                const formattedButtons = template.buttons.slice(0, 3).map(b => {
                    const type = (b.type || 'QUICK_REPLY').toUpperCase();
                    if (type === 'URL') {
                        return {
                            type: 'URL',
                            text: (b.text || 'Acessar Link').substring(0, 25),
                            url: b.url || 'https://example.com'
                        };
                    }
                    if (type === 'PHONE_NUMBER' || type === 'PHONE') {
                        return {
                            type: 'PHONE_NUMBER',
                            text: (b.text || 'Ligar').substring(0, 25),
                            phone_number: b.phone_number || '+5511999999999'
                        };
                    }
                    return {
                        type: 'QUICK_REPLY',
                        text: (b.text || 'Confirmar').substring(0, 25)
                    };
                });
                components.push({
                    type: "BUTTONS",
                    buttons: formattedButtons
                });
            }
            // Sanitizar nome do template conforme regras da Meta: minúsculas, sem acentos, sem caracteres especiais
            const cleanName = template.name
                .toLowerCase()
                .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                .replace(/[^a-z0-9_]/g, '_')
                .replace(/_+/g, '_');
            const url = `https://graph.facebook.com/v19.0/${wabaId}/message_templates`;
            const response = await axios_1.default.post(url, {
                name: cleanName,
                category: template.category || 'MARKETING',
                language: template.language || 'pt_BR',
                components
            }, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            });
            return response.data;
        }
        catch (error) {
            console.error('[WHATSAPP] Erro ao criar template na Meta:', error.response?.data || error.message);
            throw error;
        }
    }
    /**
     * Envia uma mensagem baseada em template oficial da Meta ou fallback interativo com botões
     */
    static async sendTemplateMessage(phoneNumberId, to, templateName, languageCode = 'pt_BR', variables = {}, buttons = [], accessToken, contentFallback) {
        const token = accessToken || process.env.META_ACCESS_TOKEN;
        if (!token) {
            console.error('WhatsApp Access Token não configurado.');
            return null;
        }
        try {
            const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;
            const bodyParams = Object.keys(variables)
                .sort((a, b) => parseInt(a) - parseInt(b))
                .map(key => ({
                type: "text",
                text: variables[key] || ""
            }));
            const components = [];
            if (bodyParams.length > 0) {
                components.push({
                    type: "body",
                    parameters: bodyParams
                });
            }
            const response = await axios_1.default.post(url, {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to,
                type: "template",
                template: {
                    name: templateName,
                    language: { code: languageCode },
                    ...(components.length > 0 ? { components } : {})
                }
            }, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            console.log(`[WHATSAPP] Template ${templateName} enviado para ${to}`);
            return response.data?.messages?.[0]?.id || null;
        }
        catch (error) {
            console.warn(`[WHATSAPP] Falha no disparo do template oficial (${templateName}):`, error.response?.data || error.message);
            if (contentFallback) {
                let filledText = contentFallback;
                Object.keys(variables).forEach(k => {
                    filledText = filledText.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), variables[k] || '');
                });
                if (buttons && buttons.length > 0) {
                    const formattedBtns = buttons.map((b, idx) => ({
                        id: b.id || `btn_${idx + 1}`,
                        title: b.text || b.title || `Opção ${idx + 1}`
                    }));
                    return this.sendInteractiveButtons(phoneNumberId, to, filledText, formattedBtns, token);
                }
                else {
                    return this.sendTextMessage(phoneNumberId, to, filledText, token);
                }
            }
            return null;
        }
    }
    /**
     * Envia uma mensagem interativa com botões de resposta rápida (máximo 3 botões)
     */
    static async sendInteractiveButtons(phoneNumberId, to, bodyText, buttons, accessToken) {
        const token = accessToken || process.env.META_ACCESS_TOKEN;
        if (!token) {
            console.error('WhatsApp Access Token não configurado.');
            return null;
        }
        try {
            const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;
            const response = await axios_1.default.post(url, {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to,
                type: "interactive",
                interactive: {
                    type: "button",
                    body: { text: bodyText },
                    action: {
                        buttons: buttons.slice(0, 3).map(b => ({
                            type: "reply",
                            reply: {
                                id: b.id,
                                title: b.title.substring(0, 20), // WhatsApp limita a 20 chars
                            }
                        }))
                    }
                }
            }, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            console.log(`[WHATSAPP] Mensagem interativa enviada para ${to}`);
            return response.data?.messages?.[0]?.id || null;
        }
        catch (error) {
            console.error('[WHATSAPP] Erro ao enviar mensagem interativa:', error.response?.data || error.message);
            console.log('[WHATSAPP] Tentando fallback como texto simples...');
            return this.sendTextMessage(phoneNumberId, to, bodyText, token);
        }
    }
}
exports.WhatsAppService = WhatsAppService;
