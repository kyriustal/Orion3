import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { upload } from '../middleware/upload';
// @ts-ignore
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import fs from 'fs';
import { supabaseAdmin } from '../config/supabase';

const router = Router();

// /api/knowledge/upload
router.post('/upload', requireAuth, upload.single('file'), async (req: any, res) => {
  let tempFilePath = '';
  try {
    const file = req.file;
    const orgId = req.body.orgId || req.user?.id;

    if (!file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }

    tempFilePath = file.path;
    console.log(`[INDEX] Processando: ${file.originalname}`);

    let textContent = '';

    // Extração de Texto com Timeouts
    try {
        if (file.mimetype === 'application/pdf') {
          const dataBuffer = fs.readFileSync(file.path);
          const data = await pdfParse(dataBuffer);
          textContent = data.text;
        } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          const result = await mammoth.extractRawText({ path: file.path });
          textContent = result.value;
        } else {
          textContent = fs.readFileSync(file.path, 'utf8');
        }
    } catch (err: any) {
        console.error('[INDEX] Erro na leitura do arquivo:', err);
        throw new Error(`Falha ao ler conteúdo do arquivo: ${err.message}`);
    }

    // Limpeza básica do texto para evitar erros de SQL
    const cleanedText = textContent
        .replace(/\x00/g, '') // Remove caracteres nulos
        .replace(/'/g, "''")   // Escapa aspas simples
        .trim();

    if (!cleanedText) {
        throw new Error("Não foi possível extrair nenhum texto legível deste arquivo.");
    }

    console.log(`[INDEX] Texto extraído (${cleanedText.length} caracteres). Salvando no banco...`);

    // Salvando no Supabase
    const { data: dbFile, error } = await supabaseAdmin
      .from('knowledge_files')
      .upsert({
        name: file.originalname,
        size: file.size,
        type: file.mimetype,
        path: file.path,
        org_id: orgId,
        processed: true,
        content_summary: cleanedText
      })
      .select()
      .single();

    if (error) {
       console.error('[INDEX] Erro no banco de dados:', error.message);
       throw new Error(`Erro ao salvar no banco: ${error.message}`);
    }

    // Deleta o arquivo temporário após o processamento
    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);

    res.status(201).json({
      message: 'Arquivo aprendido com sucesso!',
      file: dbFile
    });

  } catch (error: any) {
    console.error('[INDEX] FALHA TOTAL:', error.message);
    // Limpa o arquivo se houver erro
    if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    
    res.status(500).json({ 
        error: 'A indexação falhou.', 
        details: error.message 
    });
  }
});

// Listar arquivos...
router.get('/files', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.query.orgId || req.user?.id;
    const { data, error } = await supabaseAdmin
      .from('knowledge_files')
      .select('id, name, size, type, created_at, processed')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ files: data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Eliminar arquivo
router.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.user?.id;
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from('knowledge_files')
      .delete()
      .eq('id', id)
      .eq('org_id', orgId);

    if (error) throw error;
    res.json({ message: 'Arquivo eliminado com sucesso' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
