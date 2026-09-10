/**
 * Katelyn's School Assistant — backend
 * ------------------------------------
 * This script runs bound to the schedule Google Sheet (Extensions > Apps
 * Script from within the sheet). It is never committed to the public
 * GitHub repo — it lives only in Google's servers under your account,
 * which is what keeps the passcode and sheet-editing power private even
 * though the frontend code is public.
 *
 * ONE-TIME SETUP (do this after pasting this file in):
 *   1. In the function dropdown at the top of the Apps Script editor,
 *      select "setPasscode", click Run, and check the Execution log for
 *      confirmation. This only needs to be done once. Feel free to
 *      change PASSCODE_TO_SET below to whatever you and Katelyn agree on
 *      first — the plain text is never stored, only its hash.
 *   2. Deploy > New deployment > type "Web app".
 *        - Execute as: Me
 *        - Who has access: Anyone
 *      Click Deploy, authorize it (it's your own script, so this is a
 *      one-time consent to yourself, not a third-party app), and copy
 *      the resulting /exec URL into the frontend's config.js.
 *   3. Whenever you edit this file afterward, use Deploy > Manage
 *      deployments > edit (pencil) > New version, so the live URL picks
 *      up your changes — creating a fresh deployment gives a new URL.
 */

// ---- one-time passcode setup -----------------------------------------
const PASSCODE_TO_SET = '1234'; // change this, then run setPasscode() once

function setPasscode() {
  const hash = hashString_(PASSCODE_TO_SET);
  PropertiesService.getScriptProperties().setProperty('PASSCODE_HASH', hash);
  Logger.log('Passcode saved. You can now deploy the web app.');
}

// ---- config -------------------------------------------------------------
const ASSIGNMENTS_SHEET_NAME = 'Assignments';
const ASSIGNMENTS_HEADERS = ['ID', 'Type', 'Subject', 'Details', 'DueDate', 'CreatedAt', 'Completed'];

// ---- web app entry points -------------------------------------------
function doGet(e) {
  try {
    const action = e.parameter.action;
    const token = e.parameter.token;

    if (action === 'getSchedule') {
      requireAuth_(token);
      return jsonOut_({ ok: true, schedule: readSchedule_() });
    }
    if (action === 'getAssignments') {
      requireAuth_(token);
      return jsonOut_({ ok: true, assignments: readAssignments_() });
    }
    return jsonOut_({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;

    if (action === 'login') {
      const hash = hashString_(body.passcode || '');
      const stored = PropertiesService.getScriptProperties().getProperty('PASSCODE_HASH');
      if (stored && hash === stored) {
        return jsonOut_({ ok: true, token: hash });
      }
      return jsonOut_({ ok: false, error: 'Incorrect passcode' });
    }

    requireAuth_(body.token);

    if (action === 'addAssignment') {
      const item = addAssignment_(body);
      return jsonOut_({ ok: true, item: item });
    }
    if (action === 'updateAssignment') {
      updateAssignment_(body);
      return jsonOut_({ ok: true });
    }
    if (action === 'deleteAssignment') {
      deleteAssignment_(body.id);
      return jsonOut_({ ok: true });
    }
    return jsonOut_({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}

// ---- auth helpers -------------------------------------------------------
function requireAuth_(token) {
  const stored = PropertiesService.getScriptProperties().getProperty('PASSCODE_HASH');
  if (!token || !stored || token !== stored) {
    throw new Error('Not signed in');
  }
}

function hashString_(s) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
  return bytes.map(function (b) {
    return ('0' + (b < 0 ? b + 256 : b).toString(16)).slice(-2);
  }).join('');
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---- schedule reading -----------------------------------------------
// Reads the FIRST tab in the spreadsheet, in the exact layout of the
// existing schedule: row 1 = ",Day 1,Day 2,Day 3,Day 4,Day 5", then one
// row per period with column A = "Period 1\n9:10-9:40" (or "Recess\n..."
// / "Lunch\n...") and each day column = "Subject\nTeacher\nRoom" (blank
// for recess/lunch).
function readSchedule_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  const values = sheet.getDataRange().getValues();
  const header = values[0];
  const dayNames = header.slice(1).filter(function (h) { return h; }); // ["Day 1", ... "Day 5"]

  const schedule = {};
  dayNames.forEach(function (d) { schedule[d] = []; });

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const colA = String(row[0] || '');
    const parts = colA.split('\n');
    const label = parts[0] || '';
    const time = parts[1] || '';
    const isBreak = /^(Recess|Lunch)/i.test(label);

    for (let c = 0; c < dayNames.length; c++) {
      const cell = String(row[c + 1] || '');
      const cellParts = cell.split('\n');
      schedule[dayNames[c]].push({
        period: label,
        time: time,
        isBreak: isBreak,
        subject: cellParts[0] || '',
        teacher: cellParts[1] || '',
        room: cellParts[2] || ''
      });
    }
  }
  return schedule;
}

// ---- assignments CRUD -------------------------------------------------
function getOrCreateAssignmentsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(ASSIGNMENTS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(ASSIGNMENTS_SHEET_NAME);
    sheet.appendRow(ASSIGNMENTS_HEADERS);
  }
  return sheet;
}

function readAssignments_() {
  const sheet = getOrCreateAssignmentsSheet_();
  const values = sheet.getDataRange().getValues();
  const rows = values.slice(1);
  return rows
    .filter(function (r) { return r[0]; }) // has an ID
    .map(function (r) {
      return {
        id: r[0],
        type: r[1],
        subject: r[2],
        details: r[3],
        dueDate: r[4] instanceof Date ? formatDate_(r[4]) : r[4],
        createdAt: r[5],
        completed: r[6] === true || r[6] === 'TRUE'
      };
    });
}

function addAssignment_(body) {
  const sheet = getOrCreateAssignmentsSheet_();
  const id = Utilities.getUuid();
  const createdAt = new Date().toISOString();
  sheet.appendRow([
    id,
    body.type || 'Assignment',
    body.subject || '',
    body.details || '',
    body.dueDate || '',
    createdAt,
    false
  ]);
  return { id: id, type: body.type || 'Assignment', subject: body.subject || '', details: body.details || '', dueDate: body.dueDate || '', createdAt: createdAt, completed: false };
}

function findAssignmentRow_(sheet, id) {
  const ids = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 0), 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (ids[i][0] === id) return i + 2; // 1-indexed, +1 for header row
  }
  return -1;
}

function updateAssignment_(body) {
  const sheet = getOrCreateAssignmentsSheet_();
  const row = findAssignmentRow_(sheet, body.id);
  if (row === -1) throw new Error('Assignment not found');
  if (body.type !== undefined) sheet.getRange(row, 2).setValue(body.type);
  if (body.subject !== undefined) sheet.getRange(row, 3).setValue(body.subject);
  if (body.details !== undefined) sheet.getRange(row, 4).setValue(body.details);
  if (body.dueDate !== undefined) sheet.getRange(row, 5).setValue(body.dueDate);
  if (body.completed !== undefined) sheet.getRange(row, 7).setValue(body.completed);
}

function deleteAssignment_(id) {
  const sheet = getOrCreateAssignmentsSheet_();
  const row = findAssignmentRow_(sheet, id);
  if (row === -1) throw new Error('Assignment not found');
  sheet.deleteRow(row);
}

function formatDate_(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}
