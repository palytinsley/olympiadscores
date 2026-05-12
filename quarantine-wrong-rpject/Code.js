// LOCAL TEST
const CONFIG = {
  // Paste your Google Sheet ID here, or leave blank if this script is bound to the Sheet.
  SPREADSHEET_ID: '1aQJZ3BXP3U02JJSQRu38y3aVusHMhgqbGLwz_urCyak',
  SHEETS: {
    GROUPS: 'Group Scores',
    STUDENTS: 'Student Grading'
  },
  STATUS: {
    UNGRADED: 'Ungraded',
    IN_PROGRESS: 'In Progress',
    COMPLETE: 'Complete'
  },
  GROUP_HEADERS: {
    GROUP_ID: 'Group ID',
    COUNTRY: 'Country',
    PERIOD: 'Period',
    STUDENT_COUNT: 'Student Count',
    SLIDE_DESIGN: 'Slide Design & Visual Storytelling',
    GROUP_COMMENT: 'Group Comment',
    STATUS: 'Group Status',
    LAST_SAVED_BY: 'Last Saved By',
    LAST_SAVED_AT: 'Last Saved At'
  },
  STUDENT_HEADERS: {
    NAME: 'Student Name',
    PERIOD: 'Period',
    COUNTRY: 'Country',
    GROUP_ID: 'Group ID',
    SLIDE_LINK: 'Slide Link',
    HISTORICAL_CONTEXT: 'Historical Accuracy & Context',
    PRESENTATION_SKILLS: 'Presentation Skills',
    HISTORICAL_COMMENT: 'Historical Comment',
    PRESENTATION_COMMENT: 'Presentation Comment',
    COMMENT: 'Individual Comment',
    FINAL_COMMENT: 'Final Comment',
    TOTAL: 'Total Score',
    STATUS: 'Student Status',
    LAST_SAVED_BY: 'Last Saved By',
    LAST_SAVED_AT: 'Last Saved At'
  }
};

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Presentation Grader')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getAppData(periodFilter) {
  try {
    const data = readWorkbook_();
    const groups = buildGroups_(data, periodFilter);
    return {
      ok: true,
      groups,
      summary: summarizeProgress_(groups),
      spreadsheetUrl: data.ss.getUrl(),
      userEmail: getUserEmail_(),
      generatedAt: new Date().toISOString()
    };
  } catch (err) {
    logError_('getAppData', err);
    return errorResponse_(err);
  }
}

function getGroups(periodFilter) {
  const response = getAppData(periodFilter);
  if (!response.ok) return response;
  return {
    ok: true,
    groups: response.groups,
    summary: response.summary
  };
}

function getGroupDetails(groupId) {
  try {
    if (!groupId) throw new Error('Missing group ID.');
    const data = readWorkbook_();
    const details = buildGroupDetails_(data, String(groupId));
    return { ok: true, group: details };
  } catch (err) {
    logError_('getGroupDetails', err, { groupId });
    return errorResponse_(err);
  }
}

