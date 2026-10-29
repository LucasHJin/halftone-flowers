import { useRef } from "react";
import { DialRoot } from "dialkit";
import "dialkit/styles.css";
import { FlowerField, type FlowerFieldHandle } from "./components/FlowerField";
import { useFlowerDials } from "./hooks/useFlowerDials";
import styles from "./App.module.css";

export function App() {
  const field = useRef<FlowerFieldHandle>(null);
  const { options, generation } = useFlowerDials(field);
  return (
    <>
      <main className={styles.hero}>
        <FlowerField key={generation} ref={field} {...options} />
      </main>
      <DialRoot />
    </>
  );
}
