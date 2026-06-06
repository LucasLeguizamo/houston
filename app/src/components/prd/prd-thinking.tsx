import { useEffect, useState } from "react";
import { Shimmer } from "@houston-ai/chat";

/**
 * Mission-style "thinking" indicator: the same shimmer animation the agent
 * board uses, cycling through context phrases while a one-shot bible call runs.
 * (Real token-by-token reasoning would need a streaming session; this matches
 * the mission's animation and narrates what the model is doing.)
 */
export function PrdThinking({ phrases }: { phrases: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (phrases.length <= 1) return;
    const id = window.setInterval(
      () => setI((x) => (x + 1) % phrases.length),
      2200,
    );
    return () => window.clearInterval(id);
  }, [phrases.length]);

  return (
    <Shimmer duration={1.2}>{phrases[i % phrases.length] ?? ""}</Shimmer>
  );
}
