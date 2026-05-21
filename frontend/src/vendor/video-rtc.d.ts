/** Type declarations for the vendored go2rtc VideoRTC web component. */
export class VideoRTC extends HTMLElement {
  mode: string;
  media: string;
  background: boolean;
  visibilityThreshold: number;
  visibilityCheck: boolean;
  pcConfig: RTCConfiguration;
  set src(value: string);
}
