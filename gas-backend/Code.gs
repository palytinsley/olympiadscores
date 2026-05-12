const APP_TITLE = 'SJP Olympiad Scoring';
const SPREADSHEET_TITLE = 'SJP Olympiad Scores';
const RAW_LOG_SHEET_NAME = 'RawLog';
const TOTALS_SHEET_NAME = 'Totals';
const EVENT_CONFIG_SHEET_NAME = 'Event Config';
const LOCK_WAIT_MS = 5000;

const COHORTS = [
  { key: 'cohort10', label: 'Cohort 10', shortLabel: '10', pointsColumn: 8 },
  { key: 'cohort11', label: 'Cohort 11', shortLabel: '11', pointsColumn: 9 },
  { key: 'cohort12', label: 'Cohort 12', shortLabel: '12', pointsColumn: 10 },
];

const DEFAULT_EVENT_CONFIG = {
  period5: [
    'Human Knot',
    '3-Legged Wheelbarrow',
    'Hula Hoop',
    "Tug o' War",
  ],
  period6: [
    'Multi Mini',
    'Dance Battle',
    'Balloon Toss',
    'Ice Bucket',
  ],
};

const RAW_LOG_HEADERS = [
  'Timestamp',
  'Period',
  'Station/Event',
  'Round',
  'Cohort10_Place',
  'Cohort11_Place',
  'Cohort12_Place',
  'Cohort10_Points',
  'Cohort11_Points',
  'Cohort12_Points',
  'Type (score/penalty/bonus)',
  'Note',
];

const TOTALS_HEADERS = ['Event/Station', 'Cohort 10', 'Cohort 11', 'Cohort 12'];
const EVENT_CONFIG_HEADERS = ['Period', 'Event Name', 'Sort Order', 'Active'];
const ROUND_OPTIONS = ['Round 1', 'Round 2', 'Round 3', 'Round 4'];
const PERIOD_KEYS = ['period5', 'period6'];
const PERIOD_LABELS = {
  period5: 'Period 5',
  period6: 'Period 6',
};
const PERIOD_KEYS_BY_LABEL = {
  'Period 5': 'period5',
  'Period 6': 'period6',
};

const PLACE_POINTS = {
  '1st': 10,
  '2nd': 7,
  '3rd': 3,
};

function doGet(e) {
  return handleApiRequest_({
    action: e && e.parameter ? e.parameter.action : '',
    payload: e && e.parameter && e.parameter.payload ? parseJsonPayload_(e.parameter.payload) : {},
    secret: e && e.parameter ? e.parameter.secret : '',
  });
}

function doPost(e) {
  const request = parsePostRequest_(e);
  return handleApiRequest_(request);
}

function logScore(payload) {
  const spreadsheet = ensureSpreadsheet_();
  const eventConfig = getEventConfig_(spreadsheet);
  const normalized = normalizePayload_(payload, eventConfig);
  const lock = LockService.getScriptLock();

  waitForLock_(lock, 'Another teacher may be saving right now. Please try again.');

  try {
    const rawLog = spreadsheet.getSheetByName(RAW_LOG_SHEET_NAME);
    rawLog.appendRow([
      new Date(),
      normalized.period,
      normalized.eventName,
      normalized.round,
      normalized.places.cohort10,
      normalized.places.cohort11,
      normalized.places.cohort12,
      normalized.points.cohort10,
      normalized.points.cohort11,
      normalized.points.cohort12,
      normalized.type,
      normalized.note,
    ]);
    updateTotalsSheet_(spreadsheet, eventConfig);
  } finally {
    lock.releaseLock();
  }

  const summary = buildScoreSummary_(spreadsheet, eventConfig);
  return {
    ok: true,
    message: 'Score logged',
    totals: buildTotalsResponse_(summary),
    breakdown: buildBreakdownResponse_(summary),
    entryState: buildEntryStateResponse_(summary),
    events: cloneEventConfig_(eventConfig),
    rounds: ROUND_OPTIONS.slice(),
  };
}

