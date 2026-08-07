import React from "react";
import { createRoot } from "react-dom/client";
import { Popup } from "./popup";

const container = document.getElementById("root");
if (!container) throw new Error("popup root element missing");
createRoot(container).render(<Popup />);
