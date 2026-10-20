/**
 * 双端入口。
 *
 * 硬约束 1：手机端与桌面端是**两套独立视图**，不是一套布局的两种宽度。
 * 这里依据断点渲染两棵完全独立的组件树；
 * 业务逻辑层（src/core）共享，视图层（src/mobile / src/desktop）彻底分离。
 *
 * 断点：mobile ≤ 768px / desktop > 768px（core/breakpoint.ts BREAKPOINT.MOBILE_MAX）
 */
import { useEffect, useState } from 'react';
import { BREAKPOINT, useDevice, type Device } from './core/breakpoint';
import { initRealSnapshot } from './core/api';
import MobileApp from './mobile/MobileApp';
import DesktopApp from './desktop/DesktopApp';

export default function App() {
  const natural = useDevice();
  /** 手动切换（手机端顶栏「桌面版」/ 桌面端「手机版」按钮） */
  const [forced, setForced] = useState<Device | null>(null);

  // 后台预载真实数据快照（public/data/realdata.json），不阻塞渲染
  useEffect(() => {
    void initRealSnapshot();
  }, []);

  const effective: Device = forced ?? natural;

  if (effective === 'mobile') {
    // 手机端：≤768px，复刻 app-source 的 UI（顶栏 + 单列容器 + 底部 4 Tab）
    return <MobileApp onSwitchView={() => setForced('desktop')} />;
  }
  // 桌面端：>768px，独立设计（左侧边栏 + 顶栏 + 多栏内容区，无底部 Tab）
  return (
    <DesktopApp
      breakpoint={BREAKPOINT.MOBILE_MAX}
      onSwitchView={() => setForced('mobile')}
      onResetView={() => setForced(null)}
      isForced={forced === 'desktop'}
    />
  );
}
