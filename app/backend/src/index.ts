import "dotenv/config";
import express from "express";
import cors from "cors";
import { createHash, randomBytes } from "crypto";
import prisma from "./db.js";
import { hashPassword, requireAuth, signToken, signState, verifyPassword, verifyState } from "./auth.js";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

function buildGoogleAuthUrl(state: string) {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_REDIRECT_URI) {
    return null;
  }
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account"
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

const app = express();
const port = Number(process.env.PORT || 3001);
const corsOrigin = process.env.CORS_ORIGIN || "*";
const appBaseUrl =
  process.env.APP_BASE_URL || (corsOrigin !== "*" ? corsOrigin : "http://localhost:5173");
const isProduction = process.env.NODE_ENV === "production";

app.use(cors({ origin: corsOrigin }));
app.use(express.json());

const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 8;
const loginAttempts = new Map<string, { count: number; firstAt: number }>();

function generateToken() {
  return randomBytes(32).toString("hex");
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function buildVerifyLink(token: string) {
  return `${appBaseUrl}/?verify=${token}`;
}

function buildResetLink(token: string) {
  return `${appBaseUrl}/?reset=${token}`;
}

function logAuthLink(kind: "verify" | "reset", email: string, link: string) {
  console.log(`[auth:${kind}] ${email} -> ${link}`);
}

function isRateLimited(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const current = loginAttempts.get(key);
  if (!current || now - current.firstAt > windowMs) {
    loginAttempts.set(key, { count: 1, firstAt: now });
    return false;
  }
  current.count += 1;
  loginAttempts.set(key, current);
  return current.count > limit;
}

function isAdminOrOperator(user: any) {
  return user && (user.role === "ADMINISTRADORA" || user.role === "OPERADOR");
}

function canAccessCondominio(user: any, condominio: { id: string; administradoraId?: string | null }) {
  if (!user) return false;
  if (user.role === "SINDICO") {
    return user.condominioId === condominio.id;
  }
  if (user.administradoraId) {
    return condominio.administradoraId === user.administradoraId;
  }
  return false;
}

async function getCondominioOrNull(id: string) {
  if (!id) return null;
  return prisma.condominio.findUnique({ where: { id } });
}

function parseDecimalInput(value: unknown) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = raw.replace(",", ".");
  const num = Number(normalized);
  if (Number.isNaN(num)) return null;
  return normalized;
}

function parseDateInput(value: unknown) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const date = raw.length === 10 ? new Date(`${raw}T00:00:00`) : new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get("/", (_req, res) => {
  res.json({ ok: true, service: "admg-backend", time: new Date().toISOString() });
});