function getTotals() {
  const spreadsheet = ensureSpreadsheet_();
  const eventConfig = getEventConfig_(spreadsheet);
  return buildTotalsResponse_(buildScoreSummary_(spreadsheet, eventConfig));
}

function getBreakdown() {
  const spreadsheet = ensureSpreadsheet_();
  const eventConfig = getEventConfig_(spreadsheet);
  return buildBreakdownResponse_(buildScoreSummary_(spreadsheet, eventConfig));
}

function getAppData() {
  const spreadsheet = ensureSpreadsheet_();
  const eventConfig = getEventConfig_(spreadsheet);
  const summary = buildScoreSummary_(spreadsheet, eventConfig);

  return {
    totals: buildTotalsResponse_(summary),
    breakdown: buildBreakdownResponse_(summary),
    entryState: buildEntryStateResponse_(summary),
    events: cloneEventConfig_(eventConfig),
    rounds: ROUND_OPTIONS.slice(),
  };
}

function resetAllScores() {
  const spreadsheet = ensureSpreadsheet_();
  const eventConfig = getEventConfig_(spreadsheet);
  const lock = LockService.getScriptLock();

  waitForLock_(lock, 'Another teacher may be saving right now. Please try again.');

  try {
    const rawLog = ensureSheet_(spreadsheet, RAW_LOG_SHEET_NAME);
    rawLog.clearContents();
    configureRawLogSheet_(rawLog);
    updateTotalsSheet_(spreadsheet, eventConfig);
  } finally {
    lock.releaseLock();
  }

  const summary = buildScoreSummary_(spreadsheet, eventConfig);
  return {
    ok: true,
    message: 'All scores reset.',
    totals: buildTotalsResponse_(summary),
    breakdown: buildBreakdownResponse_(summary),
    entryState: buildEntryStateResponse_(summary),
    events: cloneEventConfig_(eventConfig),
    rounds: ROUND_OPTIONS.slice(),
  };
}

function saveEventConfig(config) {
  const normalizedConfig = normalizeEventConfigPayload_(config);
  const spreadsheet = ensureSpreadsheet_();
  const lock = LockService.getScriptLock();

  waitForLock_(lock, 'Another teacher may be saving event settings right now. Please try again.');

  try {
    writeEventConfig_(spreadsheet.getSheetByName(EVENT_CONFIG_SHEET_NAME), normalizedConfig);
    updateTotalsSheet_(spreadsheet, normalizedConfig);
  } finally {
    lock.releaseLock();
  }

  const summary = buildScoreSummary_(spreadsheet, normalizedConfig);
  return {
    ok: true,
    message: 'Event list saved.',
    totals: buildTotalsResponse_(summary),
    breakdown: buildBreakdownResponse_(summary),
    entryState: buildEntryStateResponse_(summary),
    events: cloneEventConfig_(normalizedConfig),
    rounds: ROUND_OPTIONS.slice(),
  };
}

function getSpreadsheetUrl() {
  return ensureSpreadsheet_().getUrl();
}

function handleApiRequest_(request) {
  try {
    validateApiSecret_(request);

    const action = String(request && request.action || '').trim();
    const payload = request && typeof request.payload === 'object' && request.payload !== null
      ? request.payload
      : {};
    let result;

    if (!action) {
      result = {
        app: APP_TITLE,
        status: 'ready',
      };
      return createJsonResponse_({
        ok: true,
        result: result,
      });
    }

    switch (action) {
      case 'getAppData':
        result = getAppData();
        break;
      case 'logScore':
        result = logScore(payload);
        break;
      case 'saveEventConfig':
        result = saveEventConfig(payload);
        break;
      case 'resetAllScores':
        result = resetAllScores();
        break;
      case 'getSpreadsheetUrl':
        result = getSpreadsheetUrl();
        break;
      default:
        throw new Error('Unknown API action.');
    }

    return createJsonResponse_({
      ok: true,
      result: result,
    });
  } catch (error) {
    return createJsonResponse_({
      ok: false,
      error: error && error.message ? error.message : 'Unknown server error.',
    });
  }
}

