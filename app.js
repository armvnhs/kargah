/* کارگاه — دفترچهٔ برنامه‌ریزی شخصی */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* ثابت‌ها                                                             */
  /* ------------------------------------------------------------------ */

  var KEY = 'kargah.v1';

  var MONTHS = [
    'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
    'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
  ];
  var WEEKDAYS_SHORT = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
  var STATUS_ORDER = ['plan', 'active', 'review', 'done'];
  var STATUS = {
    plan: 'برنامه‌ریزی',
    active: 'در حال انجام',
    review: 'بازبینی',
    done: 'تحویل شده',
  };
  var INCOME_CATEGORIES = ['حقوق', 'پروژه', 'فروش', 'مشاوره', 'سود سرمایه', 'هدیه', 'سایر'];
  var EXPENSE_CATEGORIES = [
    'مسکن و اجاره',
    'خوراک و خرید',
    'حمل‌ونقل',
    'قبوض و اشتراک',
    'درمان و سلامت',
    'آموزش',
    'پوشاک',
    'تفریح',
    'هدیه و خیریه',
    'سایر',
  ];

  var CAL_ICON =
    '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">' +
    '<rect x="3.5" y="5.5" width="17" height="15" rx="3.5"/><path d="M8 3v4M16 3v4M3.5 10.5h17"/></svg>';

  /* ------------------------------------------------------------------ */
  /* ابزارها                                                             */
  /* ------------------------------------------------------------------ */

  var FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

  function fa(value) {
    return String(value).replace(/\d/g, function (digit) {
      return FA_DIGITS[Number(digit)];
    });
  }

  var moneyFormatter = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 });

  function money(value) {
    if (state.prefs.hideAmounts) return '••••••';
    return moneyFormatter.format(value);
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function uid() {
    return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  }

  function dateToISO(date) {
    var month = String(date.getMonth() + 1).padStart(2, '0');
    var day = String(date.getDate()).padStart(2, '0');
    return date.getFullYear() + '-' + month + '-' + day;
  }

  function isoToDate(iso) {
    var parts = iso.split('-').map(Number);
    return new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
  }

  function addDays(iso, days) {
    var date = isoToDate(iso);
    date.setDate(date.getDate() + days);
    return dateToISO(date);
  }

  function todayISO() {
    return dateToISO(new Date());
  }

  var PERSIAN_PARTS = new Intl.DateTimeFormat('en-US-u-ca-persian', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });

  function jalaliOf(iso) {
    var parts = PERSIAN_PARTS.formatToParts(isoToDate(iso));
    function pick(type) {
      var found = parts.filter(function (part) {
        return part.type === type;
      })[0];
      return Number(found ? found.value : 0);
    }
    return { jy: pick('year'), jm: pick('month'), jd: pick('day') };
  }

  function currentJalali() {
    return jalaliOf(todayISO());
  }

  var monthStartCache = {};

  function monthStartISO(jy, jm) {
    var key = jy + '-' + jm;
    if (monthStartCache[key]) return monthStartCache[key];

    var monthsFromBase = (jy - 1400) * 12 + (jm - 1);
    var approx = addDays('2021-03-21', Math.round(monthsFromBase * 30.44));

    for (var step = -40; step <= 40; step += 1) {
      var candidate = addDays(approx, step);
      var parts = jalaliOf(candidate);
      if (parts.jy === jy && parts.jm === jm && parts.jd === 1) {
        monthStartCache[key] = candidate;
        return candidate;
      }
    }
    monthStartCache[key] = approx;
    return approx;
  }

  function isoFromJalali(jy, jm, jd) {
    return addDays(monthStartISO(jy, jm), jd - 1);
  }

  function monthLengthJalali(jy, jm) {
    var next = shiftMonth(jy, jm, 1);
    var diff =
      isoToDate(monthStartISO(next.jy, next.jm)).getTime() -
      isoToDate(monthStartISO(jy, jm)).getTime();
    return Math.round(diff / 86400000);
  }

  function weekdayIndex(iso) {
    return (isoToDate(iso).getDay() + 1) % 7;
  }

  function shiftMonth(jy, jm, delta) {
    var year = jy;
    var month = jm + delta;
    while (month < 1) {
      month += 12;
      year -= 1;
    }
    while (month > 12) {
      month -= 12;
      year += 1;
    }
    return { jy: year, jm: month };
  }

  function monthBounds(jy, jm) {
    var start = monthStartISO(jy, jm);
    var next = shiftMonth(jy, jm, 1);
    return { start: start, end: addDays(monthStartISO(next.jy, next.jm), -1) };
  }

  function monthLabel(jy, jm) {
    return MONTHS[jm - 1] + ' ' + fa(jy);
  }

  function formatDate(iso) {
    if (!iso) return '';
    var parts = jalaliOf(iso);
    return fa(parts.jd) + ' ' + MONTHS[parts.jm - 1] + ' ' + fa(parts.jy);
  }

  function formatWeekday() {
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { weekday: 'long' }).format(new Date());
  }

  function formatToday() {
    return formatWeekday() + '، ' + formatDate(todayISO());
  }

  function daysUntil(iso) {
    var diff = isoToDate(iso).getTime() - isoToDate(todayISO()).getTime();
    return Math.round(diff / 86400000);
  }

  function dueLabel(iso) {
    var days = daysUntil(iso);
    if (days === 0) return 'امروز';
    if (days === 1) return 'فردا';
    if (days === -1) return 'دیروز';
    if (days > 0) return fa(days) + ' روز مانده';
    return fa(-days) + ' روز گذشته';
  }

  function dueTone(iso) {
    var days = daysUntil(iso);
    if (days < 0) return 'overdue';
    if (days === 0) return 'today';
    return '';
  }

  function sum(list) {
    return list.reduce(function (total, item) {
      return total + item.amount;
    }, 0);
  }

  function monthTransactions(list, jy, jm) {
    var bounds = monthBounds(jy, jm);
    return list.filter(function (tx) {
      return tx.date >= bounds.start && tx.date <= bounds.end;
    });
  }

  function sortByDateDesc(list) {
    return list.slice().sort(function (a, b) {
      return b.date.localeCompare(a.date) || b.createdAt - a.createdAt;
    });
  }

  function recentMonths(count) {
    var cur = currentJalali();
    var result = [];
    for (var i = 0; i < count; i += 1) {
      result.push(shiftMonth(cur.jy, cur.jm, -i));
    }
    return result;
  }

  /* ------------------------------------------------------------------ */
  /* داده‌ها                                                             */
  /* ------------------------------------------------------------------ */

  function normalize(value) {
    var raw = value || {};
    return {
      budgets: raw.budgets && typeof raw.budgets === 'object' ? raw.budgets : {},
      goals: Array.isArray(raw.goals) ? raw.goals : [],
      accounts: Array.isArray(raw.accounts) ? raw.accounts : [],
      bills: Array.isArray(raw.bills) ? raw.bills : [],
      prefs: Object.assign({ hideAmounts: false }, raw.prefs || {}),
      shopping: Array.isArray(raw.shopping) ? raw.shopping : [],
      projects: Array.isArray(raw.projects)
        ? raw.projects.map(function (project) {
            return Object.assign({}, project, {
              tasks: Array.isArray(project.tasks) ? project.tasks : [],
            });
          })
        : [],
      transactions: Array.isArray(raw.transactions) ? raw.transactions : [],
      tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
      prices: Array.isArray(raw.prices)
        ? raw.prices.map(function (product) {
            return Object.assign({}, product, {
              entries: Array.isArray(product.entries) ? product.entries : [],
            });
          })
        : [],
    };
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      return normalize(raw ? JSON.parse(raw) : null);
    } catch (error) {
      return normalize(null);
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (error) {
      /* بی‌صدا رد می‌شود */
    }
    if (cloud.enabled && cloud.user) cloudSaveSoon();
  }

  /* ------------------------------------------------------------------ */
  /* وضعیت                                                               */
  /* ------------------------------------------------------------------ */

  var state = load();
  var tab = 'dashboard';
  var txFilter = 'all';
  var projectFilter = 'all';
  var projectFormOpen = false;
  var monthCursor = currentJalali();
  var txKind = 'income';
  var picker = null;
  var toastTimer = null;

  var draft = {
    taskTitle: '',
    watchQuery: '',
    shoppingTitle: '',
    shoppingQty: '',
    projectTitle: '',
    projectClient: '',
    projectDue: '',
    projectBudget: '',
    projectStatus: 'plan',
    txTitle: '',
    txAmount: '',
    txCategory: INCOME_CATEGORIES[0],
    txDate: todayISO(),
    goalTitle: '',
    goalTarget: '',
    goalDue: '',
    accountTitle: '',
    accountAmount: '',
    accountKind: 'asset',
    billTitle: '',
    billAmount: '',
    billDay: '1',
    budgetCategory: EXPENSE_CATEGORIES[0],
    budgetAmount: '',
    productTitle: '',
    productUnit: '',
  };

  var view = document.getElementById('view');
  var tabsEl = document.getElementById('tabs');
  var overlayRoot = document.getElementById('overlay-root');
  var toastRoot = document.getElementById('toast-root');

  /* ------------------------------------------------------------------ */
  /* ------------------------------------------------------------------ */
  /* قیمت زنده (سرور محلی)                                                */
  /* ------------------------------------------------------------------ */

  var live = { items: [], meta: {}, online: null, loading: true };
  var liveSignature = '';
  var search = { status: 'idle', q: '', results: [], error: '' };
  var busy = { search: false, watch: false, checkAll: false, items: {} };

  function api(path, body) {
    if (cloud.enabled) return cloud.api(path, body);
    var options = body
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : {};
    return fetch(path, options).then(function (response) {
      return response.text().then(function (text) {
        var payload = {};
        try {
          payload = text ? JSON.parse(text) : {};
        } catch (error) {
          payload = {};
        }
        if (!response.ok) {
          throw new Error(payload.error || 'خطای سرور (' + response.status + ')');
        }
        return payload;
      });
    });
  }

  function applyLive(payload) {
    live.items = Array.isArray(payload.items) ? payload.items : [];
    live.meta = payload.meta || {};
    liveSignature = JSON.stringify(live.items);
  }

  function loadLive(silent) {
    if (!silent) {
      live.loading = true;
      render();
    }
    return api('/api/state')
      .then(function (payload) {
        live.online = true;
        var before = liveSignature;
        applyLive(payload);
        live.loading = false;
        if (!silent || before !== liveSignature) render();
      })
      .catch(function () {
        var wasOnline = live.online;
        live.online = false;
        live.loading = false;
        if (!silent || wasOnline !== false) render();
      });
  }

  /* ------------------------------------------------------------------ */
  /* ابر: Supabase (ورود، همگام‌سازی، قیمت)                              */
  /* ------------------------------------------------------------------ */

  var CLOUD = window.KARGAH_CONFIG || null;
  var CLOUD_SESSION_KEY = 'kargah:session';
  var CLOUD_INTERVAL_HOURS = 6;

  var cloud = {
    enabled: !!(CLOUD && CLOUD.supabaseUrl && CLOUD.supabaseKey),
    session: null,
    user: null,
    saveTimer: null,
    refreshTimer: null,
  };

  function cloudHeaders(extra) {
    var headers = {
      apikey: CLOUD.supabaseKey,
      'Content-Type': 'application/json',
      Authorization:
        'Bearer ' +
        (cloud.session && cloud.session.access_token ? cloud.session.access_token : CLOUD.supabaseKey),
    };
    return extra ? Object.assign(headers, extra) : headers;
  }

  function cloudRequest(url, options) {
    return fetch(url, options).then(function (response) {
      return response.text().then(function (text) {
        var payload = {};
        try {
          payload = text ? JSON.parse(text) : {};
        } catch (error) {
          payload = {};
        }
        if (!response.ok) {
          var message =
            payload.msg ||
            payload.message ||
            payload.error_description ||
            payload.error ||
            'خطای ابر (' + response.status + ')';
          var failure = new Error(message);
          failure.status = response.status;
          throw failure;
        }
        return payload;
      });
    });
  }

  function cloudFunction(body) {
    return cloudRequest(CLOUD.functionUrl, {
      method: 'POST',
      headers: cloudHeaders(),
      body: JSON.stringify(body),
    });
  }

  function cloudSetSession(session) {
    cloud.session = session || null;
    try {
      if (session) localStorage.setItem(CLOUD_SESSION_KEY, JSON.stringify(session));
      else localStorage.removeItem(CLOUD_SESSION_KEY);
    } catch (error) {
      /* بی‌صدا */
    }
  }

  function cloudReadSession() {
    try {
      var raw = localStorage.getItem(CLOUD_SESSION_KEY);
      if (!raw) return null;
      var session = JSON.parse(raw);
      if (!session || !session.access_token) return null;
      cloud.session = session;
      return session;
    } catch (error) {
      return null;
    }
  }

  function showGate(message) {
    var gate = document.getElementById('gate');
    if (!gate) return;
    gate.hidden = false;
    setGateError(message || '');
  }

  function hideGate() {
    var gate = document.getElementById('gate');
    if (gate) gate.hidden = true;
  }

  function setGateError(message) {
    var box = document.getElementById('gate-error');
    if (!box) return;
    box.textContent = message || '';
    box.hidden = !message;
  }

  function setGateBusy(busy) {
    var form = document.getElementById('gate-form');
    if (!form) return;
    Array.prototype.forEach.call(form.querySelectorAll('button'), function (button) {
      button.disabled = busy;
    });
  }

  function cloudSignIn(email, password) {
    return cloudRequest(CLOUD.supabaseUrl + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { apikey: CLOUD.supabaseKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password }),
    });
  }

  function cloudSignUp(email, password) {
    return cloudRequest(CLOUD.supabaseUrl + '/auth/v1/signup', {
      method: 'POST',
      headers: { apikey: CLOUD.supabaseKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password }),
    });
  }

  function cloudMe() {
    return cloudRequest(CLOUD.supabaseUrl + '/auth/v1/user', { headers: cloudHeaders() });
  }

  function cloudSaveSoon() {
    if (!cloud.enabled || !cloud.user) return;
    clearTimeout(cloud.saveTimer);
    cloud.saveTimer = setTimeout(function () {
      cloudSaveNow();
    }, 700);
  }

  function cloudSaveNow() {
    if (!cloud.enabled || !cloud.user) return Promise.resolve();
    var payload = Object.assign({}, state, { watch: live.items });
    return fetch(CLOUD.supabaseUrl + '/rest/v1/kargah_state?on_conflict=user_id', {
      method: 'POST',
      headers: cloudHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({
        user_id: cloud.user.id,
        data: payload,
        updated_at: new Date().toISOString(),
      }),
    }).catch(function () {});
  }

  cloud.api = function (path, body) {
    if (path === '/api/state') {
      return Promise.resolve({
        items: live.items,
        meta: { interval_hours: CLOUD_INTERVAL_HOURS },
        online: true,
      });
    }
    if (path === '/api/search') {
      return cloudFunction({ action: 'search', q: body.q });
    }
    if (path === '/api/watch') {
      return cloudFunction({ action: 'add', url: body.url }).then(function (payload) {
        cloudSaveSoon();
        return payload;
      });
    }
    if (path === '/api/check') {
      return cloudFunction({ action: 'check', id: body.id || '' }).then(function (payload) {
        cloudSaveSoon();
        return payload;
      });
    }
    if (path === '/api/delete') {
      live.items = live.items.filter(function (item) {
        return item.id !== body.id;
      });
      liveSignature = JSON.stringify(live.items);
      cloudSaveSoon();
      return Promise.resolve({
        items: live.items,
        meta: { interval_hours: CLOUD_INTERVAL_HOURS },
      });
    }
    return Promise.resolve({});
  };

  function cloudRefreshPrices() {
    if (!cloud.user) return Promise.resolve();
    return cloudFunction({ action: 'refresh' })
      .then(function (payload) {
        if (payload && payload.updated) {
          applyLive({ items: payload.items, meta: { interval_hours: CLOUD_INTERVAL_HOURS } });
          live.online = true;
          render();
        }
      })
      .catch(function () {});
  }

  function cloudImportLocalItems(cloudItems) {
    if (cloudItems.length) return Promise.resolve({ items: cloudItems, imported: false });
    return fetch('/api/state')
      .then(function (response) {
        return response.ok ? response.json() : null;
      })
      .catch(function () {
        return null;
      })
      .then(function (payload) {
        var localItems = payload && Array.isArray(payload.items) ? payload.items : [];
        return { items: localItems.length ? localItems : cloudItems, imported: localItems.length > 0 };
      });
  }

  function cloudEnter() {
    hideGate();
    var remote = null;
    var imported = false;

    return cloudMe()
      .then(function (me) {
        cloud.user = me;
        var emailEl = document.getElementById('account-email');
        if (emailEl) emailEl.textContent = me.email || '';
        var line = document.getElementById('account-line');
        if (line) line.hidden = false;
        return cloudFunction({ action: 'state' });
      })
      .then(function (payload) {
        remote = payload.data || null;
        return cloudImportLocalItems(payload.items || []);
      })
      .then(function (result) {
        imported = result.imported;
        var remoteList = remote || {};
        var localHas =
          state.tasks.length + state.projects.length + state.transactions.length + state.shopping.length > 0;
        var remoteHas =
          (remoteList.tasks || []).length +
            (remoteList.projects || []).length +
            (remoteList.transactions || []).length +
            (remoteList.shopping || []).length >
          0;

        if (remote) state = normalize(remote);
        applyLive({ items: result.items, meta: { interval_hours: CLOUD_INTERVAL_HOURS } });
        live.online = true;
        live.loading = false;
        render();

        if (imported || (localHas && !remoteHas)) {
          return cloudSaveNow().then(function () {
            toast('داده‌های این دستگاه به حسابت منتقل شد');
          });
        }
        return null;
      })
      .then(function () {
        cloudRefreshPrices();
        clearInterval(cloud.refreshTimer);
        cloud.refreshTimer = setInterval(cloudRefreshPrices, 15 * 60 * 1000);
      })
      .catch(function (error) {
        cloud.user = null;
        cloudSetSession(null);
        var line = document.getElementById('account-line');
        if (line) line.hidden = true;
        showGate(
          error && (error.status === 401 || error.status === 403)
            ? 'نشست منقضی شد؛ دوباره وارد شو.'
            : 'اتصال به ابر ممکن نشد؛ اینترنت را چک کن.',
        );
      });
  }

  function cloudBoot() {
    if (cloudReadSession()) {
      cloudEnter();
      return;
    }
    showGate('');
  }

  function cloudSignOut() {
    fetch(CLOUD.supabaseUrl + '/auth/v1/logout', {
      method: 'POST',
      headers: cloudHeaders(),
    }).catch(function () {});
    cloudSetSession(null);
    cloud.user = null;
    clearInterval(cloud.refreshTimer);
    var line = document.getElementById('account-line');
    if (line) line.hidden = true;
    showGate('');
    toast('خارج شدی');
  }

  (function bindGate() {
    if (!cloud.enabled) {
      hideGate();
      return;
    }

    var form = document.getElementById('gate-form');
    var signup = document.getElementById('gate-signup');
    var skip = document.getElementById('gate-skip');
    var logout = document.getElementById('logout-btn');

    if (form) {
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        var email = document.getElementById('gate-email').value.trim();
        var password = document.getElementById('gate-pass').value;
        setGateError('');
        setGateBusy(true);
        cloudSignIn(email, password)
          .then(function (session) {
            cloudSetSession(session);
            setGateBusy(false);
            return cloudEnter();
          })
          .catch(function (error) {
            setGateBusy(false);
            setGateError(error.message || 'ورود ممکن نشد');
          });
      });
    }

    if (signup) {
      signup.addEventListener('click', function () {
        var email = document.getElementById('gate-email').value.trim();
        var password = document.getElementById('gate-pass').value;
        if (!email || password.length < 6) {
          setGateError('ایمیل و گذرواژهٔ حداقل ۶ حرفی بده');
          return;
        }
        setGateError('');
        setGateBusy(true);
        cloudSignUp(email, password)
          .then(function (session) {
            setGateBusy(false);
            if (session && session.access_token) {
              cloudSetSession(session);
              cloudEnter();
            } else {
              setGateError('حساب ساخته شد؛ لینک تأیید را در ایمیلت باز کن و بعد وارد شو.');
            }
          })
          .catch(function (error) {
            setGateBusy(false);
            setGateError(error.message || 'ساخت حساب ممکن نشد');
          });
      });
    }

    if (skip) {
      skip.addEventListener('click', function () {
        cloud.enabled = false;
        hideGate();
        loadLive(true);
        toast('حالت بدون حساب');
      });
    }

    if (logout) logout.addEventListener('click', cloudSignOut);
  })();

  function historyOf(item) {
    return (item.history || [])
      .filter(function (entry) {
        return entry && entry.price;
      })
      .slice()
      .sort(function (a, b) {
        return String(a.date).localeCompare(String(b.date));
      });
  }

  function priceStats(item) {
    var list = historyOf(item);
    var latest = list.length ? list[list.length - 1] : null;
    var previous = list.length > 1 ? list[list.length - 2] : null;
    var change = latest && previous ? latest.price - previous.price : 0;
    var percent = previous && previous.price ? Math.round((change / previous.price) * 100) : 0;
    return { list: list, latest: latest, previous: previous, change: change, percent: percent };
  }

  function formatClock(iso) {
    if (!iso) return '';
    var date = new Date(iso);
    if (isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit' }).format(date);
  }

  function formatMoment(iso) {
    if (!iso) return '';
    return formatDate(String(iso).slice(0, 10)) + '، ' + formatClock(iso);
  }

  function relativeTime(iso) {
    if (!iso) return '';
    var date = new Date(iso);
    if (isNaN(date.getTime())) return '';
    var minutes = Math.round((Date.now() - date.getTime()) / 60000);
    if (minutes < 1) return 'همین حالا';
    if (minutes < 60) return fa(minutes) + ' دقیقه پیش';
    var hours = Math.round(minutes / 60);
    if (hours < 24) return fa(hours) + ' ساعت پیش';
    var days = Math.round(hours / 24);
    if (days === 1) return 'دیروز';
    return fa(days) + ' روز پیش';
  }

  /* ------------------------------------------------------------------ */
  /* تکه‌های مشترک                                                       */
  /* ------------------------------------------------------------------ */

  function dateFieldHTML(target, iso, placeholder) {
    return (
      '<button type="button" class="date-field" data-act="open-date" data-target="' + esc(target) + '">' +
      CAL_ICON +
      '<span>' + esc(iso ? formatDate(iso) : placeholder || 'انتخاب تاریخ') + '</span>' +
      '</button>'
    );
  }

  function statusOptionsHTML(selected) {
    return STATUS_ORDER.map(function (value) {
      return (
        '<option value="' + value + '"' + (selected === value ? ' selected' : '') + '>' +
        STATUS[value] + '</option>'
      );
    }).join('');
  }

  function deltaHTML(change, percent) {
    if (!change) return '';
    var cls = change > 0 ? 'up' : 'down';
    var arrow = change > 0 ? '▲' : '▼';
    return '<span class="delta ' + cls + '">' + arrow + ' ' + fa(Math.abs(percent)) + '٪</span>';
  }

  /* ------------------------------------------------------------------ */
  /* روزمره                                                              */
  /* ------------------------------------------------------------------ */

  var CHART_COLORS = [
    '#2f5bff', '#7c5cff', '#f79009', '#12b76a', '#ec4899',
    '#0ea5a5', '#f04438', '#8b8fa3', '#6366f1', '#0ba5ec',
  ];

  var ICONS = {
    wallet:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="6" width="17" height="13" rx="3.5"/><path d="M3.5 10h17"/><circle cx="16.5" cy="14.5" r="1.3" fill="currentColor" stroke="none"/></svg>',
    income:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M7 14l5 5 5-5"/></svg>',
    expense:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M7 10l5-5 5 5"/></svg>',
    net:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V5M4 19h16"/><path d="M8 19v-5M12.5 19V9M17 19v-7"/></svg>',
    flag:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 21V4"/><path d="M6 5h9.5l-1.4 3.4L15.5 12H6"/></svg>',
    spark:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9Z"/></svg>',
  };

  function monthKeyOf(parts) {
    return parts.jy + '-' + String(parts.jm).padStart(2, '0');
  }

  function greetingText() {
    var hour = new Date().getHours();
    if (hour < 5) return 'شب بخیر';
    if (hour < 12) return 'صبح بخیر';
    if (hour < 17) return 'ظهر بخیر';
    if (hour < 21) return 'عصر بخیر';
    return 'شب بخیر';
  }

  function displayName() {
    if (cloud.user && cloud.user.email) return String(cloud.user.email).split('@')[0];
    return 'دوست من';
  }

  function categoryColor(name) {
    var index = EXPENSE_CATEGORIES.indexOf(name);
    if (index < 0) index = EXPENSE_CATEGORIES.length;
    return CHART_COLORS[index % CHART_COLORS.length];
  }

  function expenseByCategory(list) {
    var map = {};
    list.forEach(function (tx) {
      if (tx.kind !== 'expense') return;
      var name = tx.category || 'سایر';
      map[name] = (map[name] || 0) + tx.amount;
    });
    var rows = Object.keys(map)
      .map(function (name) {
        return { name: name, total: map[name], color: categoryColor(name) };
      })
      .sort(function (a, b) { return b.total - a.total; });
    var total = rows.reduce(function (acc, row) { return acc + row.total; }, 0);
    rows.forEach(function (row) {
      row.percent = total ? Math.round((row.total / total) * 100) : 0;
    });
    return rows;
  }

  function accountTotals() {
    var assets = state.accounts.filter(function (item) { return item.kind !== 'debt'; });
    var debts = state.accounts.filter(function (item) { return item.kind === 'debt'; });
    var assetsTotal = sum(assets);
    var debtsTotal = sum(debts);
    return { assets: assets, debts: debts, assetsTotal: assetsTotal, debtsTotal: debtsTotal, net: assetsTotal - debtsTotal };
  }

  function netWorth() {
    return accountTotals().net;
  }

  function donutHTML(rows, total) {
    if (!rows.length || !total) return '<p class="empty">برای این ماه هزینه‌ای ثبت نشده.</p>';
    var radius = 54;
    var circumference = 2 * Math.PI * radius;
    var offset = 0;
    var segments = rows
      .map(function (row) {
        var length = (row.total / total) * circumference;
        var segment =
          '<circle cx="80" cy="80" r="' + radius + '" fill="none" stroke="' + row.color +
          '" stroke-width="25" stroke-dasharray="' + Math.max(length - 1.4, 0).toFixed(1) + ' ' +
          circumference.toFixed(1) + '" stroke-dashoffset="' + (-offset).toFixed(1) +
          '" transform="rotate(-90 80 80)"/>';
        offset += length;
        return segment;
      })
      .join('');

    return (
      '<svg class="donut" viewBox="0 0 160 160" role="img" aria-label="نمودار هزینه">' +
      segments +
      '<circle cx="80" cy="80" r="41" fill="none" stroke="#eef0f6" stroke-width="1"/>' +
      '<text x="80" y="74" text-anchor="middle" class="donut-label">هزینه</text>' +
      '<text x="80" y="94" text-anchor="middle" class="donut-value">' + money(total) + '</text>' +
      '</svg>'
    );
  }

  function legendHTML(rows) {
    return (
      '<ul class="legend">' +
      rows
        .map(function (row) {
          return (
            '<li><span class="dot" style="background:' + row.color + '"></span>' +
            '<span class="legend-name">' + esc(row.name) + '</span>' +
            '<span class="legend-pct">' + fa(row.percent) + '٪</span>' +
            '<span class="legend-amount">' + money(row.total) + '</span></li>'
          );
        })
        .join('') +
      '</ul>'
    );
  }

  function trendHTML(jy, jm) {
    var months = [];
    for (var i = 5; i >= 0; i -= 1) months.push(shiftMonth(jy, jm, -i));

    var data = months.map(function (month) {
      var list = monthTransactions(state.transactions, month.jy, month.jm);
      return {
        label: MONTHS[month.jm - 1],
        income: sum(list.filter(function (tx) { return tx.kind === 'income'; })),
        expense: sum(list.filter(function (tx) { return tx.kind === 'expense'; })),
      };
    });

    var max = Math.max.apply(
      null,
      data.map(function (row) { return Math.max(row.income, row.expense); }).concat([1]),
    );

    return (
      '<div class="trend">' +
      '<div class="trend-cols">' +
      data
        .map(function (row) {
          var incomeHeight = Math.max(3, Math.round((row.income / max) * 100));
          var expenseHeight = Math.max(3, Math.round((row.expense / max) * 100));
          return (
            '<div class="trend-col" title="درآمد ' + money(row.income) + ' · هزینه ' + money(row.expense) + '">' +
            '<div class="trend-bars">' +
            '<span class="tb income" style="height:' + incomeHeight + '%"></span>' +
            '<span class="tb expense" style="height:' + expenseHeight + '%"></span>' +
            '</div><span class="trend-month">' + row.label + '</span></div>'
          );
        })
        .join('') +
      '</div>' +
      '<div class="trend-legend">' +
      '<span><i class="dot" style="background:#2f5bff"></i>درآمد</span>' +
      '<span><i class="dot" style="background:#7c5cff"></i>هزینه</span></div></div>'
    );
  }

  function attentionItems() {
    var today = todayISO();
    var monthKey = monthKeyOf(currentJalali());
    var out = [];

    state.tasks.forEach(function (task) {
      if (task.done || task.date >= today) return;
      out.push({
        title: task.title,
        sub: 'کار عقب‌افتاده',
        tag: 'عقب‌افتاده',
        tone: 'red',
        when: formatDate(task.date),
        tab: 'daily',
        order: 0,
      });
    });

    state.projects.forEach(function (project) {
      if (!project.due || project.status === 'done') return;
      if (daysUntil(project.due) > 7) return;
      out.push({
        title: project.title,
        sub: project.client || 'بدون مشتری',
        tag: 'سررسید نزدیک',
        tone: 'purple',
        when: dueLabel(project.due),
        tab: 'projects',
        order: 1,
      });
    });

    state.bills.forEach(function (bill) {
      if (bill.paid && bill.paid[monthKey]) return;
      out.push({
        title: bill.title,
        sub: 'قسط یا قبض پرداخت‌نشده',
        tag: 'پرداخت‌نشده',
        tone: 'orange',
        when: 'روز ' + fa(bill.day || 1),
        tab: 'finance',
        order: 2,
      });
    });

    out.sort(function (a, b) { return a.order - b.order; });
    return out.slice(0, 4);
  }

  function budgetsPanelHTML(monthTx) {
    var rows = EXPENSE_CATEGORIES.map(function (name) {
      return {
        name: name,
        limit: Number(state.budgets[name]) || 0,
        spent: sum(monthTx.filter(function (tx) {
          return tx.kind === 'expense' && tx.category === name;
        })),
      };
    }).filter(function (row) { return row.limit > 0; });

    var body = rows.length
      ? '<ul class="budget-list">' +
        rows
          .map(function (row) {
            var percent = Math.min(100, Math.round((row.spent / row.limit) * 100));
            var over = row.spent > row.limit;
            return (
              '<li class="budget"><div class="budget-top"><span class="budget-name">' + esc(row.name) + '</span>' +
              '<span class="budget-num">' + money(row.spent) + ' / ' + money(row.limit) + '</span></div>' +
              '<div class="bar' + (over ? ' over' : '') + '"><span style="width:' + percent + '%"></span></div>' +
              '<div class="budget-foot"><span class="muted tiny">' +
              (over ? 'از سقف رد شدی' : money(row.limit - row.spent) + ' تومان مانده') + '</span>' +
              '<button type="button" class="icon-btn tiny" data-act="remove-budget" data-id="' + esc(row.name) +
              '" aria-label="حذف بودجه">×</button></div></li>'
            );
          })
          .join('') +
        '</ul>'
      : '<p class="empty">برای دسته‌ای سقف تعیین نکردی.</p>';

    var options = EXPENSE_CATEGORIES.map(function (name) {
      return '<option value="' + esc(name) + '"' +
        (draft.budgetCategory === name ? ' selected' : '') + '>' + esc(name) + '</option>';
    }).join('');

    return (
      '<div class="panel-head"><h3>بودجهٔ این ماه</h3>' +
      '<span class="muted tiny">' + fa(rows.length) + ' سقف</span></div>' +
      body +
      '<form class="mini-form" data-act="set-budget">' +
      '<select data-draft="budgetCategory" aria-label="دستهٔ بودجه">' + options + '</select>' +
      '<input type="number" min="0" inputmode="numeric" data-draft="budgetAmount" placeholder="سقف (تومان)" aria-label="سقف بودجه">' +
      '<button type="submit" class="btn ghost small">تعیین</button></form>'
    );
  }

  function trendPanelHTML(jy, jm) {
    return (
      '<div class="panel-head"><h3>روند شش ماه</h3>' +
      '<span class="muted tiny">درآمد و هزینه</span></div>' + trendHTML(jy, jm)
    );
  }

  function accountsPanelHTML() {
    var totals = accountTotals();
    var rows = state.accounts.length
      ? '<ul class="row-list tight">' +
        state.accounts
          .map(function (item) {
            var isDebt = item.kind === 'debt';
            return (
              '<li class="row"><span class="row-icon ' + (isDebt ? 'red' : 'green') + '">' + ICONS.wallet + '</span>' +
              '<div class="row-main"><span class="row-title">' + esc(item.title) + '</span>' +
              '<span class="row-sub">' + (isDebt ? 'بدهی' : 'دارایی') + '</span></div>' +
              '<span class="row-amount ' + (isDebt ? 'expense' : 'income') + '">' + money(item.amount) + '</span>' +
              '<button type="button" class="icon-btn tiny" data-act="remove-account" data-id="' + item.id +
              '" aria-label="حذف">×</button></li>'
            );
          })
          .join('') +
        '</ul>'
      : '<p class="empty">حساب‌ها و بدهی‌هایت را اضافه کن تا دارایی خالص حساب شود.</p>';

    return (
      '<div class="panel-head"><h3>دارایی و بدهی</h3><span class="muted tiny">خالص</span></div>' +
      '<p class="net-value">' + money(totals.net) + ' <span>تومان</span></p>' +
      '<div class="chip-row"><span class="chip income">دارایی ' + money(totals.assetsTotal) + '</span>' +
      '<span class="chip expense">بدهی ' + money(totals.debtsTotal) + '</span></div>' +
      rows +
      '<form class="mini-form" data-act="add-account">' +
      '<input data-draft="accountTitle" value="' + esc(draft.accountTitle) + '" placeholder="نام حساب" aria-label="نام حساب" autocomplete="off">' +
      '<input type="number" min="0" inputmode="numeric" data-draft="accountAmount" value="' + esc(draft.accountAmount) +
      '" placeholder="مبلغ" aria-label="مبلغ">' +
      '<select data-draft="accountKind" aria-label="نوع">' +
      '<option value="asset"' + (draft.accountKind === 'asset' ? ' selected' : '') + '>دارایی</option>' +
      '<option value="debt"' + (draft.accountKind === 'debt' ? ' selected' : '') + '>بدهی</option></select>' +
      '<button type="submit" class="btn ghost small">افزودن</button></form>'
    );
  }

  function goalsPanelHTML() {
    var body = state.goals.length
      ? '<ul class="goal-list">' +
        state.goals
          .map(function (goal) {
            var target = Number(goal.target) || 0;
            var saved = Number(goal.saved) || 0;
            var percent = target ? Math.min(100, Math.round((saved / target) * 100)) : 0;
            return (
              '<li class="goal"><div class="budget-top"><span class="budget-name">' + esc(goal.title) + '</span>' +
              '<span class="budget-num">' + money(saved) + ' / ' + money(target) + '</span></div>' +
              '<div class="bar"><span style="width:' + percent + '%"></span></div>' +
              '<div class="budget-foot"><span class="muted tiny">' + fa(percent) + '٪ · ' +
              (saved >= target && target ? 'رسیدی به هدف' : money(Math.max(target - saved, 0)) + ' مانده') +
              (goal.due ? ' · ' + formatDate(goal.due) : '') + '</span>' +
              '<button type="button" class="icon-btn tiny" data-act="remove-goal" data-id="' + goal.id +
              '" aria-label="حذف هدف">×</button></div>' +
              '<form class="deposit-form" data-act="goal-deposit" data-id="' + goal.id + '">' +
              '<input type="number" min="0" inputmode="numeric" name="amount" placeholder="مبلغ واریز">' +
              '<button type="submit" class="btn ghost small">واریز</button></form></li>'
            );
          })
          .join('') +
        '</ul>'
      : '<p class="empty">هدف پس‌انداز تعریف کن؛ مثلاً صندوق اضطراری یا سفر.</p>';

    return (
      '<div class="panel-head"><h3>اهداف پس‌انداز</h3><span class="muted tiny">' + fa(state.goals.length) + ' هدف</span></div>' +
      body +
      '<form class="mini-form" data-act="add-goal">' +
      '<input data-draft="goalTitle" value="' + esc(draft.goalTitle) + '" placeholder="نام هدف" aria-label="نام هدف" autocomplete="off">' +
      '<input type="number" min="0" inputmode="numeric" data-draft="goalTarget" value="' + esc(draft.goalTarget) +
      '" placeholder="مبلغ هدف" aria-label="مبلغ هدف">' +
      '<button type="submit" class="btn ghost small">افزودن</button></form>'
    );
  }

  function billsPanelHTML(jy, jm) {
    var monthKey = monthKeyOf({ jy: jy, jm: jm });
    var bills = state.bills;
    var body = bills.length
      ? '<ul class="row-list tight">' +
        bills
          .map(function (bill) {
            var paid = !!(bill.paid && bill.paid[monthKey]);
            return (
              '<li class="row"><button type="button" class="check' + (paid ? ' on' : '') +
              '" data-act="bill-paid" data-id="' + bill.id + '" aria-label="پرداخت‌شده">✓</button>' +
              '<div class="row-main"><span class="row-title">' + esc(bill.title) + '</span>' +
              '<span class="row-sub">روز ' + fa(bill.day || 1) + ' هر ماه</span></div>' +
              '<span class="row-amount ' + (paid ? 'income' : 'expense') + '">' + money(bill.amount) + '</span>' +
              '<button type="button" class="icon-btn tiny" data-act="remove-bill" data-id="' + bill.id +
              '" aria-label="حذف">×</button></li>'
            );
          })
          .join('') +
        '</ul>'
      : '<p class="empty">اجاره، قسط و اشتراک‌های ثابت را اینجا نگه دار.</p>';

    return (
      '<div class="panel-head"><h3>اقساط و قبوض</h3><span class="muted tiny">' + fa(bills.length) + ' مورد</span></div>' +
      body +
      '<form class="mini-form" data-act="add-bill">' +
      '<input data-draft="billTitle" value="' + esc(draft.billTitle) + '" placeholder="عنوان" aria-label="عنوان قسط" autocomplete="off">' +
      '<input type="number" min="0" inputmode="numeric" data-draft="billAmount" value="' + esc(draft.billAmount) +
      '" placeholder="مبلغ" aria-label="مبلغ قسط">' +
      '<input type="number" min="1" max="31" data-draft="billDay" value="' + esc(draft.billDay) +
      '" placeholder="روز" aria-label="روز ماه" class="day-input">' +
      '<button type="submit" class="btn ghost small">افزودن</button></form>'
    );
  }

  function statCardHTML(tone, icon, label, value, unit, sub) {
    return (
      '<div class="stat"><div class="stat-top"><span class="stat-icon ' + tone + '">' + icon + '</span>' +
      '<span class="stat-label">' + label + '</span></div>' +
      '<div class="stat-value"><span data-count="' + value + '">' + money(value) + '</span>' +
      (unit ? '<span class="stat-cur">' + unit + '</span>' : '') + '</div>' +
      '<div class="stat-sub">' + sub + '</div></div>'
    );
  }

  function dashboardHTML() {
    var cur = currentJalali();
    var monthTx = monthTransactions(state.transactions, cur.jy, cur.jm);
    var income = sum(monthTx.filter(function (tx) { return tx.kind === 'income'; }));
    var expense = sum(monthTx.filter(function (tx) { return tx.kind === 'expense'; }));
    var balance = income - expense;
    var incomeCount = monthTx.filter(function (tx) { return tx.kind === 'income'; }).length;
    var expenseCount = monthTx.filter(function (tx) { return tx.kind === 'expense'; }).length;
    var todayTasks = state.tasks.filter(function (task) { return task.date === todayISO(); });
    var doneToday = todayTasks.filter(function (task) { return task.done; }).length;
    var taskPercent = todayTasks.length ? Math.round((doneToday / todayTasks.length) * 100) : 0;
    var attention = attentionItems();
    var recent = sortByDateDesc(state.transactions).slice(0, 4);
    var cats = expenseByCategory(monthTx);

    var statsHTML =
      '<div class="stats">' +
      statCardHTML('blue', ICONS.wallet, 'موجودی این ماه', balance, 'تومان', 'درآمد منهای هزینه') +
      statCardHTML('green', ICONS.income, 'درآمد', income, 'تومان', fa(incomeCount) + ' مورد ثبت‌شده') +
      statCardHTML('orange', ICONS.expense, 'هزینه', expense, 'تومان', fa(expenseCount) + ' مورد ثبت‌شده') +
      statCardHTML('violet', ICONS.net, 'دارایی خالص', netWorth(), 'تومان', 'دارایی منهای بدهی') +
      '</div>';

    var attentionHTML = attention.length
      ? '<ul class="row-list">' +
        attention
          .map(function (item) {
            return (
              '<li class="row clickable" data-act="nav" data-tab="' + item.tab + '">' +
              '<span class="row-icon ' + item.tone + '">' + ICONS.flag + '</span>' +
              '<div class="row-main"><span class="row-title">' + esc(item.title) + '</span>' +
              '<span class="row-sub">' + esc(item.sub) + '</span></div>' +
              '<div class="row-end"><span class="tag ' + item.tone + '">' + esc(item.tag) + '</span>' +
              '<span class="row-time">' + esc(item.when) + '</span></div></li>'
            );
          })
          .join('') +
        '</ul>'
      : '<p class="empty">همه‌چیز مرتب است؛ چیزی منتظر تو نیست.</p>';

    var recentHTML = recent.length
      ? '<ul class="row-list">' +
        recent
          .map(function (tx) {
            var initial = String(tx.title || '؟').trim().charAt(0);
            return (
              '<li class="row activity-row"><span class="avatar sm ' + tx.kind + '">' + esc(initial) + '</span>' +
              '<div class="row-main"><span class="row-title">' + esc(tx.title) + '</span>' +
              '<span class="row-sub">' + esc(tx.category) + ' · ' + esc(formatDate(tx.date)) + '</span></div>' +
              '<span class="row-amount ' + tx.kind + '">' +
              (tx.kind === 'income' ? '+' : '−') + money(tx.amount) + '</span></li>'
            );
          })
          .join('') +
        '</ul>'
      : '<p class="empty">هنوز تراکنشی ثبت نشده.</p>';

    var tasksHTML = todayTasks.length
      ? '<ul class="row-list">' +
        todayTasks
          .slice(0, 5)
          .map(function (task) {
            return (
              '<li class="row task-row' + (task.done ? ' done' : '') + '">' +
              '<button type="button" class="check' + (task.done ? ' on' : '') +
              '" data-act="toggle-daily" data-id="' + task.id + '" aria-label="تیک ' + esc(task.title) + '">✓</button>' +
              '<div class="row-main"><span class="row-title">' + esc(task.title) + '</span>' +
              '<span class="row-sub">' + (task.done ? 'انجام شد' : 'امروز') + '</span></div>' +
              '<span class="tag ' + (task.done ? 'green' : 'blue') + '">' +
              (task.done ? 'تحویل شده' : 'در جریان') + '</span></li>'
            );
          })
          .join('') +
        '</ul>'
      : '<p class="empty">برای امروز کاری ثبت نشده.</p>';

    return (
      '<section class="section">' +
      statsHTML +
      '<div class="dash-grid">' +
      '<div class="card panel"><div class="panel-head"><h3>نیازمند توجه</h3>' +
      '<span class="count-badge">' + fa(attention.length) + '</span><span class="spacer"></span>' +
      '<button type="button" class="link-btn" data-act="nav" data-tab="daily">همه ‹</button></div>' +
      attentionHTML + '</div>' +

      '<div class="card panel"><div class="panel-head"><h3>فعالیت اخیر</h3>' +
      '<span class="count-badge">' + fa(recent.length) + '</span><span class="spacer"></span>' +
      '<button type="button" class="link-btn" data-act="nav" data-tab="finance">همه ‹</button></div>' +
      recentHTML + '</div>' +

      '<div class="card panel"><div class="panel-head"><h3>کارهای امروز</h3>' +
      '<span class="count-badge">' + fa(doneToday) + '/' + fa(todayTasks.length) + '</span><span class="spacer"></span>' +
      '<button type="button" class="link-btn" data-act="nav" data-tab="daily">همه ‹</button></div>' +
      '<div class="bar"><span style="width:' + taskPercent + '%"></span></div>' +
      tasksHTML +
      '<form class="add-row compact" data-act="add-daily">' +
      '<input data-draft="taskTitle" value="' + esc(draft.taskTitle) +
      '" placeholder="کار تازه برای امروز…" aria-label="کار تازه" autocomplete="off">' +
      '<button type="submit" class="btn primary small">افزودن</button></form></div>' +
      '</div>' +

      '<div class="dash-bottom">' +
      '<div class="card panel"><div class="panel-head"><h3>هزینه به تفکیک دسته</h3>' +
      '<button type="button" class="link-btn" data-act="nav" data-tab="finance">همه ‹</button></div>' +
      (cats.length
        ? '<div class="donut-row">' + donutHTML(cats, expense) + legendHTML(cats) + '</div>'
        : '<p class="empty">برای این ماه هزینه‌ای ثبت نشده.</p>') +
      '</div>' +
      '<div class="card panel">' + budgetsPanelHTML(monthTx) + '</div>' +
      '</div>' +
      '</section>'
    );
  }

  function settingsHTML() {
    return (
      '<section class="section">' +
      '<div class="section-head"><div><h2>تنظیمات</h2>' +
      '<p class="sub">حریم خصوصی مبالغ، حساب ابری و افزونهٔ مرورگر.</p></div></div>' +
      '<div class="settings-grid">' +
      '<div class="card panel"><div class="panel-head"><h3>حریم خصوصی</h3></div>' +
      '<div class="setting-row"><div><strong>مخفی کردن مبالغ</strong>' +
      '<span class="muted tiny">همهٔ مبلغ‌ها با ستاره نشان داده می‌شوند</span></div>' +
      '<button type="button" class="switch' + (state.prefs.hideAmounts ? ' on' : '') +
      '" data-act="toggle-privacy" aria-pressed="' + (state.prefs.hideAmounts ? 'true' : 'false') +
      '" aria-label="مخفی کردن مبالغ"><span></span></button></div>' +
      '<p class="muted tiny">برای نمایش سریع در جمع، همین کلید یا کلید کنار منو را بزن.</p></div>' +

      '<div class="card panel"><div class="panel-head"><h3>حساب ابری</h3></div>' +
      (cloud.user
        ? '<p class="muted">وصل به <strong dir="ltr">' + esc(cloud.user.email || '') + '</strong></p>' +
          '<button type="button" class="btn ghost small" data-act="sync">همگام‌سازی الان</button>'
        : '<p class="muted">الان بدون حساب کار می‌کنی؛ داده‌ها فقط روی همین دستگاه است.</p>') +
      '</div>' +

      '<div class="card panel"><div class="panel-head"><h3>افزونهٔ مرورگر</h3></div>' +
      '<p class="muted tiny">پوشهٔ <code>extension</code> را در کروم با «Load unpacked» نصب کن تا هزینه را از هر صفحه‌ای ثبت کنی.</p>' +
      '<a class="btn ghost small" href="https://github.com/armvnhs/kargah" target="_blank" rel="noopener">مخزن پروژه</a>' +
      '</div></div></section>'
    );
  }

  function ringHTML(percent) {
    var radius = 26;
    var circumference = 2 * Math.PI * radius;
    var offset = circumference * (1 - percent / 100);
    return (
      '<svg class="ring" viewBox="0 0 64 64" aria-hidden="true">' +
      '<circle class="ring-track" cx="32" cy="32" r="' + radius + '"/>' +
      '<circle class="ring-fill" cx="32" cy="32" r="' + radius + '" stroke-dasharray="' +
      circumference.toFixed(1) + '" stroke-dashoffset="' + offset.toFixed(1) + '"/>' +
      '<text x="32" y="37" text-anchor="middle" class="ring-text">' + fa(percent) + '٪</text>' +
      '</svg>'
    );
  }

  function dailyTaskHTML(task, index) {
    return (
      '<li class="task-item ' + (task.done ? 'done' : '') + '" style="animation-delay:' +
      Math.min(index * 40, 240) + 'ms">' +
      '<button type="button" class="check ' + (task.done ? 'on' : '') +
      '" data-act="toggle-daily" data-id="' + task.id + '" aria-label="تیک ' + esc(task.title) + '">✓</button>' +
      '<span class="task-text">' + esc(task.title) + '</span>' +
      '<button type="button" class="icon-btn" data-act="remove-daily" data-id="' + task.id +
      '" aria-label="حذف ' + esc(task.title) + '">×</button>' +
      '</li>'
    );
  }

  function dailyHTML() {
    var today = todayISO();
    var cur = currentJalali();
    var tasks = state.tasks.filter(function (task) { return task.date === today; });
    var doneCount = tasks.filter(function (task) { return task.done; }).length;
    var percent = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;
    var overdue = state.tasks
      .filter(function (task) { return !task.done && task.date < today; })
      .sort(function (a, b) { return a.date.localeCompare(b.date); });

    var deadlines = state.projects
      .filter(function (project) { return project.status !== 'done' && project.due; })
      .sort(function (a, b) { return a.due.localeCompare(b.due); })
      .slice(0, 3);

    var monthTx = monthTransactions(state.transactions, cur.jy, cur.jm);
    var income = sum(monthTx.filter(function (tx) { return tx.kind === 'income'; }));
    var expense = sum(monthTx.filter(function (tx) { return tx.kind === 'expense'; }));
    var balance = income - expense;

    var watched = live.items
      .map(function (item) {
        var stats = priceStats(item);
        return { item: item, stats: stats };
      })
      .filter(function (row) { return row.stats.latest; })
      .slice(0, 3);

    var tasksHTML = tasks.length
      ? '<ul class="task-list">' + tasks.map(dailyTaskHTML).join('') + '</ul>'
      : '<p class="empty">امروز کاری ثبت نشده — اولین کار را بنویس.</p>';

    var overdueHTML = overdue.length
      ? '<div class="card tasks-card">' +
        '<div class="panel-head"><h3>عقب‌افتاده</h3>' +
        '<button type="button" class="link-btn" data-act="carry-all">انتقال همه به امروز</button></div>' +
        '<ul class="task-list">' +
        overdue.map(function (task) {
          return (
            '<li class="task-item overdue-item">' +
            '<button type="button" class="check" data-act="toggle-daily" data-id="' + task.id +
            '" aria-label="تیک ' + esc(task.title) + '">✓</button>' +
            '<span class="task-text">' + esc(task.title) + '</span>' +
            '<span class="muted tiny">' + esc(formatDate(task.date)) + '</span>' +
            '<button type="button" class="chip-btn" data-act="carry-daily" data-id="' + task.id + '">به امروز</button>' +
            '</li>'
          );
        }).join('') +
        '</ul></div>'
      : '';

    var deadlinesHTML = deadlines.length
      ? deadlines.map(function (project) {
          return (
            '<li class="mini-row"><div class="mini-main">' +
            '<span class="mini-title">' + esc(project.title) + '</span>' +
            '<span class="muted tiny">' + esc(project.client || 'بدون مشتری') + ' · ' + esc(formatDate(project.due)) + '</span>' +
            '</div><span class="due ' + dueTone(project.due) + '">' + esc(dueLabel(project.due)) + '</span></li>'
          );
        }).join('')
      : '<p class="empty">سررسیدی ثبت نشده.</p>';

    var watchedHTML = watched.length
      ? watched.map(function (row) {
          return (
            '<li class="mini-row"><div class="mini-main">' +
            '<span class="mini-title">' + esc(row.item.title) + '</span>' +
            '<span class="muted tiny">' + esc(relativeTime(row.item.last_check) || 'بررسی نشده') + '</span>' +
            '</div><span class="mini-price">' + money(row.stats.latest.price) + '</span>' +
            deltaHTML(row.stats.change, row.stats.percent) + '</li>'
          );
        }).join('')
      : '<p class="empty">' +
        (live.online === false ? 'سرور قیمت وصل نیست.' : 'هنوز کالایی زیر نظر نداری.') +
        '</p>';

    return (
      '<section class="section">' +
      '<div class="card today-card">' +
      '<div class="today-text">' +
      '<p class="eyebrow">' + esc(formatWeekday()) + '، ' + esc(formatDate(today)) + '</p>' +
      '<h2 class="today-title">کارهای امروز</h2>' +
      '<p class="muted">' + fa(doneCount) + ' از ' + fa(tasks.length) + ' انجام شد</p>' +
      '<div class="bar"><span style="width:' + percent + '%"></span></div>' +
      '</div>' +
      '<div class="today-ring">' + ringHTML(percent) + '</div>' +
      '</div>' +

      '<div class="daily-grid">' +
      '<div class="card tasks-card">' +
      '<div class="panel-head"><h3>فهرست امروز</h3>' +
      '<span class="muted tiny">' + (tasks.length ? fa(tasks.length) + ' کار' : 'خالی') + '</span></div>' +
      '<form class="add-row" data-act="add-daily">' +
      '<input data-draft="taskTitle" value="' + esc(draft.taskTitle) +
      '" placeholder="چه کاری باید امروز انجام شود؟" aria-label="کار تازه" autocomplete="off">' +
      '<button type="submit" class="btn primary">افزودن</button>' +
      '</form>' +
      tasksHTML +
      '</div>' +

      '<div class="side-col">' +
      '<div class="card mini-card"><div class="panel-head"><h3>سررسیدها</h3>' +
      '<button type="button" class="link-btn" data-act="nav" data-tab="projects">همه</button></div>' +
      '<ul class="mini-list">' + deadlinesHTML + '</ul></div>' +

      '<div class="card mini-card"><div class="panel-head"><h3>قیمت زنده</h3>' +
      '<button type="button" class="link-btn" data-act="nav" data-tab="buy">همه</button></div>' +
      '<ul class="mini-list">' + watchedHTML + '</ul></div>' +

      '<div class="card mini-card money-mini"><div class="panel-head"><h3>ماندهٔ ' +
      esc(monthLabel(cur.jy, cur.jm)) + '</h3>' +
      '<button type="button" class="link-btn" data-act="nav" data-tab="finance">مالی</button></div>' +
      '<p class="mini-balance ' + (balance < 0 ? 'neg' : '') + '">' + money(balance) + ' <span>تومان</span></p>' +
      '<div class="chip-row"><span class="chip income">درآمد ' + money(income) + '</span>' +
      '<span class="chip expense">هزینه ' + money(expense) + '</span></div></div>' +
      '</div>' +
      '</div>' +

      overdueHTML +
      '</section>'
    );
  }

  /* ------------------------------------------------------------------ */
  /* قیمت‌ها                                                             */
  /* ------------------------------------------------------------------ */

  /* ------------------------------------------------------------------ */
  /* خرید و رصد قیمت                                                     */
  /* ------------------------------------------------------------------ */

  function sparklineHTML(item) {
    var points = historyOf(item).slice(-14);
    if (!points.length) {
      return '<div class="spark-empty">هنوز قیمتی ثبت نشده</div>';
    }

    var width = 240;
    var height = 68;
    var pad = 10;
    var prices = points.map(function (point) { return point.price; });
    var min = Math.min.apply(null, prices);
    var max = Math.max.apply(null, prices);
    var span = max - min || 1;
    var stepX = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;

    var coords = points.map(function (point, index) {
      var x = width - pad - stepX * index;
      var y = height - pad - ((point.price - min) / span) * (height - pad * 2);
      return [x, y];
    });

    var line = coords
      .map(function (coord, index) {
        return (index ? 'L' : 'M') + coord[0].toFixed(1) + ' ' + coord[1].toFixed(1);
      })
      .join(' ');
    var area =
      line +
      ' L ' + coords[coords.length - 1][0].toFixed(1) + ' ' + (height - pad) +
      ' L ' + coords[0][0].toFixed(1) + ' ' + (height - pad) + ' Z';
    var gradientId = 'spark-' + item.id;

    return (
      '<svg class="spark" viewBox="0 0 ' + width + ' ' + height +
      '" preserveAspectRatio="none" aria-hidden="true">' +
      '<defs><linearGradient id="' + gradientId + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="rgba(91,75,219,0.30)"/>' +
      '<stop offset="100%" stop-color="rgba(91,75,219,0)"/></linearGradient></defs>' +
      '<path class="spark-area" d="' + area + '" fill="url(#' + gradientId + ')"/>' +
      '<path class="spark-line" d="' + line + '" vector-effect="non-scaling-stroke"/>' +
      (points.length === 1
        ? '<circle class="spark-dot" cx="' + coords[0][0].toFixed(1) + '" cy="' + coords[0][1].toFixed(1) + '" r="3.5"/>'
        : '') +
      '</svg>'
    );
  }

  function watchedCardHTML(item, index) {
    var stats = priceStats(item);
    var isBusy = !!busy.items[item.id];
    var chart =
      stats.list.length > 1
        ? sparklineHTML(item)
        : '<span class="watch-pending">در انتظار تاریخچه</span>';
    var shopLabel = String(item.shop || '').replace(/^در\s+/, '').trim();
    if (/^(فروشگاه|فروشگاه اینترنتی|نامشخص|نامعلوم)$/.test(shopLabel)) shopLabel = '';

    return (
      '<article class="card watch-item" style="animation-delay:' + Math.min(index * 50, 250) + 'ms">' +

      '<div class="watch-main">' +
      '<div class="watch-head">' +
      '<h3>' + esc(item.title || 'کالای بدون نام') + '</h3></div>' +
      '<div class="watch-meta">' +
      (shopLabel ? '<span class="unit">' + esc(shopLabel) + '</span>' : '') +
      '<span class="muted tiny">' +
      (item.last_check ? 'بررسی ' + esc(relativeTime(item.last_check)) : 'بررسی نشده') +
      '</span>' +
      (!item.available ? '<span class="watch-flag">ناموجود</span>' : '') +
      (item.error ? '<span class="watch-flag error">خطا در بررسی</span>' : '') +
      '</div></div>' +

      '<div class="watch-price">' +
      (stats.latest
        ? '<div class="price-main"><span class="price-value">' + money(stats.latest.price) + '</span>' +
          '<span class="price-unit">تومان</span>' + deltaHTML(stats.change, stats.percent) + '</div>'
        : '<div class="price-main"><span class="price-value empty-value">—</span></div>') +
      (stats.previous
        ? '<span class="tiny muted">قبلی: ' + money(stats.previous.price) + ' · ' +
          esc(formatDate(stats.previous.date)) + '</span>'
        : '<span class="tiny muted">' + (stats.latest ? 'اولین قیمت ثبت‌شده' : 'در انتظار اولین بررسی') + '</span>') +
      '</div>' +

      '<div class="watch-chart">' + chart + '</div>' +

      '<div class="watch-actions">' +
      '<button type="button" class="btn ghost small" data-act="check-item" data-id="' + item.id + '"' +
      (isBusy ? ' disabled' : '') + '>' + (isBusy ? '…' : 'بررسی') + '</button>' +
      '<a class="btn ghost small" href="' + esc(item.url) + '" target="_blank" rel="noopener">کالا</a>' +
      '<button type="button" class="icon-btn" data-act="remove-watch" data-id="' + item.id +
      '" aria-label="حذف ' + esc(item.title) + '">×</button>' +
      '</div>' +
      '</article>'
    );
  }

  function liveBarHTML() {
    var interval = live.meta && live.meta.interval_hours ? live.meta.interval_hours : 6;
    var latestCheck = null;
    live.items.forEach(function (item) {
      if (item.last_check && (!latestCheck || item.last_check > latestCheck)) {
        latestCheck = item.last_check;
      }
    });

    if (live.online === false) {
      return (
        '<div class="card live-bar offline"><span class="live-dot off"></span>' +
        '<div class="live-text"><strong>قیمت زنده وصل نیست</strong>' +
        '<span class="muted tiny">اتصال قیمت برقرار نیست؛ بعد از ورود دوباره امتحان کن.</span>' +
        '</div></div>'
      );
    }

    return (
      '<div class="card live-bar"><span class="live-dot"></span>' +
      '<div class="live-text"><strong>قیمت‌ها زنده‌اند</strong>' +
      '<span class="muted tiny">هر ' + fa(interval) + ' ساعت خودکار به‌روز می‌شود' +
      (latestCheck ? ' · آخرین بررسی ' + esc(relativeTime(latestCheck)) : '') +
      '</span></div>' +
      '<span class="spacer"></span>' +
      '<button type="button" class="btn ghost" data-act="check-all"' +
      (busy.checkAll ? ' disabled' : '') + '>' +
      (busy.checkAll ? 'در حال بررسی…' : 'بررسی همه') + '</button></div>'
    );
  }

  function watchFormHTML() {
    return (
      '<form class="card add-row" data-act="watch-submit">' +
      '<input data-draft="watchQuery" value="' + esc(draft.watchQuery) +
      '" placeholder="لینک محصول (مثلاً از ترب) یا نام کالا…" aria-label="کالا" autocomplete="off">' +
      '<button type="submit" class="btn primary"' + (busy.watch ? ' disabled' : '') + '>' +
      (busy.watch ? 'در حال خواندن…' : 'جستجو') + '</button></form>'
    );
  }

  function searchResultsHTML() {
    if (busy.search) {
      return (
        '<div class="card search-card"><p class="muted">در حال جستجوی ترب…</p>' +
        '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>'
      );
    }
    if (search.error) {
      return '<div class="card search-card"><p class="watch-note error">' + esc(search.error) + '</p></div>';
    }
    if (!search.results.length) return '';

    return (
      '<div class="card search-card"><div class="panel-head"><h3>نتیجه‌های ترب برای «' +
      esc(search.q) + '»</h3>' +
      '<button type="button" class="link-btn" data-act="close-search">بستن</button></div>' +
      '<ul class="plain-list">' +
      search.results.map(function (result) {
        return (
          '<li class="search-row"><div class="search-main">' +
          '<span class="search-title">' + esc(result.title) + '</span>' +
          '<span class="muted tiny">' + esc(result.shop || '') + '</span></div>' +
          '<span class="search-price">' + money(result.price) + ' <small>تومان</small></span>' +
          '<button type="button" class="btn primary small" data-act="track-result" data-url="' +
          esc(result.url) + '">زیر نظر</button></li>'
        );
      }).join('') +
      '</ul></div>'
    );
  }

  function quickListHTML() {
    var items = state.shopping;
    var remaining = items.filter(function (item) { return !item.done; });
    var bought = items.filter(function (item) { return item.done; });

    function itemRow(item) {
      return (
        '<div class="item ' + (item.done ? 'done' : '') + '">' +
        '<button type="button" class="check ' + (item.done ? 'on' : '') +
        '" data-act="toggle-item" data-id="' + item.id + '" aria-label="' +
        (item.done ? 'برگردان: ' : 'خریدم: ') + esc(item.title) + '">✓</button>' +
        '<span class="item-title">' + esc(item.title) + '</span>' +
        '<span class="spacer"></span>' +
        (item.qty ? '<span class="qty">' + esc(item.qty) + '</span>' : '') +
        '<button type="button" class="icon-btn" data-act="remove-item" data-id="' + item.id +
        '" aria-label="حذف ' + esc(item.title) + '">×</button></div>'
      );
    }

    return (
      '<div class="card quick-card"><div class="panel-head"><h3>خریدهای سریع</h3>' +
      '<span class="muted tiny">' + (items.length ? fa(remaining.length) + ' باقی از ' + fa(items.length) : 'خالی') +
      '</span></div>' +
      '<form class="add-row inline" data-act="add-item">' +
      '<input data-draft="shoppingTitle" value="' + esc(draft.shoppingTitle) +
      '" placeholder="مثلاً کاغذ A3" aria-label="نام کالا" autocomplete="off">' +
      '<input class="qty-input" data-draft="shoppingQty" value="' + esc(draft.shoppingQty) +
      '" placeholder="تعداد" aria-label="تعداد" autocomplete="off">' +
      '<button type="submit" class="btn">افزودن</button></form>' +
      (items.length
        ? '<div class="list">' + remaining.map(itemRow).join('') +
          (bought.length ? '<p class="done-divider">خریداری‌شده</p>' + bought.map(itemRow).join('') : '') +
          '</div>'
        : '<p class="empty">چیزی در لیست نیست.</p>') +
      '</div>'
    );
  }

  function buyHTML() {
    return (
      '<section class="section">' +
      '<div class="section-head"><div><h2>خرید</h2>' +
      '<p class="sub">قیمت کالاها خودکار از ترب خوانده می‌شود؛ فقط لینک بده یا اسمش را جستجو کن.</p></div>' +
      '<span class="pill on">' + fa(live.items.length) + ' کالا زیر نظر</span></div>' +
      liveBarHTML() +
      watchFormHTML() +
      searchResultsHTML() +
      (live.items.length
        ? '<div class="watch-list">' + live.items.map(watchedCardHTML).join('') + '</div>'
        : '<p class="card empty">' +
          (live.loading
            ? 'در حال خواندن قیمت‌ها…'
            : 'هنوز کالایی زیر نظر نداری. اسم باتری لپ‌تاپت را بنویس یا لینک صفحهٔ محصول در ترب را بده.') +
          '</p>') +
      quickListHTML() +
      '</section>'
    );
  }

  /* ------------------------------------------------------------------ */
  /* پروژه‌ها                                                            */
  /* ------------------------------------------------------------------ */

  function projectFormHTML() {
    return (
      '<form class="card project-form" data-act="add-project">' +
      '<div class="form-grid">' +
      '<label class="field"><span>نام پروژه</span>' +
      '<input data-draft="projectTitle" value="' + esc(draft.projectTitle) +
      '" placeholder="مثلاً هویت بصری کافه" autocomplete="off"></label>' +
      '<label class="field"><span>مشتری</span>' +
      '<input data-draft="projectClient" value="' + esc(draft.projectClient) +
      '" placeholder="نام مشتری" autocomplete="off"></label>' +
      '<label class="field"><span>سررسید</span>' +
      dateFieldHTML('projectDue', draft.projectDue, 'انتخاب تاریخ') + '</label>' +
      '<label class="field"><span>دستمزد (تومان)</span>' +
      '<input type="number" inputmode="numeric" min="0" data-draft="projectBudget" value="' +
      esc(draft.projectBudget) + '" placeholder="۰"></label>' +
      '<label class="field"><span>وضعیت</span>' +
      '<select data-draft="projectStatus">' + statusOptionsHTML(draft.projectStatus) + '</select></label>' +
      '</div>' +
      '<div class="form-actions"><button type="submit" class="btn primary">افزودن پروژه</button></div>' +
      '</form>'
    );
  }

  function projectCardHTML(project, index) {
    var doneTasks = project.tasks.filter(function (task) { return task.done; }).length;
    var percent = project.tasks.length
      ? Math.round((doneTasks / project.tasks.length) * 100)
      : 0;

    var tasksHTML = project.tasks.length
      ? '<ul>' + project.tasks.map(function (task) {
          return (
            '<li class="' + (task.done ? 'done' : '') + '">' +
            '<button type="button" class="check small ' + (task.done ? 'on' : '') +
            '" data-act="toggle-task" data-id="' + project.id + '" data-task="' + task.id +
            '" aria-label="تیک ' + esc(task.title) + '">✓</button>' +
            '<span class="task-title">' + esc(task.title) + '</span>' +
            '<button type="button" class="icon-btn tiny" data-act="remove-task" data-id="' + project.id +
            '" data-task="' + task.id + '" aria-label="حذف ' + esc(task.title) + '">×</button>' +
            '</li>'
          );
        }).join('') + '</ul>'
      : '';

    return (
      '<article class="card project" style="animation-delay:' + Math.min(index * 60, 300) + 'ms">' +
      '<div class="project-top"><div>' +
      '<h3>' + esc(project.title) + '</h3>' +
      '<p class="muted tiny">' + esc(project.client || 'بدون مشتری') + '</p></div>' +
      '<button type="button" class="icon-btn" data-act="remove-project" data-id="' + project.id +
      '" aria-label="حذف پروژه">×</button></div>' +

      '<div class="project-meta">' +
      '<select class="status status-' + project.status + '" data-act="set-status" data-id="' +
      project.id + '" aria-label="وضعیت پروژه">' + statusOptionsHTML(project.status) + '</select>' +
      (project.due && project.status !== 'done'
        ? '<span class="due ' + dueTone(project.due) + '">' + esc(dueLabel(project.due)) + '</span>'
        : '') +
      '</div>' +

      '<div class="project-facts">' +
      '<div class="fact"><span>سررسید</span>' +
      dateFieldHTML('due:' + project.id, project.due, 'تعیین نشده') + '</div>' +
      '<div class="fact"><span>دستمزد</span><strong>' +
      (project.budget ? money(project.budget) + ' تومان' : '—') +
      '</strong></div>' +
      '</div>' +

      '<div class="tasks">' +
      '<div class="tasks-head"><span>مرحله‌ها</span><span>' + fa(doneTasks) + ' از ' +
      fa(project.tasks.length) + '</span></div>' +
      '<div class="bar"><span style="width:' + percent + '%"></span></div>' +
      tasksHTML +
      '<form class="task-add" data-act="add-task" data-id="' + project.id + '">' +
      '<input placeholder="افزودن مرحله…" aria-label="مرحلهٔ تازه" autocomplete="off">' +
      '<button type="submit" class="btn ghost">+</button>' +
      '</form>' +
      '</div>' +
      '</article>'
    );
  }

  function projectsHTML() {
    var filters = [
      { id: 'all', label: 'همه' },
      { id: 'open', label: 'در جریان' },
      { id: 'done', label: 'تحویل‌شده' },
    ];

    var projects = state.projects.filter(function (project) {
      if (projectFilter === 'open') return project.status !== 'done';
      if (projectFilter === 'done') return project.status === 'done';
      return true;
    });

    var filtersHTML = filters.map(function (item) {
      return (
        '<button type="button" class="pill ' + (projectFilter === item.id ? 'on' : '') +
        '" data-act="filter" data-filter="' + item.id + '">' + item.label + '</button>'
      );
    }).join('');

    var body = projects.length
      ? '<div class="projects-grid">' + projects.map(projectCardHTML).join('') + '</div>'
      : '<p class="card empty">' +
        (state.projects.length === 0
          ? 'هنوز پروژه‌ای نداری. با دکمهٔ «پروژهٔ تازه» اولین کار را اضافه کن.'
          : 'در این دسته چیزی نیست.') +
        '</p>';

    return (
      '<section class="section">' +
      '<div class="section-head"><div><h2>پروژه‌ها</h2>' +
      '<p class="sub">وضعیت، سررسید و مرحله‌های هر کار را یک‌جا ببین.</p></div>' +
      '<div class="head-actions"><div class="pills">' + filtersHTML + '</div>' +
      '<button type="button" class="btn primary" data-act="toggle-project-form">' +
      (projectFormOpen ? 'بستن' : '+ پروژهٔ تازه') + '</button></div></div>' +
      (projectFormOpen ? projectFormHTML() : '') +
      body +
      '</section>'
    );
  }

  /* ------------------------------------------------------------------ */
  /* مالی                                                                */
  /* ------------------------------------------------------------------ */

  function financeHTML() {
    var jy = monthCursor.jy;
    var jm = monthCursor.jm;
    var bounds = monthBounds(jy, jm);
    var monthTx = sortByDateDesc(state.transactions.filter(function (tx) {
      return tx.date >= bounds.start && tx.date <= bounds.end;
    }));
    var income = sum(monthTx.filter(function (tx) { return tx.kind === 'income'; }));
    var expense = sum(monthTx.filter(function (tx) { return tx.kind === 'expense'; }));
    var balance = income - expense;
    var savingsRate = income > 0 ? Math.round((balance / income) * 100) : 0;
    var cats = expenseByCategory(monthTx);
    var visibleTx = txFilter === 'all' ? monthTx : monthTx.filter(function (tx) { return tx.kind === txFilter; });
    var categories = txKind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

    var categoryOptions = categories.map(function (name) {
      return '<option value="' + esc(name) + '"' +
        (draft.txCategory === name ? ' selected' : '') + '>' + esc(name) + '</option>';
    }).join('');

    var cur = currentJalali();
    var isThisMonth = jy === cur.jy && jm === cur.jm;

    var txListHTML = visibleTx.length
      ? '<ul class="plain-list">' + visibleTx.map(function (tx) {
          return (
            '<li class="tx"><span class="tx-mark ' + tx.kind + '" aria-hidden="true">' +
            (tx.kind === 'income' ? '↑' : '↓') + '</span>' +
            '<div class="tx-main"><span class="tx-title">' + esc(tx.title) + '</span>' +
            '<span class="tx-sub">' + esc(tx.category) + ' · ' + esc(formatDate(tx.date)) + '</span></div>' +
            '<span class="tx-amount ' + tx.kind + '">' + (tx.kind === 'income' ? '+' : '−') +
            money(tx.amount) + '</span>' +
            '<button type="button" class="icon-btn" data-act="remove-tx" data-id="' + tx.id +
            '" aria-label="حذف ' + esc(tx.title) + '">×</button></li>'
          );
        }).join('') + '</ul>'
      : '<p class="empty">' + (txFilter === 'all' ? 'در این ماه چیزی ثبت نشده.' : 'تراکنشی با این فیلتر نیست.') + '</p>';

    return (
      '<section class="section">' +
      '<div class="section-head"><div><h2>مالی</h2>' +
      '<p class="sub">دفترِ کل زندگی: درآمد، هزینه، بودجه، هدف و دارایی.</p></div>' +
      '<div class="head-actions"><button type="button" class="btn ghost small" data-act="toggle-privacy">' +
      (state.prefs.hideAmounts ? 'نمایش مبالغ' : 'مخفی کردن مبالغ') + '</button>' +
      '<div class="month-bar">' +
      '<button type="button" class="nav-btn" data-act="month" data-delta="-1" aria-label="ماه قبل">›</button>' +
      '<span class="month-title">' + esc(monthLabel(jy, jm)) + '</span>' +
      '<button type="button" class="nav-btn" data-act="month" data-delta="1" aria-label="ماه بعد">‹</button>' +
      (isThisMonth ? '' : '<button type="button" class="link-btn" data-act="this-month">این ماه</button>') +
      '</div></div></div>' +

      '<div class="money-row">' +
      '<div class="card money"><span class="label">درآمد</span>' +
      '<span class="value income"><span data-count="' + income + '">' + money(income) + '</span></span></div>' +
      '<div class="card money"><span class="label">هزینه</span>' +
      '<span class="value expense"><span data-count="' + expense + '">' + money(expense) + '</span></span></div>' +
      '<div class="card money"><span class="label">مانده</span>' +
      '<span class="value ' + (balance < 0 ? 'expense' : 'income') + '">' +
      '<span data-count="' + balance + '">' + money(balance) + '</span></span></div>' +
      '<div class="card money"><span class="label">نرخ پس‌انداز</span>' +
      '<span class="value ' + (savingsRate < 0 ? 'expense' : 'income') + '">' + fa(savingsRate) + '٪</span>' +
      '<span class="muted tiny">از درآمد این ماه</span></div>' +
      '</div>' +

      '<div class="fin-grid">' +
      '<div class="card panel">' + trendPanelHTML(jy, jm) + '</div>' +
      '<div class="card panel">' + accountsPanelHTML() + '</div>' +
      '</div>' +

      '<div class="fin-grid">' +
      '<div class="card panel">' + goalsPanelHTML() + '</div>' +
      '<div class="card panel">' + billsPanelHTML(jy, jm) + '</div>' +
      '</div>' +

      '<div class="card panel">' + budgetsPanelHTML(monthTx) + '</div>' +

      '<form class="card tx-form" data-act="add-tx">' +
      '<div class="kind-switch" role="group" aria-label="نوع تراکنش">' +
      '<button type="button" class="' + (txKind === 'income' ? 'on income' : '') +
      '" data-act="kind" data-kind="income">درآمد</button>' +
      '<button type="button" class="' + (txKind === 'expense' ? 'on expense' : '') +
      '" data-act="kind" data-kind="expense">هزینه</button>' +
      '</div>' +
      '<div class="form-grid">' +
      '<label class="field"><span>شرح</span>' +
      '<input data-draft="txTitle" value="' + esc(draft.txTitle) + '" placeholder="' +
      (txKind === 'income' ? 'مثلاً تسویهٔ پروژهٔ لوگو' : 'مثلاً اشتراک ادوبی') + '" autocomplete="off"></label>' +
      '<label class="field"><span>مبلغ (تومان)</span>' +
      '<input type="number" inputmode="numeric" min="0" data-draft="txAmount" value="' +
      esc(draft.txAmount) + '" placeholder="۰"></label>' +
      '<label class="field"><span>دسته</span>' +
      '<select data-draft="txCategory">' + categoryOptions + '</select></label>' +
      '<label class="field"><span>تاریخ (شمسی)</span>' +
      dateFieldHTML('txDate', draft.txDate, 'انتخاب تاریخ') + '</label>' +
      '</div>' +
      '<div class="form-actions"><button type="submit" class="btn primary">ثبت</button></div>' +
      '</form>' +

      '<div class="panels">' +
      '<div class="card panel"><div class="panel-head"><h3>تراکنش‌های ' +
      esc(monthLabel(jy, jm)) + '</h3><span class="spacer"></span>' +
      '<div class="segmented" role="group" aria-label="فیلتر تراکنش">' +
      '<button type="button" class="' + (txFilter === 'all' ? 'on' : '') + '" data-act="tx-filter" data-filter="all">همه</button>' +
      '<button type="button" class="' + (txFilter === 'income' ? 'on' : '') + '" data-act="tx-filter" data-filter="income">درآمد</button>' +
      '<button type="button" class="' + (txFilter === 'expense' ? 'on' : '') + '" data-act="tx-filter" data-filter="expense">هزینه</button>' +
      '</div><span class="muted tiny">' + fa(visibleTx.length) + ' مورد</span></div>' + txListHTML + '</div>' +
      '<div class="card panel"><div class="panel-head"><h3>هزینه به تفکیک دسته</h3>' +
      '<span class="muted tiny">' + fa(cats.length) + ' دسته</span></div>' +
      (cats.length
        ? '<div class="donut-row">' + donutHTML(cats, expense) + legendHTML(cats) + '</div>'
        : '<p class="empty">هزینه‌ای برای این ماه ثبت نشده.</p>') + '</div>' +
      '</div>' +
      '</section>'
    );
  }

  /* ------------------------------------------------------------------ */
  /* خرید                                                                */
  /* ------------------------------------------------------------------ */

  /* ------------------------------------------------------------------ */
  /* تقویم شمسی                                                          */
  /* ------------------------------------------------------------------ */

  function openPicker(target, iso) {
    var base = jalaliOf(iso || todayISO());
    picker = { target: target, jy: base.jy, jm: base.jm, selected: iso || todayISO() };
    renderOverlay();
  }

  function renderOverlay() {
    if (!picker) {
      overlayRoot.innerHTML = '';
      return;
    }

    var jy = picker.jy;
    var jm = picker.jm;
    var length = monthLengthJalali(jy, jm);
    var startISO = monthStartISO(jy, jm);
    var offset = weekdayIndex(startISO);
    var today = todayISO();
    var cells = '';

    for (var blank = 0; blank < offset; blank += 1) {
      cells += '<span class="day-cell blank"></span>';
    }

    for (var day = 1; day <= length; day += 1) {
      var iso = addDays(startISO, day - 1);
      var classes = 'day-cell';
      if (iso === today) classes += ' is-today';
      if (iso === picker.selected) classes += ' is-selected';
      cells += '<button type="button" class="' + classes + '" data-act="pick-day" data-day="' +
        day + '">' + fa(day) + '</button>';
    }

    overlayRoot.innerHTML =
      '<div class="overlay">' +
      '<div class="overlay-bg" data-act="close-picker"></div>' +
      '<div class="picker card" role="dialog" aria-label="انتخاب تاریخ شمسی">' +
      '<div class="picker-head">' +
      '<button type="button" class="nav-btn" data-act="picker-month" data-delta="-1" aria-label="ماه قبل">›</button>' +
      '<div class="picker-title"><strong>' + esc(monthLabel(jy, jm)) + '</strong>' +
      '<div class="picker-years">' +
      '<button type="button" class="link-btn" data-act="picker-year" data-delta="-1">' + fa(jy - 1) + '</button>' +
      '<button type="button" class="link-btn" data-act="picker-year" data-delta="1">' + fa(jy + 1) + '</button>' +
      '</div></div>' +
      '<button type="button" class="nav-btn" data-act="picker-month" data-delta="1" aria-label="ماه بعد">‹</button>' +
      '</div>' +
      '<div class="weekdays">' + WEEKDAYS_SHORT.map(function (name) {
        return '<span>' + name + '</span>';
      }).join('') + '</div>' +
      '<div class="days">' + cells + '</div>' +
      '<div class="picker-foot">' +
      '<button type="button" class="btn ghost" data-act="picker-today">امروز</button>' +
      '<button type="button" class="btn" data-act="close-picker">بستن</button>' +
      '</div>' +
      '</div></div>';
  }

  function currentDateFor(target) {
    if (target.indexOf('due:') === 0) {
      var project = findProject(target.slice(4));
      return project ? project.due : '';
    }
    return draft[target] || '';
  }

  function applyDate(iso) {
    var target = picker.target;
    picker = null;
    if (target === 'txDate') {
      draft.txDate = iso;
      monthCursor = jalaliOf(iso);
    } else if (target === 'projectDue') {
      draft.projectDue = iso;
    } else if (target.indexOf('due:') === 0) {
      var project = findProject(target.slice(4));
      if (project) {
        project.due = iso;
        save();
      }
    }
    render();
  }

  /* ------------------------------------------------------------------ */
  /* رندر                                                                */
  /* ------------------------------------------------------------------ */

  function updateTabs() {
    var buttons = tabsEl.querySelectorAll('[data-tab]');
    Array.prototype.forEach.call(buttons, function (button) {
      var isActive = button.dataset.tab === tab;
      button.classList.toggle('active', isActive);
      if (isActive) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
  }

  function updateChrome() {
    var switchEl = document.getElementById('privacy-switch');
    if (switchEl) {
      switchEl.classList.toggle('on', !!state.prefs.hideAmounts);
      switchEl.setAttribute('aria-pressed', state.prefs.hideAmounts ? 'true' : 'false');
    }

    var greet = document.getElementById('greet-title');
    if (greet) greet.textContent = greetingText() + '، ' + displayName() + ' 👋';

    var bell = document.getElementById('bell-count');
    if (bell) {
      var monthKey = monthKeyOf(currentJalali());
      var overdue = state.tasks.filter(function (task) { return !task.done && task.date < todayISO(); }).length;
      var unpaid = state.bills.filter(function (bill) { return !(bill.paid && bill.paid[monthKey]); }).length;
      var count = overdue + unpaid;
      bell.hidden = !count;
      bell.textContent = fa(count);
    }
  }

  function screenHTML() {
    if (tab === 'buy') return buyHTML();
    if (tab === 'projects') return projectsHTML();
    if (tab === 'finance') return financeHTML();
    if (tab === 'settings') return settingsHTML();
    if (tab === 'daily') return dailyHTML();
    return dashboardHTML();
  }

  function animateCounters() {
    var nodes = view.querySelectorAll('[data-count]');
    if (!nodes.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    Array.prototype.forEach.call(nodes, function (node) {
      var target = Number(node.getAttribute('data-count')) || 0;
      var started = performance.now();
      var duration = 620;

      function frame(now) {
        var progress = Math.min(1, (now - started) / duration);
        var eased = 1 - Math.pow(1 - progress, 3);
        node.textContent = money(Math.round(target * eased));
        if (progress < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
  }

  function render() {
    updateTabs();
    updateChrome();
    view.innerHTML = screenHTML();
    renderOverlay();
    animateCounters();
  }

  function focusField(name) {
    var field = view.querySelector('[data-draft="' + name + '"]');
    if (field) field.focus();
  }

  function toast(message) {
    toastRoot.innerHTML = '<div class="toast">' + esc(message) + '</div>';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastRoot.innerHTML = '';
    }, 2200);
  }

  function togglePrivacy() {
    state.prefs.hideAmounts = !state.prefs.hideAmounts;
    save();
    render();
    toast(state.prefs.hideAmounts ? 'مبالغ مخفی شدند' : 'مبالغ نمایش داده می‌شوند');
  }

  function syncNow() {
    if (!cloud.enabled || !cloud.user) {
      toast('برای همگام‌سازی وارد حساب شو');
      return;
    }
    cloudSaveNow();
    cloudRefreshPrices();
    toast('همگام شد');
  }

  function findProject(id) {
    return state.projects.filter(function (project) { return project.id === id; })[0] || null;
  }

  /* ------------------------------------------------------------------ */
  /* رویدادها                                                            */
  /* ------------------------------------------------------------------ */

  tabsEl.addEventListener('click', function (event) {
    var button = event.target.closest('[data-tab]');
    if (!button) return;
    tab = button.dataset.tab;
    render();
    if (tab === 'buy' || tab === 'daily') loadLive(true);
  });

  view.addEventListener('input', function (event) {
    var field = event.target.closest('[data-draft]');
    if (field) draft[field.dataset.draft] = field.value;
  });

  view.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter' || event.isComposing) return;
    var field = event.target.closest('[data-draft="watchQuery"]');
    if (!field) return;
    event.preventDefault();
    var form = field.closest('form[data-act]');
    if (form) form.requestSubmit();
  });

  view.addEventListener('change', function (event) {
    var field = event.target.closest('[data-draft]');
    if (field) draft[field.dataset.draft] = field.value;

    var control = event.target.closest('[data-act]');
    if (!control) return;

    if (control.dataset.act === 'set-status') {
      var project = findProject(control.dataset.id);
      if (!project) return;
      project.status = control.value;
      save();
      render();
    }
  });

  view.addEventListener('click', function (event) {
    var button = event.target.closest('[data-act]');
    if (!button) return;
    var act = button.dataset.act;
    var id = button.dataset.id;

    switch (act) {
      case 'nav':
        tab = button.dataset.tab;
        render();
        if (tab === 'buy') loadLive(true);
        break;

      case 'toggle-privacy':
        togglePrivacy();
        break;

      case 'sync':
        syncNow();
        break;

      case 'tx-filter':
        txFilter = button.dataset.filter;
        render();
        break;

      case 'remove-budget':
        delete state.budgets[id];
        save();
        render();
        break;

      case 'remove-account':
        state.accounts = state.accounts.filter(function (item) { return item.id !== id; });
        save();
        render();
        break;

      case 'remove-goal':
        state.goals = state.goals.filter(function (goal) { return goal.id !== id; });
        save();
        render();
        break;

      case 'remove-bill':
        state.bills = state.bills.filter(function (bill) { return bill.id !== id; });
        save();
        render();
        break;

      case 'bill-paid':
        var billMonth = monthKeyOf(monthCursor);
        state.bills.forEach(function (bill) {
          if (bill.id !== id) return;
          bill.paid = bill.paid || {};
          bill.paid[billMonth] = !bill.paid[billMonth];
        });
        save();
        render();
        break;

      case 'open-date':
        openPicker(button.dataset.target, currentDateFor(button.dataset.target));
        break;

      case 'add-daily':
        break;

      case 'toggle-daily':
        state.tasks.forEach(function (task) {
          if (task.id === id) task.done = !task.done;
        });
        save();
        render();
        break;

      case 'remove-daily':
        state.tasks = state.tasks.filter(function (task) { return task.id !== id; });
        save();
        render();
        break;

      case 'carry-daily':
        state.tasks.forEach(function (task) {
          if (task.id === id) task.date = todayISO();
        });
        save();
        render();
        toast('به امروز منتقل شد');
        break;

      case 'carry-all':
        state.tasks.forEach(function (task) {
          if (!task.done && task.date < todayISO()) task.date = todayISO();
        });
        save();
        render();
        toast('کارهای عقب‌افتاده به امروز منتقل شد');
        break;

      case 'toggle-item':
        state.shopping.forEach(function (item) {
          if (item.id === id) item.done = !item.done;
        });
        save();
        render();
        break;

      case 'remove-item':
        state.shopping = state.shopping.filter(function (item) { return item.id !== id; });
        save();
        render();
        break;

      case 'clear-done':
        state.shopping = state.shopping.filter(function (item) { return !item.done; });
        save();
        render();
        break;

      case 'check-all':
        if (busy.checkAll) return;
        busy.checkAll = true;
        render();
        api('/api/check', {})
          .then(function (payload) {
            applyLive(payload);
            busy.checkAll = false;
            toast('قیمت‌ها به‌روز شد');
            render();
          })
          .catch(function () {
            busy.checkAll = false;
            toast('به‌روزرسانی ممکن نشد');
            render();
          });
        break;

      case 'check-item':
        if (busy.items[id]) return;
        busy.items[id] = true;
        render();
        api('/api/check', { id: id })
          .then(function (payload) {
            applyLive(payload);
            busy.items[id] = false;
            toast('قیمت به‌روز شد');
            render();
          })
          .catch(function () {
            busy.items[id] = false;
            toast('بررسی ممکن نشد');
            render();
          });
        break;

      case 'remove-watch':
        if (!window.confirm('این کالا از رصد حذف شود؟')) return;
        api('/api/delete', { id: id })
          .then(function (payload) {
            applyLive(payload);
            toast('حذف شد');
            render();
          })
          .catch(function () {
            toast('حذف ممکن نشد');
          });
        break;

      case 'track-result':
        if (busy.watch) return;
        busy.watch = true;
        render();
        api('/api/watch', { url: button.dataset.url })
          .then(function (payload) {
            applyLive(payload);
            busy.watch = false;
            search = { status: 'idle', q: search.q, results: [], error: '' };
            toast('به رصد اضافه شد');
            render();
          })
          .catch(function (error) {
            busy.watch = false;
            search.error = error.message || 'افزودن ممکن نشد';
            render();
          });
        break;

      case 'close-search':
        search = { status: 'idle', q: search.q, results: [], error: '' };
        render();
        break;

      case 'toggle-project-form':
        projectFormOpen = !projectFormOpen;
        render();
        break;

      case 'filter':
        projectFilter = button.dataset.filter;
        render();
        break;

      case 'remove-project':
        if (window.confirm('این پروژه و مرحله‌هایش حذف شود؟')) {
          state.projects = state.projects.filter(function (project) { return project.id !== id; });
          save();
          render();
        }
        break;

      case 'toggle-task':
        state.projects.forEach(function (project) {
          if (project.id !== id) return;
          project.tasks.forEach(function (task) {
            if (task.id === button.dataset.task) task.done = !task.done;
          });
        });
        save();
        render();
        break;

      case 'remove-task':
        state.projects.forEach(function (project) {
          if (project.id !== id) return;
          project.tasks = project.tasks.filter(function (task) {
            return task.id !== button.dataset.task;
          });
        });
        save();
        render();
        break;

      case 'month':
        monthCursor = shiftMonth(monthCursor.jy, monthCursor.jm, Number(button.dataset.delta));
        render();
        break;

      case 'this-month':
        monthCursor = currentJalali();
        render();
        break;

      case 'kind':
        txKind = button.dataset.kind;
        draft.txCategory = (txKind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES)[0];
        render();
        break;

      case 'remove-tx':
        state.transactions = state.transactions.filter(function (tx) { return tx.id !== id; });
        save();
        render();
        break;

      default:
        break;
    }
  });

  overlayRoot.addEventListener('click', function (event) {
    var control = event.target.closest('[data-act]');
    if (!control || !picker) return;
    var act = control.dataset.act;

    if (act === 'close-picker') {
      picker = null;
      renderOverlay();
      return;
    }

    if (act === 'picker-month') {
      var next = shiftMonth(picker.jy, picker.jm, Number(control.dataset.delta));
      picker.jy = next.jy;
      picker.jm = next.jm;
      renderOverlay();
      return;
    }

    if (act === 'picker-year') {
      picker.jy += Number(control.dataset.delta);
      renderOverlay();
      return;
    }

    if (act === 'picker-today') {
      applyDate(todayISO());
      return;
    }

    if (act === 'pick-day') {
      applyDate(isoFromJalali(picker.jy, picker.jm, Number(control.dataset.day)));
    }
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && picker) {
      picker = null;
      renderOverlay();
    }
  });

  view.addEventListener('submit', function (event) {
    var form = event.target.closest('form[data-act]');
    if (!form) return;
    event.preventDefault();
    var act = form.dataset.act;

    if (act === 'add-daily') {
      var taskTitle = draft.taskTitle.trim();
      if (!taskTitle) return;
      state.tasks.unshift({
        id: uid(),
        title: taskTitle,
        date: todayISO(),
        done: false,
        createdAt: Date.now(),
      });
      draft.taskTitle = '';
      save();
      render();
      focusField('taskTitle');
      return;
    }

    if (act === 'watch-submit') {
      var query = draft.watchQuery.trim();
      if (!query) return;

      if (query.indexOf('http') === 0) {
        busy.watch = true;
        search = { status: 'idle', q: '', results: [], error: '' };
        render();
        api('/api/watch', { url: query })
          .then(function (payload) {
            applyLive(payload);
            busy.watch = false;
            draft.watchQuery = '';
            toast('قیمت خوانده شد');
            render();
            focusField('watchQuery');
          })
          .catch(function (error) {
            busy.watch = false;
            search.error = error.message || 'خواندن قیمت ممکن نشد';
            render();
          });
        return;
      }

      busy.search = true;
      search = { status: 'searching', q: query, results: [], error: '' };
      render();
      api('/api/search', { q: query })
        .then(function (payload) {
          busy.search = false;
          search.status = 'done';
          search.results = payload.results || [];
          if (!search.results.length) {
            search.error = 'چیزی پیدا نشد؛ لینک مستقیم صفحهٔ محصول را بده.';
          }
          render();
        })
        .catch(function (error) {
          busy.search = false;
          search.error = error.message || 'جستجو ممکن نشد';
          render();
        });
      return;
    }

    if (act === 'add-item') {
      var itemTitle = draft.shoppingTitle.trim();
      if (!itemTitle) return;
      state.shopping.unshift({
        id: uid(),
        title: itemTitle,
        qty: draft.shoppingQty.trim(),
        done: false,
        createdAt: Date.now(),
      });
      draft.shoppingTitle = '';
      draft.shoppingQty = '';
      save();
      render();
      focusField('shoppingTitle');
      return;
    }

    if (act === 'add-project') {
      var title = draft.projectTitle.trim();
      if (!title) return;
      state.projects.unshift({
        id: uid(),
        title: title,
        client: draft.projectClient.trim(),
        due: draft.projectDue,
        budget: Number(draft.projectBudget) || 0,
        status: draft.projectStatus,
        tasks: [],
        createdAt: Date.now(),
      });
      draft.projectTitle = '';
      draft.projectClient = '';
      draft.projectDue = '';
      draft.projectBudget = '';
      draft.projectStatus = 'plan';
      projectFormOpen = false;
      projectFilter = 'all';
      save();
      render();
      toast('پروژه اضافه شد');
      return;
    }

    if (act === 'add-task') {
      var input = form.querySelector('input');
      var stageTitle = input ? input.value.trim() : '';
      if (!stageTitle) return;
      state.projects.forEach(function (project) {
        if (project.id !== form.dataset.id) return;
        project.tasks.push({ id: uid(), title: stageTitle, done: false });
      });
      save();
      render();
      var nextInput = view.querySelector(
        'form[data-act="add-task"][data-id="' + form.dataset.id + '"] input',
      );
      if (nextInput) nextInput.focus();
      return;
    }

    if (act === 'add-tx') {
      var txTitle = draft.txTitle.trim();
      var amount = Number(draft.txAmount);
      if (!txTitle || !amount) return;
      var txDate = draft.txDate || todayISO();
      state.transactions.unshift({
        id: uid(),
        kind: txKind,
        title: txTitle,
        amount: amount,
        category: draft.txCategory,
        date: txDate,
        createdAt: Date.now(),
      });
      monthCursor = jalaliOf(txDate);
      draft.txTitle = '';
      draft.txAmount = '';
      save();
      render();
      focusField('txTitle');
      toast('ثبت شد');
      return;
    }

    if (act === 'set-budget') {
      var budgetLimit = Number(draft.budgetAmount);
      if (!budgetLimit) return;
      state.budgets[draft.budgetCategory] = budgetLimit;
      draft.budgetAmount = '';
      save();
      render();
      toast('سقف بودجه ثبت شد');
      return;
    }

    if (act === 'add-account') {
      var accountTitle = draft.accountTitle.trim();
      var accountAmount = Number(draft.accountAmount);
      if (!accountTitle || !accountAmount) return;
      state.accounts.push({
        id: uid(),
        title: accountTitle,
        amount: accountAmount,
        kind: draft.accountKind === 'debt' ? 'debt' : 'asset',
      });
      draft.accountTitle = '';
      draft.accountAmount = '';
      save();
      render();
      toast('حساب اضافه شد');
      return;
    }

    if (act === 'add-goal') {
      var newGoalTitle = draft.goalTitle.trim();
      var newGoalTarget = Number(draft.goalTarget);
      if (!newGoalTitle || !newGoalTarget) return;
      state.goals.push({
        id: uid(),
        title: newGoalTitle,
        target: newGoalTarget,
        saved: 0,
        due: draft.goalDue || '',
        createdAt: Date.now(),
      });
      draft.goalTitle = '';
      draft.goalTarget = '';
      save();
      render();
      toast('هدف ساخته شد');
      return;
    }

    if (act === 'goal-deposit') {
      var depositInput = form.querySelector('input[name="amount"]');
      var depositAmount = depositInput ? Number(depositInput.value) : 0;
      if (!depositAmount) return;
      state.goals.forEach(function (goal) {
        if (goal.id === form.dataset.id) {
          goal.saved = (Number(goal.saved) || 0) + depositAmount;
        }
      });
      save();
      render();
      toast('واریز ثبت شد');
      return;
    }

    if (act === 'add-bill') {
      var billTitle = draft.billTitle.trim();
      var billAmount = Number(draft.billAmount);
      if (!billTitle || !billAmount) return;
      state.bills.push({
        id: uid(),
        title: billTitle,
        amount: billAmount,
        day: Math.min(31, Math.max(1, Number(draft.billDay) || 1)),
        paid: {},
      });
      draft.billTitle = '';
      draft.billAmount = '';
      save();
      render();
      toast('قسط اضافه شد');
      return;
    }
  });

  /* ------------------------------------------------------------------ */
  /* نوار بالا، جستجو و پل افزونه                                          */
  /* ------------------------------------------------------------------ */

  document.addEventListener('click', function (event) {
    if (event.target.closest('#view')) return;
    var control = event.target.closest('[data-act]');
    if (!control) return;
    var act = control.dataset.act;
    if (act === 'toggle-privacy') {
      togglePrivacy();
    } else if (act === 'sync') {
      syncNow();
    } else if (act === 'nav') {
      tab = control.dataset.tab;
      render();
      if (tab === 'buy') loadLive(true);
    } else if (act === 'collapse') {
      document.querySelector('.app').classList.toggle('compact');
    }
  });

  var searchInput = document.getElementById('side-search');
  var searchBox = document.getElementById('search-results');
  var searchItems = [];

  function searchMatches(term) {
    var query = term.trim();
    if (!query) return [];
    var results = [];

    state.transactions.forEach(function (tx) {
      if (String(tx.title).indexOf(query) < 0) return;
      results.push({
        tab: 'finance',
        title: tx.title,
        sub: 'تراکنش · ' + (tx.category || '') + ' · ' + formatDate(tx.date),
        amount: (tx.kind === 'income' ? '+' : '−') + money(tx.amount),
      });
    });

    state.tasks.forEach(function (task) {
      if (String(task.title).indexOf(query) < 0) return;
      results.push({ tab: 'daily', title: task.title, sub: 'کار روزمره' });
    });

    state.projects.forEach(function (project) {
      if (String(project.title).indexOf(query) < 0) return;
      results.push({ tab: 'projects', title: project.title, sub: 'پروژه' });
    });

    state.goals.forEach(function (goal) {
      if (String(goal.title).indexOf(query) < 0) return;
      results.push({ tab: 'finance', title: goal.title, sub: 'هدف پس‌انداز' });
    });

    state.bills.forEach(function (bill) {
      if (String(bill.title).indexOf(query) < 0) return;
      results.push({ tab: 'finance', title: bill.title, sub: 'قسط یا قبض' });
    });

    state.shopping.forEach(function (item) {
      if (String(item.title).indexOf(query) < 0) return;
      results.push({ tab: 'buy', title: item.title, sub: 'لیست خرید' });
    });

    return results.slice(0, 6);
  }

  function renderSearch() {
    if (!searchBox) return;
    var term = searchInput ? searchInput.value : '';
    searchItems = searchMatches(term);
    if (!term.trim()) {
      searchBox.hidden = true;
      searchBox.innerHTML = '';
      return;
    }
    searchBox.hidden = false;
    searchBox.innerHTML = searchItems.length
      ? searchItems
          .map(function (item, index) {
            return (
              '<button type="button" class="search-item" data-index="' + index + '">' +
              '<span class="search-item-main"><span class="search-item-title">' + esc(item.title) + '</span>' +
              '<span class="search-item-sub">' + esc(item.sub) + '</span></span>' +
              (item.amount ? '<span class="search-item-amount">' + item.amount + '</span>' : '') +
              '</button>'
            );
          })
          .join('')
      : '<p class="search-empty">چیزی پیدا نشد.</p>';
  }

  if (searchInput) {
    searchInput.addEventListener('input', renderSearch);
    searchInput.addEventListener('focus', renderSearch);
  }

  if (searchBox) {
    searchBox.addEventListener('click', function (event) {
      var button = event.target.closest('[data-index]');
      if (!button) return;
      var item = searchItems[Number(button.dataset.index)];
      if (!item) return;
      tab = item.tab;
      searchInput.value = '';
      searchBox.hidden = true;
      render();
      if (tab === 'buy') loadLive(true);
    });
  }

  document.addEventListener('click', function (event) {
    if (!searchBox || event.target.closest('.side-search-wrap')) return;
    searchBox.hidden = true;
  });

  window.addEventListener('message', function (event) {
    var data = event.data;
    if (!data || data.type !== 'kargah:quick-add') return;
    var items = Array.isArray(data.items) ? data.items : [];
    var added = 0;

    items.forEach(function (entry) {
      var amount = Number(entry && entry.amount);
      var title = entry && entry.title ? String(entry.title).trim() : '';
      if (!title || !amount) return;
      state.transactions.unshift({
        id: uid(),
        kind: entry.kind === 'income' ? 'income' : 'expense',
        title: title,
        amount: amount,
        category: entry.category || (entry.kind === 'income' ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0]),
        date: entry.date || todayISO(),
        createdAt: Date.now(),
      });
      added += 1;
    });

    if (!added) return;
    save();
    render();
    toast(fa(added) + ' تراکنش از افزونه ثبت شد');
  });

  window.addEventListener('resize', updateTabs);
  window.addEventListener('load', updateTabs);

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(updateTabs);
  }

  /* ------------------------------------------------------------------ */
  /* شروع                                                                */
  /* ------------------------------------------------------------------ */

  document.getElementById('today-line').textContent = formatToday();
  render();
  if (cloud.enabled) cloudBoot();
  loadLive(true);
})();
