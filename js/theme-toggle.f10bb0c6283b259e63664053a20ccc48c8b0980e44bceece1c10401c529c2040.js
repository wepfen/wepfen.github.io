
(function () {
  // Set theme on load from localStorage
  const saved = localStorage.getItem('darkTheme');
  document.body.setAttribute('a', saved === 'true' ? 'dark' : 'light');
  document.documentElement.classList.add(saved);

  // Expose toggleTheme function globally
  window.toggleTheme = function () {
    const isDark = document.body.getAttribute('a') === 'dark';
    const next = !isDark;
    document.body.setAttribute('a', next ? 'dark' : 'light');
    localStorage.setItem('darkTheme', next);
  };
})();
