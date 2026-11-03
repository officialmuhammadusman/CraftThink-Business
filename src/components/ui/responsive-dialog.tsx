"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [breakpoint]);
  return isMobile;
}

/**
 * App-feel container: on phones it slides up as a bottom Sheet (rounded top
 * corners, drag handle, backdrop close, safe-area padding); on desktop it is
 * a centred Dialog. Same children, title, description and footer either way.
 */
export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className={cn(
            "flex max-h-[92dvh] flex-col overflow-hidden rounded-t-3xl",
            className,
          )}
        >
          <div className="mx-auto mb-4 h-1.5 w-12 shrink-0 rounded-full bg-slate-300" aria-hidden />
          <SheetHeader className="shrink-0 text-left">
            <SheetTitle>{title}</SheetTitle>
            {description ? (
              <SheetDescription>{description}</SheetDescription>
            ) : null}
          </SheetHeader>
          {/* Body scrolls inside the sheet; the footer below stays pinned
              to the sheet's bottom edge, never pushed up by content and
              never hidden behind the keyboard area or bottom nav. */}
          <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
            {children}
          </div>
          {footer ? (
            <div className="-mx-6 -mb-6 mt-6 shrink-0 border-t border-slate-200 bg-white px-6 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <SheetFooter className="mt-0">{footer}</SheetFooter>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={className}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <div>{children}</div>
        {footer ? <DialogFooter>{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  );
}

/** Error dialog: shows what went wrong and what to do next. Never silent. */
export function ErrorDialog({
  open,
  onOpenChange,
  title = "Something went wrong",
  message,
  hint,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  message: string;
  hint?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        {hint ? (
          <p className="text-base text-slate-600">{hint}</p>
        ) : null}
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            OK, I understand
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
