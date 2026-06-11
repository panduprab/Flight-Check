/* ══ CONFIG ══ */
const LS_KEY        = 'flight_check_logs_v2';
const LS_SCRIPT_URL = 'flight_check_script_url';

/* ══ STATE ══ */
let logs = [];
let editingId = null;
let activeMission = null;
let sortKey = 'lastDate', sortDir = -1;
let timerInterval = null, timerStart = null;

// Upload state
let upSelectedIds = new Set(); // IDs of records the user has checked

function loadLogs() { try { logs = JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { logs = []; } }
function saveLogs() { localStorage.setItem(LS_KEY, JSON.stringify(logs)); }
function getScriptUrl() { return localStorage.getItem(LS_SCRIPT_URL) || ''; }
function setScriptUrl(u) { localStorage.setItem(LS_SCRIPT_URL, u); }

/* ══ GROUP BY MISSION ══ */
function groupByMission() {
  const map = {};
  for (const l of logs) {
    const k = (l.missionName||'(Unnamed)').trim();
    if (!map[k]) map[k] = { missionName: k, flights: [] };
    map[k].flights.push(l);
  }
  return Object.values(map).map(m => {
    const count = m.flights.length;
    const totalDuration = m.flights.reduce((s,f)=>s+(Number(f.duration)||0),0);
    const avgDuration = count ? Math.round(totalDuration/count) : 0;
    const lastDate = m.flights.map(f=>f.date||'').sort().at(-1)||'';
    return { missionName:m.missionName, flights:m.flights, count, totalDuration, avgDuration, lastDate };
  });
}

/* ══ RENDER MAIN ══ */
function renderAll() { renderStats(); renderTable(); updateDatalist(); }
function renderStats() {
  const now = new Date();
  const thisMonth = logs.filter(l=>{ const d=new Date(l.date); return d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth(); }).length;
  const totalMin = logs.reduce((s,l)=>s+(Number(l.duration)||0),0);
  document.getElementById('stat-missions').textContent = groupByMission().length;
  document.getElementById('stat-total').textContent = logs.length;
  document.getElementById('stat-month').textContent = thisMonth;
  document.getElementById('stat-month-label').textContent = now.toLocaleString('default',{month:'long'});
  document.getElementById('stat-duration').textContent = totalMin;
}
function renderTable() {
  const q = document.getElementById('search-input').value.toLowerCase();
  let data = groupByMission().filter(m=>m.missionName.toLowerCase().includes(q));
  data.sort((a,b)=>{
    let av=a[sortKey]??'',bv=b[sortKey]??'';
    if(['count','totalDuration','avgDuration'].includes(sortKey)){av=Number(av);bv=Number(bv);}
    if(av<bv)return -sortDir; if(av>bv)return sortDir; return 0;
  });
  document.getElementById('row-count').textContent=`${data.length} mission${data.length!==1?'s':''}`;
  const tbody=document.getElementById('table-body');
  if(!data.length){
    tbody.innerHTML='';
    const es=document.getElementById('empty-state'); es.style.display='';
    es.innerHTML=logs.length===0
      ?`<div class="empty-icon">✈</div><div class="empty-title">No missions yet</div><div style="margin-bottom:16px;font-size:13px;">Click "New Flight" to log your first mission.</div><button class="btn btn-primary" onclick="openNewFlight()">＋ New Flight</button>`
      :`<div class="empty-icon">🔍</div><div class="empty-title">No missions match your search</div>`;
    return;
  }
  document.getElementById('empty-state').style.display='none';
  tbody.innerHTML=data.map(m=>{
    const lastDateStr=m.lastDate?new Date(m.lastDate+'T00:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}):'—';
    const dc=m.totalDuration<30?'chip-orange':m.totalDuration<120?'chip-blue':'chip-green';
    const mEsc=esc(m.missionName);
    return `<tr>
      <td><span class="mission-link" onclick="openMissionDetail('${mEsc}')">📋 ${mEsc}</span></td>
      <td>${lastDateStr}</td>
      <td><span class="chip chip-gray">${m.count} flight${m.count!==1?'s':''}</span></td>
      <td><span class="chip ${dc}">${m.totalDuration} min</span></td>
      <td>${m.avgDuration} min / flight</td>
      <td><div class="row-actions"><button class="btn btn-sm btn-secondary" onclick="openMissionDetail('${mEsc}')">View →</button></div></td>
    </tr>`;
  }).join('');
}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g,'&#39;').replace(/"/g,'&quot;');}
function sortBy(key){
  if(sortKey===key)sortDir*=-1; else{sortKey=key;sortDir=-1;}
  document.querySelectorAll('thead th').forEach(th=>th.classList.remove('sorted'));
  const th=document.getElementById('th-'+key);
  if(th){th.classList.add('sorted');th.querySelector('.sort-icon').textContent=sortDir===1?'↑':'↓';}
  renderTable();
}
function updateDatalist(){
  const dl=document.getElementById('mission-datalist');
  dl.innerHTML=[...new Set(logs.map(l=>l.missionName).filter(Boolean))].sort().map(n=>`<option value="${esc(n)}">`).join('');
}

/* ══ MISSION DETAIL ══ */
function openMissionDetail(missionName){
  const tmp=document.createElement('textarea');tmp.innerHTML=missionName;const realName=tmp.value;
  activeMission=realName;
  const mFlights=logs.filter(l=>(l.missionName||'').trim()===realName).sort((a,b)=>a.date<b.date?1:-1);
  const count=mFlights.length,total=mFlights.reduce((s,f)=>s+(Number(f.duration)||0),0),avg=count?Math.round(total/count):0;
  document.getElementById('mission-title').textContent=realName;
  document.getElementById('mission-subtitle').textContent=`${count} flight${count!==1?'s':''} logged`;
  document.getElementById('ms-count').textContent=count;
  document.getElementById('ms-total').textContent=`${total} min`;
  document.getElementById('ms-avg').textContent=`${avg} min`;
  document.getElementById('mission-body').innerHTML=mFlights.length
    ?mFlights.map(f=>{
        const dateStr=f.date?new Date(f.date+'T00:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}):'—';
        const usedPct=(f.startPct!==''&&f.endPct!==''&&f.startPct!=null&&f.endPct!=null)?`${f.startPct-f.endPct}%`:'—';
        const voltStr=(f.startVolt&&f.endVolt)?`${f.startVolt}→${f.endVolt}V`:(f.startVolt?`${f.startVolt}V`:(f.endVolt?`${f.endVolt}V`:'—'));
        const durChip=f.duration?`<span class="chip ${f.duration<10?'chip-orange':f.duration<30?'chip-blue':'chip-green'}">${f.duration} min</span>`:'—';
        return `<tr>
          <td>${dateStr}</td>
          <td><span class="chip chip-blue">${esc(f.flightId||'—')}</span></td>
          <td>${esc(f.batteryId||'—')}</td><td>${durChip}</td>
          <td>${usedPct!=='—'?`<span class="chip chip-orange">${usedPct}</span>`:'—'}</td>
          <td style="font-family:var(--font-mono);font-size:11px;">${esc(voltStr)}</td>
          <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;">${esc(f.notes||'—')}</td>
          <td><button class="btn btn-sm btn-secondary" onclick="openEditFromMission('${f.id}')">✏ Edit</button></td>
        </tr>`;
      }).join('')
    :`<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--gray-500);">No flights yet.</td></tr>`;
  openModal('mission-overlay');
}
function openEditFromMission(id){openEdit(id);}
function openNewFlightForMission(){openNewFlight();if(activeMission){document.getElementById('f-missionName').value=activeMission;autofillFromMission(activeMission);}}

/* ══ MODAL HELPERS ══ */
function openModal(id){document.getElementById(id).classList.add('active');}
function closeModal(id){
  if(id==='flight-overlay'&&timerInterval){toast('Stop the timer before closing.','error');return;}
  document.getElementById(id).classList.remove('active');
  if(id==='flight-overlay')stopTimer();
}
function overlayClick(e,id){if(e.target===e.currentTarget)closeModal(id);}

/* ══ NEW / EDIT FLIGHT ══ */
function openNewFlight(){
  editingId=null;resetForm();
  document.getElementById('modal-title').textContent='New Flight Log';
  document.getElementById('btn-delete-log').style.display='none';
  document.getElementById('f-date').value=new Date().toISOString().split('T')[0];
  openModal('flight-overlay');
}
function openEdit(id){
  const log=logs.find(l=>l.id===id);if(!log)return;
  editingId=id;resetForm();
  document.getElementById('modal-title').textContent='Edit Flight Log';
  document.getElementById('btn-delete-log').style.display='';
  document.getElementById('f-date').value=log.date||'';
  document.getElementById('f-ama').value=log.ama||'';
  document.getElementById('f-estate').value=log.estate||'';
  document.getElementById('f-flightId').value=log.flightId||'';
  document.getElementById('f-missionName').value=log.missionName||'';
  document.getElementById('f-pilotName').value=log.pilotName||'';
  document.getElementById('f-wingtraUnit').value=log.wingtraUnit||'';
  document.getElementById('f-batteryIdA').value=log.batteryId||'';
  document.getElementById('f-batteryIdB').value=log.batteryIdB||'';
  document.getElementById('f-batteryColor').value=log.batteryColor||'';
  document.getElementById('f-startPct').value=log.startPct??'';
  document.getElementById('f-endPct').value=log.endPct??'';
  document.getElementById('f-startVolt').value=log.startVolt??'';
  document.getElementById('f-endVolt').value=log.endVolt??'';
  document.getElementById('f-startTime').value=log.startTime||'';
  document.getElementById('f-endTime').value=log.endTime||'';
  document.getElementById('f-duration').value=log.duration??'';
  document.getElementById('f-notes').value=log.notes||'';
  calcUsedPct();openModal('flight-overlay');
}
function resetForm(){
  ['f-date','f-ama','f-estate','f-flightId','f-missionName','f-pilotName','f-wingtraUnit',
   'f-startPct','f-endPct','f-usedPct','f-startVolt','f-endVolt',
   'f-startTime','f-endTime','f-duration','f-notes'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.value='';
  });
  ['f-batteryIdA','f-batteryIdB','f-batteryColor'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.selectedIndex=0;
  });
  stopTimer();
  document.getElementById('btn-start').disabled=false;
  document.getElementById('btn-end').disabled=true;
  document.getElementById('timer-display').textContent='00:00:00';
  document.getElementById('timer-display').classList.remove('timer-running');
}

/* ══ AUTOFILL FROM MISSION ══ */
function autofillFromMission(value) {
  const name = value.trim();
  if (!name) return;
  // Find the most recent log with this mission name
  const match = logs
    .filter(l => (l.missionName || '').trim() === name)
    .sort((a, b) => ((b.updatedAt || b.createdAt || '') < (a.updatedAt || a.createdAt || '') ? -1 : 1))
    .at(0); // most recent
  if (!match) return;
  // Only fill Flight Information fields if currently empty
  const fill = (id, val) => {
    const el = document.getElementById(id);
    if (el && !el.value && val) el.value = val;
  };
  fill('f-ama', match.ama);
  fill('f-estate', match.estate);
  fill('f-pilotName', match.pilotName);
  fill('f-wingtraUnit', match.wingtraUnit);
}

function captureStart(){
  const now=new Date();
  document.getElementById('f-startTime').value=`${pad(now.getHours())}:${pad(now.getMinutes())}`;
  document.getElementById('btn-start').disabled=true;document.getElementById('btn-end').disabled=false;
  timerStart=now;document.getElementById('timer-display').classList.add('timer-running');
  timerInterval=setInterval(updateTimerDisplay,1000);
}
function captureEnd(){
  const now=new Date();
  document.getElementById('f-endTime').value=`${pad(now.getHours())}:${pad(now.getMinutes())}`;
  if(timerStart)document.getElementById('f-duration').value=Math.round((now-timerStart)/60000);
  stopTimer();document.getElementById('btn-end').disabled=true;document.getElementById('btn-start').disabled=false;timerStart=null;
}
function stopTimer(){clearInterval(timerInterval);timerInterval=null;document.getElementById('timer-display').classList.remove('timer-running');}
function updateTimerDisplay(){
  if(!timerStart)return;
  const d=Math.floor((Date.now()-timerStart)/1000);
  document.getElementById('timer-display').textContent=`${pad(Math.floor(d/3600))}:${pad(Math.floor((d%3600)/60))}:${pad(d%60)}`;
}
function pad(n){return String(n).padStart(2,'0');}
function calcUsedPct(){
  const sv=document.getElementById('f-startPct').value,ev=document.getElementById('f-endPct').value;
  if(sv!==''&&ev!=='')document.getElementById('f-usedPct').value=Number(sv)-Number(ev);
}
function calcDuration(){
  const st=document.getElementById('f-startTime').value,et=document.getElementById('f-endTime').value;
  if(st&&et){
    const[sh,sm]=st.split(':').map(Number),[eh,em]=et.split(':').map(Number);
    let m=(eh*60+em)-(sh*60+sm);if(m<0)m+=1440;
    document.getElementById('f-duration').value=m;
  }
}

/* ══ SAVE / DELETE ══ */
function saveLog(){
  const date=document.getElementById('f-date').value;
  const ama=document.getElementById('f-ama').value.trim();
  const estate=document.getElementById('f-estate').value.trim();
  const flightId=document.getElementById('f-flightId').value.trim();
  const missionName=document.getElementById('f-missionName').value.trim();
  if(!date||!ama||!estate||!flightId||!missionName){toast('Please fill in Date, AMA, Estate, Flight ID, and Mission Name.','error');return;}
  const entry={
    id:editingId||crypto.randomUUID(),date,ama,estate,flightId,missionName,
    pilotName:document.getElementById('f-pilotName').value.trim(),
    wingtraUnit:document.getElementById('f-wingtraUnit').value.trim(),
    batteryId:document.getElementById('f-batteryIdA').value,
    batteryIdB:document.getElementById('f-batteryIdB').value,
    batteryColor:document.getElementById('f-batteryColor').value.trim(),
    startPct:document.getElementById('f-startPct').value!==''?Number(document.getElementById('f-startPct').value):'',
    endPct:document.getElementById('f-endPct').value!==''?Number(document.getElementById('f-endPct').value):'',
    startVolt:document.getElementById('f-startVolt').value!==''?Number(document.getElementById('f-startVolt').value):'',
    endVolt:document.getElementById('f-endVolt').value!==''?Number(document.getElementById('f-endVolt').value):'',
    startTime:document.getElementById('f-startTime').value,
    endTime:document.getElementById('f-endTime').value,
    duration:document.getElementById('f-duration').value!==''?Number(document.getElementById('f-duration').value):'',
    notes:document.getElementById('f-notes').value.trim(),
    updatedAt:new Date().toISOString(),
  };
  if(editingId){const idx=logs.findIndex(l=>l.id===editingId);if(idx!==-1)logs[idx]=entry;toast('Flight log updated.','success');}
  else{entry.createdAt=entry.updatedAt;logs.push(entry);toast('Flight logged!','success');}
  saveLogs();closeModal('flight-overlay');renderAll();
  if(document.getElementById('mission-overlay').classList.contains('active')){activeMission=missionName;openMissionDetail(missionName);}
}
function deleteCurrentLog(){
  if(!editingId)return;
  if(!confirm('Delete this flight log? This cannot be undone.'))return;
  const deleted=logs.find(l=>l.id===editingId);
  logs=logs.filter(l=>l.id!==editingId);
  saveLogs();closeModal('flight-overlay');renderAll();toast('Flight log deleted.','success');
  if(deleted&&document.getElementById('mission-overlay').classList.contains('active')){
    const rem=logs.filter(l=>(l.missionName||'').trim()===activeMission);
    if(rem.length>0)openMissionDetail(activeMission);else closeModal('mission-overlay');
  }
}

/* ══ EXPORT ══ */
function openExport(){document.getElementById('exp-from').value='';document.getElementById('exp-to').value='';updateExportPreview();openModal('export-overlay');}
function updateExportPreview(){
  const n=getExportLogs(document.getElementById('exp-from').value,document.getElementById('exp-to').value).length;
  document.getElementById('export-preview').textContent=`${n} record${n!==1?'s':''} will be exported.`;
}
function getExportLogs(from,to){return logs.filter(l=>{if(from&&l.date<from)return false;if(to&&l.date>to)return false;return true;});}
function doExport(){
  const from=document.getElementById('exp-from').value,to=document.getElementById('exp-to').value;
  const filtered=getExportLogs(from,to);
  if(!filtered.length){toast('No logs to export.','error');return;}
  const cols=['date','ama','estate','flightId','missionName','pilotName','UAVUnit','batteryId','batteryIdB','batteryColor','startPct','endPct','usedPct','startVolt','endVolt','startTime','endTime','duration','notes'];
  const hdrs=['Date','AMA','Estate','Flight ID','Mission Name','Pilot Name','UAV Unit','Battery ID 1','Battery ID 2','Battery Color','Start %','End %','Used %','Start Volt','End Volt','Start Time','End Time','Duration (min)','Notes'];
  const csv=[hdrs,...filtered.map(l=>cols.map(c=>{const v=l[c]??'';return(typeof v==='string'&&v.includes(','))?`"${v}"`:v;}))].map(r=>r.join(',')).join('\r\n');
  const today=new Date().toISOString().split('T')[0];
  Object.assign(document.createElement('a'),{href:URL.createObjectURL(new Blob([csv],{type:'text/csv'})),download:`logs_${today}.csv`}).click();
  closeModal('export-overlay');toast(`Exported ${filtered.length} records.`,'success');
}

/* ══ UPLOAD — selection table ══ */
function openUpload(){
  // Reset
  upSelectedIds = new Set();
  document.getElementById('up-search-input').value = '';
  document.getElementById('upload-progress').style.display = 'none';
  const res = document.getElementById('upload-result');
  res.style.display = 'none'; res.className = 'upload-result'; res.textContent = '';
  document.getElementById('btn-do-upload').disabled = true;

  const url = getScriptUrl();
  document.getElementById('upload-not-configured').style.display = url ? 'none' : '';
  document.getElementById('upload-configured').style.display = url ? '' : 'none';

  if (url) {
    const short = url.length > 55 ? url.slice(0,52)+'…' : url;
    document.getElementById('upload-url-display').textContent = short;
    renderUploadTable();
  }
  openModal('upload-overlay');
}

function getFilteredUploadLogs() {
  const q = (document.getElementById('up-search-input').value || '').toLowerCase();
  if (!q) return [...logs].sort((a,b) => (b.date||'').localeCompare(a.date||''));
  return logs.filter(l =>
    (l.missionName||'').toLowerCase().includes(q) ||
    (l.flightId||'').toLowerCase().includes(q) ||
    (l.date||'').includes(q) ||
    (l.batteryId||'').toLowerCase().includes(q)
  ).sort((a,b) => (b.date||'').localeCompare(a.date||''));
}

function renderUploadTable() {
  const filtered = getFilteredUploadLogs();
  const tbody = document.getElementById('up-tbody');
  document.getElementById('up-total-count').textContent = logs.length;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--gray-500);">No records match your filter.</td></tr>`;
    syncUpHeaderCheckbox(filtered);
    syncUploadBtn();
    return;
  }

  tbody.innerHTML = filtered.map(l => {
    const checked = upSelectedIds.has(l.id) ? 'checked' : '';
    const rowCls = upSelectedIds.has(l.id) ? 'row-selected' : '';
    const dateStr = l.date ? new Date(l.date+'T00:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—';
    return `<tr class="${rowCls}" onclick="upToggleRow('${l.id}',event)">
      <td onclick="event.stopPropagation()"><input type="checkbox" ${checked} onchange="upRowCheck('${l.id}',this.checked)" /></td>
      <td>${dateStr}</td>
      <td><span class="chip chip-blue" style="font-size:11px;">${esc(l.flightId||'—')}</span></td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;">${esc(l.missionName||'—')}</td>
      <td>${esc(l.batteryId||'—')}</td>
      <td>${l.duration!==''&&l.duration!=null?l.duration+' min':'—'}</td>
      <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;color:var(--gray-500);">${esc(l.notes||'')}</td>
    </tr>`;
  }).join('');

  syncUpHeaderCheckbox(filtered);
  syncUploadBtn();
}

