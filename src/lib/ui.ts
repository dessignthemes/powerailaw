// Shared look for page buttons, so every section stays consistent.
// Top-right page buttons (e.g. "+ New template", "+ Add matter"): light blue pill, darker blue-grey on hover.
export const pageBtn =
  "bg-chip hover:bg-btn text-ink px-3.5 py-2 rounded-full text-[13px] font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors";
// Same button while its menu is open.
export const pageBtnOpen =
  "bg-btn text-ink px-3.5 py-2 rounded-full text-[13px] font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors";
// Dropdown menus: white panel with the grey-blue ring (same as the AI Templates "New template" menu).
export const menuPanel =
  "bg-white rounded-2xl shadow-[0_0_0_6px_#ECEFF6,0_0_0_7px_#E1E5EE,0_24px_50px_-18px_rgba(18,17,16,0.28)] p-1.5";
export const menuItem = "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13.5px] font-medium hover:bg-[#F4F6FA] transition-colors text-left";
// Widget frame (outer grey-blue) and its white inner panel.
export const frameOuter =
  "bg-[#ECEFF6] rounded-[22px] border border-[#E1E5EE] p-1.5 shadow-[0_2px_6px_-1px_rgba(27,25,26,0.07)]";
export const frameInner = "bg-white rounded-2xl border border-[#E3E7EF] shadow-[0_1px_3px_rgba(27,25,26,0.06)]";
export const frameTitle = "font-mono text-[11px] uppercase tracking-[0.12em] text-muted flex items-center gap-2";
// Trial (Nov 2026): the same buttons with a 1px border in the hover colour.
// Used on AI Templates, Client Intake, Matters and Contacts. If it stays, fold the border into pageBtn above.
export const pageBtnB = `${pageBtn} border border-btn`;
export const pageBtnOpenB = `${pageBtnOpen} border border-btn`;
// Small buttons inside rows/panels: same bordered look, smaller.
export const smallBtnB =
  "bg-chip hover:bg-btn border border-btn text-ink px-3 py-1.5 rounded-full text-[12.5px] font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors disabled:opacity-50";
// Light rows inside white panels.
export const rowLight = "bg-[#F4F6FA] border border-[#E6EAF1] rounded-xl";
// A single white panel drawn with the widget frame around it (grey-blue ring), for blocks without a title.
export const framedPanel =
  "bg-white border border-[#E3E7EF] rounded-2xl m-[7px] shadow-[0_0_0_6px_#ECEFF6,0_0_0_7px_#E1E5EE,0_3px_8px_-1px_rgba(27,25,26,0.08)]";
