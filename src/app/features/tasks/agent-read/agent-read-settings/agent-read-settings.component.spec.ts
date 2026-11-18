import { signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { DateTimeFormatService } from '../../../../core/date-time-format/date-time-format.service';
import { SnackService } from '../../../../core/snack/snack.service';
import { T } from '../../../../t.const';
import { LocaleDatePipe } from '../../../../ui/pipes/locale-date.pipe';
import { TaskReadAccess, TaskReadPublisherService } from '../task-read-publisher.service';
import { AgentReadSettingsComponent } from './agent-read-settings.component';

const SERVER_ID = 'enable-1';
const PUBLISHED_AT = new Date(2026, 10, 18, 12).getTime();

type Server = 'rowAbsent' | 'publishedAtNull' | 'publishedAtSet' | 'getFailed';
type Device = 'null' | 'equal' | 'different';

const SERVER_ANSWERS: Record<Exclude<Server, 'getFailed'>, TaskReadAccess> = {
  rowAbsent: { enabled: false, enableId: null, publishedAt: null },
  publishedAtNull: { enabled: true, enableId: SERVER_ID, publishedAt: null },
  publishedAtSet: { enabled: true, enableId: SERVER_ID, publishedAt: PUBLISHED_AT },
};
const DEVICE_IDS: Record<Device, string | null> = {
  null: null,
  equal: SERVER_ID,
  different: 'enable-old',
};

interface Expected {
  line: string | null;
  isOnLine: boolean;
  stop: boolean;
  on: boolean;
  resume: boolean;
}

/** D11's four states, written out per combination. */
const expectedFor = (server: Server, device: Device, isCapture: boolean): Expected => {
  const keys = T.F.SYNC.FORM.SUPER_SYNC;
  const none: Expected = {
    line: null,
    isOnLine: false,
    stop: false,
    on: false,
    resume: false,
  };
  if (server === 'getFailed') {
    return { ...none, line: keys.CAPTURE_READ_STATE_UNKNOWN, stop: true };
  }
  if (server === 'rowAbsent') return { ...none, on: isCapture };
  if (device === 'equal') {
    return {
      ...none,
      line:
        server === 'publishedAtNull'
          ? keys.CAPTURE_READ_STATE_ON_PENDING
          : keys.CAPTURE_READ_STATE_ON,
      isOnLine: true,
      stop: true,
    };
  }
  if (server === 'publishedAtNull') return { ...none, on: isCapture };
  return {
    ...none,
    line: keys.CAPTURE_READ_STATE_ON_NOT_PUBLISHING,
    stop: true,
    resume: isCapture,
  };
};

describe('AgentReadSettingsComponent', () => {
  let fixture: ComponentFixture<AgentReadSettingsComponent>;
  let publisher: {
    enableId: WritableSignal<string | null>;
    getAccess: jasmine.Spy;
    switchOn: jasmine.Spy;
    switchOff: jasmine.Spy;
  };
  let snack: jasmine.SpyObj<SnackService>;

  const render = async (captureEnabled = true): Promise<void> => {
    fixture = TestBed.createComponent(AgentReadSettingsComponent);
    fixture.componentRef.setInput('captureEnabled', captureEnabled);
    fixture.detectChanges();
    // Lets the access request settle; whenStable does not track it.
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
  };
  const byE2e = (name: string): HTMLElement | null =>
    fixture.nativeElement.querySelector(`[e2e="${name}"]`);
  const stateLine = (): HTMLElement | null =>
    fixture.nativeElement.querySelector('p.state');
  const text = (): string => fixture.nativeElement.textContent;

  beforeEach(async () => {
    publisher = {
      enableId: signal<string | null>(null),
      getAccess: jasmine
        .createSpy('getAccess')
        .and.resolveTo(SERVER_ANSWERS['rowAbsent']),
      switchOn: jasmine.createSpy('switchOn').and.resolveTo(),
      switchOff: jasmine.createSpy('switchOff').and.resolveTo(),
    };
    snack = jasmine.createSpyObj<SnackService>('SnackService', ['open']);
    await TestBed.configureTestingModule({
      imports: [AgentReadSettingsComponent, TranslateModule.forRoot()],
      providers: [
        { provide: TaskReadPublisherService, useValue: publisher },
        { provide: SnackService, useValue: snack },
        { provide: DateTimeFormatService, useValue: { currentLocale: () => 'en-gb' } },
      ],
    }).compileComponents();
  });

  // Pin P4: every combination of this device's capture key and synced id with
  // the server's answer. A stop button whenever the server may hold a list.
  const servers: Server[] = [
    'rowAbsent',
    'publishedAtNull',
    'publishedAtSet',
    'getFailed',
  ];
  const devices: Device[] = ['null', 'equal', 'different'];
  for (const isCapture of [true, false]) {
    for (const device of devices) {
      for (const server of servers) {
        const expected = expectedFor(server, device, isCapture);
        it(
          `captureKey ${isCapture ? 'present' : 'absent'}, captureRead ${device}, ` +
            `server ${server}: ${JSON.stringify(expected)}`,
          async () => {
            publisher.enableId.set(DEVICE_IDS[device]);
            if (server === 'getFailed') {
              publisher.getAccess.and.rejectWith(new Error('offline'));
            } else {
              publisher.getAccess.and.resolveTo(SERVER_ANSWERS[server]);
            }
            await render(isCapture);

            const mayHoldList = server === 'getFailed' || server === 'publishedAtSet';
            if (mayHoldList) expect(byE2e('agentReadOff')).not.toBeNull();
            expect(!!byE2e('agentReadOff')).toBe(expected.stop);
            expect(!!byE2e('agentReadOn')).toBe(expected.on);
            expect(!!byE2e('agentReadResume')).toBe(expected.resume);
            expect(!!byE2e('agentReadState')).toBe(expected.isOnLine);
            if (expected.line) {
              expect(stateLine()!.textContent).toContain(expected.line);
            } else {
              expect(stateLine()).toBeNull();
            }
            expect(text()).toContain(T.F.SYNC.FORM.SUPER_SYNC.CAPTURE_READ_INFO);
          },
        );
      }
    }
  }

  it('offers no button before the server answered', async () => {
    publisher.getAccess.and.returnValue(new Promise(() => undefined));
    await render();
    expect(text()).toContain(T.F.SYNC.FORM.SUPER_SYNC.CAPTURE_READ_INFO);
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
    expect(stateLine()).toBeNull();
  });

  for (const [key, deviceId] of [
    ['CAPTURE_READ_STATE_ON', SERVER_ID],
    ['CAPTURE_READ_STATE_ON_NOT_PUBLISHING', 'enable-old'],
  ] as const) {
    it(`shows the date and time the list was last shared (${key})`, async () => {
      const translate = TestBed.inject(TranslateService);
      translate.setTranslation('en', {
        F: { SYNC: { FORM: { SUPER_SYNC: { [key]: 'shared {{time}}' } } } },
      });
      translate.use('en');
      publisher.enableId.set(deviceId);
      publisher.getAccess.and.resolveTo(SERVER_ANSWERS['publishedAtSet']);
      await render();
      const time = TestBed.runInInjectionContext(() => new LocaleDatePipe()).transform(
        PUBLISHED_AT,
        'short',
      );
      // PUBLISHED_AT is 12:00 local time: the value carries the time, not only the day.
      expect(time).toContain('12:00');
      expect(stateLine()!.textContent!.trim()).toBe(`shared ${time}`);
    });
  }

  it('switches on from the on button and shows the new server state', async () => {
    await render();
    publisher.getAccess.and.resolveTo(SERVER_ANSWERS['publishedAtNull']);
    publisher.switchOn.and.callFake(async () => publisher.enableId.set(SERVER_ID));
    byE2e('agentReadOn')!.click();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    expect(publisher.switchOn).toHaveBeenCalledTimes(1);
    expect(byE2e('agentReadState')!.textContent).toContain(
      T.F.SYNC.FORM.SUPER_SYNC.CAPTURE_READ_STATE_ON_PENDING,
    );
    expect(byE2e('agentReadOff')).not.toBeNull();
    expect(byE2e('agentReadOn')).toBeNull();
  });

  it('resumes sharing from the resume button', async () => {
    publisher.enableId.set('enable-old');
    publisher.getAccess.and.resolveTo(SERVER_ANSWERS['publishedAtSet']);
    await render();
    byE2e('agentReadResume')!.click();
    await new Promise((resolve) => setTimeout(resolve));
    expect(publisher.switchOn).toHaveBeenCalledTimes(1);
  });

  it('stops sharing from the stop button, also with capture off', async () => {
    publisher.enableId.set(SERVER_ID);
    publisher.getAccess.and.resolveTo(SERVER_ANSWERS['publishedAtSet']);
    await render(false);
    publisher.getAccess.and.resolveTo(SERVER_ANSWERS['rowAbsent']);
    byE2e('agentReadOff')!.click();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    expect(publisher.switchOff).toHaveBeenCalledTimes(1);
    expect(byE2e('agentReadOff')).toBeNull();
    expect(byE2e('agentReadOn')).toBeNull();
  });

  it('reports a failed switch with a snack and keeps the stop button', async () => {
    publisher.enableId.set(SERVER_ID);
    publisher.getAccess.and.resolveTo(SERVER_ANSWERS['publishedAtSet']);
    publisher.switchOff.and.rejectWith(new Error('HTTP 500'));
    await render();
    await fixture.componentInstance.turnOff();
    fixture.detectChanges();
    expect(snack.open).toHaveBeenCalledOnceWith({
      type: 'ERROR',
      msg: T.F.SYNC.FORM.SUPER_SYNC.CAPTURE_READ_S_ERROR,
    });
    expect(byE2e('agentReadOff')).not.toBeNull();
    expect(fixture.componentInstance.isBusy()).toBeFalse();
  });
});
