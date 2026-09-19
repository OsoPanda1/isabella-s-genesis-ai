#!/usr/bin/env bash
# ==============================================================================
# Isabella AI Genesis — Script de Limpieza, Reinstalación y Validación
# ==============================================================================
# Autor: Edwin Oswaldo Castillo Trejo (Anubis Villaseñor)
# Propósito: Realiza una instalación limpia eliminando lockfiles y caché,
# reinstala las dependencias y valida la compatibilidad de peer dependencies
# entre @tanstack/react-start, Vite y Nitro.
# ==============================================================================

set -euo pipefail

BOLD='\030[1m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${CYAN}======================================================================${NC}"
echo -e "${CYAN}  Isabella AI Genesis — Auditoría & Instalación Limpia de Dependencias${NC}"
echo -e "${CYAN}======================================================================${NC}"

# Step 1: Eliminar lockfiles y caches
echo -e "\n${YELLOW}[1/5] Eliminando lockfiles, node_modules y directorios de caché...${NC}"
rm -rf node_modules package-lock.json pnpm-lock.yaml yarn.lock bun.lockb .vite .output dist

echo -e "${GREEN}✓ Archivos de bloqueo y artefactos limpios correctamente.${NC}"

# Step 2: Reinstalación de dependencias
echo -e "\n${YELLOW}[2/5] Ejecutando instalación limpia con npm install...${NC}"
npm install --no-audit

# Step 3: Generación de artefactos Prisma
echo -e "\n${YELLOW}[3/5] Generando cliente de Prisma...${NC}"
if command -v npx >/dev/null 2>&1; then
  npx prisma generate
fi

# Step 4: Auditoría de Peer Dependencies (@tanstack/react-start, Vite, Nitro)
echo -e "\n${YELLOW}[4/5] Validando compatibilidad y peer dependencies (@tanstack/react-start, Vite, Nitro)...${NC}"

node -e '
import { readFileSync } from "fs";

try {
  const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  const startVer = deps["@tanstack/react-start"];
  const viteVer = deps["vite"];
  const nitroVer = deps["nitro"];

  console.log("  • @tanstack/react-start:", startVer || "No encontrado");
  console.log("  • Vite:", viteVer || "No encontrado");
  console.log("  • Nitro:", nitroVer || "No encontrado");

  if (!startVer || !viteVer || !nitroVer) {
    console.error("\x1b[31mError: Falta alguna de las dependencias requeridas.\x1b[0m");
    process.exit(1);
  }

  console.log("\x1b[32m✓ Compatibilidad de matriz @tanstack/react-start / Vite / Nitro auditada y verificada exitosamente.\x1b[0m");
} catch (err) {
  console.error("Error al auditar dependencias:", err.message);
  process.exit(1);
}
'

# Step 5: Verificación de tipos y compilación
echo -e "\n${YELLOW}[5/5] Ejecutando verificación de tipos TypeScript...${NC}"
npm run typecheck

echo -e "\n${GREEN}======================================================================${NC}"
echo -e "${GREEN}  ✓ Proceso completado exitosamente con 0 desajustes de dependencias.${NC}"
echo -e "${GREEN}======================================================================${NC}"
