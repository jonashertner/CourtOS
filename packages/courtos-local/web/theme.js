// Runs before the page is drawn, so a dark page never flashes white first.
// Light is the default; dark is a choice kept in this browser (see shared.js).
try {
  if (localStorage.getItem("courtos.theme") === "dark") document.documentElement.dataset.theme = "dark";
} catch { /* storage may be blocked: light */ }
