'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
  Activity, BarChart3, Brain, Bell, Settings,
  LogOut, ChevronLeft, ChevronRight, TrendingUp,
  History, FlaskConical, Shield
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: Activity },
  { href: '/chart/ES=F', label: 'Chart Analysis', icon: BarChart3 },
  { href: '/insights', label: 'AI Insights', icon: Brain },
  { href: '/backtest', label: 'Backtesting', icon: FlaskConical },
  { href: '/journal', label: 'Trade Journal', icon: History },
  { href: '/alerts', label: 'Alerts', icon: Bell },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function AppSidebar({ role }: { role?: string }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const items = role === 'ADMIN'
    ? [...navItems, { href: '/admin', label: 'Admin', icon: Shield }]
    : navItems;

  return (
    <motion.aside
      animate={{ width: collapsed ? 72 : 240 }}
      transition={{ duration: 0.2 }}
      className="h-screen bg-[#0D1121] border-r border-white/5 flex flex-col relative z-20"
    >
      <div className="flex items-center gap-3 px-4 py-5 border-b border-white/5">
        <div className="p-2 bg-blue-500/10 rounded-lg shrink-0">
          <TrendingUp className="w-5 h-5 text-blue-400" />
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="overflow-hidden"
            >
              <h1 className="text-sm font-display font-bold text-white whitespace-nowrap">ICT Futures</h1>
              <p className="text-[10px] text-gray-500 whitespace-nowrap">Intelligence Platform</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {items.map((item: any) => {
          const isActive = pathname?.startsWith(item.href) ||
            (item.href === '/chart/ES=F' && pathname?.startsWith('/chart'));
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm ${
                isActive
                  ? 'bg-blue-500/10 text-blue-400'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className="w-5 h-5 shrink-0" />
              <AnimatePresence>
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="whitespace-nowrap"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-white/5 space-y-1">
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-400/5 transition-all text-sm w-full"
        >
          <LogOut className="w-5 h-5 shrink-0" />
          <AnimatePresence>
            {!collapsed && (
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="whitespace-nowrap">
                Sign Out
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>

      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-20 bg-[#1A1F35] border border-white/10 rounded-full p-1 text-gray-400 hover:text-white transition-colors"
      >
        {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
      </button>
    </motion.aside>
  );
}