function saveGroupScores(payload) {
  const lock = getWriteLock_();
  try {
    lock.waitLock(10000);
    payload = payload || {};
    if (!payload.groupId) throw new Error('Missing group ID for group score save.');

    const ss = getSpreadsheet_();
    const groupsSheet = getRequiredSheet_(ss, CONFIG.SHEETS.GROUPS);
    const studentsSheet = getRequiredSheet_(ss, CONFIG.SHEETS.STUDENTS);
    const groupTable = readSheetTable_(groupsSheet);
    const studentTable = readSheetTable_(studentsSheet);
    requireHeaders_(groupTable.headers, Object.values(CONFIG.GROUP_HEADERS), CONFIG.SHEETS.GROUPS);
    requireHeaders_(studentTable.headers, Object.values(CONFIG.STUDENT_HEADERS), CONFIG.SHEETS.STUDENTS);

    const row = findGroupRow_(groupTable, String(payload.groupId));
    if (!row) throw new Error(`Could not find group row for Group ID "${payload.groupId}".`);

    setCell_(groupsSheet, groupTable.headerMap, row.rowNumber, CONFIG.GROUP_HEADERS.SLIDE_DESIGN, normalizeScore_(payload.slideDesignScore, 0, 6));
    if (Object.prototype.hasOwnProperty.call(payload, 'groupComment')) {
      setCell_(groupsSheet, groupTable.headerMap, row.rowNumber, CONFIG.GROUP_HEADERS.GROUP_COMMENT, payload.groupComment || '');
    }
    setCell_(groupsSheet, groupTable.headerMap, row.rowNumber, CONFIG.GROUP_HEADERS.LAST_SAVED_BY, getUserEmail_());
    setCell_(groupsSheet, groupTable.headerMap, row.rowNumber, CONFIG.GROUP_HEADERS.LAST_SAVED_AT, new Date());

    const freshGroupTable = readSheetTable_(groupsSheet);
    const freshStudentTable = readSheetTable_(studentsSheet);
    recomputeStudentTotals_(studentsSheet, freshStudentTable, freshGroupTable, String(payload.groupId));
    recomputeFinalCommentsForGroup_(studentsSheet, freshStudentTable, freshGroupTable, String(payload.groupId));
    updateGroupStatus_(groupsSheet, freshGroupTable, readSheetTable_(studentsSheet), String(payload.groupId));

    return {
      ok: true,
      savedAt: new Date().toISOString(),
      group: buildGroupDetails_(readWorkbook_(), String(payload.groupId))
    };
  } catch (err) {
    logError_('saveGroupScores', err, payload);
    return errorResponse_(err);
  } finally {
    try {
      lock.releaseLock();
    } catch (e) {
      // Ignore release errors when lock was not acquired.
    }
  }
}

function saveStudentGrade(payload) {
  const lock = getWriteLock_();
  try {
    lock.waitLock(10000);
    payload = payload || {};
    if (!payload.groupId) throw new Error('Missing group ID for student grade save.');
    if (!payload.rowNumber) throw new Error('Missing student row number for grade save.');

    const ss = getSpreadsheet_();
    const groupsSheet = getRequiredSheet_(ss, CONFIG.SHEETS.GROUPS);
    const studentsSheet = getRequiredSheet_(ss, CONFIG.SHEETS.STUDENTS);
    const groupTable = readSheetTable_(groupsSheet);
    const studentTable = readSheetTable_(studentsSheet);
    requireHeaders_(groupTable.headers, Object.values(CONFIG.GROUP_HEADERS), CONFIG.SHEETS.GROUPS);
    requireHeaders_(studentTable.headers, Object.values(CONFIG.STUDENT_HEADERS), CONFIG.SHEETS.STUDENTS);

    const rowNumber = Number(payload.rowNumber);
    const row = studentTable.rows.find(r => r.rowNumber === rowNumber);
    if (!row) throw new Error(`Could not find student row ${payload.rowNumber}.`);
    if (String(getValue_(row, studentTable.headerMap, CONFIG.STUDENT_HEADERS.GROUP_ID)) !== String(payload.groupId)) {
      throw new Error('Student row does not belong to the selected group.');
    }

    setCell_(studentsSheet, studentTable.headerMap, rowNumber, CONFIG.STUDENT_HEADERS.HISTORICAL_CONTEXT, normalizeScore_(payload.historicalContextScore, 0, 3));
    setCell_(studentsSheet, studentTable.headerMap, rowNumber, CONFIG.STUDENT_HEADERS.PRESENTATION_SKILLS, normalizeScore_(payload.presentationSkillsScore, 0, 6));
    setCell_(studentsSheet, studentTable.headerMap, rowNumber, CONFIG.STUDENT_HEADERS.HISTORICAL_COMMENT, payload.historicalComment || '');
    setCell_(studentsSheet, studentTable.headerMap, rowNumber, CONFIG.STUDENT_HEADERS.PRESENTATION_COMMENT, payload.presentationComment || '');
    setCell_(studentsSheet, studentTable.headerMap, rowNumber, CONFIG.STUDENT_HEADERS.LAST_SAVED_BY, getUserEmail_());
    setCell_(studentsSheet, studentTable.headerMap, rowNumber, CONFIG.STUDENT_HEADERS.LAST_SAVED_AT, new Date());

    const freshStudentTable = readSheetTable_(studentsSheet);
    recomputeStudentTotals_(studentsSheet, freshStudentTable, groupTable, String(payload.groupId));
    recomputeFinalCommentForStudent_(studentsSheet, readSheetTable_(studentsSheet), groupTable, rowNumber);
    updateGroupStatus_(groupsSheet, groupTable, readSheetTable_(studentsSheet), String(payload.groupId));

    return {
      ok: true,
      savedAt: new Date().toISOString(),
      group: buildGroupDetails_(readWorkbook_(), String(payload.groupId))
    };
  } catch (err) {
    logError_('saveStudentGrade', err, payload);
    return errorResponse_(err);
  } finally {
    try {
      lock.releaseLock();
    } catch (e) {
      // Ignore release errors when lock was not acquired.
    }
  }
}

