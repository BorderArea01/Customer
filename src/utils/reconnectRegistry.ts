/**
 * Shared registry for reconnect functions.
 * Allows settings panel to trigger MQTT/voice reconnects
 * without tight coupling to the chat component.
 */

let mqttReconnectFn: (() => Promise<void>) | null = null
let voiceReconnectFn: (() => Promise<void>) | null = null

export function registerMqttReconnect(fn: () => Promise<void>) {
  mqttReconnectFn = fn
}

export function registerVoiceReconnect(fn: () => Promise<void>) {
  voiceReconnectFn = fn
}

export function getMqttReconnect() {
  return mqttReconnectFn
}

export function getVoiceReconnect() {
  return voiceReconnectFn
}
