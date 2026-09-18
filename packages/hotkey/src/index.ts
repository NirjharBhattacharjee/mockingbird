export {
  checkInputMonitoring,
  createEventTap,
  EVENT_TYPE_FLAGS_CHANGED,
  EVENT_TYPE_KEY_DOWN,
  EVENT_TYPE_KEY_UP,
  type EventTap,
  EventTapError,
  type InputMonitoringAccess,
  KEYCODE_ESCAPE,
  KEYCODE_FN,
  requestInputMonitoring,
  TapDecoder,
  type TapEvent,
} from "./event-tap.ts";
export {
  type HotkeyListener,
  type HotkeyListenerOptions,
  startHotkeyListener,
} from "./listener.ts";
