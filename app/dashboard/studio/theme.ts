// AG Studio theme for Tether, mapped directly from DESIGN.md to the CSS variables in
// app/globals.css so restyling later is a one-file change.

import { studioTheme } from 'ag-studio';

const token = (name: string) => `var(--${name})`;
const line = (color: string) => ({ width: 1, color: token(color) });

const palette = Object.fromEntries(
  Array.from({ length: 5 }, (_, i) => [
    [`chartPaletteFills${i + 1}Color`, token(`chart-${i + 1}`)],
    [`chartPaletteStrokes${i + 1}Color`, token(`chart-${i + 1}`)],
  ]).flat(),
);

export const agStudioTetherTheme = studioTheme.withParams({
  // Required DESIGN.md AG Studio theme mapping table parameters:
  accentColor: token('primary'),
  textColor: token('ink'),
  backgroundColor: token('canvas'),
  borderColor: token('canvas-soft'),
  fontFamily: token('font-sans-stack'),
  studioWidgetBorderRadius: 16,
  studioWidgetTitleTextColor: token('ink'),
  gridHeaderTextColor: token('mute'),
  gridRowHeight: 52,
  ...palette,

  // Additional surface & typography parameters referencing the same CSS variables:
  fontSize: 14,
  foregroundColor: token('ink'),
  subtleTextColor: token('mute'),
  iconColor: token('ink'),
  rowHoverColor: token('primary-pale'),

  // Cool-tinted canvas-soft background with white (canvas) widget cards on top.
  studioMinWidth: 320,
  studioCanvasMinWidth: 320,
  studioWrapperBorder: false,
  studioWrapperBorderRadius: 0,
  studioWrapperSpacing: 0,
  studioWrapperBackgroundColor: token('canvas-soft'),
  studioCanvasBorder: false,
  studioCanvasBorderRadius: 0,
  studioCanvasShadow: false,
  studioCanvasBackgroundColor: token('canvas-soft'),
  studioCanvasPadding: 16,
  studioCanvasRowHeight: 18,
  studioCanvasFontFamily: token('font-sans-stack'),

  // Widgets: white cards (--canvas), 16px radius, 8px inset, subtle canvas-soft border.
  studioWidgetBackgroundColor: token('canvas'),
  studioWidgetBorder: line('canvas-soft'),
  studioWidgetPadding: 8,
  studioWidgetTitleFontFamily: token('font-sans-stack'),
  studioWidgetTitleFontSize: 16,
  studioWidgetTitleFontWeight: 600,
  studioWidgetSubtitleFontFamily: token('font-sans-stack'),
  studioWidgetSubtitleFontSize: 12,
  studioWidgetSubtitleTextColor: token('mute'),
  studioWidgetCaptionFontFamily: token('font-sans-stack'),
  studioWidgetCaptionFontSize: 12,
  studioWidgetCaptionTextColor: token('mute'),
  studioWidgetResizeBorderColor: token('primary'),

  // Edit-mode panels
  studioPanelContainerBackgroundColor: token('canvas'),
  studioPanelContainerBorder: line('canvas-soft'),
  studioPanelContainerBorderRadius: 0,
  studioPanelDividerColor: token('canvas-soft'),
  studioPanelDividerActiveColor: token('primary'),
  studioPanelSectionBorderColor: token('canvas-soft'),
  studioPanelHeaderFontFamily: token('font-sans-stack'),
  studioPanelHeaderFontWeight: 600,
  studioPanelChevronButtonHoverBackgroundColor: token('primary-pale'),
  studioPanelChevronButtonHoverColor: token('primary-active'),
  studioToggleButtonActiveBackgroundColor: token('primary-pale'),
  studioToggleButtonActiveBorderColor: token('primary'),
  studioToggleButtonActiveColor: token('primary-active'),

  // Data tables / grid widgets (DESIGN.md data-table spec, 52px spacious rows, no heavy gridlines)
  gridFontFamily: token('font-sans-stack'),
  gridFontSize: 14,
  gridCellTextColor: token('ink'),
  gridHeaderBackgroundColor: token('canvas-soft'),
  gridHeaderFontWeight: 600,
  gridHeaderFontSize: 12,
  gridRowBorder: line('canvas-soft'),
  gridColumnBorder: { width: 1, color: 'transparent' },
  gridHeaderRowBorder: line('canvas-soft'),
  gridPinnedRowBorder: line('canvas-soft'),
  gridRowHoverColor: token('primary-pale'),
  gridWrapperBorder: false,

  // Charts
  chartFontFamily: token('font-sans-stack'),
  chartTextColor: token('ink'),
  chartSubtleTextColor: token('mute'),
  chartAxisLineColor: token('canvas-soft'),
  chartGridLineColor: token('canvas-soft'),
});

// Alias for existing import compatibility
export const agStudioPayPalTheme = agStudioTetherTheme;
