// Ikony SVG (24 × 24, kreska w kolorze tekstu). Funkcje mogą dodawać własne przez addToolbarButton({ icon: '<svg…>' }).
const svg = (body) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const icons = {
  top: svg('<rect x="3.5" y="3.5" width="17" height="17" rx="1.5"/><path d="M3.5 10h8v10.5M11.5 3.5V7M15 10h5.5"/>'),
  orbit: svg('<path d="M12 3l7 4v9l-7 4-7-4V7z"/><path d="M5 7l7 4 7-4M12 11v9"/>'),
  walk: svg('<circle cx="12" cy="4.5" r="1.8"/><path d="M12 7.5v6l-3 6.5M12 13.5l3.5 6.5M8 10.5l4-2 3.5 2.5"/>'),
  rooms: svg('<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>'),
  roof: svg('<path d="M3 12l9-7.5 9 7.5"/><path d="M6 10.5V20h12v-9.5"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.2 5.2L7 7M17 17l1.8 1.8M5.2 18.8L7 17M17 7l1.8-1.8"/>'),
  moon: svg('<path d="M20 14.5A8.5 8.5 0 019.5 4a7 7 0 1010.5 10.5z"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  level: svg('<path d="M12 4l9 4.5-9 4.5-9-4.5z"/><path d="M3 13l9 4.5 9-4.5"/>'),
};
