import { useEffect, useState } from 'react';

/**
 * 断点规则（硬约束：显式写入代码）
 *   mobile  : 视口宽度 ≤ 768px
 *   desktop : 视口宽度 >  768px
 */
export const BREAKPOINT = {
  MOBILE_MAX: 768,
} as const;

export type Device = 'mobile' | 'desktop';

export const MOBILE_QUERY = `(max-width: ${BREAKPOINT.MOBILE_MAX}px)`;

function detect(): Device {
  if (typeof window === 'undefined' || !window.matchMedia) return 'desktop';
  return window.matchMedia(MOBILE_QUERY).matches ? 'mobile' : 'desktop';
}

/**
 * 设备判定。返回 'mobile' | 'desktop'。
 * App.tsx 依据它渲染**两套完全独立的组件树**，而非同一套 DOM 加媒体查询。
 */
export function useDevice(): Device {
  const [device, setDevice] = useState<Device>(detect);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(MOBILE_QUERY);
    const onChange = (e: MediaQueryListEvent) => setDevice(e.matches ? 'mobile' : 'desktop');
    // Safari < 14 只有 addListener
    if (mql.addEventListener) {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    }
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, []);

  return device;
}