function resetOlympiadSheet() {
  const properties = PropertiesService.getScriptProperties();
  const spreadsheetId = properties.getProperty('SPREADSHEET_ID');

  if (spreadsheetId) {
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    resetSpreadsheet_(spreadsheet);
    return spreadsheet.getUrl();
  }

  return ensureSpreadsheet_().getUrl();
}

function ensureSpreadsheet_() {
  const properties = PropertiesService.getScriptProperties();
  let spreadsheetId = properties.getProperty('SPREADSHEET_ID');
  let spreadsheet;

  if (spreadsheetId) {
    try {
      spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    } catch (error) {
      spreadsheetId = '';
      properties.deleteProperty('SPREADSHEET_ID');
    }
  }

  if (!spreadsheetId) {
    spreadsheet = SpreadsheetApp.create(SPREADSHEET_TITLE);
    properties.setProperty('SPREADSHEET_ID', spreadsheet.getId());
  }

  bootstrapSpreadsheet_(spreadsheet);
  return spreadsheet;
}

function bootstrapSpreadsheet_(spreadsheet) {
  const rawLog = ensureSheet_(spreadsheet, RAW_LOG_SHEET_NAME);
  const totals = ensureSheet_(spreadsheet, TOTALS_SHEET_NAME);
  const eventConfig = ensureSheet_(spreadsheet, EVENT_CONFIG_SHEET_NAME);

  configureRawLogSheet_(rawLog);
  configureEventConfigSheet_(eventConfig);
  configureTotalsSheet_(totals);

  if (totals.getLastRow() < 2) {
    updateTotalsSheet_(spreadsheet, getEventConfig_(spreadsheet));
  }
}

function resetSpreadsheet_(spreadsheet) {
  const rawLog = ensureSheet_(spreadsheet, RAW_LOG_SHEET_NAME);
  const totals = ensureSheet_(spreadsheet, TOTALS_SHEET_NAME);
  const eventConfig = ensureSheet_(spreadsheet, EVENT_CONFIG_SHEET_NAME);

  rawLog.clearContents();
  totals.clearContents();
  eventConfig.clearContents();

  configureRawLogSheet_(rawLog);
  configureEventConfigSheet_(eventConfig);
  writeEventConfig_(eventConfig, DEFAULT_EVENT_CONFIG);
  updateTotalsSheet_(spreadsheet, DEFAULT_EVENT_CONFIG);
}

function ensureSheet_(spreadsheet, sheetName) {
  return spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
}

