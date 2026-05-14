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

  useEffect(() => { fetchDocs(); }, []);

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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
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

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return <FileType className="w-5 h-5 text-red-500" />;
    if (ext === 'docx' || ext === 'doc') return <FileType className="w-5 h-5 text-blue-500" />;
    return <FileText className="w-5 h-5 text-zinc-500" />;
  };

  return (
    <div className="space-y-6 max-w-4xl pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Base de Conhecimento</h2>
          <p className="text-zinc-500 text-sm mt-1">
            Carregue documentos que a IA usará para responder com precisão.
          </p>
        </div>
        <Button onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
          {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Adicionar Documento
        </Button>
        <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.docx,.doc,.txt" onChange={handleFileInput} />
      </div>

      {/* Info */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-blue-500" />
        <div>
          O texto extraído dos documentos é automaticamente incorporado no prompt da IA.
          Ficheiros suportados: <strong>PDF, DOCX, TXT</strong> (máx. 20MB por ficheiro).
          O texto é limitado a <strong>15 000 caracteres</strong> por documento.
        </div>
      </div>

      {/* Drop Zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
          dragActive
            ? 'border-emerald-500 bg-emerald-50'
            : 'border-zinc-200 bg-zinc-50 hover:border-emerald-400 hover:bg-emerald-50/50'
        }`}
      >
        {isUploading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-10 h-10 animate-spin text-emerald-600" />
            <p className="text-sm font-medium text-zinc-600">A processar documento...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <UploadCloud className={`w-10 h-10 ${dragActive ? 'text-emerald-600' : 'text-zinc-400'}`} />
            <div>
              <p className="text-sm font-medium text-zinc-700">Arraste um ficheiro ou clique para seleccionar</p>
              <p className="text-xs text-zinc-500 mt-1">PDF, DOCX, TXT · máx. 20MB</p>
            </div>
          </div>
        )}
      </div>

      {/* Lista de Documentos */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="w-4 h-4" />
            Documentos Carregados ({docs.length})
          </CardTitle>
          <CardDescription>Todos os documentos activos na base de conhecimento desta organização.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
            </div>
          ) : docs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-zinc-400 px-8">
              <BookOpen className="w-12 h-12 mb-3 opacity-20" />
              <p className="font-medium text-zinc-500">Nenhum documento carregado</p>
              <p className="text-sm mt-1">Carregue PDFs, DOCX ou TXT com informações sobre os seus produtos e serviços.</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {docs.map(doc => (
                <div key={doc.id} className="flex items-start gap-4 p-4 hover:bg-zinc-50 transition-colors">
                  <div className="mt-0.5">{getIcon(doc.filename)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm text-zinc-900 truncate">{doc.filename}</p>
                      <span className="text-xs text-zinc-400 shrink-0">{formatSize(doc.file_size)}</span>
                    </div>
                    {doc.content_preview && (
                      <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{doc.content_preview}</p>
                    )}
                    <p className="text-[10px] text-zinc-400 mt-1">
                      {new Date(doc.created_at).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' })}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(doc.id, doc.filename)}
                    className="text-red-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
