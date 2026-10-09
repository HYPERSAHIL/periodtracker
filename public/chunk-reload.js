/**
 * Chunk-load recovery. Lives in its own file rather than inline in index.html
 * because the worker CSP is script-src 'self' plus the Cloudflare beacon origin:
 * an inline script is blocked outright, so an inline recovery would silently
 * never run in production.
 *
 * A deploy purges the hashed bundle the previous shell pointed at. The module
 * never executes and the page sits blank with no error. One reload fetches the
 * fresh shell; the guard stops it looping when a file is genuinely missing.
 */
(function () {
  var reloading = false;

  addEventListener(
    'error',
    function (e) {
      var el = e.target;
      var src = el && (el.src || el.href);
      if (!src || src.indexOf('/assets/') === -1 || reloading) return;
      reloading = true;
      location.reload();
    },
    true
  );

  setTimeout(function () {
    var root = document.getElementById('root');
    if (!reloading && root && !root.childElementCount) {
      reloading = true;
      location.reload();
    }
  }, 4000);
})();