function configureRawLogSheet_(sheet) {
  if (sheet.getMaxColumns() < RAW_LOG_HEADERS.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), RAW_LOG_HEADERS.length - sheet.getMaxColumns());
  }

  if (headerNeedsUpdate_(sheet, RAW_LOG_HEADERS)) {
    sheet.getRange(1, 1, 1, RAW_LOG_HEADERS.length).setValues([RAW_LOG_HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, RAW_LOG_HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#f1f5f9');
    sheet.getRange('A:A').setNumberFormat('m/d/yyyy h:mm:ss AM/PM');
    sheet.autoResizeColumns(1, RAW_LOG_HEADERS.length);
  }
}

function configureTotalsSheet_(sheet) {
  if (sheet.getMaxColumns() < TOTALS_HEADERS.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), TOTALS_HEADERS.length - sheet.getMaxColumns());
  }

  if (headerNeedsUpdate_(sheet, TOTALS_HEADERS)) {
    sheet.getRange(1, 1, 1, TOTALS_HEADERS.length).setValues([TOTALS_HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, TOTALS_HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#f1f5f9');
    sheet.autoResizeColumns(1, TOTALS_HEADERS.length);
  }
}

function configureEventConfigSheet_(sheet) {
  if (sheet.getMaxColumns() < EVENT_CONFIG_HEADERS.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), EVENT_CONFIG_HEADERS.length - sheet.getMaxColumns());
  }

  if (headerNeedsUpdate_(sheet, EVENT_CONFIG_HEADERS)) {
    sheet.getRange(1, 1, 1, EVENT_CONFIG_HEADERS.length).setValues([EVENT_CONFIG_HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, EVENT_CONFIG_HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#f1f5f9');
    sheet.autoResizeColumns(1, EVENT_CONFIG_HEADERS.length);
  }

  if (sheet.getLastRow() < 2) {
    writeEventConfig_(sheet, DEFAULT_EVENT_CONFIG);
  }
}

function getEventConfig_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(EVENT_CONFIG_SHEET_NAME);
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    writeEventConfig_(sheet, DEFAULT_EVENT_CONFIG);
    return cloneEventConfig_(DEFAULT_EVENT_CONFIG);
  }

  const values = sheet.getRange(2, 1, lastRow - 1, EVENT_CONFIG_HEADERS.length).getValues();
  const eventConfig = {
    period5: [],
    period6: [],
  };

  values
    .map(function (row) {
      return {
        period: String(row[0] || '').trim(),
        eventName: String(row[1] || '').trim(),
        sortOrder: Number(row[2]) || 0,
        active: normalizeBoolean_(row[3]),
      };
    })
    .filter(function (row) {
      return row.active && row.eventName && PERIOD_KEYS_BY_LABEL[row.period];
    })
    .sort(function (a, b) {
      return a.sortOrder - b.sortOrder;
    })
    .forEach(function (row) {
      eventConfig[PERIOD_KEYS_BY_LABEL[row.period]].push(row.eventName);
    });

  if (!eventConfig.period5.length && !eventConfig.period6.length) {
    writeEventConfig_(sheet, DEFAULT_EVENT_CONFIG);
    return cloneEventConfig_(DEFAULT_EVENT_CONFIG);
  }

  return eventConfig;
}

function writeEventConfig_(sheet, config) {
  const rows = [];

  PERIOD_KEYS.forEach(function (periodKey) {
    config[periodKey].forEach(function (eventName, index) {
      rows.push([
        PERIOD_LABELS[periodKey],
        eventName,
        index + 1,
        true,
      ]);
    });
  });

  sheet.clearContents();
  sheet.getRange(1, 1, 1, EVENT_CONFIG_HEADERS.length).setValues([EVENT_CONFIG_HEADERS]);

  if (rows.length) {
    sheet.getRange(2, 1, rows.length, EVENT_CONFIG_HEADERS.length).setValues(rows);
  }

  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, EVENT_CONFIG_HEADERS.length)
    .setFontWeight('bold')
    .setBackground('#f1f5f9');
  sheet.autoResizeColumns(1, EVENT_CONFIG_HEADERS.length);
}

