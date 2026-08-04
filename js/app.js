import { STATUS_LABELS, RANKING_LIMIT } from './constants.js';
import { loadDashboardData } from './data.js';
import { ProfessionalGantt } from './gantt/gantt.js';
import {
  escapeHtml,
  parseDate,
  toISODate,
  formatDate,
  diffDays,
  normalizeProgress,
  normalizeEntity,
} from './utils.js';

let activities = [];
let baseFiltered = [];
let filtered = [];
let cells = [];
let units = [];
let metadata = {};
let gantt = null;

const $ = (id) => document.getElementById(id);
const els = {
  kpis: $('kpis'),
  gantt: $('gantt'),
  table: $('activityTableBody'),
  search: $('searchInput'),
  cell: $('cellFilter'),
  entity: $('entityFilter'),
  stage: $('stageFilter'),
  status: $('statusFilter'),
  reference: $('referenceDate'),
  reset: $('resetButton'),
  download: $('downloadButton'),
  last: $('lastUpdate'),
  best: $('bestRanking'),
  worst: $('worstRanking'),
  comments: $('commentsList'),
  commentsCount: $('commentsCount'),
  zoomControls: $('ganttZoomControls'),
  scrollLeft: $('ganttScrollLeft'),
  scrollRight: $('ganttScrollRight'),
  todayButton: $('ganttToday'),
};

function evaluate(activity) {
  if (
    activity.estado_programacion === 'pendiente_de_programar' ||
    !activity.inicio ||
    !activity.fin_plan
  ) {
    return { status: 'pending', delay: 0, scheduled: false };
  }

  const plannedEnd = parseDate(activity.fin_plan);
  const reference = parseDate(els.reference.value) || new Date();

  if (!plannedEnd) {
    return { status: 'pending', delay: 0, scheduled: false };
  }

  const actual =
    activity.avance >= 100
      ? parseDate(activity.fin_real) || reference
      : reference;

  const delay = Math.max(0, diffDays(plannedEnd, actual));

  return {
    status: delay === 0 ? 'green' : delay <= 7 ? 'orange' : 'red',
    delay,
    scheduled: true,
  };
}

function populate() {
  els.cell.innerHTML =
    '<option value="">Todas las células</option>' +
    [...cells]
      .sort((a, b) => a.orden_celula - b.orden_celula)
      .map(
        (cell) =>
          `<option value="${escapeHtml(cell.celula)}">${escapeHtml(
            cell.celula,
          )}</option>`,
      )
      .join('');

  populateEntities();

  const stages = [
    ...new Map(
      activities.map((activity) => [activity.etapa, activity.orden_etapa]),
    ).entries(),
  ].sort((a, b) => a[1] - b[1]);

  els.stage.innerHTML =
    '<option value="">Todas las etapas</option>' +
    stages
      .map(
        ([stage]) =>
          `<option value="${escapeHtml(stage)}">${escapeHtml(stage)}</option>`,
      )
      .join('');
}

function populateEntities() {
  const selectedCell = els.cell.value;
  const currentEntity = els.entity.value;

  const entities = [
    ...new Map(
      activities
        .filter(
          (activity) =>
            !selectedCell || activity.celula === selectedCell,
        )
        .map((activity) => [activity.entidad, activity.orden_entidad]),
    ).entries(),
  ].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0], 'es'));

  els.entity.innerHTML =
    '<option value="">Todas las entidades</option>' +
    entities
      .map(
        ([entity]) =>
          `<option value="${escapeHtml(entity)}">${escapeHtml(entity)}</option>`,
      )
      .join('');

  if (entities.some(([entity]) => entity === currentEntity)) {
    els.entity.value = currentEntity;
  }
}

function apply() {
  const term = els.search.value.trim().toLowerCase();

  baseFiltered = activities.filter((activity) => {
    const searchable = `${activity.celula} ${activity.entidad} ${activity.etapa} ${activity.actividad} ${activity.comentarios || ''}`.toLowerCase();

    return (
      (!term || searchable.includes(term)) &&
      (!els.cell.value || activity.celula === els.cell.value) &&
      (!els.entity.value || activity.entidad === els.entity.value) &&
      (!els.stage.value || activity.etapa === els.stage.value)
    );
  });

  filtered = baseFiltered.filter(
    (activity) =>
      !els.status.value || evaluate(activity).status === els.status.value,
  );

  renderAll();
}

