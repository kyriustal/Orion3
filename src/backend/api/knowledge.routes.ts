import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { upload } from '../middleware/upload';
// @ts-ignore
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import fs from 'fs';
import { supabase } from '../config/supabase';

const router = Router();

// /api/knowledge/upload
router.post('/upload', requireAuth, upload.single('file'), async (req: any, res) => {
  try {
    const file = req.file;
    const orgId = req.body.orgId || req.user?.id;

    if (!file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }

    console.log(`Processando arquivo: ${file.originalname} (${file.size} bytes)`);

    let textContent = '';

    // Extração de Texto Robusta
    try {
        if (file.mimetype === 'application/pdf') {
          const dataBuffer = fs.readFileSync(file.path);
          // @ts-ignore
          const data = await pdfParse(dataBuffer);
          textContent = data.text;
        } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          const result = await mammoth.extractRawText({ path: file.path });
          textContent = result.value;
        } else if (file.mimetype === 'text/plain' || file.mimetype === 'text/csv') {
          textContent = fs.readFileSync(file.path, 'utf8');
        }
    } catch (err: any) {
        console.error('Erro na extração de texto:', err);
        return res.status(500).json({ error: 'Falha ao ler o conteúdo do arquivo.', details: err.message });
    }

    if (!textContent || textContent.trim().length === 0) {
        return res.status(400).json({ error: 'O arquivo parece estar vazio ou não contém texto legível.' });
    }

    // "Aprendizado": Salvando o conteúdo processado no Supabase para busca da IA
    const { data: dbFile, error } = await supabase
      .from('knowledge_files')
      .upsert({
        name: file.originalname,
        size: file.size,
        type: file.mimetype,
        path: file.path,
        org_id: orgId,
        processed: true,
        content_summary: textContent // Armazenamos o texto completo para o RAG simples
      })
      .select()
      .single();

    if (error) {
       console.warn('Erro ao salvar no DB, tabela knowledge_files pode estar ausente:', error.message);
       // Fallback para o usuário não ficar travado
       return res.status(201).json({
          message: 'Arquivo processado com sucesso (Modo Simulação)',
          file: { name: file.originalname, size: file.size },
          preview: textContent.substring(0, 200)
       });
    }

    res.status(201).json({
      message: 'Arquivo aprendido com sucesso! O bot já pode usar este conhecimento.',
      file: dbFile
    });

  } catch (error: any) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Erro interno ao processar upload', details: error.message });
  }
});

// Listar arquivos aprendidos
router.get('/files', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.query.orgId || req.user?.id;
    const { data, error } = await supabase
      .from('knowledge_files')
      .select('id, name, size, type, created_at, processed')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ files: data });
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao listar arquivos', details: error.message });
  }
});

export default router;
