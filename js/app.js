// Katelyn's School Assistant — app logic
(() => {
  'use strict';

  // ---------- state ----------
  let dayCycle = {};        // date -> { day, noSchool, note }
  let schedule = {};        // "Day 1" -> [ {period,time,isBreak,subject,teacher,room}, ... ]
  let assignments = [];     // [{id,type,subject,details,dueDate,createdAt,completed}]
  let weekActiveDay = null; // "Day 1".."Day 5"
  let addType = 'Assignment';
  let addSubject = null;
  let calYear, calMonth;    // 0-indexed month, currently displayed
  let calSelectedDate = null;

  // Mostly drawn from the logo's red/black/gold/grey family; three muted
  // outliers (navy-grey, plum, teal) are mixed in deliberately — with 10
  // subjects, an all-red-and-grey set becomes hard to tell apart at a
  // glance on a busy schedule. Easy to tighten to strictly on-brand if
  // that's preferred instead.
  const SUBJECT_PALETTE = [
    '#8C1220', '#C81E2B', '#C9932E', '#3A3A3A', '#6E6E6E',
    '#7A3B12', '#A85C2E', '#4A4A6A', '#5C3D5C', '#2E6B5C'
  ];

  // ---------- date helpers ----------
  function toISO(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function parseISO(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function todayDate() {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }
  const WEEKDAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  function dayInfoFor(iso) {
    return dayCycle[iso] || null;
  }

  function subjectColor(name) {
    if (!name) return '#4B564F';
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    return SUBJECT_PALETTE[hash % SUBJECT_PALETTE.length];
  }

  function distinctSubjects() {
    const set = new Set();
    Object.values(schedule).forEach(periods => {
      periods.forEach(p => { if (p.subject && !p.isBreak) set.add(p.subject); });
    });
    return Array.from(set).sort();
  }

  // ---------- toast ----------
  let toastTimer;
  function showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  // ---------- login ----------
  function showLogin() {
    document.getElementById('screen-login').style.display = 'flex';
    document.getElementById('tabbar').style.display = 'none';
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  }
  function hideLogin() {
    document.getElementById('screen-login').style.display = 'none';
    document.getElementById('tabbar').style.display = 'flex';
  }

  async function attemptLogin() {
    const input = document.getElementById('passcode-input');
    const errEl = document.getElementById('login-error');
    const passcode = input.value.trim();
    if (!passcode) return;
    errEl.textContent = '';
    const btn = document.getElementById('login-btn');
    btn.disabled = true;
    btn.textContent = 'Checking…';
    try {
      const res = await Api.login(passcode);
      if (res.ok) {
        Api.setToken(res.token);
        hideLogin();
        await bootstrapApp();
      } else {
        errEl.textContent = res.error || 'Incorrect passcode';
        input.value = '';
        input.focus();
      }
    } catch (e) {
      errEl.textContent = 'Could not reach the server. Check your connection.';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign in';
    }
  }

  // ---------- data loading ----------
  async function loadDayCycle() {
    try {
      const res = await fetch('data/day-cycle-2026-2027.json');
      dayCycle = await res.json();
    } catch (e) {
      dayCycle = JSON.parse(localStorage.getItem('ksa_daycycle_cache') || '{}');
    }
  }

  async function loadSchedule() {
    try {
      const res = await Api.getSchedule();
      if (res.ok) {
        schedule = res.schedule;
        localStorage.setItem('ksa_schedule_cache', JSON.stringify(schedule));
        return true;
      }
      if (res.error === 'Not signed in') { forceLogout(); return false; }
    } catch (e) { /* fall through to cache */ }
    const cached = localStorage.getItem('ksa_schedule_cache');
    if (cached) schedule = JSON.parse(cached);
    return false;
  }

  async function loadAssignments() {
    try {
      const res = await Api.getAssignments();
      if (res.ok) {
        assignments = res.assignments;
        localStorage.setItem('ksa_assignments_cache', JSON.stringify(assignments));
        return true;
      }
      if (res.error === 'Not signed in') { forceLogout(); return false; }
    } catch (e) { /* fall through to cache */ }
    const cached = localStorage.getItem('ksa_assignments_cache');
    if (cached) assignments = JSON.parse(cached);
    return false;
  }

  function forceLogout() {
    Api.clearToken();
    showLogin();
  }

  async function bootstrapApp() {
    await Promise.all([loadSchedule(), loadAssignments()]);
    renderToday();
    renderWeek();
    renderCalendar();
  }

  // ---------- Today screen ----------
  function dueStatus(dueDateStr, completed) {
    if (!dueDateStr) return { cls: '', label: '' };
    const due = parseISO(dueDateStr);
    const today = todayDate();
    const diffDays = Math.round((due - today) / 86400000);
    if (completed) return { cls: 'upcoming', label: formatFriendlyDate(due) };
    if (diffDays < 0) return { cls: 'overdue', label: `Overdue · ${formatFriendlyDate(due)}` };
    if (diffDays === 0) return { cls: 'today', label: 'Due today' };
    if (diffDays === 1) return { cls: 'upcoming', label: 'Due tomorrow' };
    return { cls: 'upcoming', label: `Due ${formatFriendlyDate(due)}` };
  }
  function formatFriendlyDate(d) {
    return MONTH_NAMES[d.getMonth()].slice(0,3) + ' ' + d.getDate();
  }

  function assignmentCardHTML(item) {
    const status = dueStatus(item.dueDate, item.completed);
    const titleLine = item.type === 'Reminder'
      ? (item.subject ? item.subject : 'Reminder')
      : item.subject;
    return `
      <div class="assignment-card ${item.completed ? 'completed' : ''}" data-id="${item.id}">
        <div class="assignment-check ${item.completed ? 'checked' : ''}" role="button" aria-label="Mark complete" data-action="toggle" data-id="${item.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M4 12l5 5L20 6"/></svg>
        </div>
        <div class="assignment-body">
          <div class="assignment-title ${item.completed ? 'completed' : ''}" style="${titleLine ? 'color:'+subjectColor(item.subject) : ''}">${escapeHtml(titleLine || 'Reminder')}</div>
          ${item.details ? `<div class="assignment-details">${escapeHtml(item.details)}</div>` : ''}
          ${item.dueDate ? `<div class="assignment-due ${status.cls}" style="margin-top:6px;display:inline-block;">${status.label}</div>` : ''}
        </div>
        <button class="delete-btn" data-action="delete" data-id="${item.id}" aria-label="Delete">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>
        </button>
      </div>`;
  }

  function periodRowHTML(p) {
    if (p.isBreak) {
      return `<li class="period-row is-break">
        <div class="period-time">${p.time}</div>
        <div class="period-card">${escapeHtml(p.period)}</div>
      </li>`;
    }
    return `<li class="period-row">
      <div class="period-time">${p.time}</div>
      <div class="period-card">
        <div class="subject-tag" style="color:${subjectColor(p.subject)}">${escapeHtml(p.subject || '—')}</div>
        <div class="period-meta">${escapeHtml(p.teacher || '')}${p.teacher && p.room ? ' · ' : ''}${escapeHtml(p.room || '')}</div>
      </div>
    </li>`;
  }

  function renderToday() {
    const today = todayDate();
    const iso = toISO(today);
    document.getElementById('today-date').textContent = WEEKDAY_NAMES[today.getDay()] + ', ' + MONTH_NAMES[today.getMonth()] + ' ' + today.getDate();

    const info = dayInfoFor(iso);
    const container = document.getElementById('today-content');
    const subdateEl = document.getElementById('today-subdate');

    let html = '';

    if (!info || !info.day) {
      const reason = info && info.noSchool ? info.noSchool : (today.getDay() === 0 || today.getDay() === 6 ? 'Weekend' : 'No school data for this date');
      subdateEl.innerHTML = '';
      html += `<div class="no-school-card">
        <div class="big">No school today</div>
        <div class="small">${escapeHtml(reason)}</div>
      </div>`;
    } else {
      subdateEl.innerHTML = `<span class="day-badge day-${info.day}">Day ${info.day}</span>${info.note ? ' · ' + escapeHtml(info.note) : ''}`;
      const periods = schedule['Day ' + info.day] || [];
      if (periods.length) {
        html += `<ul class="period-list">${periods.map(periodRowHTML).join('')}</ul>`;
      } else {
        html += `<div class="empty-note">Schedule hasn't loaded yet.</div>`;
      }
    }

    const dueToday = assignments.filter(a => a.dueDate === iso);
    const overdue = assignments.filter(a => a.dueDate && a.dueDate < iso && !a.completed);

    if (overdue.length) {
      html += `<div class="section-title">Overdue</div>` + overdue.map(assignmentCardHTML).join('');
    }
    html += `<div class="section-title">Due today</div>`;
    html += dueToday.length ? dueToday.map(assignmentCardHTML).join('') : `<div class="empty-note">Nothing due today.</div>`;

    container.innerHTML = html;
  }

  // ---------- Week screen ----------
  function renderWeek() {
    const days = ['Day 1','Day 2','Day 3','Day 4','Day 5'];
    if (!weekActiveDay) {
      const todayInfo = dayInfoFor(toISO(todayDate()));
      weekActiveDay = todayInfo && todayInfo.day ? 'Day ' + todayInfo.day : 'Day 1';
    }
    const tabsEl = document.getElementById('week-day-tabs');
    tabsEl.innerHTML = days.map((d, i) => {
      const n = i + 1;
      return `<button class="${d === weekActiveDay ? 'active day-' + n : ''}" data-day="${d}">${d}</button>`;
    }).join('');
    tabsEl.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => { weekActiveDay = btn.dataset.day; renderWeek(); });
    });

    const listEl = document.getElementById('week-period-list');
    const periods = schedule[weekActiveDay] || [];
    listEl.innerHTML = periods.length ? periods.map(periodRowHTML).join('') : `<div class="empty-note">No schedule loaded.</div>`;
  }

  // ---------- Add screen ----------
  function renderAddSubjects() {
    const chipsEl = document.getElementById('subject-chips');
    const subjects = distinctSubjects();
    if (!addSubject && subjects.length) addSubject = subjects[0];
    chipsEl.innerHTML = subjects.map(s => {
      const selected = s === addSubject;
      const color = subjectColor(s);
      return `<button class="chip ${selected ? 'selected' : ''}" style="${selected ? 'background:'+color+';border-color:'+color : ''}" data-subject="${escapeHtml(s)}">${escapeHtml(s)}</button>`;
    }).join('');
    chipsEl.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => { addSubject = chip.dataset.subject; renderAddSubjects(); });
    });
  }

  function setAddType(type) {
    addType = type;
    document.getElementById('type-assignment').classList.toggle('active', type === 'Assignment');
    document.getElementById('type-reminder').classList.toggle('active', type === 'Reminder');
    document.getElementById('subject-field').style.display = type === 'Assignment' ? 'block' : 'none';
    document.getElementById('details-label').textContent = type === 'Assignment' ? 'Assignment details' : 'Reminder';
    document.getElementById('details-input').placeholder = type === 'Assignment'
      ? 'e.g. Pages 45-46, questions 1-10'
      : 'e.g. Bring gym clothes';
  }

  async function saveEntry() {
    const details = document.getElementById('details-input').value.trim();
    const dueDate = document.getElementById('due-date-input').value;
    if (!details) { showToast("Add a few details first"); return; }
    if (!dueDate) { showToast('Pick a due date'); return; }
    const btn = document.getElementById('save-btn');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      const res = await Api.addAssignment({
        type: addType,
        subject: addType === 'Assignment' ? addSubject : '',
        details, dueDate
      });
      if (res.ok) {
        assignments.push(res.item);
        localStorage.setItem('ksa_assignments_cache', JSON.stringify(assignments));
        document.getElementById('details-input').value = '';
        document.getElementById('due-date-input').value = '';
        btn.textContent = 'Saved ✓';
        btn.classList.add('saved');
        setTimeout(() => { btn.textContent = 'Save'; btn.classList.remove('saved'); }, 1200);
        renderToday(); renderCalendar();
      } else {
        showToast(res.error || 'Could not save');
      }
    } catch (e) {
      showToast('Could not reach the server');
    } finally {
      btn.disabled = false;
    }
  }

  // ---------- Calendar screen ----------
  function renderCalendar() {
    const monthLabel = document.getElementById('cal-month-label');
    monthLabel.textContent = MONTH_NAMES[calMonth] + ' ' + calYear;

    const grid = document.getElementById('cal-grid');
    const dowRow = ['S','M','T','W','T','F','S'].map(d => `<div class="cal-dow">${d}</div>`).join('');

    const firstOfMonth = new Date(calYear, calMonth, 1);
    const startOffset = firstOfMonth.getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const todayIso = toISO(todayDate());

    let cells = '';
    for (let i = 0; i < startOffset; i++) cells += `<div class="cal-cell empty"></div>`;

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(calYear, calMonth, day);
      const iso = toISO(d);
      const info = dayInfoFor(iso);
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      const hasAssignment = assignments.some(a => a.dueDate === iso);
      let cls = 'cal-cell';
      if (isWeekend && !info) cls += ' weekend';
      else if (info && !info.day) cls += ' no-school';
      if (iso === todayIso) cls += ' today-cell';
      if (iso === calSelectedDate) cls += ' selected';

      let tag = '';
      if (info && info.day) tag = `<span class="cal-tag day-${info.day}">D${info.day}</span>`;

      cells += `<div class="${cls}" data-iso="${iso}">
        <div class="cal-daynum">${day}</div>
        ${tag}
        ${hasAssignment ? '<span class="cal-dot"></span>' : ''}
      </div>`;
    }

    grid.innerHTML = dowRow + cells;
    grid.querySelectorAll('.cal-cell[data-iso]').forEach(cell => {
      cell.addEventListener('click', () => {
        calSelectedDate = cell.dataset.iso === calSelectedDate ? null : cell.dataset.iso;
        renderCalendar();
      });
    });

    renderCalDetail();
  }

  function renderCalDetail() {
    const detailEl = document.getElementById('cal-detail');
    if (!calSelectedDate) { detailEl.style.display = 'none'; return; }
    detailEl.style.display = 'block';
    const d = parseISO(calSelectedDate);
    const info = dayInfoFor(calSelectedDate);
    let html = `<div class="heading">${WEEKDAY_NAMES[d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}</div>`;

    if (info && info.day) {
      html += `<div style="margin-bottom:10px;"><span class="day-badge day-${info.day}">Day ${info.day}</span></div>`;
      const periods = (schedule['Day ' + info.day] || []).filter(p => !p.isBreak);
      html += `<ul class="period-list">${periods.map(periodRowHTML).join('')}</ul>`;
    } else {
      const reason = info && info.noSchool ? info.noSchool : 'Weekend';
      html += `<div class="empty-note">No school — ${escapeHtml(reason)}</div>`;
    }

    const due = assignments.filter(a => a.dueDate === calSelectedDate);
    if (due.length) {
      html += `<div class="section-title">Due this day</div>` + due.map(assignmentCardHTML).join('');
    }
    detailEl.innerHTML = html;
  }

  // ---------- shared: assignment card actions (event delegation) ----------
  document.addEventListener('click', async (e) => {
    const toggle = e.target.closest('[data-action="toggle"]');
    const del = e.target.closest('[data-action="delete"]');
    if (toggle) {
      const id = toggle.dataset.id;
      const item = assignments.find(a => a.id === id);
      if (!item) return;
      item.completed = !item.completed;
      renderToday(); renderCalendar();
      try { await Api.updateAssignment({ id, completed: item.completed }); }
      catch (err) { /* optimistic update stands even if sync fails */ }
      localStorage.setItem('ksa_assignments_cache', JSON.stringify(assignments));
    }
    if (del) {
      const id = del.dataset.id;
      assignments = assignments.filter(a => a.id !== id);
      renderToday(); renderCalendar();
      localStorage.setItem('ksa_assignments_cache', JSON.stringify(assignments));
      try { await Api.deleteAssignment(id); }
      catch (err) { showToast('Delete may not have synced'); }
    }
  });

  // ---------- utils ----------
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // ---------- navigation ----------
  function switchScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + name));
    document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.screen === name));
    if (name === 'add') renderAddSubjects();
  }

  // ---------- init ----------
  async function init() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('service-worker.js').catch(() => {});
    }

    const now = todayDate();
    calYear = now.getFullYear();
    calMonth = now.getMonth();

    document.getElementById('login-btn').addEventListener('click', attemptLogin);
    document.getElementById('passcode-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') attemptLogin(); });
    document.getElementById('refresh-btn').addEventListener('click', async () => {
      await Promise.all([loadSchedule(), loadAssignments()]);
      renderToday(); renderWeek(); renderCalendar();
      showToast('Refreshed');
    });
    document.getElementById('type-assignment').addEventListener('click', () => setAddType('Assignment'));
    document.getElementById('type-reminder').addEventListener('click', () => setAddType('Reminder'));
    document.getElementById('save-btn').addEventListener('click', saveEntry);
    document.getElementById('cal-prev').addEventListener('click', () => { calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } renderCalendar(); });
    document.getElementById('cal-next').addEventListener('click', () => { calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } renderCalendar(); });
    document.querySelectorAll('.tabbar button').forEach(btn => {
      btn.addEventListener('click', () => switchScreen(btn.dataset.screen));
    });

    await loadDayCycle();

    if (Api.getToken()) {
      hideLogin();
      switchScreen('today');
      await bootstrapApp();
    } else {
      showLogin();
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