function recomputeStudentTotals(groupId) {
  const lock = getWriteLock_();
  try {
    lock.waitLock(10000);
    if (!groupId) throw new Error('Missing group ID for recompute.');
    const ss = getSpreadsheet_();
    const groupsSheet = getRequiredSheet_(ss, CONFIG.SHEETS.GROUPS);
    const studentsSheet = getRequiredSheet_(ss, CONFIG.SHEETS.STUDENTS);
    const groupTable = readSheetTable_(groupsSheet);
    const studentTable = readSheetTable_(studentsSheet);
    recomputeStudentTotals_(studentsSheet, studentTable, groupTable, String(groupId));
    updateGroupStatus_(groupsSheet, groupTable, readSheetTable_(studentsSheet), String(groupId));
    return { ok: true, group: buildGroupDetails_(readWorkbook_(), String(groupId)) };
  } catch (err) {
    logError_('recomputeStudentTotals', err, { groupId });
    return errorResponse_(err);
  } finally {
    try {
      lock.releaseLock();
    } catch (e) {
      // Ignore release errors when lock was not acquired.
    }
  }
}

function getProgressSummary() {
  try {
    const data = readWorkbook_();
    return { ok: true, summary: summarizeProgress_(buildGroups_(data, 'All')) };
  } catch (err) {
    logError_('getProgressSummary', err);
    return errorResponse_(err);
  }
}

function getSchoologyData() {
  try {
    const data = readWorkbook_();
    return {
      ok: true,
      periods: buildSchoologyPeriods_(data),
      spreadsheetUrl: data.ss.getUrl(),
      generatedAt: new Date().toISOString()
    };
  } catch (err) {
    logError_('getSchoologyData', err);
    return errorResponse_(err);
  }
}

function readWorkbook_() {
  const ss = getSpreadsheet_();
  const groupsSheet = getRequiredSheet_(ss, CONFIG.SHEETS.GROUPS);
  const studentsSheet = getRequiredSheet_(ss, CONFIG.SHEETS.STUDENTS);
  const groupTable = readSheetTable_(groupsSheet);
  const studentTable = readSheetTable_(studentsSheet);
  requireHeaders_(groupTable.headers, Object.values(CONFIG.GROUP_HEADERS), CONFIG.SHEETS.GROUPS);
  requireHeaders_(studentTable.headers, Object.values(CONFIG.STUDENT_HEADERS), CONFIG.SHEETS.STUDENTS);
  return { ss, groupTable, studentTable };
}

function getSpreadsheet_() {
  const id = CONFIG.SPREADSHEET_ID;
  if (id && id !== 'PASTE_SPREADSHEET_ID_HERE') {
    return SpreadsheetApp.openById(id);
  }
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) throw new Error('No spreadsheet is connected. Paste the spreadsheet ID into CONFIG.SPREADSHEET_ID in Code.gs.');
  return active;
}

function getRequiredSheet_(ss, name) {
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error(`Missing required sheet tab: "${name}".`);
  return sheet;
}

function getWriteLock_() {
  return LockService.getDocumentLock() || LockService.getScriptLock();
}

