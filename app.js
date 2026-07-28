/* Fit with Baljit — app logic (vanilla JS, on-device, offline-first) */
'use strict';

const LS = {
  settings: 'fwb.settings',
  checks:   'fwb.checks',    // { "YYYY-MM-DD": { slotId:true } }
  supp:     'fwb.supp',      // { suppId: {lastTaken:"YYYY-MM-DD"} }
  weights:  'fwb.weights',   // [ {date, kg} ]
  measure:  'fwb.measure',   // [ {date, ...inches} ]
  meta:     'fwb.meta'       // { version, lastCheck }
};
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const todayKey = () => new Date().toISOString().slice(0, 10);
const WD = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

let PLAN = null;
let settings = load(LS.settings, { name:'Baljit', startDate: todayKey(), remindersOn:true, perItem:{}, theme:'default' });
let checks   = load(LS.checks, {});
let suppState= load(LS.supp, {});

/* ---------- data loading + heartbeat ---------- */
async function boot(){
  applyTheme();
  try {
    const res = await fetch('plan.json', { cache: 'no-store' });
    PLAN = await res.json();
    save('fwb.planCache', PLAN);
  } catch (e) {
    PLAN = load('fwb.planCache', null);
  }
  if (!PLAN){ document.getElementById('screens').innerHTML =
    '<div class="card">Couldn\'t load the plan yet. Connect to the internet once, then reopen.</div>'; return; }
  heartbeat();
  buildAll();
  initReminders();
}

/* Twice-weekly-ish check: on open, if >=3 days since last check, compare version */
function heartbeat(){
  const meta = load(LS.meta, { version:null, lastCheck:0 });
  const now = Date.now();
  const days = (now - (meta.lastCheck||0)) / 86400000;
  if (meta.version && meta.version !== PLAN.version){
    const structural = (PLAN.days && meta.knownDays && PLAN.days.length !== meta.knownDays);
    toast(structural ? 'Plan updated ✨ new days added' : 'Plan updated ✨');
  }
  if (days >= 3 || !meta.version){
    save(LS.meta, { version:PLAN.version, lastCheck:now, knownDays:(PLAN.days||[]).length });
  } else {
    save(LS.meta, { ...meta, version:PLAN.version, knownDays:(PLAN.days||[]).length });
  }
}

/* ---------- date -> day mapping ---------- */
function dayNumber(){
  const start = new Date(settings.startDate + 'T00:00:00');
  const diff = Math.floor((new Date(todayKey()+'T00:00:00') - start) / 86400000);
  return Math.max(0, diff) + 1;                 // Day 1, 2, ...
}
function currentDayObj(){
  const idx = (dayNumber() - 1) % PLAN.days.length;
  return PLAN.days[idx];
}
function suppById(id){ return (PLAN.supplements||[]).find(s => s.id === id); }

/* ---------- due engine (in-app smart reminders) ---------- */
function isDue(supp){
  const st = suppState[supp.id] || {};
  const last = st.lastTaken;
  if (supp.freq === 'weekly'){
    if (!last) return WD[new Date().getDay()] === (supp.weekday || 'Sun');
    const gap = (new Date(todayKey()) - new Date(last)) / 86400000;
    return gap >= 7;
  }
  return last !== todayKey();                    // daily: due until taken today
}
function markSupp(id, taken){
  suppState[id] = suppState[id] || {};
  suppState[id].lastTaken = taken ? todayKey() : null;
  save(LS.supp, suppState);
}
function dueCount(){
  return (PLAN.supplements||[]).filter(s => !s.optional && settings.perItem[s.id] !== false && isDue(s)).length;
}

/* ---------- checks (per-day habit ticks) ---------- */
function isChecked(slotId){ return !!(checks[todayKey()]||{})[slotId]; }
function setCheck(slotId, val){
  checks[todayKey()] = checks[todayKey()] || {};
  checks[todayKey()][slotId] = val; save(LS.checks, checks);
}

