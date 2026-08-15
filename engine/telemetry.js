/**
 * Public-review telemetry boundary.
 *
 * The public proposal prototype does not transmit citizen activity to any
 * external analytics store. The interface is retained so an approved TRA
 * deployment can later connect a governed, consented aggregate-data service
 * without changing the citizen journey.
 */

export function sendGuidanceEvent() {
  // Intentionally disabled for the public proposal prototype.
}

export function sendChatEvent() {
  // Intentionally disabled for the public proposal prototype.
}