function renderAll() {
  renderKpis();
  renderRankings();
  gantt?.render({
    rows: filtered,
    allRows: activities,
    referenceDate: els.reference.value,
    statusLabels: STATUS_LABELS,
  });
  renderComments();
  renderTable();
}

function renderKpis() {
  const count = { green: 0, orange: 0, red: 0, pending: 0 };
  baseFiltered.forEach((activity) => count[evaluate(activity).status]++);

  const average = baseFiltered.length
    ? Math.round(
        baseFiltered.reduce((sum, activity) => sum + activity.avance, 0) /
          baseFiltered.length,
      )
    : 0;

  const activeStatus = els.status.value;
  const items = [
    [
      'Entidades visibles',
      new Set(baseFiltered.map((activity) => activity.entidad)).size,
      '',
      'all',
    ],
    ['Actividades', baseFiltered.length, '', 'all'],
    ['En tiempo', count.green, 'green', 'green'],
    ['Retraso ≤ 7 días', count.orange, 'orange', 'orange'],
    ['Retraso > 7 días', count.red, 'red', 'red'],
    ['Pendientes de programar', count.pending, 'pending', 'pending'],
    ['Avance promedio', `${average}%`, '', 'all'],
  ];

  els.kpis.innerHTML = items
    .map(
      ([label, value, cssClass, status]) => `
        <button
          type="button"
          class="kpi ${cssClass} ${
            status !== 'all' && activeStatus === status ? 'is-active' : ''
          }"
          data-kpi-status="${status}"
          aria-pressed="${status !== 'all' && activeStatus === status}"
        >
          <span>${label}</span>
          <strong>${value}</strong>
        </button>
      `,
    )
    .join('');
}

function entityAverage(cell, entity) {
  const matchingUnits = units.filter(
    (unit) =>
      normalizeEntity(unit.celula_asignada) === normalizeEntity(cell) &&
      normalizeEntity(unit.entidad) === normalizeEntity(entity),
  );

  return matchingUnits.length
    ? matchingUnits.reduce(
        (sum, unit) => sum + normalizeProgress(unit.avance),
        0,
      ) / matchingUnits.length
    : 0;
}

function rankings() {
  const groups = new Map();

  filtered.forEach((activity) => {
    const key = `${activity.celula}|${activity.entidad}`;
    if (!groups.has(key)) {
      groups.set(key, {
        celula: activity.celula,
        entidad: activity.entidad,
        items: [],
      });
    }
    groups.get(key).items.push(activity);
  });

  return [...groups.values()]
    .map((group) => {
      let onTime = 0;
      let delay = 0;
      let scheduled = 0;

      group.items.forEach((activity) => {
        const evaluation = evaluate(activity);
        if (evaluation.scheduled) {
          scheduled++;
          delay += evaluation.delay;
          if (evaluation.status === 'green') onTime++;
        }
      });

      const advance = entityAverage(group.celula, group.entidad);
      const onTimeScore = scheduled ? (onTime / scheduled) * 100 : 0;
      const averageDelay = scheduled ? delay / scheduled : 0;
      const delayScore = Math.max(0, 100 - averageDelay * 5);
      const score =
        0.4 * onTimeScore + 0.4 * advance + 0.2 * delayScore;

      return {
        ...group,
        advance: Math.round(advance),
        delay: Math.round(averageDelay),
        score: Math.round(score * 10) / 10,
      };
    })
    .sort((a, b) => b.score - a.score);
}

function rankingHtml(rows) {
  if (!rows.length) {
    return '<div class="empty-state">Sin información para los filtros seleccionados.</div>';
  }

  return rows
    .map(
      (row, index) => `
        <div class="rank-item">
          <span class="rank-position">${index + 1}</span>
          <div class="rank-name">
            <strong>${escapeHtml(row.entidad)}</strong>
            <small>${escapeHtml(row.celula)}</small>
            <small>${row.advance}% avance · ${row.delay} d prom.</small>
          </div>
          <div class="rank-track">
            <div class="rank-fill" style="width:${Math.max(
              0,
              Math.min(100, row.score),
            )}%"></div>
          </div>
          <span class="rank-score">${row.score}</span>
        </div>
      `,
    )
    .join('');
}

