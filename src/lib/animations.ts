import gsap from 'gsap';

export const ANIM_CONFIG = {
  duration: {
    fast: 0.15,
    normal: 0.25,
    smooth: 0.35,
    counter: 0.6,
  },
  ease: {
    default: 'power2.out',
    snappy: 'power3.out',
    modal: 'back.out(1.15)',
    in: 'power2.in',
    smoothInOut: 'power2.inOut',
    bounce: 'back.out(1.6)',
  },
};

/**
 * Animate page entrance transition (Start to Bottom)
 */
export function animatePageEntrance(target: HTMLElement | null, onComplete?: () => void) {
  if (!target) return;
  gsap.fromTo(
    target,
    { opacity: 0, y: -26 },
    {
      opacity: 1,
      y: 0,
      duration: ANIM_CONFIG.duration.smooth,
      ease: ANIM_CONFIG.ease.snappy,
      clearProps: 'transform,opacity',
      onComplete,
    }
  );
}

/**
 * Animate page entrance from top downward (Start to Bottom)
 */
export function animatePageEntranceStartToBottom(target: HTMLElement | null, onComplete?: () => void) {
  if (!target) return;
  gsap.fromTo(
    target,
    { opacity: 0, y: -28 },
    {
      opacity: 1,
      y: 0,
      duration: 0.32,
      ease: 'power3.out',
      clearProps: 'transform,opacity',
      onComplete,
    }
  );
}

/**
 * Animate page exit towards top (End to Top)
 */
export function animatePageExitEndToTop(target: HTMLElement | null, onComplete?: () => void) {
  if (!target) {
    if (onComplete) onComplete();
    return;
  }
  gsap.to(target, {
    opacity: 0,
    y: -28,
    duration: 0.18,
    ease: 'power2.in',
    onComplete,
  });
}

/**
 * Animate modal entrance dialog with backdrop
 */
export function animateModalOpen(modal: HTMLElement | null, backdrop?: HTMLElement | null) {
  if (backdrop) {
    gsap.fromTo(
      backdrop,
      { opacity: 0 },
      { opacity: 1, duration: ANIM_CONFIG.duration.normal, ease: ANIM_CONFIG.ease.default }
    );
  }
  if (modal) {
    gsap.fromTo(
      modal,
      { scale: 0.95, opacity: 0, y: -8 },
      {
        scale: 1,
        opacity: 1,
        y: 0,
        duration: ANIM_CONFIG.duration.normal,
        ease: ANIM_CONFIG.ease.modal,
        clearProps: 'transform',
      }
    );
  }
}

/**
 * Animate modal close dialog
 */
export function animateModalClose(
  modal: HTMLElement | null,
  backdrop: HTMLElement | null | undefined,
  onComplete: () => void
) {
  const tl = gsap.timeline({ onComplete });
  if (backdrop) {
    tl.to(backdrop, { opacity: 0, duration: ANIM_CONFIG.duration.fast, ease: ANIM_CONFIG.ease.in }, 0);
  }
  if (modal) {
    tl.to(modal, { scale: 0.96, opacity: 0, y: -4, duration: ANIM_CONFIG.duration.fast, ease: ANIM_CONFIG.ease.in }, 0);
  }
}

/**
 * Animate slide-over drawer entrance (Mobile: bottom sheet slide-up; Desktop/Tablet: right slide-in)
 */
export function animateDrawerOpen(
  drawer: HTMLElement | null,
  backdrop?: HTMLElement | null,
  isMobile: boolean = typeof window !== 'undefined' ? window.innerWidth < 768 : false
) {
  if (backdrop) {
    gsap.fromTo(
      backdrop,
      { opacity: 0 },
      { opacity: 1, duration: ANIM_CONFIG.duration.smooth, ease: ANIM_CONFIG.ease.default }
    );
  }
  if (drawer) {
    if (isMobile) {
      gsap.fromTo(
        drawer,
        { y: '100%', opacity: 0.9 },
        {
          y: '0%',
          opacity: 1,
          duration: ANIM_CONFIG.duration.smooth,
          ease: ANIM_CONFIG.ease.snappy,
          clearProps: 'transform',
        }
      );
    } else {
      gsap.fromTo(
        drawer,
        { x: '100%', opacity: 0.8 },
        {
          x: '0%',
          opacity: 1,
          duration: ANIM_CONFIG.duration.smooth,
          ease: ANIM_CONFIG.ease.snappy,
          clearProps: 'transform',
        }
      );
    }
  }
}

/**
 * Animate slide-over drawer exit (Mobile: slide-down; Desktop/Tablet: slide-right)
 */
export function animateDrawerClose(
  drawer: HTMLElement | null,
  backdrop: HTMLElement | null | undefined,
  onComplete: () => void,
  isMobile: boolean = typeof window !== 'undefined' ? window.innerWidth < 768 : false
) {
  const tl = gsap.timeline({ onComplete });
  if (backdrop) {
    tl.to(backdrop, { opacity: 0, duration: ANIM_CONFIG.duration.fast, ease: ANIM_CONFIG.ease.in }, 0);
  }
  if (drawer) {
    if (isMobile) {
      tl.to(drawer, { y: '100%', opacity: 0.5, duration: ANIM_CONFIG.duration.normal, ease: 'power3.in' }, 0);
    } else {
      tl.to(drawer, { x: '100%', opacity: 0.5, duration: ANIM_CONFIG.duration.normal, ease: 'power3.in' }, 0);
    }
  }
}