function upRowCheck(id, checked) {
  if (checked) upSelectedIds.add(id); else upSelectedIds.delete(id);
  // update row highlight
  const filtered = getFilteredUploadLogs();
  syncUpHeaderCheckbox(filtered);
  syncUploadBtn();
  // re-render just the row class without full re-render (avoid scroll jump)
  document.querySelectorAll('#up-tbody tr').forEach((tr, i) => {
    const log = filtered[i];
    if (!log) return;
    tr.className = upSelectedIds.has(log.id) ? 'row-selected' : '';
  });
  document.getElementById('up-sel-count').textContent = upSelectedIds.size;
}

function upToggleRow(id, e) {
  const newState = !upSelectedIds.has(id);
  if (newState) upSelectedIds.add(id); else upSelectedIds.delete(id);
  const filtered = getFilteredUploadLogs();
  syncUpHeaderCheckbox(filtered);
  syncUploadBtn();
  document.getElementById('up-sel-count').textContent = upSelectedIds.size;
  // Update only this row's checkbox + class
  const idx = filtered.findIndex(l => l.id === id);
  const rows = document.querySelectorAll('#up-tbody tr');
  if (rows[idx]) {
    rows[idx].className = newState ? 'row-selected' : '';
    const cb = rows[idx].querySelector('input[type=checkbox]');
    if (cb) cb.checked = newState;
  }
}

