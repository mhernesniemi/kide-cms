"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Crosshair, X } from "lucide-react";
import { Button } from "@/components/admin/ui/button";
import { Input } from "@/components/admin/ui/input";

type Props = {
  src: string;
  alt: string;
  focalX: number | null;
  focalY: number | null;
};

export default function FocalPointSelector({ src, alt, focalX: initialX, focalY: initialY }: Props) {
  const [focalX, setFocalX] = useState<number | null>(initialX);
  const [focalY, setFocalY] = useState<number | null>(initialY);
  const imageRef = useRef<HTMLImageElement>(null);
  const hiddenXRef = useRef<HTMLInputElement>(null);

  // Notify the form of value changes so UnsavedGuard detects them
  useEffect(() => {
    hiddenXRef.current?.dispatchEvent(new Event("change", { bubbles: true }));
  }, [focalX, focalY]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const img = imageRef.current;
    if (!img) return;
    const rect = img.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 100);
    setFocalX(Math.max(0, Math.min(100, x)));
    setFocalY(Math.max(0, Math.min(100, y)));
  }, []);

  const handleClear = useCallback(() => {
    setFocalX(null);
    setFocalY(null);
  }, []);

  const hasFocal = focalX !== null && focalY !== null;

  return (
    <div className="space-y-2">
      <div className="flex h-6 items-center justify-between gap-2">
        <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <Crosshair className="size-3" />
          {hasFocal ? <span>Focal point</span> : <span>Click image to set focal point</span>}
        </div>
        {hasFocal && (
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground text-xs">X</span>
              <Input
                type="number"
                min={0}
                max={100}
                value={focalX ?? ""}
                onChange={(e) =>
                  setFocalX(e.target.value === "" ? null : Math.max(0, Math.min(100, Number(e.target.value))))
                }
                className="h-6 w-14 px-1.5 text-center text-xs"
              />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground text-xs">Y</span>
              <Input
                type="number"
                min={0}
                max={100}
                value={focalY ?? ""}
                onChange={(e) =>
                  setFocalY(e.target.value === "" ? null : Math.max(0, Math.min(100, Number(e.target.value))))
                }
                className="h-6 w-14 px-1.5 text-center text-xs"
              />
            </div>
            <Button type="button" variant="ghost" size="icon-xs" onClick={handleClear}>
              <X className="size-3" />
            </Button>
          </div>
        )}
      </div>
      <div className="bg-muted/30 relative cursor-crosshair overflow-hidden rounded-md" onClick={handleClick}>
        <img ref={imageRef} src={src} alt={alt} className="max-h-125 w-full object-contain" draggable={false} />
        {hasFocal && (
          <div
            className="pointer-events-none absolute size-8 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${focalX}%`, top: `${focalY}%` }}
          >
            <div className="absolute inset-0 rounded-full border-2 border-white shadow-[0_0_0_1.5px_rgba(0,0,0,0.4),inset_0_0_0_1.5px_rgba(0,0,0,0.4)]" />
            <div className="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_1.5px_rgba(0,0,0,0.4)]" />
          </div>
        )}
      </div>
      <input ref={hiddenXRef} type="hidden" name="focalX" value={focalX ?? ""} />
      <input type="hidden" name="focalY" value={focalY ?? ""} />
    </div>
  );
}
