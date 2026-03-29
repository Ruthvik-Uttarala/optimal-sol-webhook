import { useMemo, useState, type CSSProperties, type PointerEvent } from "react";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

export function useAmbientPointer() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [pointer, setPointer] = useState({ x: 50, y: 25 });

  const style = useMemo(
    () =>
      ({
        "--pointer-x": `${pointer.x}%`,
        "--pointer-y": `${pointer.y}%`
      }) as CSSProperties,
    [pointer.x, pointer.y]
  );

  function onPointerMove(event: PointerEvent<HTMLElement>) {
    if (prefersReducedMotion) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    setPointer({
      x: ((event.clientX - bounds.left) / bounds.width) * 100,
      y: ((event.clientY - bounds.top) / bounds.height) * 100
    });
  }

  return {
    prefersReducedMotion,
    style,
    onPointerMove: prefersReducedMotion ? undefined : onPointerMove
  };
}
