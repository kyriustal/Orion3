import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import {
  Plug, Plus, Trash2, Loader2, TestTube2, ShieldCheck, X,
  ChevronDown, ChevronUp, CheckCircle2, XCircle, Pencil
} from 'lucide-react';
import { toast } from 'sonner';

type Integration = {
  id: string;
  name: string;
  description?: string;
  base_url: string;
  auth_type: 'none' | 'bearer' | 'header' | 'basic' | 'query';
  auth_config: { token?: string; header_name?: string; query_param?: string; username?: string; password?: string };
  endpoints: {
    lookup_by_phone?: { method?: string; path: string };
    lookup_by_reference?: { method?: string; path: string };
  };
  field_mapping: Record<string, string>;
  summary_template?: string;
  is_active: boolean;
  timeout_ms: number;
};

const EMPTY_FORM: Partial<Integration> = {
  name: '',
  description: '',
  base_url: '',
  auth_type: 'none',
  auth_config: {},
  endpoints: {
    lookup_by_phone: { method: 'GET', path: '' },
    lookup_by_reference: { method: 'GET', path: '' },
  },
  field_mapping: { name: '', process_number: '', status: '', email: '' },
  summary_template: '',
  is_active: true,
  timeout_ms: 10000,
};

const AUTH_TYPES = [
  { value: 'none',   label: 'Sem autenticação' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'header', label: 'Header personalizado (ex: X-API-Key)' },
  { value: 'query',  label: 'Parâmetro na URL (ex: ?api_key=)' },
  { value: 'basic',  label: 'Utilizador e palavra-passe (Basic Auth)' },
];

