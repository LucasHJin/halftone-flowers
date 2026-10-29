import { useEffect, useRef } from "react";
import { DialRoot } from "dialkit";
import "dialkit/styles.css";
import { FlowerField, type FlowerFieldHandle } from "./components/FlowerField";
import { useFlowerDials } from "./hooks/useFlowerDials";
import { schemeColors } from "./lib/flowers";
import styles from "./App.module.css";

export function App() {
  const field = useRef<FlowerFieldHandle>(null);
  const { options, generation } = useFlowerDials(field);
  const scheme = options.scheme ?? "light";
  const page = schemeColors(options.colors, scheme).background;

  // The page behind the field, and the browser's own scrollbars and controls, follow its scheme.
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
