import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { MatButton } from '@angular/material/button';
import { TranslatePipe } from '@ngx-translate/core';
import { Log } from '../../../../core/log';
import { SnackService } from '../../../../core/snack/snack.service';
import { T } from '../../../../t.const';
import { LocaleDatePipe } from '../../../../ui/pipes/locale-date.pipe';
import { TaskReadAccess, TaskReadPublisherService } from '../task-read-publisher.service';

interface ReadView {
  /** Translation key of the state line, if any. */
  line: string | null;
  /** `{{time}}` of the state line: when the server's list was shared. */
  time: number | null;
  /** The line saying this device shares the list (state 3). */
  isOnLine: boolean;
  hasStop: boolean;
  hasOn: boolean;
  hasResume: boolean;
}

const LOADING_VIEW: ReadView = {
  line: null,
  time: null,
  isOnLine: false,
  hasStop: false,
  hasOn: false,
  hasResume: false,
};

/**
 * Switch for task reading inside the AI assistants block. Its state comes
 * from the server, so the stop button is offered whenever the server may
 * hold a list, whatever this device's synced opt-in says.
 */
@Component({
  selector: 'agent-read-settings',
  templateUrl: './agent-read-settings.component.html',
  styleUrl: './agent-read-settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButton, TranslatePipe, LocaleDatePipe],
})
export class AgentReadSettingsComponent implements OnInit {
  readonly T = T;
  /** Capture switched on (`sync.captureKey`): reading can only be switched on with it. */
  readonly captureEnabled = input.required<boolean>();

  private readonly _publisher = inject(TaskReadPublisherService);
  private readonly _snackService = inject(SnackService);

  readonly isBusy = signal(false);
  /** null until the server answered. */
  private readonly _access = signal<TaskReadAccess | 'failed' | null>(null);

  readonly view = computed((): ReadView => {
    const access = this._access();
    if (access === null) return LOADING_VIEW;
    const canSwitchOn = this.captureEnabled();
    const keys = T.F.SYNC.FORM.SUPER_SYNC;
    // (1) Unknown: the server may hold a list.
    if (access === 'failed') {
      return { ...LOADING_VIEW, line: keys.CAPTURE_READ_STATE_UNKNOWN, hasStop: true };
    }
    const isSameId = access.enableId === this._publisher.enableId();
    // (2) Off: no enablement, or another one with nothing shared yet.
    if (!access.enabled || (!isSameId && access.publishedAt === null)) {
      return { ...LOADING_VIEW, hasOn: canSwitchOn };
    }
    // (3) On for this account's synced opt-in.
    if (isSameId) {
      return {
        ...LOADING_VIEW,
        line:
          access.publishedAt === null
            ? keys.CAPTURE_READ_STATE_ON_PENDING
            : keys.CAPTURE_READ_STATE_ON,
        time: access.publishedAt,
        isOnLine: true,
        hasStop: true,
      };
    }
    // (4) A list is shared, but no device publishes against its enablement.
    return {
      ...LOADING_VIEW,
      line: keys.CAPTURE_READ_STATE_ON_NOT_PUBLISHING,
      time: access.publishedAt,
      hasStop: true,
      hasResume: canSwitchOn,
    };
  });

  ngOnInit(): void {
    void this._refresh();
  }

  turnOn(): Promise<void> {
    return this._run(() => this._publisher.switchOn());
  }

  turnOff(): Promise<void> {
    return this._run(() => this._publisher.switchOff());
  }

  private async _refresh(): Promise<void> {
    try {
      this._access.set(await this._publisher.getAccess());
    } catch (e) {
      Log.err('Agent read settings: access check failed', {
        name: e instanceof Error ? e.name : typeof e,
      });
      this._access.set('failed');
    }
  }

  /** One request at a time; failures surface as a snack, logged without content. */
  private async _run(fn: () => Promise<void>): Promise<void> {
    if (this.isBusy()) return;
    this.isBusy.set(true);
    try {
      await fn();
    } catch (e) {
      Log.err('Agent read settings action failed', {
        name: e instanceof Error ? e.name : typeof e,
      });
      this._snackService.open({
        type: 'ERROR',
        msg: T.F.SYNC.FORM.SUPER_SYNC.CAPTURE_READ_S_ERROR,
      });
    } finally {
      // Shows what the server holds now, after success or failure.
      await this._refresh();
      this.isBusy.set(false);
    }
  }
}
