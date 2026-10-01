import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { T } from '../../../t.const';
import { CdkDrag, CdkDropList } from '@angular/cdk/drag-drop';
import { PlannerTaskComponent } from '../planner-task/planner-task.component';
import { PlannerDeadlineTaskComponent } from '../planner-deadline-task/planner-deadline-task.component';
import { MsToStringPipe } from '../../../ui/duration/ms-to-string.pipe';
import { RoundDurationPipe } from '../../../ui/pipes/round-duration.pipe';
import { MatIcon } from '@angular/material/icon';
import { TaskCopy } from '../../tasks/task.model';
import { OVERDUE_LIST_ID } from '../planner.model';
import { TranslatePipe } from '@ngx-translate/core';
import { dragDelayForTouch } from '../../../util/input-intent';
import { LayoutService } from '../../../core-ui/layout/layout.service';
import { partitionTasksByAnyPlannerGroup } from '../store/planner-task-groups.util';
import { Store } from '@ngrx/store';
import { selectTodayTagTaskIds } from '../../tag/store/tag.reducer';

@Component({
  selector: 'planner-day-overdue',
  templateUrl: './planner-day-overdue.component.html',
  styleUrl: './planner-day-overdue.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CdkDropList,
    PlannerTaskComponent,
    PlannerDeadlineTaskComponent,
    CdkDrag,
    MatIcon,
    MsToStringPipe,
    RoundDurationPipe,
    TranslatePipe,
  ],
})
export class PlannerDayOverdueComponent {
  private _layoutService = inject(LayoutService);
  private readonly _storedTodayTaskIds =
    inject(Store).selectSignal(selectTodayTagTaskIds);
  overdueTasks = input<TaskCopy[] | null>();
  overdueDeadlineTasks = input<TaskCopy[] | null>();
  totalEstimate = computed(() => {
    const tasks = this.overdueTasks();
    if (!tasks) return 0;
    return tasks.reduce((acc, task) => acc + (task.timeEstimate || 0), 0);
  });

  // Groups made on earlier days stay together here instead of merging.
  // Overdue tasks arrive in creation order; a group keeps the order it had on
  // its day, which the Today list still stores.
  partitioned = computed(() => {
    const { ungroupedTasks, taskGroups } = partitionTasksByAnyPlannerGroup(
      this.overdueTasks() || [],
    );
    const rank = new Map(this._storedTodayTaskIds().map((id, index) => [id, index]));
    const rankOf = (task: TaskCopy): number =>
      rank.get(task.id) ?? Number.MAX_SAFE_INTEGER;
    return {
      ungroupedTasks,
      taskGroups: taskGroups.map((group) => ({
        ...group,
        tasks: [...group.tasks].sort((a, b) => rankOf(a) - rankOf(b)),
      })),
    };
  });

  OVERDUE_LIST_ID = OVERDUE_LIST_ID;
  protected readonly T = T;
  protected readonly dragDelayForTouch = dragDelayForTouch;
  // Lock Y-axis on small screens only — on wider screens the planner uses a
  // multi-column grid where cross-column dragging requires horizontal movement.
  protected readonly isXs = this._layoutService.isXs;

  enterPredicate(drag: CdkDrag, drop: CdkDropList): boolean {
    return false;
  }
}
