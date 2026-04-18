"use client";

import { Menu } from "lucide-react";
import { useState } from "react";

import { Button } from "./ui/button";
import { Sheet, SheetContent, SheetTitle } from "./ui/sheet";

export default function MobileSidebar({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="ghost" size="icon-sm" onClick={() => setOpen(true)}>
        <Menu className="size-5" />
        <span className="sr-only">Open menu</span>
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-68 p-0" showCloseButton={false}>
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-full flex-col" onClick={() => setOpen(false)}>
            {children}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
