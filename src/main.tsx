import React from "react";
import ReactDOM from "react-dom/client";
import {
  FluentProvider,
  webDarkTheme,
  type Theme,
} from "@fluentui/react-components";
import App from "./App";
import "./styles/index.css";

const customTheme: Partial<Theme> = {
  ...webDarkTheme,
  borderRadiusMedium: "6px",
  borderRadiusLarge: "8px",
  fontFamilyBase: '"Segoe UI Variable", "Segoe UI", system-ui, sans-serif',
};

ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement,
).render(
  <React.StrictMode>
    <FluentProvider theme={customTheme as Theme} style={{ height: "100%", background: "transparent" }}>
      <App />
    </FluentProvider>
  </React.StrictMode>,
);
