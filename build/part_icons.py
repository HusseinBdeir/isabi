# Authentic brand logos and crisp institutional SVG icons for ISABI Systems PWA
# Replaces all OS cartoon emojis (e.g., PS5 gamepad 🎮, speech bubble 💬, robot 🤖) with vector SVGs.

def _stroke_svg(inner, cls="ic", vb="0 0 24 24"):
    return (
        f'<svg class="{cls}" viewBox="{vb}" width="1em" height="1em" fill="none" '
        f'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" '
        f'aria-hidden="true">{inner}</svg>'
    )


ICONS = {
    # 1. Official WhatsApp Brand Logo (speech bubble ring with tail + telephone handset inside)
    "wa": (
        '<svg class="ic ic-wa" viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true">'
        '<path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38'
        'c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2z'
        'm0 18.15c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.26 8.26 0 01-1.26-4.38'
        'c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 012.41 5.82c0 4.54-3.7 8.24-8.23 8.24z'
        'm4.52-6.17c-.25-.12-1.47-.72-1.7-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06'
        '-.25-.12-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43'
        '.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48'
        'c-.17 0-.43.06-.66.31-.23.25-.87.85-.87 2.07 0 1.22.89 2.4 1.01 2.57.12.17 1.75 2.67 4.24 3.74'
        '.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18'
        '-.06-.1-.23-.17-.48-.29z"/></svg>'
    ),

    # 2. Official ISABI / Ask ISABI Rev 10 "II" Double-Rule Badge (replaces cartoon robot 🤖)
    "ai": (
        '<svg class="ic ic-isabi" viewBox="0 0 120 120" width="1em" height="1em" aria-hidden="true">'
        '<rect width="120" height="120" rx="26" fill="#0B1730"/>'
        '<g transform="translate(39.52,77.62) scale(0.74)">'
        '<g fill="#F4F2EE"><path transform="translate(-8.45,0)" d="M8.45 0V-68.75H28.81V0Z"/>'
        '<path transform="translate(-10.45,0)" d="M45.75 0V-68.75H66.11V0Z"/></g>'
        '<g fill="#D9A54A"><rect x="0" y="9.5" width="55.66" height="3.4"/>'
        '<rect x="0" y="17.5" width="55.66" height="3.4"/></g></g></svg>'
    ),

    # Bare ISABI II mark (adapts to button/tab text color + brass double rule)
    "ai_mark": (
        '<svg class="ic ic-isabi-mark" viewBox="-9.5 -78.8 74.66 109.7" width="1em" height="1em" aria-hidden="true">'
        '<g fill="currentColor"><path transform="translate(-8.45,0)" d="M8.45 0V-68.75H28.81V0Z"/>'
        '<path transform="translate(-10.45,0)" d="M45.75 0V-68.75H66.11V0Z"/></g>'
        '<g fill="#D9A54A"><rect x="0" y="9.5" width="55.66" height="4.2"/>'
        '<rect x="0" y="18.5" width="55.66" height="4.2"/></g></svg>'
    ),

    # 3. Official Microsoft 4-Square Logo
    "ms": (
        '<svg class="ic ic-ms" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true">'
        '<rect x="2.5" y="2.5" width="8.8" height="8.8" fill="#F25022"/>'
        '<rect x="12.7" y="2.5" width="8.8" height="8.8" fill="#7FBA00"/>'
        '<rect x="2.5" y="12.7" width="8.8" height="8.8" fill="#00A4EF"/>'
        '<rect x="12.7" y="12.7" width="8.8" height="8.8" fill="#FFB900"/></svg>'
    ),

    # 4. Official Power BI Stepped Columns Logo
    "pbi": _stroke_svg(
        '<rect x="3" y="13" width="4.5" height="8" rx="1"/>'
        '<rect x="9.75" y="8" width="4.5" height="13" rx="1"/>'
        '<rect x="16.5" y="3" width="4.5" height="18" rx="1"/>'
    ),

    # 5. Enterprise ERP Command Console (replaces PS5 gamepad controller 🎮)
    "erp": _stroke_svg(
        '<rect x="2" y="3" width="20" height="18" rx="2.5"/>'
        '<line x1="2" y1="8" x2="22" y2="8"/>'
        '<line x1="8" y1="8" x2="8" y2="21"/>'
        '<rect x="11" y="11" width="4" height="3.5" rx="0.5"/>'
        '<rect x="16.5" y="11" width="3" height="3.5" rx="0.5"/>'
        '<line x1="11" y1="17.5" x2="19.5" y2="17.5"/>'
    ),

    # 6. Modular 18-App Ecosystem Grid (replaces jigsaw puzzle piece 🧩)
    "apps": _stroke_svg(
        '<rect x="3" y="3" width="7.5" height="7.5" rx="1.8"/>'
        '<rect x="13.5" y="3" width="7.5" height="7.5" rx="1.8"/>'
        '<rect x="3" y="13.5" width="7.5" height="7.5" rx="1.8"/>'
        '<rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.8"/>'
    ),

    # 7. Scope & Pricing Configurator Sliders (replaces wrench/hammer 🛠️)
    "scope": _stroke_svg(
        '<line x1="4" y1="6" x2="20" y2="6"/>'
        '<line x1="4" y1="12" x2="20" y2="12"/>'
        '<line x1="4" y1="18" x2="20" y2="18"/>'
        '<circle cx="9" cy="6" r="2.2" fill="currentColor"/>'
        '<circle cx="15" cy="12" r="2.2" fill="currentColor"/>'
        '<circle cx="10" cy="18" r="2.2" fill="currentColor"/>'
    ),

    # 8. POS Till & Thermal Receipt Printer (replaces 🖨️)
    "pos": _stroke_svg(
        '<path d="M6 9V3h12v6"/>'
        '<rect x="3" y="9" width="18" height="8" rx="2"/>'
        '<path d="M6 14h12v7l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5V14z"/>'
    ),

    # 9. Biometric Face & PIN Gate Kiosk (replaces 📸)
    "kiosk": _stroke_svg(
        '<path d="M3 7V5a2 2 0 0 1 2-2h2"/>'
        '<path d="M17 3h2a2 2 0 0 1 2 2v2"/>'
        '<path d="M21 17v2a2 2 0 0 1-2 2h-2"/>'
        '<path d="M7 21H5a2 2 0 0 1-2-2v-2"/>'
        '<circle cx="12" cy="10" r="3"/>'
        '<path d="M7.5 17.5a5.5 5.5 0 0 1 9 0"/>'
    ),

    # 10. Industry Verticals & App Icons
    "holding": _stroke_svg(
        '<line x1="3" y1="21" x2="21" y2="21"/>'
        '<line x1="4" y1="18" x2="20" y2="18"/>'
        '<polygon points="12 3 21 8 3 8 12 3"/>'
        '<line x1="6" y1="8" x2="6" y2="18"/>'
        '<line x1="10" y1="8" x2="10" y2="18"/>'
        '<line x1="14" y1="8" x2="14" y2="18"/>'
        '<line x1="18" y1="8" x2="18" y2="18"/>'
    ),
    "hospitality": _stroke_svg(
        '<path d="M2 18c2.5 0 2.5-1.5 5-1.5s2.5 1.5 5 1.5 2.5-1.5 5-1.5 2.5 1.5 5 1.5"/>'
        '<path d="M2 21.5c2.5 0 2.5-1.5 5-1.5s2.5 1.5 5 1.5 2.5-1.5 5-1.5 2.5 1.5 5 1.5"/>'
        '<path d="M8 14a4 4 0 0 1 8 0"/>'
        '<line x1="12" y1="5" x2="12" y2="7"/>'
        '<line x1="5.6" y1="7.6" x2="7" y2="9"/>'
        '<line x1="18.4" y1="7.6" x2="17" y2="9"/>'
    ),
    "trading": _stroke_svg(
        '<rect x="1.5" y="4" width="13.5" height="12" rx="1.5"/>'
        '<path d="M15 8h4l3 3.5V16h-7V8z"/>'
        '<circle cx="6" cy="18" r="2.2"/>'
        '<circle cx="18.5" cy="18" r="2.2"/>'
    ),
    "manufacturing": _stroke_svg(
        '<path d="M3 21h18"/>'
        '<path d="M4 21V8l5 3V8l5 3V5h6v16"/>'
        '<line x1="16.5" y1="9" x2="18" y2="9"/>'
        '<line x1="16.5" y1="13" x2="18" y2="13"/>'
        '<line x1="16.5" y1="17" x2="18" y2="17"/>'
    ),
    "fleet": _stroke_svg(
        '<circle cx="6" cy="18" r="2.2"/>'
        '<circle cx="18" cy="18" r="2.2"/>'
        '<path d="M3.8 18H2V7a1 1 0 0 1 1-1h9l3 5h5a2 2 0 0 1 2 2v5h-1.8"/>'
        '<line x1="8.2" y1="18" x2="15.8" y2="18"/>'
        '<path d="M5 6l2-3h5l2 3"/>'
    ),
    "realestate": _stroke_svg(
        '<rect x="4" y="3" width="9" height="18" rx="1"/>'
        '<path d="M13 9h7v12h-7"/>'
        '<line x1="7" y1="7" x2="10" y2="7"/>'
        '<line x1="7" y1="11" x2="10" y2="11"/>'
        '<line x1="7" y1="15" x2="10" y2="15"/>'
        '<line x1="16" y1="13" x2="17.5" y2="13"/>'
        '<line x1="16" y1="17" x2="17.5" y2="17"/>'
    ),
    "insurance": _stroke_svg(
        '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'
        '<path d="m9 12 2 2 4-4"/>'
    ),
    "ledger": _stroke_svg(
        '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>'
        '<path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'
        '<line x1="8.5" y1="7" x2="16" y2="7"/>'
        '<line x1="8.5" y1="11" x2="16" y2="11"/>'
    ),
    "soa": _stroke_svg(
        '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>'
        '<polyline points="14 2 14 8 20 8"/>'
        '<line x1="8" y1="13" x2="16" y2="13"/>'
        '<line x1="8" y1="17" x2="16" y2="17"/>'
    ),
    "scale": _stroke_svg(
        '<line x1="12" y1="3" x2="12" y2="21"/>'
        '<line x1="5" y1="7" x2="19" y2="7"/>'
        '<path d="M5 7 2.5 14h5L5 7z"/>'
        '<path d="m19 7-2.5 7h5L19 7z"/>'
        '<line x1="8" y1="21" x2="16" y2="21"/>'
    ),
    "ar": _stroke_svg(
        '<rect x="2" y="5" width="20" height="14" rx="2"/>'
        '<line x1="2" y1="10" x2="22" y2="10"/>'
        '<line x1="6" y1="15" x2="11" y2="15"/>'
    ),
    "partner": _stroke_svg(
        '<circle cx="9" cy="12" r="5.5"/>'
        '<circle cx="15" cy="12" r="5.5"/>'
    ),
    "hr": _stroke_svg(
        '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>'
        '<circle cx="9" cy="7" r="4"/>'
        '<path d="M22 21v-2a4 4 0 0 0-3-3.87"/>'
        '<path d="M16 3.13a4 4 0 0 1 0 7.75"/>'
    ),
    "dataverse": _stroke_svg(
        '<ellipse cx="12" cy="5" rx="8" ry="3"/>'
        '<path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5"/>'
        '<path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3"/>'
    ),
    "layers": _stroke_svg(
        '<polygon points="12 2 2 7 12 12 22 7 12 2"/>'
        '<polyline points="2 12 12 17 22 12"/>'
        '<polyline points="2 17 12 22 22 17"/>'
    ),
    "compare": _stroke_svg(
        '<rect x="3" y="3" width="7.5" height="18" rx="1.5"/>'
        '<rect x="13.5" y="3" width="7.5" height="18" rx="1.5"/>'
    ),
    "roi": _stroke_svg(
        '<rect x="4" y="2" width="16" height="20" rx="2"/>'
        '<line x1="8" y1="6" x2="16" y2="6"/>'
        '<line x1="8" y1="11" x2="10" y2="11"/>'
        '<line x1="14" y1="11" x2="16" y2="11"/>'
        '<line x1="8" y1="15" x2="10" y2="15"/>'
        '<line x1="14" y1="15" x2="16" y2="15"/>'
    ),
    "award": _stroke_svg(
        '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'
    ),
    "diamond": _stroke_svg(
        '<polygon points="6 3 18 3 22 9 12 21 2 9 6 3"/>'
        '<line x1="2" y1="9" x2="22" y2="9"/>'
    ),
    "calendar": _stroke_svg(
        '<rect x="3" y="4" width="18" height="18" rx="2"/>'
        '<line x1="16" y1="2" x2="16" y2="6"/>'
        '<line x1="8" y1="2" x2="8" y2="6"/>'
        '<line x1="3" y1="10" x2="21" y2="10"/>'
    ),
    "bolt": _stroke_svg(
        '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>'
    ),
    "trend": _stroke_svg(
        '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>'
        '<polyline points="16 7 22 7 22 13"/>'
    ),
    "lock": _stroke_svg(
        '<rect x="4" y="11" width="16" height="10" rx="2"/>'
        '<path d="M8 11V7a4 4 0 0 1 8 0v4"/>'
    ),
    "key": _stroke_svg(
        '<circle cx="7.5" cy="15.5" r="4.5"/>'
        '<path d="m10.7 12.3 9.3-9.3 2 2-2.5 2.5 2 2-2.5 2.5-2-2"/>'
    ),
    "search": _stroke_svg(
        '<circle cx="11" cy="11" r="7"/>'
        '<line x1="21" y1="21" x2="16.05" y2="16.05"/>'
    ),
    "mail": _stroke_svg(
        '<rect x="2" y="4" width="20" height="16" rx="2"/>'
        '<path d="m22 6-10 7L2 6"/>'
    ),
    "phone": _stroke_svg(
        '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.58 2.81.7A2 2 0 0 1 22 16.92z"/>'
    ),
    "copy": _stroke_svg(
        '<rect x="8" y="2" width="8" height="4" rx="1"/>'
        '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>'
    ),
    "clock": _stroke_svg(
        '<circle cx="12" cy="12" r="9"/>'
        '<polyline points="12 7 12 12 15 15"/>'
    ),
    "sync": _stroke_svg(
        '<path d="M21 12a9 9 0 0 0-15.36-6.36L3 8"/>'
        '<polyline points="3 3 3 8 8 8"/>'
        '<path d="M3 12a9 9 0 0 0 15.36 6.36L21 16"/>'
        '<polyline points="16 16 21 16 21 21"/>'
    ),
    "box": _stroke_svg(
        '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>'
        '<polyline points="3.27 6.96 12 12.01 20.73 6.96"/>'
        '<line x1="12" y1="22.08" x2="12" y2="12"/>'
    ),
    "bell": _stroke_svg(
        '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>'
        '<path d="M13.73 21a2 2 0 0 1-3.46 0"/>'
    ),
    "globe": _stroke_svg(
        '<circle cx="12" cy="12" r="9"/>'
        '<line x1="3" y1="12" x2="21" y2="12"/>'
        '<path d="M12 3a14.5 14.5 0 0 0 0 18 14.5 14.5 0 0 0 0-18z"/>'
    ),
    "faq": _stroke_svg(
        '<circle cx="12" cy="12" r="9"/>'
        '<path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>'
        '<line x1="12" y1="17" x2="12.01" y2="17"/>'
    ),
    "sun": _stroke_svg(
        '<circle cx="12" cy="12" r="4"/>'
        '<line x1="12" y1="2" x2="12" y2="4"/>'
        '<line x1="12" y1="20" x2="12" y2="22"/>'
        '<line x1="4.93" y1="4.93" x2="6.34" y2="6.34"/>'
        '<line x1="17.66" y1="17.66" x2="19.07" y2="19.07"/>'
        '<line x1="2" y1="12" x2="4" y2="12"/>'
        '<line x1="20" y1="12" x2="22" y2="12"/>'
    ),
    "moon": _stroke_svg(
        '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>'
    ),
    "pin": _stroke_svg(
        '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>'
        '<circle cx="12" cy="10" r="3"/>'
    ),
    "download": _stroke_svg(
        '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>'
        '<polyline points="7 10 12 15 17 10"/>'
        '<line x1="12" y1="15" x2="12" y2="3"/>'
    ),
    "user": _stroke_svg(
        '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>'
        '<circle cx="12" cy="7" r="4"/>'
    ),
    "mobile": _stroke_svg(
        '<rect x="5" y="2" width="14" height="20" rx="2"/>'
        '<line x1="12" y1="18" x2="12.01" y2="18"/>'
    ),
    "folder": _stroke_svg(
        '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>'
    ),
    "check": _stroke_svg(
        '<circle cx="12" cy="12" r="9"/>'
        '<path d="m8.5 12.5 2.3 2.3 4.7-4.8"/>',
        cls="ic ic-good"
    ),
    "warn": _stroke_svg(
        '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>'
        '<line x1="12" y1="9" x2="12" y2="13"/>'
        '<line x1="12" y1="17" x2="12.01" y2="17"/>',
        cls="ic ic-warn"
    ),
    "cross": _stroke_svg(
        '<circle cx="12" cy="12" r="9"/>'
        '<line x1="15" y1="9" x2="9" y2="15"/>'
        '<line x1="9" y1="9" x2="15" y2="15"/>',
        cls="ic ic-crit"
    ),
}
