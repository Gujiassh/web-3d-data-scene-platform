import React from "react";
import { createRoot } from "react-dom/client";

import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@web3d/demo-support/theme.css";

import { App } from "./App";
import "./styles.css";

const root = document.querySelector<HTMLDivElement>("#root");

if (!root) {
  throw new Error("Factory Demo root element was not found.");
}

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