function upToggleAll(checked) {
  const filtered = getFilteredUploadLogs();
  filtered.forEach(l => { if(checked) upSelectedIds.add(l.id); else upSelectedIds.delete(l.id); });
  renderUploadTable();
}

function upSelectAll() {
  logs.forEach(l => upSelectedIds.add(l.id));
  renderUploadTable();
}
function upSelectNone() {
  upSelectedIds.clear();
  renderUploadTable();
}

function syncUpHeaderCheckbox(filtered) {
  const cb = document.getElementById('up-check-all');
  if (!cb) return;
  const allChecked = filtered.length > 0 && filtered.every(l => upSelectedIds.has(l.id));
  const someChecked = filtered.some(l => upSelectedIds.has(l.id));
  cb.checked = allChecked;
  cb.indeterminate = !allChecked && someChecked;
  document.getElementById('up-sel-count').textContent = upSelectedIds.size;
}

function syncUploadBtn() {
  document.getElementById('btn-do-upload').disabled = upSelectedIds.size === 0;
}

/* ══ DO UPLOAD ══ */
async function doUpload() {
  const url = getScriptUrl();
  if (!url) { toast('Please set up the Apps Script URL first.','error'); return; }
  if (upSelectedIds.size === 0) { toast('No records selected.','error'); return; }

  const selected = logs.filter(l => upSelectedIds.has(l.id));
  const btn = document.getElementById('btn-do-upload');
  const progressWrap = document.getElementById('upload-progress');
  const progressBar = document.getElementById('upload-progress-bar');
  const progressLabel = document.getElementById('upload-progress-label');
  const resultEl = document.getElementById('upload-result');

  btn.disabled = true;
  resultEl.style.display = 'none';
  progressBar.style.background = 'var(--blue)';
  progressWrap.style.display = '';
  progressLabel.textContent = `Uploading ${selected.length} selected record${selected.length!==1?'s':''}…`;
  progressBar.style.width = '20%';

  try {
    progressBar.style.width = '60%';
    const resp = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({ records: selected }),
    });
    progressBar.style.width = '90%';

    const text = await resp.text();
    let data;
    try { data = JSON.parse(text); }
    catch { throw new Error('Unexpected response from Apps Script. Check your deployment settings.'); }

    progressBar.style.width = '100%';
    progressLabel.textContent = 'Done!';

    if (data.status === 'ok') {
      resultEl.className = 'upload-result success';
      resultEl.innerHTML = `✓ Upload successful! <strong>${data.appended}</strong> record${data.appended!==1?'s':''} added to the sheet.${data.skipped>0?' ('+data.skipped+' already existed, skipped)':''}`;
      resultEl.style.display = '';
      toast(`Uploaded ${data.appended} records to Google Sheets!`, 'success');
      // Deselect uploaded records
      upSelectedIds.clear();
      renderUploadTable();
    } else {
      throw new Error(data.message || 'Upload failed.');
    }
  } catch(err) {
    progressBar.style.width = '100%';
    progressBar.style.background = 'var(--red)';
    resultEl.className = 'upload-result error';
    resultEl.textContent = '✕ ' + err.message;
    resultEl.style.display = '';
    toast('Upload failed. See details in the upload window.','error');
    btn.disabled = false;
  }
}

