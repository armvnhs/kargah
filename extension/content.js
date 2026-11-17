(function () {
  'use strict';

  var flushing = false;

  function flush() {
    if (flushing) return;
    flushing = true;

    chrome.storage.local.get({ queue: [] }, function (data) {
      var queue = Array.isArray(data.queue) ? data.queue : [];
      if (!queue.length) {
        flushing = false;
        return;
      }

      window.postMessage({ type: 'kargah:quick-add', items: queue }, '*');

      chrome.storage.local.set({ queue: [] }, function () {
        flushing = false;
      });
    });
  }

  chrome.runtime.onMessage.addListener(function (message) {
    if (!message || message.type !== 'kargah:flush') return;
    flush();
  });

  flush();
  window.addEventListener('load', flush);
  setTimeout(flush, 1200);
})();
