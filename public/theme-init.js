// Applies a theme chosen in Ajustes before the first paint, so a dark choice never
// flashes light. A separate file because the CSP blocks inline scripts.
try {
  var theme = JSON.parse(localStorage.getItem('anilha:ajustes') || '{}').theme;
  if (theme === 'dark' || theme === 'light') {
    document.documentElement.dataset.theme = theme;
    // The system bar follows the chosen theme, not the phone's.
    var bar = theme === 'dark' ? '#0f1012' : '#fafafa';
    document.querySelectorAll('meta[name="theme-color"]').forEach(function (m) {
      m.setAttribute('content', bar);
    });
  }
} catch {
  // No storage: automatic theme.
}

// The installed iPad app: iPadOS 26 draws a glass blur over the top of the page that no
// CSS or meta tag turns off. The layout leaves that band empty (--edge-ramp in app.css).
try {
  var ua = navigator.userAgent;
  var ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  var installed =
    navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  if (ipad && installed) document.documentElement.setAttribute('data-ipad-app', '');
} catch {
  // Detection failed: the normal layout.
}
