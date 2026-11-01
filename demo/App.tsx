import { useEffect, useRef } from "react";
import { DialRoot } from "dialkit";
import "dialkit/styles.css";
import { FlowerField, schemeColors, type FlowerFieldHandle } from "halftone-flowers";
import { useFlowerDials } from "./useFlowerDials";
import styles from "./App.module.css";

export function App() {
  const field = useRef<FlowerFieldHandle>(null);
  const { options, generation } = useFlowerDials(field);
  const scheme = options.scheme ?? "light";
  const page = schemeColors(options.colors, scheme).background;

  // The page background and the browser's scrollbars and controls follow the field's scheme.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--page", page);
    root.style.colorScheme = scheme;
  }, [page, scheme]);

  return (
    <>
      <main className={styles.hero}>
        <FlowerField key={generation} ref={field} {...options} />
      </main>
      <DialRoot theme={scheme} />
    </>
  );
}
