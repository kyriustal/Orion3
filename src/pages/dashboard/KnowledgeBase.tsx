import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Upload, FileText, Loader2, CheckCircle2, Trash2, AlertCircle, RefreshCw } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/src/components/ui/button";
import { toast } from "sonner";

type KnowledgeFile = {
  id: string | number;
  name: string;
  size: string | number;
  status: string;
  created_at?: string;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

export default function KnowledgeBase() {
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<KnowledgeFile[]>([]);

  useEffect(() => {
    loadFiles();
    // Auto-refresh a cada 10s para atualizar status de documentos "processing"
    const interval = setInterval(() => {
      if (files.some(f => f.status === 'processing')) {
        loadFiles();
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [files.length]);

  const loadFiles = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/knowledge/files", {
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
      });
      if (!response.ok) throw new Error("Falha ao carregar documentos");
      const data = await response.json();
      const filesList = Array.isArray(data) ? data : data.files || [];
      setFiles(filesList.map((f: any) => ({
        id: f.id,
        name: f.original_name || f.name,
        size: typeof f.size === "number" ? formatSize(f.size) : f.size,
        status: (f.processed === true || f.status === 'ready') ? "ready" : f.status || "processing",
        created_at: f.created_at
      })));
    } catch (error: any) {
      console.error("Erro ao carregar base de conhecimento:", error);
      toast.error("Não foi possível carregar os documentos.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUploadClick = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error("O arquivo deve ter no máximo 10MB.");
      return;
    }

    setIsUploading(true);
    const tempId = `temp-${Date.now()}`;
    const fileSizeStr = formatSize(file.size);

    setFiles(prev => [
      { id: tempId, name: file.name, size: fileSizeStr, status: "processing" },
      ...prev
    ]);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/knowledge/upload", {
        method: "POST",
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Erro ao fazer upload");
      }

      const data = await response.json();

      setFiles(prev => prev.map(f =>
        f.id === tempId
          ? { ...f, id: data.file.id, status: "processing" }
          : f
      ));

      toast.success(`✅ "${file.name}" enviado! A IA está a indexar o documento...`);
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Erro ao fazer upload do arquivo.");
      setFiles(prev => prev.filter(f => f.id !== tempId));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (fileId: string | number, fileName: string) => {
    if (!confirm(`Tem a certeza que deseja eliminar "${fileName}"? Esta ação irá remover todo o conhecimento associado.`)) return;

    setDeletingId(fileId);
    try {
      const response = await fetch(`/api/knowledge/${fileId}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
      });

      if (!response.ok) throw new Error("Erro ao eliminar documento");

      setFiles(prev => prev.filter(f => f.id !== fileId));
      toast.success(`🗑️ "${fileName}" eliminado com sucesso.`);
    } catch (error: any) {
      toast.error(error.message || "Erro ao eliminar o documento.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Base de Conhecimento (RAG)</h2>
        <p className="text-zinc-500">Faça upload de documentos para a IA usar como contexto nas respostas. Quanto mais documentos, mais inteligente e preciso fica o agente.</p>
      </div>

      {/* Upload & Scrape Cards */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Upload className="w-5 h-5" /> Upload de Arquivos</CardTitle>
            <CardDescription>PDF, TXT, DOCX, CSV — até 10MB.</CardDescription>
          </CardHeader>
          <CardContent>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              aria-label="Upload de documento para base de conhecimento"
              accept=".pdf,.txt,.docx,.doc,.csv,.xlsx,.md"
            />
            <div
              onClick={!isUploading ? handleUploadClick : undefined}
              className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-all h-[180px] ${
                isUploading
                  ? 'border-emerald-300 bg-emerald-50 cursor-wait'
                  : 'border-zinc-200 hover:bg-emerald-50 hover:border-emerald-400 cursor-pointer'
              }`}
            >
              <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mb-3 border border-emerald-200">
                {isUploading ? (
                  <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
                ) : (
                  <Upload className="w-6 h-6 text-emerald-600" />
                )}
              </div>
              <p className="text-sm font-semibold text-zinc-900">
                {isUploading ? "Enviando..." : "Enviar Arquivo"}
              </p>
              <p className="text-xs text-zinc-500 mt-1">PDF, TXT, DOCX (Máx 10MB)</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><RefreshCw className="w-5 h-5" /> Aprender do Site</CardTitle>
            <CardDescription>A IA lerá o conteúdo do seu site oficial.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="border-2 border-dashed border-zinc-200 rounded-xl p-8 flex flex-col items-center justify-center text-center h-[180px] bg-zinc-50/30">
                <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mb-3 border border-blue-100 text-blue-600">
                  <RefreshCw className="w-6 h-6" />
                </div>
                <div className="flex gap-2 w-full max-w-xs">
                  <input 
                    id="website-url"
                    type="url" 
                    placeholder="https://suaempresa.com"
                    className="flex-1 px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white"
                  />
                  <Button 
                    size="sm" 
                    className="bg-emerald-600 hover:bg-emerald-700 h-9"
                    onClick={async () => {
                      const url = (document.getElementById('website-url') as HTMLInputElement).value;
                      if (!url) return toast.error("Insira uma URL válida.");
                      
                      setIsLoading(true);
                      try {
                        const res = await fetch("/api/knowledge/scrape", {
                          method: "POST",
                          headers: { 
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${localStorage.getItem("token")}`
                          },
                          body: JSON.stringify({ url })
                        });
                        if (!res.ok) throw new Error("Falha ao ler o site");
                        toast.success("✅ Site aprendido com sucesso!");
                        loadFiles();
                      } catch (err: any) {
                        toast.error(err.message);
                      } finally {
                        setIsLoading(false);
                      }
                    }}
                  >
                    Aprender
                  </Button>
                </div>
                <p className="text-[10px] text-zinc-400 mt-3">A IA indexará os textos principais do seu site.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Documents List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Documentos Indexados</CardTitle>
            <CardDescription>A IA consulta estes documentos em tempo real ao responder. Documentos em "Indexando..." ficam disponíveis em alguns segundos.</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={loadFiles} disabled={isLoading} className="gap-2 text-zinc-500">
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Atualizar
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {isLoading ? (
              <div className="text-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-zinc-400 mx-auto" />
                <p className="text-sm text-zinc-500 mt-2">A carregar documentos...</p>
              </div>
            ) : files.length === 0 ? (
              <div className="text-center py-10 border-2 border-dashed rounded-xl bg-zinc-50/50">
                <FileText className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
                <p className="text-zinc-600 font-medium text-sm">Nenhum documento indexado</p>
                <p className="text-zinc-400 text-xs mt-1">Envie um PDF, TXT, DOCX ou CSV acima para treinar o agente.</p>
              </div>
            ) : (
              files.map(file => (
                <div key={file.id} className="flex items-center justify-between p-3 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 transition-colors group">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center border border-emerald-100 flex-shrink-0">
                      {file.status === 'error' ? (
                        <AlertCircle className="w-5 h-5 text-red-500" />
                      ) : (
                        <FileText className="w-5 h-5 text-emerald-600" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-900 truncate">{file.name}</p>
                      <p className="text-xs text-zinc-500">{file.size}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Status badge */}
                    {file.status === 'ready' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Pronto
                      </span>
                    )}
                    {file.status === 'processing' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Indexando...
                      </span>
                    )}
                    {file.status === 'error' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                        <AlertCircle className="w-3.5 h-3.5" /> Erro
                      </span>
                    )}
                    {/* Delete button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={deletingId === file.id}
                      onClick={() => handleDelete(file.id, file.name)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-400 hover:text-red-500 hover:bg-red-50 h-8 w-8 p-0"
                      title="Eliminar documento"
                    >
                      {deletingId === file.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
