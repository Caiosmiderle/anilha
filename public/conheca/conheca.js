// Anilha landing: finds the right install steps for the
// device, offers the one-tap install when the browser allows it, and notices in-app
// browsers (Instagram, Facebook, TikTok), where installing is impossible.
(function () {
  'use strict';
  var ua = navigator.userAgent || '';
  var $$ = function (sel) {
    return Array.prototype.slice.call(document.querySelectorAll(sel));
  };
  var show = function (sel, on) {
    $$(sel).forEach(function (el) {
      el.hidden = !on;
    });
  };

  var isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  var isAndroid = /Android/i.test(ua);
  var inApp =
    /Instagram|FBAN|FBAV|FB_IAB|FBIOS|TikTok|musical_ly|BytedanceWebview|Line\/|LinkedInApp|Snapchat|Twitter|GSA\//.test(
      ua,
    );
  var standalone =
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    navigator.standalone === true;
  // Safari 26 keeps "OS 18_x" in the agent string but reports Version/26.
  var iosVersion = (function () {
    var v = /Version\/(\d+)/.exec(ua);
    if (v) return Number(v[1]);
    var os = /OS (\d+)_/.exec(ua);
    return os ? Number(os[1]) : 0;
  })();

  /* Install: already installed, in-app browser, or the right tab first. */
  if (standalone) {
    show('[data-installed]', true);
    show('[data-install-box]', false);
    show('[data-install-help]', false);
  }
  if (inApp && !standalone) {
    show('[data-inapp]', true);
    show('[data-inapp-android]', isAndroid || !isIOS);
    show('[data-inapp-ios]', isIOS || !isAndroid);
    if (isAndroid) {
      var chrome = document.querySelector('[data-open-chrome]');
      if (chrome) {
        chrome.href =
          'intent://' +
          location.host +
          location.pathname +
          '#Intent;scheme=https;package=com.android.chrome;end';
        chrome.hidden = false;
      }
    }
  }
  $$('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var done = function () {
        show('[data-copied]', true);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(location.origin + location.pathname).then(done, function () {
          window.prompt('Copie o link:', location.origin + location.pathname);
        });
      } else {
        window.prompt('Copie o link:', location.origin + location.pathname);
      }
    });
  });

  // Tabs with arrow keys, the device's tab first.
  var tabs = $$('[role="tab"]');
  function select(tab, focus) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      var panel = document.getElementById(t.getAttribute('aria-controls'));
      if (panel) panel.hidden = !on;
    });
    if (focus) tab.focus();
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () {
      select(t, false);
    });
    t.addEventListener('keydown', function (e) {
      var next = null;
      if (e.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
      if (e.key === 'ArrowLeft') next = tabs[(i - 1 + tabs.length) % tabs.length];
      if (e.key === 'Home') next = tabs[0];
      if (e.key === 'End') next = tabs[tabs.length - 1];
      if (next) {
        e.preventDefault();
        select(next, true);
      }
    });
  });
  var first = document.getElementById(isIOS ? 'tab-iphone' : isAndroid ? 'tab-android' : 'tab-pc');
  if (first) select(first, false);

  // iPhone: the steps for this iOS first.
  if (isIOS) {
    var box = document.querySelector('.ios-versions');
    var mine = document.querySelector('[data-ios="' + (iosVersion >= 26 ? '26' : '18') + '"]');
    if (box && mine) box.insertBefore(mine, box.firstChild);
  }

  // One-tap install where the browser offers it (Chrome, Edge, Samsung Internet).
  var deferred = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    show('[data-install]', true);
    show('[data-install-row]', true);
  });
  $$('[data-install]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (!deferred) return;
      deferred.prompt();
      deferred.userChoice.then(function () {
        deferred = null;
        show('[data-install]', false);
        show('[data-install-row]', false);
      });
    });
  });
  window.addEventListener('appinstalled', function () {
    show('[data-install]', false);
    show('[data-install-row]', false);
    show('[data-installed]', true);
  });
})();