function readSheetTable_(sheet) {
  const range = sheet.getDataRange();
  const values = range.getValues();
  if (!values.length || values[0].every(v => v === '')) {
    throw new Error(`Sheet "${sheet.getName()}" has no header row.`);
  }
  const headers = values[0].map(h => String(h).trim());
  const headerMap = headers.reduce((map, header, index) => {
    if (header) map[header] = index + 1;
    return map;
  }, {});
  const rows = values.slice(1)
    .map((valuesRow, index) => ({ rowNumber: index + 2, values: valuesRow }))
    .filter(row => row.values.some(value => value !== ''));
  return { sheetName: sheet.getName(), headers, headerMap, rows };
}

function requireHeaders_(actualHeaders, requiredHeaders, sheetName) {
  const actual = new Set(actualHeaders);
  const missing = requiredHeaders.filter(header => !actual.has(header));
  if (missing.length) {
    throw new Error(`Sheet "${sheetName}" is missing required header(s): ${missing.join(', ')}.`);
  }
}

function buildGroups_(data, periodFilter) {
  const filter = normalizePeriodFilter_(periodFilter);
  const groups = data.groupTable.rows.map(row => buildGroupSummary_(row, data.groupTable, data.studentTable));
  return groups
    .filter(group => filter === 'All' || normalizePeriodFilter_(group.period) === filter)
    .sort((a, b) => {
      const periodCompare = String(a.period).localeCompare(String(b.period), undefined, { numeric: true });
      return periodCompare || String(a.country).localeCompare(String(b.country));
    });
}

function buildGroupDetails_(data, groupId) {
  const groupRow = findGroupRow_(data.groupTable, groupId);
  if (!groupRow) throw new Error(`Could not find group row for Group ID "${groupId}".`);

  const summary = buildGroupSummary_(groupRow, data.groupTable, data.studentTable);
  const students = data.studentTable.rows
    .filter(row => String(getValue_(row, data.studentTable.headerMap, CONFIG.STUDENT_HEADERS.GROUP_ID)) === groupId)
    .map(row => buildStudent_(row, data.studentTable, summary))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    ...summary,
    students,
    slideLinks: unique_(students.map(student => student.slideLink).filter(Boolean))
  };
}

function buildGroupSummary_(row, groupTable, studentTable) {
  const groupId = String(getValue_(row, groupTable.headerMap, CONFIG.GROUP_HEADERS.GROUP_ID));
  const slideDesignScore = scoreOrBlank_(getValue_(row, groupTable.headerMap, CONFIG.GROUP_HEADERS.SLIDE_DESIGN));
  const groupComment = stringOrBlank_(getValue_(row, groupTable.headerMap, CONFIG.GROUP_HEADERS.GROUP_COMMENT));
  const studentRows = studentTable.rows.filter(studentRow =>
    String(getValue_(studentRow, studentTable.headerMap, CONFIG.STUDENT_HEADERS.GROUP_ID)) === groupId
  );
  const students = studentRows.map(studentRow => buildStudent_(studentRow, studentTable, { slideDesignScore, groupComment }));
  const groupRubricStatus = rubricStatus_([slideDesignScore]);
  const studentStatuses = students.map(student => student.status);
  const status = computeGroupStatus_(groupRubricStatus, studentStatuses, students.length);

  return {
    groupId,
    country: stringOrBlank_(getValue_(row, groupTable.headerMap, CONFIG.GROUP_HEADERS.COUNTRY)),
    period: stringOrBlank_(getValue_(row, groupTable.headerMap, CONFIG.GROUP_HEADERS.PERIOD)),
    studentCount: Number(getValue_(row, groupTable.headerMap, CONFIG.GROUP_HEADERS.STUDENT_COUNT)) || students.length,
    slideDesignScore,
    groupComment,
    status,
    groupRubricStatus,
    lastSavedBy: stringOrBlank_(getValue_(row, groupTable.headerMap, CONFIG.GROUP_HEADERS.LAST_SAVED_BY)),
    lastSavedAt: dateToIso_(getValue_(row, groupTable.headerMap, CONFIG.GROUP_HEADERS.LAST_SAVED_AT))
  };
}

