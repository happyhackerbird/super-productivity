import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  HostBinding,
  inject,
  input,
  Input,
} from '@angular/core';
import { T } from '../../../t.const';
import { PlannerDay, ScheduleItem, ScheduleItemType } from '../planner.model';
import { CdkDrag, CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop';
import { TaskCopy } from '../../tasks/task.model';
import { PlannerActions } from '../store/planner.actions';
import { millisecondsDiffToRemindOption } from '../../tasks/util/remind-option-to-milliseconds';
import { Store } from '@ngrx/store';
import { MatDialog } from '@angular/material/dialog';
import { TaskService } from '../../tasks/task.service';
import { TaskSharedActions } from '../../../root-store/meta/task-shared.actions';
import { DateService } from '../../../core/date/date.service';
import { DialogScheduleTaskComponent } from '../dialog-schedule-task/dialog-schedule-task.component';
import { dateStrToUtcDate } from '../../../util/date-str-to-utc-date';
import { MatIcon } from '@angular/material/icon';
import { PlannerTaskComponent } from '../planner-task/planner-task.component';
import { PlannerRepeatProjectionComponent } from '../planner-repeat-projection/planner-repeat-projection.component';
import { PlannerDeadlineTaskComponent } from '../planner-deadline-task/planner-deadline-task.component';
import { AddTaskInlineComponent } from '../add-task-inline/add-task-inline.component';
import { NgClass } from '@angular/common';
import { PlannerCalendarEventComponent } from '../planner-calendar-event/planner-calendar-event.component';
import { MsToStringPipe } from '../../../ui/duration/ms-to-string.pipe';
import { RoundDurationPipe } from '../../../ui/pipes/round-duration.pipe';
import { ShortTimeHtmlPipe } from '../../../ui/pipes/short-time-html.pipe';
import { TranslatePipe } from '@ngx-translate/core';
import { ShortDate2Pipe } from '../../../ui/pipes/short-date2.pipe';
import { ProgressBarComponent } from '../../../ui/progress-bar/progress-bar.component';
import { dragDelayForTouch } from '../../../util/input-intent';
import { LayoutService } from '../../../core-ui/layout/layout.service';
import { DateTimeFormatService } from '../../../core/date-time-format/date-time-format.service';
import { parseDbDateStr } from '../../../util/parse-db-date-str';
import { safeFormatDate } from '../../../util/safe-format-date';
import { selectPlannerState } from '../store/planner.selectors';
import { selectTodayTaskIds } from '../../work-context/store/work-context.selectors';
import { selectTodayTagTaskIds } from '../../tag/store/tag.reducer';
import {
  buildPlannerGroupValue,
  createPlannerGroupId,
} from '../store/planner-task-groups.util';
import { planGroupDrop } from './plan-group-drop.util';
import { TaskMultiSelectService } from '../../tasks/task-multi-select.service';
import { SUPER_SYNC_MAX_ENTITY_IDS_PER_OP } from '@sp/shared-schema';

@Component({
  selector: 'planner-day',
  templateUrl: './planner-day.component.html',
  styleUrl: './planner-day.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatIcon,
    CdkDropList,
    PlannerTaskComponent,
    CdkDrag,
    PlannerRepeatProjectionComponent,
    PlannerDeadlineTaskComponent,
    AddTaskInlineComponent,
    NgClass,
    PlannerCalendarEventComponent,
    MsToStringPipe,
    RoundDurationPipe,
    ShortTimeHtmlPipe,
    TranslatePipe,
    ShortDate2Pipe,
    ProgressBarComponent,
  ],
})
export class PlannerDayComponent {
  private _store = inject(Store);
  private _matDialog = inject(MatDialog);
  private _taskService = inject(TaskService);
  private _dateService = inject(DateService);
  private _layoutService = inject(LayoutService);
  private _dateTimeFormatService = inject(DateTimeFormatService);
  private _hostElement = inject(ElementRef<HTMLElement>);
  private _multiSelect = inject(TaskMultiSelectService);

  // TODO: Skipped for migration because:
  //  This input is used in a control flow expression (e.g. `@if` or `*ngIf`)
  //  and migrating would break narrowing currently.
  @Input() day!: PlannerDay;

  // Task groups are a plan view feature. Without this the day looks and behaves
  // the same as before, e.g. for the daily summary.
  readonly isTaskGroupingEnabled = input(false);

  @HostBinding('attr.data-day') get dataDayAttr(): string | undefined {
    return this.day?.dayDate;
  }

  @HostBinding('attr.data-planner-selection-scope')
  get selectionScopeAttr(): string | undefined {
    return this.day?.dayDate;
  }

