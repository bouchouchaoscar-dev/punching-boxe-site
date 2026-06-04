"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { isAdminLogged } from "@/lib/admin-auth";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  const isLogin = pathname === "/admin/login";

  useEffect(() => {
    if (isLogin) {
      setReady(true);
      return;
    }
    if (!isAdminLogged()) {
      router.replace("/admin/login");
    } else {
      setReady(true);
    }
  }, [isLogin, pathname, router]);

  if (isLogin) {
    return <div className="min-h-screen bg-paper-2">{children}</div>;
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper-2">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-ink/20 border-t-orange" />
      </div>
    );
  }

  return <AdminShell>{children}</AdminShell>;
}
