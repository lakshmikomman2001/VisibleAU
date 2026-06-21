export function formatCustomHttp(eventName: string, payload: unknown) {
  return {
    event: eventName,
    timestamp: new Date().toISOString(),
    data: payload,
  };
}