function buildScoreSummary_(spreadsheet, eventConfig) {
  const configuredRows = [];
  const configuredOrder = [];
  const periodByEventName = {};
  const rowByEventName = {};

  PERIOD_KEYS.forEach(function (periodKey) {
    eventConfig[periodKey].forEach(function (eventName) {
      const row = {
        eventName: eventName,
        period: PERIOD_LABELS[periodKey],
      };
      configuredRows.push(row);
      configuredOrder.push(eventName);
      periodByEventName[eventName] = PERIOD_LABELS[periodKey];
      rowByEventName[eventName] = row;
    });
  });

  const rawLog = spreadsheet.getSheetByName(RAW_LOG_SHEET_NAME);
  const lastRow = rawLog.getLastRow();
  const eventTotals = {};
  const historicalOrder = [];
  const entryState = createEntryState_(eventConfig);

  configuredOrder.forEach(function (eventName) {
    eventTotals[eventName] = createEmptyPoints_();
  });

  if (lastRow >= 2) {
    const values = rawLog.getRange(2, 1, lastRow - 1, RAW_LOG_HEADERS.length).getValues();
    getEffectiveRawLogRows_(values).forEach(function (row) {
      const period = String(row[1] || '').trim();
      const eventName = String(row[2] || '').trim();

      if (!eventName) {
        return;
      }

      if (!eventTotals[eventName]) {
        eventTotals[eventName] = createEmptyPoints_();
        historicalOrder.push(eventName);
      }

      if (!periodByEventName[eventName] && PERIOD_KEYS_BY_LABEL[period]) {
        periodByEventName[eventName] = period;
      }

      eventTotals[eventName].cohort10 += Number(row[7]) || 0;
      eventTotals[eventName].cohort11 += Number(row[8]) || 0;
      eventTotals[eventName].cohort12 += Number(row[9]) || 0;

      const targetRow = rowByEventName[eventName] || createHistoricalRow_(eventName, periodByEventName[eventName] || period || 'Period 6', rowByEventName);
      appendBreakdownEntry_(targetRow, row);
      updateEntryState_(entryState, row);
    });
  }

  const rows = configuredRows.map(function (row) {
    const totals = eventTotals[row.eventName] || createEmptyPoints_();
    return {
      eventName: row.eventName,
      period: row.period,
      cohort10: totals.cohort10,
      cohort11: totals.cohort11,
      cohort12: totals.cohort12,
      entries: Array.isArray(row.entries) ? row.entries : [],
    };
  });

  historicalOrder.forEach(function (eventName) {
    if (configuredOrder.indexOf(eventName) !== -1) {
      return;
    }

    const totals = eventTotals[eventName] || createEmptyPoints_();
    rows.push({
      eventName: eventName,
      period: periodByEventName[eventName] || 'Period 6',
      cohort10: totals.cohort10,
      cohort11: totals.cohort11,
      cohort12: totals.cohort12,
      entries: Array.isArray(rowByEventName[eventName] && rowByEventName[eventName].entries)
        ? rowByEventName[eventName].entries
        : [],
    });
  });

  const grandTotals = rows.reduce(function (accumulator, row) {
    accumulator.cohort10 += row.cohort10;
    accumulator.cohort11 += row.cohort11;
    accumulator.cohort12 += row.cohort12;
    return accumulator;
  }, createEmptyPoints_());

  return {
    rows: rows,
    grandTotals: grandTotals,
    entryState: entryState,
    updatedAt: new Date().toISOString(),
  };
}

function buildTotalsResponse_(summary) {
  return {
    cohorts: COHORTS.map(function (cohort) {
      return {
        key: cohort.key,
        label: cohort.label,
        shortLabel: cohort.shortLabel,
        total: summary.grandTotals[cohort.key] || 0,
      };
    }),
    rows: summary.rows.map(function (row) {
      return {
        eventName: row.eventName,
        cohort10: row.cohort10,
        cohort11: row.cohort11,
        cohort12: row.cohort12,
      };
    }),
    updatedAt: summary.updatedAt,
  };
}

function buildBreakdownResponse_(summary) {
  return summary.rows.map(function (row) {
    return {
      eventName: row.eventName,
      period: row.period,
      cohort10: row.cohort10,
      cohort11: row.cohort11,
      cohort12: row.cohort12,
      entries: Array.isArray(row.entries) ? row.entries : [],
    };
  });
}

function buildEntryStateResponse_(summary) {
  return summary.entryState;
}

function updateTotalsSheet_(spreadsheet, eventConfig) {
  const summary = buildScoreSummary_(spreadsheet, eventConfig);
  const sheet = spreadsheet.getSheetByName(TOTALS_SHEET_NAME);
  const rows = summary.rows.map(function (row) {
    return [row.eventName, row.cohort10, row.cohort11, row.cohort12];
  });

  rows.push([
    'Grand Total',
    summary.grandTotals.cohort10,
    summary.grandTotals.cohort11,
    summary.grandTotals.cohort12,
  ]);

  sheet.clearContents();
  sheet.getRange(1, 1, 1, TOTALS_HEADERS.length).setValues([TOTALS_HEADERS]);
  sheet.getRange(1, 1, 1, TOTALS_HEADERS.length)
    .setFontWeight('bold')
    .setBackground('#f1f5f9');

  if (rows.length) {
    sheet.getRange(2, 1, rows.length, TOTALS_HEADERS.length).setValues(rows);
    sheet.getRange(rows.length + 1, 1, 1, TOTALS_HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#e2e8f0');
  }

  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, TOTALS_HEADERS.length);
}