  protected readonly T = T;
  protected readonly SCHEDULE_ITEM_TYPE = ScheduleItemType;
  protected readonly dragDelayForTouch = dragDelayForTouch;
  // Lock Y-axis on small screens only — on wider screens the planner uses a
  // multi-column grid where cross-column dragging requires horizontal movement.
  protected readonly isXs = this._layoutService.isXs;

  private readonly _plannerState = this._store.selectSignal(selectPlannerState);
  private readonly _todayTaskIds = this._store.selectSignal(selectTodayTaskIds);
  private readonly _storedTodayTaskIds = this._store.selectSignal(selectTodayTagTaskIds);

  // Untimed tasks can only be dropped between scheduled items, not into the
  // empty list: the area below the tasks starts a new group instead.
  protected readonly canEnterScheduled = (drag: CdkDrag<TaskCopy>): boolean =>
    !this.isTaskGroupingEnabled() ||
    !!drag.data?.dueWithTime ||
    this.day.scheduledIItems.length > 0;

  // Precompute the weekday ('EEE') header label, keyed on the current locale.
  // Replaces a per-CD `| localeDate: 'EEE'` pipe. The parent tracks planner-day
  // by `day.dayDate`, so the instance (and thus `this.day.dayDate`) is stable
  // for its lifetime; only a locale change needs to recompute the label.
  protected readonly dayLabel = computed(() => {
    const isoTextLocale = this._dateTimeFormatService.isoTextLocale();
    return isoTextLocale
      ? parseDbDateStr(this.day.dayDate).toLocaleDateString(isoTextLocale, {
          weekday: 'short',
        })
      : safeFormatDate(
          this.day.dayDate,
          'EEE',
          this._dateTimeFormatService.currentLocale(),
        );
  });

  getProgressBarClass(percentage: number | undefined): string {
    if (!percentage) return 'bg-success';

    if (percentage > 95) {
      return 'bg-danger';
    } else if (percentage > 80) {
      return 'bg-warning';
    } else {
      return 'bg-success';
    }
  }

  // TODO correct type
  drop(
    targetList: 'TODO' | 'SCHEDULED',
    allItems: TaskCopy[] | ScheduleItem[],
    ev: CdkDragDrop<string, string, TaskCopy>,
  ): void {
    const newDay = ev.container.data;
    const task = ev.item.data;

    if (this._dropSelectedGroupOnDay(ev)) {
      return;
    }

    if (targetList === 'SCHEDULED') {
      if (ev.previousContainer !== ev.container) {
        this.editTaskReminderOrReScheduleIfPossible(task, ev.container.data);
      }
      return;
    } else if (targetList === 'TODO') {
      if (
        this.isTaskGroupingEnabled() &&
        (!!this.day.taskGroups?.length || !!task.plannerGroup)
      ) {
        this._dropInTaskList(null, allItems as TaskCopy[], ev);
        return;
      }
      if (ev.previousContainer === ev.container) {
        if (this.day.isToday) {
          this._store.dispatch(
            TaskSharedActions.moveTaskInTodayTagList({
              toTaskId: allItems[ev.currentIndex].id,
              fromTaskId: task.id,
            }),
          );
        } else {
          this._store.dispatch(
            PlannerActions.moveInList({
              targetDay: ev.container.data,
              fromIndex: ev.previousIndex,
              toIndex: ev.currentIndex,
            }),
          );
        }
      } else {
        this._store.dispatch(
          PlannerActions.transferTask({
            task: task,
            prevDay: ev.previousContainer.data,
            newDay: newDay,
            targetIndex: ev.currentIndex,
            today: this._dateService.todayStr(),
            targetTaskId: allItems[ev.currentIndex]?.id,
          }),
        );
      }
    }
  }

  dropInGroup(
    groupId: string,
    groupTasks: TaskCopy[],
    ev: CdkDragDrop<string, string, TaskCopy>,
  ): void {
    if (this._dropSelectedGroupOnDay(ev)) {
      return;
    }
    this._dropInTaskList(groupId, groupTasks, ev);
  }

  dropInNewGroup(ev: CdkDragDrop<string, string, TaskCopy>): void {
    // CDK keeps the last entered list as the drop target after the pointer
    // leaves it. Its overlap flag can also be stale after the placeholder moves
    // the zone. Use the release point to accept the zone itself and, on a day
    // without scheduled items, the blank column space below it.
    if (!ev.isPointerOverContainer && !this._isInNewGroupDropArea(ev)) {
      return;
    }
    if (this._dropSelectedGroupOnDay(ev)) {
      return;
    }
    this._dropInTaskList(createPlannerGroupId(), [], ev);
  }