/* ================= RENDER ================= */
function buildAll(){ renderBar(); renderToday(); renderPlan(); renderTrack(); renderLearn(); renderMore(); refreshBadges(); }

function greeting(){
  const h = new Date().getHours();
  const g = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const e = h < 12 ? '☀️' : h < 17 ? '🌤️' : '🌙';
  return `${g} ${e}`;
}
function renderBar(){
  const d = currentDayObj();
  document.getElementById('greeting').textContent = greeting() + (settings.name ? ', ' + settings.name : '');
  document.getElementById('barsub').textContent = WD[new Date().getDay()] + ' · 12-week plan';
  document.getElementById('avatar').textContent = (settings.name||'B').trim().charAt(0).toUpperCase();
  const wo = PLAN.workouts[d.workout];
  document.getElementById('pillday').textContent =
    `Day ${dayNumber()} of ${PLAN.meta.totalDays} · ${wo.training ? wo.title : (d.workout==='rest'?'Rest day':'Recovery')}`;
}

function renderToday(){
  const d = currentDayObj(), wo = PLAN.workouts[d.workout];
  const water = d.slots.find(s => s.type==='water');
  const el = document.getElementById('today');
  const habitSlots = d.slots.filter(s => ['breakfast','lunch','dinner','workout'].includes(s.type)
    || s.id==='lunch_supps' || s.id==='dinner_supps');
  el.innerHTML = `
    <div class="card install" id="installcard"><div class="ico">📲</div>
      <div><div class="t">Add to home screen</div><div class="s">Works offline · opens like an app</div></div>
      <div class="arw">›</div></div>

    <div class="card focus"><h3>Today’s focus</h3>
      <div class="big">${wo.training ? wo.title : (d.workout==='rest'?'Rest day':'Recovery walk')}</div>
      <div class="meta">${wo.brief}</div>
      <button class="go" data-go="plan">See full day →</button></div>

    <div class="card water"><div class="ico">💧</div>
      <div><div class="t">${water.title}</div><div class="s">${water.note}</div></div></div>

    <div class="card"><h3>✅ Tick as you go</h3><div id="todayHabits"></div></div>

    <div class="stats">
      <div class="stat"><div class="n">${latestWeight()}<span style="font-size:14px">kg</span></div>
        <div class="l">Weight · goal ${PLAN.meta.goalWeight}</div>${sparkHTML()}</div>
      <div class="stat"><div class="n">${streak()}🔥</div><div class="l">Day streak</div>
        <div style="font-size:12px;color:var(--muted);margin-top:8px">${dueCount()} supplement${dueCount()===1?'':'s'} due today</div></div>
    </div>`;

  const wrap = el.querySelector('#todayHabits');
  habitSlots.forEach(s => wrap.appendChild(habitRow(s)));
  el.querySelector('#installcard').onclick = openInstall;
  el.querySelector('[data-go="plan"]').onclick = () => go('plan');
}
function habitRow(slot){
  const div = document.createElement('div');
  const done = isChecked(slot.id);
  div.className = 'habit' + (done ? ' done' : '');
  const label = slot.type==='workout' ? 'Workout / walk'
    : slot.id==='lunch_supps' ? 'Lunch + supplements'
    : slot.id==='dinner_supps' ? 'Dinner + supplements'
    : slot.title.length>34 ? slot.type[0].toUpperCase()+slot.type.slice(1) : slot.title;
  div.innerHTML = `<span class="check"></span><span class="lbl">${label}</span><span class="time">${(slot.time||'').replace(':00','')}</span>`;
  div.onclick = () => {
    const now = !isChecked(slot.id);
    setCheck(slot.id, now);
    div.classList.toggle('done', now);
    if (slot.id==='lunch_supps') (slot.items||[]).forEach(id => markSupp(id, now));
    if (slot.id==='dinner_supps') (slot.items||[]).forEach(id => markSupp(id, now));
    refreshBadges(); renderToday(); renderTrack();
  };
  return div;
}