export default function ApiConnections() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [isLoading, setIsLoading]       = useState(true);
  const [showForm, setShowForm]         = useState(false);
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [form, setForm]                 = useState<Partial<Integration>>(EMPTY_FORM);
  const [isSaving, setIsSaving]         = useState(false);
  const [testingId, setTestingId]       = useState<string | null>(null);
  const [testValue, setTestValue]       = useState<Record<string, string>>({});
  const [testResult, setTestResult]     = useState<Record<string, any>>({});
  const [expandedId, setExpandedId]     = useState<string | null>(null);

  const token = () => localStorage.getItem('token') || '';
  const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` });

  const fetchAll = async () => {
    try {
      const res = await fetch('/api/integrations', { headers: { Authorization: `Bearer ${token()}` } });
      const data = await res.json();
      setIntegrations(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Erro ao carregar integrações.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const startEdit = (i: Integration) => {
    setEditingId(i.id);
    setForm({
      ...i,
      auth_config: { ...i.auth_config },
      endpoints: {
        lookup_by_phone:     i.endpoints?.lookup_by_phone     || { method: 'GET', path: '' },
        lookup_by_reference: i.endpoints?.lookup_by_reference || { method: 'GET', path: '' },
      },
      field_mapping: { name: '', process_number: '', status: '', email: '', ...i.field_mapping },
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name?.trim() || !form.base_url?.trim()) {
      toast.error('Nome e URL base são obrigatórios.');
      return;
    }

    // Limpar mapeamentos vazios
    const cleanMapping: Record<string, string> = {};
    for (const [k, v] of Object.entries(form.field_mapping || {})) {
      if (v?.trim()) cleanMapping[k] = v.trim();
    }

    // Limpar endpoints vazios
    const cleanEndpoints: any = {};
    if (form.endpoints?.lookup_by_phone?.path?.trim()) {
      cleanEndpoints.lookup_by_phone = { method: 'GET', ...form.endpoints.lookup_by_phone, path: form.endpoints.lookup_by_phone.path.trim() };
    }
    if (form.endpoints?.lookup_by_reference?.path?.trim()) {
      cleanEndpoints.lookup_by_reference = { method: 'GET', ...form.endpoints.lookup_by_reference, path: form.endpoints.lookup_by_reference.path.trim() };
    }

    if (Object.keys(cleanEndpoints).length === 0) {
      toast.error('Configure pelo menos um endpoint (por telefone ou por processo).');
      return;
    }

    setIsSaving(true);
    try {
      const payload = { ...form, field_mapping: cleanMapping, endpoints: cleanEndpoints };
      const res = await fetch(editingId ? `/api/integrations/${editingId}` : '/api/integrations', {
        method: editingId ? 'PUT' : 'POST',
        headers: headers(),
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao guardar.');

      toast.success(data.message);
      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      fetchAll();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (i: Integration) => {
    if (!confirm(`Remover a integração "${i.name}"? A IA deixará de consultar este sistema.`)) return;
    try {
      await fetch(`/api/integrations/${i.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
      toast.success('Integração removida.');
      fetchAll();
    } catch {
      toast.error('Erro ao remover.');
    }
  };

  const handleToggleActive = async (i: Integration) => {
    try {
      await fetch(`/api/integrations/${i.id}`, {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify({ is_active: !i.is_active }),
      });
      fetchAll();
    } catch {
      toast.error('Erro ao alterar estado.');
    }
  };

  const handleTest = async (i: Integration) => {
    const value = (testValue[i.id] || '').trim();
    if (!value) {
      toast.error('Escreva um telefone ou nº de processo para testar.');
      return;
    }
    setTestingId(i.id);
    try {
      const isPhone = /^\+?[\d\s-]{8,}$/.test(value);
      const res = await fetch(`/api/integrations/${i.id}/test`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(isPhone ? { phone: value } : { reference: value }),
      });
      const data = await res.json();
      setTestResult(prev => ({ ...prev, [i.id]: data }));
      if (res.ok && data.success) toast.success(data.message);
      else toast.warning?.(data.message || data.error) || toast(data.message || data.error);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setTestingId(null);
    }
  };

  const setEndpoint = (key: 'lookup_by_phone' | 'lookup_by_reference', path: string) => {
    setForm(prev => ({
      ...prev,
      endpoints: { ...prev.endpoints, [key]: { method: 'GET', ...prev.endpoints?.[key], path } },
    }));
  };

  const setMapping = (key: string, value: string) => {
    setForm(prev => ({ ...prev, field_mapping: { ...prev.field_mapping, [key]: value } }));
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Conexões com Sistemas da Empresa</h2>
          <p className="text-zinc-500 text-sm mt-1">
            Ligue CRMs, gestão de processos, recrutamento ou qualquer API. A IA passa a conhecer cada cliente pelo número registado.
          </p>
        </div>
        <Button onClick={() => { setEditingId(null); setForm(EMPTY_FORM); setShowForm(true); }} className="bg-emerald-600 hover:bg-emerald-700 gap-2 shrink-0">
          <Plus className="w-4 h-4" /> Nova Conexão
        </Button>
      </div>

      {/* Protocolo de segurança */}
      <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl p-4 text-sm">
        <ShieldCheck className="w-5 h-5 shrink-0 text-emerald-600 mt-0.5" />
        <div>
          <p className="font-semibold">Protocolo de segurança activo</p>
          <p className="text-emerald-800 mt-1">
            Números <strong>registados</strong> no seu sistema recebem atendimento personalizado com dados do processo.
            Números <strong>desconhecidos</strong> que peçam dados de clientes terão de fornecer o nº de processo/contrato para verificação —
            caso contrário, a IA recomenda ligar para a empresa ou encaminha ao departamento responsável. <strong>Nunca</strong> partilha dados sem validação.
          </p>
        </div>
      </div>

      {/* Formulário */}
      {showForm && (
        <Card className="border-emerald-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">{editingId ? 'Editar Conexão' : 'Nova Conexão'}</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}><X className="w-4 h-4" /></Button>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-zinc-600">Nome *</label>
                <Input value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} placeholder='Ex: CRM Interno, Gestão de Processos' />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-600">URL Base da API *</label>
                <Input value={form.base_url || ''} onChange={e => setForm({ ...form, base_url: e.target.value })} placeholder="https://crm.suaempresa.com/api" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-600">Descrição</label>
              <Input value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Para que serve esta ligação?" />
            </div>

            {/* Autenticação */}
            <div className="border rounded-lg p-4 space-y-3 bg-zinc-50/50">
              <p className="text-sm font-semibold text-zinc-700">Autenticação</p>
              <select
                value={form.auth_type}
                onChange={e => setForm({ ...form, auth_type: e.target.value as any })}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                {AUTH_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>

              {form.auth_type === 'bearer' && (
                <Input type="password" placeholder="Token (Authorization: Bearer ...)" value={form.auth_config?.token || ''} onChange={e => setForm({ ...form, auth_config: { ...form.auth_config, token: e.target.value } })} />
              )}
              {form.auth_type === 'header' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input placeholder="Nome do header (ex: X-API-Key)" value={form.auth_config?.header_name || ''} onChange={e => setForm({ ...form, auth_config: { ...form.auth_config, header_name: e.target.value } })} />
                  <Input type="password" placeholder="Valor / Token" value={form.auth_config?.token || ''} onChange={e => setForm({ ...form, auth_config: { ...form.auth_config, token: e.target.value } })} />
                </div>
              )}
              {form.auth_type === 'query' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input placeholder="Nome do parâmetro (ex: api_key)" value={form.auth_config?.query_param || ''} onChange={e => setForm({ ...form, auth_config: { ...form.auth_config, query_param: e.target.value } })} />
                  <Input type="password" placeholder="Valor / Token" value={form.auth_config?.token || ''} onChange={e => setForm({ ...form, auth_config: { ...form.auth_config, token: e.target.value } })} />
                </div>
              )}
              {form.auth_type === 'basic' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input placeholder="Utilizador" value={form.auth_config?.username || ''} onChange={e => setForm({ ...form, auth_config: { ...form.auth_config, username: e.target.value } })} />
                  <Input type="password" placeholder="Palavra-passe" value={form.auth_config?.password || ''} onChange={e => setForm({ ...form, auth_config: { ...form.auth_config, password: e.target.value } })} />
                </div>
              )}
            </div>

            {/* Endpoints */}
            <div className="border rounded-lg p-4 space-y-3 bg-zinc-50/50">
              <p className="text-sm font-semibold text-zinc-700">Endpoints de consulta</p>
              <div>
                <label className="text-xs font-medium text-zinc-600">Buscar cliente por telefone</label>
                <Input
                  value={form.endpoints?.lookup_by_phone?.path || ''}
                  onChange={e => setEndpoint('lookup_by_phone', e.target.value)}
                  placeholder="/clientes?telefone={{phone}}"
                  className="font-mono text-xs"
                />
                <p className="text-[11px] text-zinc-400 mt-1">Use <code>{'{{phone}}'}</code> onde o número deve ser inserido.</p>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-600">Buscar por nº de processo/contrato (verificação de segurança)</label>
                <Input
                  value={form.endpoints?.lookup_by_reference?.path || ''}
                  onChange={e => setEndpoint('lookup_by_reference', e.target.value)}
                  placeholder="/processos/{{reference}}"
                  className="font-mono text-xs"
                />
                <p className="text-[11px] text-zinc-400 mt-1">Use <code>{'{{reference}}'}</code> onde o nº de processo/contrato deve ser inserido.</p>
              </div>
            </div>

            {/* Mapeamento */}
            <div className="border rounded-lg p-4 space-y-3 bg-zinc-50/50">
              <p className="text-sm font-semibold text-zinc-700">Mapeamento de campos da resposta</p>
              <p className="text-[11px] text-zinc-500">Indique o caminho (dot-notation) de cada campo no JSON devolvido pela API. Ex: se a resposta é <code>{'{"data":{"nome":"Ana"}}'}</code>, o caminho é <code>data.nome</code>.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs text-zinc-600">Nome do cliente</label>
                  <Input value={form.field_mapping?.name || ''} onChange={e => setMapping('name', e.target.value)} placeholder="data.nome" className="font-mono text-xs" />
                </div>
                <div>
                  <label className="text-xs text-zinc-600">Nº de processo/contrato</label>
                  <Input value={form.field_mapping?.process_number || ''} onChange={e => setMapping('process_number', e.target.value)} placeholder="data.processo" className="font-mono text-xs" />
                </div>
                <div>
                  <label className="text-xs text-zinc-600">Estado do processo</label>
                  <Input value={form.field_mapping?.status || ''} onChange={e => setMapping('status', e.target.value)} placeholder="data.estado" className="font-mono text-xs" />
                </div>
                <div>
                  <label className="text-xs text-zinc-600">E-mail</label>
                  <Input value={form.field_mapping?.email || ''} onChange={e => setMapping('email', e.target.value)} placeholder="data.email" className="font-mono text-xs" />
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-zinc-600">Modelo de resumo para a IA (opcional)</label>
              <Input
                value={form.summary_template || ''}
                onChange={e => setForm({ ...form, summary_template: e.target.value })}
                placeholder="Cliente {{name}} — processo {{process_number}} em estado {{status}}"
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-zinc-400 mt-1">Se vazio, o resumo é gerado automaticamente a partir dos campos mapeados.</p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={isSaving} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
                {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingId ? 'Guardar Alterações' : 'Criar Conexão'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-zinc-400" /></div>
        ) : integrations.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-zinc-400">
              <Plug className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>Nenhuma conexão configurada.</p>
              <p className="text-xs mt-1">Ligue o primeiro sistema para a IA começar a reconhecer os seus clientes.</p>
            </CardContent>
          </Card>
        ) : (
          integrations.map(i => (
            <Card key={i.id} className={i.is_active ? '' : 'opacity-60'}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${i.is_active ? 'bg-emerald-100' : 'bg-zinc-100'}`}>
                    <Plug className={`w-4 h-4 ${i.is_active ? 'text-emerald-600' : 'text-zinc-400'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{i.name}</p>
                    <p className="text-xs text-zinc-500 truncate font-mono">{i.base_url}</p>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${i.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>
                    {i.is_active ? 'Activa' : 'Inactiva'}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => handleToggleActive(i)} className="h-8 text-xs">
                      {i.is_active ? 'Desactivar' : 'Activar'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => startEdit(i)} className="h-8 w-8 p-0 text-blue-600">
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(i)} className="h-8 w-8 p-0 text-red-400">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setExpandedId(expandedId === i.id ? null : i.id)} className="h-8 w-8 p-0">
                      {expandedId === i.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>

                {expandedId === i.id && (
                  <div className="border-t pt-3 space-y-3">
                    <div className="grid gap-2 text-xs">
                      {i.endpoints?.lookup_by_phone?.path && (
                        <p><span className="text-zinc-500">Por telefone:</span> <code className="bg-zinc-100 px-1 rounded">{i.endpoints.lookup_by_phone.method || 'GET'} {i.endpoints.lookup_by_phone.path}</code></p>
                      )}
                      {i.endpoints?.lookup_by_reference?.path && (
                        <p><span className="text-zinc-500">Por processo:</span> <code className="bg-zinc-100 px-1 rounded">{i.endpoints.lookup_by_reference.method || 'GET'} {i.endpoints.lookup_by_reference.path}</code></p>
                      )}
                      {Object.keys(i.field_mapping || {}).length > 0 && (
                        <p><span className="text-zinc-500">Campos:</span> {Object.keys(i.field_mapping).join(', ')}</p>
                      )}
                    </div>

                    {/* Teste */}
                    <div className="flex items-center gap-2">
                      <Input
                        value={testValue[i.id] || ''}
                        onChange={e => setTestValue(prev => ({ ...prev, [i.id]: e.target.value }))}
                        placeholder="Telefone ou nº de processo para testar"
                        className="h-8 text-xs flex-1"
                      />
                      <Button size="sm" variant="outline" onClick={() => handleTest(i)} disabled={testingId === i.id} className="h-8 gap-1.5 text-xs">
                        {testingId === i.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TestTube2 className="w-3.5 h-3.5" />}
                        Testar
                      </Button>
                    </div>

                    {testResult[i.id] && (
                      <div className={`text-xs rounded-lg p-3 ${testResult[i.id].success ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200'}`}>
                        <p className="flex items-center gap-1.5 font-medium">
                          {testResult[i.id].success
                            ? <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> {testResult[i.id].message}</>
                            : <><XCircle className="w-3.5 h-3.5 text-amber-600" /> {testResult[i.id].message || testResult[i.id].error}</>}
                        </p>
                        {testResult[i.id].profile && (
                          <pre className="mt-2 bg-white/60 rounded p-2 overflow-x-auto text-[11px]">{JSON.stringify(testResult[i.id].profile.data, null, 2)}</pre>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
