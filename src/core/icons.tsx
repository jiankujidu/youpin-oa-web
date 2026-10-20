/**
 * 共享 SVG 图标组件（双端通用，彻底替代此前散落的 emoji 图标）。
 *
 * 统一风格：24×24 视图、currentColor 描边、圆角端点，深色/浅色主题均自适应。
 * 用法：<Icon name="home" size={20} />。name 不存在时静默返回 null。
 */
import type { CSSProperties } from 'react';

const P: Record<string, string> = {
  home: 'M3 11.2 12 4l9 7.2M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5M9.5 21v-5h5v5',
  approve: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-3.2-8.6 2.2 2.2 4.4-4.6',
  customer: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-5 9a5 5 0 0 1 10 0M16 11a3 3 0 1 0 0-6M16 14a5 5 0 0 1 4 4',
  product: 'M9 3h6M10 3v5l-4 9a2 2 0 0 0 1.8 3h8.4a2 2 0 0 0 1.8-3l-4-9V3',
  file: 'M4 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z',
  note: 'M4 10v2a1 1 0 0 0 1 1h2l9 4.5V4.5L7 9H5a1 1 0 0 0-1 1Zm15-3v7',
  article: 'M4 5h16v9H10l-4 4v-4H4Zm3 3h10M7 12h7',
  message: 'M4 6h16v12H8l-4 4Zm0 0 8 5 8-5',
  mail: 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm2.5 3.5A2 2 0 1 0 7.5 12 2 2 0 0 0 7.5 7.5ZM5 17a3 3 0 0 1 5 0M14 9h5M14 13h5',
  contact: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0',
  chance: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  trace: 'M4 20h4L18 10l-4-4L4 16Zm9-11 3 3',
  order: 'M3 7l9-4 9 4-9 4Zm0 0v10l9 4 9-4V7M12 11v10',
  sample: 'M9 3h6M10 3v5l-4 9a2 2 0 0 0 1.8 3h8.4a2 2 0 0 0 1.8-3l-4-9V3',
  school: 'M3 9l9-4 9 4-9 4Zm-1 2v5m18-5v5M6 13v4m12-4v4M9 9v8m6-8v8',
  after: 'M14 7a4 4 0 0 1-5 5l-5 5a2 2 0 0 1-3-3l5-5a4 4 0 0 1 5-5l-2.5 2.5 2.5 2.5Z',
  finance: 'M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1H5a2 2 0 0 1-2 2Zm0 2v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8M16 13h2.5',
  deduction: 'M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4Z',
  margin: 'M12 3l7 3v6c0 5-3 8-7 9-4-1-7-4-7-9V6Z',
  invoice: 'M5 3h14v18l-3-2-3 2-3-2-3 2Zm3-1v4m0 4h8M8 15h5',
  financeIncome: 'M5 21V10M10 21V5M15 21v-8M20 21V13M3 21h18',
  financeOrder: 'M3 17l6-6 4 4 8-8M21 7v5h-5',
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm8.4 3a8 8 0 0 0-.2-1.9l2-1.5-2-3.4-2.3 1a8 8 0 0 0-3-1.8L14 2h-4l-.5 2.5a8 8 0 0 0-3 1.8l-2.3-1-2 3.4 2 1.5a8 8 0 0 0 0 3.8l-2 1.5 2 3.4 2.3-1a8 8 0 0 0 3 1.8L10 22h4l.5-2.5a8 8 0 0 0 3-1.8l2.3 1 2-3.4-2-1.5c.1-.6.2-1.2.2-1.9Z',
  logout: 'M14 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 12h10M17 8l4 4-4 4',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0',
  personPlus: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-5 9a5 5 0 0 1 10 0M18 7v6M15 10h6',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm6 12 4 4',
  bell: 'M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 20a2 2 0 0 0 4 0',
  lock: 'M6 11h12v9H6Zm2 0V8a4 4 0 0 1 8 0v3',
  key: 'M14 8a4 4 0 1 0-3 6.6L7 18.2V21h3v-2h2v-2h2l3-3A4 4 0 0 0 14 8Zm-4 4a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z',
  phone: 'M4 5c0 9 6 15 15 15l1.4-3.4-4-2-2 2c-2-1.5-4-3.5-5.5-5.5l2-2-2-4Z',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6 6 18',
  back: 'M15 5l-7 7 7 7',
  chevronRight: 'M9 5l7 7-7 7',
  chevronDown: 'M5 9l7 7 7-7',
  upload: 'M12 16V5M8 9l4-4 4 4M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2',
  download: 'M12 4v11M8 11l4 4 4-4M4 19h16',
  share: 'M6 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12 6a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0-12a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8.7 10.7 15.3 7M8.7 13.3 15.3 17',
  star: 'M12 3l2.7 5.5 6 .9-4.3 4.2 1 6L12 17.8 6.6 19.6l1-6L3.3 9.4l6-.9Z',
  refresh: 'M20 11a8 8 0 1 0-2 6M20 5v6h-6',
  more: 'M5 12a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm7 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm7 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
  document: 'M6 3h8l4 4v14H6Zm7 0v5h5M9 12h6M9 15h6',
  grid: 'M4 4h7v7H4Zm9 0h7v7h-7Zm-9 9h7v7H4Zm9 0h7v7h-7Z',
  monitor: 'M3 5h18v11H3Zm2 14h14M9 19l1 2h4l1-2',
  check: 'M5 12l4 4 10-10',
  calendar: 'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Zm0 4h16M8 2v4M16 2v4',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4 4-2.5V8',
  cart: 'M3 4h2l2.4 12.5a1 1 0 0 0 1 .8h8.6a1 1 0 0 0 1-.8L20 8H6M9 22a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm9 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  wrench: 'M14 7a4 4 0 0 1-5 5l-5 5a2 2 0 0 1-3-3l5-5a4 4 0 0 1 5-5l-2.5 2.5 2.5 2.5Z',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  shield: 'M12 3l7 3v6c0 5-3 8-7 9-4-1-7-4-7-9V6Z',
  receipt: 'M5 3h14v18l-3-2-3 2-3-2-3 2Zm3-1v4m0 4h8M8 15h5',
  wallet: 'M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1H5a2 2 0 0 1-2 2Zm0 2v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8M16 13h2.5',
  plane: 'M21 15l-8-4-3-7-2 1 2 6-5 1-1 2 5 1 2 5 1-1-1-6 3-1 3-4Z',
  walk: 'M13 4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM11 8l2 2 1 6 3 2M9 11l-1 4 3 1M9 21l2-5',
  stamp: 'M8 4h8v4H8Zm-1 4h10v3a4 4 0 0 1-4 4h-2a4 4 0 0 1-4-4ZM12 14v6',
  car: 'M5 16a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm14 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM4 12l2-5h12l2 5M3 12v4h2m14-4v4h2',
  edit: 'M4 20h4L18 10l-4-4L4 16Zm9-11 3 3',
  trash: 'M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  location: 'M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11Zm0-8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
};

export type IconName = keyof typeof P;

export function Icon({
  name,
  size = 20,
  className,
  style,
  strokeWidth = 1.8,
}: {
  name: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
  strokeWidth?: number;
}) {
  const d = P[name];
  if (!d) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} />
    </svg>
  );
}
