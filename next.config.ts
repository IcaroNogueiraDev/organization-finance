import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fixa a raiz do Turbopack no projeto (há um package-lock.json estranho
  // em C:\Users\Administrator que faz o detector subir de diretório).
  turbopack: {
    root: path.resolve(process.cwd()),
  },
};

export default nextConfig;
