// Capacitor TypeScript wrapper for the native iOS VolumeButton plugin.
//
// On native iOS the plugin listens for hardware Volume Up / Volume Down
// presses and emits "volumeUp" / "volumeDown" events. On web this wrapper
// is a no-op (registerPlugin returns a stub that never fires events), so
// consumers can unconditionally import it without web-only branches.

import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface VolumeButtonPlugin {
  /** Start listening for hardware volume button presses. */
  start(): Promise<{ listening: boolean }>;
  /** Stop listening and restore the user's original volume. */
  stop(): Promise<void>;
  addListener(
    eventName: 'volumeUp' | 'volumeDown',
    listenerFunc: () => void,
  ): Promise<PluginListenerHandle>;
}

const VolumeButton = registerPlugin<VolumeButtonPlugin>('VolumeButton');
export default VolumeButton;
