import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Vacly Nóminas - Sistema Inteligente de Gestión",
  description: "Procesamiento inteligente de nóminas con IA",
};

// Client-side protection script
const protectionScript = `
(function() {
  'use strict';
  
  // Disable right-click context menu
  document.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    return false;
  });
  
  // Disable F12, Ctrl+Shift+I, Ctrl+U, etc.
  document.addEventListener('keydown', function(e) {
    // F12 or Ctrl+Shift+I or Ctrl+Shift+C or Ctrl+U
    if (e.keyCode === 123 || 
        (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 67)) ||
        (e.ctrlKey && e.keyCode === 85)) {
      e.preventDefault();
      return false;
    }
  });
  
  // Detect developer tools
  let devtools = {open: false, orientation: null};
  const threshold = 160;
  
  setInterval(function() {
    if (window.outerHeight - window.innerHeight > threshold || 
        window.outerWidth - window.innerWidth > threshold) {
      if (!devtools.open) {
        devtools.open = true;
        // Redirect or show warning when dev tools detected
        document.body.style.display = 'none';
        alert('⚠️ Acceso no autorizado detectado. La aplicación se ha bloqueado por seguridad.');
        window.location.href = 'about:blank';
      }
    } else {
      devtools.open = false;
    }
  }, 500);
  
  // Disable text selection
  document.onselectstart = function() {
    return false;
  };
  
  // Disable drag
  document.ondragstart = function() {
    return false;
  };
  
  // Clear console
  if (typeof console !== 'undefined') {
    console.clear();
    Object.defineProperty(console, 'clear', {
      value: function() {},
      writable: false
    });
  }
  
  // Disable console methods in production
  if (process.env.NODE_ENV === 'production') {
    const methods = ['log', 'debug', 'info', 'warn'];
    methods.forEach(method => {
      console[method] = function() {};
    });
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <head>
        <script dangerouslySetInnerHTML={{ __html: protectionScript }} />
        <meta name="robots" content="noindex, nofollow" />
        <meta name="googlebot" content="noindex, nofollow" />
      </head>
      <body
        className={`${inter.variable} antialiased`}
        style={{ 
          userSelect: 'none', 
          WebkitUserSelect: 'none',
          MozUserSelect: 'none',
          msUserSelect: 'none'
        }}
      >
        {children}
      </body>
    </html>
  );
}