/* ---------- Plan ---------- */
let planViewIdx = null;
function renderPlan(){
  const el = document.getElementById('plan');
  const cur = (dayNumber()-1) % PLAN.days.length;
  if (planViewIdx === null) planViewIdx = cur;
  const chips = PLAN.days.map((d,i)=>`<div class="daychip ${i===planViewIdx?'on':''}" data-i="${i}">D${d.n}${i===cur?' ·now':''}</div>`).join('');
  const d = PLAN.days[planViewIdx];
  const items = d.slots.map(s => planItem(s)).join('');
  el.innerHTML = `<div class="section-h">Plan</div>
    <div class="dayswitch">${chips}</div><div class="tl">${items}
    <div class="daytotal"><span>Day total</span><span><b>${d.totals.p} g protein</b> · ${d.totals.kcal} kcal</span></div></div>`;
  el.querySelectorAll('.daychip').forEach(c => c.onclick = () => { planViewIdx = +c.dataset.i; renderPlan(); });
}
function planItem(s){
  const cls = s.type==='water'?'wtr':s.type==='supplements'?'sup':(s.type==='workout'||s.type==='pre'||s.type==='post')?'wo':'';
  const ico = ({water:'💧',breakfast:'🍳',snack:'🍎',lunch:'🍛',dinner:'🍽',supplements:'💊',pre:'⚡',workout:'🏋',post:'🥛'})[s.type]||'•';
  const desc = s.note || s.detail || s.brief || '';
  const macros = (s.kcal!=null) ? `<div class="macros"><span>P ${s.p}g</span><span>C ${s.c}g</span><span>F ${s.f}g</span><span>${s.kcal} kcal</span></div>` : '';
  return `<div class="item"><div class="tcol">${s.time||''}</div>
    <div class="body ${cls}"><div class="kind">${ico} ${s.title}</div>${desc?`<div class="desc">${desc}</div>`:''}${macros}</div></div>`;
}

/* ---------- Track ---------- */
function renderTrack(){
  const el = document.getElementById('track');
  const m = PLAN.meta.baseline;
  el.innerHTML = `<div class="section-h">Track</div>
    <div class="card"><h3>Log today’s weight</h3>
      <div class="field"><input id="winput" type="number" step="0.1" inputmode="decimal" placeholder="e.g. 83.4 kg"></div>
      <button class="closeb" id="wsave" style="margin:0">Save weight</button>
      ${sparkHTML(true)}<div style="font-size:12px;color:var(--muted);margin-top:6px">${PLAN.meta.startWeight} → ${latestWeight()} kg · goal ${PLAN.meta.goalWeight}</div></div>

    <div class="card"><h3>Measurements · every 2 weeks</h3>
      <div style="font-size:13px;line-height:2.1;color:#42504a">
        Waist (kamar) <b style="font-family:var(--display);color:var(--forest);float:right">${lastMeasure('waist',m.waist)}″</b><br>
        Belly <b style="font-family:var(--display);color:var(--forest);float:right">${lastMeasure('belly',m.belly)}″</b><br>
        Hip <b style="font-family:var(--display);color:var(--forest);float:right">${lastMeasure('hip',m.hip)}″</b><br>
        Thigh <b style="font-family:var(--display);color:var(--forest);float:right">${lastMeasure('thigh',m.thigh)}″</b></div>
      <button class="closeb" id="msave" style="margin-top:12px;background:var(--marigold);color:#3a2a08">Update measurements</button></div>

    <div class="card"><h3>Supplements due today</h3><div id="suppdue"></div></div>`;

  el.querySelector('#wsave').onclick = () => {
    const v = parseFloat(el.querySelector('#winput').value); if (!v) return;
    const arr = load(LS.weights, []); arr.push({ date: todayKey(), kg: v }); save(LS.weights, arr);
    toast('Weight saved'); renderTrack(); renderToday();
  };
  el.querySelector('#msave').onclick = openMeasure;
  const due = el.querySelector('#suppdue');
  (PLAN.supplements||[]).filter(s=>!s.optional).forEach(s=>{
    const row = document.createElement('div'); row.className='subrow';
    const on = !isDue(s);
    row.innerHTML = `<span class="check ${on?'':''}" style="${on?'background:var(--forest);border-color:var(--forest)':''}">${on?'✓':''}</span>
      <span class="t">${s.name} <span style="color:var(--muted)">· ${s.dose}${s.freq==='weekly'?' · weekly':''}</span></span>
      ${isDue(s)?'<span class="due-badge">DUE</span>':''}`;
    row.onclick = () => { markSupp(s.id, isDue(s)); renderTrack(); renderToday(); refreshBadges(); };
    due.appendChild(row);
  });
}
function lastMeasure(key, base){ const a=load(LS.measure,[]); return a.length? (a[a.length-1][key]??base) : base; }

