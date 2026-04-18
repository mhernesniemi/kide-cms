"use client";

import { useEffect, useState } from "react";

export default function LiveHeading({ initial, inputName = "title" }: { initial: string; inputName?: string }) {
  const [text, setText] = useState(initial);

  useEffect(() => {
    const input = document.querySelector<HTMLInputElement>(`[name="${inputName}"]`);
    if (!input) return;
    const handler = () => setText(input.value || initial);
    input.addEventListener("input", handler);
    return () => input.removeEventListener("input", handler);
  }, [initial, inputName]);

  return <>{text}</>;
}
