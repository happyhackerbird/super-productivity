import { LiveAnnouncer } from '@angular/cdk/a11y';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  effect,
  HostListener,
  inject,
  NgZone,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { OnboardingHintService, OnboardingStep } from './onboarding-hint.service';
import { isTouchActive } from '../../util/input-intent';
import { GlobalConfigService } from '../config/global-config.service';
import { LayoutService } from '../../core-ui/layout/layout.service';
import { T } from '../../t.const';
import { truncate } from '../../util/truncate';

/** Max retries when target element is not yet in the DOM */
const MAX_POSITION_RETRIES = 10;
const POSITION_RETRY_DELAY_MS = 120;
/** Keeps the offer to about two lines in the 260px chip */
const MAX_TITLE_LENGTH = 32;

const UNDONE_TASK_ROW_SELECTOR = 'task-list .task-list-inner > task:not(.isDone)';

const swipeTargetSelector = (swipeTargetTaskId: string | null): string =>
  swipeTargetTaskId
    ? `task[data-task-id="${CSS.escape(swipeTargetTaskId)}"]`
    : UNDONE_TASK_ROW_SELECTOR;

interface StepConfig {
  selector: (isMobile: boolean, swipeTargetTaskId: string | null) => string;
  message: string;
  touchMessage?: string;
  /** Gesture icon shown before the message */
  icon?: string;
  showShortcut: boolean;
  /** Pulse the target element to draw attention to it */
  isPulse: boolean;
}

const STEP_CONFIGS = new Map<OnboardingStep, StepConfig>([
  [
    'create-task',
    {
      selector: (isMobile) => (isMobile ? '.add-task-button' : '.tour-addBtn'),
      message: T.ONBOARDING.HINTS.CREATE_TASK,
      touchMessage: T.ONBOARDING.HINTS.CREATE_TASK_TOUCH,
      showShortcut: true,
      isPulse: true,
    },
  ],
  [
    'track-offer',
    {
      // The existing header play button; disabled when nothing here can be tracked.
      selector: () => '.tour-playBtn:not(:disabled)',
      message: T.ONBOARDING.HINTS.TRACK_OFFER,
      touchMessage: T.ONBOARDING.HINTS.TRACK_OFFER_TOUCH,
      showShortcut: false,
      isPulse: true,
    },
  ],
  // Phones only. Anchored to the task row; task.component itself is untouched.
  [
    'task-swipe-left',
    {
      selector: (_isMobile, swipeTargetTaskId) => swipeTargetSelector(swipeTargetTaskId),
      message: T.ONBOARDING.HINTS.TASK_SWIPE_LEFT_TOUCH,
      icon: 'swipe_left',
      showShortcut: false,
      isPulse: false,
    },
  ],
  [
    'task-swipe-right',
    {
      selector: (_isMobile, swipeTargetTaskId) => swipeTargetSelector(swipeTargetTaskId),
      message: T.ONBOARDING.HINTS.TASK_SWIPE_RIGHT_TOUCH,
      icon: 'swipe_right',
      showShortcut: false,
      isPulse: false,
    },
  ],
]);

interface HintPosition {
  top: number;
  left: number;
  arrowOffset: number;
  arrowDirection: 'up' | 'down';
}

@Component({
  selector: 'onboarding-hint',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, MatButton, MatIcon],
  templateUrl: './onboarding-hint.component.html',
  styleUrl: './onboarding-hint.component.scss',
})
export class OnboardingHintComponent {
  T = T;
  onboardingHintService = inject(OnboardingHintService);
  hintPosition = signal<HintPosition | null>(null);
  hintMessage = signal<string>('');
  hintIcon = signal<string | null>(null);
  readonly hintMessageParams = computed(() => {
    const step = this.onboardingHintService.currentStep();
    return step ? this._getMessageParams(step) : {};
  });
  shortcutHint = signal<string | null>(null);

