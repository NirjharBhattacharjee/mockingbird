export {
  checkInputMonitoring,
  createEventTap,
  EVENT_TYPE_FLAGS_CHANGED,
  EVENT_TYPE_KEY_DOWN,
  EVENT_TYPE_KEY_UP,
  EVENT_TYPE_LEFT_MOUSE_DOWN,
  type EventTap,
  EventTapError,
  type InputMonitoringAccess,
  KEYCODE_ESCAPE,
  KEYCODE_FN,
  KEYCODE_GLOBE,
  requestInputMonitoring,
  TapDecoder,
  type TapEvent,
} from "./event-tap.ts";
export {
  type HotkeyListener,
  type HotkeyListenerOptions,
  startHotkeyListener,
} from "./listener.ts";
