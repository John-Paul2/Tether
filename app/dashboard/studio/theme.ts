// AG Studio theme for Tether Noir, mapped directly to the CSS variables in app/tokens.css
// so restyling or switching to a future light theme is a one-file change in tokens.css.

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
  browserColorScheme: 'dark',
  accentColor: token('accent'),
  textColor: token('text-1'),
  foregroundColor: token('text-1'),
  subtleTextColor: token('text-2'),
  iconColor: token('text-2'),
  backgroundColor: token('bg-surface'),
  borderColor: token('border'),
  borderRadius: 8,
  fontFamily: token('font-ui-stack'),
  fontSize: 14,
  rowHoverColor: token('bg-raised'),
  invalidColor: token('drift'),
  ...palette,

  // Popovers, menus, tooltips, dialogs
  popupShadow: token('shadow-popover'),
  dropdownShadow: token('shadow-popover'),
  menuShadow: token('shadow-popover'),
  dialogShadow: token('shadow-popover'),
  menuBackgroundColor: token('bg-raised'),
  menuTextColor: token('text-1'),
  menuBorder: line('border-strong'),
  menuSeparatorColor: token('border'),
  dialogBorder: line('border-strong'),
  tooltipBackgroundColor: token('bg-raised'),
  tooltipTextColor: token('text-1'),
  tooltipBorder: line('border-strong'),

  // Controls inside Studio panels
  inputBackgroundColor: token('bg-sunken'),
  inputTextColor: token('text-1'),
  inputPlaceholderTextColor: token('text-3'),
  inputBorder: line('border'),
  inputBorderRadius: 8,
  inputFocusBackgroundColor: token('bg-sunken'),
  inputFocusBorder: line('accent'),
  pickerButtonBackgroundColor: token('bg-sunken'),
  pickerButtonBorder: line('border'),
  pickerButtonBorderRadius: 8,
  pickerListBackgroundColor: token('bg-raised'),
  pickerListBorder: line('border-strong'),
  buttonTextColor: token('text-1'),
  buttonBackgroundColor: token('bg-raised'),
  buttonBorder: line('border'),
  buttonBorderRadius: 999,
  buttonHoverBackgroundColor: token('ai-soft'),
  buttonHoverBorder: line('accent'),

  // Canvas: ink page background (--bg-page) with surface cards (--bg-surface) on top
  studioMinWidth: 320,
  studioCanvasMinWidth: 320,
  studioWrapperBorder: false,
  studioWrapperBorderRadius: 0,
  studioWrapperSpacing: 0,
  studioWrapperBackgroundColor: token('bg-page'),
  studioCanvasBorder: false,
  studioCanvasBorderRadius: 0,
  studioCanvasShadow: false,
  studioCanvasBackgroundColor: token('bg-page'),
  studioCanvasPadding: 16,
  studioCanvasRowHeight: 18,
  studioCanvasFontFamily: token('font-ui-stack'),

  // Widgets: surface cards (--bg-surface), 12px radius, 1px --border
  studioWidgetBorderRadius: 12,
  studioWidgetBackgroundColor: token('bg-surface'),
  studioWidgetBorder: line('border'),
  studioWidgetPadding: 8,
  studioWidgetTitleFontFamily: token('font-ui-stack'),
  studioWidgetTitleFontSize: 16,
  studioWidgetTitleFontWeight: 600,
  studioWidgetTitleTextColor: token('text-1'),
  studioWidgetSubtitleFontFamily: token('font-ui-stack'),
  studioWidgetSubtitleFontSize: 12,
  studioWidgetSubtitleTextColor: token('text-2'),
  studioWidgetCaptionFontFamily: token('font-ui-stack'),
  studioWidgetCaptionFontSize: 12,
  studioWidgetCaptionTextColor: token('text-3'),
  studioWidgetResizeBorderColor: token('accent'),
  studioWidgetToolbarBackgroundColor: token('bg-raised'),
  studioWidgetToolbarBorder: line('border-strong'),
  studioWidgetToolbarShadow: token('shadow-popover'),
  studioWidgetToolbarButtonColor: token('text-2'),
  studioWidgetToolbarButtonHoverBackgroundColor: token('ai-soft'),

  // Edit-mode panels
  studioPanelContainerBackgroundColor: token('bg-surface'),
  studioPanelContainerBorder: line('border'),
  studioPanelContainerBorderRadius: 0,
  studioPanelDividerColor: token('border'),
  studioPanelDividerActiveColor: token('accent'),
  studioPanelSectionBorderColor: token('border'),
  studioPanelGroupBackgroundColor: token('bg-sunken'),
  studioPanelGroupTitleBarTextColor: token('text-2'),
  studioPanelHeaderFontFamily: token('font-ui-stack'),
  studioPanelHeaderFontWeight: 600,
  studioPanelChevronButtonHoverBackgroundColor: token('ai-soft'),
  studioPanelChevronButtonHoverColor: token('accent'),
  studioToggleButtonActiveBackgroundColor: token('ai-soft'),
  studioToggleButtonActiveBorderColor: token('accent'),
  studioToggleButtonActiveColor: token('accent'),

  // Data tables / grid widgets (design spec 4 & 6.5: 48px row height, 14px text, sunken header)
  gridBrowserColorScheme: 'dark',
  gridAccentColor: token('accent'),
  gridFontFamily: token('font-ui-stack'),
  gridFontSize: 14,
  gridDataFontSize: 14,
  gridCellFontSize: 14,
  gridCellTextColor: token('text-1'),
  gridDataBackgroundColor: token('bg-surface'),
  gridOddRowBackgroundColor: token('bg-surface'),
  gridHeaderBackgroundColor: token('bg-sunken'),
  gridHeaderTextColor: token('text-2'),
  gridHeaderFontFamily: token('font-ui-stack'),
  gridHeaderFontWeight: 600,
  gridHeaderFontSize: 12,
  gridIconColor: token('text-2'),
  gridRowHeight: 48,
  gridHeaderHeight: 40,
  gridRowBorder: line('border'),
  gridColumnBorder: { width: 1, color: 'transparent' },
  gridHeaderRowBorder: line('border'),
  gridPinnedRowBorder: line('border'),
  gridRowHoverColor: token('bg-raised'),
  gridWrapperBorder: false,

  // Charts
  chartFontFamily: token('font-ui-stack'),
  chartFontSize: 12,
  chartTextColor: token('text-1'),
  chartSubtleTextColor: token('text-2'),
  chartAxisLineColor: token('border'),
  chartGridLineColor: token('border'),
  chartPopupShadow: token('shadow-popover'),
});

// Alias for existing import compatibility
export const agStudioPayPalTheme = agStudioTetherTheme;
