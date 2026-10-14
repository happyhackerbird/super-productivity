import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { CdkDrag, CdkDragDrop } from '@angular/cdk/drag-drop';
import { PlannerDayOverdueComponent } from './planner-day-overdue.component';
import { LayoutService } from '../../../core-ui/layout/layout.service';
import { TaskCopy } from '../../tasks/task.model';
import { TaskSharedActions } from '../../../root-store/meta/task-shared.actions';
import { TaskMultiSelectService } from '../../tasks/task-multi-select.service';
import { selectTodayTagTaskIds } from '../../tag/store/tag.reducer';
import { OVERDUE_LIST_ID } from '../planner.model';

describe('PlannerDayOverdueComponent', () => {
  const GROUP = '2026-05-10:00000000a-abcdef';
  let component: PlannerDayOverdueComponent;
  let store: MockStore;
  let multiSelect: jasmine.SpyObj<TaskMultiSelectService>;

  beforeEach(() => {
    multiSelect = jasmine.createSpyObj<TaskMultiSelectService>('TaskMultiSelectService', [
      'isPlannerGroupDrag',
      'endPlannerGroupDrag',
      'selectedIds',
    ]);
    multiSelect.isPlannerGroupDrag.and.returnValue(false);
    multiSelect.selectedIds.and.returnValue(new Set<string>());
    TestBed.configureTestingModule({
      imports: [PlannerDayOverdueComponent],
      providers: [
        provideMockStore({ selectors: [{ selector: selectTodayTagTaskIds, value: [] }] }),
        { provide: LayoutService, useValue: { isXs: signal(false) } },
        { provide: TaskMultiSelectService, useValue: multiSelect },
      ],
    });
    TestBed.overrideComponent(PlannerDayOverdueComponent, { set: { template: '' } });
    store = TestBed.inject(MockStore);
    spyOn(store, 'dispatch');
    component = TestBed.createComponent(PlannerDayOverdueComponent).componentInstance;
  });

  const task = (id: string, plannerGroup?: string | null): TaskCopy =>
    ({ id, plannerGroup }) as TaskCopy;

  const dropEvent = (
    dragged: TaskCopy,
    sourceTasks: TaskCopy[],
    { isGroup = true, prevData = OVERDUE_LIST_ID as string } = {},
  ): CdkDragDrop<string, string, TaskCopy> => {
    const element = document.createElement('div');
    if (isGroup) {
      element.classList.add('task-group');
    }
    return {
      item: { data: dragged },
      previousContainer: {
        data: prevData,
        element: { nativeElement: element },
        getSortedItems: () => sourceTasks.map((t) => ({ data: t })),
      },
    } as unknown as CdkDragDrop<string, string, TaskCopy>;
  };

  it('accepts only drags that start in the overdue list', () => {
    const drag = (data: string): CdkDrag =>
      ({ dropContainer: { data } }) as unknown as CdkDrag;
    expect(component.enterPredicate(drag(OVERDUE_LIST_ID))).toBe(true);
    expect(component.enterPredicate(drag('2026-05-11'))).toBe(false);
  });

  it('moves an ungrouped overdue task into a group', () => {
    const t = task('a');
    component.dropInGroup(GROUP, dropEvent(t, [t], { isGroup: false }));
    expect(store.dispatch).toHaveBeenCalledOnceWith(
      TaskSharedActions.updateTask({
        task: { id: 'a', changes: { plannerGroup: GROUP } },
      }),
    );
  });

  it('moves a grouped overdue task out of its group', () => {
    const t = task('a', GROUP);
    component.dropInGroup(null, dropEvent(t, [t, task('b', GROUP)]));
    expect(store.dispatch).toHaveBeenCalledOnceWith(
      TaskSharedActions.updateTask({
        task: { id: 'a', changes: { plannerGroup: null } },
      }),
    );
  });

  it('does nothing when dropped back into its own group', () => {
    const t = task('a', GROUP);
    component.dropInGroup(GROUP, dropEvent(t, [t]));
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it('ignores drops from other lists', () => {
    const t = task('a');
    component.dropInGroup(GROUP, dropEvent(t, [t], { prevData: '2026-05-11' }));
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it('ignores a whole selected group', () => {
    const a = task('a', GROUP);
    const b = task('b', GROUP);
    multiSelect.selectedIds.and.returnValue(new Set(['a', 'b']));
    component.dropInGroup(null, dropEvent(a, [a, b]));
    expect(store.dispatch).not.toHaveBeenCalled();
  });

  it('ignores a modifier group drag', () => {
    const a = task('a', GROUP);
    multiSelect.isPlannerGroupDrag.and.returnValue(true);
    component.dropInGroup(null, dropEvent(a, [a, task('b', GROUP)]));
    expect(store.dispatch).not.toHaveBeenCalled();
    expect(multiSelect.endPlannerGroupDrag).toHaveBeenCalled();
  });
});
