"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRightIcon,
  BotIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  PieChartIcon,
  TagsIcon,
  TargetIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/lib/actions/auth";

const navItems = [
  { title: "Painel", href: "/painel", icon: LayoutDashboardIcon },
  { title: "Transações", href: "/transacoes", icon: ArrowLeftRightIcon },
  { title: "Categorias", href: "/categorias", icon: TagsIcon },
  { title: "Orçamentos", href: "/orcamentos", icon: PieChartIcon },
  { title: "Metas", href: "/metas", icon: TargetIcon },
  { title: "Assistente", href: "/assistente", icon: BotIcon },
] as const;

type AppSidebarProps = {
  user: {
    name: string;
    email: string;
  };
};

export function AppSidebar({ user }: AppSidebarProps) {
  const pathname = usePathname();
  const initial = (user.name || user.email).charAt(0).toUpperCase();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <span className="px-2 text-sm font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
          Org Finance
        </span>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith(item.href)}
                    tooltip={item.title}
                  >
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarSeparator />
        <div className="flex items-center gap-2 px-2 py-2 group-data-[collapsible=icon]:justify-center">
          <Avatar className="size-8">
            <AvatarFallback>{initial}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-medium">
              {user.name || "Usuário"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {user.email}
            </p>
          </div>
          <form
            action={logoutAction}
            className="group-data-[collapsible=icon]:hidden"
          >
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              aria-label="Sair"
              title="Sair"
            >
              <LogOutIcon />
            </Button>
          </form>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