function buildStudent_(row, studentTable, groupScores) {
  const historicalContextScore = scoreOrBlank_(getValue_(row, studentTable.headerMap, CONFIG.STUDENT_HEADERS.HISTORICAL_CONTEXT));
  const presentationSkillsScore = scoreOrBlank_(getValue_(row, studentTable.headerMap, CONFIG.STUDENT_HEADERS.PRESENTATION_SKILLS));
  const historicalComment = stringOrBlank_(getValue_(row, studentTable.headerMap, CONFIG.STUDENT_HEADERS.HISTORICAL_COMMENT));
  const presentationComment = stringOrBlank_(getValue_(row, studentTable.headerMap, CONFIG.STUDENT_HEADERS.PRESENTATION_COMMENT));
  const total = computeTotal_(groupScores.slideDesignScore, historicalContextScore, presentationSkillsScore);
  return {
    rowNumber: row.rowNumber,
    name: stringOrBlank_(getValue_(row, studentTable.headerMap, CONFIG.STUDENT_HEADERS.NAME)),
    period: stringOrBlank_(getValue_(row, studentTable.headerMap, CONFIG.STUDENT_HEADERS.PERIOD)),
    country: stringOrBlank_(getValue_(row, studentTable.headerMap, CONFIG.STUDENT_HEADERS.COUNTRY)),
    groupId: stringOrBlank_(getValue_(row, studentTable.headerMap, CONFIG.STUDENT_HEADERS.GROUP_ID)),
    slideLink: stringOrBlank_(getValue_(row, studentTable.headerMap, CONFIG.STUDENT_HEADERS.SLIDE_LINK)),
    historicalContextScore,
    presentationSkillsScore,
    historicalComment,
    presentationComment,
    finalComment: stringOrBlank_(getValue_(row, studentTable.headerMap, CONFIG.STUDENT_HEADERS.FINAL_COMMENT)),
    totalScore: total,
    status: rubricStatus_([groupScores.slideDesignScore, historicalContextScore, presentationSkillsScore]),
    lastSavedBy: stringOrBlank_(getValue_(row, studentTable.headerMap, CONFIG.STUDENT_HEADERS.LAST_SAVED_BY)),
    lastSavedAt: dateToIso_(getValue_(row, studentTable.headerMap, CONFIG.STUDENT_HEADERS.LAST_SAVED_AT))
  };
}

function buildSchoologyPeriods_(data) {
  const groupScoresById = data.groupTable.rows.reduce((map, row) => {
    const groupId = String(getValue_(row, data.groupTable.headerMap, CONFIG.GROUP_HEADERS.GROUP_ID));
    map[groupId] = {
      slideDesignScore: scoreOrBlank_(getValue_(row, data.groupTable.headerMap, CONFIG.GROUP_HEADERS.SLIDE_DESIGN)),
      groupComment: stringOrBlank_(getValue_(row, data.groupTable.headerMap, CONFIG.GROUP_HEADERS.GROUP_COMMENT))
    };
    return map;
  }, {});

  const periods = {
    '5': [],
    '6': []
  };

  data.studentTable.rows.forEach(row => {
    const groupId = String(getValue_(row, data.studentTable.headerMap, CONFIG.STUDENT_HEADERS.GROUP_ID));
    const student = buildStudent_(row, data.studentTable, groupScoresById[groupId] || { slideDesignScore: '', groupComment: '' });
    const periodKey = normalizePeriodFilter_(student.period);
    if (!periods[periodKey]) return;
    periods[periodKey].push({
      name: student.name,
      totalScore: student.totalScore,
      finalComment: student.finalComment
    });
  });

  return ['5', '6'].map(period => ({
    period,
    label: `Period ${period}`,
    students: periods[period].sort(compareStudentsByLastName_)
  }));
}

function compareStudentsByLastName_(a, b) {
  const lastCompare = lastNameKey_(a.name).localeCompare(lastNameKey_(b.name), undefined, { sensitivity: 'base' });
  return lastCompare || String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' });
}

