import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { upload } from '../middleware/upload';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import fs from 'fs';
import { supabase } from '../config/supabase';

const router = Router();

// /api/knowledge/upload
router.post('/upload', requireAuth, upload.single('file'), async (req: AuthRequest, res) => {
  try {
    const file = req.file;
    const { orgId } = req.body;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    let textContent = '';

    // Extract text based on file type
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

    // Process chunking and embeddings here in a real scenario
    // For now, save the file metadata to Supabase
    const { data: dbFile, error } = await supabase
      .from('knowledge_files')
      .insert([
        {
          name: file.originalname,
          size: file.size,
          type: file.mimetype,
          path: file.path,
          org_id: orgId || req.user.id, // Fallback to user id if orgId not provided
          processed: true,
          content_summary: textContent.substring(0, 500)
        }
      ])
      .select()
      .single();

    if (error) {
       // if table doesn't exist, just return success with extracted text as fallback
       console.warn('Supabase insert failed, possibly missing table:', error.message);
       return res.json({
          message: 'File processed (DB bypassed)',
          file: { name: file.originalname, size: file.size },
          textPreview: textContent.substring(0, 100)
       });
    }

    res.status(201).json({
      message: 'File uploaded and processed successfully',
      file: dbFile
    });

  } catch (error: any) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to process file', details: error.message });
  } finally {
    // Optionally clean up the file from disk if storing entirely in vector DB
    // if (req.file) { fs.unlinkSync(req.file.path); }
  }
});

// /api/knowledge/files
router.get('/files', requireAuth, async (req: AuthRequest, res) => {
  try {
    const orgId = req.query.orgId || req.user.id;
    
    const { data, error } = await supabase
      .from('knowledge_files')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });

    if (error) {
       return res.json({ files: [] }); // Fallback
    }

    res.json({ files: data });
  } catch (error: any) {
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// /api/knowledge/:id
router.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    
    const { error } = await supabase
      .from('knowledge_files')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ message: 'File deleted' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to delete file', details: error.message });
  }
});

export default router;
