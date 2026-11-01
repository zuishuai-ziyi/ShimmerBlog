/**
 * 滚动复位闸门（星光过渡专用）。
 *
 * 问题：vue-router 的 scrollBehavior 在「导航确认那一刻」就执行，out-in 过渡下
 * 旧页还要在舞台上停 580ms —— 于是离场动画刚开始，视口就被弹回顶部：
 * 离场蒙版的小窗是按旧滚动位置（离屏区域）规划的，跳到顶部后可见区一个窗都没有
 * → 整屏内容瞬间变黑，动画「出错」。（用户反馈：视口不在顶部时动画出错）
 *
 * 方案：星光过渡期间把滚动目标挂起（defer），由 App.vue 在 onEnter
 * （旧页已卸载、新页还全透明/被蒙版遮住）时同步应用，视觉上不会有位移跳变。
 */
export interface ScrollTarget {
  left?: number;
  top?: number;
}

let deferring = false;
let pending: ScrollTarget | null = null;

export const scrollGate = {
  /** 进入星光过渡：挂起滚动复位 */
  hold() {
    deferring = true;
    pending = null;
  },
  /** 记录路由要求的滚动位置 */
  set(target: ScrollTarget) {
    pending = target;
  },
  /** 取出并恢复常规行为（入场时调用） */
  take(): ScrollTarget | null {
    const p = pending;
    pending = null;
    deferring = false;
    return p;
  },
  get active() {
    return deferring;
  },
};
