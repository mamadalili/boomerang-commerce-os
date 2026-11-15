import { renderRunDetail, stepInspector } from './views/run-detail.js';
import { renderProductWorkspace, workspaceTab } from './views/product-workspace.js';

export async function renderWorkspaceRoute(route, id, context) {
  const { api, title, content, escapeHtml, badge } = context;
  if (route === 'run') { const run=await api(`/api/runs/${id}`); title.textContent=`اجرای ${run.subject}`; content.innerHTML=renderRunDetail(run,escapeHtml,badge); return true; }
  if (route === 'product') { const model=await api(`/api/products/${id}`); title.textContent=model.product.canonical_name; content.innerHTML=renderProductWorkspace(model,escapeHtml,badge); return true; }
  return false;
}
export function bindWorkspaceInteractions(event, context) {
  const stepButton=event.target.closest('[data-step-id]');
  if(stepButton){const run=JSON.parse(document.querySelector('#run-data').textContent);const step=run.steps.find(item=>item.id===stepButton.dataset.stepId);const inspector=document.querySelector('#step-inspector');inspector.innerHTML=stepInspector(step,context.escapeHtml,context.badge);inspector.classList.add('open')}
  if(event.target.closest('[data-close-inspector]'))document.querySelector('#step-inspector')?.classList.remove('open');
  const tab=event.target.closest('[data-workspace-tab]');if(tab){document.querySelectorAll('[data-workspace-tab]').forEach(button=>button.setAttribute('aria-selected',button===tab));const model=JSON.parse(document.querySelector('#product-data').textContent);document.querySelector('#workspace-panel').innerHTML=workspaceTab(tab.dataset.workspaceTab,model,context.escapeHtml)}
}