/* ---------- Learn ---------- */
function renderLearn(){
  const el = document.getElementById('learn');
  el.innerHTML = `<div id="learnmenu">
    <div class="section-h">Learn &amp; reference</div>
    <div class="lrow" data-v="ex"><div class="ico" style="background:var(--sage)">🏋️</div><div><div class="t">Exercises &amp; videos</div><div class="s">Form tutorials for every move</div></div><div class="arw">›</div></div>
    <div class="lrow" data-v="supp"><div class="ico" style="background:#efe7f4">💊</div><div><div class="t">Supplements</div><div class="s">What, when &amp; how much</div></div><div class="arw">›</div></div>
    <div class="lrow" data-v="water"><div class="ico" style="background:var(--sky)">💧</div><div><div class="t">Waters</div><div class="s">Which water on which day</div></div><div class="arw">›</div></div>
    <div class="lrow" data-v="fam"><div class="ico" style="background:var(--blush)">👨‍👩‍👧</div><div><div class="t">Family &amp; prep</div><div class="s">Feed the kids · no-cook breakfasts</div></div><div class="arw">›</div></div>
    <div class="lrow" data-v="dos"><div class="ico" style="background:#fbeee0">✅</div><div><div class="t">Do’s &amp; Don’ts</div><div class="s">Eat freely · avoid · limit</div></div><div class="arw">›</div></div>
  </div><div id="learnview"></div>`;
  el.querySelectorAll('.lrow').forEach(r => r.onclick = () => openLearn(r.dataset.v));
}
function openLearn(v){
  const menu = document.getElementById('learnmenu'), view = document.getElementById('learnview');
  menu.style.display='none'; let html = `<button class="back" id="lback">‹ Back</button>`;
  if (v==='ex'){
    PLAN.exercises.forEach(g=>{
      html += `<div class="section-h">${g.group}</div><div class="card" style="padding:6px 14px">`;
      g.items.forEach(it=>{
        const s = it.kind==='search';
        html += `<a class="vid" href="${it.url}" target="_blank" rel="noopener"><div class="play ${s?'s':''}">${s?'🔎':'▶'}</div>
          <div><div class="n">${it.name}</div><div class="g">${it.note||(s?'Curated search':'Tutorial video')}</div></div></a>`;
      });
      html += `</div>`;
    });
  } else if (v==='supp'){
    html += `<div class="section-h">Supplements</div><div class="card"><ul class="ul">`;
    PLAN.supplements.forEach(s=> html += `<li><b>${s.name}</b> — ${s.dose} · with ${s.when}${s.freq==='weekly'?' · weekly':''}${s.optional?' · optional':''}</li>`);
    html += `</ul></div>`;
  } else if (v==='water'){
    html += `<div class="section-h">Waters by day</div><div class="card"><ul class="ul">`;
    ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].forEach((d,i)=>{ const wk=PLAN.days[i].water,w=PLAN.waters[wk];
      html += `<li><b>${d}</b> — ${w.name}. ${w.prep}. <span style="color:var(--muted)">${w.helps}</span></li>`; });
    html += `</ul></div>`;
  } else if (v==='fam'){
    html += `<div class="section-h">Family &amp; prep</div><div class="card"><ul class="ul">${PLAN.family.map(x=>`<li>${x}</li>`).join('')}</ul></div>`;
  } else if (v==='dos'){
    html += `<div class="section-h">Do’s</div><div class="card"><ul class="ul">${PLAN.dos.map(x=>`<li>${x}</li>`).join('')}</ul></div>
      <div class="section-h">Don’ts</div><div class="card"><ul class="ul">${PLAN.donts.map(x=>`<li>${x}</li>`).join('')}</ul></div>
      <div class="section-h">Eat freely</div><div class="card"><ul class="ul">${PLAN.eat.map(x=>`<li>${x}</li>`).join('')}</ul></div>
      <div class="section-h">Avoid / limit</div><div class="card"><ul class="ul">${PLAN.avoid.map(x=>`<li>${x}</li>`).join('')}</ul></div>`;
  }
  view.innerHTML = html;
  document.getElementById('lback').onclick = () => { view.innerHTML=''; menu.style.display='block'; };
}

