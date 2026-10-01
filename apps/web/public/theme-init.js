// Applies the saved theme before first paint (no flash). A same-origin file, so the CSP
// (`script-src 'self'`) allows it; dark is the default set in index.html.
(function () {
  try {
    if (window.localStorage.getItem('watchparty-theme') === 'light') {
      document.documentElement.classList.remove('dark');
      document.documentElement.style.colorScheme = 'light';
    }
  } catch {
    // Storage can be unavailable (private mode, blocked site data): keep the default.
  }
})();
