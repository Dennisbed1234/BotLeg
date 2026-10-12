/* TradeClaw — loads full app logic from last known-good commit; API calls stay on this domain */
(function () {
  var COMMIT = '13c5b729030c7b93f124e13d1604ec45afb5ea2a';
  var url = 'https://cdn.jsdelivr.net/gh/Dennisbed1234/TradeClaw@' + COMMIT + '/app.js';
  fetch(url)
    .then(function (r) {
      if (!r.ok) throw new Error('Failed to load app.js (' + r.status + ')');
      return r.text();
    })
    .then(function (code) {
      code = code.split('Meme Pump').join('TradeClaw');
      // eslint-disable-next-line no-eval
      eval(code);
    })
    .catch(function (e) {
      console.error(e);
      var el = document.createElement('div');
      el.style.cssText = 'position:fixed;inset:0;background:#0a0a0f;color:#ff5252;display:flex;align-items:center;justify-content:center;font-family:sans-serif;text-align:center;padding:24px;z-index:99999';
      el.innerHTML = '<div><b>TradeClaw failed to load.</b><br><br>' + (e.message || e) +
        '<br><br>Restore app.js from GitHub commit 13c5b729.</div>';
      document.body.appendChild(el);
    });
})();
