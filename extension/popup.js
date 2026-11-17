(function () {
  'use strict';

  var APP_URL = 'https://armvnhs.ir/kargah/';
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
  var INCOME_CATEGORIES = ['حقوق', 'پروژه', 'فروش', 'مشاوره', 'سود سرمایه', 'هدیه', 'سایر'];
  var kind = 'expense';

  var form = document.getElementById('quick-form');
  var titleInput = document.getElementById('title');
  var amountInput = document.getElementById('amount');
  var categorySelect = document.getElementById('category');
  var hint = document.getElementById('hint');
  var queueLabel = document.getElementById('queue');

  function todayISO() {
    var now = new Date();
    var month = String(now.getMonth() + 1).padStart(2, '0');
    var day = String(now.getDate()).padStart(2, '0');
    return now.getFullYear() + '-' + month + '-' + day;
  }

  function fillCategories() {
    var list = kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    categorySelect.innerHTML = list
      .map(function (name) {
        return '<option value="' + name + '">' + name + '</option>';
      })
      .join('');
  }

  function readQueue() {
    return new Promise(function (resolve) {
      chrome.storage.local.get({ queue: [] }, function (data) {
        resolve(Array.isArray(data.queue) ? data.queue : []);
      });
    });
  }

  function writeQueue(queue) {
    return new Promise(function (resolve) {
      chrome.storage.local.set({ queue: queue }, resolve);
    });
  }

  function refreshQueueLabel() {
    readQueue().then(function (queue) {
      var persian = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
      queueLabel.textContent = 'صف: ' + String(queue.length).replace(/\d/g, function (digit) {
        return persian[Number(digit)];
      });
    });
  }

  function pushToApp() {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var tab = tabs && tabs[0];
      if (!tab || !tab.id) return;
      chrome.tabs.sendMessage(tab.id, { type: 'kargah:flush' }, function () {
        void chrome.runtime.lastError;
      });
    });
  }

  document.querySelectorAll('.kind').forEach(function (button) {
    button.addEventListener('click', function () {
      kind = button.dataset.kind;
      document.querySelectorAll('.kind').forEach(function (item) {
        item.classList.toggle('on', item === button);
      });
      fillCategories();
    });
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var title = titleInput.value.trim();
    var amount = Number(amountInput.value);
    if (!title || !amount) return;

    readQueue()
      .then(function (queue) {
        queue.push({
          title: title,
          amount: amount,
          kind: kind,
          category: categorySelect.value,
          date: todayISO(),
        });
        return writeQueue(queue).then(function () {
          return queue.length;
        });
      })
      .then(function (count) {
        hint.hidden = false;
        hint.textContent = 'ثبت شد؛ اگر کارگاه باز باشد همان‌جا اضافه می‌شود، وگرنه دفعهٔ بعد.';
        titleInput.value = '';
        amountInput.value = '';
        titleInput.focus();
        refreshQueueLabel();
        pushToApp();
        void count;
      });
  });

  document.getElementById('open-app').addEventListener('click', function () {
    chrome.tabs.create({ url: APP_URL });
  });

  fillCategories();
  refreshQueueLabel();
})();
