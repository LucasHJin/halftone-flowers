import { useEffect, useRef, useState } from "react";
import { DialRoot } from "dialkit";
import "dialkit/styles.css";
import { FlowerField, schemeColors, type FlowerFieldHandle } from "halftone-flowers";
import { useFieldSound } from "./sound";
import { useFlowerDials } from "./useFlowerDials";
import styles from "./App.module.css";

export function App() {
  const field = useRef<FlowerFieldHandle>(null);
  const { options, generation, sound } = useFlowerDials(field);
  useFieldSound(field, sound);
  const scheme = options.scheme ?? "light";
  const page = schemeColors(options.colors, scheme).background;

  // The page background and the browser's scrollbars and controls follow the field's scheme.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--page", page);
    root.style.colorScheme = scheme;
  }, [page, scheme]);

  // H hides and shows the panel, for screenshots.
  const [panel, setPanel] = useState(true);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      if (e.key.toLowerCase() === "h" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) setPanel((p) => !p);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <main className={styles.hero}>
        <FlowerField key={generation} ref={field} {...options} />
      </main>
      {panel && <DialRoot theme={scheme} />}
    </>
  );
}
