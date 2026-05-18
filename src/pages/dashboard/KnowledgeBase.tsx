import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { BookOpen, UploadCloud, Trash2, Loader2, FileText, FileType, AlertCircle, Plus } from 'lucide-react';
import { toast } from 'sonner';

type Doc = {
  id: string;
  filename: string;
  file_size: number;
  content_preview: string;
  created_at: string;
};

export default function KnowledgeBase() {
  const [docs, setDocs]           = useState<Doc[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive]   = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const token = () => localStorage.getItem('token') || '';

  const [isImportingSite, setIsImportingSite] = useState(false);
  const [siteUrl, setSiteUrl] = useState('');
  const [assets, setAssets] = useState<any[]>([]);
  const [isUploadingAsset, setIsUploadingAsset] = useState(false);
  const [assetDesc, setAssetDesc] = useState('');
  const assetInputRef = useRef<HTMLInputElement>(null);

  const fetchDocs = async () => {
    try {
      const res = await fetch('/api/knowledge', { headers: { Authorization: `Bearer ${token()}` } });
      const data = await res.json();
      setDocs(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Erro ao carregar documentos.');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAssets = async () => {
    try {
      const res = await fetch('/api/assets', { headers: { Authorization: `Bearer ${token()}` } });
      const data = await res.json();
      setAssets(Array.isArray(data) ? data : []);
    } catch {
      console.error('Erro ao carregar assets.');
    }
  };

  useEffect(() => { 
    fetchDocs(); 
    fetchAssets(); 
  }, []);

  const uploadFile = async (file: File) => {
    const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
    const isAllowed = allowed.some(t => file.type.startsWith(t) || file.type.includes('pdf') || file.type.includes('word'));

    if (!isAllowed) {
      toast.error('Apenas ficheiros PDF, DOCX e TXT são aceites.');
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      toast.error('O ficheiro não pode ultrapassar 20MB.');
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/knowledge', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token()}` },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro no upload.');

      toast.success(`"${file.name}" carregado! ${data.chars_extracted?.toLocaleString()} caracteres extraídos.`);
      fetchDocs();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = '';
  };

  const handleDelete = async (id: string, filename: string) => {
    if (!confirm(`Remover "${filename}" da base de conhecimento?`)) return;
    try {
      const res = await fetch(`/api/knowledge/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (!res.ok) throw new Error('Erro ao remover.');
      toast.success(`"${filename}" removido.`);
      setDocs(prev => prev.filter(d => d.id !== id));
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const getIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return <FileType className="w-5 h-5 text-red-500" />;
    if (ext === 'docx' || ext === 'doc') return <FileType className="w-5 h-5 text-blue-500" />;
    return <FileText className="w-5 h-5 text-zinc-500" />;
  };

  const handleImportSite = async () => {
    if (!siteUrl.startsWith('http')) {
      toast.error('Por favor, insira uma URL válida (ex: https://...)');
      return;
    }

    setIsImportingSite(true);
    try {
      const res = await fetch('/api/knowledge/site', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token()}` 
        },
        body: JSON.stringify({ url: siteUrl }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao importar site.');

      toast.success('Conteúdo do site importado com sucesso!');
      setSiteUrl('');
      fetchDocs();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsImportingSite(false);
    }
  };

  const handleAssetUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingAsset(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('description', assetDesc || file.name);

      const res = await fetch('/api/assets', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token()}` },
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Erro no upload do asset.');
      }
      toast.success('Asset carregado com sucesso!');
      setAssetDesc('');
      fetchAssets();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsUploadingAsset(false);
      e.target.value = '';
    }
  };

  const handleDeleteAsset = async (id: string) => {
    if (!confirm('Eliminar este asset? A IA deixará de poder enviá-lo.')) return;
    try {
      await fetch(`/api/assets/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token()}` },
      });
      fetchAssets();
    } catch {
      toast.error('Erro ao eliminar.');
    }
  };

  return (
    <div className="space-y-8 max-w-4xl pb-12">
      {/* ─────────────────────────────────────────────────────────
          CONHECIMENTO (RAG)
      ────────────────────────────────────────────────────────── */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Base de Conhecimento</h2>
            <p className="text-zinc-500 text-sm mt-1">
              Documentos que a IA usa para aprender sobre o seu negócio.
            </p>
          </div>
          <div className="flex gap-2">
            <div className="hidden md:flex items-center border rounded-lg px-2 bg-white focus-within:ring-2 focus-within:ring-emerald-500">
              <input 
                type="text" 
                placeholder="https://oseusite.com" 
                className="text-xs p-2 outline-none w-40"
                value={siteUrl}
                onChange={e => setSiteUrl(e.target.value)}
              />
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-7 text-emerald-600 hover:text-emerald-700"
                onClick={handleImportSite}
                disabled={isImportingSite || !siteUrl}
              >
                {isImportingSite ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Importar Site'}
              </Button>
            </div>
            <Button onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
              {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Ficheiro
            </Button>
          </div>
          <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.docx,.doc,.txt" onChange={handleFileInput} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><BookOpen className="w-4 h-4" /> Documentos Carregados</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-zinc-100">
              {docs.map(doc => (
                <div key={doc.id} className="flex items-start gap-4 p-4 hover:bg-zinc-50 transition-colors text-sm">
                  <div className="mt-0.5">{getIcon(doc.filename)}</div>
                  <div className="flex-1 truncate font-medium">{doc.filename}</div>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(doc.id, doc.filename)} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></Button>
                </div>
              ))}
              {docs.length === 0 && <div className="p-8 text-center text-zinc-400">Nenhum documento carregado.</div>}
            </div>
          </CardContent>
        </Card>
      </div>

      <hr className="border-zinc-100" />

      {/* ─────────────────────────────────────────────────────────
          ASSETS PÚBLICOS (PARA ENVIO)
      ────────────────────────────────────────────────────────── */}
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Assets para Envio</h2>
          <p className="text-zinc-500 text-sm mt-1">
            Imagens e documentos que a IA pode enviar aos clientes (ex: catálogos, checklists, preçários).
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Card className="border-emerald-100 bg-emerald-50/20">
            <CardHeader>
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-emerald-800">
                <UploadCloud className="w-4 h-4" /> Novo Asset para Envio
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-medium">Descrição para a IA</label>
                <input 
                  className="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500"
                  placeholder="Ex: Catálogo de Verão 2026..."
                  value={assetDesc}
                  onChange={e => setAssetDesc(e.target.value)}
                />
                <p className="text-[10px] text-emerald-600">
                  Descreva o que é este ficheiro para que a IA saiba quando enviá-lo.
                </p>
              </div>
              <Button 
                onClick={() => assetInputRef.current?.click()} 
                disabled={isUploadingAsset} 
                className="w-full bg-emerald-600 hover:bg-emerald-700 gap-2"
              >
                {isUploadingAsset ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Seleccionar e Carregar Ficheiro
              </Button>
              <input ref={assetInputRef} type="file" className="hidden" onChange={handleAssetUpload} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold">Assets Activos</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-zinc-100 max-h-64 overflow-y-auto">
                {assets.map(asset => (
                  <div key={asset.id} className="flex items-center gap-3 p-3 hover:bg-zinc-50 transition-colors text-xs">
                    <FileType className="w-4 h-4 text-emerald-500 shrink-0" />
                    <div className="flex-1 truncate">
                      <p className="font-bold text-zinc-800">{asset.description}</p>
                      <p className="text-[10px] text-zinc-400 truncate">{asset.filename}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteAsset(asset.id)} className="h-8 w-8 p-0 text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                ))}
                {assets.length === 0 && <div className="p-8 text-center text-zinc-400 text-xs italic">Nenhum asset carregado.</div>}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