/**
 * Stagger entrance of card elements (e.g. Bento cards, Search list, Matrix metrics)
 */
export function animateStaggerCards(container: HTMLElement | null, selector: string = '.stagger-item', stagger = 0.04) {
  if (!container) return;
  const items = container.querySelectorAll(selector);
  if (!items.length) return;

  gsap.fromTo(
    items,
    { opacity: 0, y: 12 },
    {
      opacity: 1,
      y: 0,
      duration: ANIM_CONFIG.duration.smooth,
      stagger,
      ease: ANIM_CONFIG.ease.default,
      clearProps: 'transform,opacity',
    }
  );
}

/**
 * Stagger entrance of table rows
 */
export function animateStaggerRows(container: HTMLElement | null, selector: string = 'tbody tr', stagger = 0.02) {
  if (!container) return;
  const rows = container.querySelectorAll(selector);
  if (!rows.length) return;

  gsap.fromTo(
    rows,
    { opacity: 0, y: 6 },
    {
      opacity: 1,
      y: 0,
      duration: ANIM_CONFIG.duration.normal,
      stagger: Math.min(stagger, 0.03),
      ease: ANIM_CONFIG.ease.default,
      clearProps: 'transform,opacity',
    }
  );
}

/**
 * Shake an element horizontally (e.g., wrong PIN code or validation failure)
 */
export function animateShake(target: HTMLElement | null) {
  if (!target) return;
  gsap.fromTo(
    target,
    { x: 0 },
    {
      x: 8,
      duration: 0.05,
      repeat: 5,
      yoyo: true,
      ease: ANIM_CONFIG.ease.smoothInOut,
      onComplete: () => {
        gsap.set(target, { x: 0 });
      },
    }
  );
}

/**
 * Smooth financial number counter
 */
export function animateNumberCounter(
  target: HTMLElement | null,
  endValue: number,
  formatter?: (val: number) => string,
  duration: number = ANIM_CONFIG.duration.counter
) {
  if (!target) return;
  const obj = { val: 0 };
  gsap.to(obj, {
    val: endValue,
    duration,
    ease: 'power1.out',
    onUpdate: () => {
      target.textContent = formatter ? formatter(Math.round(obj.val)) : Math.round(obj.val).toLocaleString('en-IN');
    },
  });
}

/**
 * Animate error banner entrance with spring slide-down and subtle shake
 */
export function animateErrorBanner(target: HTMLElement | null) {
  if (!target) return;
  const tl = gsap.timeline();
  tl.fromTo(
    target,
    { opacity: 0, y: -16, scale: 0.98 },
    {
      opacity: 1,
      y: 0,
      scale: 1,
      duration: 0.28,
      ease: 'back.out(1.4)',
      clearProps: 'transform',
    }
  ).fromTo(
    target,
    { x: 0 },
    {
      x: 6,
      duration: 0.05,
      repeat: 4,
      yoyo: true,
      ease: 'power1.inOut',
      onComplete: () => {
        gsap.set(target, { x: 0 });
      },
    },
    '-=0.08'
  );
}

/**
 * Animate success banner / pulse entrance
 */
export function animateSuccessBanner(target: HTMLElement | null) {
  if (!target) return;
  gsap.fromTo(
    target,
    { opacity: 0, scale: 0.94, y: -8 },
    {
      opacity: 1,
      scale: 1,
      y: 0,
      duration: 0.35,
      ease: 'back.out(1.5)',
      clearProps: 'transform',
    }
  );
}

/**
 * Animate verified seal stamp
 */
export function animateStamp(target: HTMLElement | null) {
  if (!target) return;
  gsap.fromTo(
    target,
    { opacity: 0, scale: 1.8, rotation: -12 },
    {
      opacity: 1,
      scale: 1,
      rotation: 0,
      duration: 0.4,
      ease: 'back.out(1.8)',
      clearProps: 'transform',
    }
  );
}

/**
 * Animate smooth progress bar fill
 */
export function animateProgressBar(target: HTMLElement | null, percentage: number, duration: number = 0.4) {
  if (!target) return;
  gsap.to(target, {
    width: `${Math.min(Math.max(percentage, 0), 100)}%`,
    duration,
    ease: 'power2.out',
  });
}

/**
 * Flash emerald highlight on freshly synchronized or updated rows
 */
export function animateRowHighlight(target: HTMLElement | null) {
  if (!target) return;
  gsap.fromTo(
    target,
    { backgroundColor: 'rgba(62, 207, 142, 0.25)' },
    {
      backgroundColor: 'transparent',
      duration: 1.6,
      ease: 'power2.out',
      clearProps: 'backgroundColor',
    }
  );
}

/**
 * Animate floating toast notification
 */
export function animateToast(target: HTMLElement | null) {
  if (!target) return;
  gsap.fromTo(
    target,
    { opacity: 0, y: 20, scale: 0.9 },
    {
      opacity: 1,
      y: 0,
      scale: 1,
      duration: 0.25,
      ease: 'power3.out',
      clearProps: 'transform',
    }
  );
}

export default gsap;
