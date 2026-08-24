import "@founderhq/design-tokens/css";
import { createRoot } from "react-dom/client";
import { DesktopApp } from "./desktop-app";
import "./styles.css";
createRoot(document.getElementById("root")!).render(<DesktopApp />);
