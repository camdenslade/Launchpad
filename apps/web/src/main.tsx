import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Fonts are bundled from npm (not a CDN) so self-hosted installs work offline.
import "@fontsource-variable/inter";
import "@fontsource-variable/outfit";
import App from "./App.js";
import { BRAND } from "./brand.js";

document.title = BRAND.name;

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element #root not found");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
