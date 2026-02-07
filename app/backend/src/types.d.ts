import "express";

declare module "express-serve-static-core" {
  interface Request {
    user?: {
      id: string;
      role: string;
      administradoraId?: string | null;
      condominioId?: string | null;
    };
  }
}
