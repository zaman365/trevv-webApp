"use client";
import { useEffect, useMemo } from "react";
import { createBufferedPersistence } from "./buffered-persistence";

export function useBufferedPersistence<T>(write: (value: T) => void) {
  const writer = useMemo(() => createBufferedPersistence(write), [write]);
  useEffect(() => {
    const whenHidden = () => {
      if (document.visibilityState === "hidden") writer.flush();
    };
    window.addEventListener("pagehide", writer.flush);
    window.addEventListener("blur", writer.flush);
    document.addEventListener("visibilitychange", whenHidden);
    return () => {
      window.removeEventListener("pagehide", writer.flush);
      window.removeEventListener("blur", writer.flush);
      document.removeEventListener("visibilitychange", whenHidden);
      writer.flush();
    };
  }, [writer]);
  return writer;
}
