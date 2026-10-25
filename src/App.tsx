import { DialRoot } from "dialkit";
import "dialkit/styles.css";
import { FlowerField } from "./components/FlowerField";
import { useFlowerDials } from "./hooks/useFlowerDials";
import styles from "./App.module.css";

export function App() {
  const { options, generation } = useFlowerDials();
  return (
    <>
      <main className={styles.hero}>
        <FlowerField key={generation} {...options} />
      </main>
      <DialRoot />
    </>
  );
}
