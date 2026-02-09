import { PrismaClient, Role, Plano } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function ensureAdministradora() {
  const existing = await prisma.administradora.findFirst({
    where: { nome: "Administradora Alpha" }
  });
  if (existing) return existing;
  return prisma.administradora.create({ data: { nome: "Administradora Alpha" } });
}

async function ensureCondominio(nome: string, administradoraId: string) {
  const existing = await prisma.condominio.findFirst({
    where: { nome, administradoraId }
  });
  if (existing) return existing;
  return prisma.condominio.create({
    data: {
      nome,
      administradoraId
    }
  });
}

async function upsertUser(params: {
  nome: string;
  email: string;
  senha: string;
  role: Role;
  administradoraId?: string | null;
  condominioId?: string | null;
  plano?: Plano;
}) {
  const senhaHash = await bcrypt.hash(params.senha, 10);
  await prisma.usuario.upsert({
    where: { email: params.email },
    update: {
      nome: params.nome,
      role: params.role,
      administradoraId: params.administradoraId ?? null,
      condominioId: params.condominioId ?? null,
      senhaHash,
      plano: params.plano ?? Plano.PROFISSIONAL,
      emailVerificado: true,
      onboarded: true
    },
    create: {
      nome: params.nome,
      email: params.email,
      senhaHash,
      role: params.role,
      administradoraId: params.administradoraId ?? null,
      condominioId: params.condominioId ?? null,
      plano: params.plano ?? Plano.PROFISSIONAL,
      emailVerificado: true,
      onboarded: true
    }
  });
}

type MoradorSeed = {
  nome: string;
  documento?: string;
  contato?: string;
};

type UnidadeSeed = {
  identificador: string;
  tipo?: string;
  moradores?: MoradorSeed[];
};

async function ensureUnidades(condominioId: string, unidades: UnidadeSeed[]) {
  const count = await prisma.unidade.count({ where: { condominioId } });
  if (count > 0) return;

  for (const unidade of unidades) {
    await prisma.unidade.create({
      data: {
        identificador: unidade.identificador,
        tipo: unidade.tipo ?? null,
        condominioId,
        moradores: unidade.moradores
          ? {
              create: unidade.moradores.map((m) => ({
                nome: m.nome,
                documento: m.documento ?? null,
                contato: m.contato ?? null
              }))
            }
          : undefined
      }
    });
  }
}

async function main() {
  const admin = await ensureAdministradora();
  const cond1 = await ensureCondominio("Residencial Aurora", admin.id);
  const cond2 = await ensureCondominio("Jardins do Sol", admin.id);

  await upsertUser({
    nome: "Admin Alpha",
    email: "admin@admg.local",
    senha: "admin123",
    role: Role.ADMINISTRADORA,
    administradoraId: admin.id
  });

  await upsertUser({
    nome: "Operador 1",
    email: "op1@admg.local",
    senha: "op123",
    role: Role.OPERADOR,
    administradoraId: admin.id
  });

  await upsertUser({
    nome: "Operador 2",
    email: "op2@admg.local",
    senha: "op123",
    role: Role.OPERADOR,
    administradoraId: admin.id
  });

  await upsertUser({
    nome: "Sindico Aurora",
    email: "sindico1@admg.local",
    senha: "sindico123",
    role: Role.SINDICO,
    administradoraId: admin.id,
    condominioId: cond1.id
  });

  await upsertUser({
    nome: "Sindico Jardins",
    email: "sindico2@admg.local",
    senha: "sindico123",
    role: Role.SINDICO,
    administradoraId: admin.id,
    condominioId: cond2.id
  });

  await ensureUnidades(cond1.id, [
    {
      identificador: "Apto 101",
      tipo: "Apartamento",
      moradores: [
        { nome: "Joao Pereira", documento: "12345678900", contato: "11999990001" },
        { nome: "Maria Souza", documento: "98765432100", contato: "11999990002" }
      ]
    },
    {
      identificador: "Apto 102",
      tipo: "Apartamento",
      moradores: [{ nome: "Carlos Lima", documento: "11122233344", contato: "11999990003" }]
    },
    {
      identificador: "Cobertura 301",
      tipo: "Cobertura",
      moradores: [{ nome: "Ana Costa", documento: "55566677788", contato: "11999990004" }]
    }
  ]);

  await ensureUnidades(cond2.id, [
    {
      identificador: "Bloco B - 12",
      tipo: "Apartamento",
      moradores: [{ nome: "Bruno Alves", documento: "22233344455", contato: "11999990005" }]
    },
    {
      identificador: "Bloco B - 14",
      tipo: "Apartamento",
      moradores: [
        { nome: "Paula Moraes", documento: "33344455566", contato: "11999990006" },
        { nome: "Ricardo Melo", documento: "44455566677", contato: "11999990007" }
      ]
    }
  ]);

  const lancamentosCount = await prisma.lancamento.count();
  if (lancamentosCount === 0) {
    await prisma.lancamento.createMany({
      data: [
        {
          tipo: "DESPESA",
          valor: "850.50",
          data: new Date("2026-01-05"),
          categoria: "Manutencao",
          descricao: "Troca de lampadas",
          condominioId: cond1.id
        },
        {
          tipo: "DESPESA",
          valor: "420.00",
          data: new Date("2026-01-12"),
          categoria: "Limpeza",
          descricao: "Servicos de limpeza mensal",
          condominioId: cond1.id
        },
        {
          tipo: "RECEITA",
          valor: "12000.00",
          data: new Date("2026-01-10"),
          categoria: "Cota condominial",
          descricao: "Recebimento de cotas",
          condominioId: cond1.id
        },
        {
          tipo: "DESPESA",
          valor: "1500.00",
          data: new Date("2026-01-08"),
          categoria: "Seguranca",
          descricao: "Monitoramento 24h",
          condominioId: cond2.id
        },
        {
          tipo: "RECEITA",
          valor: "9800.00",
          data: new Date("2026-01-11"),
          categoria: "Cota condominial",
          descricao: "Recebimento de cotas",
          condominioId: cond2.id
        }
      ]
    });
  }

  console.log("Seed concluido: usuarios, condominios, unidades, moradores e lancamentos criados.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