function renderRankings() {
  const rows = rankings();
  els.best.innerHTML = rankingHtml(rows.slice(0, RANKING_LIMIT));
  els.worst.innerHTML = rankingHtml(
    [...rows].reverse().slice(0, RANKING_LIMIT),
  );
}

function groupRows(rows) {
  const cellMap = new Map();

  [...rows]
    .sort(
      (a, b) =>
        a.orden_celula - b.orden_celula ||
        a.orden_entidad - b.orden_entidad ||
        a.orden_etapa - b.orden_etapa ||
        a.orden_actividad - b.orden_actividad,
    )
    .forEach((activity) => {
      if (!cellMap.has(activity.celula)) {
        cellMap.set(activity.celula, {
          celula: activity.celula,
          entityMap: new Map(),
        });
      }

      const cell = cellMap.get(activity.celula);

      if (!cell.entityMap.has(activity.entidad)) {
        cell.entityMap.set(activity.entidad, {
          entidad: activity.entidad,
          stageMap: new Map(),
        });
      }

      const entity = cell.entityMap.get(activity.entidad);

      if (!entity.stageMap.has(activity.etapa)) {
        entity.stageMap.set(activity.etapa, {
          etapa: activity.etapa,
          items: [],
        });
      }

      entity.stageMap.get(activity.etapa).items.push(activity);
    });

  return [...cellMap.values()].map((cell) => ({
    celula: cell.celula,
    entities: [...cell.entityMap.values()].map((entity) => ({
      entidad: entity.entidad,
      stages: [...entity.stageMap.values()],
    })),
  }));
}

function zoomConfig() {
  const configs = {
    day: {
      pixelsPerDay: 32,
      minTimelineWidth: 1600,
      label: 'Días',
    },
    week: {
      pixelsPerDay: 9,
      minTimelineWidth: 1500,
      label: 'Semanas',
    },
    month: {
      pixelsPerDay: 4.5,
      minTimelineWidth: 1350,
      label: 'Meses',
    },
  };

  return configs[ganttZoom] || configs.week;
}

function getTimelineWidth(totalDays) {
  const config = zoomConfig();
  return Math.max(
    config.minTimelineWidth,
    Math.round(totalDays * config.pixelsPerDay),
  );
}

function getGlobalTimelineDomain() {
  const scheduledActivities = activities.filter(
    (activity) => evaluate(activity).scheduled,
  );

  const starts = scheduledActivities
    .map((activity) => parseDate(activity.inicio))
    .filter(Boolean);

  const ends = scheduledActivities
    .map((activity) => parseDate(activity.fin_plan))
    .filter(Boolean);

  if (!starts.length || !ends.length) {
    return null;
  }

  const minDate = new Date(Math.min(...starts));
  const maxDate = new Date(Math.max(...ends));

  return {
    minDate,
    maxDate,
    totalDays: Math.max(1, diffDays(minDate, maxDate) + 1),
  };
}

