-- CreateEnum
CREATE TYPE "LancamentoTipo" AS ENUM ('RECEITA', 'DESPESA');

-- CreateTable
CREATE TABLE "Lancamento" (
    "id" TEXT NOT NULL,
    "tipo" "LancamentoTipo" NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "categoria" TEXT,
    "descricao" TEXT,
    "condominioId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lancamento_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_condominioId_fkey" FOREIGN KEY ("condominioId") REFERENCES "Condominio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
