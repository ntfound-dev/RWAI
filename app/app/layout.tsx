import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/layout/Providers";

export const metadata: Metadata = {
  title: "RWAi — AI-Native Real World Assets on Mantle",
  description: "Four ERC-8004 sovereign AI agents tokenize real-world assets and manage portfolios on Mantle Network.",
};

// Suppress unhandled errors thrown by browser extensions so they don't
// surface as Next.js dev-mode overlays inside our app.
const _suppressExtensionErrors = `
(function(){
  var _onError = window.onerror;
  window.onerror = function(msg, src) {
    if (src && src.startsWith('chrome-extension://')) return true;
    return _onError ? _onError.apply(this, arguments) : false;
  };
  window.addEventListener('unhandledrejection', function(e) {
    var s = e.reason && (e.reason.stack || e.reason.message || String(e.reason));
    if (s && s.includes('chrome-extension://')) e.preventDefault();
  });
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: _suppressExtensionErrors }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