/* ---------- More / settings ---------- */
function renderMore(){
  const el = document.getElementById('more');
  el.innerHTML = `<div class="section-h">More</div>
    <div class="mrow" id="minstall"><span class="ico">📲</span><span class="t">Install as app</span><span class="arw">›</span></div>
    <div class="mrow"><span class="ico">🔔</span><span class="t">Reminders</span><span class="switch ${settings.remindersOn?'on':''}" id="remtog"></span></div>
    <div class="card"><h3>Per-item reminders</h3><div id="peritem"></div></div>
    <div class="card"><h3>Setup</h3>
      <div class="field"><label>Her name</label><input id="setname" value="${settings.name||''}"></div>
      <div class="field"><label>Plan start date (Day 1)</label><input id="setstart" type="date" value="${settings.startDate}"></div>
      <button class="closeb" id="setsave" style="margin:0">Save</button></div>
    <div class="mrow" id="mtheme"><span class="ico">🎨</span><span class="t">Theme: ${settings.theme==='calm'?'Calm blue':'Warm green'}</span><span class="arw">↺</span></div>
    <div class="mrow" id="mexport"><span class="ico">⬇️</span><span class="t">Export my data</span><span class="arw">›</span></div>
    <p style="font-size:12px;color:var(--muted);text-align:center;margin-top:14px;line-height:1.5">Version ${PLAN.version} · your data stays on this device.</p>`;

  el.querySelector('#minstall').onclick = openInstall;
  el.querySelector('#remtog').onclick = (e)=>{ settings.remindersOn=!settings.remindersOn; save(LS.settings,settings); e.target.classList.toggle('on',settings.remindersOn); if(settings.remindersOn) initReminders(); };
  const pi = el.querySelector('#peritem');
  (PLAN.supplements||[]).forEach(s=>{
    const on = settings.perItem[s.id] !== false;
    const row=document.createElement('div'); row.className='subrow';
    row.innerHTML = `<span class="t">${s.name}${s.freq==='weekly'?' · weekly':''}</span><span class="switch ${on?'on':''}"></span>`;
    row.querySelector('.switch').onclick = (e)=>{ settings.perItem[s.id]= !(settings.perItem[s.id]!==false); save(LS.settings,settings); e.target.classList.toggle('on', settings.perItem[s.id]!==false); refreshBadges(); };
    pi.appendChild(row);
  });
  el.querySelector('#setsave').onclick = ()=>{ settings.name=el.querySelector('#setname').value.trim(); settings.startDate=el.querySelector('#setstart').value||settings.startDate; save(LS.settings,settings); toast('Saved'); buildAll(); };
  el.querySelector('#mtheme').onclick = ()=>{ settings.theme = settings.theme==='calm'?'default':'calm'; save(LS.settings,settings); applyTheme(); renderMore(); };
  el.querySelector('#mexport').onclick = exportData;
}
function applyTheme(){ document.documentElement.setAttribute('data-theme', settings.theme==='calm'?'calm':'default'); }

