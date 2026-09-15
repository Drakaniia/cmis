"use client";

import { Button } from "@cmis/ui/components/button";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useCallback } from "react";

/**
 * Slim chrome for the standalone `/docs` route: wordmark, the page's only `h1`,
 * and a way back to wherever the reader came from. The admin sidebar and header
 * are intentionally absent — documentation is a reading surface, not a page of
 * the app.
 */
export function DocsHeader() {
  const router = useRouter();
  const navigate = useNavigate();

  const handleBack = useCallback(() => {
    const history = router.history as { canGoBack?: () => boolean };
    if (history.canGoBack?.()) {
      router.history.back();
      return;
    }
    navigate({ to: "/admin" }).catch(() => undefined);
  }, [navigate, router.history]);

  return (
    <header className="surface-frosted flex h-12 shrink-0 items-center justify-between gap-3 border-border/50 border-b px-3 sm:px-4">
      <div className="flex min-w-0 items-center gap-2">
        <img
          alt=""
          aria-hidden
          className="size-6 shrink-0 rounded-[0.4rem] dark:hidden"
          height={24}
          src="/cmis-dark-rounded.png"
          width={24}
        />
        <img
          alt=""
          aria-hidden
          className="hidden size-6 shrink-0 rounded-[0.4rem] dark:block"
          height={24}
          src="/cmis-white-rounded.png"
          width={24}
        />
        <span className="text-muted-foreground text-xs">CMIS</span>
        <span aria-hidden className="text-muted-foreground/50">
          /
        </span>
        <h1 className="truncate font-bold text-[14px] text-foreground tracking-tight">
          Documentation
        </h1>
      </div>
      <Button
        className="press-feedback"
        onClick={handleBack}
        size="sm"
        variant="ghost"
      >
        <ArrowLeft className="size-3.5" />
        Back to app
      </Button>
    </header>
  );
}
