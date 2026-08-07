const ZOOM = {
  month: { pixelsPerDay: 4.5, minWidth: 1400, label: "Meses" },
  week: { pixelsPerDay: 9, minWidth: 1600, label: "Semanas" },
  day: { pixelsPerDay: 30, minWidth: 1900, label: "Días" },
};

export class ProfessionalGantt {
  constructor({
    root,
    zoomControls,
    previousButton,
    nextButton,
    todayButton,
    startButton,
    endButton,
    evaluate,
    formatDate,
    parseDate,
    diffDays,
    escapeHtml,
  }) {
    this.root = root;
    this.zoomControls = zoomControls;
    this.previousButton = previousButton;
    this.nextButton = nextButton;
    this.todayButton = todayButton;
    this.startButton = startButton;
    this.endButton = endButton;
    this.evaluate = evaluate;
    this.formatDate = formatDate;
    this.parseDate = parseDate;
    this.diffDays = diffDays;
    this.escapeHtml = escapeHtml;

    this.zoom = "week";
    this.lastPayload = null;
    this.tooltip = null;
    this.drag = null;
    this.hasRendered = false;

    this.bindControls();
    this.bindKeyboard();
    this.bindPointerInteractions();
  }

  bindControls() {
    this.zoomControls?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-gantt-zoom]");
      if (!button || !ZOOM[button.dataset.ganttZoom]) return;

      this.zoom = button.dataset.ganttZoom;
      this.zoomControls
        .querySelectorAll("[data-gantt-zoom]")
        .forEach((item) => item.classList.toggle("is-active", item === button));

