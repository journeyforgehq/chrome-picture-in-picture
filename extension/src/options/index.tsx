import React from "react";
import { createRoot } from "react-dom/client";
import { Options } from "./options";

const container = document.getElementById("root");
if (!container) throw new Error("options root element missing");
createRoot(container).render(<Options />);