app.post("/auth/register", async (req, res) => {
  const nome = String(req.body?.nome || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const senha = String(req.body?.senha || "");
  const role = String(req.body?.role || "").trim().toUpperCase();
  const administradoraNome = String(req.body?.administradoraNome || "").trim();
  const condominioNome = String(req.body?.condominioNome || "").trim();

  if (!nome || !email || !senha) {
    return res.status(400).json({ error: "dados_obrigatorios" });
  }
  if (senha.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: "senha_fraca" });
  }

  if (role !== "ADMINISTRADORA" && role !== "SINDICO") {
    return res.status(400).json({ error: "role_invalida" });
  }

  if (role === "ADMINISTRADORA" && !administradoraNome) {
    return res.status(400).json({ error: "administradora_obrigatoria" });
  }

  if (role === "SINDICO" && !condominioNome) {
    return res.status(400).json({ error: "condominio_obrigatorio" });
  }

  try {
    const existing = await prisma.usuario.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: "email_em_uso" });
    }

    const senhaHash = await hashPassword(senha);
    const verificationToken = generateToken();
    const verificationHash = hashToken(verificationToken);
    const verificationExpires = new Date(Date.now() + EMAIL_VERIFY_TTL_MS);
    let user;

    if (role === "ADMINISTRADORA") {
      const administradora = await prisma.administradora.create({
        data: { nome: administradoraNome }
      });
      user = await prisma.usuario.create({
        data: {
          nome,
          email,
          senhaHash,
          role: "ADMINISTRADORA",
          administradoraId: administradora.id,
          emailVerificationToken: verificationHash,
          emailVerificationExpires: verificationExpires
        }
      });
    } else {
      const condominio = await prisma.condominio.create({
        data: { nome: condominioNome }
      });
      user = await prisma.usuario.create({
        data: {
          nome,
          email,
          senhaHash,
          role: "SINDICO",
          condominioId: condominio.id,
          emailVerificationToken: verificationHash,
          emailVerificationExpires: verificationExpires
        }
      });
    }

    const verifyLink = buildVerifyLink(verificationToken);
    logAuthLink("verify", email, verifyLink);

    res.status(201).json({
      verificationRequired: true,
      verificationToken: isProduction ? undefined : verificationToken
    });
  } catch (err: any) {
    if (err?.code === "P2002") {
      return res.status(409).json({ error: "email_em_uso" });
    }
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

app.post("/auth/verify-email", async (req, res) => {
  const token = String(req.body?.token || "").trim();
  if (!token) {
    return res.status(400).json({ error: "token_invalido" });
  }

  const tokenHash = hashToken(token);
  try {
    const user = await prisma.usuario.findFirst({
      where: {
        emailVerificationToken: tokenHash,
        emailVerificationExpires: { gt: new Date() }
      }
    });

    if (!user) {
      return res.status(400).json({ error: "token_invalido" });
    }

    const updated = await prisma.usuario.update({
      where: { id: user.id },
      data: {
        emailVerificado: true,
        emailVerificationToken: null,
        emailVerificationExpires: null
      }
    });

    const jwt = signToken({
      id: updated.id,
      role: updated.role,
      administradoraId: updated.administradoraId,
      condominioId: updated.condominioId
    });

    res.json({
      token: jwt,
      user: {
        id: updated.id,
        nome: updated.nome,
        email: updated.email,
        role: updated.role,
        administradoraId: updated.administradoraId,
        condominioId: updated.condominioId,
        authProvider: updated.authProvider,
        avatarUrl: updated.avatarUrl,
        googleId: updated.googleId,
        plano: updated.plano,
        onboarded: updated.onboarded,
        emailVerificado: updated.emailVerificado
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

app.post("/auth/resend-verification", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!email) {
    return res.status(400).json({ error: "email_obrigatorio" });
  }

  try {
    const user = await prisma.usuario.findUnique({ where: { email } });
    if (!user || user.emailVerificado || user.authProvider !== "LOCAL") {
      return res.json({ ok: true });
    }

    const verificationToken = generateToken();
    const verificationHash = hashToken(verificationToken);
    const verificationExpires = new Date(Date.now() + EMAIL_VERIFY_TTL_MS);

    await prisma.usuario.update({
      where: { id: user.id },
      data: {
        emailVerificationToken: verificationHash,
        emailVerificationExpires: verificationExpires
      }
    });

    const verifyLink = buildVerifyLink(verificationToken);
    logAuthLink("verify", email, verifyLink);

    res.json({
      ok: true,
      verificationToken: isProduction ? undefined : verificationToken
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

app.post("/auth/request-reset", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!email) {
    return res.status(400).json({ error: "email_obrigatorio" });
  }

  try {
    const user = await prisma.usuario.findUnique({ where: { email } });
    if (!user || user.authProvider !== "LOCAL") {
      return res.json({ ok: true });
    }

    const resetToken = generateToken();
    const resetHash = hashToken(resetToken);
    const resetExpires = new Date(Date.now() + RESET_TTL_MS);

    await prisma.usuario.update({
      where: { id: user.id },
      data: {
        passwordResetToken: resetHash,
        passwordResetExpires: resetExpires
      }
    });

    const resetLink = buildResetLink(resetToken);
    logAuthLink("reset", email, resetLink);

    res.json({
      ok: true,
      resetToken: isProduction ? undefined : resetToken
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

app.post("/auth/reset-password", async (req, res) => {
  const token = String(req.body?.token || "").trim();
  const senha = String(req.body?.senha || "");
  if (!token || !senha) {
    return res.status(400).json({ error: "dados_obrigatorios" });
  }
  if (senha.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: "senha_fraca" });
  }

  try {
    const tokenHash = hashToken(token);
    const user = await prisma.usuario.findFirst({
      where: {
        passwordResetToken: tokenHash,
        passwordResetExpires: { gt: new Date() }
      }
    });

    if (!user) {
      return res.status(400).json({ error: "token_invalido" });
    }

    const senhaHash = await hashPassword(senha);
    await prisma.usuario.update({
      where: { id: user.id },
      data: {
        senhaHash,
        passwordResetToken: null,
        passwordResetExpires: null
      }
    });

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

app.post("/auth/login", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const senha = String(req.body?.senha || "");

  if (!email || !senha) {
    return res.status(400).json({ error: "credenciais_invalidas" });
  }

  try {
    const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown")
      .split(",")[0]
      .trim();
    const rateKey = `${ip}:${email}`;
    if (isRateLimited(rateKey, 10, 15 * 60 * 1000)) {
      return res.status(429).json({ error: "muitas_tentativas" });
    }

    const user = await prisma.usuario.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: "credenciais_invalidas" });
    }

    if (user.authProvider === "LOCAL" && !user.emailVerificado) {
      return res.status(403).json({ error: "email_nao_verificado" });
    }

    const ok = await verifyPassword(senha, user.senhaHash);
    if (!ok) {
      return res.status(401).json({ error: "credenciais_invalidas" });
    }

    const token = signToken({
      id: user.id,
      role: user.role,
      administradoraId: user.administradoraId,
      condominioId: user.condominioId
    });
    loginAttempts.delete(rateKey);

    res.json({
      token,
      user: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        role: user.role,
        administradoraId: user.administradoraId,
        condominioId: user.condominioId,
        authProvider: user.authProvider,
        avatarUrl: user.avatarUrl,
        googleId: user.googleId,
        plano: user.plano,
        onboarded: user.onboarded,
        emailVerificado: user.emailVerificado
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

app.get("/auth/me", requireAuth, async (req, res) => {
  try {
    const user = await prisma.usuario.findUnique({
      where: { id: req.user?.id },
      select: {
        id: true,
        nome: true,
        email: true,
        role: true,
        administradoraId: true,
        condominioId: true,
        avatarUrl: true,
        authProvider: true,
        googleId: true,
        plano: true,
        onboarded: true,
        emailVerificado: true
      }
    });
    if (!user) {
      return res.status(404).json({ error: "nao_encontrado" });
    }
    res.json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

app.post("/auth/onboarding", requireAuth, async (req, res) => {
  const plano = String(req.body?.plano || "FREEMIUM").trim().toUpperCase();
  const condominioNome = String(req.body?.condominioNome || "").trim();
  const planosValidos = ["FREEMIUM", "ESSENCIAL", "PROFISSIONAL", "ESCALA"];

  if (!planosValidos.includes(plano)) {
    return res.status(400).json({ error: "plano_invalido" });
  }

  try {
    const user = await prisma.usuario.findUnique({
      where: { id: req.user?.id },
      select: {
        id: true,
        role: true,
        administradoraId: true,
        condominioId: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: "nao_encontrado" });
    }

    if (user.role === "ADMINISTRADORA") {
      if (!user.administradoraId) {
        return res.status(400).json({ error: "administradora_invalida" });
      }
      if (!condominioNome) {
        return res.status(400).json({ error: "condominio_obrigatorio" });
      }
      const condoCount = await prisma.condominio.count({
        where: { administradoraId: user.administradoraId }
      });
      if (condoCount === 0) {
        await prisma.condominio.create({
          data: {
            nome: condominioNome,
            administradoraId: user.administradoraId
          }
        });
      }
    } else if (user.role === "SINDICO") {
      if (condominioNome && user.condominioId) {
        await prisma.condominio.update({
          where: { id: user.condominioId },
          data: { nome: condominioNome }
        });
      }
    }

    const planoNormalized = plano as "FREEMIUM" | "ESSENCIAL" | "PROFISSIONAL" | "ESCALA";
    const updated = await prisma.usuario.update({
      where: { id: user.id },
      data: {
        plano: planoNormalized,
        onboarded: true
      }
    });

    res.json({
      user: {
        id: updated.id,
        nome: updated.nome,
        email: updated.email,
        role: updated.role,
        administradoraId: updated.administradoraId,
        condominioId: updated.condominioId,
        authProvider: updated.authProvider,
        avatarUrl: updated.avatarUrl,
        googleId: updated.googleId,
        plano: updated.plano,
        onboarded: updated.onboarded,
        emailVerificado: updated.emailVerificado
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

app.get("/auth/google", async (req, res) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_REDIRECT_URI) {
    return res.status(500).json({ error: "google_config_invalida" });
  }

  const redirect = String(req.query?.redirect || "").trim();
  const redirectTo = redirect || process.env.CORS_ORIGIN || "http://localhost:5173";
  const state = signState({ redirect: redirectTo, mode: "login" });
  const url = buildGoogleAuthUrl(state);
  if (!url) {
    return res.status(500).json({ error: "google_config_invalida" });
  }

  res.redirect(url);
});

app.post("/auth/google/link", requireAuth, async (req, res) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_REDIRECT_URI) {
    return res.status(500).json({ error: "google_config_invalida" });
  }

  const redirect = String(req.body?.redirect || "").trim();
  const redirectTo = redirect || process.env.CORS_ORIGIN || "http://localhost:5173";
  const state = signState({ redirect: redirectTo, mode: "link", userId: req.user?.id });
  const url = buildGoogleAuthUrl(state);

  if (!url) {
    return res.status(500).json({ error: "google_config_invalida" });
  }

  res.json({ url });
});

app.get("/auth/google/callback", async (req, res) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    return res.status(500).json({ error: "google_config_invalida" });
  }

  const code = String(req.query?.code || "").trim();
  const state = String(req.query?.state || "").trim();
  if (!code) {
    return res.status(400).json({ error: "codigo_invalido" });
  }

  let redirectTo = process.env.CORS_ORIGIN || "http://localhost:5173";
  let mode: string | null = null;
  let linkUserId: string | null = null;
  if (state) {
    try {
      const payload = verifyState(state);
      if (payload && typeof payload.redirect === "string") {
        redirectTo = payload.redirect;
      }
      if (payload && typeof payload.mode === "string") {
        mode = payload.mode;
      }
      if (payload && typeof payload.userId === "string") {
        linkUserId = payload.userId;
      }
    } catch (_err) {
      // ignore invalid state, use default redirect
    }
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code",
        code
      })
    });
    const tokenBody = await tokenRes.json();
    if (!tokenRes.ok) {
      console.error("Google token error", tokenBody);
      return res.redirect(`${redirectTo}/?error=google_token`);
    }

    const userRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokenBody.access_token}` }
    });
    const userInfo = await userRes.json();
    if (!userRes.ok) {
      console.error("Google userinfo error", userInfo);
      return res.redirect(`${redirectTo}/?error=google_userinfo`);
    }

    const email = String(userInfo.email || "").trim().toLowerCase();
    const nome = String(userInfo.name || userInfo.given_name || "Usuario").trim();
    const googleId = String(userInfo.sub || "").trim();
    const avatarUrl = userInfo.picture ? String(userInfo.picture).trim() : null;

    if (!email) {
      return res.redirect(`${redirectTo}/?error=google_sem_email`);
    }

    let user = googleId ? await prisma.usuario.findUnique({ where: { googleId } }) : null;
    if (!user) {
      user = await prisma.usuario.findUnique({ where: { email } });
    }

    if (mode === "link" && linkUserId) {
      const linkUser = await prisma.usuario.findUnique({ where: { id: linkUserId } });
      if (!linkUser) {
        return res.redirect(`${redirectTo}/?error=google_link_user_not_found`);
      }
      if (user && user.id !== linkUser.id) {
        return res.redirect(`${redirectTo}/?error=google_linked_to_other`);
      }

      await prisma.usuario.update({
        where: { id: linkUser.id },
        data: {
          authProvider: "GOOGLE",
          googleId: googleId || linkUser.googleId,
          avatarUrl,
          emailVerificado: true
        }
      });

      return res.redirect(`${redirectTo}/?linked=1`);
    }

    if (!user) {
      const administradora = await prisma.administradora.create({
        data: { nome }
      });
      const senhaHash = await hashPassword(`google-${Date.now()}`);
      user = await prisma.usuario.create({
        data: {
          nome,
          email,
          senhaHash,
          role: "ADMINISTRADORA",
          authProvider: "GOOGLE",
          googleId: googleId || null,
          avatarUrl,
          emailVerificado: true,
          administradoraId: administradora.id
        }
      });
    } else {
      user = await prisma.usuario.update({
        where: { id: user.id },
        data: {
          nome,
          authProvider: "GOOGLE",
          googleId: googleId || user.googleId,
          avatarUrl,
          emailVerificado: true
        }
      });
    }

    const token = signToken({
      id: user.id,
      role: user.role,
      administradoraId: user.administradoraId,
      condominioId: user.condominioId
    });

    res.redirect(`${redirectTo}/#token=${encodeURIComponent(token)}`);
  } catch (err) {
    console.error(err);
    res.redirect(`${redirectTo}/?error=google_callback`);
  }
});

app.use("/api", requireAuth);

app.get("/api/condominios", async (req, res) => {
  try {
    const user = req.user;
    const where: Record<string, unknown> = {};

    if (user?.role === "SINDICO" && user.condominioId) {
      where.id = user.condominioId;
    } else if (user?.administradoraId) {
      where.administradoraId = user.administradoraId;
    }

    const data = await prisma.condominio.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50
    });
    res.json({ data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

app.post("/api/condominios", async (req, res) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ error: "unauthorized" });
  }
  if (!isAdminOrOperator(user)) {
    return res.status(403).json({ error: "forbidden" });
  }

  const nome = String(req.body?.nome || "").trim();
  const cnpj = req.body?.cnpj ? String(req.body.cnpj).trim() : null;
  const endereco = req.body?.endereco ? String(req.body.endereco).trim() : null;

  if (!nome) {
    return res.status(400).json({ error: "nome_obrigatorio" });
  }

  try {
    const dbUser = await prisma.usuario.findUnique({
      where: { id: user.id },
      select: { plano: true, administradoraId: true }
    });
    if (dbUser?.plano === "FREEMIUM" && dbUser.administradoraId) {
      const condoCount = await prisma.condominio.count({
        where: { administradoraId: dbUser.administradoraId }
      });
      if (condoCount >= 1) {
        return res.status(403).json({ error: "limite_plano" });
      }
    }

    const item = await prisma.condominio.create({
      data: {
        nome,
        cnpj: cnpj || null,
        endereco: endereco || null,
        administradoraId: user.administradoraId || null
      }
    });
    res.status(201).json({ data: item });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

app.get("/api/condominios/:condominioId/unidades", async (req, res) => {
  const user = req.user;
  const condominioId = String(req.params.condominioId || "").trim();
  if (!user || !condominioId) {
    return res.status(400).json({ error: "condominio_obrigatorio" });
  }

  try {
    const condominio = await getCondominioOrNull(condominioId);
    if (!condominio) {
      return res.status(404).json({ error: "nao_encontrado" });
    }
    if (!canAccessCondominio(user, condominio)) {
      return res.status(403).json({ error: "forbidden" });
    }

    const data = await prisma.unidade.findMany({
      where: { condominioId },
      orderBy: { createdAt: "desc" },
      take: 100
    });
    res.json({ data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

app.post("/api/condominios/:condominioId/unidades", async (req, res) => {
  const user = req.user;
  const condominioId = String(req.params.condominioId || "").trim();
  if (!isAdminOrOperator(user)) {
    return res.status(403).json({ error: "forbidden" });
  }
  if (!condominioId) {
    return res.status(400).json({ error: "condominio_obrigatorio" });
  }

  const identificador = String(req.body?.identificador || "").trim();
  const tipo = req.body?.tipo ? String(req.body.tipo).trim() : null;

  if (!identificador) {
    return res.status(400).json({ error: "identificador_obrigatorio" });
  }

  try {
    const condominio = await getCondominioOrNull(condominioId);
    if (!condominio) {
      return res.status(404).json({ error: "nao_encontrado" });
    }
    if (!canAccessCondominio(user, condominio)) {
      return res.status(403).json({ error: "forbidden" });
    }

    const dbUser = await prisma.usuario.findUnique({
      where: { id: user.id },
      select: { plano: true }
    });
    if (dbUser?.plano === "FREEMIUM") {
      const unidadeCount = await prisma.unidade.count({
        where: { condominioId }
      });
      if (unidadeCount >= 15) {
        return res.status(403).json({ error: "limite_plano" });
      }
    }

    const item = await prisma.unidade.create({
      data: {
        identificador,
        tipo: tipo || null,
        condominioId
      }
    });
    res.status(201).json({ data: item });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

app.patch("/api/unidades/:id", async (req, res) => {
  const user = req.user;
  if (!isAdminOrOperator(user)) {
    return res.status(403).json({ error: "forbidden" });
  }

  const id = String(req.params.id || "").trim();
  if (!id) {
    return res.status(400).json({ error: "id_obrigatorio" });
  }

  try {
    const unidade = await prisma.unidade.findUnique({
      where: { id },
      include: { condominio: true }
    });
    if (!unidade) {
      return res.status(404).json({ error: "nao_encontrado" });
    }
    if (!canAccessCondominio(user, unidade.condominio)) {
      return res.status(403).json({ error: "forbidden" });
    }

    const data: { identificador?: string; tipo?: string | null } = {};
    if (req.body?.identificador !== undefined) {
      const identificador = String(req.body.identificador).trim();
      if (!identificador) {
        return res.status(400).json({ error: "identificador_obrigatorio" });
      }
      data.identificador = identificador;
    }
    if (req.body?.tipo !== undefined) {
      const tipo = String(req.body.tipo).trim();
      data.tipo = tipo || null;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "nada_para_atualizar" });
    }

    const item = await prisma.unidade.update({
      where: { id },
      data
    });
    res.json({ data: item });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

app.delete("/api/unidades/:id", async (req, res) => {
  const user = req.user;
  if (!isAdminOrOperator(user)) {
    return res.status(403).json({ error: "forbidden" });
  }

  const id = String(req.params.id || "").trim();
  if (!id) {
    return res.status(400).json({ error: "id_obrigatorio" });
  }

  try {
    const unidade = await prisma.unidade.findUnique({
      where: { id },
      include: { condominio: true }
    });
    if (!unidade) {
      return res.status(404).json({ error: "nao_encontrado" });
    }
    if (!canAccessCondominio(user, unidade.condominio)) {
      return res.status(403).json({ error: "forbidden" });
    }

    await prisma.unidade.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

app.get("/api/unidades/:unidadeId/moradores", async (req, res) => {
  const user = req.user;
  const unidadeId = String(req.params.unidadeId || "").trim();
  if (!user || !unidadeId) {
    return res.status(400).json({ error: "unidade_obrigatoria" });
  }

  try {
    const unidade = await prisma.unidade.findUnique({
      where: { id: unidadeId },
      include: { condominio: true }
    });
    if (!unidade) {
      return res.status(404).json({ error: "nao_encontrado" });
    }
    if (!canAccessCondominio(user, unidade.condominio)) {
      return res.status(403).json({ error: "forbidden" });
    }

    const data = await prisma.morador.findMany({
      where: { unidadeId },
      orderBy: { createdAt: "desc" },
      take: 200
    });
    res.json({ data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

app.post("/api/unidades/:unidadeId/moradores", async (req, res) => {
  const user = req.user;
  const unidadeId = String(req.params.unidadeId || "").trim();
  if (!isAdminOrOperator(user)) {
    return res.status(403).json({ error: "forbidden" });
  }
  if (!unidadeId) {
    return res.status(400).json({ error: "unidade_obrigatoria" });
  }

  const nome = String(req.body?.nome || "").trim();
  const documento = req.body?.documento ? String(req.body.documento).trim() : null;
  const contato = req.body?.contato ? String(req.body.contato).trim() : null;

  if (!nome) {
    return res.status(400).json({ error: "nome_obrigatorio" });
  }

  try {
    const unidade = await prisma.unidade.findUnique({
      where: { id: unidadeId },
      include: { condominio: true }
    });
    if (!unidade) {
      return res.status(404).json({ error: "nao_encontrado" });
    }
    if (!canAccessCondominio(user, unidade.condominio)) {
      return res.status(403).json({ error: "forbidden" });
    }

    const item = await prisma.morador.create({
      data: {
        nome,
        documento: documento || null,
        contato: contato || null,
        unidadeId
      }
    });
    res.status(201).json({ data: item });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

app.patch("/api/moradores/:id", async (req, res) => {
  const user = req.user;
  if (!isAdminOrOperator(user)) {
    return res.status(403).json({ error: "forbidden" });
  }

  const id = String(req.params.id || "").trim();
  if (!id) {
    return res.status(400).json({ error: "id_obrigatorio" });
  }

  try {
    const morador = await prisma.morador.findUnique({
      where: { id },
      include: { unidade: { include: { condominio: true } } }
    });
    if (!morador) {
      return res.status(404).json({ error: "nao_encontrado" });
    }
    if (!canAccessCondominio(user, morador.unidade.condominio)) {
      return res.status(403).json({ error: "forbidden" });
    }

    const data: { nome?: string; documento?: string | null; contato?: string | null } = {};
    if (req.body?.nome !== undefined) {
      const nome = String(req.body.nome).trim();
      if (!nome) {
        return res.status(400).json({ error: "nome_obrigatorio" });
      }
      data.nome = nome;
    }
    if (req.body?.documento !== undefined) {
      const documento = String(req.body.documento).trim();
      data.documento = documento || null;
    }
    if (req.body?.contato !== undefined) {
      const contato = String(req.body.contato).trim();
      data.contato = contato || null;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "nada_para_atualizar" });
    }

    const item = await prisma.morador.update({
      where: { id },
      data
    });
    res.json({ data: item });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

app.delete("/api/moradores/:id", async (req, res) => {
  const user = req.user;
  if (!isAdminOrOperator(user)) {
    return res.status(403).json({ error: "forbidden" });
  }

  const id = String(req.params.id || "").trim();
  if (!id) {
    return res.status(400).json({ error: "id_obrigatorio" });
  }

  try {
    const morador = await prisma.morador.findUnique({
      where: { id },
      include: { unidade: { include: { condominio: true } } }
    });
    if (!morador) {
      return res.status(404).json({ error: "nao_encontrado" });
    }
    if (!canAccessCondominio(user, morador.unidade.condominio)) {
      return res.status(403).json({ error: "forbidden" });
    }

    await prisma.morador.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

app.get("/api/condominios/:condominioId/lancamentos", async (req, res) => {
  const user = req.user;
  const condominioId = String(req.params.condominioId || "").trim();
  if (!user || !condominioId) {
    return res.status(400).json({ error: "condominio_obrigatorio" });
  }

  const inicioRaw = req.query?.inicio ? String(req.query.inicio).trim() : "";
  const fimRaw = req.query?.fim ? String(req.query.fim).trim() : "";
  const inicio = inicioRaw ? parseDateInput(inicioRaw) : null;
  const fim = fimRaw ? parseDateInput(fimRaw) : null;

  if (inicioRaw && !inicio) {
    return res.status(400).json({ error: "inicio_invalido" });
  }
  if (fimRaw && !fim) {
    return res.status(400).json({ error: "fim_invalido" });
  }

  try {
    const condominio = await getCondominioOrNull(condominioId);
    if (!condominio) {
      return res.status(404).json({ error: "nao_encontrado" });
    }
    if (!canAccessCondominio(user, condominio)) {
      return res.status(403).json({ error: "forbidden" });
    }

    const dataFilter: { gte?: Date; lt?: Date } = {};
    if (inicio) {
      dataFilter.gte = inicio;
    }
    if (fim) {
      let end = fim;
      if (fimRaw.length === 10) {
        end = new Date(fim.getTime() + 24 * 60 * 60 * 1000);
      }
      dataFilter.lt = end;
    }

    const data = await prisma.lancamento.findMany({
      where: {
        condominioId,
        ...(Object.keys(dataFilter).length ? { data: dataFilter } : {})
      },
      orderBy: [{ data: "desc" }, { createdAt: "desc" }],
      take: 200
    });
    res.json({ data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

app.post("/api/condominios/:condominioId/lancamentos", async (req, res) => {
  const user = req.user;
  const condominioId = String(req.params.condominioId || "").trim();
  if (!isAdminOrOperator(user)) {
    return res.status(403).json({ error: "forbidden" });
  }
  if (!condominioId) {
    return res.status(400).json({ error: "condominio_obrigatorio" });
  }

  const tipo = String(req.body?.tipo || "").trim().toUpperCase();
  const valor = parseDecimalInput(req.body?.valor);
  const data = parseDateInput(req.body?.data);
  const categoria = req.body?.categoria ? String(req.body.categoria).trim() : null;
  const descricao = req.body?.descricao ? String(req.body.descricao).trim() : null;

  if (tipo !== "RECEITA" && tipo !== "DESPESA") {
    return res.status(400).json({ error: "tipo_invalido" });
  }
  if (!valor) {
    return res.status(400).json({ error: "valor_invalido" });
  }
  if (!data) {
    return res.status(400).json({ error: "data_invalida" });
  }

  try {
    const condominio = await getCondominioOrNull(condominioId);
    if (!condominio) {
      return res.status(404).json({ error: "nao_encontrado" });
    }
    if (!canAccessCondominio(user, condominio)) {
      return res.status(403).json({ error: "forbidden" });
    }

    const item = await prisma.lancamento.create({
      data: {
        tipo,
        valor,
        data,
        categoria: categoria || null,
        descricao: descricao || null,
        condominioId
      }
    });
    res.status(201).json({ data: item });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

app.patch("/api/lancamentos/:id", async (req, res) => {
  const user = req.user;
  if (!isAdminOrOperator(user)) {
    return res.status(403).json({ error: "forbidden" });
  }

  const id = String(req.params.id || "").trim();
  if (!id) {
    return res.status(400).json({ error: "id_obrigatorio" });
  }

  try {
    const lancamento = await prisma.lancamento.findUnique({
      where: { id },
      include: { condominio: true }
    });
    if (!lancamento) {
      return res.status(404).json({ error: "nao_encontrado" });
    }
    if (!canAccessCondominio(user, lancamento.condominio)) {
      return res.status(403).json({ error: "forbidden" });
    }

    const data: {
      tipo?: "RECEITA" | "DESPESA";
      valor?: string;
      data?: Date;
      categoria?: string | null;
      descricao?: string | null;
    } = {};

    if (req.body?.tipo !== undefined) {
      const tipo = String(req.body.tipo).trim().toUpperCase();
      if (tipo !== "RECEITA" && tipo !== "DESPESA") {
        return res.status(400).json({ error: "tipo_invalido" });
      }
      data.tipo = tipo;
    }

    if (req.body?.valor !== undefined) {
      const valor = parseDecimalInput(req.body?.valor);
      if (!valor) {
        return res.status(400).json({ error: "valor_invalido" });
      }
      data.valor = valor;
    }

    if (req.body?.data !== undefined) {
      const parsed = parseDateInput(req.body?.data);
      if (!parsed) {
        return res.status(400).json({ error: "data_invalida" });
      }
      data.data = parsed;
    }

    if (req.body?.categoria !== undefined) {
      const categoria = String(req.body.categoria).trim();
      data.categoria = categoria || null;
    }

    if (req.body?.descricao !== undefined) {
      const descricao = String(req.body.descricao).trim();
      data.descricao = descricao || null;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "nada_para_atualizar" });
    }

    const item = await prisma.lancamento.update({
      where: { id },
      data
    });
    res.json({ data: item });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

app.delete("/api/lancamentos/:id", async (req, res) => {
  const user = req.user;
  if (!isAdminOrOperator(user)) {
    return res.status(403).json({ error: "forbidden" });
  }

  const id = String(req.params.id || "").trim();
  if (!id) {
    return res.status(400).json({ error: "id_obrigatorio" });
  }

  try {
    const lancamento = await prisma.lancamento.findUnique({
      where: { id },
      include: { condominio: true }
    });
    if (!lancamento) {
      return res.status(404).json({ error: "nao_encontrado" });
    }
    if (!canAccessCondominio(user, lancamento.condominio)) {
      return res.status(403).json({ error: "forbidden" });
    }

    await prisma.lancamento.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

app.patch("/api/condominios/:id", async (req, res) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ error: "unauthorized" });
  }
  if (!isAdminOrOperator(user)) {
    return res.status(403).json({ error: "forbidden" });
  }

  const id = String(req.params.id || "").trim();
  if (!id) {
    return res.status(400).json({ error: "id_obrigatorio" });
  }

  try {
    const cond = await prisma.condominio.findUnique({ where: { id } });
    if (!cond) {
      return res.status(404).json({ error: "nao_encontrado" });
    }
    if (user.administradoraId && cond.administradoraId !== user.administradoraId) {
      return res.status(403).json({ error: "forbidden" });
    }

    const data: { nome?: string; cnpj?: string | null; endereco?: string | null } = {};

    if (req.body?.nome !== undefined) {
      const nome = String(req.body.nome).trim();
      if (!nome) {
        return res.status(400).json({ error: "nome_obrigatorio" });
      }
      data.nome = nome;
    }

    if (req.body?.cnpj !== undefined) {
      const cnpj = String(req.body.cnpj).trim();
      data.cnpj = cnpj || null;
    }

    if (req.body?.endereco !== undefined) {
      const endereco = String(req.body.endereco).trim();
      data.endereco = endereco || null;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "nada_para_atualizar" });
    }

    const item = await prisma.condominio.update({
      where: { id },
      data
    });
    res.json({ data: item });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

app.delete("/api/condominios/:id", async (req, res) => {
  const user = req.user;
  if (!user || (user.role !== "ADMINISTRADORA" && user.role !== "OPERADOR")) {
    return res.status(403).json({ error: "forbidden" });
  }

  const id = String(req.params.id || "").trim();
  if (!id) {
    return res.status(400).json({ error: "id_obrigatorio" });
  }

  try {
    const cond = await prisma.condominio.findUnique({ where: { id } });
    if (!cond) {
      return res.status(404).json({ error: "nao_encontrado" });
    }
    if (user.administradoraId && cond.administradoraId !== user.administradoraId) {
      return res.status(403).json({ error: "forbidden" });
    }

    await prisma.condominio.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

app.listen(port, () => {
  console.log(`API running on port ${port}`);
});