function normalizePayload_(payload, eventConfig) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Missing score payload.');
  }

  const type = String(payload.type || 'score').toLowerCase();

  if (type === 'score') {
    return normalizeScorePayload_(payload, eventConfig);
  }

  if (type === 'bonus' || type === 'penalty') {
    return normalizeAdjustmentPayload_(payload, type, eventConfig);
  }

  throw new Error('Type must be score, penalty, or bonus.');
}

function normalizeScorePayload_(payload, eventConfig) {
  const period = String(payload.period || '').trim();
  const eventName = String(payload.eventName || '').trim();
  const round = String(payload.round || '').trim();
  const validEvents = period === 'Period 5' ? eventConfig.period5 : eventConfig.period6;

  if (period !== 'Period 5' && period !== 'Period 6') {
    throw new Error('Select Period 5 or Period 6.');
  }

  if (validEvents.indexOf(eventName) === -1) {
    throw new Error('Select a valid station or event.');
  }

  if (period === 'Period 5' && ROUND_OPTIONS.indexOf(round) === -1) {
    throw new Error('Select a valid round.');
  }

  const places = {
    cohort10: String(payload.places && payload.places.cohort10 || '').trim(),
    cohort11: String(payload.places && payload.places.cohort11 || '').trim(),
    cohort12: String(payload.places && payload.places.cohort12 || '').trim(),
  };
  const placeValues = Object.keys(places).map(function (key) {
    return places[key];
  });
  const uniquePlaces = placeValues.filter(function (place, index) {
    return placeValues.indexOf(place) === index;
  });

  if (placeValues.some(function (place) { return !PLACE_POINTS[place]; })) {
    throw new Error('Assign 1st, 2nd, or 3rd for every cohort.');
  }

  if (uniquePlaces.length !== COHORTS.length) {
    throw new Error('Each place can only be used once.');
  }

  return {
    period: period,
    eventName: eventName,
    round: period === 'Period 5' ? round : '',
    places: places,
    points: {
      cohort10: PLACE_POINTS[places.cohort10],
      cohort11: PLACE_POINTS[places.cohort11],
      cohort12: PLACE_POINTS[places.cohort12],
    },
    type: 'score',
    note: String(payload.note || '').trim(),
  };
}

function normalizeAdjustmentPayload_(payload, type, eventConfig) {
  const period = String(payload.period || '').trim();
  const eventName = String(payload.eventName || '').trim();
  const cohortKey = String(payload.cohortKey || '').trim();
  const rawPoints = Number(payload.points);
  const note = String(payload.note || '').trim();
  const points = type === 'penalty' ? -Math.abs(rawPoints) : Math.abs(rawPoints);
  const validEvents = getAllConfiguredEvents_(eventConfig);

  if (period !== 'Period 5' && period !== 'Period 6') {
    throw new Error('Select a period for this adjustment.');
  }

  if (validEvents.indexOf(eventName) === -1) {
    throw new Error('Select a valid station or event.');
  }

  if (!COHORTS.some(function (cohort) { return cohort.key === cohortKey; })) {
    throw new Error('Select a cohort.');
  }

  if (!Number.isFinite(rawPoints) || rawPoints <= 0) {
    throw new Error('Enter a positive point value.');
  }

  if (!note) {
    throw new Error('Add a note for the adjustment.');
  }

  const pointsByCohort = createEmptyPoints_();
  pointsByCohort[cohortKey] = points;

  return {
    period: period,
    eventName: eventName,
    round: '',
    places: {
      cohort10: '',
      cohort11: '',
      cohort12: '',
    },
    points: pointsByCohort,
    type: type,
    note: note,
  };
}

