import { renderWorkspaceRoute, bindWorkspaceInteractions } from './workspace-controller.js';
import { renderLibraryRoute, bindLibraryInteractions } from './library-controller.js';
const $ = selector => document.querySelector(selector);
const content = $('#content');
const title = $('#page-title');
const dialog = $('#automation-dialog');
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' })[character]);
const api = async (path, options) => { const response = await fetch(path, options); const data = await response.json(); if (!response.ok) throw Object.assign(new Error(data.message || data.error), { status: response.status }); return data; };
const badge = status => `<span class="badge status-${status.toLowerCase()}">${escapeHtml(status)}</span>`;
const reason = step => step?.human_message ? `<p class="reason">${escapeHtml(step.human_message)}</p>` : '';

async function today() {
  const data = await api('/api/today'); title.textContent = 'الان چه چیزی نیاز به توجه من دارد؟';
  content.innerHTML = `<div class="metrics">${[['در حال اجرا',data.counts.running],['منتظر شما',data.counts.waiting],['مسدود',data.counts.blocked],['تکمیل امروز',data.counts.completedToday]].map(([label,value])=>`<article class="metric"><small>${label}</small><strong>${value}</strong></article>`).join('')}</div><div class="section-head"><div><span class="eyebrow">نیازمند اقدام</span><h2>اجراهای فعال</h2></div><a class="text-link" href="#runs">مشاهده همه</a></div><div class="run-grid">${data.runs.length ? data.runs.map(runCard).join('') : empty('هنوز اجرایی وجود ندارد.','از «اجرای اتوماسیون» شروع کنید.','open-new')}</div>`;
}
function runCard(run) { return `<article class="run-card actionable" data-open-run="${run.id}" tabindex="0"><div class="panel-head"><div><span class="eyebrow">${escapeHtml(run.automation)}</span><h3>${escapeHtml(run.subject)}</h3></div>${badge(run.status)}</div><div class="progress"><i style="width:${run.progress}%"></i></div><div class="run-meta"><span>${run.progress}٪</span><span>${escapeHtml(run.currentStep?.name || '—')}</span></div>${reason(run.currentStep)}<button class="secondary" data-open-run="${run.id}">باز کردن اجرا</button></article>`; }
function empty(head, body, action) { return `<article class="empty"><div class="empty-icon">◎</div><h3>${head}</h3><p>${body}</p>${action ? `<button class="secondary" data-action="${action}">شروع</button>`:''}</article>`; }

async function automations() {
  const rows = await api('/api/automations'); title.textContent = 'کتابخانه اتوماسیون‌ها';
  content.innerHTML = `<div class="section-head"><div><span class="eyebrow">TOOLS, NOT TABLES</span><h2>اتوماسیون‌های قابل اجرا</h2></div></div><div class="automation-grid">${rows.map(item=>`<article class="automation-card ${item.status==='COMING_LATER'?'muted':''}"><div class="panel-head"><div class="automation-icon">↗</div>${badge(item.status)}</div><h2>${escapeHtml(item.name)}</h2><p>${escapeHtml(item.description || 'این اتوماسیون در فاز بعدی فعال می‌شود.')}</p>${item.status==='ACTIVE'?`<dl><div><dt>نسخه</dt><dd>${item.version}</dd></div><div><dt>مراحل</dt><dd>${item.stepsCount}</dd></div><div><dt>پرامپت</dt><dd>${item.promptCount}</dd></div><div><dt>اجراهای اخیر</dt><dd>${item.recentRunCount}</dd></div></dl><button class="primary wide" data-action="open-new">شروع اجرا</button>`:'<button disabled class="wide">به‌زودی</button>'}</article>`).join('')}</div>`;
}

