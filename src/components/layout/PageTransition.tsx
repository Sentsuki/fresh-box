import { useEffect, useState } from "react";

interface PageTransitionProps {
  children: React.ReactNode;
  pageKey: string;
}

export function PageTransition({ children, pageKey }: PageTransitionProps) {
  const [mounted, setMounted] = useState(false);
  const [prevPageKey, setPrevPageKey] = useState(pageKey);

  if (pageKey !== prevPageKey) {
    setMounted(false);
    setPrevPageKey(pageKey);
  }

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setMounted(true);
    });
    return () => cancelAnimationFrame(id);
  }, [pageKey]);

  return (
    <div
      className="flex flex-col h-full transition-[opacity,transform] duration-150 ease-out"
      style={{
        opacity: mounted ? 1 : 0,
        transform: mounted ? "translateX(0)" : "translateX(8px)",
      }}
    >
      {children}
    </div>
  );
}
