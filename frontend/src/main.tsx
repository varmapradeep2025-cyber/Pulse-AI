import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { checkTranslations } from "./data/translations";
import "./index.css";

if (import.meta.env.DEV) {
  const problems = checkTranslations();
  if (problems.length > 0) {
    console.warn(
      "[translations] Missing or empty translation keys:",
      problems,
    );
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);