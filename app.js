
(() => {
  'use strict';

  const STORAGE_KEY = 'monthly-payment-manager-v1';
  const $ = id => document.getElementById(id);

  const yen = value => new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    maximumFractionDigits: 0
  }).format(value || 0);

  const monthNow = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  const monthOf = date => (date || '').slice(0, 7);

  const categories = [
    '住居費', '光熱費', '通信費', '保険',
    '交通費', 'サブスク', '食費', 'その他'
  ];

  const state = {
    month: monthNow(),
    filter: 'all',
    data: {},
    toastTimer: null,
    editing: false
  };

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw);

      if (parsed && parsed.data && typeof parsed.data === 'object') {
        state.data = parsed.data;
      }
    } catch (e) {
      console.error('保存データの読み込みに失敗しました', e);
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: 1,
        data: state.data
      }));
      return true;
    } catch (e) {
      showToast('保存できませんでした。空き容量やブラウザ設定を確認してください。');
      return false;
    }
  }

  function makeId() {
    return typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));
  }

  function showToast(message) {
    const el = $('toast');
    if (!el) return;

    el.textContent = message;
    el.classList.add('show');

    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => {
      el.classList.remove('show');
    }, 2600);
  }

  function formatDate(date) {
    if (!date) return '';
    const [, m, d] = date.split('-');
    return `${Number(m)}/${Number(d)}`;
  }

  function addOneMonth(month) {
    const [year, number] = month.split('-').map(Number);
    const date = new Date(year, number, 1);

    return `${date.getFullYear()}-${String(
      date.getMonth() + 1
    ).padStart(2, '0')}`;
  }

  function shiftDueDate(dueDate, targetMonth) {
    if (!dueDate) return '';

    const day = Number(dueDate.slice(8, 10));
    const [year, month] = targetMonth.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();

    return `${targetMonth}-${String(
      Math.min(day, lastDay)
    ).padStart(2, '0')}`;
  }

  function getRecurringId(item) {
    return item.recurringId || item.id;
  }

  function ensureMonthlyItemsThrough(targetMonth) {
    const months = Object.keys(state.data)
      .filter(month =>
        /^\d{4}-\d{2}$/.test(month) &&
        month <= targetMonth &&
        Array.isArray(state.data[month])
      )
      .sort();

    if (!months.length) return;

    // 既存データの中で最も早い月から対象月まで順に処理する。
    let month = months[0];
    let changed = false;

    while (month < targetMonth) {
      const nextMonth = addOneMonth(month);
      const sourceItems = state.data[month] || [];
      const nextItems = state.data[nextMonth] || [];

      const existingRecurringIds = new Set(
        nextItems
          .filter(item => item.repeat === 'monthly')
          .map(getRecurringId)
      );

      const additions = [];

      for (const item of sourceItems) {
        if (item.repeat !== 'monthly') continue;

        const recurringId = getRecurringId(item);

        if (existingRecurringIds.has(recurringId)) continue;

        additions.push({
          ...item,
          id: makeId(),
          recurringId,
          dueDate: shiftDueDate(item.dueDate, nextMonth),
          paid: false,
          repeat: 'monthly'
        });

        existingRecurringIds.add(recurringId);
      }

      if (additions.length) {
        state.data[nextMonth] = [...nextItems, ...additions];
        changed = true;
      }

      month = nextMonth;
    }

    if (changed) save();
  }

  function getMonthItems(month = state.month) {
    ensureMonthlyItemsThrough(month);

    return Array.isArray(state.data[month])
      ? state.data[month]
      : [];
  }

  function render() {
    $('monthPicker').value = state.month;

    const items = getMonthItems();
    const total = items.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const paid = items.filter(p => p.paid)
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const unpaid = total - paid;
    const rate = total ? Math.round(paid / total * 100) : 0;

    $('totalAmount').textContent = yen(total);
    $('paidAmount').textContent = yen(paid);
    $('unpaidAmount').textContent = yen(unpaid);
    $('progressText').textContent = `${rate}%`;
    $('progressBar').style.width = `${rate}%`;

    $('allCount').textContent = items.length;
    $('paidCount').textContent = items.filter(p => p.paid).length;
    $('unpaidCount').textContent = items.filter(p => !p.paid).length;
    $('itemCount').textContent = `${items.length}件の支払い`;

    document.querySelectorAll('.filter').forEach(button => {
      button.classList.toggle(
        'active',
        button.dataset.filter === state.filter
      );
    });

    const filtered = items.filter(p =>
      state.filter === 'all' ||
      (state.filter === 'paid' && p.paid) ||
      (state.filter === 'unpaid' && !p.paid)
    );

    $('paymentList').innerHTML = filtered.map(p => {
      const [year, month] = state.month.split('-').map(Number);
      const lastDay = new Date(year, month, 0).getDate();
      const monthEnd = `${state.month}-${String(lastDay).padStart(2, '0')}`;
      const late = !p.paid && p.dueDate &&
        p.dueDate < monthEnd &&
        monthOf(p.dueDate) === state.month;

      return `
        <article class="payment-card ${p.paid ? 'is-paid' : ''}">
          <input
            class="payment-check"
            type="checkbox"
            aria-label="${esc(p.name)}を支払い済みにする"
            data-action="toggle"
            data-id="${esc(p.id)}"
            ${p.paid ? 'checked' : ''}
          >

          <div class="payment-info">
            <div class="payment-name">${esc(p.name)}</div>

            <div class="payment-meta">
              <span class="category-pill">${esc(p.category || 'その他')}</span>
              ${p.dueDate
                ? `<span class="due-date ${late ? 'late' : ''}">
                    ${late ? '期限超過 · ' : '支払日 '}
                    ${esc(formatDate(p.dueDate))}
                  </span>`
                : ''}
              ${p.repeat === 'monthly' ? '<span>毎月</span>' : ''}
            </div>

            ${p.memo
              ? `<div class="payment-meta">${esc(p.memo)}</div>`
              : ''}
          </div>

          <div class="payment-right">
            <div class="payment-amount">${yen(Number(p.amount))}</div>

            <span class="status-pill ${p.paid ? 'status-paid' : 'status-unpaid'}">
              ${p.paid ? '支払い済み' : '未払い'}
            </span>

            <div class="card-actions">
              <button class="tiny-btn" data-action="edit" data-id="${esc(p.id)}">
                編集
              </button>
              <button class="tiny-btn" data-action="delete" data-id="${esc(p.id)}">
                削除
              </button>
            </div>
          </div>
        </article>
      `;
    }).join('');

    $('emptyState').classList.toggle('hidden', filtered.length > 0);
    $('paymentList').classList.toggle('hidden', filtered.length === 0);

    $('emptyAddBtn').textContent = items.length
      ? '＋ 項目を追加'
      : '＋ 最初の項目を追加';
  }

  function moveMonth(offset) {
    const [year, month] = state.month.split('-').map(Number);
    const date = new Date(year, month - 1 + offset, 1);

    state.month = `${date.getFullYear()}-${String(
      date.getMonth() + 1
    ).padStart(2, '0')}`;

    render();
  }

  function categoryOptions(selected = 'その他') {
    return categories.map(category =>
      `<option value="${esc(category)}" ${
        category === selected ? 'selected' : ''
      }>${esc(category)}</option>`
    ).join('');
  }

  function addPaymentRow(item = {}) {
    const container = $('bulkPaymentRows');
    const row = document.createElement('div');

    row.className = 'bulk-payment-row';

    row.innerHTML = `
      <div class="bulk-row-title">
        <span class="bulk-row-number">支払い項目</span>
        <button type="button" class="bulk-remove-btn" data-remove-row>
          この項目を削除
        </button>
      </div>

      <label class="field">
        支払い項目名
        <input data-field="name" maxlength="60" placeholder="例：家賃" required>
      </label>

      <div class="bulk-row-grid">
        <label class="field">
          金額（円）
          <input
            data-field="amount"
            type="number"
            min="1"
            max="999999999"
            step="1"
            inputmode="numeric"
            placeholder="75000"
            required
          >
        </label>

        <label class="field">
          カテゴリー
          <select data-field="category">
            ${categoryOptions(item.category || 'その他')}
          </select>
        </label>
      </div>

      <div class="bulk-row-grid">
        <label class="field">
          支払日
          <input data-field="dueDate" type="date">
        </label>

        <label class="field">
          繰り返し
          <select data-field="repeat">
            <option value="monthly">毎月</option>
            <option value="once">この月のみ</option>
          </select>
        </label>
      </div>

      <label class="check-row">
        <input data-field="paid" type="checkbox">
        この支払いは支払い済み
      </label>

      <label class="field">
        メモ（任意）
        <textarea data-field="memo" rows="2" maxlength="300" placeholder="引き落とし口座など"></textarea>
      </label>
    `;

    container.appendChild(row);

    row.querySelector('[data-field="name"]').value = item.name || '';
    row.querySelector('[data-field="amount"]').value = item.amount ?? '';
    row.querySelector('[data-field="dueDate"]').value = item.dueDate || '';
    row.querySelector('[data-field="repeat"]').value = item.repeat || 'monthly';
    row.querySelector('[data-field="paid"]').checked = !!item.paid;
    row.querySelector('[data-field="memo"]').value = item.memo || '';

    row.querySelector('[data-remove-row]').addEventListener('click', () => {
      if (container.children.length <= 1) {
        showToast('入力欄は最低1つ必要です。');
        return;
      }

      row.remove();
      updateRowNumbers();
    });

    updateRowNumbers();
  }

  function updateRowNumbers() {
    [...$('bulkPaymentRows').children].forEach((row, index) => {
      row.querySelector('.bulk-row-number').textContent =
        `支払い項目 ${index + 1}`;

      row.querySelector('[data-remove-row]').hidden = state.editing;
    });
  }

  function openForm(item = null) {
    state.editing = !!item;

    $('paymentForm').reset();
    $('formError').textContent = '';
    $('paymentId').value = item?.id || '';
    $('dialogTitle').textContent = item ? '支払いを編集' : '支払いを追加';
    $('savePaymentsBtn').textContent = item ? '変更を保存' : 'まとめて保存';
    $('addPaymentRow').hidden = !!item;
    $('bulkPaymentRows').innerHTML = '';

    addPaymentRow(item || {});

    $('paymentDialog').showModal();

    setTimeout(() => {
      $('bulkPaymentRows')
        .querySelector('[data-field="name"]')
        ?.focus();
    }, 80);
  }

  function submitForm(event) {
    event.preventDefault();
    $('formError').textContent = '';

    const rows = [
      ...$('bulkPaymentRows').querySelectorAll('.bulk-payment-row')
    ];

    if (!rows.length) {
      $('formError').textContent =
        '支払い項目を1つ以上追加してください。';
      return;
    }

    const newItems = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const name = row.querySelector('[data-field="name"]').value.trim();
      const rawAmount = row.querySelector('[data-field="amount"]').value;
      const amount = Number(rawAmount);

      if (
        !name ||
        rawAmount.trim() === '' ||
        !Number.isFinite(amount) ||
        amount <= 0 ||
        amount > 999999999
      ) {
        $('formError').textContent =
          `項目 ${i + 1}：項目名と1円以上の金額を正しく入力してください。`;

        row.querySelector('[data-field="name"]').focus();
        return;
      }

      const id = makeId();
      const repeat = row.querySelector('[data-field="repeat"]').value;

      newItems.push({
        id,
        recurringId: repeat === 'monthly' ? id : '',
        name,
        amount: Math.floor(amount),
        category: row.querySelector('[data-field="category"]').value,
        dueDate: row.querySelector('[data-field="dueDate"]').value,
        repeat,
        paid: row.querySelector('[data-field="paid"]').checked,
        memo: row.querySelector('[data-field="memo"]').value.trim()
      });
    }

    const originalItems = getMonthItems();
    const items = originalItems.map(item => ({ ...item }));

    if (state.editing) {
      const id = $('paymentId').value;
      const index = items.findIndex(item => item.id === id);

      if (index < 0) {
        $('formError').textContent =
          '編集対象が見つかりません。画面を開き直してください。';
        return;
      }

      newItems[0].id = id;
      newItems[0].recurringId =
        newItems[0].repeat === 'monthly'
          ? (items[index].recurringId || items[index].id)
          : '';

      items[index] = newItems[0];
    } else {
      items.push(...newItems);
    }

    if (!saveWithItems(items)) {
      $('formError').textContent =
        '保存に失敗しました。ブラウザの保存容量を確認してください。';
      return;
    }

    render();
    $('paymentDialog').close();

    showToast(
      state.editing
        ? '支払い内容を更新しました'
        : `${newItems.length}件の支払いを登録しました`
    );
  }

  function saveWithItems(items) {
    const previous = state.data[state.month];
    state.data[state.month] = items;

    if (save()) return true;

    if (previous) {
      state.data[state.month] = previous;
    } else {
      delete state.data[state.month];
    }

    return false;
  }

  function exportData() {
    const payload = {
      app: '月々の支払い管理',
      version: 1,
      exportedAt: new Date().toISOString(),
      data: state.data
    };

    const blob = new Blob(
      [JSON.stringify(payload, null, 2)],
      { type: 'application/json' }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `支払い管理バックアップ_${monthNow()}.json`;
    link.click();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('バックアップファイルを作成しました');
  }

  function importData(file) {
    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const data = parsed.data;

        if (!data || typeof data !== 'object' || Array.isArray(data)) {
          throw new Error('format');
        }

        const valid = {};

        for (const [month, items] of Object.entries(data)) {
          if (!/^\d{4}-\d{2}$/.test(month) || !Array.isArray(items)) {
            continue;
          }

          valid[month] = items
            .filter(item =>
              item &&
              typeof item.name === 'string' &&
              Number.isFinite(Number(item.amount)) &&
              Number(item.amount) > 0
            )
            .map(item => ({
              id: String(item.id || makeId()),
              recurringId: String(item.recurringId || ''),
              name: item.name.slice(0, 60),
              amount: Math.floor(Number(item.amount)),
              category: categories.includes(item.category)
                ? item.category
                : 'その他',
              dueDate: String(item.dueDate || ''),
              repeat: item.repeat === 'once' ? 'once' : 'monthly',
              paid: !!item.paid,
              memo: String(item.memo || '').slice(0, 300)
            }));
        }

        if (!Object.keys(valid).length) {
          throw new Error('empty');
        }

        if (!confirm(
          '現在のデータにバックアップの内容を追加・上書きします。続けますか？'
        )) {
          return;
        }

        const previous = state.data;
        state.data = { ...state.data, ...valid };

        if (!save()) {
          state.data = previous;
          return;
        }

        render();
        showToast('バックアップから復元しました');
      } catch (error) {
        alert(
          'バックアップファイルを読み込めませんでした。正しいJSONファイルを選択してください。'
        );
      }

      $('importFile').value = '';
    };

    reader.readAsText(file);
  }

  function deleteItem(id) {
    const item = getMonthItems().find(p => p.id === id);
    if (!item) return;

    if (!confirm(`「${item.name}」をこの月の一覧から削除しますか？`)) {
      return;
    }

    const items = getMonthItems().filter(p => p.id !== id);

    if (saveWithItems(items)) {
      render();
      showToast('項目を削除しました');
    }
  }

  $('prevMonth').addEventListener('click', () => moveMonth(-1));
  $('nextMonth').addEventListener('click', () => moveMonth(1));

  $('monthPicker').addEventListener('change', event => {
    if (event.target.value) {
      state.month = event.target.value;
      render();
    }
  });

  $('addBtn').addEventListener('click', () => openForm());
  $('emptyAddBtn').addEventListener('click', () => openForm());

  $('addPaymentRow').addEventListener('click', () => {
    if (state.editing) return;

    addPaymentRow();

    const rows = $('bulkPaymentRows')
      .querySelectorAll('.bulk-payment-row');

    rows[rows.length - 1]
      ?.querySelector('[data-field="name"]')
      ?.focus();
  });

  $('closeDialog').addEventListener('click', () => {
    $('paymentDialog').close();
  });

  $('cancelDialog').addEventListener('click', () => {
    $('paymentDialog').close();
  });

  $('paymentForm').addEventListener('submit', submitForm);

  document.querySelectorAll('.filter').forEach(button => {
    button.addEventListener('click', () => {
      state.filter = button.dataset.filter;
      render();
    });
  });

  $('paymentList').addEventListener('change', event => {
    const target = event.target;

    if (target.dataset.action !== 'toggle') return;

    const items = getMonthItems().map(item =>
      item.id === target.dataset.id
        ? { ...item, paid: target.checked }
        : item
    );

    if (saveWithItems(items)) {
      render();
      showToast(
        target.checked
          ? '支払い済みにしました'
          : '未払いに戻しました'
      );
    }
  });

  $('paymentList').addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    const item = getMonthItems().find(p => p.id === button.dataset.id);
    if (!item) return;

    if (button.dataset.action === 'edit') {
      openForm(item);
    }

    if (button.dataset.action === 'delete') {
      deleteItem(item.id);
    }
  });

  $('exportBtn').addEventListener('click', exportData);

  $('settingsExport').addEventListener('click', () => {
    exportData();
    $('settingsDialog').close();
  });

  const triggerImport = () => $('importFile').click();

  $('importBtn').addEventListener('click', triggerImport);
  $('settingsImport').addEventListener('click', triggerImport);

  $('importFile').addEventListener('change', event => {
    importData(event.target.files[0]);
  });

  $('settingsBtn').addEventListener('click', () => {
    $('settingsDialog').showModal();
  });

  $('closeSettings').addEventListener('click', () => {
    $('settingsDialog').close();
  });

  $('clearDataBtn').addEventListener('click', () => {
    if (!confirm(
      'すべての月の支払いデータを完全に削除します。この操作は元に戻せません。先にバックアップしますか？'
    )) {
      return;
    }

    if (!confirm('本当にすべて削除しますか？')) return;

    const previous = state.data;
    state.data = {};

    if (!save()) {
      state.data = previous;
      return;
    }

    render();
    $('settingsDialog').close();
    showToast('すべてのデータを削除しました');
  });

  load();
  render();

  if (
    'serviceWorker' in navigator &&
    location.protocol.startsWith('http')
  ) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
})();
