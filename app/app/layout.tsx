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
  var BAD = ['chrome-extension://', 'not been authorized yet', 'WalletConnect', 'translate.googleapis'];
  function isBad(s){ return s && BAD.some(function(b){ return String(s).indexOf(b) !== -1; }); }
  var _onError = window.onerror;
  window.onerror = function(msg, src, line, col, err){
    if(isBad(src) || isBad(msg) || isBad(err && err.message)) return true;
    return _onError ? _onError.apply(this, arguments) : false;
  };
  window.addEventListener('error', function(e){
    if(isBad(e.filename) || isBad(e.message)) e.stopImmediatePropagation();
  }, true);
  window.addEventListener('unhandledrejection', function(e){
    var s = e.reason && (e.reason.stack || e.reason.message || String(e.reason));
    if(isBad(s)) e.preventDefault();
  });
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" translate="no">
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
