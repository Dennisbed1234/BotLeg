/* TradeClaw bootstrap — loads working app logic from last good commit */
(function () {
  var COMMIT = '13c5b729030c7b93f124e13d1604ec45afb5ea2a';
  var url = 'https://cdn.jsdelivr.net/gh/Dennisbed1234/TradeClaw@' + COMMIT + '/app.js';
  var s = document.createElement('script');
  s.src = url;
  s.async = false;
  s.onerror = function () {
    // Fallback: fetch + eval if CDN script tag blocked
    fetch(url)
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(function (code) {
        code = code.split('Meme Pump').join('TradeClaw');
        (0, eval)(code);
      })
      .catch(function (e) {
        var el = document.createElement('div');
        el.style.cssText = 'position:fixed;inset:0;background:#0a0a0f;color:#ff5252;display:flex;align-items:center;justify-content:center;font-family:sans-serif;text-align:center;padding:24px;z-index:99999';
        el.innerHTML = '<div><b>TradeClaw failed to load app logic.</b><br><br>' + (e.message || e) +
          '<br><br>On GitHub → restore <code>app.js</code> from commit <code>13c5b729</code>.</div>';
        document.body.appendChild(el);
      });
  };
  s.onload = function () {
    // Brand polish after remote script loads
    try {
      document.title = 'TradeClaw — AI Meme Trading';
      var b = document.querySelector('.nav-brand');
      if (b) b.innerHTML = 'TradeClaw <span>●</span>';
    } catch (e) {}
  };
  document.head.appendChild(s);
})();