async function runs() {
  const rows = await api('/api/runs'); title.textContent = 'اجراها';
  content.innerHTML = `<div class="toolbar"><input id="run-search" placeholder="جستجوی محصول"><select id="run-status"><option value="">همه وضعیت‌ها</option><option>RUNNING</option><option>WAITING</option><option>BLOCKED</option><option>SUCCEEDED</option></select><label><input type="checkbox" id="needs-action"> نیازمند اقدام</label></div><div id="run-list" class="run-list">${rows.length?rows.map(runRow).join(''):empty('اجرایی ثبت نشده است','یک اتوماسیون محصول را شروع کنید.','open-new')}</div>`;
  const apply=()=>{const q=$('#run-search').value.trim().toLowerCase(),s=$('#run-status').value,a=$('#needs-action').checked;document.querySelectorAll('[data-run-row]').forEach(el=>{const match=(!q||el.dataset.subject.includes(q))&&(!s||el.dataset.status===s)&&(!a||['WAITING','BLOCKED','FAILED'].includes(el.dataset.status));el.hidden=!match})}; $('#run-search').addEventListener('input',apply);$('#run-status').addEventListener('change',apply);$('#needs-action').addEventListener('change',apply);
}
function runRow(run){return `<article class="run-row actionable" data-run-row data-subject="${escapeHtml(run.subject.toLowerCase())}" data-status="${run.status}" data-open-run="${run.id}"><div><span class="eyebrow">${escapeHtml(run.automation)}</span><h3>${escapeHtml(run.subject)}</h3></div><div>${badge(run.status)}${reason(run.currentStep)}</div><div><small>مرحله فعلی</small><strong>${escapeHtml(run.currentStep?.name||'—')}</strong></div><div><small>پیشرفت</small><strong>${run.progress}٪</strong></div><button class="secondary" data-open-run="${run.id}">جزئیات</button></article>`}

async function placeholder(route){title.textContent={products:'محصولات',publishing:'مرکز انتشار',approvals:'نیازمند تأیید',assets:'فایل‌ها / Assets',sources:'منابع داده',prompts:'Prompt Studio',intelligence:'نقشه پروژه / Graphify',settings:'تنظیمات'}[route]||'استودیو';content.innerHTML=empty('این فضای کاری در ادامه C2 تکمیل می‌شود','وضعیت فعلی صادقانه نمایش داده شده و عملیاتی جعلی وجود ندارد.')}
async function render(){const parts=(location.hash.slice(1)||'today').split('/'),route=parts[0];document.querySelectorAll('[data-route]').forEach(a=>a.classList.toggle('active',a.dataset.route===route));try{if(await renderWorkspaceRoute(route,parts[1],{api,title,content,escapeHtml,badge}))return;if(await renderLibraryRoute(route,parts[1],{api,title,content}))return;if(route==='today')return await today();if(route==='automations')return await automations();if(route==='runs')return await runs();return await placeholder(route)}catch(error){content.innerHTML=empty('بارگذاری انجام نشد',escapeHtml(error.message));}}

$('#new-run').addEventListener('click',()=>dialog.showModal());
document.addEventListener('click',async event=>{
  bindWorkspaceInteractions(event,{escapeHtml,badge});
  bindLibraryInteractions(event,{api}).catch(error=>{content.innerHTML=empty('عملیات انجام نشد',escapeHtml(error.message))});
  const action=event.target.closest('[data-action]')?.dataset.action;
  if(action==='open-new')dialog.showModal();
  const id=event.target.closest('[data-open-run]')?.dataset.openRun;
  if(id)location.hash=`run/${id}`;
  const cancelId=event.target.closest('[data-cancel-run]')?.dataset.cancelRun;
  if(cancelId && confirm('این اجرا لغو شود؟')) {
    try { await api(`/api/runs/${encodeURIComponent(cancelId)}/cancel`,{method:'POST'}); await render(); }
    catch(error){content.insertAdjacentHTML('afterbegin',`<p class="form-error" role="alert">${escapeHtml(error.message)}</p>`);}
  }
});
document.addEventListener('change',async event=>{
  const input=event.target.closest('[data-source-file]');
  if(!input?.files?.length)return;
  const form=new FormData();form.set('sourceFile',input.files[0]);
  try { await api(`/api/runs/${encodeURIComponent(input.dataset.sourceFile)}/source-documents`,{method:'POST',body:form}); await render(); }
  catch(error){content.insertAdjacentHTML('afterbegin',`<p class="form-error" role="alert">${escapeHtml(error.message)}</p>`);}
});
$('#start-run').addEventListener('click',async()=>{
  const input=$('#product-name'),file=$('#source-file'),error=$('#dialog-error');error.textContent='';
  const form=new FormData();form.set('productName',input.value);if(file.files[0])form.set('sourceFile',file.files[0]);
  try{const created=await api('/api/runs',{method:'POST',body:form});dialog.close();input.value='';file.value='';location.hash=`run/${created.jobId}`;}
  catch(failure){error.textContent=failure.message;}
});
window.addEventListener('hashchange',render);render();
export { escapeHtml };