/* ---------- helpers ---------- */
function latestWeight(){ const a=load(LS.weights,[]); return a.length? a[a.length-1].kg : PLAN.meta.startWeight; }
function sparkHTML(big){
  const a=load(LS.weights,[]).slice(-6); if(a.length<2){ return `<div class="spark"><i style="height:70%"></i><i style="height:60%"></i></div>`; }
  const mx=Math.max(...a.map(x=>x.kg)), mn=Math.min(...a.map(x=>x.kg))-.4;
  const bars=a.map((x,i)=>`<i style="height:${20+((x.kg-mn)/(mx-mn||1))*80}%;${i===a.length-1?'background:var(--forest)':''}"></i>`).join('');
  return `<div class="spark" ${big?'style="height:56px"':''}>${bars}</div>`;
}
function streak(){
  let n=0; const d=new Date();
  for(let i=0;i<90;i++){ const k=new Date(d.getTime()-i*86400000).toISOString().slice(0,10);
    const c=checks[k]; if(c && Object.values(c).some(Boolean)) n++; else if(i>0) break; }
  return n;
}
function refreshBadges(){
  const n=dueCount(); const b=document.getElementById('trackBadge');
  if(b){ b.style.display = n>0?'grid':'none'; b.textContent=n; }
}

/* ---------- modals ---------- */
function openInstall(){ document.getElementById('overlay-install').classList.add('show'); }
function openMeasure(){
  const m=PLAN.meta.baseline; const ov=document.getElementById('overlay-measure');
  ov.querySelector('#measbody').innerHTML = ['waist','belly','hip','thigh','chest','bicep'].map(k=>
    `<div class="field"><label>${k[0].toUpperCase()+k.slice(1)} (inches)</label><input data-k="${k}" type="number" step="0.1" inputmode="decimal" value="${lastMeasure(k,m[k]||'')}"></div>`).join('');
  ov.classList.add('show');
  ov.querySelector('#measave').onclick = ()=>{ const rec={date:todayKey()}; ov.querySelectorAll('input[data-k]').forEach(i=>rec[i.dataset.k]=parseFloat(i.value)||null); const a=load(LS.measure,[]); a.push(rec); save(LS.measure,a); ov.classList.remove('show'); toast('Measurements saved'); renderTrack(); };
}
function exportData(){
  const blob=new Blob([JSON.stringify({settings,checks,suppState,weights:load(LS.weights,[]),measure:load(LS.measure,[])},null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='fitwithbaljit-data.json'; a.click();
}
let toastT; function toast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove('show'),2200); }

/* ---------- navigation ---------- */
function go(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('on', t.dataset.t===id));
  document.getElementById('screens').scrollTop=0;
}
window.go = go;

/* ---------- reminders (OneSignal + local) ---------- */
function initReminders(){
  if (!settings.remindersOn) return;
  // OneSignal (loaded via index.html if APP ID configured). Ask permission once installed.
  if (window.OneSignalDeferred){
    window.OneSignalDeferred.push(async (OneSignal) => {
      try { await OneSignal.Notifications.requestPermission(); } catch(e){}
    });
  }
  // Lightweight local notification when app is open near a reminder time (backup for iOS).
  if ('Notification' in window && Notification.permission==='default'){ /* asked via OneSignal */ }
}

document.addEventListener('DOMContentLoaded', boot);
