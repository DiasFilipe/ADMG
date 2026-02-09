import type { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";
if (JWT_SECRET === "dev_secret") {
  console.warn("JWT_SECRET nao configurado. Defina um valor forte no ambiente.");
}

export type AuthPayload = {
  id: string;
  role: string;
  administradoraId?: string | null;
  condominioId?: string | null;
};

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

export function signToken(payload: AuthPayload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function signState(payload: Record<string, unknown>) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "10m" });
}

export function verifyState(token: string) {
  return jwt.verify(token, JWT_SECRET) as Record<string, unknown>;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = String(req.headers.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token) {
    return res.status(401).json({ error: "unauthorized" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthPayload;
    req.user = decoded;
    return next();
  } catch (_err) {
    return res.status(401).json({ error: "unauthorized" });
  }
}
