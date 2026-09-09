import { createRoot } from "react-dom/client";
import { Overlay } from "../../../packages/presentation-renderer/src/index.js";
import "./style.css";
import "./choreography.css";
createRoot(document.getElementById("root")!).render(<Overlay />);
