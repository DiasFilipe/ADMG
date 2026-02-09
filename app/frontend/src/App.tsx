import { useEffect, useMemo, useState } from "react";

type Condominio = {
  id: string;
  nome: string;
  cnpj?: string | null;
  endereco?: string | null;
};

type Unidade = {
  id: string;
  identificador: string;
  tipo?: string | null;
  condominioId: string;
};

type Morador = {
  id: string;
  nome: string;
  documento?: string | null;
  contato?: string | null;
  unidadeId: string;
};

type Lancamento = {
  id: string;
  tipo: "RECEITA" | "DESPESA";
  valor: string | number;
  data: string;
  categoria?: string | null;
  descricao?: string | null;
  condominioId: string;
};

type User = {
  id: string;
  nome: string;
  email: string;
  role: "ADMINISTRADORA" | "OPERADOR" | "SINDICO";
  administradoraId?: string | null;
  condominioId?: string | null;
  authProvider?: "LOCAL" | "GOOGLE";
  avatarUrl?: string | null;
  googleId?: string | null;
  plano?: "FREEMIUM" | "ESSENCIAL" | "PROFISSIONAL" | "ESCALA";
  onboarded?: boolean;
  emailVerificado?: boolean;
};

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
const TOKEN_KEY = "admg_token";
const USER_KEY = "admg_user";

