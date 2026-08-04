# Avance de células — Versión 3.0 profesional

Dashboard institucional para el seguimiento de la implementación del Expediente Clínico Electrónico.

## Gantt profesional

- Desplazamiento horizontal nativo.
- Navegación con las flechas izquierda y derecha.
- Mayús + flecha para desplazamientos largos.
- Arrastre con el mouse o touchpad.
- Zoom por meses, semanas y días.
- Columna de actividades y encabezado fijos.
- Línea de fecha de corte.
- Tooltips con detalle de las actividades.
- Actividades pendientes de programar.
- Diseño responsivo y colores institucionales.

## Actualizar datos

1. Sustituye `data/cronograma.xlsx` y `data/unidades.xlsx`.
2. Ejecuta `python build_data.py`.
3. Inicia el sitio con `python -m http.server 8000`.
4. Abre `http://localhost:8000`.

## GitHub Pages

Los archivos JSON generados son estáticos y pueden publicarse con el resto del proyecto.

## Controles del Gantt

- **← / →**: desplaza el periodo visible.
- **Mayús + ← / →**: desplazamiento largo.
- **Arrastrar con el mouse**: navegación horizontal directa.
- **Meses / Semanas / Días**: cambia el nivel de zoom.
- **Fecha de corte**: centra la línea de referencia.

La columna izquierda y la cabecera permanecen fijas para evitar desalineaciones y pérdida de contexto.


## Cambios 3.3
- Tooltips del Gantt restaurados, incluso para barras muy cortas.
- Los comentarios filtran el tablero por célula y entidad al hacer clic.
- Encabezado con mayor presencia de colores institucionales.


## Iteración 1 — Núcleo del Gantt profesional

Esta entrega consolida el rango temporal global, zoom por meses/semanas/días, navegación por teclado, arrastre con mouse, cabecera y columna fijas, cuadrícula temporal, sombreado de fines de semana, línea de fecha de corte y tooltips accesibles. Los filtros solo ocultan filas: no modifican el ancho ni la escala global del cronograma.

### Teclado

- `←` y `→`: desplazamiento horizontal.
- `Mayús + ←/→`: desplazamiento largo.
- `Inicio` y `Fin`: extremos de la línea temporal mediante botones.

## Versión 3.5 — Design System sobrio

Esta versión incorpora una capa visual independiente en `css/theme.css`:

- Tipografía global **Noto Sans**.
- Fondo general claro `#F6F7F5`.
- Tarjetas blancas con bordes y sombras discretas.
- Header institucional verde, compacto y sin fondo oscuro en toda la página.
- KPIs blancos con una línea superior de color.
- Filtros, rankings, comentarios, tabla y Gantt con una identidad uniforme.
- Colores intensos reservados para estados, acciones y fecha de corte.

Para modificar la identidad visual, edita primero las variables de `:root` en `css/theme.css`.
"# avance_celulas_eds" 
