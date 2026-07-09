import React, { useEffect, useRef, useState } from 'react';

interface TypewriterProps {
  phrases: string[];
  className?: string;
  typeMs?: number;
  deleteMs?: number;
  holdMs?: number;
}

/**
 * Types, holds, deletes, and cycles through phrases with a glowing caret.
 * Under prefers-reduced-motion it renders the first phrase statically.
 */
export default function Typewriter({
  phrases,
  className,
  typeMs = 55,
  deleteMs = 28,
  holdMs = 2200,
}: TypewriterProps) {
  const [display, setDisplay] = useState('');
  const state = useRef({ phrase: 0, char: 0, deleting: false });
  const [reduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    if (reduced || phrases.length === 0) return;
    let timer = 0;
    const tick = () => {
      const s = state.current;
      const full = phrases[s.phrase];
      let delay = s.deleting ? deleteMs : typeMs;
      if (!s.deleting) {
        s.char += 1;
        if (s.char === full.length) {
          s.deleting = true;
          delay = holdMs;
        }
      } else {
        s.char -= 1;
        if (s.char === 0) {
          s.deleting = false;
          s.phrase = (s.phrase + 1) % phrases.length;
          delay = 350;
        }
      }
      setDisplay(full.slice(0, s.char));
      timer = window.setTimeout(tick, delay);
    };
    timer = window.setTimeout(tick, 400);
    return () => window.clearTimeout(timer);
  }, [phrases, reduced, typeMs, deleteMs, holdMs]);

  if (reduced) return <span className={className}>{phrases[0]}</span>;

  return (
    <span className={className} aria-label={phrases[0]}>
      {display}
      <span className="typewriter-caret" aria-hidden="true" />
    </span>
  );
}