function renderGanttLegacy() {
  const previousScroll = ganttHasRendered ? els.gantt.scrollLeft : 0;

  if (!filtered.length) {
    els.gantt.innerHTML =
      '<div class="empty-state">Sin actividades para los filtros seleccionados.</div>';
    els.gantt.scrollLeft = 0;
    return;
  }

  /*
   * El dominio temporal se calcula con el conjunto completo de actividades,
   * no con el resultado filtrado. Así el calendario conserva siempre el mismo
   * ancho y las barras no “crecen” o se comprimen al aplicar filtros.
   */
  const domain = getGlobalTimelineDomain();

  if (!domain) {
    els.gantt.innerHTML = renderOnlyPendingGantt(filtered);
    els.gantt.scrollLeft = 0;
    initializeGanttInteractions();
    ganttHasRendered = true;
    return;
  }

  const { minDate, maxDate, totalDays } = domain;
  const timelineWidth = getTimelineWidth(totalDays);
  const reference = parseDate(els.reference.value) || new Date();
  const referenceLeft = (diffDays(minDate, reference) / totalDays) * 100;

  let html = `
    <div
      class="gantt-shell"
      style="--timeline-width:${timelineWidth}px"
      data-min-date="${toISODate(minDate)}"
      data-max-date="${toISODate(maxDate)}"
      data-total-days="${totalDays}"
    >
      <div class="gantt-grid gantt-grid-header">
        <div class="gantt-head gantt-head-label">
          <span>Actividad</span>
          <small>Etapa, actividad y periodo planeado</small>
        </div>
        <div class="gantt-head gantt-head-timeline">
          ${buildCalendarHeader(minDate, maxDate, totalDays)}
        </div>
      </div>
      <div class="gantt-grid gantt-grid-body">
  `;

  groupRows(filtered).forEach((cell) => {
    html += `
      <div class="group-label gantt-left-cell">${escapeHtml(cell.celula)}</div>
      <div class="group-timeline gantt-right-cell"></div>
    `;

    cell.entities.forEach((entity) => {
      html += `
        <div class="entity-label gantt-left-cell">${escapeHtml(
          entity.entidad,
        )}</div>
        <div class="entity-timeline gantt-right-cell"></div>
      `;

      entity.stages.forEach((stage) => {
        html += `
          <div class="stage-label gantt-left-cell">↳ ${escapeHtml(
            stage.etapa,
          )}</div>
          <div class="stage-timeline gantt-right-cell"></div>
        `;

        stage.items.forEach((activity) => {
          const evaluation = evaluate(activity);
          const dateLabel = evaluation.scheduled
            ? `${formatDate(activity.inicio)} – ${formatDate(activity.fin_plan)}`
            : 'Pendiente de programar';

          html += `
            <div class="gantt-label gantt-left-cell">
              <strong>${escapeHtml(activity.actividad)}</strong>
              <small title="${escapeHtml(dateLabel)}">${escapeHtml(
                dateLabel,
              )}</small>
            </div>
          `;

          if (!evaluation.scheduled) {
            html += `
              <div class="gantt-row gantt-right-cell pending-row">
                ${buildGridLines(minDate, maxDate, totalDays)}
                <span class="pending-chip">Pendiente de programar</span>
              </div>
            `;
            return;
          }

          const activityStart = parseDate(activity.inicio);
          const activityEnd = parseDate(activity.fin_plan);
          const left = Math.max(
            0,
            (diffDays(minDate, activityStart) / totalDays) * 100,
          );
          const width = Math.max(
            0.55,
            ((diffDays(activityStart, activityEnd) + 1) / totalDays) * 100,
          );

          const tooltip = [
            activity.actividad,
            `${activity.celula} · ${activity.entidad}`,
            dateLabel,
            `${activity.avance}% de avance`,
            STATUS_LABELS[evaluation.status],
          ].join('||');

          html += `
            <div class="gantt-row gantt-right-cell">
              ${buildGridLines(minDate, maxDate, totalDays)}
              ${
                referenceLeft >= 0 && referenceLeft <= 100
                  ? `<div class="reference-line" style="left:${referenceLeft}%" aria-label="Fecha de corte ${formatDate(
                      els.reference.value,
                    )}"></div>`
                  : ''
              }
              <div
                class="gantt-bar ${evaluation.status}"
                style="left:${left}%;width:${width}%"
                data-tooltip="${escapeHtml(tooltip)}"
                tabindex="0"
                role="button"
                aria-label="${escapeHtml(tooltip.replaceAll('||', '. '))}"
              >
                <span>${activity.avance}%</span>
              </div>
            </div>
          `;
        });
      });
    });
  });

  html += '</div></div>';
  els.gantt.innerHTML = html;

  const maxScrollLeft = Math.max(
    0,
    els.gantt.scrollWidth - els.gantt.clientWidth,
  );

  els.gantt.scrollLeft = Math.min(previousScroll, maxScrollLeft);
  els.gantt.tabIndex = 0;
  els.gantt.setAttribute(
    'aria-label',
    'Cronograma desplazable. Usa las flechas izquierda y derecha o arrastra horizontalmente.',
  );

  initializeGanttInteractions();
  ganttHasRendered = true;
}

function buildCalendarHeader(minDate, maxDate, totalDays) {
  const months = [];
  const secondary = [];

  let monthCursor = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  while (monthCursor <= maxDate) {
    const monthStart = new Date(monthCursor);
    const nextMonth = new Date(
      monthCursor.getFullYear(),
      monthCursor.getMonth() + 1,
      1,
    );
    const visibleStart = monthStart < minDate ? minDate : monthStart;
    const visibleEnd = nextMonth > maxDate ? maxDate : nextMonth;
    const left = (diffDays(minDate, visibleStart) / totalDays) * 100;
    const width = Math.max(
      0.25,
      (diffDays(visibleStart, visibleEnd) / totalDays) * 100,
    );
    const longLabel = visibleStart.toLocaleDateString('es-MX', {
      month: 'long',
      year: 'numeric',
    });
    const shortLabel = visibleStart.toLocaleDateString('es-MX', {
      month: 'short',
      year: 'numeric',
    });

    months.push(`
      <div
        class="calendar-month"
        style="left:${left}%;width:${width}%"
        title="${escapeHtml(longLabel)}"
      >
        <span>${escapeHtml(shortLabel)}</span>
      </div>
    `);

    monthCursor = nextMonth;
  }

  if (ganttZoom === 'day') {
    let cursor = new Date(minDate);
    let index = 0;
    const interval = totalDays > 120 ? 5 : totalDays > 60 ? 3 : 1;

    while (cursor <= maxDate) {
      const left = (diffDays(minDate, cursor) / totalDays) * 100;
      const next = new Date(cursor);
      next.setDate(next.getDate() + 1);
      const width = Math.max(0.1, (1 / totalDays) * 100);
      const showLabel = index % interval === 0;
      const label = cursor.toLocaleDateString('es-MX', {
        day: '2-digit',
        month: 'short',
      });

      secondary.push(`
        <div
          class="calendar-unit calendar-day ${showLabel ? 'has-label' : ''}"
          style="left:${left}%;width:${width}%"
          title="${escapeHtml(label)}"
        >
          ${showLabel ? `<span>${escapeHtml(label)}</span>` : ''}
        </div>
      `);

      cursor = next;
      index++;
    }
  } else {
    let weekCursor = new Date(minDate);
    const day = weekCursor.getDay();
    weekCursor.setDate(weekCursor.getDate() + (day === 0 ? -6 : 1 - day));

    let weekIndex = 0;
    const interval =
      ganttZoom === 'month'
        ? totalDays > 730
          ? 8
          : totalDays > 365
            ? 6
            : 4
        : totalDays > 730
          ? 4
          : totalDays > 365
            ? 3
            : totalDays > 180
              ? 2
              : 1;

    while (weekCursor <= maxDate) {
      const weekStart = new Date(weekCursor);
      const nextWeek = new Date(weekCursor);
      nextWeek.setDate(nextWeek.getDate() + 7);
      const visibleStart = weekStart < minDate ? minDate : weekStart;
      const visibleEnd = nextWeek > maxDate ? maxDate : nextWeek;
      const left = (diffDays(minDate, visibleStart) / totalDays) * 100;
      const width = Math.max(
        0.1,
        (diffDays(visibleStart, visibleEnd) / totalDays) * 100,
      );
      const showLabel = weekIndex % interval === 0;
      const shortDate = weekStart.toLocaleDateString('es-MX', {
        day: '2-digit',
        month: 'short',
      });
      const fullDate = weekStart.toLocaleDateString('es-MX', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });

      secondary.push(`
        <div
          class="calendar-unit calendar-week ${showLabel ? 'has-label' : ''}"
          style="left:${left}%;width:${width}%"
          title="Semana del ${escapeHtml(fullDate)}"
        >
          ${
            showLabel
              ? `<span class="calendar-week-label">${escapeHtml(
                  shortDate,
                )}</span>`
              : ''
          }
        </div>
      `);

      weekCursor = nextWeek;
      weekIndex++;
    }
  }

  return `
    <div class="calendar-scale">
      <div class="calendar-months">${months.join('')}</div>
      <div class="calendar-secondary">${secondary.join('')}</div>
    </div>
  `;
}

function buildGridLines(minDate, maxDate, totalDays) {
  const lines = [];
  let cursor = new Date(minDate);

  while (cursor <= maxDate) {
    const shouldDraw =
      ganttZoom === 'day'
        ? true
        : ganttZoom === 'week'
          ? cursor.getDay() === 1
          : cursor.getDate() === 1;

    if (shouldDraw) {
      const left = (diffDays(minDate, cursor) / totalDays) * 100;
      lines.push(`<span class="timeline-grid-line" style="left:${left}%"></span>`);
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return `<div class="gantt-grid-lines">${lines.join('')}</div>`;
}

function renderOnlyPendingGantt(rows) {
  const timelineWidth = 1350;
  let html = `
    <div class="gantt-shell" style="--timeline-width:${timelineWidth}px">
      <div class="gantt-grid gantt-grid-header">
        <div class="gantt-head gantt-head-label"><span>Actividad</span></div>
        <div class="gantt-head gantt-head-timeline">
          <span class="no-calendar-label">Sin fechas programadas</span>
        </div>
      </div>
      <div class="gantt-grid gantt-grid-body">
  `;

  groupRows(rows).forEach((cell) => {
    html += `<div class="group-label gantt-left-cell">${escapeHtml(
      cell.celula,
    )}</div><div class="group-timeline gantt-right-cell"></div>`;

    cell.entities.forEach((entity) => {
      html += `<div class="entity-label gantt-left-cell">${escapeHtml(
        entity.entidad,
      )}</div><div class="entity-timeline gantt-right-cell"></div>`;

      entity.stages.forEach((stage) => {
        html += `<div class="stage-label gantt-left-cell">↳ ${escapeHtml(
          stage.etapa,
        )}</div><div class="stage-timeline gantt-right-cell"></div>`;

        stage.items.forEach((activity) => {
          html += `
            <div class="gantt-label gantt-left-cell">
              <strong>${escapeHtml(activity.actividad)}</strong>
              <small>Pendiente de programar</small>
            </div>
            <div class="gantt-row gantt-right-cell pending-row">
              <span class="pending-chip">Pendiente de programar</span>
            </div>
          `;
        });
      });
    });
  });

  return `${html}</div></div>`;
}

function getGanttScrollAmount(fast = false) {
  if (fast) return Math.max(600, Math.round(els.gantt.clientWidth * 0.75));
  return Math.max(180, Math.round(els.gantt.clientWidth * 0.28));
}

function scrollGantt(direction, fast = false) {
  if (!els.gantt) return;

  els.gantt.focus({ preventScroll: true });

  els.gantt.scrollBy({
    left: direction * getGanttScrollAmount(fast),
    behavior: 'smooth',
  });
}

function scrollToReferenceDate() {
  const shell = els.gantt.querySelector('.gantt-shell');
  if (!shell) return;

  const minDate = parseDate(shell.dataset.minDate);
  const maxDate = parseDate(shell.dataset.maxDate);
  const reference = parseDate(els.reference.value) || new Date();

  if (!minDate || !maxDate) return;

  const totalDays = Math.max(1, diffDays(minDate, maxDate) + 1);
  const position = Math.max(0, Math.min(1, diffDays(minDate, reference) / totalDays));
  const labelWidth = parseFloat(
    getComputedStyle(shell).getPropertyValue('--label-column-width'),
  ) || 340;
  const timelineWidth = parseFloat(
    getComputedStyle(shell).getPropertyValue('--timeline-width'),
  ) || 1500;

  const target = labelWidth + timelineWidth * position - els.gantt.clientWidth / 2;
  els.gantt.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
}

function ensureTooltip() {
  if (tooltipElement) return tooltipElement;

  tooltipElement = document.createElement('div');
  tooltipElement.className = 'gantt-tooltip';
  tooltipElement.setAttribute('role', 'tooltip');
  document.body.appendChild(tooltipElement);
  return tooltipElement;
}

function showTooltip(target, event) {
  const tooltip = ensureTooltip();
  const parts = String(target.dataset.tooltip || '').split('||');

  tooltip.innerHTML = `
    <strong>${escapeHtml(parts[0] || '')}</strong>
    <span>${escapeHtml(parts[1] || '')}</span>
    <span>${escapeHtml(parts[2] || '')}</span>
    <span>${escapeHtml(parts[3] || '')} · ${escapeHtml(parts[4] || '')}</span>
  `;
  tooltip.classList.add('is-visible');
  positionTooltip(event);
}

function positionTooltip(event) {
  if (!tooltipElement) return;

  const gap = 14;
  const width = tooltipElement.offsetWidth;
  const height = tooltipElement.offsetHeight;
  let left = event.clientX + gap;
  let top = event.clientY + gap;

  if (left + width > window.innerWidth - 12) {
    left = event.clientX - width - gap;
  }
  if (top + height > window.innerHeight - 12) {
    top = event.clientY - height - gap;
  }

  tooltipElement.style.left = `${Math.max(12, left)}px`;
  tooltipElement.style.top = `${Math.max(12, top)}px`;
}

function hideTooltip() {
  tooltipElement?.classList.remove('is-visible');
}

function initializeGanttInteractions() {
  if (!els.gantt) return;

  let dragging = false;
  let startX = 0;
  let startScrollLeft = 0;

  els.gantt.onpointerdown = (event) => {
    if (event.button !== 0 || event.target.closest('.gantt-bar')) return;
    if (els.gantt.scrollWidth <= els.gantt.clientWidth) return;

    event.preventDefault();
    dragging = true;
    startX = event.clientX;
    startScrollLeft = els.gantt.scrollLeft;
    els.gantt.classList.add('is-dragging');
    els.gantt.setPointerCapture(event.pointerId);
  };

  els.gantt.onpointermove = (event) => {
    if (dragging) {
      els.gantt.scrollLeft = startScrollLeft - (event.clientX - startX);
    }

    const bar = event.target.closest('.gantt-bar');
    if (bar) showTooltip(bar, event);
  };

  els.gantt.onpointerup = (event) => {
    dragging = false;
    els.gantt.classList.remove('is-dragging');
    if (els.gantt.hasPointerCapture(event.pointerId)) {
      els.gantt.releasePointerCapture(event.pointerId);
    }
  };

  els.gantt.onpointercancel = () => {
    dragging = false;
    els.gantt.classList.remove('is-dragging');
  };

  els.gantt.onlostpointercapture = () => {
    dragging = false;
    els.gantt.classList.remove('is-dragging');
  };

  els.gantt.onpointerleave = () => {
    if (!dragging) hideTooltip();
  };

  els.gantt.onfocusout = (event) => {
    if (event.target.closest('.gantt-bar')) hideTooltip();
  };

  els.gantt.onfocusin = (event) => {
    const bar = event.target.closest('.gantt-bar');
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    showTooltip(bar, {
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    });
  };
}

function renderComments() {
  const rows = filtered.filter((activity) => activity.comentarios);
  els.commentsCount.textContent = `${rows.length} comentario${
    rows.length === 1 ? '' : 's'
  }`;

  els.comments.innerHTML = rows.length
    ? rows
        .map((activity) => {
          const evaluation = evaluate(activity);
          return `
            <button type="button" class="comment-item" data-comment-cell="${escapeHtml(activity.celula)}" data-comment-entity="${escapeHtml(activity.entidad)}" aria-label="Filtrar tablero por ${escapeHtml(activity.entidad)}">
              <div>
                <strong>${escapeHtml(activity.actividad)}</strong>
                <small>${escapeHtml(activity.entidad)} · ${escapeHtml(
                  activity.celula,
                )}</small>
              </div>
              <span class="status-pill ${evaluation.status}">${
                STATUS_LABELS[evaluation.status]
              }</span>
              <p>${escapeHtml(activity.comentarios)}</p>
              <footer>
                ${escapeHtml(activity.etapa)} ·
                ${
                  evaluation.scheduled
                    ? `${formatDate(activity.inicio)} – ${formatDate(
                        activity.fin_plan,
                      )}`
                    : 'Pendiente de programar'
                } · ${activity.avance}%
              </footer>
            </button>
          `;
        })
        .join('')
    : '<div class="empty-state">No hay comentarios para los filtros seleccionados.</div>';
}

function renderTable() {
  els.table.innerHTML = filtered
    .map((activity) => {
      const evaluation = evaluate(activity);
      return `
        <tr>
          <td>${escapeHtml(activity.celula)}</td>
          <td>${escapeHtml(activity.entidad)}</td>
          <td>${escapeHtml(activity.etapa)}</td>
          <td>
            <strong>${escapeHtml(activity.actividad)}</strong><br>
            <small>${escapeHtml(activity.comentarios || '')}</small>
          </td>
          <td>${
            evaluation.scheduled
              ? formatDate(activity.inicio)
              : 'Pendiente de programar'
          }</td>
          <td>${
            evaluation.scheduled
              ? formatDate(activity.fin_plan)
              : 'Pendiente de programar'
          }</td>
          <td>${activity.avance}%</td>
          <td>${activity.unidades_cumplen}/${activity.total_unidades}</td>
          <td>${evaluation.scheduled ? `${evaluation.delay} días` : 'No aplica'}</td>
          <td><span class="status-pill ${evaluation.status}">${
            STATUS_LABELS[evaluation.status]
          }</span></td>
        </tr>
      `;
    })
    .join('');
}

function downloadCsv() {
  const headers = [
    'celula',
    'entidad',
    'etapa',
    'actividad',
    'inicio',
    'fin_plan',
    'avance',
    'comentarios',
  ];
  const rows = filtered.map((activity) =>
    headers.map((key) => activity[key] ?? ''),
  );
  const csv = [headers, ...rows]
    .map((row) =>
      row
        .map((value) => `"${String(value).replaceAll('"', '""')}"`)
        .join(','),
    )
    .join('\n');

  const url = URL.createObjectURL(
    new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = 'seguimiento_filtrado.csv';
  link.click();
  URL.revokeObjectURL(url);
}

async function init() {
  try {
    ({ activities, units, cells, metadata } = await loadDashboardData());
    els.last.textContent = metadata.ultima_actualizacion || 'Sin información';
    els.reference.value = toISODate(new Date());

    gantt = new ProfessionalGantt({
      root: els.gantt,
      zoomControls: els.zoomControls,
      previousButton: els.scrollLeft,
      nextButton: els.scrollRight,
      todayButton: els.todayButton,
      startButton: document.getElementById('ganttStart'),
      endButton: document.getElementById('ganttEnd'),
      evaluate,
      formatDate,
      parseDate,
      diffDays,
      escapeHtml,
    });

    populate();
    apply();
  } catch (error) {
    console.error(error);
    els.gantt.innerHTML = `<div class="empty-state error">${escapeHtml(
      error.message,
    )}</div>`;
  }
}

els.kpis.addEventListener('click', (event) => {
  const card = event.target.closest('[data-kpi-status]');
  if (!card) return;
  const status = card.dataset.kpiStatus;
  els.status.value =
    status === 'all' ? '' : els.status.value === status ? '' : status;
  apply();
});

els.cell.addEventListener('change', () => {
  els.entity.value = '';
  populateEntities();
  apply();
});

[els.search, els.entity, els.stage, els.status, els.reference].forEach(
  (element) => element.addEventListener('input', apply),
);

els.reset.addEventListener('click', () => {
  els.search.value = '';
  els.cell.value = '';
  els.entity.value = '';
  els.stage.value = '';
  els.status.value = '';
  populateEntities();
  apply();
});

els.comments.addEventListener('click', (event) => {
  const comment = event.target.closest('[data-comment-entity]');
  if (!comment) return;

  els.search.value = '';
  els.stage.value = '';
  els.status.value = '';
  els.cell.value = comment.dataset.commentCell || '';
  populateEntities();
  els.entity.value = comment.dataset.commentEntity || '';
  apply();

  document.querySelector('.gantt-card')?.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  });
});

els.download.addEventListener('click', downloadCsv);

// Los eventos del Gantt se administran en js/gantt/gantt.js.

init();