      if (this.lastPayload)
        this.render(this.lastPayload, { preserveCenter: true });
    });

    this.previousButton?.addEventListener("click", () => this.scrollBy(-1));
    this.nextButton?.addEventListener("click", () => this.scrollBy(1));
    this.todayButton?.addEventListener("click", () => this.scrollToReference());
    this.startButton?.addEventListener("click", () => this.scrollToStart());
    this.endButton?.addEventListener("click", () => this.scrollToEnd());
  }

  bindKeyboard() {
    document.addEventListener("keydown", (event) => {
      const active = document.activeElement;
      const editing = active?.matches(
        'input, textarea, select, button, [contenteditable="true"]'
      );

      if (editing || !this.canScroll()) return;

      if (event.key === "ArrowRight") {
        event.preventDefault();
        this.scrollBy(1, event.shiftKey);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        this.scrollBy(-1, event.shiftKey);
      } else if (event.key === "Home" && active === this.root) {
        event.preventDefault();
        this.scrollToStart();
      } else if (event.key === "End" && active === this.root) {
        event.preventDefault();
        this.scrollToEnd();
      }
    });

    this.root.addEventListener(
      "wheel",
      (event) => {
        if (!event.shiftKey || !this.canScroll()) return;
        event.preventDefault();
        this.root.scrollLeft += event.deltaY || event.deltaX;
      },
      { passive: false }
    );
  }

  bindPointerInteractions() {
    this.root.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      if (event.target.closest(".gantt-bar, button, a")) return;
      if (!this.canScroll()) return;

      this.drag = {
        pointerId: event.pointerId,
        x: event.clientX,
        scrollLeft: this.root.scrollLeft,
      };

      this.root.classList.add("is-dragging");
      this.root.setPointerCapture(event.pointerId);
    });

    this.root.addEventListener("pointermove", (event) => {
      if (!this.drag || this.drag.pointerId !== event.pointerId) return;
      this.root.scrollLeft =
        this.drag.scrollLeft - (event.clientX - this.drag.x);
    });

    const stopDrag = (event) => {
      if (!this.drag) return;
      this.root.classList.remove("is-dragging");
      if (
        event?.pointerId !== undefined &&
        this.root.hasPointerCapture(event.pointerId)
      ) {
        this.root.releasePointerCapture(event.pointerId);
      }
      this.drag = null;
    };

    this.root.addEventListener("pointerup", stopDrag);
    this.root.addEventListener("pointercancel", stopDrag);
    this.root.addEventListener("lostpointercapture", stopDrag);

    this.root.addEventListener("pointerover", (event) => {
      const bar = event.target.closest(".gantt-bar");
      if (bar) this.showTooltip(bar, event.clientX, event.clientY);
    });

    this.root.addEventListener("pointermove", (event) => {
      const bar = event.target.closest(".gantt-bar");
      if (bar && !this.drag) this.positionTooltip(event.clientX, event.clientY);
    });

    this.root.addEventListener("pointerout", (event) => {
      const bar = event.target.closest(".gantt-bar");
      if (!bar) return;
      if (event.relatedTarget && bar.contains(event.relatedTarget)) return;
      this.hideTooltip();
    });

    this.root.addEventListener("click", (event) => {
      const bar = event.target.closest(".gantt-bar");
      if (!bar) return;
      const rect = bar.getBoundingClientRect();
      this.showTooltip(bar, rect.left + rect.width / 2, rect.bottom);
    });

    this.root.addEventListener("focusin", (event) => {
      const bar = event.target.closest(".gantt-bar");
      if (!bar) return;
      const rect = bar.getBoundingClientRect();
      this.showTooltip(bar, rect.left + rect.width / 2, rect.top);
    });

    this.root.addEventListener("focusout", (event) => {
      if (event.target.closest(".gantt-bar")) this.hideTooltip();
    });
  }

  render(payload, options = {}) {
    this.lastPayload = payload;
    const { rows, allRows, referenceDate, statusLabels } = payload;

    const previousScroll = this.root.scrollLeft;
    const previousCenter =
      this.root.scrollWidth > 0
        ? (previousScroll + this.root.clientWidth / 2) / this.root.scrollWidth
        : 0;

    if (!rows.length) {
      this.root.innerHTML =
        '<div class="empty-state">Sin actividades para los filtros seleccionados.</div>';
      this.root.scrollLeft = 0;
      return;
    }

    const domain = this.getDomain(allRows);

    if (!domain) {
      this.root.innerHTML = this.renderOnlyPending(rows, statusLabels);
      this.root.scrollLeft = 0;
      return;
    }

    const { minDate, maxDate, totalDays } = domain;
    const timelineWidth = Math.max(
      ZOOM[this.zoom].minWidth,
      Math.round(totalDays * ZOOM[this.zoom].pixelsPerDay)
    );
    const labelWidth = this.getLabelWidth();
    const grouped = this.groupRows(rows);
    const reference = this.parseDate(referenceDate);
    const referenceLeft = reference
      ? (this.diffDays(minDate, reference) / totalDays) * 100
      : -1;
    const background = this.buildTimelineBackground(
      minDate,
      maxDate,
      totalDays
    );

    let html = `
      <div
        class="gantt-canvas"
        style="--gantt-label-width:${labelWidth}px;--gantt-timeline-width:${timelineWidth}px"
      >
        <div class="gantt-corner gantt-sticky-top gantt-sticky-left">
          <strong>Actividad</strong>
          <small>${this.escapeHtml(
            ZOOM[this.zoom].label
          )} · rango global</small>
        </div>
        <div class="gantt-calendar gantt-sticky-top">
          ${this.buildCalendar(minDate, maxDate, totalDays)}
        </div>
    `;

    grouped.forEach((cell) => {
      html += this.groupRow(cell.celula, "cell");

      cell.entities.forEach((entity) => {
        html += this.groupRow(entity.entidad, "entity");

        entity.stages.forEach((stage) => {
          html += this.groupRow(stage.etapa, "stage");

          stage.items.forEach((activity) => {
            const evaluation = this.evaluate(activity);
            const dateText = evaluation.scheduled
              ? `${this.formatDate(activity.inicio)} – ${this.formatDate(
                  activity.fin_plan
                )}`
              : "Pendiente de programar";

            html += `
              <div class="gantt-task-label gantt-sticky-left">
                <strong>${this.escapeHtml(activity.actividad)}</strong>
                <small>${this.escapeHtml(dateText)} · ${
              activity.unidades_cumplen
            }/${activity.total_unidades} unidades</small>
              </div>
            `;

            if (!evaluation.scheduled) {
              html += `
                <div class="gantt-timeline-row gantt-pending-row" style="${background}">
                  <span class="gantt-pending-chip">Pendiente de programar</span>
                </div>
              `;
              return;
            }

            const start = this.parseDate(activity.inicio);
            const end = this.parseDate(activity.fin_plan);
            const startOffsetDays = Math.max(0, this.diffDays(minDate, start));
            const durationDays = Math.max(1, this.diffDays(start, end) + 1);
            const leftPx = (startOffsetDays / totalDays) * timelineWidth;
            const naturalWidthPx = (durationDays / totalDays) * timelineWidth;
            const displayWidthPx = Math.max(12, naturalWidthPx);
            const compactClass = naturalWidthPx < 46 ? "is-compact" : "";
            const tooltip = JSON.stringify({
              actividad: activity.actividad,
              celula: activity.celula,
              entidad: activity.entidad,
              inicio: this.formatDate(activity.inicio),
              fin: this.formatDate(activity.fin_plan),
              avance: `${activity.avance}%`,
              estado: statusLabels[evaluation.status],
              comentario: activity.comentarios || "",
            });

            /* =====================================================
               ETIQUETA EXTERNA PARA BARRAS CORTAS
            ===================================================== */

            const MIN_WIDTH_FOR_INSIDE_LABEL = 58;
            const showOutsideProgress =
              displayWidthPx < MIN_WIDTH_FOR_INSIDE_LABEL;
            const progressLabel = `${Math.round(activity.avance)}%`;
            const outsideLabelWidth = 44;

            const placeOutsideLabelOnLeft =
              leftPx + displayWidthPx + outsideLabelWidth + 8 > timelineWidth;

            const outsideLabelLeft = placeOutsideLabelOnLeft
              ? Math.max(0, leftPx - outsideLabelWidth - 6)
              : leftPx + displayWidthPx + 6;

            html += `
              <div class="gantt-timeline-row" style="${background}">
                ${
                  referenceLeft >= 0 && referenceLeft <= 100
                    ? `<div class="gantt-today-line" style="left:${referenceLeft}%"><span>Hoy</span></div>`
                    : ""
                }

                <button
                  type="button"
                  class="gantt-bar ${evaluation.status} ${compactClass}"
                  style="left:${leftPx}px;width:${displayWidthPx}px"
                  data-gantt-tooltip="${this.escapeHtml(
                    encodeURIComponent(tooltip)
                  )}"
                  title="${this.escapeHtml(
                    `${activity.actividad} · ${activity.avance}% · ${
                      statusLabels[evaluation.status]
                    }`
                  )}"
                  aria-label="${this.escapeHtml(
                    `${activity.actividad}. ${dateText}. ${
                      activity.avance
                    }% de avance. ${statusLabels[evaluation.status]}`
                  )}"
                >
                  ${
                    showOutsideProgress
                      ? ""
                      : `<span class="gantt-bar-progress">${progressLabel}</span>`
                  }
                </button>

                ${
                  showOutsideProgress
                    ? `
                      <span
                        class="gantt-progress-outside ${evaluation.status}"
                        style="left:${outsideLabelLeft}px"
                        aria-hidden="true"
                      >
                        ${progressLabel}
                      </span>
                    `
                    : ""
                }
              </div>
            `;
          });
        });
      });
    });

    html += "</div>";
    this.root.innerHTML = html;
    this.root.tabIndex = 0;

    requestAnimationFrame(() => {
      const max = Math.max(0, this.root.scrollWidth - this.root.clientWidth);
      if (options.preserveCenter) {
        this.root.scrollLeft = Math.max(
          0,
          Math.min(
            max,
            previousCenter * this.root.scrollWidth - this.root.clientWidth / 2
          )
        );
      } else if (this.hasRendered) {
        this.root.scrollLeft = Math.min(previousScroll, max);
      } else {
        this.root.scrollLeft = 0;
      }
      this.hasRendered = true;
    });
  }

  getDomain(allRows) {
    const scheduled = allRows.filter((row) => this.evaluate(row).scheduled);
    const starts = scheduled
      .map((row) => this.parseDate(row.inicio))
      .filter(Boolean);
    const ends = scheduled
      .map((row) => this.parseDate(row.fin_plan))
      .filter(Boolean);
    if (!starts.length || !ends.length) return null;

    const minDate = new Date(Math.min(...starts));
    const maxDate = new Date(Math.max(...ends));
    return {
      minDate,
      maxDate,
      totalDays: Math.max(1, this.diffDays(minDate, maxDate) + 1),
    };
  }

  getLabelWidth() {
    if (window.innerWidth <= 640) return 230;
    if (window.innerWidth <= 900) return 280;
    return 350;
  }

  groupRows(rows) {
    const cells = new Map();
    [...rows]
      .sort(
        (a, b) =>
          a.orden_celula - b.orden_celula ||
          a.orden_entidad - b.orden_entidad ||
          a.orden_etapa - b.orden_etapa ||
          a.orden_actividad - b.orden_actividad
      )
      .forEach((activity) => {
        if (!cells.has(activity.celula)) {
          cells.set(activity.celula, {
            celula: activity.celula,
            entities: new Map(),
          });
        }
        const cell = cells.get(activity.celula);
        if (!cell.entities.has(activity.entidad)) {
          cell.entities.set(activity.entidad, {
            entidad: activity.entidad,
            stages: new Map(),
          });
        }
        const entity = cell.entities.get(activity.entidad);
        if (!entity.stages.has(activity.etapa)) {
          entity.stages.set(activity.etapa, {
            etapa: activity.etapa,
            items: [],
          });
        }
        entity.stages.get(activity.etapa).items.push(activity);
      });

    return [...cells.values()].map((cell) => ({
      celula: cell.celula,
      entities: [...cell.entities.values()].map((entity) => ({
        entidad: entity.entidad,
        stages: [...entity.stages.values()],
      })),
    }));
  }

  groupRow(label, type) {
    const prefix = type === "stage" ? "↳ " : "";
    return `
      <div class="gantt-group-label gantt-group-${type} gantt-sticky-left">${prefix}${this.escapeHtml(
      label
    )}</div>
      <div class="gantt-group-timeline gantt-group-${type}"></div>
    `;
  }

  buildCalendar(minDate, maxDate, totalDays) {
    const years = [];
    const months = [];
    const units = [];

    let yearCursor = new Date(minDate.getFullYear(), 0, 1);
    while (yearCursor <= maxDate) {
      const next = new Date(yearCursor.getFullYear() + 1, 0, 1);
      const start = yearCursor < minDate ? minDate : yearCursor;
      const end = next > maxDate ? maxDate : next;
      years.push(
        this.calendarCell(
          "year",
          start,
          end,
          minDate,
          totalDays,
          String(start.getFullYear())
        )
      );
      yearCursor = next;
    }

    let monthCursor = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    while (monthCursor <= maxDate) {
      const next = new Date(
        monthCursor.getFullYear(),
        monthCursor.getMonth() + 1,
        1
      );
      const start = monthCursor < minDate ? minDate : monthCursor;
      const end = next > maxDate ? maxDate : next;
      const label = start.toLocaleDateString("es-MX", { month: "short" });
      months.push(
        this.calendarCell("month", start, end, minDate, totalDays, label)
      );
      monthCursor = next;
    }

    if (this.zoom === "day") {
      let cursor = new Date(minDate);
      const interval = totalDays > 120 ? 5 : totalDays > 60 ? 3 : 1;
      let index = 0;
      while (cursor <= maxDate) {
        const next = new Date(cursor);
        next.setDate(next.getDate() + 1);
        const label = index % interval === 0 ? String(cursor.getDate()) : "";
        units.push(
          this.calendarCell("day", cursor, next, minDate, totalDays, label)
        );
        cursor = next;
        index++;
      }
    } else {
      let cursor = new Date(minDate);
      const day = cursor.getDay();
      cursor.setDate(cursor.getDate() + (day === 0 ? -6 : 1 - day));
      const interval =
        this.zoom === "month"
          ? 4
          : totalDays > 365
          ? 3
          : totalDays > 180
          ? 2
          : 1;
      let index = 0;
      while (cursor <= maxDate) {
        const next = new Date(cursor);
        next.setDate(next.getDate() + 7);
        const start = cursor < minDate ? minDate : cursor;
        const end = next > maxDate ? maxDate : next;
        const label =
          index % interval === 0
            ? cursor.toLocaleDateString("es-MX", {
                day: "2-digit",
                month: "short",
              })
            : "";
        units.push(
          this.calendarCell("week", start, end, minDate, totalDays, label, true)
        );
        cursor = next;
        index++;
      }
    }

    return `
      <div class="gantt-calendar-row gantt-years">${years.join("")}</div>
      <div class="gantt-calendar-row gantt-months">${months.join("")}</div>
      <div class="gantt-calendar-row gantt-units">${units.join("")}</div>
    `;
  }

  calendarCell(type, start, end, minDate, totalDays, label, vertical = false) {
    const left = (this.diffDays(minDate, start) / totalDays) * 100;
    const width = Math.max(0.08, (this.diffDays(start, end) / totalDays) * 100);
    return `
      <div class="gantt-calendar-cell gantt-calendar-${type}" style="left:${left}%;width:${width}%">
        ${
          label
            ? `<span class="${vertical ? "is-vertical" : ""}">${this.escapeHtml(
                label
              )}</span>`
            : ""
        }
      </div>
    `;
  }

  buildTimelineBackground(minDate, maxDate, totalDays) {
    const gradients = [];

    // Fines de semana.
    let cursor = new Date(minDate);
    while (cursor <= maxDate) {
      if (cursor.getDay() === 6) {
        const monday = new Date(cursor);
        monday.setDate(monday.getDate() + 2);
        const left = (this.diffDays(minDate, cursor) / totalDays) * 100;
        const right = (this.diffDays(minDate, monday) / totalDays) * 100;
        gradients.push(
          `linear-gradient(to right, transparent 0 ${Math.max(
            0,
            left
          )}%, rgba(92,108,102,.055) ${Math.max(0, left)}% ${Math.min(
            100,
            right
          )}%, transparent ${Math.min(100, right)}% 100%)`
        );
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    // Meses alternados y separadores.
    let monthCursor = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    let monthIndex = 0;
    while (monthCursor <= maxDate) {
      const next = new Date(
        monthCursor.getFullYear(),
        monthCursor.getMonth() + 1,
        1
      );
      const start = monthCursor < minDate ? minDate : monthCursor;
      const end = next > maxDate ? maxDate : next;
      const left = (this.diffDays(minDate, start) / totalDays) * 100;
      const right = (this.diffDays(minDate, end) / totalDays) * 100;
      if (monthIndex % 2 === 1) {
        gradients.push(
          `linear-gradient(to right, transparent 0 ${left}%, rgba(35,91,78,.022) ${left}% ${right}%, transparent ${right}% 100%)`
        );
      }
      gradients.push(
        `linear-gradient(to right, transparent 0 calc(${left}% - 1px), rgba(35,91,78,.16) calc(${left}% - 1px) ${left}%, transparent ${left}% 100%)`
      );
      monthCursor = next;
      monthIndex++;
    }

    // Líneas semanales finas.
    const weekPx = ZOOM[this.zoom].pixelsPerDay * 7;
    gradients.push(
      `repeating-linear-gradient(to right, transparent 0 ${Math.max(
        1,
        weekPx - 1
      )}px, rgba(113,136,127,.12) ${Math.max(1, weekPx - 1)}px ${weekPx}px)`
    );

    return `background-image:${gradients.join(",")};background-color:#fff`;
  }

  renderOnlyPending(rows, statusLabels) {
    let html = '<div class="gantt-pending-only">';
    rows.forEach((row) => {
      html += `
        <div class="gantt-pending-only-item">
          <strong>${this.escapeHtml(row.actividad)}</strong>
          <span>${this.escapeHtml(row.entidad)} · ${this.escapeHtml(
        row.celula
      )}</span>
          <small>${statusLabels.pending}</small>
        </div>
      `;
    });
    return html + "</div>";
  }

  canScroll() {
    return this.root.scrollWidth > this.root.clientWidth + 2;
  }

  scrollBy(direction, fast = false) {
    if (!this.canScroll()) return;
    const amount = fast
      ? Math.max(700, this.root.clientWidth * 0.8)
      : Math.max(220, this.root.clientWidth * 0.32);
    this.root.focus({ preventScroll: true });
    this.root.scrollBy({ left: direction * amount, behavior: "smooth" });
  }

  scrollToStart() {
    this.root.focus({ preventScroll: true });
    this.root.scrollTo({ left: 0, behavior: "smooth" });
  }

  scrollToEnd() {
    this.root.focus({ preventScroll: true });
    this.root.scrollTo({ left: this.root.scrollWidth, behavior: "smooth" });
  }

  scrollToReference() {
    if (!this.lastPayload) return;
    const domain = this.getDomain(this.lastPayload.allRows);
    const reference = this.parseDate(this.lastPayload.referenceDate);
    if (!domain || !reference) return;

    const position =
      this.diffDays(domain.minDate, reference) / domain.totalDays;
    const canvas = this.root.querySelector(".gantt-canvas");
    if (!canvas) return;
    const labelWidth = this.getLabelWidth();
    const timelineWidth = canvas.scrollWidth - labelWidth;
    const target =
      labelWidth + timelineWidth * position - this.root.clientWidth / 2;
    this.root.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  }

  ensureTooltip() {
    if (this.tooltip) return this.tooltip;
    this.tooltip = document.createElement("div");
    this.tooltip.className = "gantt-tooltip";
    this.tooltip.hidden = true;
    document.body.appendChild(this.tooltip);
    return this.tooltip;
  }

  showTooltip(bar, x, y) {
    const tooltip = this.ensureTooltip();
    let data;
    try {
      data = JSON.parse(
        decodeURIComponent(bar.dataset.ganttTooltip || "%7B%7D")
      );
    } catch {
      return;
    }

    tooltip.innerHTML = `
      <strong>${this.escapeHtml(data.actividad || "")}</strong>
      <span>${this.escapeHtml(data.entidad || "")} · ${this.escapeHtml(
      data.celula || ""
    )}</span>
      <dl>
        <div><dt>Inicio</dt><dd>${this.escapeHtml(
          data.inicio || "—"
        )}</dd></div>
        <div><dt>Fin</dt><dd>${this.escapeHtml(data.fin || "—")}</dd></div>
        <div><dt>Avance</dt><dd>${this.escapeHtml(
          data.avance || "—"
        )}</dd></div>
        <div><dt>Estado</dt><dd>${this.escapeHtml(
          data.estado || "—"
        )}</dd></div>
      </dl>
      ${data.comentario ? `<p>${this.escapeHtml(data.comentario)}</p>` : ""}
    `;
    tooltip.hidden = false;
    this.positionTooltip(x, y);
  }

  positionTooltip(x, y) {
    if (!this.tooltip || this.tooltip.hidden) return;
    const padding = 14;
    const rect = this.tooltip.getBoundingClientRect();
    let left = x + 16;
    let top = y + 16;
    if (left + rect.width > window.innerWidth - padding)
      left = x - rect.width - 16;
    if (top + rect.height > window.innerHeight - padding)
      top = y - rect.height - 16;
    this.tooltip.style.left = `${Math.max(padding, left)}px`;
    this.tooltip.style.top = `${Math.max(padding, top)}px`;
  }

  hideTooltip() {
    if (this.tooltip) this.tooltip.hidden = true;
  }
}