/* ══ SETUP ══ */
function openSetup(){
  document.getElementById('setup-url-input').value=getScriptUrl();
  document.getElementById('setup-url-feedback').textContent='';
  openModal('setup-overlay');
}
function saveScriptUrl(){
  const input=document.getElementById('setup-url-input');
  const url=input.value.trim();
  const fb=document.getElementById('setup-url-feedback');
  if(!url){fb.style.color='var(--red)';fb.textContent='Please paste a URL.';return;}
  if(!url.startsWith('https://script.google.com/macros/s/')){fb.style.color='var(--red)';fb.textContent='URL should start with https://script.google.com/macros/s/…';return;}
  setScriptUrl(url);fb.style.color='var(--green)';fb.textContent='✓ URL saved!';
  toast('Apps Script URL saved!','success');
  setTimeout(()=>{closeModal('setup-overlay');openUpload();},700);
}

/* ══ TOAST ══ */
function toast(msg,type=''){
  const el=document.createElement('div');el.className=`toast ${type}`;
  el.innerHTML=`<span>${{success:'✓',error:'✕','':'ℹ'}[type]||'ℹ'}</span><span>${msg}</span>`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(()=>{el.style.animation='slideOut .3s forwards';setTimeout(()=>el.remove(),300);},3000);
}