function normalizeEventConfigPayload_(config) {
  const normalized = {
    period5: normalizeEventList_(config && config.period5),
    period6: normalizeEventList_(config && config.period6),
  };
  const allNames = normalized.period5.concat(normalized.period6);
  const duplicateMap = {};

  if (!normalized.period5.length) {
    throw new Error('Add at least one Period 5 event.');
  }

  if (!normalized.period6.length) {
    throw new Error('Add at least one Period 6 event.');
  }

  allNames.forEach(function (name) {
    const key = name.toLowerCase();
    duplicateMap[key] = (duplicateMap[key] || 0) + 1;
  });

  if (Object.keys(duplicateMap).some(function (key) { return duplicateMap[key] > 1; })) {
    throw new Error('Event names must be unique so score entry stays reliable.');
  }

  return normalized;
}

function normalizeEventList_(list) {
  if (!Array.isArray(list)) {
    throw new Error('Event list is missing or invalid.');
  }

  return list.map(function (item) {
    const eventName = String(item || '').trim();
    if (!eventName) {
      throw new Error('Event names cannot be blank.');
    }
    return eventName;
  });
}

function getAllConfiguredEvents_(eventConfig) {
  return eventConfig.period5.concat(eventConfig.period6);
}

function cloneEventConfig_(config) {
  return {
    period5: config.period5.slice(),
    period6: config.period6.slice(),
  };
}

function createEmptyPoints_() {
  return {
    cohort10: 0,
    cohort11: 0,
    cohort12: 0,
  };
}

function createEntryState_(eventConfig) {
  return {
    period5: createPeriod5EntryState_(eventConfig.period5),
    period6: createPeriod6EntryState_(eventConfig.period6),
  };
}

function createPeriod5EntryState_(events) {
  return events.reduce(function (accumulator, eventName) {
    accumulator[eventName] = {
      savedRounds: ROUND_OPTIONS.reduce(function (roundAccumulator, round) {
        roundAccumulator[round] = createSavedScoreState_();
        return roundAccumulator;
      }, {}),
      hasAnySaved: false,
      lastSavedRound: '',
      lastSavedAt: '',
    };
    return accumulator;
  }, {});
}

function createPeriod6EntryState_(events) {
  return events.reduce(function (accumulator, eventName) {
    accumulator[eventName] = createSavedScoreState_();
    return accumulator;
  }, {});
}

function createSavedScoreState_() {
  return {
    saved: false,
    lastSavedAt: '',
    note: '',
    places: {
      cohort10: '',
      cohort11: '',
      cohort12: '',
    },
  };
}

function createHistoricalRow_(eventName, period, rowByEventName) {
  const row = {
    eventName: eventName,
    period: period,
    cohort10: 0,
    cohort11: 0,
    cohort12: 0,
  };

  rowByEventName[eventName] = row;
  return row;
}

function appendBreakdownEntry_(row, rawLogRow) {
  if (!row.entries) {
    // Each event row keeps a compact array of round-level and adjustment entries for the Breakdown view.
    row.entries = [];
  }

  const entry = {
    timestamp: formatTimestamp_(rawLogRow[0]),
    round: String(rawLogRow[3] || '').trim(),
    type: String(rawLogRow[10] || 'score').trim().toLowerCase(),
    note: String(rawLogRow[11] || '').trim(),
    places: {
      cohort10: String(rawLogRow[4] || '').trim(),
      cohort11: String(rawLogRow[5] || '').trim(),
      cohort12: String(rawLogRow[6] || '').trim(),
    },
    points: {
      cohort10: Number(rawLogRow[7]) || 0,
      cohort11: Number(rawLogRow[8]) || 0,
      cohort12: Number(rawLogRow[9]) || 0,
    },
  };

  entry.winners = getEntryWinners_(entry);
  row.entries.push(entry);
}

