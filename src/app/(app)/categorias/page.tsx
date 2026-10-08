import type { Metadata } from "next";
import { CategoriesManager } from "@/components/categories/categories-manager";

export const metadata: Metadata = {
  title: "Categorias · Org Finance",
};

export default function CategoriasPage() {
  return <CategoriesManager />;
}
