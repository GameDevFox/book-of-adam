import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";

import { initAnalytics } from "./analytics";
import { ROUTES } from "./routes";
import "./index.css";

initAnalytics();

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");
createRoot(root).render(
  <StrictMode>
    <RouterProvider router={createBrowserRouter(ROUTES)} />
  </StrictMode>,
);
