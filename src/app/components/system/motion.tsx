import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import {
  AnimatePresence,
  LazyMotion,
  MotionConfig,
  domAnimation,
  m,
  useReducedMotion,
  type HTMLMotionProps,
} from "motion/react";

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

function getPageMotionKey(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  return `/${segments.slice(0, 2).join("/")}`;
}

function getSettledItemTransition(index: number) {
  return {
    delay: Math.min(Math.max(0, index), 6) * 0.03,
    duration: 0.18,
  };
}

function getCountUpValue(target: number, progress: number) {
  const safeTarget = Math.max(0, Math.floor(target));
  const safeProgress = Math.min(1, Math.max(0, progress));
  return Math.floor(safeTarget * safeProgress);
}

type MotionProviderProps = {
  children: ReactNode;
};

function MotionProvider({ children }: MotionProviderProps) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}

type PageTransitionProps = {
  children: ReactNode;
  motionKey: string;
};

function PageTransition({ children, motionKey }: PageTransitionProps) {
  return (
    <AnimatePresence initial={false} mode="wait">
      <m.div
        animate={{ opacity: 1, y: 0 }}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
        data-slot="page-transition"
        exit={{ opacity: 0 }}
        initial={{ opacity: 0, y: 4 }}
        key={motionKey}
        transition={{ duration: 0.2, ease: EASE_OUT }}
      >
        {children}
      </m.div>
    </AnimatePresence>
  );
}

type SettledItemProps = HTMLMotionProps<"div"> & {
  as?: "article" | "div" | "li" | "section";
  children: ReactNode;
  index: number;
};

function SettledItem({ as = "div", children, index, ...props }: SettledItemProps) {
  const Component = (as === "article"
    ? m.article
    : as === "li"
      ? m.li
      : as === "section"
        ? m.section
        : m.div) as typeof m.div;

  return (
    <Component
      animate={{ opacity: 1, y: 0 }}
      data-slot="settled-item"
      initial={{ opacity: 0, y: 4 }}
      transition={{ ...getSettledItemTransition(index), ease: EASE_OUT }}
      {...props}
    >
      {children}
    </Component>
  );
}

function useCountUp(target: number, duration = 200) {
  const safeTarget = Math.max(0, Math.floor(target));
  const shouldReduceMotion = useReducedMotion();
  const [value, setValue] = useState(safeTarget);
  const requestId = useRef<number | null>(null);

  useEffect(() => {
    if (requestId.current !== null) cancelAnimationFrame(requestId.current);
    if (shouldReduceMotion || safeTarget === 0 || duration <= 0) {
      setValue(safeTarget);
      return undefined;
    }

    setValue(0);
    const start = performance.now();
    const tick = (now: number) => {
      const progress = (now - start) / duration;
      setValue(getCountUpValue(safeTarget, progress));
      if (progress < 1) requestId.current = requestAnimationFrame(tick);
      else requestId.current = null;
    };
    requestId.current = requestAnimationFrame(tick);

    return () => {
      if (requestId.current !== null) cancelAnimationFrame(requestId.current);
      requestId.current = null;
    };
  }, [duration, safeTarget, shouldReduceMotion]);

  return value;
}

type BatchActionLabelProps = {
  approveLabel: string;
  completeLabel?: string;
  pendingCount: number;
  sentCount: number;
};

function BatchActionLabel({ approveLabel, completeLabel = "Sent", pendingCount, sentCount }: BatchActionLabelProps) {
  const animatedCount = useCountUp(sentCount);
  const sent = sentCount > 0 && pendingCount === 0;

  return (
    <AnimatePresence initial={false} mode="wait">
      <m.span
        animate={{ opacity: 1, y: 0 }}
        className="inline-flex items-center gap-2"
        exit={{ opacity: 0 }}
        initial={{ opacity: 0, y: 2 }}
        key={sent ? "sent" : "approve"}
        transition={{ duration: 0.16, ease: EASE_OUT }}
      >
        {sent ? (
          <>
            <Check aria-hidden="true" className="size-4" strokeWidth={1.75} />
            <span>{completeLabel} <span className="tabular-nums">{animatedCount}</span></span>
          </>
        ) : approveLabel}
      </m.span>
    </AnimatePresence>
  );
}

export {
  BatchActionLabel,
  EASE_OUT,
  MotionProvider,
  PageTransition,
  SettledItem,
  getCountUpValue,
  getPageMotionKey,
  getSettledItemTransition,
  useCountUp,
};
export type { BatchActionLabelProps, MotionProviderProps, PageTransitionProps, SettledItemProps };