function roleLabel(role: User["role"]) {
  if (role === "ADMINISTRADORA") return "Administradora";
  if (role === "OPERADOR") return "Operador";
  return "Síndico";
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function matchesSearch(search: string, ...fields: Array<string | null | undefined>) {
  const query = normalizeText(search.trim());
  if (!query) return true;
  return fields.some((field) => normalizeText(String(field || "")).includes(query));
}

function formatCurrency(value: string | number) {
  const num = Number(String(value).replace(",", "."));
  if (Number.isNaN(num)) return String(value);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(num);
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR");
}

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMonthLabel(date: Date) {
  return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function slugify(value: string) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function calculateResumo(items: Lancamento[]) {
  let receitas = 0;
  let despesas = 0;

  for (const item of items) {
    const valor = Number(String(item.valor).replace(",", "."));
    if (Number.isNaN(valor)) continue;
    if (item.tipo === "RECEITA") {
      receitas += valor;
    } else {
      despesas += valor;
    }
  }

  return {
    receitas,
    despesas,
    saldo: receitas - despesas,
    total: items.length
  };
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || "");
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  });

  const [authView, setAuthView] = useState<
    "login" | "register" | "reset-request" | "reset"
  >(() => {
    if (window.location.pathname === "/cadastro") return "register";
    if (window.location.pathname === "/reset") return "reset-request";
    return "login";
  });
  const [loginEmail, setLoginEmail] = useState("");
  const [loginSenha, setLoginSenha] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authInfo, setAuthInfo] = useState<string | null>(null);

  const [registerNome, setRegisterNome] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerSenha, setRegisterSenha] = useState("");
  const [registerSenhaConfirm, setRegisterSenhaConfirm] = useState("");
  const [registerRole, setRegisterRole] = useState<"ADMINISTRADORA" | "SINDICO">(
    "ADMINISTRADORA"
  );
  const [registerAdminNome, setRegisterAdminNome] = useState("");
  const [registerCondoNome, setRegisterCondoNome] = useState("");
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registerInfo, setRegisterInfo] = useState<string | null>(null);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerVerifyLink, setRegisterVerifyLink] = useState<string | null>(null);

  const [resetEmail, setResetEmail] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [resetSenha, setResetSenha] = useState("");
  const [resetSenhaConfirm, setResetSenhaConfirm] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetInfo, setResetInfo] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState(false);

  const [onboardingPlan, setOnboardingPlan] = useState<
    "FREEMIUM" | "ESSENCIAL" | "PROFISSIONAL" | "ESCALA"
  >("FREEMIUM");
  const [onboardingCondoNome, setOnboardingCondoNome] = useState("");
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [onboardingLoading, setOnboardingLoading] = useState(false);

  const [condominios, setCondominios] = useState<Condominio[]>([]);
  const [selectedCondominio, setSelectedCondominio] = useState<Condominio | null>(null);
  const [condoNome, setCondoNome] = useState("");
  const [condoCnpj, setCondoCnpj] = useState("");
  const [condoEndereco, setCondoEndereco] = useState("");
  const [condoSearch, setCondoSearch] = useState("");
  const [editingCondoId, setEditingCondoId] = useState<string | null>(null);
  const [condoError, setCondoError] = useState<string | null>(null);
  const [loadingCondominios, setLoadingCondominios] = useState(false);
  const [savingCondo, setSavingCondo] = useState(false);

  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [selectedUnidade, setSelectedUnidade] = useState<Unidade | null>(null);
  const [unidadeIdentificador, setUnidadeIdentificador] = useState("");
  const [unidadeTipo, setUnidadeTipo] = useState("");
  const [unidadeSearch, setUnidadeSearch] = useState("");
  const [editingUnidadeId, setEditingUnidadeId] = useState<string | null>(null);
  const [unidadeError, setUnidadeError] = useState<string | null>(null);
  const [loadingUnidades, setLoadingUnidades] = useState(false);
  const [savingUnidade, setSavingUnidade] = useState(false);

  const [moradores, setMoradores] = useState<Morador[]>([]);
  const [moradorNome, setMoradorNome] = useState("");
  const [moradorDocumento, setMoradorDocumento] = useState("");
  const [moradorContato, setMoradorContato] = useState("");
  const [moradorSearch, setMoradorSearch] = useState("");
  const [editingMoradorId, setEditingMoradorId] = useState<string | null>(null);
  const [moradorError, setMoradorError] = useState<string | null>(null);
  const [loadingMoradores, setLoadingMoradores] = useState(false);
  const [savingMorador, setSavingMorador] = useState(false);

  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [lancamentoTipo, setLancamentoTipo] = useState<"RECEITA" | "DESPESA">("DESPESA");
  const [lancamentoValor, setLancamentoValor] = useState("");
  const [lancamentoData, setLancamentoData] = useState(() => new Date().toISOString().slice(0, 10));
  const [lancamentoCategoria, setLancamentoCategoria] = useState("");
  const [lancamentoDescricao, setLancamentoDescricao] = useState("");
  const [lancamentoPeriodo, setLancamentoPeriodo] = useState("");
  const [lancamentoInicio, setLancamentoInicio] = useState("");
  const [lancamentoFim, setLancamentoFim] = useState("");
  const [lancamentoSearch, setLancamentoSearch] = useState("");
  const [editingLancamentoId, setEditingLancamentoId] = useState<string | null>(null);
  const [lancamentoError, setLancamentoError] = useState<string | null>(null);
  const [loadingLancamentos, setLoadingLancamentos] = useState(false);
  const [savingLancamento, setSavingLancamento] = useState(false);

  const [kpiResumo, setKpiResumo] = useState(() => calculateResumo([]));
  const [kpiLabel, setKpiLabel] = useState("");
  const [kpiLoading, setKpiLoading] = useState(false);

  const isEditingCondo = useMemo(() => Boolean(editingCondoId), [editingCondoId]);
  const isEditingUnidade = useMemo(() => Boolean(editingUnidadeId), [editingUnidadeId]);
  const isEditingMorador = useMemo(() => Boolean(editingMoradorId), [editingMoradorId]);
  const isEditingLancamento = useMemo(() => Boolean(editingLancamentoId), [editingLancamentoId]);
  const canEdit = user?.role !== "SINDICO";

  const filteredCondominios = useMemo(() => {
    return condominios.filter((condo) =>
      matchesSearch(condoSearch, condo.nome, condo.cnpj, condo.endereco)
    );
  }, [condominios, condoSearch]);

  const filteredUnidades = useMemo(() => {
    return unidades.filter((unidade) =>
      matchesSearch(unidadeSearch, unidade.identificador, unidade.tipo)
    );
  }, [unidades, unidadeSearch]);

  const filteredMoradores = useMemo(() => {
    return moradores.filter((morador) =>
      matchesSearch(moradorSearch, morador.nome, morador.documento, morador.contato)
    );
  }, [moradores, moradorSearch]);

  const filteredLancamentos = useMemo(() => {
    return lancamentos.filter((lancamento) =>
      matchesSearch(
        lancamentoSearch,
        lancamento.tipo,
        lancamento.categoria,
        lancamento.descricao,
        String(lancamento.valor)
      )
    );
  }, [lancamentos, lancamentoSearch]);

  const resumoLancamentos = useMemo(() => calculateResumo(filteredLancamentos), [filteredLancamentos]);

  function saveAuth(newToken: string, newUser: User) {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(USER_KEY, JSON.stringify(newUser));
  }

  function clearAuth() {
    setToken("");
    setUser(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setAuthInfo(null);
    setRegisterInfo(null);
    setRegisterError(null);
    setRegisterVerifyLink(null);
    setResetInfo(null);
    setResetError(null);
    resetCondominioForm();
    resetUnidadeForm();
    resetMoradorForm();
    resetLancamentoForm();
    setCondominios([]);
    setUnidades([]);
    setMoradores([]);
    setLancamentos([]);
    setSelectedCondominio(null);
    setSelectedUnidade(null);
    setKpiResumo(calculateResumo([]));
    setKpiLabel("");
    setKpiLoading(false);
  }

  function resetRegisterForm() {
    setRegisterNome("");
    setRegisterEmail("");
    setRegisterSenha("");
    setRegisterSenhaConfirm("");
    setRegisterRole("ADMINISTRADORA");
    setRegisterAdminNome("");
    setRegisterCondoNome("");
    setRegisterVerifyLink(null);
  }

  function setAuthRoute(view: "login" | "register" | "reset-request" | "reset") {
    setAuthView(view);
    setAuthError(null);
    setAuthInfo(null);
    setRegisterError(null);
    setRegisterInfo(null);
    setResetError(null);
    setResetInfo(null);
    if (view === "login") {
      resetRegisterForm();
    }
    const path =
      view === "register" ? "/cadastro" : view === "reset-request" || view === "reset" ? "/reset" : "/";
    window.history.pushState({}, document.title, path);
  }

  async function finalizeAuthFromToken(newToken: string) {
    setAuthLoading(true);
    setAuthError(null);
    setAuthInfo(null);
    try {
      const res = await fetch(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${newToken}` }
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || "erro");
      }
      saveAuth(newToken, body.user as User);
      setAuthInfo("Login concluido com Google.");
    } catch (_err) {
      clearAuth();
      setAuthError("Falha ao validar login do Google.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function apiFetch(path: string, options: RequestInit = {}) {
    const headers = new Headers(options.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (!headers.has("Content-Type") && options.body) {
      headers.set("Content-Type", "application/json");
    }

    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers
    });

    if (res.status === 401) {
      clearAuth();
      throw new Error("sessao_expirada");
    }

    if (res.status === 204) {
      return null;
    }

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body?.error || "erro");
    }
    return body;
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);

    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, senha: loginSenha })
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || "credenciais_invalidas");
      }

      saveAuth(body.token, body.user as User);
      setLoginEmail("");
      setLoginSenha("");
    } catch (_err) {
      const code = (_err as Error).message;
      if (code === "email_nao_verificado") {
        setAuthError("Email nao verificado. Verifique sua caixa de entrada.");
      } else if (code === "muitas_tentativas") {
        setAuthError("Muitas tentativas. Aguarde alguns minutos e tente novamente.");
      } else {
        setAuthError("Falha no login. Verifique email e senha.");
      }
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setRegisterError(null);
    setRegisterInfo(null);
    setRegisterVerifyLink(null);

    if (!registerNome.trim() || !registerEmail.trim() || !registerSenha) {
      setRegisterError("Preencha nome, email e senha.");
      return;
    }

    if (registerSenha.length < 8) {
      setRegisterError("A senha deve ter pelo menos 8 caracteres.");
      return;
    }

    if (registerSenha !== registerSenhaConfirm) {
      setRegisterError("As senhas não conferem.");
      return;
    }

    if (registerRole === "ADMINISTRADORA" && !registerAdminNome.trim()) {
      setRegisterError("Informe o nome da administradora.");
      return;
    }

    if (registerRole === "SINDICO" && !registerCondoNome.trim()) {
      setRegisterError("Informe o nome do condomínio.");
      return;
    }

    setRegisterLoading(true);
    try {
      const payload: Record<string, string> = {
        nome: registerNome.trim(),
        email: registerEmail.trim(),
        senha: registerSenha,
        role: registerRole
      };

      if (registerRole === "ADMINISTRADORA") {
        payload.administradoraNome = registerAdminNome.trim();
      } else {
        payload.condominioNome = registerCondoNome.trim();
      }

      const res = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (body?.error === "email_em_uso") {
          throw new Error("email_em_uso");
        }
        throw new Error(body?.error || "erro");
      }

      if (body?.verificationRequired) {
        const token = String(body?.verificationToken || "");
        if (token) {
          setRegisterVerifyLink(`${window.location.origin}/?verify=${token}`);
        }
        setRegisterInfo("Enviamos um link de verificacao para o seu email.");
        return;
      }

      if (body?.token && body?.user) {
        saveAuth(body.token, body.user as User);
        resetRegisterForm();
        setRegisterInfo("Cadastro realizado com sucesso.");
      }
    } catch (err) {
      if ((err as Error).message === "email_em_uso") {
        setRegisterError("Esse email já está em uso.");
      } else if ((err as Error).message === "senha_fraca") {
        setRegisterError("A senha deve ter pelo menos 8 caracteres.");
      } else {
        setRegisterError("Falha no cadastro. Tente novamente.");
      }
    } finally {
      setRegisterLoading(false);
    }
  }

  async function handleResendVerification() {
    if (!loginEmail.trim()) {
      setAuthError("Informe seu email para reenviar a verificacao.");
      return;
    }
    setAuthError(null);
    setAuthInfo(null);
    try {
      const res = await fetch(`${API_URL}/auth/resend-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail.trim() })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || "erro");
      }
      if (body?.verificationToken) {
        setAuthInfo(`Link de verificacao: ${window.location.origin}/?verify=${body.verificationToken}`);
      } else {
        setAuthInfo("Se o email existir, reenviamos o link de verificacao.");
      }
    } catch (_err) {
      setAuthError("Falha ao reenviar verificacao.");
    }
  }

  async function handleVerifyEmail(tokenValue: string) {
    try {
      const res = await fetch(`${API_URL}/auth/verify-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenValue })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || "erro");
      }
      saveAuth(body.token, body.user as User);
      setAuthInfo("Email verificado com sucesso.");
    } catch (_err) {
      setAuthError("Falha ao verificar email.");
    }
  }

  async function handleResetRequest(e: React.FormEvent) {
    e.preventDefault();
    setResetError(null);
    setResetInfo(null);

    if (!resetEmail.trim()) {
      setResetError("Informe seu email.");
      return;
    }

    setResetLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/request-reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmail.trim() })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || "erro");
      }
      if (body?.resetToken) {
        setResetInfo(`Link de redefinicao: ${window.location.origin}/?reset=${body.resetToken}`);
      } else {
        setResetInfo("Se o email existir, enviaremos um link de redefinicao.");
      }
    } catch (_err) {
      setResetError("Falha ao solicitar redefinicao.");
    } finally {
      setResetLoading(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setResetError(null);
    setResetInfo(null);

    if (!resetToken.trim()) {
      setResetError("Token invalido.");
      return;
    }
    if (!resetSenha) {
      setResetError("Informe a nova senha.");
      return;
    }
    if (resetSenha.length < 8) {
      setResetError("A senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (resetSenha !== resetSenhaConfirm) {
      setResetError("As senhas nao conferem.");
      return;
    }

    setResetLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: resetToken.trim(), senha: resetSenha })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || "erro");
      }
      setResetInfo("Senha atualizada. Voce ja pode entrar.");
      setAuthRoute("login");
      setResetSenha("");
      setResetSenhaConfirm("");
    } catch (_err) {
      const code = (_err as Error).message;
      if (code === "senha_fraca") {
        setResetError("A senha deve ter pelo menos 8 caracteres.");
      } else {
        setResetError("Falha ao redefinir senha.");
      }
    } finally {
      setResetLoading(false);
    }
  }

  async function handleOnboarding(e: React.FormEvent) {
    e.preventDefault();
    setOnboardingError(null);

    if (user?.role === "ADMINISTRADORA" && !onboardingCondoNome.trim()) {
      setOnboardingError("Informe o nome do condominio.");
      return;
    }

    setOnboardingLoading(true);
    try {
      const body = await apiFetch("/auth/onboarding", {
        method: "POST",
        body: JSON.stringify({
          plano: onboardingPlan,
          condominioNome: onboardingCondoNome.trim() || undefined
        })
      });
      if (body?.user) {
        saveAuth(token, body.user as User);
      }
    } catch (_err) {
      setOnboardingError("Falha ao concluir o cadastro.");
    } finally {
      setOnboardingLoading(false);
    }
  }

  async function handleGoogleLink() {
    setAuthError(null);
    setAuthInfo(null);
    try {
      const body = await apiFetch("/auth/google/link", {
        method: "POST",
        body: JSON.stringify({ redirect: window.location.origin })
      });
      if (!body?.url) {
        throw new Error("sem_url");
      }
      window.location.href = body.url;
    } catch (_err) {
      setAuthError("Falha ao iniciar vinculo com Google.");
    }
  }

  useEffect(() => {
    const handlePopState = () => {
      if (window.location.pathname === "/cadastro") {
        setAuthView("register");
      } else if (window.location.pathname === "/reset") {
        setAuthView("reset-request");
      } else {
        setAuthView("login");
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      const params = new URLSearchParams(hash.replace("#", ""));
      const tokenParam = params.get("token");
      const error = params.get("error");
      if (tokenParam) {
        window.history.replaceState({}, document.title, window.location.pathname);
        finalizeAuthFromToken(tokenParam);
      } else if (error) {
        window.history.replaceState({}, document.title, window.location.pathname);
        setAuthError("Falha no login com Google.");
      }
    }

    const query = new URLSearchParams(window.location.search);
    const linked = query.get("linked");
    const errorQuery = query.get("error");
    const verifyToken = query.get("verify");
    const resetTokenParam = query.get("reset");
    if (linked) {
      setAuthInfo("Conta Google vinculada com sucesso.");
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (errorQuery) {
      setAuthError("Falha ao vincular conta Google.");
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    if (verifyToken) {
      window.history.replaceState({}, document.title, window.location.pathname);
      handleVerifyEmail(verifyToken);
    }

    if (resetTokenParam) {
      setResetToken(resetTokenParam);
      setAuthRoute("reset");
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  async function loadCondominios() {
    if (!token) return;
    setLoadingCondominios(true);
    setCondoError(null);
    try {
      const body = await apiFetch("/api/condominios");
      setCondominios(body?.data || []);
    } catch (_err) {
      setCondoError("Falha ao carregar condominios");
    } finally {
      setLoadingCondominios(false);
    }
  }

  async function loadUnidades(condominioId: string) {
    if (!token || !condominioId) return;
    setLoadingUnidades(true);
    setUnidadeError(null);
    try {
      const body = await apiFetch(`/api/condominios/${condominioId}/unidades`);
      setUnidades(body?.data || []);
    } catch (_err) {
      setUnidadeError("Falha ao carregar unidades");
    } finally {
      setLoadingUnidades(false);
    }
  }

  async function loadMoradores(unidadeId: string) {
    if (!token || !unidadeId) return;
    setLoadingMoradores(true);
    setMoradorError(null);
    try {
      const body = await apiFetch(`/api/unidades/${unidadeId}/moradores`);
      setMoradores(body?.data || []);
    } catch (_err) {
      setMoradorError("Falha ao carregar moradores");
    } finally {
      setLoadingMoradores(false);
    }
  }

  function getLancamentoPeriodoRange(periodo: string) {
    if (!periodo) return null;
    const [yearRaw, monthRaw] = periodo.split("-");
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    if (!year || !month) return null;
    const inicio = new Date(year, month - 1, 1);
    const fim = new Date(year, month, 0);
    return { inicio, fim };
  }

  function buildLancamentoQuery(periodo: string, inicio: string, fim: string) {
    const params = new URLSearchParams();
    if (inicio || fim) {
      if (inicio) params.set("inicio", inicio);
      if (fim) params.set("fim", fim);
      return params;
    }

    const range = getLancamentoPeriodoRange(periodo);
    if (range) {
      params.set("inicio", formatDateInput(range.inicio));
      params.set("fim", formatDateInput(range.fim));
    }
    return params;
  }

  async function loadLancamentos(
    condominioId: string,
    periodo: string,
    inicio: string,
    fim: string
  ) {
    if (!token || !condominioId) return;
    setLoadingLancamentos(true);
    setLancamentoError(null);

    try {
      const params = buildLancamentoQuery(periodo, inicio, fim);
      const query = params.toString();
      const body = await apiFetch(
        `/api/condominios/${condominioId}/lancamentos${query ? `?${query}` : ""}`
      );
      setLancamentos(body?.data || []);
    } catch (_err) {
      setLancamentoError("Falha ao carregar lancamentos");
    } finally {
      setLoadingLancamentos(false);
    }
  }

  async function reloadLancamentos() {
    if (!selectedCondominio) return;
    await loadLancamentos(
      selectedCondominio.id,
      lancamentoPeriodo,
      lancamentoInicio,
      lancamentoFim
    );
  }

  async function loadKpi(condominioId: string) {
    if (!token || !condominioId) return;
    setKpiLoading(true);
    try {
      const now = new Date();
      const inicio = new Date(now.getFullYear(), now.getMonth(), 1);
      const fim = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const params = new URLSearchParams({
        inicio: formatDateInput(inicio),
        fim: formatDateInput(fim)
      });
      const body = await apiFetch(
        `/api/condominios/${condominioId}/lancamentos?${params.toString()}`
      );
      const data = body?.data || [];
      setKpiResumo(calculateResumo(data));
      setKpiLabel(formatMonthLabel(now));
    } catch (_err) {
      setKpiResumo(calculateResumo([]));
      setKpiLabel("");
    } finally {
      setKpiLoading(false);
    }
  }

  function resetCondominioForm() {
    setCondoNome("");
    setCondoCnpj("");
    setCondoEndereco("");
    setEditingCondoId(null);
  }

  function resetUnidadeForm() {
    setUnidadeIdentificador("");
    setUnidadeTipo("");
    setEditingUnidadeId(null);
  }

  function resetMoradorForm() {
    setMoradorNome("");
    setMoradorDocumento("");
    setMoradorContato("");
    setEditingMoradorId(null);
  }

  function resetLancamentoForm() {
    setLancamentoTipo("DESPESA");
    setLancamentoValor("");
    setLancamentoData(new Date().toISOString().slice(0, 10));
    setLancamentoCategoria("");
    setLancamentoDescricao("");
    setEditingLancamentoId(null);
  }

  async function handleCondominioSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!condoNome.trim()) {
      setCondoError("Nome e obrigatorio");
      return;
    }

    setSavingCondo(true);
    setCondoError(null);

    const payload = {
      nome: condoNome.trim(),
      cnpj: condoCnpj.trim() || null,
      endereco: condoEndereco.trim() || null
    };

    try {
      if (editingCondoId) {
        await apiFetch(`/api/condominios/${editingCondoId}`, {
          method: "PATCH",
          body: JSON.stringify(payload)
        });
      } else {
        await apiFetch("/api/condominios", {
          method: "POST",
          body: JSON.stringify(payload)
        });
      }
      resetCondominioForm();
      await loadCondominios();
    } catch (_err) {
      if ((_err as Error).message === "limite_plano") {
        setCondoError("Limite do plano freemium atingido (1 condominio).");
      } else {
        setCondoError("Falha ao salvar condominio");
      }
    } finally {
      setSavingCondo(false);
    }
  }

  async function handleUnidadeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCondominio) {
      setUnidadeError("Selecione um condominio");
      return;
    }
    if (!unidadeIdentificador.trim()) {
      setUnidadeError("Identificador e obrigatorio");
      return;
    }

    setSavingUnidade(true);
    setUnidadeError(null);

    const payload = {
      identificador: unidadeIdentificador.trim(),
      tipo: unidadeTipo.trim() || null
    };

    try {
      if (editingUnidadeId) {
        await apiFetch(`/api/unidades/${editingUnidadeId}`, {
          method: "PATCH",
          body: JSON.stringify(payload)
        });
      } else {
        await apiFetch(`/api/condominios/${selectedCondominio.id}/unidades`, {
          method: "POST",
          body: JSON.stringify(payload)
        });
      }
      resetUnidadeForm();
      await loadUnidades(selectedCondominio.id);
    } catch (_err) {
      if ((_err as Error).message === "limite_plano") {
        setUnidadeError("Limite do plano freemium atingido (15 unidades).");
      } else {
        setUnidadeError("Falha ao salvar unidade");
      }
    } finally {
      setSavingUnidade(false);
    }
  }

  async function handleMoradorSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUnidade) {
      setMoradorError("Selecione uma unidade");
      return;
    }
    if (!moradorNome.trim()) {
      setMoradorError("Nome e obrigatorio");
      return;
    }

    setSavingMorador(true);
    setMoradorError(null);

    const payload = {
      nome: moradorNome.trim(),
      documento: moradorDocumento.trim() || null,
      contato: moradorContato.trim() || null
    };

    try {
      if (editingMoradorId) {
        await apiFetch(`/api/moradores/${editingMoradorId}`, {
          method: "PATCH",
          body: JSON.stringify(payload)
        });
      } else {
        await apiFetch(`/api/unidades/${selectedUnidade.id}/moradores`, {
          method: "POST",
          body: JSON.stringify(payload)
        });
      }
      resetMoradorForm();
      await loadMoradores(selectedUnidade.id);
    } catch (_err) {
      setMoradorError("Falha ao salvar morador");
    } finally {
      setSavingMorador(false);
    }
  }

  async function handleLancamentoSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCondominio) {
      setLancamentoError("Selecione um condominio");
      return;
    }
    if (!lancamentoValor.trim()) {
      setLancamentoError("Valor e obrigatorio");
      return;
    }
    if (!lancamentoData.trim()) {
      setLancamentoError("Data e obrigatoria");
      return;
    }

    setSavingLancamento(true);
    setLancamentoError(null);

    const valorNormalizado = lancamentoValor.trim().replace(",", ".");

    const payload = {
      tipo: lancamentoTipo,
      valor: valorNormalizado,
      data: lancamentoData,
      categoria: lancamentoCategoria.trim() || null,
      descricao: lancamentoDescricao.trim() || null
    };

    try {
      if (editingLancamentoId) {
        await apiFetch(`/api/lancamentos/${editingLancamentoId}`, {
          method: "PATCH",
          body: JSON.stringify(payload)
        });
      } else {
        await apiFetch(`/api/condominios/${selectedCondominio.id}/lancamentos`, {
          method: "POST",
          body: JSON.stringify(payload)
        });
      }
      resetLancamentoForm();
      await loadLancamentos(
        selectedCondominio.id,
        lancamentoPeriodo,
        lancamentoInicio,
        lancamentoFim
      );
      await loadKpi(selectedCondominio.id);
    } catch (_err) {
      setLancamentoError("Falha ao salvar lancamento");
    } finally {
      setSavingLancamento(false);
    }
  }

  function handleLancamentoPeriodoChange(value: string) {
    setLancamentoPeriodo(value);
    setLancamentoInicio("");
    setLancamentoFim("");
    if (selectedCondominio) {
      loadLancamentos(selectedCondominio.id, value, "", "");
    }
  }

  function clearLancamentoPeriodo() {
    setLancamentoPeriodo("");
    setLancamentoInicio("");
    setLancamentoFim("");
    if (selectedCondominio) {
      loadLancamentos(selectedCondominio.id, "", "", "");
    }
  }

  function handleLancamentoInicioChange(value: string) {
    setLancamentoInicio(value);
    setLancamentoPeriodo("");
    if (selectedCondominio) {
      loadLancamentos(selectedCondominio.id, "", value, lancamentoFim);
    }
  }

  function handleLancamentoFimChange(value: string) {
    setLancamentoFim(value);
    setLancamentoPeriodo("");
    if (selectedCondominio) {
      loadLancamentos(selectedCondominio.id, "", lancamentoInicio, value);
    }
  }

  function exportLancamentosCsv() {
    if (!selectedCondominio || filteredLancamentos.length === 0) return;

    const headers = ["Condominio", "Data", "Tipo", "Categoria", "Descricao", "Valor"];
    const rows = filteredLancamentos.map((item) => [
      selectedCondominio.nome,
      formatDate(item.data),
      item.tipo,
      item.categoria || "",
      item.descricao || "",
      String(item.valor)
    ]);

    const escape = (value: string) => {
      if (value.includes("\"") || value.includes(";") || value.includes("\n")) {
        return `"${value.replace(/\"/g, "\"\"")}"`;
      }
      return value;
    };

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => escape(String(cell))).join(";"))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const rangeLabel =
      lancamentoInicio || lancamentoFim
        ? `-${lancamentoInicio || "inicio"}-ate-${lancamentoFim || "fim"}`
        : "";
    const periodo = lancamentoPeriodo ? `-${lancamentoPeriodo}` : rangeLabel || "-todos";
    link.href = url;
    link.download = `lancamentos-${slugify(selectedCondominio.nome)}${periodo}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function exportUnidadesCsv() {
    if (!selectedCondominio || filteredUnidades.length === 0) return;

    const headers = ["Condominio", "Identificador", "Tipo"];
    const rows = filteredUnidades.map((item) => [
      selectedCondominio.nome,
      item.identificador,
      item.tipo || ""
    ]);

    const escape = (value: string) => {
      if (value.includes("\"") || value.includes(";") || value.includes("\n")) {
        return `"${value.replace(/\"/g, "\"\"")}"`;
      }
      return value;
    };

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => escape(String(cell))).join(";"))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `unidades-${slugify(selectedCondominio.nome)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function exportMoradoresCsv() {
    if (!selectedCondominio || !selectedUnidade || filteredMoradores.length === 0) return;

    const headers = ["Condominio", "Unidade", "Nome", "Documento", "Contato"];
    const rows = filteredMoradores.map((item) => [
      selectedCondominio.nome,
      selectedUnidade.identificador,
      item.nome,
      item.documento || "",
      item.contato || ""
    ]);

    const escape = (value: string) => {
      if (value.includes("\"") || value.includes(";") || value.includes("\n")) {
        return `"${value.replace(/\"/g, "\"\"")}"`;
      }
      return value;
    };

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => escape(String(cell))).join(";"))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `moradores-${slugify(selectedUnidade.identificador)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function startEditCondominio(item: Condominio) {
    setEditingCondoId(item.id);
    setCondoNome(item.nome || "");
    setCondoCnpj(item.cnpj || "");
    setCondoEndereco(item.endereco || "");
  }

  function startEditUnidade(item: Unidade) {
    setEditingUnidadeId(item.id);
    setUnidadeIdentificador(item.identificador || "");
    setUnidadeTipo(item.tipo || "");
  }

  function startEditMorador(item: Morador) {
    setEditingMoradorId(item.id);
    setMoradorNome(item.nome || "");
    setMoradorDocumento(item.documento || "");
    setMoradorContato(item.contato || "");
  }

  function startEditLancamento(item: Lancamento) {
    setEditingLancamentoId(item.id);
    setLancamentoTipo(item.tipo);
    setLancamentoValor(String(item.valor));
    setLancamentoData(item.data.slice(0, 10));
    setLancamentoCategoria(item.categoria || "");
    setLancamentoDescricao(item.descricao || "");
  }

  async function removeCondominio(item: Condominio) {
    if (!confirm(`Excluir ${item.nome}?`)) return;

    setSavingCondo(true);
    setCondoError(null);
    try {
      await apiFetch(`/api/condominios/${item.id}`, { method: "DELETE" });
      if (editingCondoId === item.id) {
        resetCondominioForm();
      }
      if (selectedCondominio?.id === item.id) {
        setSelectedCondominio(null);
        setSelectedUnidade(null);
        setUnidades([]);
        setMoradores([]);
        setLancamentos([]);
      }
      await loadCondominios();
    } catch (_err) {
      setCondoError("Falha ao excluir condominio");
    } finally {
      setSavingCondo(false);
    }
  }

  async function removeUnidade(item: Unidade) {
    if (!confirm(`Excluir unidade ${item.identificador}?`)) return;

    setSavingUnidade(true);
    setUnidadeError(null);
    try {
      await apiFetch(`/api/unidades/${item.id}`, { method: "DELETE" });
      if (editingUnidadeId === item.id) {
        resetUnidadeForm();
      }
      if (selectedUnidade?.id === item.id) {
        setSelectedUnidade(null);
        setMoradores([]);
      }
      if (selectedCondominio) {
        await loadUnidades(selectedCondominio.id);
      }
    } catch (_err) {
      setUnidadeError("Falha ao excluir unidade");
    } finally {
      setSavingUnidade(false);
    }
  }

  async function removeMorador(item: Morador) {
    if (!confirm(`Excluir morador ${item.nome}?`)) return;

    setSavingMorador(true);
    setMoradorError(null);
    try {
      await apiFetch(`/api/moradores/${item.id}`, { method: "DELETE" });
      if (editingMoradorId === item.id) {
        resetMoradorForm();
      }
      if (selectedUnidade) {
        await loadMoradores(selectedUnidade.id);
      }
    } catch (_err) {
      setMoradorError("Falha ao excluir morador");
    } finally {
      setSavingMorador(false);
    }
  }

  async function removeLancamento(item: Lancamento) {
    if (!confirm("Excluir lancamento?")) return;

    setSavingLancamento(true);
    setLancamentoError(null);
    try {
      await apiFetch(`/api/lancamentos/${item.id}`, { method: "DELETE" });
      if (editingLancamentoId === item.id) {
        resetLancamentoForm();
      }
      if (selectedCondominio) {
        await loadLancamentos(
          selectedCondominio.id,
          lancamentoPeriodo,
          lancamentoInicio,
          lancamentoFim
        );
        await loadKpi(selectedCondominio.id);
      }
    } catch (_err) {
      setLancamentoError("Falha ao excluir lancamento");
    } finally {
      setSavingLancamento(false);
    }
  }

  async function selectCondominio(item: Condominio) {
    setSelectedCondominio(item);
    setSelectedUnidade(null);
    setUnidades([]);
    setMoradores([]);
    setLancamentos([]);
    resetUnidadeForm();
    resetMoradorForm();
    resetLancamentoForm();
    await Promise.all([
      loadUnidades(item.id),
      loadLancamentos(item.id, lancamentoPeriodo, lancamentoInicio, lancamentoFim),
      loadKpi(item.id)
    ]);
  }

  async function selectUnidade(item: Unidade) {
    setSelectedUnidade(item);
    setMoradores([]);
    resetMoradorForm();
    await loadMoradores(item.id);
  }

  useEffect(() => {
    if (token) {
      loadCondominios();
    }
  }, [token]);

  useEffect(() => {
    if (user?.plano) {
      setOnboardingPlan(user.plano);
    }
  }, [user?.plano]);

  useEffect(() => {
    if (selectedCondominio) {
      const stillExists = condominios.find((c) => c.id === selectedCondominio.id);
      if (!stillExists) {
        setSelectedCondominio(null);
        setSelectedUnidade(null);
        setUnidades([]);
        setMoradores([]);
        setLancamentos([]);
      }
    } else if (condominios.length === 1) {
      selectCondominio(condominios[0]);
    }
  }, [condominios]);

  useEffect(() => {
    if (selectedUnidade) {
      const stillExists = unidades.find((u) => u.id === selectedUnidade.id);
      if (!stillExists) {
        setSelectedUnidade(null);
        setMoradores([]);
      }
    } else if (unidades.length === 1) {
      selectUnidade(unidades[0]);
    }
  }, [unidades]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="logo">
            <svg className="logo-icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
              <defs>
                <mask id="duodomo-sun-cut" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse">
                  <rect x="0" y="0" width="48" height="48" fill="white" />
                  <path className="logo-cut" d="M0 30 C16 20, 32 20, 48 30" />
                  <path className="logo-cut" d="M0 36 C16 26, 32 26, 48 36" />
                </mask>
              </defs>
              <circle className="logo-circle" cx="24" cy="24" r="18" mask="url(#duodomo-sun-cut)" />
            </svg>
            <div className="logo-text">
              <span className="logo-mark">DUODOMO</span>
              <span className="logo-sub">Gestao condominial</span>
            </div>
          </div>
          <h1>Gestao para administradoras</h1>
          <p className="subtitle">Fluxo simples, fechamento rastreavel e cobranca clara.</p>
        </div>
        {user && (
          <div className="user">
            <div className="avatar">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.nome} />
              ) : (
                <span>{user.nome.slice(0, 1).toUpperCase()}</span>
              )}
            </div>
            <div className="user-meta">
              <span className="user-name">{user.nome}</span>
              <span className="badge">{roleLabel(user.role)}</span>
              <span className="user-email">{user.email}</span>
            </div>
            <div className="user-actions">
              {!user.googleId && (
                <button className="ghost" onClick={handleGoogleLink}>
                  Vincular Google
                </button>
              )}
              <button className="ghost" onClick={clearAuth}>
                Sair
              </button>
            </div>
          </div>
        )}
      </header>

      {!token ? (
        authView === "login" ? (
          <section className="card auth-card">
            <h2>Entrar</h2>
            <p className="muted">Use as credenciais do arquivo CREDENCIAIS.md.</p>
            <form onSubmit={handleLogin} className="form-grid">
              <label>
                <span>Email</span>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="admin@admg.local"
                  required
                />
              </label>
              <label>
                <span>Senha</span>
                <input
                  type="password"
                  value={loginSenha}
                  onChange={(e) => setLoginSenha(e.target.value)}
                  placeholder="Sua senha"
                  required
                />
              </label>
              <div className="actions">
                <button className="primary" type="submit" disabled={authLoading}>
                  {authLoading ? "Entrando..." : "Entrar"}
                </button>
                <button
                  className="ghost"
                  type="button"
                  onClick={() => {
                    setAuthError(null);
                    setAuthInfo(null);
                    window.location.href = `${API_URL}/auth/google?redirect=${encodeURIComponent(
                      window.location.origin
                    )}`;
                  }}
                >
                  Entrar com Google
                </button>
              </div>
              <div className="auth-links">
                <button
                  type="button"
                  className="link-button"
                  onClick={() => setAuthRoute("reset-request")}
                >
                  Esqueci minha senha
                </button>
                <button type="button" className="link-button" onClick={handleResendVerification}>
                  Reenviar verificacao
                </button>
              </div>
              {authInfo && <p className="success">{authInfo}</p>}
              {authError && <p className="error">{authError}</p>}
            </form>
            <div className="auth-switch">
              <span>Não tem conta?</span>
              <button type="button" className="link-button" onClick={() => setAuthRoute("register")}>
                Cadastre-se
              </button>
            </div>
          </section>
        ) : authView === "register" ? (
          <section className="card auth-card">
            <h2>Criar conta</h2>
            <p className="muted">Leva menos de 2 minutos.</p>
            <form onSubmit={handleRegister} className="form-grid">
              <label>
                <span>Nome completo</span>
                <input
                  value={registerNome}
                  onChange={(e) => setRegisterNome(e.target.value)}
                  placeholder="Seu nome"
                  required
                />
              </label>
              <label>
                <span>Email</span>
                <input
                  type="email"
                  value={registerEmail}
                  onChange={(e) => setRegisterEmail(e.target.value)}
                  placeholder="voce@empresa.com"
                  required
                />
              </label>
              <label>
                <span>Senha</span>
                <input
                  type="password"
                  value={registerSenha}
                  onChange={(e) => setRegisterSenha(e.target.value)}
                  placeholder="Crie uma senha"
                  required
                />
              </label>
              <label>
                <span>Confirmar senha</span>
                <input
                  type="password"
                  value={registerSenhaConfirm}
                  onChange={(e) => setRegisterSenhaConfirm(e.target.value)}
                  placeholder="Repita a senha"
                  required
                />
              </label>
              <label>
                <span>Perfil</span>
                <select
                  value={registerRole}
                  onChange={(e) => {
                    const value = e.target.value as "ADMINISTRADORA" | "SINDICO";
                    setRegisterRole(value);
                  }}
                >
                  <option value="ADMINISTRADORA">Administradora</option>
                  <option value="SINDICO">Síndico</option>
                </select>
              </label>
              {registerRole === "ADMINISTRADORA" ? (
                <label>
                  <span>Nome da administradora</span>
                  <input
                    value={registerAdminNome}
                    onChange={(e) => setRegisterAdminNome(e.target.value)}
                    placeholder="Administradora Exemplo"
                    required
                  />
                </label>
              ) : (
                <label>
                  <span>Nome do condomínio</span>
                  <input
                    value={registerCondoNome}
                    onChange={(e) => setRegisterCondoNome(e.target.value)}
                    placeholder="Condomínio Exemplo"
                    required
                  />
                </label>
              )}
              <div className="actions">
                <button className="primary" type="submit" disabled={registerLoading}>
                  {registerLoading ? "Cadastrando..." : "Cadastre-se"}
                </button>
                <button
                  className="ghost"
                  type="button"
                  onClick={() => setAuthRoute("login")}
                >
                  Já tenho conta
                </button>
              </div>
              {registerVerifyLink && (
                <p className="success">
                  Para testes:{" "}
                  <a className="inline-link" href={registerVerifyLink}>
                    Verificar email
                  </a>
                </p>
              )}
              {registerInfo && <p className="success">{registerInfo}</p>}
              {registerError && <p className="error">{registerError}</p>}
            </form>
          </section>
        ) : authView === "reset-request" ? (
          <section className="card auth-card">
            <h2>Recuperar senha</h2>
            <p className="muted">Enviaremos um link para redefinir sua senha.</p>
            <form onSubmit={handleResetRequest} className="form-grid">
              <label>
                <span>Email</span>
                <input
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="voce@empresa.com"
                  required
                />
              </label>
              <div className="actions">
                <button className="primary" type="submit" disabled={resetLoading}>
                  {resetLoading ? "Enviando..." : "Enviar link"}
                </button>
                <button className="ghost" type="button" onClick={() => setAuthRoute("login")}>
                  Voltar
                </button>
              </div>
              {resetInfo && (
                <p className="success">
                  {resetInfo}{" "}
                  {resetInfo.includes("http") && (
                    <a className="inline-link" href={resetInfo.replace("Link de redefinicao: ", "")}>
                      Abrir link
                    </a>
                  )}
                </p>
              )}
              {resetError && <p className="error">{resetError}</p>}
            </form>
          </section>
        ) : (
          <section className="card auth-card">
            <h2>Nova senha</h2>
            <p className="muted">Defina uma nova senha para sua conta.</p>
            <form onSubmit={handleResetPassword} className="form-grid">
              <label>
                <span>Token</span>
                <input
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                  placeholder="Cole o token"
                  required
                />
              </label>
              <label>
                <span>Nova senha</span>
                <input
                  type="password"
                  value={resetSenha}
                  onChange={(e) => setResetSenha(e.target.value)}
                  placeholder="Nova senha"
                  required
                />
              </label>
              <label>
                <span>Confirmar senha</span>
                <input
                  type="password"
                  value={resetSenhaConfirm}
                  onChange={(e) => setResetSenhaConfirm(e.target.value)}
                  placeholder="Repita a nova senha"
                  required
                />
              </label>
              <div className="actions">
                <button className="primary" type="submit" disabled={resetLoading}>
                  {resetLoading ? "Salvando..." : "Atualizar senha"}
                </button>
                <button className="ghost" type="button" onClick={() => setAuthRoute("login")}>
                  Voltar
                </button>
              </div>
              {resetInfo && <p className="success">{resetInfo}</p>}
              {resetError && <p className="error">{resetError}</p>}
            </form>
          </section>
        )
      ) : user && !user.onboarded ? (
        <section className="card auth-card">
          <h2>Finalize seu cadastro</h2>
          <p className="muted">Escolha um plano e conclua a configuracao inicial.</p>
          <form onSubmit={handleOnboarding} className="form-grid">
            <label>
              <span>Plano</span>
              <select
                value={onboardingPlan}
                onChange={(e) =>
                  setOnboardingPlan(
                    e.target.value as "FREEMIUM" | "ESSENCIAL" | "PROFISSIONAL" | "ESCALA"
                  )
                }
              >
                <option value="FREEMIUM">Freemium</option>
                <option value="ESSENCIAL">Essencial</option>
                <option value="PROFISSIONAL">Profissional</option>
                <option value="ESCALA">Escala</option>
              </select>
            </label>
            {user.role === "ADMINISTRADORA" ? (
              <label>
                <span>Nome do primeiro condominio</span>
                <input
                  value={onboardingCondoNome}
                  onChange={(e) => setOnboardingCondoNome(e.target.value)}
                  placeholder="Condominio Exemplo"
                  required
                />
              </label>
            ) : (
              <label>
                <span>Nome do condominio</span>
                <input
                  value={onboardingCondoNome}
                  onChange={(e) => setOnboardingCondoNome(e.target.value)}
                  placeholder="Condominio Exemplo"
                />
              </label>
            )}
            <div className="actions">
              <button className="primary" type="submit" disabled={onboardingLoading}>
                {onboardingLoading ? "Concluindo..." : "Concluir cadastro"}
              </button>
            </div>
            {onboardingError && <p className="error">{onboardingError}</p>}
          </form>
        </section>
      ) : (
        <main className="grid">
          <section className="card">
            <div className="card-header">
              <div>
                <h2>Dashboard do mes</h2>
                <p className="muted">
                  {selectedCondominio
                    ? `Condominio: ${selectedCondominio.nome}`
                    : "Selecione um condominio"}
                </p>
              </div>
            </div>

            {selectedCondominio ? (
              <>
                {kpiLoading && <p className="muted">Carregando KPIs...</p>}
                <div className="summary">
                  <div className="summary-item">
                    <span>Periodo</span>
                    <strong>{kpiLabel || "Mes atual"}</strong>
                  </div>
                  <div className="summary-item">
                    <span>Receitas</span>
                    <strong>{formatCurrency(kpiResumo.receitas)}</strong>
                  </div>
                  <div className="summary-item">
                    <span>Despesas</span>
                    <strong>{formatCurrency(kpiResumo.despesas)}</strong>
                  </div>
                  <div className="summary-item saldo">
                    <span>Saldo</span>
                    <strong>{formatCurrency(kpiResumo.saldo)}</strong>
                  </div>
                  <div className="summary-item">
                    <span>Total</span>
                    <strong>{kpiResumo.total}</strong>
                  </div>
                </div>
              </>
            ) : (
              <p className="muted">Selecione um condominio para ver os KPIs do mes.</p>
            )}
          </section>
          <section className="card">
            <div className="card-header">
              <div>
                <h2>Condominios</h2>
                <p className="muted">
                  Total: {filteredCondominios.length} / {condominios.length}
                </p>
              </div>
              <button className="ghost" onClick={loadCondominios} disabled={loadingCondominios}>
                Atualizar
              </button>
            </div>

            <div className="search-row">
              <input
                className="search"
                value={condoSearch}
                onChange={(e) => setCondoSearch(e.target.value)}
                placeholder="Buscar condominio por nome, CNPJ ou endereco"
              />
            </div>

            {canEdit ? (
              <form onSubmit={handleCondominioSubmit} className="form-grid">
                <label>
                  <span>Nome</span>
                  <input
                    value={condoNome}
                    onChange={(e) => setCondoNome(e.target.value)}
                    placeholder="Residencial Aurora"
                    required
                  />
                </label>
                <label>
                  <span>CNPJ (opcional)</span>
                  <input
                    value={condoCnpj}
                    onChange={(e) => setCondoCnpj(e.target.value)}
                    placeholder="00.000.000/0000-00"
                  />
                </label>
                <label>
                  <span>Endereco (opcional)</span>
                  <input
                    value={condoEndereco}
                    onChange={(e) => setCondoEndereco(e.target.value)}
                    placeholder="Rua das Flores, 123"
                  />
                </label>
                <div className="actions">
                  <button className="primary" type="submit" disabled={savingCondo}>
                    {savingCondo ? "Salvando..." : isEditingCondo ? "Atualizar" : "Criar"}
                  </button>
                  {isEditingCondo && (
                    <button className="ghost" type="button" onClick={resetCondominioForm}>
                      Cancelar
                    </button>
                  )}
                </div>
                {condoError && <p className="error">{condoError}</p>}
              </form>
            ) : (
              <p className="muted">Acesso somente leitura para sindicos.</p>
            )}

            {loadingCondominios && <p>Carregando...</p>}
            {!loadingCondominios && condominios.length === 0 && (
              <p className="muted">Nenhum condominio cadastrado.</p>
            )}
            {!loadingCondominios && condominios.length > 0 && filteredCondominios.length === 0 && (
              <p className="muted">Nenhum resultado para o filtro.</p>
            )}

            <ul className="list">
              {filteredCondominios.map((item) => (
                <li
                  key={item.id}
                  className={`list-item ${selectedCondominio?.id === item.id ? "selected" : ""}`}
                >
                  <div>
                    <div className="item-title">{item.nome}</div>
                    <div className="item-sub">
                      {item.endereco || "Sem endereco"}
                      {item.cnpj ? ` • ${item.cnpj}` : ""}
                    </div>
                  </div>
                  <div className="item-actions">
                    <button className="ghost" onClick={() => selectCondominio(item)}>
                      Selecionar
                    </button>
                    {canEdit && (
                      <>
                        <button className="ghost" onClick={() => startEditCondominio(item)}>
                          Editar
                        </button>
                        <button className="danger" onClick={() => removeCondominio(item)}>
                          Excluir
                        </button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="card">
            <div className="card-header">
              <div>
                <h2>Unidades</h2>
                <p className="muted">
                  {selectedCondominio ? `Condominio: ${selectedCondominio.nome}` : "Selecione um condominio"}
                </p>
              </div>
              {selectedCondominio && (
                <div className="card-actions">
                  <button
                    className="ghost"
                    onClick={exportUnidadesCsv}
                    disabled={filteredUnidades.length === 0}
                  >
                    Exportar CSV
                  </button>
                  <button
                    className="ghost"
                    onClick={() => loadUnidades(selectedCondominio.id)}
                    disabled={loadingUnidades}
                  >
                    Atualizar
                  </button>
                </div>
              )}
            </div>

            <div className="search-row">
              <input
                className="search"
                value={unidadeSearch}
                onChange={(e) => setUnidadeSearch(e.target.value)}
                placeholder="Buscar unidade por identificador ou tipo"
                disabled={!selectedCondominio}
              />
            </div>

            {selectedCondominio && canEdit ? (
              <form onSubmit={handleUnidadeSubmit} className="form-grid">
                <label>
                  <span>Identificador</span>
                  <input
                    value={unidadeIdentificador}
                    onChange={(e) => setUnidadeIdentificador(e.target.value)}
                    placeholder="Apto 101"
                    required
                  />
                </label>
                <label>
                  <span>Tipo (opcional)</span>
                  <input
                    value={unidadeTipo}
                    onChange={(e) => setUnidadeTipo(e.target.value)}
                    placeholder="Apartamento"
                  />
                </label>
                <div className="actions">
                  <button className="primary" type="submit" disabled={savingUnidade}>
                    {savingUnidade ? "Salvando..." : isEditingUnidade ? "Atualizar" : "Criar"}
                  </button>
                  {isEditingUnidade && (
                    <button className="ghost" type="button" onClick={resetUnidadeForm}>
                      Cancelar
                    </button>
                  )}
                </div>
                {unidadeError && <p className="error">{unidadeError}</p>}
              </form>
            ) : selectedCondominio ? (
              <p className="muted">Acesso somente leitura para sindicos.</p>
            ) : (
              <p className="muted">Selecione um condominio para ver as unidades.</p>
            )}

            {loadingUnidades && <p>Carregando...</p>}
            {!loadingUnidades && selectedCondominio && unidades.length === 0 && (
              <p className="muted">Nenhuma unidade cadastrada.</p>
            )}
            {!loadingUnidades &&
              selectedCondominio &&
              unidades.length > 0 &&
              filteredUnidades.length === 0 && <p className="muted">Nenhum resultado para o filtro.</p>}

            <ul className="list">
              {filteredUnidades.map((item) => (
                <li
                  key={item.id}
                  className={`list-item ${selectedUnidade?.id === item.id ? "selected" : ""}`}
                >
                  <div>
                    <div className="item-title">{item.identificador}</div>
                    <div className="item-sub">{item.tipo || "Sem tipo"}</div>
                  </div>
                  <div className="item-actions">
                    <button className="ghost" onClick={() => selectUnidade(item)}>
                      Selecionar
                    </button>
                    {canEdit && (
                      <>
                        <button className="ghost" onClick={() => startEditUnidade(item)}>
                          Editar
                        </button>
                        <button className="danger" onClick={() => removeUnidade(item)}>
                          Excluir
                        </button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="card">
            <div className="card-header">
              <div>
                <h2>Moradores</h2>
                <p className="muted">
                  {selectedUnidade
                    ? `Unidade: ${selectedUnidade.identificador}`
                    : "Selecione uma unidade"}
                </p>
              </div>
              {selectedUnidade && (
                <div className="card-actions">
                  <button
                    className="ghost"
                    onClick={exportMoradoresCsv}
                    disabled={filteredMoradores.length === 0}
                  >
                    Exportar CSV
                  </button>
                  <button className="ghost" onClick={() => loadMoradores(selectedUnidade.id)}>
                    Atualizar
                  </button>
                </div>
              )}
            </div>

            <div className="search-row">
              <input
                className="search"
                value={moradorSearch}
                onChange={(e) => setMoradorSearch(e.target.value)}
                placeholder="Buscar morador por nome, documento ou contato"
                disabled={!selectedUnidade}
              />
            </div>

            {selectedUnidade && canEdit ? (
              <form onSubmit={handleMoradorSubmit} className="form-grid">
                <label>
                  <span>Nome</span>
                  <input
                    value={moradorNome}
                    onChange={(e) => setMoradorNome(e.target.value)}
                    placeholder="Nome completo"
                    required
                  />
                </label>
                <label>
                  <span>Documento (opcional)</span>
                  <input
                    value={moradorDocumento}
                    onChange={(e) => setMoradorDocumento(e.target.value)}
                    placeholder="CPF"
                  />
                </label>
                <label>
                  <span>Contato (opcional)</span>
                  <input
                    value={moradorContato}
                    onChange={(e) => setMoradorContato(e.target.value)}
                    placeholder="Telefone ou email"
                  />
                </label>
                <div className="actions">
                  <button className="primary" type="submit" disabled={savingMorador}>
                    {savingMorador ? "Salvando..." : isEditingMorador ? "Atualizar" : "Criar"}
                  </button>
                  {isEditingMorador && (
                    <button className="ghost" type="button" onClick={resetMoradorForm}>
                      Cancelar
                    </button>
                  )}
                </div>
                {moradorError && <p className="error">{moradorError}</p>}
              </form>
            ) : selectedUnidade ? (
              <p className="muted">Acesso somente leitura para sindicos.</p>
            ) : (
              <p className="muted">Selecione uma unidade para ver os moradores.</p>
            )}

            {loadingMoradores && <p>Carregando...</p>}
            {!loadingMoradores && selectedUnidade && moradores.length === 0 && (
              <p className="muted">Nenhum morador cadastrado.</p>
            )}
            {!loadingMoradores &&
              selectedUnidade &&
              moradores.length > 0 &&
              filteredMoradores.length === 0 && <p className="muted">Nenhum resultado para o filtro.</p>}

            <ul className="list">
              {filteredMoradores.map((item) => (
                <li key={item.id} className="list-item">
                  <div>
                    <div className="item-title">{item.nome}</div>
                    <div className="item-sub">
                      {item.documento || "Sem documento"}
                      {item.contato ? ` • ${item.contato}` : ""}
                    </div>
                  </div>
                  {canEdit && (
                    <div className="item-actions">
                      <button className="ghost" onClick={() => startEditMorador(item)}>
                        Editar
                      </button>
                      <button className="danger" onClick={() => removeMorador(item)}>
                        Excluir
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className="card">
            <div className="card-header">
              <div>
                <h2>Lancamentos</h2>
                <p className="muted">
                  {selectedCondominio ? `Condominio: ${selectedCondominio.nome}` : "Selecione um condominio"}
                </p>
              </div>
              {selectedCondominio && (
                <div className="card-actions">
                  <button
                    className="ghost"
                    onClick={exportLancamentosCsv}
                    disabled={filteredLancamentos.length === 0}
                  >
                    Exportar CSV
                  </button>
                  <button
                    className="ghost"
                  onClick={() =>
                    loadLancamentos(
                      selectedCondominio.id,
                      lancamentoPeriodo,
                      lancamentoInicio,
                      lancamentoFim
                    )
                  }
                  >
                    Atualizar
                  </button>
                </div>
              )}
            </div>

            <div className="filters">
              <div className="filter-group">
                <label>
                  <span>Periodo</span>
                  <input
                    type="month"
                    value={lancamentoPeriodo}
                    onChange={(e) => handleLancamentoPeriodoChange(e.target.value)}
                    disabled={!selectedCondominio}
                  />
                </label>
                <button
                  className="ghost"
                  type="button"
                  onClick={clearLancamentoPeriodo}
                  disabled={
                    !selectedCondominio ||
                    (!lancamentoPeriodo && !lancamentoInicio && !lancamentoFim)
                  }
                >
                  Limpar
                </button>
              </div>
              <div className="filter-group">
                <label>
                  <span>Inicio</span>
                  <input
                    type="date"
                    value={lancamentoInicio}
                    onChange={(e) => handleLancamentoInicioChange(e.target.value)}
                    disabled={!selectedCondominio}
                  />
                </label>
                <label>
                  <span>Fim</span>
                  <input
                    type="date"
                    value={lancamentoFim}
                    onChange={(e) => handleLancamentoFimChange(e.target.value)}
                    disabled={!selectedCondominio}
                  />
                </label>
              </div>
              <div className="summary">
                <div className="summary-item">
                  <span>Receitas</span>
                  <strong>{formatCurrency(resumoLancamentos.receitas)}</strong>
                </div>
                <div className="summary-item">
                  <span>Despesas</span>
                  <strong>{formatCurrency(resumoLancamentos.despesas)}</strong>
                </div>
                <div className="summary-item saldo">
                  <span>Saldo</span>
                  <strong>{formatCurrency(resumoLancamentos.saldo)}</strong>
                </div>
                <div className="summary-item">
                  <span>Total</span>
                  <strong>{resumoLancamentos.total}</strong>
                </div>
              </div>
            </div>

            <div className="search-row">
              <input
                className="search"
                value={lancamentoSearch}
                onChange={(e) => setLancamentoSearch(e.target.value)}
                placeholder="Buscar por tipo, categoria, descricao ou valor"
                disabled={!selectedCondominio}
              />
            </div>

            {selectedCondominio && canEdit ? (
              <form onSubmit={handleLancamentoSubmit} className="form-grid">
                <label>
                  <span>Tipo</span>
                  <select
                    value={lancamentoTipo}
                    onChange={(e) => setLancamentoTipo(e.target.value as "RECEITA" | "DESPESA")}
                  >
                    <option value="DESPESA">Despesa</option>
                    <option value="RECEITA">Receita</option>
                  </select>
                </label>
                <label>
                  <span>Valor</span>
                  <input
                    value={lancamentoValor}
                    onChange={(e) => setLancamentoValor(e.target.value)}
                    placeholder="0,00"
                    required
                  />
                </label>
                <label>
                  <span>Data</span>
                  <input
                    type="date"
                    value={lancamentoData}
                    onChange={(e) => setLancamentoData(e.target.value)}
                    required
                  />
                </label>
                <label>
                  <span>Categoria (opcional)</span>
                  <input
                    value={lancamentoCategoria}
                    onChange={(e) => setLancamentoCategoria(e.target.value)}
                    placeholder="Manutencao"
                  />
                </label>
                <label>
                  <span>Descricao (opcional)</span>
                  <input
                    value={lancamentoDescricao}
                    onChange={(e) => setLancamentoDescricao(e.target.value)}
                    placeholder="Troca de lampadas"
                  />
                </label>
                <div className="actions">
                  <button className="primary" type="submit" disabled={savingLancamento}>
                    {savingLancamento ? "Salvando..." : isEditingLancamento ? "Atualizar" : "Criar"}
                  </button>
                  {isEditingLancamento && (
                    <button className="ghost" type="button" onClick={resetLancamentoForm}>
                      Cancelar
                    </button>
                  )}
                </div>
                {lancamentoError && <p className="error">{lancamentoError}</p>}
              </form>
            ) : selectedCondominio ? (
              <p className="muted">Acesso somente leitura para sindicos.</p>
            ) : (
              <p className="muted">Selecione um condominio para ver os lancamentos.</p>
            )}

            {loadingLancamentos && <p>Carregando...</p>}
            {!loadingLancamentos && selectedCondominio && lancamentos.length === 0 && (
              <p className="muted">Nenhum lancamento cadastrado.</p>
            )}
            {!loadingLancamentos &&
              selectedCondominio &&
              lancamentos.length > 0 &&
              filteredLancamentos.length === 0 && <p className="muted">Nenhum resultado para o filtro.</p>}

            <ul className="list">
              {filteredLancamentos.map((item) => (
                <li key={item.id} className="list-item">
                  <div className="lancamento-row">
                    <div>
                      <div className="item-title">{item.categoria || "Sem categoria"}</div>
                      <div className="item-sub">{item.descricao || "Sem descricao"}</div>
                      <div className="item-sub">{formatDate(item.data)}</div>
                    </div>
                    <div className="lancamento-meta">
                      <span className={`pill ${item.tipo === "RECEITA" ? "receita" : "despesa"}`}>
                        {item.tipo === "RECEITA" ? "Receita" : "Despesa"}
                      </span>
                      <span className="valor">{formatCurrency(item.valor)}</span>
                    </div>
                  </div>
                  {canEdit && (
                    <div className="item-actions">
                      <button className="ghost" onClick={() => startEditLancamento(item)}>
                        Editar
                      </button>
                      <button className="danger" onClick={() => removeLancamento(item)}>
                        Excluir
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </main>
      )}
    </div>
  );
}
