(() => {
  'use strict';
  const STORAGE_KEY = 'monthly-payment-manager-v1';
  const $ = id => document.getElementById(id);
  const yen = value => new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(value || 0);
  const monthNow = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; };
  const monthOf = date => (date || '').slice(0,7);
  const state = { month: monthNow(), filter:'all', data:{}, toastTimer:null };
  function load() {
    try {
      const raw=localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed=JSON.parse(raw);
      if (parsed && parsed.data && typeof parsed.data==='object') state.data=parsed.data;
    } catch(e) { console.error('保存データの読み込みに失敗しました',e); }
  }
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY,JSON.stringify({version:1,data:state.data}));
      return true;
    } catch(e) { showToast('保存できませんでした。空き容量やブラウザ設定を確認してください。'); return false; }
  }
  function getMonthItems(month=state.month) { return Array.isArray(state.data[month]) ? state.data[month] : []; }
  function setMonthItems(items,month=state.month) { state.data[month]=items; save(); render(); }
  function makeId() { return (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`); }
  function esc(s) { return String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function showToast(message) {
    const el=$('toast'); el.textContent=message; el.classList.add('show');
    clearTimeout(state.toastTimer); state.toastTimer=setTimeout(()=>el.classList.remove('show'),2600);
  }
  function formatDate(date) { if(!date) return ''; const [y,m,d]=date.split('-'); return `${Number(m)}/${Number(d)}`; }
  function render() {
    $('monthPicker').value=state.month;
    const items=getMonthItems();
    const total=items.reduce((s,p)=>s+Number(p.amount||0),0);
    const paid=items.filter(p=>p.paid).reduce((s,p)=>s+Number(p.amount||0),0);
    const unpaid=total-paid, rate=total ? Math.round(paid/total*100) : 0;
    $('totalAmount').textContent=yen(total); $('paidAmount').textContent=yen(paid); $('unpaidAmount').textContent=yen(unpaid);
    $('progressText').textContent=`${rate}%`; $('progressBar').style.width=`${rate}%`;
    const counts={all:items.length,paid:items.filter(p=>p.paid).length,unpaid:items.filter(p=>!p.paid).length};
    $('allCount').textContent=counts.all; $('paidCount').textContent=counts.paid; $('unpaidCount').textContent=counts.unpaid;
    $('itemCount').textContent=`${items.length}件の支払い`;
    document.querySelectorAll('.filter').forEach(b=>b.classList.toggle('active',b.dataset.filter===state.filter));
    const filtered=items.filter(p=>state.filter==='all'||(state.filter==='paid'&&p.paid)||(state.filter==='unpaid'&&!p.paid));
    $('paymentList').innerHTML=filtered.map(p=>{
      const late=!p.paid&&p.dueDate&&p.dueDate<`${state.month}-${String(new Date(Number(state.month.slice(0,4)),Number(state.month.slice(5,7)),0).getDate()).padStart(2,'0')}`&&monthOf(p.dueDate)===state.month;
      return `<article class="payment-card ${p.paid?'is-paid':''}">
        <input class="payment-check" type="checkbox" aria-label="${esc(p.name)}を支払い済みにする" data-action="toggle" data-id="${esc(p.id)}" ${p.paid?'checked':''}>
        <div class="payment-info"><div class="payment-name">${esc(p.name)}</div>
          <div class="payment-meta"><span class="category-pill">${esc(p.category||'その他')}</span>${p.dueDate?`<span class="due-date ${late?'late':''}">${late?'期限超過 · ': '支払日 '}${esc(formatDate(p.dueDate))}</span>`:''}${p.repeat==='monthly'?'<span>毎月</span>':''}</div>
          ${p.memo?`<div class="payment-meta">${esc(p.memo)}</div>`:''}
        </div>
        <div class="payment-right"><div class="payment-amount">${yen(Number(p.amount))}</div><span class="status-pill ${p.paid?'status-paid':'status-unpaid'}">${p.paid?'支払い済み':'未払い'}</span>
          <div class="card-actions"><button class="tiny-btn" data-action="edit" data-id="${esc(p.id)}">編集</button><button class="tiny-btn" data-action="delete" data-id="${esc(p.id)}">削除</button></div>
        </div>
      </article>`;
    }).join('');
    $('emptyState').classList.toggle('hidden',filtered.length>0);
    $('paymentList').classList.toggle('hidden',filtered.length===0);
    $('emptyAddBtn').textContent=items.length?'＋ 項目を追加':'＋ 最初の項目を追加';
  }
  function moveMonth(offset) {
    const [y,m]=state.month.split('-').map(Number), d=new Date(y,m-1+offset,1);
    state.month=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; render();
  }
  function openForm(item=null) {
    $('paymentForm').reset(); $('formError').textContent=''; $('paymentId').value=item?.id||'';
    $('dialogTitle').textContent=item?'支払いを編集':'支払いを追加';
    $('paymentName').value=item?.name||''; $('paymentAmount').value=item?.amount??'';
    $('paymentCategory').value=item?.category||'その他'; $('paymentDue').value=item?.dueDate||'';
    $('paymentRepeat').value=item?.repeat||'monthly'; $('paymentPaid').checked=!!item?.paid; $('paymentMemo').value=item?.memo||'';
    $('paymentDialog').showModal(); setTimeout(()=>$('paymentName').focus(),80);
  }
  function submitForm(e) {
    e.preventDefault();
    const name=$('paymentName').value.trim(), amount=Number($('paymentAmount').value);
    if(!name||!Number.isFinite(amount)||amount<=0||amount>999999999){$('formError').textContent='項目名と1円以上の金額を正しく入力してください。';return;}
    const id=$('paymentId').value||makeId();
    const item={id,name,amount:Math.floor(amount),category:$('paymentCategory').value,dueDate:$('paymentDue').value,repeat:$('paymentRepeat').value,paid:$('paymentPaid').checked,memo:$('paymentMemo').value.trim()};
    let items=getMonthItems();
    const index=items.findIndex(p=>p.id===id);
    if(index>=0) items[index]=item; else items.push(item);
    setMonthItems(items); $('paymentDialog').close(); showToast(index>=0?'支払い内容を更新しました':'支払いを登録しました');
  }
  function exportData() {
    const payload={app:'月々の支払い管理',version:1,exportedAt:new Date().toISOString(),data:state.data};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob), a=document.createElement('a'); a.href=url; a.download=`支払い管理バックアップ_${monthNow()}.json`; a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000); showToast('バックアップファイルを作成しました');
  }
  function importData(file) {
    if(!file)return;
    const reader=new FileReader();
    reader.onload=()=>{
      try{
        const parsed=JSON.parse(reader.result), data=parsed.data;
        if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('format');
        const valid={};
        for(const [month,items] of Object.entries(data)){
          if(!/^\d{4}-\d{2}$/.test(month)||!Array.isArray(items))continue;
          valid[month]=items.filter(p=>p&&typeof p.name==='string'&&Number.isFinite(Number(p.amount))&&Number(p.amount)>0).map(p=>({id:String(p.id||makeId()),name:p.name.slice(0,60),amount:Math.floor(Number(p.amount)),category:String(p.category||'その他'),dueDate:String(p.dueDate||''),repeat:p.repeat==='once'?'once':'monthly',paid:!!p.paid,memo:String(p.memo||'').slice(0,300)}));
        }
        if(!Object.keys(valid).length)throw new Error('empty');
        if(!confirm('現在のデータにバックアップの内容を追加・上書きします。続けますか？'))return;
        state.data={...state.data,...valid}; save(); render(); showToast('バックアップから復元しました');
      }catch(err){alert('バックアップファイルを読み込めませんでした。正しいJSONファイルを選択してください。');}
      $('importFile').value='';
    };
    reader.readAsText(file);
  }
  function deleteItem(id) {
    const item=getMonthItems().find(p=>p.id===id); if(!item)return;
    if(!confirm(`「${item.name}」をこの月の一覧から削除しますか？`))return;
    setMonthItems(getMonthItems().filter(p=>p.id!==id)); showToast('項目を削除しました');
  }
  $('prevMonth').addEventListener('click',()=>moveMonth(-1));
  $('nextMonth').addEventListener('click',()=>moveMonth(1));
  $('monthPicker').addEventListener('change',e=>{if(e.target.value){state.month=e.target.value;render();}});
  $('addBtn').addEventListener('click',()=>openForm());
  $('emptyAddBtn').addEventListener('click',()=>openForm());
  $('closeDialog').addEventListener('click',()=>$('paymentDialog').close());
  $('cancelDialog').addEventListener('click',()=>$('paymentDialog').close());
  $('paymentForm').addEventListener('submit',submitForm);
  document.querySelectorAll('.filter').forEach(b=>b.addEventListener('click',()=>{state.filter=b.dataset.filter;render();}));
  $('paymentList').addEventListener('change',e=>{
    const t=e.target;if(t.dataset.action!=='toggle')return;
    const items=getMonthItems().map(p=>p.id===t.dataset.id?{...p,paid:t.checked}:p);setMonthItems(items);showToast(t.checked?'支払い済みにしました':'未払いに戻しました');
  });
  $('paymentList').addEventListener('click',e=>{
    const b=e.target.closest('button[data-action]');if(!b)return;
    const item=getMonthItems().find(p=>p.id===b.dataset.id);if(!item)return;
    if(b.dataset.action==='edit')openForm(item);
    if(b.dataset.action==='delete')deleteItem(item.id);
  });
  $('exportBtn').addEventListener('click',exportData); $('settingsExport').addEventListener('click',exportData);
  const triggerImport=()=>$('importFile').click();
  $('importBtn').addEventListener('click',triggerImport); $('settingsImport').addEventListener('click',triggerImport);
  $('importFile').addEventListener('change',e=>importData(e.target.files[0]));
  $('settingsBtn').addEventListener('click',()=>$('settingsDialog').showModal());
  $('closeSettings').addEventListener('click',()=>$('settingsDialog').close());
  $('clearDataBtn').addEventListener('click',()=>{
    if(!confirm('すべての月の支払いデータを完全に削除します。この操作は元に戻せません。先にバックアップしますか？'))return;
    if(!confirm('本当にすべて削除しますか？'))return;
    state.data={};save();render();$('settingsDialog').close();showToast('すべてのデータを削除しました');
  });
  $('settingsExport').addEventListener('click',()=>$('settingsDialog').close());
  load(); render();
  if('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(()=>{});
})();
