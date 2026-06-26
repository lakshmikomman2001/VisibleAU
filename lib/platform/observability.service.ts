import type { ObservabilityEvent } from "./types";

export class ObservabilityService {
  static emit(event: ObservabilityEvent): void {
    const ts = event.timestamp ?? new Date();
    console.log(
      `[observability] ${event.name}`,
      JSON.stringify({ ...event.data, timestamp: ts.toISOString() }),
    );
  }
}
