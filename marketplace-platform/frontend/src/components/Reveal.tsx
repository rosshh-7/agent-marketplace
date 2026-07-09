import React, { useEffect, useRef } from 'react';

interface RevealProps {
  children: React.ReactNode;
  /** Stagger offset in ms, e.g. index * 90 for grids. */
  delay?: number;
  className?: string;
}

/**
 * Scroll-reveal wrapper: children rise into view the first time they enter
 * the viewport. The global reduced-motion rule collapses the transition to
 * ~0ms, so this degrades to a plain fade-less render there.
 */
export default function Reveal({ children, delay = 0, className = '' }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          el.classList.add('is-visible');
          obs.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal${className ? ` ${className}` : ''}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