/* ══ EVENTS ══ */
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('f-startPct').addEventListener('input',calcUsedPct);
  document.getElementById('f-endPct').addEventListener('input',calcUsedPct);
  document.getElementById('f-startTime').addEventListener('change',calcDuration);
  document.getElementById('f-endTime').addEventListener('change',calcDuration);
  document.getElementById('exp-from').addEventListener('change',updateExportPreview);
  document.getElementById('exp-to').addEventListener('change',updateExportPreview);
});

/* ══ PWA ══ */
(function setupPWA(){
  const manifest={name:"Flight Check",short_name:"FlightCheck",description:"UAV Flight Log Manager",start_url:"./",display:"standalone",background_color:"#f8f9fa",theme_color:"#1a73e8",orientation:"portrait-primary",icons:[
    {src:"data:image/svg+xml,"+encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 192 192'><rect width='192' height='192' rx='24' fill='%231a73e8'/><text x='50%' y='58%' font-size='110' text-anchor='middle' dominant-baseline='middle' font-family='sans-serif'>✈</text></svg>`),sizes:"192x192",type:"image/svg+xml",purpose:"any maskable"},
    {src:"data:image/svg+xml,"+encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'><rect width='512' height='512' rx='64' fill='%231a73e8'/><text x='50%' y='58%' font-size='300' text-anchor='middle' dominant-baseline='middle' font-family='sans-serif'>✈</text></svg>`),sizes:"512x512",type:"image/svg+xml",purpose:"any maskable"}
  ]};
  document.getElementById('manifest-placeholder').setAttribute('href',URL.createObjectURL(new Blob([JSON.stringify(manifest)],{type:'application/manifest+json'})));
  if('serviceWorker'in navigator){try{navigator.serviceWorker.register('./sw.js',{scope:'./'}).then(r=>console.log('[FlightCheck] SW:',r.scope)).catch(e=>console.warn('[FlightCheck] SW skipped:',e.message));}catch(e){console.warn('[FlightCheck] SW:',e.message);}}
  let deferredPrompt=null;
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;document.getElementById('btn-install').style.display='inline-flex';});
  window.addEventListener('appinstalled',()=>{deferredPrompt=null;document.getElementById('btn-install').style.display='none';});
  window.installPWA=function(){if(!deferredPrompt){alert('To install:\n• Chrome/Edge: tap the menu (⋮) → "Add to Home screen"\n• Safari (iOS): tap Share → "Add to Home Screen"');return;}deferredPrompt.prompt();deferredPrompt.userChoice.then(()=>{deferredPrompt=null;document.getElementById('btn-install').style.display='none';});};
})();

loadLogs();renderAll();