function updateEntryState_(entryState, rawLogRow) {
  const period = String(rawLogRow[1] || '').trim();
  const eventName = String(rawLogRow[2] || '').trim();
  const round = String(rawLogRow[3] || '').trim();
  const type = String(rawLogRow[10] || 'score').trim().toLowerCase();
  const timestamp = formatTimestamp_(rawLogRow[0]);

  if (type !== 'score' || !eventName) {
    return;
  }

  if (period === 'Period 5' && entryState.period5[eventName]) {
    // Saved-round tracking is returned to the client so the entry screen can show which rounds already exist.
    if (round && ROUND_OPTIONS.indexOf(round) !== -1) {
      entryState.period5[eventName].savedRounds[round] = {
        saved: true,
        lastSavedAt: timestamp,
        note: String(rawLogRow[11] || '').trim(),
        places: {
          cohort10: String(rawLogRow[4] || '').trim(),
          cohort11: String(rawLogRow[5] || '').trim(),
          cohort12: String(rawLogRow[6] || '').trim(),
        },
      };
      entryState.period5[eventName].lastSavedRound = round;
    }
    entryState.period5[eventName].hasAnySaved = true;
    entryState.period5[eventName].lastSavedAt = timestamp;
    return;
  }

  if (period === 'Period 6' && entryState.period6[eventName]) {
    entryState.period6[eventName] = {
      saved: true,
      lastSavedAt: timestamp,
      note: String(rawLogRow[11] || '').trim(),
      places: {
        cohort10: String(rawLogRow[4] || '').trim(),
        cohort11: String(rawLogRow[5] || '').trim(),
        cohort12: String(rawLogRow[6] || '').trim(),
      },
    };
  }
}

function getEffectiveRawLogRows_(rows) {
  const latestScoreRowByKey = {};
  const adjustments = [];

  rows.forEach(function (row, index) {
    const type = String(row[10] || 'score').trim().toLowerCase();
    if (type === 'score') {
      latestScoreRowByKey[buildScoreEntryKey_(row)] = {
        row: row,
        index: index,
      };
      return;
    }

    adjustments.push({
      row: row,
      index: index,
    });
  });

  return adjustments
    .concat(Object.keys(latestScoreRowByKey).map(function (key) {
      return latestScoreRowByKey[key];
    }))
    .sort(function (a, b) {
      return a.index - b.index;
    })
    .map(function (item) {
      return item.row;
    });
}

function buildScoreEntryKey_(rawLogRow) {
  return [
    String(rawLogRow[1] || '').trim(),
    String(rawLogRow[2] || '').trim().toLowerCase(),
    String(rawLogRow[3] || '').trim(),
    'score',
  ].join('::');
}

function getEntryWinners_(entry) {
  if (entry.type !== 'score') {
    return [];
  }

  const winners = COHORTS.filter(function (cohort) {
    return entry.places[cohort.key] === '1st';
  }).map(function (cohort) {
    return cohort.label;
  });

  return winners;
}

function formatTimestamp_(value) {
  if (!value) {
    return '';
  }

  const date = value instanceof Date ? value : new Date(value);
  if (String(date) === 'Invalid Date') {
    return '';
  }

  return date.toISOString();
}

function normalizeBoolean_(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  return String(value).toLowerCase() !== 'false' && String(value) !== '0' && String(value).trim() !== '';
}

function waitForLock_(lock, message) {
  try {
    lock.waitLock(LOCK_WAIT_MS);
  } catch (error) {
    throw new Error(message);
  }
}

function headerNeedsUpdate_(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    return true;
  }

  const currentHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  return headers.some(function (header, index) {
    return currentHeaders[index] !== header;
  });
}

function parsePostRequest_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error('Request body is missing.');
  }

  const parsed = parseJsonPayload_(e.postData.contents);
  return {
    action: parsed.action,
    payload: parsed.payload,
    secret: parsed.secret,
  };
}

function parseJsonPayload_(contents) {
  try {
    return JSON.parse(contents || '{}');
  } catch (error) {
    throw new Error('Request body must be valid JSON.');
  }
}

function validateApiSecret_(request) {
  const configuredSecret = PropertiesService.getScriptProperties().getProperty('API_SHARED_SECRET');
  if (!configuredSecret) {
    return;
  }

  const providedSecret = String(request && request.secret || '').trim();
  if (!providedSecret || providedSecret !== configuredSecret) {
    throw new Error('Unauthorized request.');
  }
}

function createJsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
