import React from "react";
import ReactDOM from "react-dom/client";
import { FluentProvider, webDarkTheme } from "@fluentui/react-components";
import App from "./App";
import "./assets/styles.css";

ReactDOM.createRoot(document.getElementById("app") as HTMLElement).render(
  <React.StrictMode>
    <FluentProvider theme={webDarkTheme} className="h-screen w-screen overflow-hidden bg-neutral-900 text-neutral-100">
      <App />
    </FluentProvider>
  </React.StrictMode>
);
