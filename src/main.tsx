import React from "react";
import ReactDOM from "react-dom/client";
import "@xyflow/react/dist/style.css";
import "./styles.css";
import { App } from "./App";
import { AuthGate } from "./components/AuthGate";
import { isCloudMode } from "./data/storage";
const application = isCloudMode ? (
  <AuthGate>
    <App />
  </AuthGate>
) : (
  <App />
);
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{application}</React.StrictMode>,
);
