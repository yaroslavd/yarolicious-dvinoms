import { Link, useLocation } from "wouter";
import {
  BookOpen,
  DownloadCloud,
  Wand2,
  Settings,
  Menu,
  X,
  ChefHat,
  Trash2,
  ShoppingCart,
} from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "./ui/button";
import {
  useListCartItems,
  getListCartItemsQueryKey,
} from "@workspace/api-client-react";

interface LayoutProps {
  children: React.ReactNode;
}

const navItems = [
  { href: "/", label: "My Recipes", icon: BookOpen },
  { href: "/import", label: "Import URL", icon: DownloadCloud },
  { href: "/generate", label: "AI Generate", icon: Wand2 },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/trash", label: "Trash", icon: Trash2 },
];

function CartIconButton() {
  const { data: items = [] } = useListCartItems({
    query: { queryKey: getListCartItemsQueryKey(), staleTime: 1000 * 30 },
  });
  const count = items.length;

  return (
    <Link href="/cart">
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        aria-label="Shopping cart"
      >
        <ShoppingCart className="w-5 h-5" />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 leading-none">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </Button>
    </Link>
  );
}

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden glass-effect sticky top-0 z-40 flex items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-primary">
          <ChefHat className="w-6 h-6" />
          <span className="font-serif font-bold text-lg">Culinary Agent</span>
        </Link>
        <div className="flex items-center gap-1">
          <CartIconButton />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? (
              <X className="w-5 h-5" />
            ) : (
              <Menu className="w-5 h-5" />
            )}
          </Button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="md:hidden fixed inset-x-0 top-[57px] bg-card border-b border-border shadow-lg z-30"
          >
            <nav className="flex flex-col p-4 gap-2">
              {navItems.map((item) => {
                const isActive = location === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`
                      flex items-center gap-3 px-4 py-3 rounded-xl transition-all
                      ${
                        isActive
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }
                    `}
                  >
                    <item.icon className="w-5 h-5" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar */}
      <div className="hidden md:flex flex-col w-72 bg-card border-r border-border shrink-0 sticky top-0 h-screen overflow-y-auto">
        <div className="p-6">
          <Link
            href="/"
            className="flex items-center gap-3 text-primary group cursor-pointer"
          >
            <div className="p-2 bg-primary/10 rounded-xl group-hover:bg-primary/20 transition-colors">
              <ChefHat className="w-6 h-6" />
            </div>
            <span className="font-serif font-bold text-xl tracking-tight">
              Culinary Agent
            </span>
          </Link>
        </div>

        <nav className="flex-1 px-4 space-y-2">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`
                  flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group
                  ${
                    isActive
                      ? "bg-primary/10 text-primary shadow-sm shadow-primary/5 font-medium"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }
                `}
              >
                <item.icon
                  className={`w-5 h-5 ${isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground transition-colors"}`}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-6 mt-auto" />
      </div>

      {/* Main Content */}
      <main className="flex-1 relative overflow-x-hidden">
        {/* Desktop cart icon - fixed top-right */}
        <div className="hidden md:block fixed top-4 right-4 z-50">
          <CartIconButton />
        </div>
        <div className="max-w-5xl mx-auto w-full p-4 md:p-8 min-h-[calc(100vh-57px)] md:min-h-screen flex flex-col">
          {children}
        </div>
      </main>
    </div>
  );
}
