'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { Sidebar } from '@/components/layout/Sidebar';
import { Loader2, Menu, Radio } from 'lucide-react';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/auth');
    }
  }, [user, isLoading, router]);

  // Auto-close the mobile drawer whenever the route changes — otherwise
  // the user would tap "Settings", the page would update, and the drawer
  // would still cover the new content.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Desktop sidebar — always present on md+ */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      {/* Mobile drawer — slides in as an overlay below md */}
      {mobileOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 bg-black/40 z-40"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <div className="md:hidden fixed inset-y-0 left-0 z-50">
            <Sidebar />
          </div>
        </>
      )}

      <main className="flex-1 overflow-auto flex flex-col">
        {/* Mobile-only top bar with hamburger + brand. Sticky so it stays
            available as the user scrolls long content. */}
        <div className="md:hidden sticky top-0 z-30 bg-white border-b px-3 py-2 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="p-2 -m-2 text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-orange-500 rounded-lg flex items-center justify-center">
              <Radio className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold">Audexa</span>
          </div>
        </div>
        <div className="flex-1 overflow-auto">{children}</div>
      </main>
    </div>
  );
}