  private _globalConfigService = inject(GlobalConfigService);
  private _layoutService = inject(LayoutService);
  private _liveAnnouncer = inject(LiveAnnouncer);
  private _translateService = inject(TranslateService);
  private _activeStep: OnboardingStep | null = null;
  private _targetEl: HTMLElement | null = null;
  private _repositionFrame: number | null = null;
  private _pulsingEl: HTMLElement | null = null;
  private _resizeObserver: ResizeObserver | null = null;
  private _positionTimeout: ReturnType<typeof setTimeout> | null = null;
  private _repositionTimeout: ReturnType<typeof setTimeout> | null = null;
  readonly hintChipEl = viewChild<ElementRef<HTMLDivElement>>('hintChipEl');

  constructor() {
    effect((onCleanup) => {
      const step = this.onboardingHintService.currentStep();
      if (step === null) {
        return;
      }
      this._activeStep = step;
      this._targetEl = null;
      this.hintPosition.set(null);
      untracked(() => this._announce(step));
      this._schedulePosition(step, 0);

      onCleanup(() => {
        this._activeStep = null;
        this._targetEl = null;
        this._cleanupPulse();
        this._clearPositionTimeout();
        this._clearRepositionTimeout();
        this._resizeObserver?.disconnect();
      });
    });

    // The hint is position: fixed, so follow its target when anything scrolls
    // (capture phase: the task list scrolls inside its own container).
    const onViewportChange = (): void => this._scheduleReposition();
    const ngZone = inject(NgZone);
    ngZone.runOutsideAngular(() => {
      document.addEventListener('scroll', onViewportChange, {
        capture: true,
        passive: true,
      });
      window.addEventListener('resize', onViewportChange, { passive: true });
    });
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('scroll', onViewportChange, { capture: true });
      window.removeEventListener('resize', onViewportChange);
      if (this._repositionFrame !== null) {
        cancelAnimationFrame(this._repositionFrame);
      }
    });
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(event: KeyboardEvent): void {
    if (event.defaultPrevented) {
      return;
    }
    if (this.onboardingHintService.currentStep()) {
      this.skip();
    }
  }

  skip(): void {
    this.onboardingHintService.skip();
  }

  simplify(): void {
    this.onboardingHintService.simplifyToTodoList();
  }

  openSyncSetup(): void {
    void this.onboardingHintService.openSyncSetup();
  }

  private _announce(step: OnboardingStep): void {
    const config = STEP_CONFIGS.get(step);
    if (!config) {
      return;
    }
    const key = isTouchActive()
      ? (config.touchMessage ?? config.message)
      : config.message;
    void this._liveAnnouncer.announce(
      this._translateService.instant(key, this._getMessageParams(step)),
    );
  }

  private _getMessageParams(step: OnboardingStep): Record<string, string> {
    if (step !== 'track-offer') {
      return {};
    }
    // Exactly the task the play button would start, kept live if it changes.
    return {
      title: truncate(
        this.onboardingHintService.playTargetTask()?.title ?? '',
        MAX_TITLE_LENGTH,
      ),
    };
  }

  /** Re-anchor on scroll/resize, or attach once the target appears. */
  private _scheduleReposition(): void {
    if (this._repositionFrame !== null || !this._activeStep) {
      return;
    }
    this._repositionFrame = requestAnimationFrame(() => {
      this._repositionFrame = null;
      const step = this._activeStep;
      if (!step) {
        return;
      }
      if (this._targetEl?.isConnected) {
        this._calculatePosition(this._targetEl, step);
      } else {
        this._positionHintForStep(step);
      }
    });
  }

  private _measureHintHeight(): number | undefined {
    return this.hintChipEl()?.nativeElement.getBoundingClientRect().height || undefined;
  }

  private _schedulePosition(step: OnboardingStep, retryCount: number): void {
    this._positionTimeout = setTimeout(
      () => {
        const found = this._positionHintForStep(step);
        if (found) {
          return;
        }
        if (retryCount < MAX_POSITION_RETRIES) {
          this._schedulePosition(step, retryCount + 1);
        }
      },
      retryCount === 0 ? 0 : POSITION_RETRY_DELAY_MS,
    );
  }

  private _clearPositionTimeout(): void {
    if (this._positionTimeout !== null) {
      clearTimeout(this._positionTimeout);
      this._positionTimeout = null;
    }
  }

  private _clearRepositionTimeout(): void {
    if (this._repositionTimeout !== null) {
      clearTimeout(this._repositionTimeout);
      this._repositionTimeout = null;
    }
  }

  private _positionHintForStep(step: OnboardingStep): boolean {
    const config = STEP_CONFIGS.get(step);
    if (!config) {
      return false;
    }

    this._updateMessage(config, step);

    const isMobile = isTouchActive() && this._layoutService.isShowMobileBottomNav();
    const targetEl = document.querySelector<HTMLElement>(
      config.selector(isMobile, this.onboardingHintService.swipeTargetTaskId()),
    );
    if (!targetEl) {
      return false;
    }

    this._targetEl = targetEl;
    if (config.isPulse) {
      this._applyPulse(targetEl);
    } else {
      this._cleanupPulse();
    }
    this._calculatePosition(targetEl, step);

    // After the hint renders, re-measure with actual height for accurate positioning
    this._clearRepositionTimeout();
    this._repositionTimeout = setTimeout(() => {
      if (targetEl.isConnected) {
        this._calculatePosition(targetEl, step);
      }
    }, 0);

    this._resizeObserver?.disconnect();
    this._resizeObserver = new ResizeObserver(() => {
      if (targetEl.isConnected) {
        this._calculatePosition(targetEl, step);
      }
    });
    this._resizeObserver.observe(targetEl);
    return true;
  }

  private _updateMessage(config: StepConfig, step: OnboardingStep): void {
    this.hintMessage.set(
      isTouchActive() ? (config.touchMessage ?? config.message) : config.message,
    );
    this.hintIcon.set(config.icon ?? null);
    if (!isTouchActive() && config.showShortcut) {
      const shortcut = this._globalConfigService.cfg()?.keyboard?.addNewTask;
      this.shortcutHint.set(shortcut || null);
    } else {
      this.shortcutHint.set(null);
    }
  }

  private _calculatePosition(targetEl: HTMLElement, step: OnboardingStep): void {
    const rect = targetEl.getBoundingClientRect();
    // Must match max-width in onboarding-hint.component.scss
    const hintWidth = 260;
    // Prefer the rendered height: an estimate that is too small makes a hint
    // placed above its target (e.g. the mobile + button) cover it.
    const estimatedHintHeight = step === 'track-offer' ? 96 : isTouchActive() ? 76 : 48;
    const hintHeight = this._measureHintHeight() ?? estimatedHintHeight;
    const gap = 12;

    const spaceBelow = window.innerHeight - rect.bottom;
    const placeBelow = spaceBelow > hintHeight + gap;
    const top = Math.max(8, placeBelow ? rect.bottom + gap : rect.top - hintHeight - gap);

    const halfTargetWidth = rect.width / 2;
    const halfHintWidth = hintWidth / 2;
    const targetCenter = rect.left + halfTargetWidth;
    const left = Math.min(
      Math.max(8, targetCenter - halfHintWidth),
      window.innerWidth - hintWidth - 8,
    );

    const arrowOffset = Math.max(12, Math.min(targetCenter - left, hintWidth - 12));
    const direction: 'up' | 'down' = placeBelow ? 'up' : 'down';

    this.hintPosition.set({ top, left, arrowOffset, arrowDirection: direction });
  }

  private _applyPulse(el: HTMLElement): void {
    this._cleanupPulse();
    el.classList.add('onboarding-pulse');
    this._pulsingEl = el;
  }

  private _cleanupPulse(): void {
    this._pulsingEl?.classList.remove('onboarding-pulse');
    this._pulsingEl = null;
  }
}
