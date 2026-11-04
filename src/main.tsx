
  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import { MotionProvider } from "./app/components/system/motion.tsx";
  import "./styles/index.css";

  createRoot(document.getElementById("root")!).render(
    <MotionProvider>
      <App />
    </MotionProvider>,
  );
  