  private _dropSelectedGroupOnDay(ev: CdkDragDrop<string, string, TaskCopy>): boolean {
    if (!ev.previousContainer.element.nativeElement.classList.contains('task-group')) {
      return false;
    }
    const sourceTasks = ev.previousContainer
      .getSortedItems()
      .map((item) => item.data as TaskCopy);
    const selected = this._multiSelect.selectedIds();
    const modifierDrag = this._multiSelect.isPlannerGroupDrag(ev.item.data.id);
    if (
      !sourceTasks.length ||
      (!modifierDrag && selected.size !== sourceTasks.length) ||
      !sourceTasks.every(
        (task) =>
          (modifierDrag || selected.has(task.id)) &&
          task.plannerGroup === ev.item.data.plannerGroup,
      )
    ) {
      return false;
    }
    this._multiSelect.endPlannerGroupDrag();
    const prevDay = ev.previousContainer.data;
    const newDay = ev.container.data;
    if (prevDay !== newDay) {
      // Let CDK remove its drag placeholder before the source group disappears.
      setTimeout(() => this._transferSelectedGroup(sourceTasks, prevDay, newDay), 0);
    }
    return true;
  }

  private _transferSelectedGroup(
    tasks: TaskCopy[],
    prevDay: string,
    newDay: string,
  ): void {
    const today = this._dateService.todayStr();
    const targetIndex =
      newDay === today
        ? this._storedTodayTaskIds().length
        : (this._plannerState().days[newDay] || []).length;
    const groupValue = buildPlannerGroupValue(newDay, createPlannerGroupId());
    tasks.forEach((task, index) =>
      this._store.dispatch(
        PlannerActions.transferTask({
          task,
          prevDay,
          newDay,
          targetIndex: targetIndex + index,
          today,
        }),
      ),
    );
    for (let i = 0; i < tasks.length; i += SUPER_SYNC_MAX_ENTITY_IDS_PER_OP) {
      this._store.dispatch(
        TaskSharedActions.updateTasks({
          tasks: tasks.slice(i, i + SUPER_SYNC_MAX_ENTITY_IDS_PER_OP).map((task) => ({
            id: task.id,
            changes: { plannerGroup: groupValue },
          })),
        }),
      );
    }
    this._multiSelect.clear();
  }

  private _isInNewGroupDropArea(ev: CdkDragDrop<string, string, TaskCopy>): boolean {
    if (!ev.dropPoint) {
      return false;
    }
    const zone = ev.container.element.nativeElement.getBoundingClientRect();
    const { x, y } = ev.dropPoint;
    if (x < zone.left || x > zone.right || y < zone.top) {
      return false;
    }
    return (
      y <= zone.bottom ||
      (this.day.scheduledIItems.length === 0 &&
        y <= this._hostElement.nativeElement.getBoundingClientRect().bottom)
    );
  }

  private _dropInTaskList(
    targetGroupId: string | null,
    targetTasks: TaskCopy[],
    ev: CdkDragDrop<string, string, TaskCopy>,
  ): void {
    if (ev.previousContainer === ev.container && ev.previousIndex === ev.currentIndex) {
      return;
    }
    const newDay = ev.container.data;
    const today = this._dateService.todayStr();
    planGroupDrop({
      task: ev.item.data,
      prevDay: ev.previousContainer.data,
      newDay,
      today,
      targetGroupId,
      targetTaskIds: targetTasks.map((t) => t.id),
      dropIndex: ev.currentIndex,
      dayTaskIds:
        newDay === today ? this._todayTaskIds() : this._plannerState().days[newDay] || [],
      storedTodayTaskIds: this._storedTodayTaskIds(),
    }).forEach((action) => this._store.dispatch(action));
  }

  editTaskReminderOrReScheduleIfPossible(task: TaskCopy, newDay?: string): void {
    if (newDay) {
      const newDate = dateStrToUtcDate(newDay);
      if (task.dueWithTime) {
        this._rescheduleTask(task, newDate);
        return;
      }
    }

    this._matDialog.open(DialogScheduleTaskComponent, {
      data: {
        task,
        targetDay: newDay,
      },
    });
  }

  private _rescheduleTask(task: TaskCopy, newDate: Date): void {
    const taskPlannedAtDate = new Date(task.dueWithTime as number);
    newDate.setHours(taskPlannedAtDate.getHours(), taskPlannedAtDate.getMinutes(), 0, 0);
    const selectedReminderCfgId = millisecondsDiffToRemindOption(
      task.dueWithTime as number,
      task.remindAt,
    );
    this._taskService.scheduleTask(task, newDate.getTime(), selectedReminderCfgId, false);
  }
}
