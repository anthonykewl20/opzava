export interface BrokerLogger {
  warn(metadata: Readonly<Record<string, unknown>>, message: string): void;
  error(metadata: Readonly<Record<string, unknown>>, message: string): void;
}

export const silentBrokerLogger: BrokerLogger = {
  warn() {
    // Test/default logger intentionally drops sanitized operational events.
  },
  error() {
    // Test/default logger intentionally drops sanitized operational events.
  }
};