function lastNameKey_(name) {
  const parts = stringOrBlank_(name).trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

function recomputeStudentTotals_(studentsSheet, studentTable, groupTable, groupId) {
  const groupRow = findGroupRow_(groupTable, groupId);
  if (!groupRow) throw new Error(`Cannot recompute totals; group "${groupId}" was not found.`);
  const slideDesign = scoreOrBlank_(getValue_(groupRow, groupTable.headerMap, CONFIG.GROUP_HEADERS.SLIDE_DESIGN));

  studentTable.rows
    .filter(row => String(getValue_(row, studentTable.headerMap, CONFIG.STUDENT_HEADERS.GROUP_ID)) === groupId)
    .forEach(row => {
      const historicalContext = scoreOrBlank_(getValue_(row, studentTable.headerMap, CONFIG.STUDENT_HEADERS.HISTORICAL_CONTEXT));
      const presentationSkills = scoreOrBlank_(getValue_(row, studentTable.headerMap, CONFIG.STUDENT_HEADERS.PRESENTATION_SKILLS));
      const total = computeTotal_(slideDesign, historicalContext, presentationSkills);
      const status = rubricStatus_([slideDesign, historicalContext, presentationSkills]);
      setCell_(studentsSheet, studentTable.headerMap, row.rowNumber, CONFIG.STUDENT_HEADERS.TOTAL, total === '' ? '' : total);
      setCell_(studentsSheet, studentTable.headerMap, row.rowNumber, CONFIG.STUDENT_HEADERS.STATUS, status);
    });
}

function recomputeFinalCommentsForGroup_(studentsSheet, studentTable, groupTable, groupId) {
  const groupRow = findGroupRow_(groupTable, groupId);
  if (!groupRow) throw new Error(`Cannot recompute final comments; group "${groupId}" was not found.`);
  const groupComment = stringOrBlank_(getValue_(groupRow, groupTable.headerMap, CONFIG.GROUP_HEADERS.GROUP_COMMENT));

  studentTable.rows
    .filter(row => String(getValue_(row, studentTable.headerMap, CONFIG.STUDENT_HEADERS.GROUP_ID)) === groupId)
    .forEach(row => {
      const historicalComment = stringOrBlank_(getValue_(row, studentTable.headerMap, CONFIG.STUDENT_HEADERS.HISTORICAL_COMMENT));
      const presentationComment = stringOrBlank_(getValue_(row, studentTable.headerMap, CONFIG.STUDENT_HEADERS.PRESENTATION_COMMENT));
      setCell_(studentsSheet, studentTable.headerMap, row.rowNumber, CONFIG.STUDENT_HEADERS.FINAL_COMMENT, buildFinalComment_(groupComment, historicalComment, presentationComment));
    });
}

function recomputeFinalCommentForStudent_(studentsSheet, studentTable, groupTable, rowNumber) {
  const row = studentTable.rows.find(studentRow => studentRow.rowNumber === rowNumber);
  if (!row) throw new Error(`Cannot recompute final comment; student row ${rowNumber} was not found.`);
  const groupId = String(getValue_(row, studentTable.headerMap, CONFIG.STUDENT_HEADERS.GROUP_ID));
  const groupRow = findGroupRow_(groupTable, groupId);
  if (!groupRow) throw new Error(`Cannot recompute final comment; group "${groupId}" was not found.`);

  const groupComment = stringOrBlank_(getValue_(groupRow, groupTable.headerMap, CONFIG.GROUP_HEADERS.GROUP_COMMENT));
  const historicalComment = stringOrBlank_(getValue_(row, studentTable.headerMap, CONFIG.STUDENT_HEADERS.HISTORICAL_COMMENT));
  const presentationComment = stringOrBlank_(getValue_(row, studentTable.headerMap, CONFIG.STUDENT_HEADERS.PRESENTATION_COMMENT));
  setCell_(studentsSheet, studentTable.headerMap, rowNumber, CONFIG.STUDENT_HEADERS.FINAL_COMMENT, buildFinalComment_(groupComment, historicalComment, presentationComment));
}

function buildFinalComment_(groupComment, historicalComment, presentationComment) {
  const sections = [
    { heading: 'Shared feedback:', text: groupComment },
    { heading: 'Historical accuracy & context:', text: historicalComment },
    { heading: 'Presentation skills:', text: presentationComment }
  ];

  return sections
    .map(section => ({ heading: section.heading, text: stringOrBlank_(section.text).trim() }))
    .filter(section => section.text)
    .map(section => `${section.heading}\n${section.text}`)
    .join('\n\n');
}

function updateGroupStatus_(groupsSheet, groupTable, studentTable, groupId) {
  const groupRow = findGroupRow_(groupTable, groupId);
  if (!groupRow) throw new Error(`Cannot update group status; group "${groupId}" was not found.`);
  const summary = buildGroupSummary_(groupRow, groupTable, studentTable);
  setCell_(groupsSheet, groupTable.headerMap, groupRow.rowNumber, CONFIG.GROUP_HEADERS.STATUS, summary.status);
}

function findGroupRow_(groupTable, groupId) {
  return groupTable.rows.find(row =>
    String(getValue_(row, groupTable.headerMap, CONFIG.GROUP_HEADERS.GROUP_ID)) === String(groupId)
  );
}

function getValue_(row, headerMap, header) {
  const column = headerMap[header];
  return column ? row.values[column - 1] : '';
}

function setCell_(sheet, headerMap, rowNumber, header, value) {
  const column = headerMap[header];
  if (!column) throw new Error(`Missing header "${header}" on sheet "${sheet.getName()}".`);
  sheet.getRange(rowNumber, column).setValue(value);
}

function normalizeScore_(value, min, max) {
  if (value === '' || value === null || typeof value === 'undefined') return '';
  const number = Number(value);
  if (Number.isNaN(number)) throw new Error(`Score "${value}" is not a number.`);
  if (number < min || number > max) throw new Error(`Score ${number} is outside the allowed range ${min}-${max}.`);
  return number;
}

function scoreOrBlank_(value) {
  if (value === '' || value === null || typeof value === 'undefined') return '';
  const number = Number(value);
  return Number.isNaN(number) ? '' : number;
}

function computeTotal_(slideDesign, historicalContext, presentationSkills) {
  if ([slideDesign, historicalContext, presentationSkills].some(value => value === '')) return '';
  return Number(slideDesign) + Number(historicalContext) + Number(presentationSkills);
}

function rubricStatus_(scores) {
  const filled = scores.filter(value => value !== '' && value !== null && typeof value !== 'undefined').length;
  if (filled === 0) return CONFIG.STATUS.UNGRADED;
  if (filled === scores.length) return CONFIG.STATUS.COMPLETE;
  return CONFIG.STATUS.IN_PROGRESS;
}

function computeGroupStatus_(groupRubricStatus, studentStatuses, studentCount) {
  if (groupRubricStatus === CONFIG.STATUS.COMPLETE && studentCount > 0 && studentStatuses.every(status => status === CONFIG.STATUS.COMPLETE)) {
    return CONFIG.STATUS.COMPLETE;
  }
  const hasGroupWork = groupRubricStatus !== CONFIG.STATUS.UNGRADED;
  const hasStudentWork = studentStatuses.some(status => status !== CONFIG.STATUS.UNGRADED);
  if (!hasGroupWork && !hasStudentWork) return CONFIG.STATUS.UNGRADED;
  return CONFIG.STATUS.IN_PROGRESS;
}

function summarizeProgress_(groups) {
  return groups.reduce((summary, group) => {
    summary.total += 1;
    if (group.status === CONFIG.STATUS.COMPLETE) summary.complete += 1;
    else if (group.status === CONFIG.STATUS.IN_PROGRESS) summary.inProgress += 1;
    else summary.ungraded += 1;
    return summary;
  }, { total: 0, complete: 0, inProgress: 0, ungraded: 0 });
}

function normalizePeriodFilter_(periodFilter) {
  if (!periodFilter || periodFilter === 'All') return 'All';
  return String(periodFilter).replace(/^P(?:eriod)?\s*/i, '').trim();
}

function stringOrBlank_(value) {
  return value === null || typeof value === 'undefined' ? '' : String(value);
}

function dateToIso_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  return String(value);
}

function unique_(values) {
  return [...new Set(values)];
}

function getUserEmail_() {
  return Session.getActiveUser().getEmail() || 'Unknown user';
}

function logError_(where, err, context) {
  console.error(JSON.stringify({
    where,
    message: err && err.message ? err.message : String(err),
    stack: err && err.stack ? err.stack : '',
    context: context || {}
  }));
}

function errorResponse_(err) {
  return {
    ok: false,
    message: err && err.message ? err.message : String(err)
  };
}
